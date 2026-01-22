import { generatePairCode, PairingService } from './pairing.js';
import type { ConnectionStore } from './types.js';

describe('generatePairCode', () => {
  it('should generate a code with correct format (XXXX-XXXX)', () => {
    const code = generatePairCode();
    expect(code).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
  });

  it('should generate unique codes', () => {
    const codes = new Set<string>();
    for (let i = 0; i < 100; i++) {
      codes.add(generatePairCode());
    }
    // With 8 characters from 32 chars alphabet, collisions should be rare
    expect(codes.size).toBeGreaterThan(95);
  });

  it('should not contain confusing characters (0, O, 1, I)', () => {
    for (let i = 0; i < 100; i++) {
      const code = generatePairCode();
      expect(code).not.toMatch(/[0O1I]/);
    }
  });
});

describe('PairingService', () => {
  let store: ConnectionStore;
  let pairingService: PairingService;

  beforeEach(() => {
    store = {
      clients: new Map(),
      pendingPairs: new Map(),
      rooms: new Map(),
    };
    pairingService = new PairingService(store);
  });

  describe('requestPairCode', () => {
    it('should generate a pair code and store it', () => {
      const result = pairingService.requestPairCode('device1', 'My Desktop', 'desktop');

      expect(result.pairCode).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
      expect(result.expiresAt).toBeGreaterThan(Date.now());
      expect(store.pendingPairs.size).toBe(1);
    });

    it('should replace existing pending pair for same device', () => {
      const result1 = pairingService.requestPairCode('device1', 'My Desktop', 'desktop');
      const result2 = pairingService.requestPairCode('device1', 'My Desktop', 'desktop');

      expect(result1.pairCode).not.toBe(result2.pairCode);
      expect(store.pendingPairs.size).toBe(1);
      expect(store.pendingPairs.has(result1.pairCode)).toBe(false);
      expect(store.pendingPairs.has(result2.pairCode)).toBe(true);
    });
  });

  describe('confirmPairCode', () => {
    it('should successfully pair desktop and web devices', () => {
      const request = pairingService.requestPairCode('desktop1', 'My Desktop', 'desktop');
      const confirm = pairingService.confirmPairCode(
        request.pairCode,
        'web1',
        'My Phone',
        'web'
      );

      expect(confirm.success).toBe(true);
      expect(confirm.pairId).toBeDefined();
      expect(store.rooms.size).toBe(1);
    });

    it('should fail with invalid pair code', () => {
      const confirm = pairingService.confirmPairCode(
        'INVALID-CODE',
        'web1',
        'My Phone',
        'web'
      );

      expect(confirm.success).toBe(false);
      expect(confirm.error).toBe('Invalid pair code');
    });

    it('should fail when pairing same device types', () => {
      const request = pairingService.requestPairCode('desktop1', 'My Desktop', 'desktop');
      const confirm = pairingService.confirmPairCode(
        request.pairCode,
        'desktop2',
        'Another Desktop',
        'desktop'
      );

      expect(confirm.success).toBe(false);
      expect(confirm.error).toBe('Cannot pair same device types');
    });

    it('should fail with expired pair code', () => {
      const request = pairingService.requestPairCode('desktop1', 'My Desktop', 'desktop');

      // Manually expire the pair
      const pendingPair = store.pendingPairs.get(request.pairCode)!;
      pendingPair.expiresAt = Date.now() - 1000;

      const confirm = pairingService.confirmPairCode(
        request.pairCode,
        'web1',
        'My Phone',
        'web'
      );

      expect(confirm.success).toBe(false);
      expect(confirm.error).toBe('Pair code expired');
    });

    it('should normalize pair code format', () => {
      const request = pairingService.requestPairCode('desktop1', 'My Desktop', 'desktop');

      // Remove dash and lowercase
      const normalizedCode = request.pairCode.replace('-', '').toLowerCase();
      const confirm = pairingService.confirmPairCode(
        normalizedCode,
        'web1',
        'My Phone',
        'web'
      );

      expect(confirm.success).toBe(true);
    });
  });

  describe('getPairedDevice', () => {
    it('should return paired device id', () => {
      // Set up clients
      store.clients.set('desktop1', {
        ws: {} as any,
        deviceId: 'desktop1',
        deviceName: 'My Desktop',
        platform: 'desktop',
        pairId: null,
        lastPing: Date.now(),
      });
      store.clients.set('web1', {
        ws: {} as any,
        deviceId: 'web1',
        deviceName: 'My Phone',
        platform: 'web',
        pairId: null,
        lastPing: Date.now(),
      });

      const request = pairingService.requestPairCode('desktop1', 'My Desktop', 'desktop');
      pairingService.confirmPairCode(request.pairCode, 'web1', 'My Phone', 'web');

      expect(pairingService.getPairedDevice('desktop1')).toBe('web1');
      expect(pairingService.getPairedDevice('web1')).toBe('desktop1');
    });

    it('should return null for unpaired device', () => {
      store.clients.set('desktop1', {
        ws: {} as any,
        deviceId: 'desktop1',
        deviceName: 'My Desktop',
        platform: 'desktop',
        pairId: null,
        lastPing: Date.now(),
      });

      expect(pairingService.getPairedDevice('desktop1')).toBeNull();
    });
  });

  describe('cleanupExpiredPairs', () => {
    it('should remove expired pending pairs', () => {
      pairingService.requestPairCode('device1', 'Device 1', 'desktop');
      pairingService.requestPairCode('device2', 'Device 2', 'desktop');

      // Expire one of them
      const codes = Array.from(store.pendingPairs.keys());
      store.pendingPairs.get(codes[0])!.expiresAt = Date.now() - 1000;

      const removed = pairingService.cleanupExpiredPairs();

      expect(removed).toBe(1);
      expect(store.pendingPairs.size).toBe(1);
    });
  });
});
