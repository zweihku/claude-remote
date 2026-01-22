import { PAIR_CODE_LENGTH, PAIR_CODE_EXPIRY_MS } from '@claude-remote/shared';
import { v4 as uuidv4 } from 'uuid';
import type { PendingPair, Room, ConnectionStore } from './types.js';

// Generate a random pair code (8 characters, format: XXXX-XXXX)
export function generatePairCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Excludes confusing characters
  let code = '';
  for (let i = 0; i < PAIR_CODE_LENGTH; i++) {
    if (i === 4) code += '-';
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export class PairingService {
  private store: ConnectionStore;

  constructor(store: ConnectionStore) {
    this.store = store;
  }

  // Request a new pair code for a device
  requestPairCode(
    deviceId: string,
    deviceName: string,
    platform: 'desktop' | 'web'
  ): { pairCode: string; expiresAt: number } {
    // Remove any existing pending pair for this device
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

  // Confirm a pair code from another device
  confirmPairCode(
    pairCode: string,
    deviceId: string,
    deviceName: string,
    platform: 'desktop' | 'web'
  ): { success: boolean; pairId?: string; error?: string } {
    const normalizedCode = pairCode.toUpperCase().replace(/[^A-Z0-9]/g, '');
    const formattedCode = normalizedCode.slice(0, 4) + '-' + normalizedCode.slice(4);

    const pendingPair = this.store.pendingPairs.get(formattedCode);

    if (!pendingPair) {
      return { success: false, error: 'Invalid pair code' };
    }

    if (Date.now() > pendingPair.expiresAt) {
      this.store.pendingPairs.delete(formattedCode);
      return { success: false, error: 'Pair code expired' };
    }

    // Cannot pair same platform types
    if (pendingPair.platform === platform) {
      return { success: false, error: 'Cannot pair same device types' };
    }

    // Create a new room for the paired devices
    const pairId = uuidv4();
    const room: Room = {
      pairId,
      desktopDeviceId: platform === 'web' ? pendingPair.deviceId : deviceId,
      webDeviceId: platform === 'web' ? deviceId : pendingPair.deviceId,
      createdAt: Date.now(),
    };

    this.store.rooms.set(pairId, room);
    this.store.pendingPairs.delete(formattedCode);

    // Update connected clients with pairId
    const initiatorClient = this.store.clients.get(pendingPair.deviceId);
    if (initiatorClient) {
      initiatorClient.pairId = pairId;
    }

    const confirmingClient = this.store.clients.get(deviceId);
    if (confirmingClient) {
      confirmingClient.pairId = pairId;
    }

    return { success: true, pairId };
  }

  // Get the paired device for a given device
  getPairedDevice(deviceId: string): string | null {
    const client = this.store.clients.get(deviceId);
    if (!client?.pairId) return null;

    const room = this.store.rooms.get(client.pairId);
    if (!room) return null;

    return room.desktopDeviceId === deviceId
      ? room.webDeviceId
      : room.desktopDeviceId;
  }

  // Clean up expired pending pairs
  cleanupExpiredPairs(): number {
    const now = Date.now();
    let removed = 0;

    for (const [code, pair] of this.store.pendingPairs.entries()) {
      if (now > pair.expiresAt) {
        this.store.pendingPairs.delete(code);
        removed++;
      }
    }

    return removed;
  }
}
