import type { Config } from '../config.js';
import { ClaudeProcess } from './claude-process.js';
import { TelegramBotClient } from '../telegram/bot.js';
import {
  formatClaudeMessage,
  formatStatus,
  formatError,
  formatNotification,
} from './formatter.js';

export class Bridge {
  private config: Config;
  private claude: ClaudeProcess;
  private telegram: TelegramBotClient;
  private messageQueue: string[] = [];

  constructor(config: Config) {
    this.config = config;
    this.claude = new ClaudeProcess(config.claude);
    this.telegram = new TelegramBotClient(config.telegram);

    this.setupClaudeHandlers();
    this.setupTelegramHandlers();
  }

  private setupClaudeHandlers(): void {
    this.claude.on('message', async (msg) => {
      const formatted = formatClaudeMessage(msg);
      if (formatted) {
        await this.telegram.broadcast(formatted);
      }
    });

    this.claude.on('done', async () => {
      await this.processQueue();
    });

    this.claude.on('error', async (err) => {
      await this.telegram.broadcast(formatError(err.message));
      await this.processQueue();
    });

    this.claude.on('exit', async (code) => {
      await this.telegram.broadcast(
        formatNotification(`⚠️ Claude 任务异常退出 (code: ${code})`)
      );
      await this.processQueue();
    });

    this.claude.on('ready', async () => {
      await this.telegram.broadcast(formatNotification('🟢 Claude 已就绪，等待指令...'));
    });
  }

  private setupTelegramHandlers(): void {
    this.telegram.on('message', async (chatId, text) => {
      if (this.claude.getIsBusy()) {
        this.messageQueue.push(text);
        await this.telegram.sendMessage(chatId, '⏳ Claude 正在工作中，您的指令已排队');
        return;
      }

      await this.sendToClaude(chatId, text);
    });

    this.telegram.on('command', async (chatId, command, _args) => {
      switch (command) {
        case 'status':
          const busy = this.claude.getIsBusy() ? '🔄 处理中' : '💤 空闲';
          await this.telegram.sendMessage(
            chatId,
            formatStatus(this.claude.getIsRunning(), this.config.claude.workingDirectory) +
            `\n状态: ${busy}\n队列: ${this.messageQueue.length} 条指令`
          );
          break;

        case 'session':
          const info = this.claude.getSessionInfo();
          const uptime = info.startTime
            ? Math.floor((Date.now() - info.startTime.getTime()) / 1000 / 60)
            : 0;
          await this.telegram.sendMessage(
            chatId,
            `📊 <b>会话信息</b>\n\n` +
            `<b>Session ID:</b>\n<code>${info.sessionId || '未初始化'}</code>\n\n` +
            `<b>模型:</b> ${info.model || '未知'}\n` +
            `<b>消息数:</b> ${info.messageCount}\n` +
            `<b>运行时间:</b> ${uptime} 分钟\n\n` +
            `<b>Token 用量:</b>\n` +
            `  输入: ${info.totalInputTokens.toLocaleString()}\n` +
            `  输出: ${info.totalOutputTokens.toLocaleString()}\n\n` +
            `<b>累计费用:</b> $${info.totalCostUsd.toFixed(4)}`
          );
          break;

        case 'stop':
          this.claude.forceStop();
          this.messageQueue = [];
          await this.telegram.sendMessage(chatId, '⏹ Claude 已停止，队列已清空');
          break;

        case 'restart':
          this.claude.restart();
          this.messageQueue = [];
          await this.telegram.sendMessage(chatId, '🔄 Claude 已重置（新会话）');
          break;
      }
    });

    this.telegram.on('error', (err) => {
      console.error('Telegram error:', err.message);
    });
  }

  private async sendToClaude(chatId: number, text: string): Promise<void> {
    if (!this.claude.getIsRunning()) {
      await this.telegram.sendMessage(chatId, '⚠️ Claude 未运行，使用 /restart 启动');
      return;
    }

    try {
      await this.telegram.sendMessage(chatId, '📤 正在执行...');
      await this.claude.sendMessage(text);
    } catch (err) {
      await this.telegram.sendMessage(
        chatId,
        formatError(err instanceof Error ? err.message : String(err))
      );
    }
  }

  private async processQueue(): Promise<void> {
    if (this.messageQueue.length === 0) {
      await this.telegram.broadcast('⏸ 任务完成，等待新指令');
      return;
    }

    const nextMessage = this.messageQueue.shift()!;
    await this.telegram.broadcast(`📋 处理队列: "${nextMessage.slice(0, 50)}${nextMessage.length > 50 ? '...' : ''}"`);

    try {
      await this.claude.sendMessage(nextMessage);
    } catch (err) {
      await this.telegram.broadcast(
        formatError(err instanceof Error ? err.message : String(err))
      );
      await this.processQueue();
    }
  }

  start(): void {
    console.log('Bridge started, waiting for Telegram messages...');
    console.log(`Working directory: ${this.config.claude.workingDirectory}`);
    this.claude.start();
  }

  stop(): void {
    this.claude.stop();
    this.telegram.stop();
  }
}
