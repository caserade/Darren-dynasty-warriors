'use strict';
// Darren's Snowday Search desktop app (Electron). Both games are served from one fixed
// address, snowday://game/, so their browser saves (localStorage) stay shared and survive
// restarts, exactly like the one-origin rule the PLAY-* launchers follow.
const { app, BrowserWindow, Menu, protocol, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { buildManifest } = require('./game-manifest.cjs');
const { createUpdater } = require('./updater.cjs');

const SCHEME = 'snowday';
const HOST = 'game';
const ORIGIN = SCHEME + '://' + HOST;
// Packaged: the build copies dist/ to resources/game (with game-manifest.json and
// update-config.json beside it). From a checkout: ../dist and update-config.json here.
const bundledRoot = app.isPackaged
  ? path.join(process.resourcesPath, 'game')
  : path.join(__dirname, '..', 'dist');
const homeRoot = path.join(__dirname, 'home');
const readJson = (file) => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
};
// Tests and developers can point the app elsewhere: SNOWDAY_UPDATE_URL (a web folder with
// latest.json and game/), SNOWDAY_UPDATE_TOKEN, or SNOWDAY_NO_UPDATES=1 to switch it off.
function updateConfig() {
  const cfg =
    readJson(
      app.isPackaged
        ? path.join(process.resourcesPath, 'update-config.json')
        : path.join(__dirname, 'update-config.json')
    ) || {};
  if (process.env.SNOWDAY_UPDATE_URL) cfg.baseUrl = process.env.SNOWDAY_UPDATE_URL;
  if (process.env.SNOWDAY_UPDATE_TOKEN) cfg.token = process.env.SNOWDAY_UPDATE_TOKEN;
  return process.env.SNOWDAY_NO_UPDATES === '1' ? {} : cfg;
}
let updater = null;

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
  // /__desktop/ is the app's own start page; everything else is the game's dist/ folder.
  const desktop = pathname === '/__desktop' || pathname.startsWith('/__desktop/');
  const root = desktop ? homeRoot : updater.root();
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
  let url;
  try {
    url = new URL(request.url);
    url.pathname = decodeURIComponent(url.pathname);
  } catch {
    return new Response('Bad request', { status: 400 });
  }
  if (url.host !== HOST) return new Response('Not found', { status: 404 });
  if (url.pathname === '/__desktop/update.json')
    return Response.json(updater.status(), { headers: { 'Cache-Control': 'no-store' } });
  // Opening the start screen means no game page is open: a good moment to switch games.
  if (url.pathname === '/__desktop/' || url.pathname === '/__desktop/index.html') updater.apply();
  const file = resolveFile(url.pathname);
  if (!file) return new Response('Not found', { status: 404 });
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
const onStartScreen = () => !!win && win.webContents.getURL().startsWith(ORIGIN + '/__desktop/');

// Check GitHub in the background. A finished download is switched in straight away when
// the start screen is showing (it reloads to say so); mid-game it waits for the next visit
// to the start screen or the next launch.
function checkNow() {
  return updater.check().then((s) => {
    if (s.state === 'ready' && onStartScreen()) go('/__desktop/');
  });
}

function buildMenu() {
  const toggleFull = () => win && win.setFullScreen(!win.isFullScreen());
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: 'Game',
        submenu: [
          { label: 'Choose a game', accelerator: 'CmdOrCtrl+H', click: () => go('/__desktop/') },
          { label: 'Pixel adventure', accelerator: 'CmdOrCtrl+1', click: () => go('/') },
          { label: '3D adventure', accelerator: 'CmdOrCtrl+2', click: () => go('/3d/') },
          { label: 'Check for game updates', click: checkNow },
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
          {
            label: 'Go back to the game that came with the app',
            click: () => {
              updater.reset();
              go('/__desktop/');
            },
          },
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
  go('/__desktop/');
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
    // The bundled game's manifest is written by the build; from a checkout it is made here.
    const manifest =
      (app.isPackaged && readJson(path.join(process.resourcesPath, 'game-manifest.json'))) ||
      buildManifest(bundledRoot, { build: Number(process.env.SNOWDAY_BUNDLED_BUILD) || 1 });
    updater = createUpdater({
      bundledRoot,
      bundledManifest: manifest,
      dataDir: app.getPath('userData'),
      config: updateConfig(),
      appVersion: app.getVersion(),
      log: (m) => console.log('[updates] ' + m),
    });
    protocol.handle(SCHEME, serve);
    buildMenu();
    createWindow();
    checkNow();
  });
  app.on('window-all-closed', () => app.quit());
}
