#!/usr/bin/env node
/**
 * Claude Remote - Desktop Client Simulator
 * 用于测试中继服务器的桌面端模拟器
 */

import WebSocket from 'ws';
import * as readline from 'readline';

const RELAY_HTTP = process.env.RELAY_HTTP || 'http://localhost:4000';
const RELAY_WS = process.env.RELAY_WS || 'ws://localhost:4000';  // Same port as HTTP

const deviceId = `desktop-${Date.now()}`;
const deviceName = 'Test Desktop';

let ws: WebSocket | null = null;
let pairCode: string | null = null;
let paired = false;

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function log(msg: string) {
  console.log(`\x1b[36m[Desktop]\x1b[0m ${msg}`);
}

function logReceived(msg: string) {
  console.log(`\x1b[32m[收到消息]\x1b[0m ${msg}`);
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
          log(`✅ 配对成功! PairID: ${msg.pairId}`);
          log('现在可以接收来自手机端的消息了');
          break;
        case 'unpaired':
          paired = false;
          log('❌ 已断开配对');
          break;
        case 'message':
          logReceived(msg.payload.content);
          // 模拟 Claude 响应
          setTimeout(() => {
            const response = `[Claude 模拟响应] 收到你的消息: "${msg.payload.content}"`;
            ws!.send(JSON.stringify({
              type: 'message',
              payload: { id: Date.now().toString(), content: response, timestamp: Date.now() },
            }));
            log(`已发送响应: ${response}`);
          }, 500);
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

// 心跳
setInterval(() => {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'ping' }));
  }
}, 25000);

async function main() {
  console.log('\n╔════════════════════════════════════════╗');
  console.log('║     Claude Remote - 桌面端模拟器        ║');
  console.log('╚════════════════════════════════════════╝\n');

  try {
    // 连接 WebSocket
    await connectWebSocket();

    // 获取配对码
    pairCode = await requestPairCode();

    console.log('\n┌────────────────────────────────────────┐');
    console.log('│                                        │');
    console.log(`│     配对码:  \x1b[33m\x1b[1m${pairCode}\x1b[0m              │`);
    console.log('│                                        │');
    console.log('│     请在手机端输入此配对码              │');
    console.log('│     有效期: 5 分钟                      │');
    console.log('│                                        │');
    console.log('└────────────────────────────────────────┘\n');

    log('等待手机端配对...');
    log('输入 "quit" 退出\n');

    rl.on('line', (input) => {
      if (input.trim().toLowerCase() === 'quit') {
        ws?.close();
        process.exit(0);
      }
    });

  } catch (error) {
    console.error('启动失败:', error);
    process.exit(1);
  }
}

main();
