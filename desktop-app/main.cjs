'use strict';
// Darren's Snowday Search desktop app (Electron). Both games are served from one fixed
// address, snowday://game/, so their browser saves (localStorage) stay shared and survive
// restarts, exactly like the one-origin rule the PLAY-* launchers follow.
//
// Updates (Claude update 14): updater.cjs checks the public game-updates branch on GitHub. The
// game's menus get an Update page through preload.cjs (window.snowdayDesktop); the Game menu
// has the same check. A downloaded game is used from the next page load, never mid-battle.
const { app, BrowserWindow, Menu, dialog, ipcMain, protocol, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { createUpdater, makeSource } = require('./updater.cjs');
const { buildManifest } = require('./game-manifest.cjs');

const SCHEME = 'snowday';
const HOST = 'game';
const ORIGIN = SCHEME + '://' + HOST;
// Packaged builds always serve their bundled game. Checkouts serve ../dist.
const bundledRoot = app.isPackaged
  ? path.join(process.resourcesPath, 'game')
  : path.join(__dirname, '..', 'dist');
const homeRoot = path.join(__dirname, 'home');
// The public repo whose game-updates branch the workflow publishes to. For tests,
// SNOWDAY_UPDATE_URL points at a local web folder instead; SNOWDAY_NO_UPDATES=1 switches updates off.
const UPDATE_REPO = 'caserade/darren-dynasty-warriors';
const RECHECK_MS = 60 * 60 * 1000;
let updater = null;

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}
function updateSource() {
  if (process.env.SNOWDAY_NO_UPDATES === '1') return null;
  if (process.env.SNOWDAY_UPDATE_URL)
    return makeSource({ baseUrl: process.env.SNOWDAY_UPDATE_URL });
  return makeSource({ repo: UPDATE_REPO });
}

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
  // A new page of the game is starting: a downloaded update takes over now, before any of
  // its files are read, so one page never mixes old and new files.
  if (/^\/(?:3d\/)?(?:index\.html)?$/.test(pathname)) updater.apply();
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

// Status goes to the game page (its Update page and notice) and to the window title and menu.
let lastState = '';
function onUpdateStatus(s) {
  if (!win) return;
  win.webContents.send('snowday:update-status', s);
  const want = s.state === 'available' || s.state === 'ready' || s.state === 'needs-app' || !!s.app;
  win.setTitle("Darren's Snowday Search" + (want ? ' - update available' : ''));
  if (s.state !== lastState) {
    lastState = s.state;
    buildMenu();
  }
}
// Switch to the downloaded game and reload the page the player is on (always a menu).
function finishInstall() {
  if (updater.apply() && win) win.webContents.reload();
}
async function menuCheck() {
  const s = await updater.check();
  const buttons = ['OK'];
  if (s.state === 'available') buttons.unshift('Update now');
  if (s.app || s.state === 'needs-app') buttons.unshift('Get the new app');
  const { response } = await dialog.showMessageBox(win, {
    type: 'info',
    title: 'Game updates',
    message: s.message || 'Your game is up to date.',
    detail: s.app ? 'A new version of the app (' + s.app.version + ') is out as well.' : '',
    buttons,
    noLink: true,
  });
  if (buttons[response] === 'Update now') {
    const done = await updater.install();
    if (done.state !== 'ready')
      return dialog.showMessageBox(win, {
        type: 'warning',
        message: done.message,
        buttons: ['OK'],
      });
    const again = await dialog.showMessageBox(win, {
      type: 'info',
      title: 'Game updates',
      message: 'The new game is downloaded. Restart the game now?',
      detail:
        'Your saves are kept. A battle in progress starts over. Choose Later to keep playing; ' +
        'the new game starts the next time the game opens.',
      buttons: ['Restart now', 'Later'],
      noLink: true,
    });
    if (again.response === 0) finishInstall();
  } else if (buttons[response] === 'Get the new app') openAppDownload();
}
function openAppDownload() {
  const s = updater.status();
  shell.openExternal(
    (s.app && s.app.url) || 'https://github.com/' + UPDATE_REPO + '/releases/latest'
  );
}
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
          {
            label:
              updater.status().state === 'available'
                ? 'Update the game now...'
                : 'Check for updates...',
            click: () => menuCheck(),
          },
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
            label: 'Use the game that came with the app',
            click: () => {
              updater.reset();
              if (win) win.webContents.reload();
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
      preload: path.join(__dirname, 'preload.cjs'),
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
    // The bundled game's manifest is written by the build; from a checkout it is made here.
    const manifest =
      (app.isPackaged && readJson(path.join(process.resourcesPath, 'game-manifest.json'))) ||
      buildManifest(bundledRoot, { build: Number(process.env.SNOWDAY_BUNDLED_BUILD) || 1 });
    updater = createUpdater({
      bundledRoot,
      bundledManifest: manifest,
      dataDir: app.getPath('userData'),
      source: updateSource(),
      appVersion: app.getVersion(),
      log: (m) => console.log('[updates] ' + m),
      onChange: onUpdateStatus,
    });
    // Only pages of the game itself may drive updates.
    const fromGame = (e) => {
      const url = e.senderFrame && e.senderFrame.url;
      if (!url || !url.startsWith(ORIGIN + '/')) throw new Error('not allowed');
    };
    ipcMain.handle('snowday:update-status', (e) => (fromGame(e), updater.status()));
    ipcMain.handle('snowday:update-check', (e) => (fromGame(e), updater.check()));
    ipcMain.handle('snowday:update-install', async (e) => {
      fromGame(e);
      const s = await updater.install();
      // Reload a moment later so the page can show "Restarting..." first.
      if (s.state === 'ready') setTimeout(finishInstall, 900);
      return s;
    });
    ipcMain.handle('snowday:update-seen', (e) => (fromGame(e), updater.seenUpdate()));
    ipcMain.handle('snowday:get-app', (e) => (fromGame(e), openAppDownload()));
    protocol.handle(SCHEME, serve);
    buildMenu();
    createWindow();
    // Check shortly after start (the title screen is loading anyway), then every hour.
    setTimeout(() => updater.check(), 4000);
    setInterval(() => updater.check(), RECHECK_MS);
  });
  app.on('window-all-closed', () => app.quit());
}
