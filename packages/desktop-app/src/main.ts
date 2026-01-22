import { app, BrowserWindow, ipcMain, dialog, Menu, Tray, nativeImage } from 'electron';
import * as path from 'path';
import { ClaudeService } from './claude-service';
import { EmbeddedServer, getLocalIP } from './embedded-server';

// Get the correct assets path for both dev and packaged app
function getAssetsPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'assets');
  }
  return path.join(__dirname, '../assets');
}

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let claudeService: ClaudeService | null = null;
let embeddedServer: EmbeddedServer | null = null;

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 480,
    height: 720,
    minWidth: 400,
    minHeight: 600,
    frame: false,
    transparent: false,
    backgroundColor: '#1a1a2e',
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  mainWindow.loadFile(path.join(getAssetsPath(), 'index.html'));

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Hide instead of close on macOS
  mainWindow.on('close', (event) => {
    if (process.platform === 'darwin' && !(app as any).isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });
};

const createTray = () => {
  const icon = nativeImage.createEmpty();
  tray = new Tray(icon);

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show Window',
      click: () => mainWindow?.show()
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        (app as any).isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setToolTip('Claude Remote');
  tray.setContextMenu(contextMenu);

  tray.on('click', () => {
    mainWindow?.show();
  });
};

// IPC Handlers
const setupIPC = () => {
  // Window controls
  ipcMain.on('window:minimize', () => mainWindow?.minimize());
  ipcMain.on('window:maximize', () => {
    if (mainWindow?.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow?.maximize();
    }
  });
  ipcMain.on('window:close', () => mainWindow?.hide());

  // Directory selection
  ipcMain.handle('dialog:selectDirectory', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ['openDirectory', 'multiSelections'],
      title: 'Select Allowed Directories',
    });
    return result.filePaths;
  });

  // Get local IP
  ipcMain.handle('system:getLocalIP', () => {
    return getLocalIP();
  });

  // Start embedded server (local mode)
  ipcMain.handle('server:start', async (_, port: number) => {
    try {
      if (embeddedServer) {
        embeddedServer.stop();
      }
      embeddedServer = new EmbeddedServer(port, getAssetsPath());
      const result = await embeddedServer.start();
      return { success: true, ...result };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('server:stop', async () => {
    if (embeddedServer) {
      embeddedServer.stop();
      embeddedServer = null;
    }
    return { success: true };
  });

  // Claude service controls
  ipcMain.handle('claude:start', async (_, config: {
    relayUrl: string;
    allowedDirs: string[];
  }) => {
    try {
      claudeService = new ClaudeService(config.relayUrl, config.allowedDirs);

      claudeService.on('status', (status) => {
        mainWindow?.webContents.send('claude:status', status);
      });

      claudeService.on('pairCode', (code) => {
        mainWindow?.webContents.send('claude:pairCode', code);
      });

      claudeService.on('paired', (pairId) => {
        mainWindow?.webContents.send('claude:paired', pairId);
      });

      claudeService.on('unpaired', () => {
        mainWindow?.webContents.send('claude:unpaired');
      });

      claudeService.on('sessions', (sessions) => {
        mainWindow?.webContents.send('claude:sessions', sessions);
      });

      claudeService.on('message', (msg) => {
        mainWindow?.webContents.send('claude:message', msg);
      });

      claudeService.on('error', (error) => {
        mainWindow?.webContents.send('claude:error', error);
      });

      await claudeService.start();
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('claude:stop', async () => {
    claudeService?.stop();
    claudeService = null;
    return { success: true };
  });

  ipcMain.handle('claude:getStatus', () => {
    return claudeService?.getStatus() || { connected: false, paired: false };
  });
};

app.whenReady().then(() => {
  createWindow();
  createTray();
  setupIPC();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    } else {
      mainWindow?.show();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  (app as any).isQuitting = true;
  claudeService?.stop();
  embeddedServer?.stop();
});
