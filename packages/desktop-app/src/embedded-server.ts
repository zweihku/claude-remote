/**
 * Embedded Relay Server for Desktop App
 * Allows all-in-one local deployment without separate server
 */

import { createServer, IncomingMessage, ServerResponse } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import * as fs from 'fs';
import * as path from 'path';
import { networkInterfaces } from 'os';

const PAIR_CODE_LENGTH = 4;
const PAIR_CODE_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes
const WS_HEARTBEAT_INTERVAL_MS = 30000;

interface ConnectedClient {
  ws: WebSocket;
  deviceId: string;
  deviceName: string;
  platform: 'desktop' | 'web';
  pairId: string | null;
  lastPing: number;
}

interface PendingPair {
  pairCode: string;
  deviceId: string;
  deviceName: string;
  platform: 'desktop' | 'web';
  expiresAt: number;
}

interface Room {
  pairId: string;
  desktopDeviceId: string | null;
  webDeviceId: string | null;
  createdAt: number;
}

interface ConnectionStore {
  clients: Map<string, ConnectedClient>;
  pendingPairs: Map<string, PendingPair>;
  rooms: Map<string, Room>;
}

function generatePairCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < PAIR_CODE_LENGTH; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function getLocalIP(): string {
  const interfaces = networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

export class EmbeddedServer {
  private server: ReturnType<typeof createServer> | null = null;
  private wss: WebSocketServer | null = null;
  private store: ConnectionStore;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private port: number;
  private mobileHtmlPath: string;

  constructor(port: number = 4000) {
    this.port = port;
    this.store = {
      clients: new Map(),
      pendingPairs: new Map(),
      rooms: new Map(),
    };
    // Path to mobile web UI
    this.mobileHtmlPath = path.join(__dirname, '../assets/mobile.html');
  }

  start(): Promise<{ port: number; localIP: string }> {
    return new Promise((resolve, reject) => {
      this.server = createServer((req, res) => this.handleHTTP(req, res));

      this.wss = new WebSocketServer({ server: this.server });
      this.setupWebSocket();
      this.startHeartbeat();

      this.server.listen(this.port, '0.0.0.0', () => {
        const localIP = getLocalIP();
        console.log(`[EmbeddedServer] Running on http://${localIP}:${this.port}`);
        resolve({ port: this.port, localIP });
      });

      this.server.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE') {
          reject(new Error(`Port ${this.port} is already in use`));
        } else {
          reject(err);
        }
      });
    });
  }

  stop(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
    if (this.wss) {
      this.wss.close();
    }
    if (this.server) {
      this.server.close();
    }
  }

  private handleHTTP(req: IncomingMessage, res: ServerResponse): void {
    const url = req.url || '/';

    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    // API routes
    if (url.startsWith('/api/')) {
      this.handleAPI(req, res);
      return;
    }

    // Serve mobile web UI
    this.serveMobileUI(res);
  }

  private handleAPI(req: IncomingMessage, res: ServerResponse): void {
    const url = req.url || '';

    if (url === '/api/pair/request' && req.method === 'POST') {
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', () => {
        try {
          const { deviceId, deviceName, platform } = JSON.parse(body);
          const result = this.requestPairCode(deviceId, deviceName, platform);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, data: result }));
        } catch (error) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Invalid request' }));
        }
      });
      return;
    }

    if (url === '/api/pair/confirm' && req.method === 'POST') {
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', () => {
        try {
          const { pairCode, deviceId, deviceName, platform } = JSON.parse(body);
          const result = this.confirmPairCode(pairCode, deviceId, deviceName, platform);

          if (result.success && result.pairId) {
            this.notifyPairing(result.pairId);
          }

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, data: result }));
        } catch (error) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Invalid request' }));
        }
      });
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  }

  private serveMobileUI(res: ServerResponse): void {
    // Check if mobile.html exists
    if (fs.existsSync(this.mobileHtmlPath)) {
      const html = fs.readFileSync(this.mobileHtmlPath, 'utf-8');
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(html);
    } else {
      // Fallback simple page
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Claude Remote</title>
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <style>
            body { font-family: system-ui; padding: 20px; background: #1a1a2e; color: #fff; }
            h1 { color: #ff8a65; }
          </style>
        </head>
        <body>
          <h1>Claude Remote</h1>
          <p>Mobile UI file not found. Please ensure mobile.html is in the assets folder.</p>
        </body>
        </html>
      `);
    }
  }

  private setupWebSocket(): void {
    if (!this.wss) return;

    this.wss.on('connection', (ws: WebSocket) => {
      console.log('[EmbeddedServer] New WebSocket connection');

      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleWSMessage(ws, message);
        } catch (error) {
          this.sendToWS(ws, { type: 'error', error: 'Invalid message format' });
        }
      });

      ws.on('close', () => {
        this.handleDisconnect(ws);
      });
    });
  }

  private handleWSMessage(ws: WebSocket, message: any): void {
    switch (message.type) {
      case 'auth':
        this.handleAuth(ws, message.token);
        break;
      case 'ping':
        this.handlePing(ws);
        break;
      case 'rejoin':
        this.handleRejoin(ws, message.pairId);
        break;
      case 'message':
      case 'session_list':
      case 'session_create':
      case 'session_created':
      case 'session_switch':
      case 'session_switched':
      case 'session_delete':
      case 'session_deleted':
      case 'session_error':
        this.relayMessage(ws, message);
        break;
    }
  }

  private handleRejoin(ws: WebSocket, pairId: string): void {
    const client = this.findClientByWs(ws);
    if (!client) {
      this.sendToWS(ws, { type: 'rejoin_failed', error: 'Not authenticated' });
      return;
    }

    const room = this.store.rooms.get(pairId);
    if (!room) {
      this.sendToWS(ws, { type: 'rejoin_failed', error: 'Room not found' });
      return;
    }

    // Check if this device was part of the room
    const isDesktop = room.desktopDeviceId === client.deviceId;
    const isWeb = room.webDeviceId === client.deviceId;

    if (!isDesktop && !isWeb) {
      this.sendToWS(ws, { type: 'rejoin_failed', error: 'Device not in room' });
      return;
    }

    // Rejoin successful
    client.pairId = pairId;
    console.log(`[EmbeddedServer] Device ${client.deviceId} rejoined room ${pairId}`);

    // Check if paired device is online
    const pairedDeviceId = isDesktop ? room.webDeviceId : room.desktopDeviceId;
    const pairedClient = pairedDeviceId ? this.store.clients.get(pairedDeviceId) : null;

    if (pairedClient && pairedClient.pairId === pairId) {
      this.sendToWS(ws, { type: 'paired', pairId });
      this.sendToWS(pairedClient.ws, { type: 'paired', pairId });
    } else {
      this.sendToWS(ws, { type: 'rejoin_success', pairId, peerOnline: false });
    }
  }

  private handleAuth(ws: WebSocket, token: string): void {
    const parts = token.split(':');
    if (parts.length < 3) {
      this.sendToWS(ws, { type: 'auth_error', error: 'Invalid token format' });
      return;
    }

    const [deviceId, deviceName, platformStr] = parts;
    const platform = platformStr as 'desktop' | 'web';

    // Remove existing connection for this device
    const existing = this.store.clients.get(deviceId);
    if (existing) {
      existing.ws.close();
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
    console.log(`[EmbeddedServer] Device authenticated: ${deviceId} (${platform}), total clients: ${this.store.clients.size}`);
    this.sendToWS(ws, { type: 'auth_success', deviceId });
  }

  private handlePing(ws: WebSocket): void {
    const client = this.findClientByWs(ws);
    if (client) {
      client.lastPing = Date.now();
    }
    this.sendToWS(ws, { type: 'pong' });
  }

  private relayMessage(ws: WebSocket, message: any): void {
    const client = this.findClientByWs(ws);
    if (!client) {
      console.log(`[EmbeddedServer] relayMessage: client not found`);
      return;
    }
    if (!client.pairId) {
      console.log(`[EmbeddedServer] relayMessage: client ${client.deviceId} has no pairId`);
      return;
    }

    const pairedDeviceId = this.getPairedDevice(client.deviceId);
    if (!pairedDeviceId) {
      console.log(`[EmbeddedServer] relayMessage: no paired device for ${client.deviceId}`);
      return;
    }

    const pairedClient = this.store.clients.get(pairedDeviceId);
    if (pairedClient) {
      console.log(`[EmbeddedServer] Relaying ${message.type} from ${client.deviceId} to ${pairedDeviceId}`);
      this.sendToWS(pairedClient.ws, message);
    } else {
      console.log(`[EmbeddedServer] Paired client ${pairedDeviceId} not connected`);
    }
  }

  private handleDisconnect(ws: WebSocket): void {
    const client = this.findClientByWs(ws);
    if (client) {
      console.log(`[EmbeddedServer] Device disconnected: ${client.deviceId} (pairId: ${client.pairId})`);

      if (client.pairId) {
        const pairedDeviceId = this.getPairedDevice(client.deviceId);
        if (pairedDeviceId) {
          const pairedClient = this.store.clients.get(pairedDeviceId);
          if (pairedClient) {
            this.sendToWS(pairedClient.ws, { type: 'peer_offline' });
          }
        }
      }

      this.store.clients.delete(client.deviceId);
    }
  }

  private findClientByWs(ws: WebSocket): ConnectedClient | undefined {
    for (const client of this.store.clients.values()) {
      if (client.ws === ws) return client;
    }
    return undefined;
  }

  private sendToWS(ws: WebSocket, message: any): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  private requestPairCode(
    deviceId: string,
    deviceName: string,
    platform: 'desktop' | 'web'
  ): { pairCode: string; expiresAt: number } {
    // Remove existing pending pairs for this device
    for (const [code, pair] of this.store.pendingPairs.entries()) {
      if (pair.deviceId === deviceId) {
        this.store.pendingPairs.delete(code);
      }
    }

    const pairCode = generatePairCode();
    const expiresAt = Date.now() + PAIR_CODE_EXPIRY_MS;

    this.store.pendingPairs.set(pairCode, {
      pairCode,
      deviceId,
      deviceName,
      platform,
      expiresAt,
    });

    return { pairCode, expiresAt };
  }

  private confirmPairCode(
    pairCode: string,
    deviceId: string,
    deviceName: string,
    platform: 'desktop' | 'web'
  ): { success: boolean; pairId?: string; error?: string } {
    const normalizedCode = pairCode.toUpperCase().replace(/[^A-Z0-9]/g, '');

    const pendingPair = this.store.pendingPairs.get(normalizedCode);

    if (!pendingPair) {
      return { success: false, error: 'Invalid pair code' };
    }

    if (Date.now() > pendingPair.expiresAt) {
      this.store.pendingPairs.delete(normalizedCode);
      return { success: false, error: 'Pair code expired' };
    }

    if (pendingPair.platform === platform) {
      return { success: false, error: 'Cannot pair same device types' };
    }

    const pairId = generateUUID();

    // Determine which device is desktop and which is web
    const isConfirmerWeb = platform === 'web';
    const desktopId = isConfirmerWeb ? pendingPair.deviceId : deviceId;
    const webId = isConfirmerWeb ? deviceId : pendingPair.deviceId;

    console.log(`[EmbeddedServer] Creating room: confirmer platform=${platform}, pendingPair.platform=${pendingPair.platform}`);
    console.log(`[EmbeddedServer] pendingPair.deviceId=${pendingPair.deviceId}, confirmer deviceId=${deviceId}`);
    console.log(`[EmbeddedServer] Assigning: desktopId=${desktopId}, webId=${webId}`);

    const room: Room = {
      pairId,
      desktopDeviceId: desktopId,
      webDeviceId: webId,
      createdAt: Date.now(),
    };

    this.store.rooms.set(pairId, room);
    this.store.pendingPairs.delete(normalizedCode);

    // Update clients with pairId
    const initiatorClient = this.store.clients.get(pendingPair.deviceId);
    if (initiatorClient) {
      initiatorClient.pairId = pairId;
      console.log(`[EmbeddedServer] Set pairId for initiator ${pendingPair.deviceId}`);
    } else {
      console.log(`[EmbeddedServer] Warning: initiator client ${pendingPair.deviceId} not found`);
    }

    const confirmingClient = this.store.clients.get(deviceId);
    if (confirmingClient) {
      confirmingClient.pairId = pairId;
      console.log(`[EmbeddedServer] Set pairId for confirmer ${deviceId}`);
    } else {
      console.log(`[EmbeddedServer] Warning: confirming client ${deviceId} not found`);
    }

    console.log(`[EmbeddedServer] Pairing complete: ${pairId}, room created with desktop=${room.desktopDeviceId}, web=${room.webDeviceId}`);
    return { success: true, pairId };
  }

  private notifyPairing(pairId: string): void {
    const room = this.store.rooms.get(pairId);
    if (!room) return;

    const deviceIds = [room.desktopDeviceId, room.webDeviceId].filter(Boolean);
    for (const id of deviceIds) {
      const client = this.store.clients.get(id!);
      if (client) {
        this.sendToWS(client.ws, { type: 'paired', pairId });
      }
    }
  }

  private getPairedDevice(deviceId: string): string | null {
    const client = this.store.clients.get(deviceId);
    if (!client?.pairId) return null;

    const room = this.store.rooms.get(client.pairId);
    if (!room) return null;

    return room.desktopDeviceId === deviceId
      ? room.webDeviceId
      : room.desktopDeviceId;
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      const now = Date.now();
      const timeout = WS_HEARTBEAT_INTERVAL_MS * 2;

      for (const [deviceId, client] of this.store.clients.entries()) {
        if (now - client.lastPing > timeout) {
          console.log(`[EmbeddedServer] Client ${deviceId} timed out`);
          client.ws.close();
          this.store.clients.delete(deviceId);
        }
      }

      // Clean up expired pairs
      for (const [code, pair] of this.store.pendingPairs.entries()) {
        if (now > pair.expiresAt) {
          this.store.pendingPairs.delete(code);
        }
      }
    }, WS_HEARTBEAT_INTERVAL_MS);
  }
}
