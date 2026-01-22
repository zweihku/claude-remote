/**
 * SessionManager - 多会话管理器
 * 管理多个独立的 Claude CLI 会话，每个会话有独立的工作目录和上下文
 */

import { spawn, type ChildProcess } from 'child_process';
import type { Session, SessionConfig } from '@claude-remote/shared';
import * as path from 'path';
import * as fs from 'fs';

export interface SessionState {
  session: Session;
  isFirstMessage: boolean;  // 是否是该会话的第一条消息
  claudeProcess: ChildProcess | null;
  responseBuffer: string;
}

export class SessionManager {
  private sessions: Map<string, SessionState> = new Map();
  private activeSessionId: string | null = null;
  private config: SessionConfig;
  private claudePath: string;
  private onResponse: (sessionId: string, content: string, isComplete: boolean) => void;
  private onError: (sessionId: string, error: string) => void;

  constructor(
    config: SessionConfig,
    onResponse: (sessionId: string, content: string, isComplete: boolean) => void,
    onError: (sessionId: string, error: string) => void
  ) {
    this.config = config;
    this.claudePath = process.env.CLAUDE_PATH || process.env.HOME + '/.local/bin/claude';
    this.onResponse = onResponse;
    this.onError = onError;
  }

  /**
   * 创建新会话
   */
  createSession(workingDirectory?: string, name?: string): Session {
    // 验证工作目录
    const targetDir = workingDirectory || this.config.defaultDirectory;

    if (!this.isDirectoryAllowed(targetDir)) {
      throw new Error(`目录不在允许范围内: ${targetDir}`);
    }

    // 验证目录存在
    if (!fs.existsSync(targetDir)) {
      throw new Error(`目录不存在: ${targetDir}`);
    }

    const sessionId = `session-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    const sessionName = name || this.generateSessionName(targetDir);

    const session: Session = {
      id: sessionId,
      name: sessionName,
      workingDirectory: targetDir,
      createdAt: Date.now(),
      lastActiveAt: Date.now(),
      messageCount: 0,
    };

    const state: SessionState = {
      session,
      isFirstMessage: true,
      claudeProcess: null,
      responseBuffer: '',
    };

    this.sessions.set(sessionId, state);

    // 如果是第一个会话，自动激活
    if (this.sessions.size === 1) {
      this.activeSessionId = sessionId;
    }

    console.log(`[SessionManager] 创建会话: ${sessionId} @ ${targetDir}`);
    return session;
  }

  /**
   * 切换当前活动会话
   */
  switchSession(sessionId: string): Session {
    const state = this.sessions.get(sessionId);
    if (!state) {
      throw new Error(`会话不存在: ${sessionId}`);
    }

    this.activeSessionId = sessionId;
    state.session.lastActiveAt = Date.now();
    console.log(`[SessionManager] 切换到会话: ${sessionId}`);
    return state.session;
  }

  /**
   * 更新会话的工作目录
   */
  updateWorkingDirectory(sessionId: string, newDirectory: string): Session {
    const state = this.sessions.get(sessionId);
    if (!state) {
      throw new Error(`会话不存在: ${sessionId}`);
    }

    // 验证新目录是否在允许范围内
    if (!this.isDirectoryAllowed(newDirectory)) {
      throw new Error(`目录不在允许范围内: ${newDirectory}`);
    }

    // 验证目录存在
    if (!fs.existsSync(newDirectory)) {
      throw new Error(`目录不存在: ${newDirectory}`);
    }

    const oldDir = state.session.workingDirectory;
    state.session.workingDirectory = path.resolve(newDirectory);
    state.session.lastActiveAt = Date.now();

    // 更新会话名称以反映新目录
    state.session.name = this.generateSessionName(newDirectory);

    console.log(`[SessionManager] 会话 ${sessionId} 工作目录从 ${oldDir} 更新到 ${state.session.workingDirectory}`);
    return state.session;
  }

  /**
   * 删除会话
   */
  deleteSession(sessionId: string): void {
    const state = this.sessions.get(sessionId);
    if (!state) {
      throw new Error(`会话不存在: ${sessionId}`);
    }

    // 如果有正在运行的进程，先终止
    if (state.claudeProcess) {
      state.claudeProcess.kill();
    }

    this.sessions.delete(sessionId);

    // 如果删除的是当前活动会话，切换到另一个会话
    if (this.activeSessionId === sessionId) {
      const remaining = Array.from(this.sessions.keys());
      this.activeSessionId = remaining.length > 0 ? remaining[0] : null;
    }

    console.log(`[SessionManager] 删除会话: ${sessionId}`);
  }

  /**
   * 获取所有会话列表
   */
  getSessions(): Session[] {
    return Array.from(this.sessions.values())
      .map(s => s.session)
      .sort((a, b) => b.lastActiveAt - a.lastActiveAt);
  }

  /**
   * 获取当前活动会话 ID
   */
  getActiveSessionId(): string | null {
    return this.activeSessionId;
  }

  /**
   * 获取会话
   */
  getSession(sessionId: string): Session | undefined {
    return this.sessions.get(sessionId)?.session;
  }

  /**
   * 发送消息到指定会话
   */
  sendMessage(sessionId: string, message: string): boolean {
    const state = this.sessions.get(sessionId);
    if (!state) {
      this.onError(sessionId, `会话不存在: ${sessionId}`);
      return false;
    }

    // 检查是否有正在运行的进程
    if (state.claudeProcess) {
      this.onError(sessionId, 'Claude 正在处理中，请稍候...');
      return false;
    }

    this.startClaudeProcess(state, message);
    return true;
  }

  /**
   * 发送消息到当前活动会话
   */
  sendMessageToActive(message: string): boolean {
    if (!this.activeSessionId) {
      // 如果没有活动会话，自动创建一个
      const session = this.createSession();
      this.activeSessionId = session.id;
    }

    return this.sendMessage(this.activeSessionId, message);
  }

  /**
   * 检查是否有任何会话正在处理
   */
  isProcessing(): boolean {
    for (const state of this.sessions.values()) {
      if (state.claudeProcess) {
        return true;
      }
    }
    return false;
  }

  /**
   * 检查目录是否在允许范围内
   */
  private isDirectoryAllowed(targetDir: string): boolean {
    const normalizedTarget = path.resolve(targetDir);

    for (const allowedDir of this.config.allowedDirectories) {
      const normalizedAllowed = path.resolve(allowedDir);
      if (normalizedTarget === normalizedAllowed ||
          normalizedTarget.startsWith(normalizedAllowed + path.sep)) {
        return true;
      }
    }
    return false;
  }

  /**
   * 生成会话名称
   */
  private generateSessionName(workingDirectory: string): string {
    const dirName = path.basename(workingDirectory);
    const count = Array.from(this.sessions.values())
      .filter(s => s.session.workingDirectory === workingDirectory)
      .length;

    return count > 0 ? `${dirName} (${count + 1})` : dirName;
  }

  /**
   * 启动 Claude CLI 进程
   */
  private startClaudeProcess(state: SessionState, message: string): void {
    const { session } = state;

    console.log(`[SessionManager] 启动 Claude CLI for session ${session.id}`);
    console.log(`[SessionManager] 工作目录: ${session.workingDirectory}`);
    console.log(`[SessionManager] 消息: ${message.substring(0, 50)}${message.length > 50 ? '...' : ''}`);

    state.responseBuffer = '';

    // 构建参数
    const args = ['-p', message];

    // 非第一条消息使用 --continue 保持上下文
    if (!state.isFirstMessage) {
      args.push('--continue');
      console.log(`[SessionManager] 继续会话 ${session.id}`);
    } else {
      console.log(`[SessionManager] 开始新会话 ${session.id}`);
    }

    // 跳过权限检查以允许文件操作
    args.push('--dangerously-skip-permissions');

    state.claudeProcess = spawn(this.claudePath, args, {
      cwd: session.workingDirectory,
      shell: false,
      env: { ...process.env, FORCE_COLOR: '0' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    console.log(`[SessionManager] 进程 PID: ${state.claudeProcess.pid}`);

    state.claudeProcess.stdout?.on('data', (data) => {
      const text = data.toString();
      state.responseBuffer += text;
      process.stdout.write(text);
    });

    state.claudeProcess.stderr?.on('data', (data) => {
      const text = data.toString();
      // 过滤常见噪音
      if (!text.includes('ExperimentalWarning') && !text.includes('punycode')) {
        console.log(`[SessionManager] [stderr] ${text}`);
        state.responseBuffer += text;
      }
    });

    state.claudeProcess.on('close', (code) => {
      console.log(`[SessionManager] Claude 进程结束 (session: ${session.id}, code: ${code})`);

      if (state.responseBuffer.trim()) {
        this.onResponse(session.id, state.responseBuffer.trim(), true);

        // 成功响应后，后续消息使用 --continue
        if (code === 0) {
          state.isFirstMessage = false;
          session.messageCount++;
          session.lastActiveAt = Date.now();
        }
      } else if (code !== 0) {
        this.onError(session.id, `Claude 进程异常退出 (code: ${code})`);
      }

      state.claudeProcess = null;
      state.responseBuffer = '';
    });

    state.claudeProcess.on('error', (err) => {
      console.error(`[SessionManager] Claude 启动失败: ${err.message}`);
      this.onError(session.id, `无法启动 Claude CLI: ${err.message}`);
      state.claudeProcess = null;
    });
  }

  /**
   * 获取配置
   */
  getConfig(): SessionConfig {
    return this.config;
  }

  /**
   * 清理所有会话
   */
  cleanup(): void {
    for (const state of this.sessions.values()) {
      if (state.claudeProcess) {
        state.claudeProcess.kill();
      }
    }
    this.sessions.clear();
    this.activeSessionId = null;
  }
}
