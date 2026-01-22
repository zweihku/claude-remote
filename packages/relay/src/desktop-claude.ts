#!/usr/bin/env node
/**
 * Claude Remote - Desktop Client with Multi-Session Support
 * 支持多会话的桌面端
 *
 * 功能：
 * - 多会话管理（每个会话独立上下文和工作目录）
 * - 支持文件操作（使用 --dangerously-skip-permissions）
 * - 目录范围限制
 */

import WebSocket from 'ws';
import { spawn } from 'child_process';
import * as readline from 'readline';
import * as path from 'path';
import type { WSMessage, Session, SessionConfig } from '@claude-remote/shared';
import { SessionManager } from './session-manager.js';

const RELAY_HTTP = process.env.RELAY_HTTP || 'http://localhost:4000';
const RELAY_WS = process.env.RELAY_WS || 'ws://localhost:4000';

// 配置允许的目录范围
// 命令行参数: node desktop-claude.ts /path/to/dir1 /path/to/dir2 ...
const allowedDirs = process.argv.slice(2);
const defaultDir = allowedDirs[0] || process.cwd();

// 如果没有指定目录，使用当前目录
if (allowedDirs.length === 0) {
  allowedDirs.push(process.cwd());
}

const sessionConfig: SessionConfig = {
  allowedDirectories: allowedDirs.map(d => path.resolve(d)),
  defaultDirectory: path.resolve(defaultDir),
};

const deviceId = `desktop-${Date.now()}`;
const deviceName = 'Desktop Claude';

let ws: WebSocket | null = null;
let pairCode: string | null = null;
let paired = false;
let currentPairId: string | null = null;
let sessionManager: SessionManager | null = null;

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function log(msg: string) {
  console.log(`\x1b[36m[Desktop]\x1b[0m ${msg}`);
}

function logClaude(msg: string) {
  console.log(`\x1b[33m[Claude]\x1b[0m ${msg}`);
}

function logReceived(msg: string) {
  console.log(`\x1b[32m[手机消息]\x1b[0m ${msg}`);
}

function logError(msg: string) {
  console.log(`\x1b[31m[错误]\x1b[0m ${msg}`);
}

async function requestPairCode(): Promise<string> {
  const response = await fetch(`${RELAY_HTTP}/api/pair/request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ deviceId, deviceName, platform: 'desktop' }),
  });
  const data = await response.json();
  if (data.success) {
    return data.data.pairCode;
  }
  throw new Error(data.error || 'Failed to get pair code');
}

function connectWebSocket(): Promise<void> {
  return new Promise((resolve, reject) => {
    ws = new WebSocket(RELAY_WS);

    ws.on('open', () => {
      log('已连接到中继服务器');
      ws!.send(JSON.stringify({ type: 'auth', token: `${deviceId}:${deviceName}:desktop` }));
    });

    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString()) as WSMessage;
      handleWebSocketMessage(msg, resolve, reject);
    });

    ws.on('close', () => {
      log('连接已断开');
      paired = false;
    });

    ws.on('error', (err) => {
      logError(`WebSocket 错误: ${err.message}`);
      reject(err);
    });
  });
}

function handleWebSocketMessage(
  msg: WSMessage,
  resolve?: () => void,
  reject?: (err: Error) => void
): void {
  switch (msg.type) {
    case 'auth_success':
      log('认证成功');
      resolve?.();
      break;

    case 'auth_error':
      logError(`认证失败: ${msg.error}`);
      reject?.(new Error(msg.error));
      break;

    case 'paired':
      paired = true;
      // 只有新配对才初始化 SessionManager
      if (currentPairId !== msg.pairId) {
        currentPairId = msg.pairId;
        initSessionManager();
        log(`✅ 新配对成功! PairID: ${msg.pairId}`);
      } else {
        log(`✅ 重连成功! PairID: ${msg.pairId}`);
      }
      log('现在可以接收来自手机端的消息了');
      log(`允许的目录: ${sessionConfig.allowedDirectories.join(', ')}`);
      // 发送会话列表给手机端
      sendSessionList();
      break;

    case 'unpaired':
      paired = false;
      log('❌ 手机端已断开（配对已解除）');
      currentPairId = null;
      // 配对解除时清理会话
      sessionManager?.cleanup();
      sessionManager = null;
      break;

    case 'peer_offline':
      log('📱 手机端暂时离线，等待重连...');
      break;

    case 'message':
      logReceived(msg.payload.content);
      handleUserMessage(msg.payload);
      break;

    case 'session_create':
      handleSessionCreate(msg as any);
      break;

    case 'session_switch':
      handleSessionSwitch(msg as any);
      break;

    case 'session_delete':
      handleSessionDelete(msg as any);
      break;

    case 'pong':
      break;

    default:
      log(`未知消息: ${JSON.stringify(msg)}`);
  }
}

function initSessionManager(): void {
  sessionManager = new SessionManager(
    sessionConfig,
    // 响应回调
    (sessionId, content, isComplete) => {
      sendToPhone(content, sessionId);
    },
    // 错误回调
    (sessionId, error) => {
      sendToPhone(`[错误] ${error}`, sessionId);
    }
  );

  // 创建默认会话
  sessionManager.createSession();
}

function sendToPhone(content: string, sessionId?: string) {
  if (ws?.readyState === WebSocket.OPEN) {
    const payload = {
      id: Date.now().toString(),
      content,
      timestamp: Date.now(),
      sessionId: sessionId || sessionManager?.getActiveSessionId() || 'default',
    };
    ws.send(JSON.stringify({
      type: 'message',
      payload,
    }));
  }
}

function sendSessionList(): void {
  if (!ws || ws.readyState !== WebSocket.OPEN || !sessionManager) return;

  const sessions = sessionManager.getSessions();
  const activeSessionId = sessionManager.getActiveSessionId();

  ws.send(JSON.stringify({
    type: 'session_list',
    sessions,
    activeSessionId,
  }));
}

function handleUserMessage(payload: { content: string; sessionId: string }): void {
  const { content, sessionId } = payload;

  if (!sessionManager) {
    initSessionManager();
  }

  // 解析特殊命令
  const command = parseCommand(content);
  if (command) {
    handleCommand(command, sessionId);
    return;
  }

  // 发送消息到指定会话（或当前活动会话）
  const targetSessionId = sessionId || sessionManager!.getActiveSessionId();

  if (targetSessionId) {
    sessionManager!.sendMessage(targetSessionId, content);
  } else {
    // 没有会话时自动创建
    sessionManager!.sendMessageToActive(content);
  }
}

interface ParsedCommand {
  type: 'new_session' | 'switch_dir' | 'list_sessions' | 'change_dir';
  args?: string;
}

function parseCommand(content: string): ParsedCommand | null {
  const lower = content.toLowerCase().trim();

  // 新建会话命令
  if (lower.startsWith('新建会话') || lower.startsWith('创建会话') ||
      lower.startsWith('new session') || lower.startsWith('create session')) {
    // 提取目录参数
    const match = content.match(/(?:在|at|in)\s*(.+)/i);
    return { type: 'new_session', args: match?.[1]?.trim() };
  }

  // 切换目录命令（创建新会话）
  if (lower.startsWith('切换到') || lower.startsWith('switch to')) {
    const args = content.replace(/^(切换到|switch to)\s*/i, '').trim();
    return { type: 'switch_dir', args };
  }

  // 更改当前会话的工作目录命令
  if (lower.startsWith('cd ') || lower.startsWith('chdir ') ||
      lower.startsWith('进入目录') || lower.startsWith('工作目录改为') ||
      lower.startsWith('迁移到') || lower.includes('迁移到') && lower.includes('目录')) {
    // 提取目录路径
    let args = content.replace(/^(cd|chdir|进入目录|工作目录改为|迁移到)\s*/i, '').trim();
    // 处理 "把工作目录迁移到xxx" 这样的句式
    const migratMatch = content.match(/(?:迁移到|移到|切换到)\s*(.+?)(?:目录|里面|下面)?$/i);
    if (migratMatch) {
      args = migratMatch[1].trim();
    }
    return { type: 'change_dir', args };
  }

  // 列出会话命令
  if (lower === '列出会话' || lower === 'list sessions' ||
      lower === '会话列表' || lower === 'sessions') {
    return { type: 'list_sessions' };
  }

  return null;
}

function handleCommand(command: ParsedCommand, currentSessionId: string): void {
  switch (command.type) {
    case 'new_session': {
      try {
        const session = sessionManager!.createSession(command.args);
        sendToPhone(`✅ 已创建新会话: ${session.name}\n工作目录: ${session.workingDirectory}`, session.id);
        sendSessionList();
      } catch (error) {
        sendToPhone(`❌ 创建会话失败: ${(error as Error).message}`, currentSessionId);
      }
      break;
    }

    case 'switch_dir': {
      // 切换目录 = 创建新会话在指定目录
      try {
        const session = sessionManager!.createSession(command.args);
        sendToPhone(`✅ 已切换到目录: ${session.workingDirectory}\n新会话: ${session.name}`, session.id);
        sendSessionList();
      } catch (error) {
        sendToPhone(`❌ 切换目录失败: ${(error as Error).message}`, currentSessionId);
      }
      break;
    }

    case 'change_dir': {
      // 更改当前会话的工作目录（保持上下文）
      try {
        const targetSessionId = currentSessionId || sessionManager!.getActiveSessionId();
        if (!targetSessionId) {
          throw new Error('没有活动会话');
        }

        // 解析目录路径
        let targetDir = command.args || '';

        // 处理相对路径
        const currentSession = sessionManager!.getSession(targetSessionId);
        if (currentSession && !path.isAbsolute(targetDir)) {
          targetDir = path.resolve(currentSession.workingDirectory, targetDir);
        }

        const session = sessionManager!.updateWorkingDirectory(targetSessionId, targetDir);
        sendToPhone(`✅ 工作目录已更新为: ${session.workingDirectory}\n会话上下文保持不变`, targetSessionId);
        sendSessionList();
      } catch (error) {
        sendToPhone(`❌ 更改目录失败: ${(error as Error).message}`, currentSessionId);
      }
      break;
    }

    case 'list_sessions': {
      const sessions = sessionManager!.getSessions();
      const activeId = sessionManager!.getActiveSessionId();

      let msg = '📋 会话列表:\n';
      for (const session of sessions) {
        const isActive = session.id === activeId ? ' ⬅️ 当前' : '';
        msg += `\n• ${session.name}${isActive}\n  目录: ${session.workingDirectory}\n  消息数: ${session.messageCount}`;
      }
      sendToPhone(msg, currentSessionId);
      break;
    }
  }
}

function handleSessionCreate(msg: { workingDirectory?: string; name?: string }): void {
  if (!sessionManager) {
    initSessionManager();
  }

  try {
    const session = sessionManager!.createSession(msg.workingDirectory, msg.name);
    ws?.send(JSON.stringify({
      type: 'session_created',
      session,
    }));
    sendSessionList();
  } catch (error) {
    ws?.send(JSON.stringify({
      type: 'session_error',
      error: (error as Error).message,
    }));
  }
}

function handleSessionSwitch(msg: { sessionId: string }): void {
  if (!sessionManager) return;

  try {
    const session = sessionManager.switchSession(msg.sessionId);
    ws?.send(JSON.stringify({
      type: 'session_switched',
      session,
    }));
  } catch (error) {
    ws?.send(JSON.stringify({
      type: 'session_error',
      error: (error as Error).message,
    }));
  }
}

function handleSessionDelete(msg: { sessionId: string }): void {
  if (!sessionManager) return;

  try {
    sessionManager.deleteSession(msg.sessionId);
    ws?.send(JSON.stringify({
      type: 'session_deleted',
      sessionId: msg.sessionId,
    }));
    sendSessionList();
  } catch (error) {
    ws?.send(JSON.stringify({
      type: 'session_error',
      error: (error as Error).message,
    }));
  }
}

// 心跳
setInterval(() => {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'ping' }));
  }
}, 25000);

async function main() {
  console.log('');
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║       Claude Remote - 多会话桌面端                          ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('');

  log(`允许的目录: ${sessionConfig.allowedDirectories.join(', ')}`);
  log(`默认目录: ${sessionConfig.defaultDirectory}`);
  console.log('');

  // 检查 Claude CLI
  log('检查 Claude CLI...');
  try {
    const checkProcess = spawn('claude', ['--version'], { shell: true });
    await new Promise<void>((resolve, reject) => {
      checkProcess.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error('Claude CLI 未安装或未配置'));
      });
      checkProcess.on('error', reject);
    });
    log('Claude CLI 已就绪');
  } catch (error) {
    logError('Claude CLI 未找到。请确保已安装 Claude Code CLI。');
    process.exit(1);
  }

  try {
    await connectWebSocket();
    pairCode = await requestPairCode();

    console.log('');
    console.log('┌────────────────────────────────────────────────────────────┐');
    console.log('│                                                            │');
    console.log(`│     配对码:  \x1b[33m\x1b[1m${pairCode}\x1b[0m                                  │`);
    console.log('│                                                            │');
    console.log('│     请在手机浏览器打开服务器地址，输入此配对码              │');
    console.log('│     有效期: 5 分钟                                          │');
    console.log('│                                                            │');
    console.log('└────────────────────────────────────────────────────────────┘');
    console.log('');
    log('等待手机端配对...');
    log('命令: quit 退出, sessions 查看会话\n');

    rl.on('line', (input) => {
      const cmd = input.trim().toLowerCase();
      if (cmd === 'quit' || cmd === 'exit') {
        sessionManager?.cleanup();
        ws?.close();
        process.exit(0);
      } else if (cmd === 'sessions') {
        if (sessionManager) {
          const sessions = sessionManager.getSessions();
          const activeId = sessionManager.getActiveSessionId();
          console.log('\n会话列表:');
          for (const s of sessions) {
            const active = s.id === activeId ? ' [当前]' : '';
            console.log(`  - ${s.name}${active}: ${s.workingDirectory} (${s.messageCount} 消息)`);
          }
          console.log('');
        } else {
          log('尚未初始化会话管理器');
        }
      }
    });

  } catch (error) {
    logError(`启动失败: ${error}`);
    process.exit(1);
  }
}

main();
