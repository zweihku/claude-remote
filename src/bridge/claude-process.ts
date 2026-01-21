import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import * as os from 'os';
import * as path from 'path';
import type { ClaudeConfig } from '../config.js';

export interface ClaudeMessage {
  type: string;
  subtype?: string;
  result?: unknown;
}

interface StreamMessage {
  type: string;
  subtype?: string;
  message?: {
    content?: Array<{ type: string; text?: string }>;
  };
  result?: string;
  duration_ms?: number;
}

export class ClaudeProcess extends EventEmitter {
  private config: ClaudeConfig;
  private process: ChildProcess | null = null;
  private isRunning = false;
  private isBusy = false;
  private claudePath: string;
  private outputBuffer = '';
  private currentResponse = '';

  constructor(config: ClaudeConfig) {
    super();
    this.config = config;
    this.claudePath = path.join(os.homedir(), '.local', 'bin', 'claude');
  }

  start(): void {
    if (this.process) {
      console.log('[Claude] 进程已在运行');
      return;
    }

    console.log('[Claude] 启动持久进程...');
    console.log('[Claude] 工作目录:', this.config.workingDirectory);

    const args = [
      '--dangerously-skip-permissions',
      '--input-format', 'stream-json',
      '--output-format', 'stream-json',
      '--print',
      '--verbose'
    ];

    this.process = spawn(this.claudePath, args, {
      cwd: this.config.workingDirectory,
      env: { ...process.env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    this.process.stdout?.on('data', (data) => {
      this.handleOutput(data.toString());
    });

    this.process.stderr?.on('data', (data) => {
      console.error('[Claude][stderr]', data.toString().slice(0, 200));
    });

    this.process.on('error', (err) => {
      console.error('[Claude] 进程错误:', err.message);
      this.handleProcessExit(-1);
    });

    this.process.on('close', (code) => {
      console.log('[Claude] 进程退出, code:', code);
      this.handleProcessExit(code ?? 0);
    });

    this.isRunning = true;
    this.emit('ready');
  }

  private handleOutput(data: string): void {
    this.outputBuffer += data;

    // 按行解析 JSON
    const lines = this.outputBuffer.split('\n');
    this.outputBuffer = lines.pop() || ''; // 保留不完整的最后一行

    for (const line of lines) {
      if (!line.trim()) continue;

      try {
        const msg: StreamMessage = JSON.parse(line);
        this.handleStreamMessage(msg);
      } catch (e) {
        console.log('[Claude] 非JSON输出:', line.slice(0, 100));
      }
    }
  }

  private handleStreamMessage(msg: StreamMessage): void {
    switch (msg.type) {
      case 'system':
        if (msg.subtype === 'init') {
          console.log('[Claude] 会话初始化完成');
        }
        break;

      case 'assistant':
        // 提取回复文本
        const textContent = msg.message?.content?.find(c => c.type === 'text');
        if (textContent?.text) {
          this.currentResponse += textContent.text;
        }
        break;

      case 'result':
        console.log('[Claude] 回复完成, 耗时:', msg.duration_ms, 'ms');

        // 发送完整响应
        if (this.currentResponse) {
          this.emit('message', {
            type: 'result',
            subtype: msg.subtype || 'success',
            result: this.currentResponse
          });
        } else if (msg.result) {
          this.emit('message', {
            type: 'result',
            subtype: msg.subtype || 'success',
            result: msg.result
          });
        }

        this.currentResponse = '';
        this.isBusy = false;
        this.emit('done');
        break;
    }
  }

  private handleProcessExit(code: number): void {
    this.process = null;
    this.isRunning = false;
    this.isBusy = false;

    // 如果有未完成的响应，发送错误
    if (this.currentResponse) {
      this.emit('message', {
        type: 'result',
        subtype: 'error',
        result: `进程异常退出 (code: ${code})，部分响应: ${this.currentResponse}`
      });
      this.currentResponse = '';
    }

    this.emit('exit', code);

    // 自动重启
    console.log('[Claude] 3秒后自动重启...');
    setTimeout(() => this.start(), 3000);
  }

  async sendMessage(text: string): Promise<void> {
    if (!this.process || !this.isRunning) {
      throw new Error('Claude 进程未运行');
    }

    if (this.isBusy) {
      throw new Error('Claude 正在处理中');
    }

    this.isBusy = true;
    this.currentResponse = '';

    const message = JSON.stringify({
      type: 'user',
      message: { role: 'user', content: text }
    });

    console.log('[Claude] 发送消息:', text.slice(0, 50));
    this.process.stdin?.write(message + '\n');
  }

  stop(): void {
    if (this.process) {
      console.log('[Claude] 停止进程...');
      this.process.stdin?.end();
      this.process.kill();
      this.process = null;
    }
    this.isRunning = false;
    this.isBusy = false;
  }

  forceStop(): void {
    if (this.process) {
      this.process.kill('SIGKILL');
      this.process = null;
    }
    this.isRunning = false;
    this.isBusy = false;
    this.currentResponse = '';
  }

  restart(): void {
    console.log('[Claude] 重启进程...');
    this.stop();
    setTimeout(() => this.start(), 500);
  }

  getIsRunning(): boolean {
    return this.isRunning;
  }

  getIsBusy(): boolean {
    return this.isBusy;
  }
}
