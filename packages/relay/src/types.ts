import { WebSocket } from 'ws';

export interface ConnectedClient {
  ws: WebSocket;
  deviceId: string;
  deviceName: string;
  platform: 'desktop' | 'web';
  pairId: string | null;
  lastPing: number;
}

export interface PendingPair {
  pairCode: string;
  deviceId: string;
  deviceName: string;
  platform: 'desktop' | 'web';
  expiresAt: number;
}

export interface Room {
  pairId: string;
  desktopDeviceId: string | null;
  webDeviceId: string | null;
  createdAt: number;
}

export interface ConnectionStore {
  clients: Map<string, ConnectedClient>;
  pendingPairs: Map<string, PendingPair>;
  rooms: Map<string, Room>;
}
