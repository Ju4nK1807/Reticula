const { app, BrowserWindow, Menu, net, protocol, shell } = require('electron');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');

function preferHighPerformanceGpu() {
  if (process.platform !== 'win32') return false;
  const key = String.raw`HKCU\Software\Microsoft\DirectX\UserGpuPreferences`;
  const exe = process.execPath;
  const opts = { windowsHide: true, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] };
  try {
    if (/GpuPreference=/.test(execFileSync('reg', ['query', key, '/v', exe], opts))) return false;
  } catch {
  }
  try {
    execFileSync('reg', ['add', key, '/v', exe, '/t', 'REG_SZ', '/d', 'GpuPreference=2;', '/f'], opts);
    return true;
  } catch {
    return false;
  }
}

if (preferHighPerformanceGpu() && !process.argv.includes('--gpu-relaunched')) {
  app.relaunch({ args: [...process.argv.slice(1), '--gpu-relaunched'] });
  app.exit(0);
}

const DIST = path.join(__dirname, '..', 'dist');
const SCHEME = 'reticula';

protocol.registerSchemesAsPrivileged([
  { scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);

app.commandLine.appendSwitch('disable-renderer-backgrounding');

let win = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1600,
    height: 900,
    minWidth: 1024,
    minHeight: 600,
    backgroundColor: '#07090d',
    title: 'Retícula',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    autoHideMenuBar: true,
    show: false,
    webPreferences: { contextIsolation: true, sandbox: true, backgroundThrottling: false, spellcheck: false },
  });
  win.once('ready-to-show', () => win.show());
  win.loadURL(`${SCHEME}://app/index.html`);

  win.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') {
      win.setFullScreen(!win.isFullScreen());
      event.preventDefault();
    }
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(`${SCHEME}://`)) event.preventDefault();
  });
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });

  app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    protocol.handle(SCHEME, (request) => {
      const { pathname } = new URL(request.url);
      const file = path.normalize(path.join(DIST, decodeURIComponent(pathname)));
      if (!file.startsWith(DIST)) return new Response('Prohibido', { status: 403 });
      return net.fetch(pathToFileURL(file).toString());
    });
    createWindow();
  });

  app.on('window-all-closed', () => app.quit());
}
