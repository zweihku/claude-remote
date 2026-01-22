#!/usr/bin/env node
/**
 * Claude Remote - Web/Phone Client Simulator
 * 用于测试中继服务器的手机端模拟器
 */

import WebSocket from 'ws';
import * as readline from 'readline';

const RELAY_HTTP = process.env.RELAY_HTTP || 'http://localhost:4000';
const RELAY_WS = process.env.RELAY_WS || 'ws://localhost:4000';  // Same port as HTTP

const deviceId = `web-${Date.now()}`;
const deviceName = 'Test Phone';

let ws: WebSocket | null = null;
let paired = false;

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function log(msg: string) {
  console.log(`\x1b[35m[Phone]\x1b[0m ${msg}`);
}

function logReceived(msg: string) {
  console.log(`\x1b[32m[Claude 响应]\x1b[0m ${msg}`);
}

async function confirmPairCode(pairCode: string): Promise<{ success: boolean; pairId?: string; error?: string }> {
  const response = await fetch(`${RELAY_HTTP}/api/pair/confirm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pairCode, deviceId, deviceName }),
  });
  const data = await response.json();
  return data.data;
}

function connectWebSocket(): Promise<void> {
  return new Promise((resolve, reject) => {
    ws = new WebSocket(RELAY_WS);

    ws.on('open', () => {
      log('已连接到中继服务器');
      ws!.send(JSON.stringify({ type: 'auth', token: `${deviceId}:${deviceName}:web` }));
    });

    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());

      switch (msg.type) {
        case 'auth_success':
          log('认证成功');
          resolve();
          break;
        case 'auth_error':
          log(`认证失败: ${msg.error}`);
          reject(new Error(msg.error));
          break;
        case 'paired':
          paired = true;
          log(`✅ 配对成功!`);
          log('现在可以发送消息给 Claude 了');
          promptForMessage();
          break;
        case 'unpaired':
          paired = false;
          log('❌ 桌面端已断开');
          break;
        case 'message':
          logReceived(msg.payload.content);
          promptForMessage();
          break;
        case 'pong':
          break;
        default:
          log(`未知消息: ${JSON.stringify(msg)}`);
      }
    });

    ws.on('close', () => {
      log('连接已断开');
      paired = false;
    });

    ws.on('error', (err) => {
      log(`WebSocket 错误: ${err.message}`);
      reject(err);
    });
  });
}

function promptForMessage() {
  rl.question('\n\x1b[33m你: \x1b[0m', (input) => {
    const trimmed = input.trim();
    if (trimmed.toLowerCase() === 'quit') {
      ws?.close();
      process.exit(0);
    }
    if (trimmed && paired && ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'message',
        payload: { id: Date.now().toString(), content: trimmed, timestamp: Date.now() },
      }));
    } else if (!paired) {
      log('尚未配对，无法发送消息');
      promptForMessage();
    }
  });
}

function promptForPairCode() {
  rl.question('\n请输入配对码 (格式: XXXX-XXXX): ', async (input) => {
    const code = input.trim().toUpperCase();
    if (code.toLowerCase() === 'quit') {
      ws?.close();
      process.exit(0);
    }

    try {
      log(`正在验证配对码: ${code}`);
      const result = await confirmPairCode(code);

      if (result.success) {
        log('配对码验证成功，等待连接...');
      } else {
        log(`配对失败: ${result.error}`);
        promptForPairCode();
      }
    } catch (error) {
      log(`请求失败: ${error}`);
      promptForPairCode();
    }
  });
}

// 心跳
setInterval(() => {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'ping' }));
  }
}, 25000);

async function main() {
  console.log('\n╔════════════════════════════════════════╗');
  console.log('║     Claude Remote - 手机端模拟器        ║');
  console.log('╚════════════════════════════════════════╝\n');

  try {
    await connectWebSocket();
    log('请输入桌面端显示的配对码');
    log('输入 "quit" 退出\n');
    promptForPairCode();
  } catch (error) {
    console.error('启动失败:', error);
    process.exit(1);
  }
}

main();
