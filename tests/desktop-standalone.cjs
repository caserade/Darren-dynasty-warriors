'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { APP_FILES } = require('../desktop-app/package-security.cjs');

test('standalone startup serves only bundled files, ignores old updates and never requests the network', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'snowday-standalone-'));
  try {
    const resources = path.join(root, 'resources');
    const data = path.join(root, 'data');
    fs.mkdirSync(path.join(resources, 'game'), { recursive: true });
    fs.writeFileSync(path.join(resources, 'game/index.html'), 'BUNDLED GAME');
    fs.mkdirSync(path.join(data, 'game-updates/b999'), { recursive: true });
    fs.writeFileSync(path.join(data, 'game-updates/b999/index.html'), 'OLD DOWNLOADED GAME');
    fs.writeFileSync(path.join(data, 'game-updates/current.json'), '{"build":999}');
    fs.writeFileSync(path.join(data, 'save-marker'), 'existing save');
    let serve, ready, menu, windowOptions, appName, networkCalls = 0;
    class Window {
      constructor(options) { windowOptions = options; this.webContents = { setWindowOpenHandler() {}, on() {} }; }
      on() {} loadURL() {} isFullScreen() { return false; }
    }
    const electron = {
      app: { isPackaged: true, setName(n) { appName=n; }, requestSingleInstanceLock: () => true,
        on() {}, whenReady: () => ({ then(fn) { ready = Promise.resolve().then(fn); } }),
        getPath: () => data },
      BrowserWindow: Window,
      Menu: { buildFromTemplate: x => x, setApplicationMenu(x) { menu=x; } },
      protocol: { registerSchemesAsPrivileged() {}, handle(s, fn) { serve=fn; } },
      shell: { openPath() {}, openExternal() {} },
    };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../desktop-app/main.cjs'), 'utf8'), {
      require(name) { if(name==='electron')return electron; if(name==='node:fs')return fs; if(name==='node:path')return path; throw Error('Unexpected runtime dependency: '+name); },
      __dirname: path.join(__dirname, '../desktop-app'),
      process: { resourcesPath: resources, env: { SNOWDAY_UPDATE_URL: 'https://example.invalid', SNOWDAY_UPDATE_TOKEN: 'synthetic-only' } },
      URL, Response, fetch() { networkCalls++; throw Error('Network access forbidden'); },
    });
    await ready;
    assert.equal(appName, "Darren's Snowday Search");
    assert.equal(await (await serve({url:'snowday://game/'})).text(), 'BUNDLED GAME');
    assert.equal((await serve({url:'snowday://game/__desktop/update.json'})).status,404);
    assert.equal(networkCalls,0);
    assert.ok(!JSON.stringify(menu).match(/update|came with the app/i));
    assert.equal(windowOptions.webPreferences.nodeIntegration,false);
    assert.equal(fs.readFileSync(path.join(data,'save-marker'),'utf8'),'existing save');
    assert.equal(fs.readFileSync(path.join(data,'game-updates/current.json'),'utf8'),'{"build":999}');
    assert.equal(fs.readFileSync(path.join(data,'game-updates/b999/index.html'),'utf8'),'OLD DOWNLOADED GAME');
  } finally { fs.rmSync(root,{recursive:true,force:true}); }
});

test('distributed runtime and chooser have no updater module, status polling or update UI', () => {
  assert.deepEqual(APP_FILES, ['package.json','main.cjs','home/index.html','home/icon.png','home/darren.jpg']);
  const home=fs.readFileSync(path.join(__dirname,'../desktop-app/home/index.html'),'utf8');
  assert.ok(!/showUpdate|update\.json|id="update"|fetch\(/.test(home));
  for(const rel of ['desktop-app/updater.cjs','desktop-app/update-config.json','desktop-app/update-settings.cjs','tools/publish-game-update.cjs','.github/workflows/publish-game-update.yml'])
    assert.ok(!fs.existsSync(path.join(__dirname,'..',rel)), rel+' is removed');
});
