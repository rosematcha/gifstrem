import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import 'dotenv/config';

const isDev = process.env.NODE_ENV === 'development';
const FALLBACK_WEB_URL = 'http://localhost:4173';

async function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    backgroundColor: '#05050a',
    title: 'Gifstrem Moderator',
    autoHideMenuBar: true,
  });
  const target = process.env.GIFFY_POP_WEB_URL ?? FALLBACK_WEB_URL;
  if (isDev) {
    await win.loadURL(`${target}/dashboard`);
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    await win.loadURL(`${target}/dashboard`);
  }
}

app.whenReady().then(() => {
  void createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
