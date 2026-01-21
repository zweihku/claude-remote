/**
 * Bridge - 连接 Telegram 和 Claude CLI（多会话版）
 */

import type { Config } from '../config.js';
import { SessionManager } from '../session/index.js';
import { TelegramBotClient } from '../telegram/bot.js';
import { LOG_TAGS } from '../constants.js';
import { logger } from '../utils/logger.js';
import { formatNumber } from '../utils/text.js';
import {
  formatClaudeMessage,
  formatStatus,
  formatError,
  formatNotification,
  formatSessionList,
  formatSessionSwitch,
  formatSessionCreated,
  formatSessionClosed,
  formatWithSessionTag,
} from './formatter.js';

const TAG = LOG_TAGS.BRIDGE;

export class Bridge {
  private config: Config;
  private sessionManager: SessionManager;
  private telegram: TelegramBotClient;
  private messageQueue: string[] = [];

  constructor(config: Config) {
    this.config = config;

    // 初始化 SessionManager
    this.sessionManager = new SessionManager({
      maxSessions: config.session?.maxSessions ?? 5,
      defaultWorkingDirectory: config.claude.workingDirectory,
      cliPath: config.claude.cliPath,
      additionalArgs: config.claude.additionalArgs,
    });

    this.telegram = new TelegramBotClient(config.telegram);

    this.setupSessionHandlers();
    this.setupTelegramHandlers();
  }

  /**
   * 设置 SessionManager 事件处理
   */
  private setupSessionHandlers(): void {
    this.sessionManager.on('sessionMessage', async (sessionId, msg) => {
      const session = this.sessionManager.getActiveSession();
      const formatted = formatClaudeMessage(msg);
      if (formatted && session) {
        // 只有当消息来自当前活跃会话时才发送
        if (sessionId === session.id) {
          await this.telegram.broadcast(
            formatWithSessionTag(session.id, session.name, formatted)
          );
        }
      }
    });

    this.sessionManager.on('sessionDone', async (sessionId) => {
      const activeId = this.sessionManager.getActiveSessionId();
      if (sessionId === activeId) {
        await this.processQueue();
      }
    });

    this.sessionManager.on('sessionError', async (sessionId, err) => {
      const activeId = this.sessionManager.getActiveSessionId();
      if (sessionId === activeId) {
        await this.telegram.broadcast(formatError(err.message));
        await this.processQueue();
      }
    });

    this.sessionManager.on('sessionReady', async (sessionId) => {
      const session = this.sessionManager.getActiveSession();
      if (session && sessionId === session.id) {
        await this.telegram.broadcast(
          formatNotification(`🟢 会话 [${session.id}] ${session.name} 已就绪`)
        );
      }
    });
  }

  /**
   * 设置 Telegram 事件处理
   */
  private setupTelegramHandlers(): void {
    this.telegram.on('message', async (chatId, text) => {
      if (this.sessionManager.isCurrentBusy()) {
        this.messageQueue.push(text);
        await this.telegram.sendMessage(chatId, '⏳ 当前会话正在工作中，您的指令已排队');
        return;
      }

      await this.sendToSession(chatId, text);
    });

    this.telegram.on('command', async (chatId, command, args) => {
      await this.handleCommand(chatId, command, args);
    });

    this.telegram.on('error', (err) => {
      logger.error(TAG, 'Telegram error:', err.message);
    });
  }

  /**
   * 处理命令
   */
  private async handleCommand(chatId: number, command: string, args: string): Promise<void> {
    try {
      switch (command) {
        // 会话管理命令
        case 'new':
          await this.handleNewCommand(chatId, args);
          break;

        case 'switch':
          await this.handleSwitchCommand(chatId, args);
          break;

        case 'list':
          await this.handleListCommand(chatId);
          break;

        case 'close':
          await this.handleCloseCommand(chatId, args);
          break;

        case 'rename':
          await this.handleRenameCommand(chatId, args);
          break;

        // 原有命令
        case 'status':
          await this.handleStatusCommand(chatId);
          break;

        case 'session':
          await this.handleSessionInfoCommand(chatId);
          break;

        case 'stop':
          this.sessionManager.forceStopCurrent();
          this.messageQueue = [];
          await this.telegram.sendMessage(chatId, '⏹ 当前会话已停止，队列已清空');
          break;

        case 'restart':
          this.sessionManager.restartCurrent();
          this.messageQueue = [];
          await this.telegram.sendMessage(chatId, '🔄 当前会话已重置');
          break;

        default:
          await this.telegram.sendMessage(chatId, `❓ 未知命令: /${command}`);
      }
    } catch (err) {
      await this.telegram.sendMessage(
        chatId,
        formatError(err instanceof Error ? err.message : String(err))
      );
    }
  }

  /**
   * /new [name] [dir] - 创建新会话
   */
  private async handleNewCommand(chatId: number, args: string): Promise<void> {
    const parts = args.trim().split(/\s+/);
    const name = parts[0] || undefined;
    const workingDirectory = parts[1] || undefined;

    const session = this.sessionManager.create({ name, workingDirectory });
    await this.telegram.sendMessage(
      chatId,
      formatSessionCreated(session.id, session.name, session.workingDirectory)
    );
  }

  /**
   * /switch <id|name> - 切换会话
   */
  private async handleSwitchCommand(chatId: number, args: string): Promise<void> {
    const idOrName = args.trim();
    if (!idOrName) {
      await this.telegram.sendMessage(chatId, '⚠️ 用法: /switch <会话ID或名称>');
      return;
    }

    const session = this.sessionManager.switch(idOrName);
    await this.telegram.sendMessage(
      chatId,
      formatSessionSwitch(session.id, session.name)
    );
  }

  /**
   * /list - 列出所有会话
   */
  private async handleListCommand(chatId: number): Promise<void> {
    const sessions = this.sessionManager.list();
    await this.telegram.sendMessage(chatId, formatSessionList(sessions));
  }

  /**
   * /close [id] - 关闭会话
   */
  private async handleCloseCommand(chatId: number, args: string): Promise<void> {
    const idStr = args.trim();
    const id = idStr ? parseInt(idStr, 10) : undefined;

    if (idStr && isNaN(id!)) {
      await this.telegram.sendMessage(chatId, '⚠️ 用法: /close [会话ID]');
      return;
    }

    const session = this.sessionManager.close(id);
    await this.telegram.sendMessage(
      chatId,
      formatSessionClosed(session.id, session.name)
    );

    // 如果还有其他会话，显示切换提示
    const activeSession = this.sessionManager.getActiveSession();
    if (activeSession) {
      await this.telegram.sendMessage(
        chatId,
        `当前活跃会话: [${activeSession.id}] ${activeSession.name}`
      );
    } else {
      await this.telegram.sendMessage(
        chatId,
        '暂无活跃会话，使用 /new 创建新会话'
      );
    }
  }

  /**
   * /rename <name> - 重命名当前会话
   */
  private async handleRenameCommand(chatId: number, args: string): Promise<void> {
    const name = args.trim();
    if (!name) {
      await this.telegram.sendMessage(chatId, '⚠️ 用法: /rename <新名称>');
      return;
    }

    const session = this.sessionManager.rename(name);
    await this.telegram.sendMessage(
      chatId,
      `✅ 会话 [${session.id}] 已重命名为: ${name}`
    );
  }

  /**
   * /status - 显示当前状态
   */
  private async handleStatusCommand(chatId: number): Promise<void> {
    const session = this.sessionManager.getActiveSession();
    if (!session) {
      await this.telegram.sendMessage(
        chatId,
        '📊 <b>状态</b>\n\n暂无活跃会话\n使用 /new 创建会话'
      );
      return;
    }

    const busy = session.process.isBusy ? '🔄 处理中' : '💤 空闲';
    await this.telegram.sendMessage(
      chatId,
      formatStatus(session.process.isRunning, session.workingDirectory) +
      `\n当前会话: [${session.id}] ${session.name}\n` +
      `状态: ${busy}\n队列: ${this.messageQueue.length} 条指令\n` +
      `会话总数: ${this.sessionManager.sessionCount}`
    );
  }

  /**
   * /session - 显示当前会话详情
   */
  private async handleSessionInfoCommand(chatId: number): Promise<void> {
    const info = this.sessionManager.getCurrentSessionInfo();
    const session = this.sessionManager.getActiveSession();

    if (!info || !session) {
      await this.telegram.sendMessage(chatId, '暂无活跃会话');
      return;
    }

    const uptime = info.startTime
      ? Math.floor((Date.now() - info.startTime.getTime()) / 1000 / 60)
      : 0;

    await this.telegram.sendMessage(
      chatId,
      `📊 <b>会话信息</b>\n\n` +
      `<b>会话:</b> [${session.id}] ${session.name}\n` +
      `<b>工作目录:</b>\n<code>${session.workingDirectory}</code>\n\n` +
      `<b>Session ID:</b>\n<code>${info.sessionId || '未初始化'}</code>\n\n` +
      `<b>模型:</b> ${info.model || '未知'}\n` +
      `<b>消息数:</b> ${info.messageCount}\n` +
      `<b>运行时间:</b> ${uptime} 分钟\n\n` +
      `<b>Token 用量:</b>\n` +
      `  输入: ${formatNumber(info.totalInputTokens)}\n` +
      `  输出: ${formatNumber(info.totalOutputTokens)}\n\n` +
      `<b>累计费用:</b> $${info.totalCostUsd.toFixed(4)}`
    );
  }

  /**
   * 发送消息到当前会话
   */
  private async sendToSession(chatId: number, text: string): Promise<void> {
    const session = this.sessionManager.getActiveSession();

    if (!session) {
      await this.telegram.sendMessage(
        chatId,
        '⚠️ 暂无活跃会话\n使用 /new 创建新会话，或使用 /list 查看现有会话'
      );
      return;
    }

    if (!session.process.isRunning) {
      await this.telegram.sendMessage(chatId, '⚠️ 会话进程未运行，使用 /restart 重启');
      return;
    }

    try {
      await this.telegram.sendMessage(
        chatId,
        formatWithSessionTag(session.id, session.name, '📤 正在执行...')
      );
      await this.sessionManager.sendMessage(text);
    } catch (err) {
      await this.telegram.sendMessage(
        chatId,
        formatError(err instanceof Error ? err.message : String(err))
      );
    }
  }

  /**
   * 处理消息队列
   */
  private async processQueue(): Promise<void> {
    const session = this.sessionManager.getActiveSession();

    if (this.messageQueue.length === 0) {
      if (session) {
        await this.telegram.broadcast(
          formatWithSessionTag(session.id, session.name, '⏸ 任务完成，等待新指令')
        );
      }
      return;
    }

    const nextMessage = this.messageQueue.shift()!;
    const preview = nextMessage.length > 50
      ? nextMessage.slice(0, 50) + '...'
      : nextMessage;

    if (session) {
      await this.telegram.broadcast(
        formatWithSessionTag(session.id, session.name, `📋 处理队列: "${preview}"`)
      );
    }

    try {
      await this.sessionManager.sendMessage(nextMessage);
    } catch (err) {
      await this.telegram.broadcast(
        formatError(err instanceof Error ? err.message : String(err))
      );
      await this.processQueue();
    }
  }

  /**
   * 启动 Bridge
   */
  start(): void {
    logger.info(TAG, 'Bridge started (multi-session mode)');
    logger.info(TAG, 'Default working directory:', this.config.claude.workingDirectory);
    logger.info(TAG, 'Max sessions:', this.config.session?.maxSessions ?? 5);

    // 自动创建默认会话
    if (this.config.session?.autoCreateDefault !== false) {
      this.sessionManager.create({ name: '默认' });
      logger.info(TAG, 'Default session created');
    }
  }

  /**
   * 停止 Bridge
   */
  stop(): void {
    logger.info(TAG, 'Stopping bridge...');
    this.sessionManager.stopAll();
    this.telegram.stop();
  }
}
