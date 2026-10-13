'use strict';
// Runs desktop-app/main.cjs against a stand-in Electron (no window, no network): the game is
// served from the right place, updates come only from the public game-updates branch with no
// key, and only the game's own pages can drive the updater. node --test tests/desktop-standalone.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { APP_FILES } = require('../desktop-app/package-security.cjs');
const appDir = path.join(__dirname, '../desktop-app');

function boot({ env = {}, fetch } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'snowday-runtime-'));
  const resources = path.join(root, 'resources');
  const data = path.join(root, 'data');
  fs.mkdirSync(path.join(resources, 'game/3d'), { recursive: true });
  fs.writeFileSync(path.join(resources, 'game/index.html'), 'BUNDLED GAME');
  fs.writeFileSync(path.join(resources, 'game/3d/index.html'), 'BUNDLED 3D');
  // An old, never-released updater's downloads must be ignored and left alone.
  fs.mkdirSync(path.join(data, 'game-updates/b999'), { recursive: true });
  fs.writeFileSync(path.join(data, 'game-updates/b999/index.html'), 'OLD DOWNLOADED GAME');
  fs.writeFileSync(path.join(data, 'game-updates/current.json'), '{"build":999}');
  fs.writeFileSync(path.join(data, 'save-marker'), 'existing save');
  const { buildManifest } = require('../desktop-app/game-manifest.cjs');
  fs.writeFileSync(
    path.join(resources, 'game-manifest.json'),
    JSON.stringify(buildManifest(path.join(resources, 'game'), { build: 100 }))
  );
  const s = { menu: null, windowOptions: null, handlers: {}, timers: [], calls: [] };
  class Window {
    constructor(options) {
      s.windowOptions = options;
      s.win = this;
      this.webContents = { setWindowOpenHandler() {}, on() {}, send() {}, reload() {} };
    }
    on() {}
    loadURL(u) {
      s.loaded = u;
    }
    setTitle(t) {
      s.title = t;
    }
    isFullScreen() {
      return false;
    }
  }
  const electron = {
    app: {
      isPackaged: true,
      setName(n) {
        s.appName = n;
      },
      getVersion: () => '1.9.0',
      requestSingleInstanceLock: () => true,
      on() {},
      whenReady: () => ({
        then(fn) {
          s.ready = Promise.resolve().then(fn);
        },
      }),
      getPath: () => data,
    },
    BrowserWindow: Window,
    Menu: {
      buildFromTemplate: (x) => x,
      setApplicationMenu(x) {
        s.menu = x;
      },
    },
    dialog: { showMessageBox: async () => ({ response: 0 }) },
    ipcMain: {
      handle(name, fn) {
        s.handlers[name] = fn;
      },
    },
    protocol: {
      registerSchemesAsPrivileged() {},
      handle(_s, fn) {
        s.serve = fn;
      },
    },
    shell: { openPath() {}, openExternal: (u) => (s.opened = u) },
  };
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    s.calls.push({ url: String(url), opts });
    return fetch ? fetch(url, opts) : new Response('', { status: 404 });
  };
  vm.runInNewContext(fs.readFileSync(path.join(appDir, 'main.cjs'), 'utf8'), {
    require(name) {
      if (name === 'electron') return electron;
      if (['node:fs', 'node:path', './updater.cjs', './game-manifest.cjs'].includes(name))
        return require(name.startsWith('./') ? path.join(appDir, name) : name);
      throw Error('Unexpected runtime dependency: ' + name);
    },
    __dirname: appDir,
    process: { resourcesPath: resources, env },
    console,
    URL,
    Response,
    setTimeout: (fn) => s.timers.push(fn),
    setInterval: () => {},
  });
  s.data = data;
  s.done = () => {
    globalThis.fetch = realFetch;
    fs.rmSync(root, { recursive: true, force: true });
  };
  return s;
}

test('serves the bundled game, ignores the old updater folder and keeps saves', async () => {
  const s = boot();
  try {
    await s.ready;
    assert.equal(s.appName, "Darren's Snowday Search");
    assert.equal(await (await s.serve({ url: 'snowday://game/' })).text(), 'BUNDLED GAME');
    assert.equal(await (await s.serve({ url: 'snowday://game/3d/' })).text(), 'BUNDLED 3D');
    assert.equal(s.loaded, 'snowday://game/3d/');
    const wp = s.windowOptions.webPreferences;
    assert.equal(wp.nodeIntegration, false);
    assert.equal(wp.contextIsolation, true);
    assert.equal(wp.sandbox, true);
    assert.equal(wp.preload, path.join(appDir, 'preload.cjs'));
    assert.ok(JSON.stringify(s.menu).includes('Check for updates'));
    assert.equal(fs.readFileSync(path.join(s.data, 'save-marker'), 'utf8'), 'existing save');
    assert.equal(
      fs.readFileSync(path.join(s.data, 'game-updates/b999/index.html'), 'utf8'),
      'OLD DOWNLOADED GAME'
    );
  } finally {
    s.done();
  }
});

test('checks the public game-updates branch with no key, a little after start', async () => {
  const s = boot({ env: { SNOWDAY_UPDATE_TOKEN: 'synthetic-only' } });
  try {
    await s.ready;
    assert.equal(s.calls.length, 0, 'nothing is fetched while the window opens');
    for (const fn of s.timers) fn();
    await new Promise((r) => setTimeout(r, 50));
    assert.equal(s.calls.length, 1);
    assert.match(
      s.calls[0].url,
      /^https:\/\/raw\.githubusercontent\.com\/caserade\/darren-dynasty-warriors\/game-updates\/latest\.json\?v=\d+$/
    );
    assert.ok(!JSON.stringify(s.calls[0].opts).includes('synthetic-only'), 'no key is ever sent');
    assert.ok(!JSON.stringify(s.calls[0].opts).match(/authorization/i));
  } finally {
    s.done();
  }
});

test('SNOWDAY_NO_UPDATES switches updates off', async () => {
  const s = boot({ env: { SNOWDAY_NO_UPDATES: '1' } });
  try {
    await s.ready;
    for (const fn of s.timers) fn();
    const game = { senderFrame: { url: 'snowday://game/3d/' } };
    const st = await s.handlers['snowday:update-check'](game);
    assert.equal(st.state, 'off');
    assert.equal(s.calls.length, 0);
  } finally {
    s.done();
  }
});

test('only the game pages can use the update calls', async () => {
  const s = boot({ env: { SNOWDAY_NO_UPDATES: '1' } });
  try {
    await s.ready;
    const names = Object.keys(s.handlers).sort();
    assert.deepEqual(names, [
      'snowday:get-app',
      'snowday:update-check',
      'snowday:update-install',
      'snowday:update-seen',
      'snowday:update-status',
    ]);
    // Handlers may throw or reject; either way the call is refused.
    const refused = (n, e) => assert.rejects(async () => s.handlers[n](e), /not allowed/);
    for (const n of names) {
      await refused(n, { senderFrame: { url: 'https://example.com/' } });
      await refused(n, { senderFrame: null });
    }
    const st = s.handlers['snowday:update-status']({ senderFrame: { url: 'snowday://game/3d/' } });
    assert.equal(st.game.build, 100);
    assert.equal(st.bundled, true);
  } finally {
    s.done();
  }
});

test('distributed runtime: exact files, no settings file where a key could hide', () => {
  assert.deepEqual(APP_FILES, [
    'package.json',
    'main.cjs',
    'preload.cjs',
    'updater.cjs',
    'game-manifest.cjs',
    'home/index.html',
    'home/icon.png',
    'home/darren.jpg',
  ]);
  for (const rel of ['desktop-app/update-config.json', 'desktop-app/update-settings.cjs'])
    assert.ok(!fs.existsSync(path.join(__dirname, '..', rel)), rel + ' is not used');
  const main = fs.readFileSync(path.join(appDir, 'main.cjs'), 'utf8');
  const updater = fs.readFileSync(path.join(appDir, 'updater.cjs'), 'utf8');
  assert.ok(!/token|authorization|bearer/i.test(main + updater), 'no key handling in the app');
});
