'use strict';
// Darren's Snowday Search desktop app (Electron). Both games are served from one fixed
// address, snowday://game/, so their browser saves (localStorage) stay shared and survive
// restarts, exactly like the one-origin rule the PLAY-* launchers follow.
const { app, BrowserWindow, Menu, protocol, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const SCHEME = 'snowday';
const HOST = 'game';
const ORIGIN = SCHEME + '://' + HOST;
// Packaged builds always serve their bundled game. Checkouts serve ../dist.
const bundledRoot = app.isPackaged
  ? path.join(process.resourcesPath, 'game')
  : path.join(__dirname, '..', 'dist');
const homeRoot = path.join(__dirname, 'home');

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.glb': 'model/gltf-binary',
  '.woff2': 'font/woff2',
  '.md': 'text/plain; charset=utf-8',
};

app.setName("Darren's Snowday Search");
protocol.registerSchemesAsPrivileged([
  {
    scheme: SCHEME,
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true },
  },
]);

function resolveFile(pathname) {
  // /__desktop/ is the app's own game chooser page; everything else is the game's dist/ folder.
  const desktop = pathname === '/__desktop' || pathname.startsWith('/__desktop/');
  const root = desktop ? homeRoot : bundledRoot;
  const rel = desktop ? pathname.slice('/__desktop'.length) : pathname;
  let file = path.resolve(root, '.' + rel);
  if (file !== root && !file.startsWith(root + path.sep)) return null;
  try {
    if (fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  } catch {
    return null;
  }
  return file;
}

function serve(request) {
  let url, pathname;
  try {
    url = new URL(request.url);
    // Decode into a plain string: assigning back to url.pathname would re-encode it, so
    // names with spaces or accents would never be found.
    pathname = decodeURIComponent(url.pathname);
  } catch {
    return new Response('Bad request', { status: 400 });
  }
  if (url.host !== HOST) return new Response('Not found', { status: 404 });
  const file = resolveFile(pathname);
  if (!file) return new Response('Not found', { status: 404 });
  // A folder asked for without its trailing slash (snowday://game/3d) would load index.html
  // with relative links pointing at the wrong folder, so send the browser to the slash form.
  if (path.basename(file) === 'index.html' && !/\/(?:index\.html)?$/.test(pathname)) {
    url.pathname = url.pathname + '/';
    return new Response(null, { status: 301, headers: { Location: url.href } });
  }
  return fs.promises.readFile(file).then(
    (data) =>
      new Response(data, {
        headers: {
          'Content-Type': mime[path.extname(file).toLowerCase()] || 'application/octet-stream',
          'Content-Length': String(data.length),
          'Cache-Control': 'no-store',
        },
      }),
    () => new Response('Not found', { status: 404 })
  );
}

let win = null;
const go = (p) => win && win.loadURL(ORIGIN + p);
function buildMenu() {
  const toggleFull = () => win && win.setFullScreen(!win.isFullScreen());
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: 'Game',
        submenu: [
          { label: 'Title screen', accelerator: 'CmdOrCtrl+H', click: () => go('/3d/') },
          { label: 'Pixel adventure', accelerator: 'CmdOrCtrl+1', click: () => go('/') },
          { label: 'Choose a game', accelerator: 'CmdOrCtrl+2', click: () => go('/__desktop/') },
          { type: 'separator' },
          { role: 'quit', label: 'Quit' },
        ],
      },
      {
        label: 'View',
        submenu: [
          { label: 'Full screen', accelerator: 'F11', click: toggleFull },
          { role: 'reload', label: 'Reload game' },
          { type: 'separator' },
          { role: 'resetZoom' },
          { role: 'zoomIn' },
          { role: 'zoomOut' },
        ],
      },
      {
        label: 'Test',
        submenu: [
          { role: 'toggleDevTools', label: 'Developer tools' },
          { label: 'Open save folder', click: () => shell.openPath(app.getPath('userData')) },
        ],
      },
    ])
  );
}

function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 800,
    minHeight: 500,
    backgroundColor: '#18394b',
    title: "Darren's Snowday Search",
    icon: path.join(homeRoot, 'icon.png'),
    autoHideMenuBar: false,
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });
  // Stay inside the game; real web links open in the normal browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    else if (url.startsWith(ORIGIN + '/')) win.loadURL(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (url.startsWith(ORIGIN + '/')) return;
    e.preventDefault();
    if (/^https?:/i.test(url)) shell.openExternal(url);
  });
  win.on('closed', () => (win = null));
  // The 3D game's title screen is the front door; its main menu also opens the pixel game.
  go('/3d/');
}

// One copy at a time: two copies would write the same saves.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });
  app.whenReady().then(() => {
    protocol.handle(SCHEME, serve);
    buildMenu();
    createWindow();
  });
  app.on('window-all-closed', () => app.quit());
}
