/**
 * Claude CLI 进程管理
 */

import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import type { ClaudeConfig } from '../config.js';
import { CLAUDE, LOG_TAGS } from '../constants.js';
import { logger } from '../utils/logger.js';
import type { ClaudeMessage, SessionInfo, StreamMessage } from '../types.js';

const TAG = LOG_TAGS.CLAUDE;

export class ClaudeProcess extends EventEmitter {
  private config: ClaudeConfig;
  private process: ChildProcess | null = null;
  private outputBuffer = '';
  private currentResponse = '';

  // 状态
  private _isRunning = false;
  private _isBusy = false;

  // 会话信息
  private sessionInfo: SessionInfo = this.createEmptySessionInfo();

  constructor(config: ClaudeConfig) {
    super();
    this.config = config;
  }

  /**
   * 创建空的会话信息对象
   */
  private createEmptySessionInfo(): SessionInfo {
    return {
      sessionId: null,
      messageCount: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCostUsd: 0,
      startTime: null,
      model: null,
    };
  }

  /**
   * 重置会话信息
   */
  private resetSessionInfo(): void {
    this.sessionInfo = {
      ...this.createEmptySessionInfo(),
      startTime: new Date(),
    };
  }

  /**
   * 获取 Claude CLI 路径
   */
  private getClaudePath(): string {
    return this.config.cliPath || CLAUDE.DEFAULT_PATH;
  }

  /**
   * 启动 Claude 进程
   */
  start(): void {
    if (this.process) {
      logger.warn(TAG, '进程已在运行');
      return;
    }

    const claudePath = this.getClaudePath();
    logger.info(TAG, '启动持久进程...');
    logger.info(TAG, '工作目录:', this.config.workingDirectory);
    logger.debug(TAG, 'CLI 路径:', claudePath);

    this.resetSessionInfo();

    this.process = spawn(claudePath, [...CLAUDE.DEFAULT_ARGS], {
      cwd: this.config.workingDirectory,
      env: { ...process.env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    this.process.stdout?.on('data', (data) => {
      this.handleOutput(data.toString());
    });

    this.process.stderr?.on('data', (data) => {
      logger.warn(TAG, '[stderr]', data.toString().slice(0, 200));
    });

    this.process.on('error', (err) => {
      logger.error(TAG, '进程错误:', err.message);
      this.handleProcessExit(-1);
    });

    this.process.on('close', (code) => {
      logger.info(TAG, '进程退出, code:', code);
      this.handleProcessExit(code ?? 0);
    });

    this._isRunning = true;
    this.emit('ready');
  }

  /**
   * 处理进程输出
   */
  private handleOutput(data: string): void {
    this.outputBuffer += data;

    // 按行解析 JSON
    const lines = this.outputBuffer.split('\n');
    this.outputBuffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.trim()) continue;

      try {
        const msg: StreamMessage = JSON.parse(line);
        this.handleStreamMessage(msg);
      } catch {
        logger.debug(TAG, '非JSON输出:', line.slice(0, 100));
      }
    }
  }

  /**
   * 处理 stream-json 消息
   */
  private handleStreamMessage(msg: StreamMessage): void {
    switch (msg.type) {
      case 'system':
        if (msg.subtype === 'init') {
          logger.info(TAG, '会话初始化完成');
          if (msg.session_id) this.sessionInfo.sessionId = msg.session_id;
          if (msg.model) this.sessionInfo.model = msg.model;
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
        logger.info(TAG, '回复完成, 耗时:', msg.duration_ms, 'ms');
        this.updateSessionStats(msg);
        this.emitResponse(msg);
        this.currentResponse = '';
        this._isBusy = false;
        this.emit('done');
        break;
    }
  }

  /**
   * 更新会话统计信息
   */
  private updateSessionStats(msg: StreamMessage): void {
    this.sessionInfo.messageCount++;

    if (msg.session_id) {
      this.sessionInfo.sessionId = msg.session_id;
    }

    if (msg.total_cost_usd) {
      this.sessionInfo.totalCostUsd = msg.total_cost_usd;
    }

    if (msg.usage) {
      this.sessionInfo.totalInputTokens +=
        (msg.usage.input_tokens || 0) +
        (msg.usage.cache_read_input_tokens || 0) +
        (msg.usage.cache_creation_input_tokens || 0);
      this.sessionInfo.totalOutputTokens += msg.usage.output_tokens || 0;
    }
  }

  /**
   * 发送响应事件
   */
  private emitResponse(msg: StreamMessage): void {
    const result = this.currentResponse || msg.result || '';
    if (result) {
      this.emit('message', {
        type: 'result',
        subtype: (msg.subtype as 'success' | 'error') || 'success',
        result,
      });
    }
  }

  /**
   * 处理进程退出
   */
  private handleProcessExit(code: number): void {
    this.process = null;
    this._isRunning = false;
    this._isBusy = false;

    // 如果有未完成的响应，发送错误
    if (this.currentResponse) {
      this.emit('message', {
        type: 'result',
        subtype: 'error',
        result: `进程异常退出 (code: ${code})，部分响应: ${this.currentResponse}`,
      });
      this.currentResponse = '';
    }

    this.emit('exit', code);

    // 自动重启
    logger.info(TAG, `${CLAUDE.RESTART_DELAY_MS / 1000}秒后自动重启...`);
    setTimeout(() => this.start(), CLAUDE.RESTART_DELAY_MS);
  }

  /**
   * 发送消息到 Claude
   */
  async sendMessage(text: string): Promise<void> {
    if (!this.process || !this._isRunning) {
      throw new Error('Claude 进程未运行');
    }

    if (this._isBusy) {
      throw new Error('Claude 正在处理中');
    }

    this._isBusy = true;
    this.currentResponse = '';

    const message = JSON.stringify({
      type: 'user',
      message: { role: 'user', content: text },
    });

    logger.info(TAG, '发送消息:', text.slice(0, 50));
    this.process.stdin?.write(message + '\n');
  }

  /**
   * 停止进程
   */
  stop(): void {
    if (this.process) {
      logger.info(TAG, '停止进程...');
      this.process.stdin?.end();
      this.process.kill();
      this.process = null;
    }
    this._isRunning = false;
    this._isBusy = false;
  }

  /**
   * 强制停止进程
   */
  forceStop(): void {
    if (this.process) {
      this.process.kill('SIGKILL');
      this.process = null;
    }
    this._isRunning = false;
    this._isBusy = false;
    this.currentResponse = '';
  }

  /**
   * 重启进程
   */
  restart(): void {
    logger.info(TAG, '重启进程...');
    this.stop();
    setTimeout(() => this.start(), CLAUDE.RESTART_WAIT_MS);
  }

  // Getters
  get isRunning(): boolean {
    return this._isRunning;
  }

  get isBusy(): boolean {
    return this._isBusy;
  }

  // 保持向后兼容的方法
  getIsRunning(): boolean {
    return this._isRunning;
  }

  getIsBusy(): boolean {
    return this._isBusy;
  }

  getSessionInfo(): SessionInfo {
    return { ...this.sessionInfo };
  }
}

// 重新导出类型，保持向后兼容
export type { ClaudeMessage, SessionInfo };
