import { spawn } from 'child_process';
import { EventEmitter } from 'events';
import * as os from 'os';
import * as path from 'path';
import type { ClaudeConfig } from '../config.js';

export interface ClaudeMessage {
  type: string;
  subtype?: string;
  result?: unknown;
}

export class ClaudeProcess extends EventEmitter {
  private config: ClaudeConfig;
  private isRunning = false;
  private isBusy = false;
  private claudePath: string;

  constructor(config: ClaudeConfig) {
    super();
    this.config = config;
    // 使用完整路径避免 PATH 问题
    this.claudePath = path.join(os.homedir(), '.local', 'bin', 'claude');
  }

  start(): void {
    this.isRunning = true;
    this.emit('ready');
  }

  async sendMessage(text: string): Promise<void> {
    if (this.isBusy) {
      throw new Error('Claude 正在处理中');
    }

    this.isBusy = true;

    // --continue 会自动恢复该目录下最近的会话，保持上下文
    const args = ['--print', '--continue', '--dangerously-skip-permissions', text];

    console.log('[DEBUG] Running:', this.claudePath, args);
    console.log('[DEBUG] Working directory:', this.config.workingDirectory);

    const child = spawn(this.claudePath, args, {
      cwd: this.config.workingDirectory,
      env: { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe'], // 关闭 stdin
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('error', (err) => {
      console.error('[DEBUG] Spawn error:', err.message);
      this.isBusy = false;
      this.emit('message', {
        type: 'result',
        subtype: 'error',
        result: `启动失败: ${err.message}`
      });
      this.emit('done');
    });

    child.on('close', (code) => {
      console.log('[DEBUG] Command completed with code:', code);
      console.log('[DEBUG] stdout length:', stdout.length);
      console.log('[DEBUG] stderr:', stderr.slice(0, 500));

      this.isBusy = false;

      // Claude CLI 可能返回非零但仍有有效输出
      if (stdout.trim()) {
        this.emit('message', {
          type: 'result',
          subtype: 'success',
          result: stdout.trim()
        });
      } else if (stderr.trim()) {
        this.emit('message', {
          type: 'result',
          subtype: 'error',
          result: stderr.trim()
        });
      } else if (code !== 0) {
        this.emit('message', {
          type: 'result',
          subtype: 'error',
          result: `命令退出码: ${code}`
        });
      }
      this.emit('done');
    });
  }

  stop(): void {
    this.isBusy = false;
  }

  forceStop(): void {
    this.isBusy = false;
  }

  restart(): void {
    this.isBusy = false;
    this.isRunning = true;
    this.emit('ready');
  }

  getIsRunning(): boolean {
    return this.isRunning;
  }

  getIsBusy(): boolean {
    return this.isBusy;
  }
}
