/**
 * 共享类型定义
 */

/**
 * Claude 消息类型
 */
export interface ClaudeMessage {
  type: 'result';
  subtype: 'success' | 'error';
  result: string;
}

/**
 * Claude 会话信息
 */
export interface SessionInfo {
  sessionId: string | null;
  messageCount: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostUsd: number;
  startTime: Date | null;
  model: string | null;
}

/**
 * Claude 进程事件定义
 */
export interface ClaudeProcessEvents {
  message: (msg: ClaudeMessage) => void;
  done: () => void;
  error: (err: Error) => void;
  exit: (code: number) => void;
  ready: () => void;
}

/**
 * Telegram Bot 事件定义
 */
export interface TelegramBotEvents {
  message: (chatId: number, text: string) => void;
  command: (chatId: number, command: string, args: string) => void;
  error: (err: Error) => void;
}

/**
 * Claude CLI 的 stream-json 消息格式
 */
export interface StreamMessage {
  type: 'system' | 'assistant' | 'result' | 'user';
  subtype?: 'init' | 'success' | 'error';
  session_id?: string;
  model?: string;
  message?: {
    content?: Array<{ type: string; text?: string }>;
  };
  result?: string;
  duration_ms?: number;
  total_cost_usd?: number;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  };
}
