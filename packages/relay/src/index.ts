import express from 'express';
import type { Request, Response } from 'express';
import { createServer } from 'http';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { networkInterfaces } from 'os';
import { RelayServer } from './server.js';
import type { PairRequest, PairConfirm, ApiResponse, PairResponse, PairResult } from '@claude-remote/shared';
import { DEFAULT_RELAY_PORT } from '@claude-remote/shared';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
app.use(express.json());

// Serve static files (web test page)
app.use(express.static(join(__dirname, '../public')));

const RELAY_PORT = parseInt(process.env.PORT || String(DEFAULT_RELAY_PORT));

// Create HTTP server
const httpServer = createServer(app);

// Initialize WebSocket relay server (attached to same HTTP server)
const relayServer = new RelayServer(httpServer);

// Health check
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

// Request a pair code
app.post('/api/pair/request', (req: Request, res: Response<ApiResponse<PairResponse>>) => {
  const body = req.body as PairRequest;

  if (!body.deviceId || !body.deviceName || !body.platform) {
    res.status(400).json({ success: false, error: 'Missing required fields' });
    return;
  }

  if (body.platform !== 'desktop' && body.platform !== 'web') {
    res.status(400).json({ success: false, error: 'Invalid platform' });
    return;
  }

  const result = relayServer.requestPairCode(body.deviceId, body.deviceName, body.platform);
  res.json({ success: true, data: result });
});

// Confirm a pair code
app.post('/api/pair/confirm', (req: Request, res: Response<ApiResponse<PairResult>>) => {
  const body = req.body as PairConfirm;
  console.log('[API] Pair confirm request:', body);

  if (!body.pairCode || !body.deviceId || !body.deviceName) {
    res.status(400).json({ success: false, error: 'Missing required fields' });
    return;
  }

  // Platform is inferred from device requesting confirmation
  const platform = 'web' as const; // Web devices confirm pair codes

  const result = relayServer.confirmPairCode(body.pairCode, body.deviceId, body.deviceName, platform);
  console.log('[API] Pair confirm result:', result);
  console.log('[API] Connected clients:', [...relayServer.getStore().clients.keys()]);
  res.json({ success: true, data: result });
});

// Get pair status
app.get('/api/pair/status', (req: Request, res: Response<ApiResponse<{ paired: boolean; pairId?: string }>>) => {
  const deviceId = req.query.deviceId as string;

  if (!deviceId) {
    res.status(400).json({ success: false, error: 'Missing deviceId' });
    return;
  }

  const store = relayServer.getStore();
  const client = store.clients.get(deviceId);

  if (!client) {
    res.json({ success: true, data: { paired: false } });
    return;
  }

  res.json({
    success: true,
    data: {
      paired: !!client.pairId,
      pairId: client.pairId || undefined,
    },
  });
});

// Get local IP address
function getLocalIP(): string {
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return 'localhost';
}

// Start the server (HTTP + WebSocket on same port)
httpServer.listen(RELAY_PORT, '0.0.0.0', () => {
  const localIP = getLocalIP();
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║           Claude Remote - Relay Server                   ║');
  console.log('╠══════════════════════════════════════════════════════════╣');
  console.log(`║  HTTP + WebSocket: http://localhost:${RELAY_PORT}                 ║`);
  console.log('╠══════════════════════════════════════════════════════════╣');
  console.log('║  手机访问地址:                                           ║');
  console.log(`║  http://${localIP}:${RELAY_PORT}`.padEnd(60) + '║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log('');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[API] Shutting down...');
  relayServer.close();
  process.exit(0);
});

export { app, relayServer };
