/**
 * Telegram Bot 客户端
 */

import TelegramBot from 'node-telegram-bot-api';
import { EventEmitter } from 'events';
import type { TelegramConfig } from '../config.js';
import { TELEGRAM, LOG_TAGS } from '../constants.js';
import { logger } from '../utils/logger.js';
import { splitText } from '../utils/text.js';

const TAG = LOG_TAGS.TELEGRAM;

export class TelegramBotClient extends EventEmitter {
  private bot: TelegramBot;
  private config: TelegramConfig;
  private authenticatedChats: Set<number> = new Set();
  private pendingAuth: Set<number> = new Set();

  constructor(config: TelegramConfig) {
    super();
    this.config = config;
    logger.info(TAG, 'Initializing bot...');
    this.bot = new TelegramBot(config.botToken, { polling: true });
    this.setupHandlers();
    logger.info(TAG, 'Bot initialized, polling started');
  }

  private setupHandlers(): void {
    this.bot.on('message', (msg) => {
      logger.debug(TAG, 'Received message:', msg.chat.id, msg.text?.slice(0, 50));
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
      logger.info(TAG, 'Forwarding message to Claude:', text.slice(0, 50));
      this.emit('message', chatId, text);
    });

    this.bot.on('polling_error', (err) => {
      logger.error(TAG, 'Polling error:', err.message);
      this.emit('error', err);
    });
  }

  private handleCommand(chatId: number, command: string, args: string): void {
    switch (command) {
      case 'start':
        this.sendMessage(chatId,
          '🤖 <b>Claude Code 远程控制</b>\n\n' +
          '<b>会话管理:</b>\n' +
          '/new [名称] [目录] - 创建新会话\n' +
          '/switch &lt;ID|名称&gt; - 切换会话\n' +
          '/list - 列出所有会话\n' +
          '/close [ID] - 关闭会话\n' +
          '/rename &lt;名称&gt; - 重命名当前会话\n\n' +
          '<b>会话控制:</b>\n' +
          '/session - 查看会话详情\n' +
          '/status - 查看状态\n' +
          '/stop - 停止当前任务\n' +
          '/restart - 重启当前会话\n\n' +
          '请先输入密码进行验证。'
        );
        this.pendingAuth.add(chatId);
        break;

      // 会话管理命令
      case 'new':
      case 'switch':
      case 'list':
      case 'close':
      case 'rename':
      // 原有命令
      case 'session':
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
        // 未知命令也转发给 Bridge 处理
        if (this.authenticatedChats.has(chatId)) {
          this.emit('command', chatId, command, args);
        } else {
          this.sendMessage(chatId, '🔐 请先输入密码验证');
          this.pendingAuth.add(chatId);
        }
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
      logger.info(TAG, 'User authenticated:', chatId);
      this.sendMessage(chatId, '✅ 验证成功！现在可以开始使用了。\n\n发送任意文本作为 Claude 的输入指令。');
    } else {
      logger.warn(TAG, 'Authentication failed for:', chatId);
      this.sendMessage(chatId, '❌ 密码错误，请重试。');
    }
  }

  async sendMessage(chatId: number, text: string): Promise<void> {
    if (!text) return;

    // 分片发送长消息
    const chunks = splitText(text, TELEGRAM.MAX_MESSAGE_LENGTH);

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
          logger.error(TAG, '发送消息失败:', innerErr);
        }
      }
    }
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
    logger.info(TAG, 'Stopping bot...');
    this.bot.stopPolling();
  }
}
