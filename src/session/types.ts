/**
 * 会话相关类型定义
 */

import type { ClaudeProcess } from '../bridge/claude-process.js';
import type { ClaudeMessage } from '../types.js';

/**
 * 会话状态
 */
export type SessionStatus = 'idle' | 'busy' | 'stopped';

/**
 * 会话实例
 */
export interface Session {
  id: number;
  name: string;
  workingDirectory: string;
  process: ClaudeProcess;
  status: SessionStatus;
  createdAt: Date;
  lastActiveAt: Date;
}

/**
 * 会话配置
 */
export interface SessionConfig {
  maxSessions: number;
  defaultWorkingDirectory: string;
  cliPath?: string;
  additionalArgs?: string[];
}

/**
 * 会话创建选项
 */
export interface CreateSessionOptions {
  name?: string;
  workingDirectory?: string;
}

/**
 * 会话信息（用于展示）
 */
export interface SessionListItem {
  id: number;
  name: string;
  workingDirectory: string;
  status: SessionStatus;
  isActive: boolean;
  messageCount: number;
  runningMinutes: number;
}

/**
 * SessionManager 事件
 */
export interface SessionManagerEvents {
  sessionCreated: (session: Session) => void;
  sessionSwitched: (from: Session | null, to: Session) => void;
  sessionClosed: (session: Session) => void;
  sessionMessage: (sessionId: number, msg: ClaudeMessage) => void;
  sessionDone: (sessionId: number) => void;
  sessionError: (sessionId: number, err: Error) => void;
  sessionReady: (sessionId: number) => void;
}
