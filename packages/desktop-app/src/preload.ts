import { contextBridge, ipcRenderer } from 'electron';

// Expose protected methods to renderer
contextBridge.exposeInMainWorld('electronAPI', {
  // Window controls
  minimize: () => ipcRenderer.send('window:minimize'),
  maximize: () => ipcRenderer.send('window:maximize'),
  close: () => ipcRenderer.send('window:close'),

  // Dialog
  selectDirectory: () => ipcRenderer.invoke('dialog:selectDirectory'),

  // System
  getLocalIP: () => ipcRenderer.invoke('system:getLocalIP'),

  // Embedded server (local mode)
  startServer: (port: number) => ipcRenderer.invoke('server:start', port),
  stopServer: () => ipcRenderer.invoke('server:stop'),

  // Claude service
  startClaude: (config: { relayUrl: string; allowedDirs: string[] }) =>
    ipcRenderer.invoke('claude:start', config),
  stopClaude: () => ipcRenderer.invoke('claude:stop'),
  getStatus: () => ipcRenderer.invoke('claude:getStatus'),

  // Event listeners
  onStatus: (callback: (status: any) => void) => {
    ipcRenderer.on('claude:status', (_, status) => callback(status));
  },
  onPairCode: (callback: (code: string) => void) => {
    ipcRenderer.on('claude:pairCode', (_, code) => callback(code));
  },
  onPaired: (callback: (pairId: string) => void) => {
    ipcRenderer.on('claude:paired', (_, pairId) => callback(pairId));
  },
  onUnpaired: (callback: () => void) => {
    ipcRenderer.on('claude:unpaired', () => callback());
  },
  onSessions: (callback: (sessions: any[]) => void) => {
    ipcRenderer.on('claude:sessions', (_, sessions) => callback(sessions));
  },
  onMessage: (callback: (msg: any) => void) => {
    ipcRenderer.on('claude:message', (_, msg) => callback(msg));
  },
  onError: (callback: (error: string) => void) => {
    ipcRenderer.on('claude:error', (_, error) => callback(error));
  },

  // Remove listeners
  removeAllListeners: (channel: string) => {
    ipcRenderer.removeAllListeners(`claude:${channel}`);
  }
});

// Type declaration for TypeScript
declare global {
  interface Window {
    electronAPI: {
      minimize: () => void;
      maximize: () => void;
      close: () => void;
      selectDirectory: () => Promise<string[]>;
      startClaude: (config: { relayUrl: string; allowedDirs: string[] }) =>
        Promise<{ success: boolean; error?: string }>;
      stopClaude: () => Promise<{ success: boolean }>;
      getStatus: () => Promise<any>;
      onStatus: (callback: (status: any) => void) => void;
      onPairCode: (callback: (code: string) => void) => void;
      onPaired: (callback: (pairId: string) => void) => void;
      onUnpaired: (callback: () => void) => void;
      onSessions: (callback: (sessions: any[]) => void) => void;
      onMessage: (callback: (msg: any) => void) => void;
      onError: (callback: (error: string) => void) => void;
      removeAllListeners: (channel: string) => void;
    };
  }
}
