// Pairing Constants
export const PAIR_CODE_LENGTH = 8;
export const PAIR_CODE_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes

// WebSocket Constants
export const WS_HEARTBEAT_INTERVAL_MS = 30 * 1000; // 30 seconds
export const WS_RECONNECT_DELAY_MS = 1000; // 1 second
export const WS_MAX_RECONNECT_ATTEMPTS = 10;

// Message Constants
export const MAX_MESSAGE_LENGTH = 100000; // 100KB

// API Endpoints
export const API_ENDPOINTS = {
  PAIR_REQUEST: '/api/pair/request',
  PAIR_CONFIRM: '/api/pair/confirm',
  PAIR_STATUS: '/api/pair/status',
} as const;

// Default Ports
export const DEFAULT_RELAY_PORT = 4000;
export const DEFAULT_WS_PORT = 4001;
