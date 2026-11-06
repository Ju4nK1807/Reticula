// Retícula para escritorio (Windows): Electron carga la versión compilada (dist/) por un protocolo propio.
// - reticula://app/… en vez de file://: los módulos ES funcionan y localStorage (progreso) tiene un
//   origen estable.
// - Pointer Lock con raw input (unadjustedMovement) funciona igual que en Chrome.
// - F11: pantalla completa. Una sola instancia: abrir otra vez enfoca la ventana existente.
const { app, BrowserWindow, Menu, net, protocol, shell } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const DIST = path.join(__dirname, '..', 'dist');
const SCHEME = 'reticula';

protocol.registerSchemesAsPrivileged([
  { scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);

// El juego tiene que ir fluido aunque la ventana pierda el foco un instante.
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
  // Enlaces externos en el navegador del sistema, nunca dentro de la app.
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
    // Sirve dist/ por reticula://app/… sin salir de la carpeta (evita rutas con ..).
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
