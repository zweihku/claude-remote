import { WebSocket, WebSocketServer } from 'ws';
import { RelayServer } from './server.js';

// Helper to wait for WebSocket to close
function waitForClose(ws: WebSocket): Promise<void> {
  return new Promise((resolve) => {
    if (ws.readyState === WebSocket.CLOSED) {
      resolve();
    } else {
      ws.on('close', () => resolve());
    }
  });
}

describe('RelayServer', () => {
  let server: RelayServer;
  const WS_PORT = 3099; // Use a different port to avoid conflicts

  beforeEach(() => {
    server = new RelayServer(WS_PORT);
  });

  afterEach(async () => {
    server.close();
    // Small delay to let cleanup complete
    await new Promise((resolve) => setTimeout(resolve, 50));
  });

  it('should start the WebSocket server', () => {
    expect(server).toBeDefined();
  });

  describe('authentication', () => {
    it('should authenticate a desktop client', async () => {
      const ws = new WebSocket(`ws://localhost:${WS_PORT}`);

      await new Promise<void>((resolve, reject) => {
        ws.on('open', () => {
          ws.send(JSON.stringify({ type: 'auth', token: 'device1:My Desktop:desktop' }));
        });

        ws.on('message', async (data) => {
          const message = JSON.parse(data.toString());
          if (message.type === 'auth_success') {
            expect(message.deviceId).toBe('device1');
            ws.close();
            await waitForClose(ws);
            resolve();
          }
        });

        ws.on('error', reject);
      });
    });

    it('should reject invalid token format', async () => {
      const ws = new WebSocket(`ws://localhost:${WS_PORT}`);

      await new Promise<void>((resolve, reject) => {
        ws.on('open', () => {
          ws.send(JSON.stringify({ type: 'auth', token: 'invalid' }));
        });

        ws.on('message', async (data) => {
          const message = JSON.parse(data.toString());
          if (message.type === 'auth_error') {
            expect(message.error).toBe('Invalid token format');
            ws.close();
            await waitForClose(ws);
            resolve();
          }
        });

        ws.on('error', reject);
      });
    });

    it('should reject invalid platform', async () => {
      const ws = new WebSocket(`ws://localhost:${WS_PORT}`);

      await new Promise<void>((resolve, reject) => {
        ws.on('open', () => {
          ws.send(JSON.stringify({ type: 'auth', token: 'device1:My Device:mobile' }));
        });

        ws.on('message', async (data) => {
          const message = JSON.parse(data.toString());
          if (message.type === 'auth_error') {
            expect(message.error).toBe('Invalid platform');
            ws.close();
            await waitForClose(ws);
            resolve();
          }
        });

        ws.on('error', reject);
      });
    });
  });

  describe('ping/pong', () => {
    it('should respond to ping with pong', async () => {
      const ws = new WebSocket(`ws://localhost:${WS_PORT}`);

      await new Promise<void>((resolve, reject) => {
        ws.on('open', () => {
          // First authenticate
          ws.send(JSON.stringify({ type: 'auth', token: 'device1:My Desktop:desktop' }));
        });

        let authenticated = false;
        ws.on('message', async (data) => {
          const message = JSON.parse(data.toString());
          if (message.type === 'auth_success') {
            authenticated = true;
            ws.send(JSON.stringify({ type: 'ping' }));
          } else if (message.type === 'pong' && authenticated) {
            ws.close();
            await waitForClose(ws);
            resolve();
          }
        });

        ws.on('error', reject);
      });
    });
  });

  describe('pairing', () => {
    it('should allow requesting and confirming pair codes', () => {
      const pairRequest = server.requestPairCode('desktop1', 'My Desktop', 'desktop');
      expect(pairRequest.pairCode).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);

      const pairConfirm = server.confirmPairCode(
        pairRequest.pairCode,
        'web1',
        'My Phone',
        'web'
      );
      expect(pairConfirm.success).toBe(true);
      expect(pairConfirm.pairId).toBeDefined();
    });
  });

  describe('message relay', () => {
    it('should relay messages between paired devices', async () => {
      // First set up the pairing
      const pairRequest = server.requestPairCode('desktop1', 'My Desktop', 'desktop');

      const desktopWs = new WebSocket(`ws://localhost:${WS_PORT}`);
      const webWs = new WebSocket(`ws://localhost:${WS_PORT}`);

      await new Promise<void>((resolve, reject) => {
        let desktopReady = false;
        let webReady = false;
        let paired = false;

        desktopWs.on('open', () => {
          desktopWs.send(JSON.stringify({ type: 'auth', token: 'desktop1:My Desktop:desktop' }));
        });

        webWs.on('open', () => {
          webWs.send(JSON.stringify({ type: 'auth', token: 'web1:My Phone:web' }));
        });

        desktopWs.on('message', async (data) => {
          const message = JSON.parse(data.toString());
          if (message.type === 'auth_success') {
            desktopReady = true;
            checkAndPair();
          } else if (message.type === 'paired') {
            paired = true;
          } else if (message.type === 'message') {
            expect(message.payload.content).toBe('Hello from web!');
            desktopWs.close();
            webWs.close();
            await Promise.all([waitForClose(desktopWs), waitForClose(webWs)]);
            resolve();
          }
        });

        webWs.on('message', (data) => {
          const message = JSON.parse(data.toString());
          if (message.type === 'auth_success') {
            webReady = true;
            checkAndPair();
          } else if (message.type === 'paired') {
            // Send a test message from web to desktop
            webWs.send(JSON.stringify({
              type: 'message',
              payload: { id: '1', content: 'Hello from web!', timestamp: Date.now() },
            }));
          }
        });

        function checkAndPair() {
          if (desktopReady && webReady && !paired) {
            server.confirmPairCode(pairRequest.pairCode, 'web1', 'My Phone', 'web');
          }
        }

        desktopWs.on('error', reject);
        webWs.on('error', reject);

        // Timeout
        setTimeout(() => reject(new Error('Test timeout')), 10000);
      });
    }, 15000);
  });
});
