// WebSocket Message Types
export type WSMessage =
  | { type: 'auth'; token: string }
  | { type: 'auth_success'; deviceId: string }
  | { type: 'auth_error'; error: string }
  | { type: 'paired'; pairId: string }
  | { type: 'unpaired' }
  | { type: 'message'; payload: MessagePayload }
  | { type: 'ping' }
  | { type: 'pong' }
  | { type: 'error'; error: string }
  // Reconnection support
  | { type: 'rejoin'; pairId: string }
  | { type: 'rejoin_success'; pairId: string; peerOnline: boolean }
  | { type: 'rejoin_failed'; error: string }
  | { type: 'peer_offline' }
  // Session management
  | { type: 'session_list'; sessions: Session[]; activeSessionId: string | null }
  | { type: 'session_create'; workingDirectory?: string; name?: string }
  | { type: 'session_created'; session: Session }
  | { type: 'session_switch'; sessionId: string }
  | { type: 'session_switched'; session: Session }
  | { type: 'session_delete'; sessionId: string }
  | { type: 'session_deleted'; sessionId: string }
  | { type: 'session_error'; error: string };

export interface MessagePayload {
  id: string;
  content: string;
  timestamp: number;
  sessionId: string;  // 必须指定会话 ID
}

// Desktop session configuration
export interface SessionConfig {
  allowedDirectories: string[];  // 允许的工作目录列表
  defaultDirectory: string;      // 默认工作目录
}

// Pairing Types
export interface PairRequest {
  deviceId: string;
  deviceName: string;
  platform: 'desktop' | 'web';
}

export interface PairResponse {
  pairCode: string;
  expiresAt: number;
}

export interface PairConfirm {
  pairCode: string;
  deviceId: string;
  deviceName: string;
}

export interface PairResult {
  success: boolean;
  pairId?: string;
  error?: string;
}

// Device Types
export interface Device {
  id: string;
  name: string;
  platform: 'desktop' | 'web';
  lastSeen: number;
  connected: boolean;
}

// Session Types
export interface Session {
  id: string;
  name: string;
  workingDirectory: string;
  createdAt: number;
  lastActiveAt: number;
  claudeSessionId?: string;  // Claude CLI 内部会话 ID，用于 --resume
  messageCount: number;      // 消息数量
}

// Claude Message Types
export interface ClaudeMessage {
  type: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
}

export interface ClaudeResponse {
  sessionId: string;
  message: ClaudeMessage;
  isComplete: boolean;
}

// API Response Types
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}
