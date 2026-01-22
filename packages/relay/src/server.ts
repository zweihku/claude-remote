import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage, Server as HttpServer } from 'http';
import type { WSMessage } from '@claude-remote/shared';
import { WS_HEARTBEAT_INTERVAL_MS } from '@claude-remote/shared';
import type { ConnectedClient, ConnectionStore } from './types.js';
import { PairingService } from './pairing.js';

export class RelayServer {
  private wss: WebSocketServer;
  private store: ConnectionStore;
  private pairingService: PairingService;
  private heartbeatInterval: NodeJS.Timeout | null = null;

  // Constructor now accepts an HTTP server to attach WebSocket to same port
  constructor(httpServer?: HttpServer) {
    this.store = {
      clients: new Map(),
      pendingPairs: new Map(),
      rooms: new Map(),
    };

    this.pairingService = new PairingService(this.store);

    // Attach to existing HTTP server (same port) or create standalone
    if (httpServer) {
      this.wss = new WebSocketServer({ server: httpServer });
      console.log(`[Relay] WebSocket attached to HTTP server`);
    } else {
      this.wss = new WebSocketServer({ port: 4001, host: '0.0.0.0' });
      console.log(`[Relay] WebSocket server started on standalone port 4001`);
    }

    this.setupServer();
    this.startHeartbeat();
  }

  private setupServer(): void {
    this.wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
      console.log('[Relay] New connection');

      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString()) as WSMessage;
          this.handleMessage(ws, message);
        } catch (error) {
          console.error('[Relay] Failed to parse message:', error);
          this.sendMessage(ws, { type: 'error', error: 'Invalid message format' });
        }
      });

      ws.on('close', () => {
        this.handleDisconnect(ws);
      });

      ws.on('error', (error) => {
        console.error('[Relay] WebSocket error:', error);
      });
    });
  }

  private handleMessage(ws: WebSocket, message: WSMessage): void {
    switch (message.type) {
      case 'auth':
        this.handleAuth(ws, message.token);
        break;
      case 'ping':
        this.handlePing(ws);
        break;
      case 'message':
        this.handleRelayMessage(ws, message);
        break;
      case 'rejoin':
        this.handleRejoin(ws, (message as any).pairId);
        break;
      // Session management messages - relay directly
      case 'session_list':
      case 'session_create':
      case 'session_created':
      case 'session_switch':
      case 'session_switched':
      case 'session_delete':
      case 'session_deleted':
      case 'session_error':
        this.handleRelaySessionMessage(ws, message);
        break;
      default:
        console.warn('[Relay] Unknown message type:', (message as any).type);
    }
  }

  private handleAuth(ws: WebSocket, token: string): void {
    // Parse token (format: deviceId:deviceName:platform)
    const parts = token.split(':');
    if (parts.length < 3) {
      this.sendMessage(ws, { type: 'auth_error', error: 'Invalid token format' });
      return;
    }

    const [deviceId, deviceName, platformStr] = parts;
    const platform = platformStr as 'desktop' | 'web';

    if (platform !== 'desktop' && platform !== 'web') {
      this.sendMessage(ws, { type: 'auth_error', error: 'Invalid platform' });
      return;
    }

    // Check if device already connected
    const existingClient = this.store.clients.get(deviceId);
    if (existingClient) {
      existingClient.ws.close();
    }

    const client: ConnectedClient = {
      ws,
      deviceId,
      deviceName,
      platform,
      pairId: null,
      lastPing: Date.now(),
    };

    this.store.clients.set(deviceId, client);
    console.log(`[Relay] Device authenticated: ${deviceId} (${platform})`);

    this.sendMessage(ws, { type: 'auth_success', deviceId });
  }

  private handlePing(ws: WebSocket): void {
    const client = this.findClientByWs(ws);
    if (client) {
      client.lastPing = Date.now();
    }
    this.sendMessage(ws, { type: 'pong' });
  }

  private handleRejoin(ws: WebSocket, pairId: string): void {
    const client = this.findClientByWs(ws);
    if (!client) {
      this.sendMessage(ws, { type: 'rejoin_failed', error: 'Not authenticated' });
      return;
    }

    // Check if the room still exists
    const room = this.store.rooms.get(pairId);
    if (!room) {
      console.log(`[Relay] Rejoin failed: room ${pairId} not found`);
      this.sendMessage(ws, { type: 'rejoin_failed', error: 'Room not found' });
      return;
    }

    // Check if this device was part of the room
    const isDesktop = room.desktopDeviceId === client.deviceId;
    const isWeb = room.webDeviceId === client.deviceId;

    if (!isDesktop && !isWeb) {
      console.log(`[Relay] Rejoin failed: device ${client.deviceId} not in room ${pairId}`);
      this.sendMessage(ws, { type: 'rejoin_failed', error: 'Device not in room' });
      return;
    }

    // Rejoin successful
    client.pairId = pairId;
    console.log(`[Relay] Device ${client.deviceId} rejoined room ${pairId}`);

    // Check if the paired device is online
    const pairedDeviceId = isDesktop ? room.webDeviceId : room.desktopDeviceId;
    const pairedClient = pairedDeviceId ? this.store.clients.get(pairedDeviceId) : null;

    if (pairedClient && pairedClient.pairId === pairId) {
      // Both devices are now connected, notify both
      this.sendMessage(ws, { type: 'paired', pairId });
      this.sendMessage(pairedClient.ws, { type: 'paired', pairId });
    } else {
      // Paired device not online yet
      this.sendMessage(ws, { type: 'rejoin_success', pairId, peerOnline: false });
    }
  }

  private handleRelayMessage(ws: WebSocket, message: WSMessage & { type: 'message' }): void {
    const client = this.findClientByWs(ws);
    if (!client) {
      this.sendMessage(ws, { type: 'error', error: 'Not authenticated' });
      return;
    }

    if (!client.pairId) {
      this.sendMessage(ws, { type: 'error', error: 'Not paired' });
      return;
    }

    const pairedDeviceId = this.pairingService.getPairedDevice(client.deviceId);
    if (!pairedDeviceId) {
      this.sendMessage(ws, { type: 'error', error: 'Paired device not found' });
      return;
    }

    const pairedClient = this.store.clients.get(pairedDeviceId);
    if (!pairedClient) {
      this.sendMessage(ws, { type: 'error', error: 'Paired device offline' });
      return;
    }

    // Relay the message to the paired device
    this.sendMessage(pairedClient.ws, message);
  }

  private handleRelaySessionMessage(ws: WebSocket, message: WSMessage): void {
    const client = this.findClientByWs(ws);
    if (!client) {
      this.sendMessage(ws, { type: 'error', error: 'Not authenticated' });
      return;
    }

    if (!client.pairId) {
      this.sendMessage(ws, { type: 'error', error: 'Not paired' });
      return;
    }

    const pairedDeviceId = this.pairingService.getPairedDevice(client.deviceId);
    if (!pairedDeviceId) {
      return; // Silent fail for session messages when peer is not connected
    }

    const pairedClient = this.store.clients.get(pairedDeviceId);
    if (!pairedClient) {
      return; // Silent fail for session messages when peer is offline
    }

    // Relay the session message to the paired device
    console.log(`[Relay] Session message ${message.type} from ${client.deviceId} to ${pairedDeviceId}`);
    this.sendMessage(pairedClient.ws, message);
  }

  private handleDisconnect(ws: WebSocket): void {
    const client = this.findClientByWs(ws);
    if (client) {
      console.log(`[Relay] Device disconnected: ${client.deviceId}`);

      // Notify paired device (but don't destroy the room - allow reconnection)
      if (client.pairId) {
        const pairedDeviceId = this.pairingService.getPairedDevice(client.deviceId);
        if (pairedDeviceId) {
          const pairedClient = this.store.clients.get(pairedDeviceId);
          if (pairedClient) {
            // Send peer_offline instead of unpaired to allow reconnection
            this.sendMessage(pairedClient.ws, { type: 'peer_offline' });
          }
        }
      }

      // Remove client but keep the room for potential reconnection
      this.store.clients.delete(client.deviceId);
    }
  }

  private findClientByWs(ws: WebSocket): ConnectedClient | undefined {
    for (const client of this.store.clients.values()) {
      if (client.ws === ws) {
        return client;
      }
    }
    return undefined;
  }

  private sendMessage(ws: WebSocket, message: WSMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      const now = Date.now();
      const timeout = WS_HEARTBEAT_INTERVAL_MS * 2;

      for (const [deviceId, client] of this.store.clients.entries()) {
        if (now - client.lastPing > timeout) {
          console.log(`[Relay] Client ${deviceId} timed out`);
          client.ws.close();
          this.store.clients.delete(deviceId);
        }
      }

      // Clean up expired pending pairs
      this.pairingService.cleanupExpiredPairs();
    }, WS_HEARTBEAT_INTERVAL_MS);
  }

  // Public methods for HTTP API

  public requestPairCode(
    deviceId: string,
    deviceName: string,
    platform: 'desktop' | 'web'
  ): { pairCode: string; expiresAt: number } {
    return this.pairingService.requestPairCode(deviceId, deviceName, platform);
  }

  public confirmPairCode(
    pairCode: string,
    deviceId: string,
    deviceName: string,
    platform: 'desktop' | 'web'
  ): { success: boolean; pairId?: string; error?: string } {
    const result = this.pairingService.confirmPairCode(
      pairCode,
      deviceId,
      deviceName,
      platform
    );

    // Notify both devices about successful pairing
    if (result.success && result.pairId) {
      const room = this.store.rooms.get(result.pairId);
      if (room) {
        const notifyDevices = [room.desktopDeviceId, room.webDeviceId].filter(Boolean);
        for (const id of notifyDevices) {
          const client = this.store.clients.get(id!);
          if (client) {
            this.sendMessage(client.ws, { type: 'paired', pairId: result.pairId });
          }
        }
      }
    }

    return result;
  }

  public getStore(): ConnectionStore {
    return this.store;
  }

  public close(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
    this.wss.close();
  }
}
