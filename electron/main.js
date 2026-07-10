import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow } from 'electron';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Keep the per-user data dir stable ("diy-shed") in both dev and packaged runs.
app.setName('diy-shed');

function clientDistDir() {
  // Packaged: client/dist lives inside app.asar (app root); Electron's fs reads
  // it transparently. Dev: the repo's built client next to this file.
  if (app.isPackaged) return path.join(app.getAppPath(), 'client', 'dist');
  return path.join(__dirname, '..', 'client', 'dist');
}

let serverInstance = null;
let mainWindow = null;

function createWindow(port) {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  mainWindow.loadURL(`http://localhost:${port}`);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app.whenReady().then(async () => {
    process.env.DIYSHED_DB ??= path.join(app.getPath('userData'), 'diy-shed.db');
    process.env.DIYSHED_CLIENT_DIST ??= clientDistDir();
    process.env.DIYSHED_PACKAGED = '1';

    const { startServer } = await import('../server/src/server.js');
    const { server, port } = await startServer({ port: 0 });
    serverInstance = server;
    createWindow(port);

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow(port);
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });

  app.on('before-quit', () => {
    if (serverInstance) serverInstance.close();
  });
}
