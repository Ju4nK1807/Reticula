// Retícula para escritorio (Windows): Electron carga la versión compilada (dist/) por un protocolo propio.
// - reticula://app/… en vez de file://: los módulos ES funcionan y localStorage (progreso) tiene un
//   origen estable.
// - Pointer Lock con raw input (unadjustedMovement) funciona igual que en Chrome.
// - F11: pantalla completa. Una sola instancia: abrir otra vez enfoca la ventana existente.
const { app, BrowserWindow, Menu, net, protocol, shell } = require('electron');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');

// Portátiles con dos GPU (integrada + NVIDIA/AMD): Windows decide cuál usa cada programa y por
// defecto suele darle la integrada a apps como esta (mucho menos FPS). Se registra la preferencia
// "Alto rendimiento" SOLO para este ejecutable, igual que haría el usuario en Configuración →
// Sistema → Pantalla → Gráficos. Si ya hay una elección (del usuario o nuestra), no se toca.
// Devuelve true si se acaba de registrar (Windows la aplica al volver a abrir el proceso).
function preferHighPerformanceGpu() {
  if (process.platform !== 'win32') return false;
  const key = String.raw`HKCU\Software\Microsoft\DirectX\UserGpuPreferences`;
  const exe = process.execPath;
  const opts = { windowsHide: true, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] };
  try {
    if (/GpuPreference=/.test(execFileSync('reg', ['query', key, '/v', exe], opts))) return false;
  } catch {
    // No existe todavía: se crea.
  }
  try {
    execFileSync('reg', ['add', key, '/v', exe, '/t', 'REG_SZ', '/d', 'GpuPreference=2;', '/f'], opts);
    return true;
  } catch {
    return false;
  }
}

// La primera vez se reinicia al instante (antes de abrir la ventana) para arrancar ya en la dedicada.
if (preferHighPerformanceGpu() && !process.argv.includes('--gpu-relaunched')) {
  app.relaunch({ args: [...process.argv.slice(1), '--gpu-relaunched'] });
  app.exit(0);
}

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
