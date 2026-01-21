import TelegramBot from 'node-telegram-bot-api';
import { EventEmitter } from 'events';
import type { TelegramConfig } from '../config.js';

const MAX_MESSAGE_LENGTH = 4000;

export interface TelegramBotEvents {
  message: (chatId: number, text: string) => void;
  command: (chatId: number, command: string, args: string) => void;
  error: (err: Error) => void;
}

export class TelegramBotClient extends EventEmitter {
  private bot: TelegramBot;
  private config: TelegramConfig;
  private authenticatedChats: Set<number> = new Set();
  private pendingAuth: Set<number> = new Set();

  constructor(config: TelegramConfig) {
    super();
    this.config = config;
    console.log('[TG] Initializing bot...');
    this.bot = new TelegramBot(config.botToken, { polling: true });
    this.setupHandlers();
    console.log('[TG] Bot initialized, polling started');
  }

  private setupHandlers(): void {
    this.bot.on('message', (msg) => {
      console.log('[TG] Received message:', msg.chat.id, msg.text?.slice(0, 50));
      const chatId = msg.chat.id;
      const text = msg.text || '';

      // 处理命令
      if (text.startsWith('/')) {
        const [command, ...args] = text.slice(1).split(' ');
        this.handleCommand(chatId, command, args.join(' '));
        return;
      }

      // 检查认证
      if (!this.authenticatedChats.has(chatId)) {
        this.handleAuth(chatId, text);
        return;
      }

      // 已认证，转发消息
      console.log('[TG] Forwarding message to Claude:', text.slice(0, 50));
      this.emit('message', chatId, text);
    });

    this.bot.on('polling_error', (err) => {
      console.error('[TG] Polling error:', err.message);
      this.emit('error', err);
    });
  }

  private handleCommand(chatId: number, command: string, args: string): void {
    switch (command) {
      case 'start':
        this.sendMessage(chatId,
          '🤖 Claude Code 远程控制\n\n' +
          '可用命令:\n' +
          '/status - 查看状态\n' +
          '/stop - 停止当前任务\n' +
          '/restart - 重启 Claude\n\n' +
          '请先输入密码进行验证。'
        );
        this.pendingAuth.add(chatId);
        break;

      case 'status':
      case 'stop':
      case 'restart':
        if (!this.authenticatedChats.has(chatId)) {
          this.sendMessage(chatId, '🔐 请先输入密码验证');
          this.pendingAuth.add(chatId);
          return;
        }
        this.emit('command', chatId, command, args);
        break;

      default:
        this.sendMessage(chatId, `❓ 未知命令: /${command}`);
    }
  }

  private handleAuth(chatId: number, text: string): void {
    if (!this.pendingAuth.has(chatId)) {
      this.sendMessage(chatId, '🔐 请输入访问密码：');
      this.pendingAuth.add(chatId);
      return;
    }

    if (text === this.config.authPassword) {
      this.authenticatedChats.add(chatId);
      this.pendingAuth.delete(chatId);
      this.sendMessage(chatId, '✅ 验证成功！现在可以开始使用了。\n\n发送任意文本作为 Claude 的输入指令。');
    } else {
      this.sendMessage(chatId, '❌ 密码错误，请重试。');
    }
  }

  async sendMessage(chatId: number, text: string): Promise<void> {
    if (!text) return;

    // 分片发送长消息
    const chunks = this.splitMessage(text);

    for (let i = 0; i < chunks.length; i++) {
      let chunk = chunks[i];
      if (chunks.length > 1) {
        chunk = `[${i + 1}/${chunks.length}]\n${chunk}`;
      }

      try {
        await this.bot.sendMessage(chatId, chunk, {
          parse_mode: 'HTML',
          disable_web_page_preview: true,
        });
      } catch (err) {
        // 如果 HTML 解析失败，尝试纯文本
        try {
          await this.bot.sendMessage(chatId, chunk);
        } catch (innerErr) {
          console.error('发送消息失败:', innerErr);
        }
      }
    }
  }

  private splitMessage(text: string): string[] {
    if (text.length <= MAX_MESSAGE_LENGTH) {
      return [text];
    }

    const chunks: string[] = [];
    let remaining = text;

    while (remaining.length > 0) {
      if (remaining.length <= MAX_MESSAGE_LENGTH) {
        chunks.push(remaining);
        break;
      }

      // 尝试在换行处分割
      let splitIndex = remaining.lastIndexOf('\n', MAX_MESSAGE_LENGTH);
      if (splitIndex === -1 || splitIndex < MAX_MESSAGE_LENGTH / 2) {
        splitIndex = MAX_MESSAGE_LENGTH;
      }

      chunks.push(remaining.slice(0, splitIndex));
      remaining = remaining.slice(splitIndex).trimStart();
    }

    return chunks;
  }

  async broadcast(text: string): Promise<void> {
    for (const chatId of this.authenticatedChats) {
      await this.sendMessage(chatId, text);
    }
  }

  isAuthenticated(chatId: number): boolean {
    return this.authenticatedChats.has(chatId);
  }

  stop(): void {
    this.bot.stopPolling();
  }
}
