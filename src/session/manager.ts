/**
 * 会话管理器 - 管理多个 Claude 会话
 */

import { EventEmitter } from 'events';
import { ClaudeProcess } from '../bridge/claude-process.js';
import { LOG_TAGS } from '../constants.js';
import { logger } from '../utils/logger.js';
import type {
  Session,
  SessionConfig,
  CreateSessionOptions,
  SessionListItem,
} from './types.js';

const TAG = LOG_TAGS.BRIDGE;

export class SessionManager extends EventEmitter {
  private sessions: Map<number, Session> = new Map();
  private activeSessionId: number | null = null;
  private nextId = 1;
  private config: SessionConfig;

  constructor(config: SessionConfig) {
    super();
    this.config = config;
  }

  /**
   * 创建新会话
   */
  create(options: CreateSessionOptions = {}): Session {
    // 检查会话数量限制
    if (this.sessions.size >= this.config.maxSessions) {
      throw new Error(`已达到最大会话数限制 (${this.config.maxSessions})`);
    }

    const id = this.nextId++;
    const name = options.name || `会话${id}`;
    const workingDirectory = options.workingDirectory || this.config.defaultWorkingDirectory;

    // 创建 ClaudeProcess
    const process = new ClaudeProcess({
      workingDirectory,
      additionalArgs: this.config.additionalArgs || [],
      cliPath: this.config.cliPath,
    });

    const session: Session = {
      id,
      name,
      workingDirectory,
      process,
      status: 'idle',
      createdAt: new Date(),
      lastActiveAt: new Date(),
    };

    // 设置进程事件处理
    this.setupProcessHandlers(session);

    // 保存会话
    this.sessions.set(id, session);

    // 启动进程
    process.start();

    logger.info(TAG, `创建会话 [${id}] ${name}, 工作目录: ${workingDirectory}`);
    this.emit('sessionCreated', session);

    // 如果是第一个会话，自动激活
    if (this.activeSessionId === null) {
      this.activeSessionId = id;
    }

    return session;
  }

  /**
   * 设置进程事件处理器
   */
  private setupProcessHandlers(session: Session): void {
    const { id, process } = session;

    process.on('message', (msg) => {
      session.status = 'idle';
      session.lastActiveAt = new Date();
      this.emit('sessionMessage', id, msg);
    });

    process.on('done', () => {
      session.status = 'idle';
      this.emit('sessionDone', id);
    });

    process.on('error', (err) => {
      session.status = 'idle';
      this.emit('sessionError', id, err);
    });

    process.on('ready', () => {
      this.emit('sessionReady', id);
    });

    process.on('exit', (code) => {
      logger.warn(TAG, `会话 [${id}] 进程退出, code: ${code}`);
      // ClaudeProcess 会自动重启，不需要额外处理
    });
  }

  /**
   * 切换到指定会话
   */
  switch(idOrName: number | string): Session {
    const session = this.findSession(idOrName);
    if (!session) {
      throw new Error(`会话不存在: ${idOrName}`);
    }

    const previousSession = this.getActiveSession();
    this.activeSessionId = session.id;
    session.lastActiveAt = new Date();

    logger.info(TAG, `切换到会话 [${session.id}] ${session.name}`);
    this.emit('sessionSwitched', previousSession, session);

    return session;
  }

  /**
   * 关闭会话
   */
  close(id?: number): Session {
    const targetId = id ?? this.activeSessionId;
    if (targetId === null) {
      throw new Error('没有可关闭的会话');
    }

    const session = this.sessions.get(targetId);
    if (!session) {
      throw new Error(`会话不存在: ${targetId}`);
    }

    // 停止进程
    session.process.stop();
    session.status = 'stopped';

    // 从列表中移除
    this.sessions.delete(targetId);

    // 如果关闭的是当前会话，切换到其他会话
    if (this.activeSessionId === targetId) {
      const remaining = Array.from(this.sessions.keys());
      this.activeSessionId = remaining.length > 0 ? remaining[0] : null;
    }

    logger.info(TAG, `关闭会话 [${targetId}] ${session.name}`);
    this.emit('sessionClosed', session);

    return session;
  }

  /**
   * 重命名当前会话
   */
  rename(name: string): Session {
    const session = this.getActiveSession();
    if (!session) {
      throw new Error('没有活跃的会话');
    }

    const oldName = session.name;
    session.name = name;
    logger.info(TAG, `重命名会话 [${session.id}] ${oldName} -> ${name}`);

    return session;
  }

  /**
   * 获取所有会话列表
   */
  list(): SessionListItem[] {
    const result: SessionListItem[] = [];

    for (const session of this.sessions.values()) {
      const runningMinutes = Math.floor(
        (Date.now() - session.createdAt.getTime()) / 1000 / 60
      );

      result.push({
        id: session.id,
        name: session.name,
        workingDirectory: session.workingDirectory,
        status: session.process.isBusy ? 'busy' : session.status,
        isActive: session.id === this.activeSessionId,
        messageCount: session.process.getSessionInfo().messageCount,
        runningMinutes,
      });
    }

    // 按 ID 排序
    return result.sort((a, b) => a.id - b.id);
  }

  /**
   * 发送消息到当前活跃会话
   */
  async sendMessage(text: string): Promise<void> {
    const session = this.getActiveSession();
    if (!session) {
      throw new Error('没有活跃的会话，请先创建会话');
    }

    if (!session.process.isRunning) {
      throw new Error('会话进程未运行');
    }

    session.status = 'busy';
    session.lastActiveAt = new Date();
    await session.process.sendMessage(text);
  }

  /**
   * 获取当前活跃会话
   */
  getActiveSession(): Session | null {
    if (this.activeSessionId === null) {
      return null;
    }
    return this.sessions.get(this.activeSessionId) || null;
  }

  /**
   * 获取当前活跃会话 ID
   */
  getActiveSessionId(): number | null {
    return this.activeSessionId;
  }

  /**
   * 检查当前会话是否繁忙
   */
  isCurrentBusy(): boolean {
    const session = this.getActiveSession();
    return session?.process.isBusy ?? false;
  }

  /**
   * 停止当前会话的任务
   */
  forceStopCurrent(): void {
    const session = this.getActiveSession();
    if (session) {
      session.process.forceStop();
      session.status = 'idle';
    }
  }

  /**
   * 重启当前会话
   */
  restartCurrent(): void {
    const session = this.getActiveSession();
    if (session) {
      session.process.restart();
    }
  }

  /**
   * 获取当前会话信息
   */
  getCurrentSessionInfo() {
    const session = this.getActiveSession();
    return session?.process.getSessionInfo() ?? null;
  }

  /**
   * 查找会话（按 ID 或名称）
   */
  private findSession(idOrName: number | string): Session | null {
    // 按 ID 查找
    if (typeof idOrName === 'number') {
      return this.sessions.get(idOrName) || null;
    }

    // 尝试解析为数字
    const numId = parseInt(idOrName, 10);
    if (!isNaN(numId)) {
      return this.sessions.get(numId) || null;
    }

    // 按名称查找
    for (const session of this.sessions.values()) {
      if (session.name === idOrName) {
        return session;
      }
    }

    return null;
  }

  /**
   * 获取会话数量
   */
  get sessionCount(): number {
    return this.sessions.size;
  }

  /**
   * 停止所有会话
   */
  stopAll(): void {
    for (const session of this.sessions.values()) {
      session.process.stop();
    }
    this.sessions.clear();
    this.activeSessionId = null;
    logger.info(TAG, '所有会话已停止');
  }
}
