'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, after } = require('node:test');
const { spawnSync } = require('node:child_process');
const { publicSettings, runtimeSettings } = require('../desktop-app/update-settings.cjs');
const { assertBuildEnvironment, assertSafeTree, stageApp, APP_FILES } = require('../desktop-app/package-security.cjs');
const { stageReturn } = require('../tools/stage-return-package.cjs');
const { makeSource, createUpdater } = require('../desktop-app/updater.cjs');
const { buildManifest } = require('../desktop-app/game-manifest.cjs');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'snowday-packaging-'));
after(() => fs.rmSync(tmp, { recursive: true, force: true }));
const sentinel = 'SYNTHETIC-ONLY-' + 'DO-NOT-SHIP';
const cfg = { repo: 'example/game', branch: 'game-updates' };
let sequence = 0;
function fixture(files = {}) {
  const root = path.join(tmp, String(sequence++));
  fs.mkdirSync(root);
  for (const [rel, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), content);
  }
  return root;
}

test('distributed settings are an explicit allowlist, with no mutation or secret in errors', () => {
  assert.deepEqual(publicSettings(cfg), cfg);
  for (const extra of [{ token: sentinel }, { password: sentinel }, { headers: { Authorization: sentinel } }]) {
    assert.throws(() => publicSettings({ ...cfg, ...extra }), (e) => !e.message.includes(sentinel));
  }
  for (const baseUrl of ['https://user:pass@example.com', 'https://example.com/?token=x', 'https://example.com/#x', 'http://example.com'])
    assert.throws(() => publicSettings({ baseUrl }));
  assert.deepEqual(publicSettings({ baseUrl: 'https://example.com/game' }), { baseUrl: 'https://example.com/game' });
});

test('build environment fails closed, without disclosing the value', () => {
  assertBuildEnvironment({});
  assert.throws(() => assertBuildEnvironment({ SNOWDAY_UPDATE_TOKEN: sentinel }),
    (e) => /Packaging refused/.test(e.message) && !e.message.includes(sentinel));
});

test('real packaging entry point refuses an inherited key before loading packaging tools', () => {
  const result = spawnSync(process.execPath, [path.join(__dirname, '../desktop-app/build-windows.cjs')], {
    env: { ...process.env, SNOWDAY_UPDATE_TOKEN: sentinel }, encoding: 'utf8',
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Packaging refused/);
  assert.ok(!(result.stdout + result.stderr).includes(sentinel));
});

test('credential and environment files are refused at any depth, including case variants', () => {
  for (const name of ['update-token.txt', 'home/.env.local', '3d/UPDATE-TOKEN.TXT', 'nested/.npmrc', 'nested/credentials.json', 'key.pem']) {
    const root = fixture({ [name]: sentinel });
    assert.throws(() => assertSafeTree(root), /Packaging refused/);
  }
});

test('credential-bearing config and recognizable credentials disguised as assets are refused', () => {
  assert.throws(() => assertSafeTree(fixture({ 'nested/update-config.json': JSON.stringify({ ...cfg, token: sentinel }) })));
  const fakeGithub = 'gh' + 'p_' + 'X'.repeat(36);
  assert.throws(() => assertSafeTree(fixture({ 'image.dat': fakeGithub })), /credential-like content/);
  assertSafeTree(fixture({ 'update-config.json': JSON.stringify(cfg), 'index.html': 'game' }));
});

test('directory links cannot import files outside the package', () => {
  const root = fixture();
  const outside = fixture({ 'local.txt': sentinel });
  fs.symlinkSync(outside, path.join(root, 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => assertSafeTree(root), /symbolic link/);
});

test('app staging includes only exact runtime files and excludes unapproved files and old builds', () => {
  const files = Object.fromEntries(APP_FILES.map((name) => [name, name === 'package.json' ? '{}' : 'runtime']));
  const source = fixture({ ...files, 'notes.txt': sentinel, 'out/old/update-token.txt': sentinel, 'node_modules/.env': sentinel });
  const dest = path.join(tmp, 'app-stage');
  stageApp(source, dest);
  assertSafeTree(dest);
  const names = fs.readdirSync(dest, { recursive: true }).filter((name) => fs.statSync(path.join(dest, name)).isFile());
  assert.equal(names.length, APP_FILES.length);
  for (const name of names) assert.ok(!fs.readFileSync(path.join(dest, name)).includes(sentinel));
  fs.writeFileSync(path.join(source, 'update-token.txt'), sentinel);
  assert.throws(() => stageApp(source, path.join(tmp, 'blocked-stage')));
  assert.ok(!fs.existsSync(path.join(tmp, 'blocked-stage')));
});

test('return archives exclude nested dependencies and previous packages, and reject local credentials', () => {
  const source = fixture({ 'index.html': 'game', 'desktop-app/out/old.txt': sentinel, 'desktop-app/node_modules/local.txt': sentinel });
  const dest = path.join(tmp, 'return-stage');
  stageReturn(source, dest);
  assert.ok(!fs.existsSync(path.join(dest, 'desktop-app/out')));
  assert.ok(!fs.existsSync(path.join(dest, 'desktop-app/node_modules')));
  fs.writeFileSync(path.join(source, '.env'), sentinel);
  assert.throws(() => stageReturn(source, path.join(tmp, 'blocked-return')));
});

test('only locally supplied runtime credentials enable the GitHub API route', () => {
  const runtime = runtimeSettings(cfg, { SNOWDAY_UPDATE_TOKEN: sentinel });
  const source = makeSource(runtime);
  assert.equal(source.headers.Authorization, 'Bearer ' + sentinel);
  assert.equal(new URL(source.url('latest.json')).origin, 'https://api.github.com');
  assert.ok(!JSON.stringify(cfg).includes(sentinel));
  assert.deepEqual(runtimeSettings({ ...cfg, token: sentinel }, {}), {});
  assert.deepEqual(runtimeSettings(cfg, { SNOWDAY_UPDATE_TOKEN: sentinel, SNOWDAY_NO_UPDATES: '1' }), {});
  const custom = makeSource(runtimeSettings(cfg, { SNOWDAY_UPDATE_TOKEN: sentinel, SNOWDAY_UPDATE_URL: 'http://127.0.0.1:1234' }));
  assert.deepEqual(custom.headers, {});
  assert.deepEqual(makeSource(runtimeSettings(cfg, {})).headers, {});
});

test('private runtime requests authenticate but never persist credentials; unauthenticated failure keeps bundled game', async () => {
  const bundledRoot = fixture({ 'index.html': 'game' });
  const bundledManifest = buildManifest(bundledRoot, { build: 1 });
  const dataDir = fixture();
  let calls = 0;
  const updater = createUpdater({ bundledRoot, bundledManifest, dataDir,
    config: runtimeSettings(cfg, { SNOWDAY_UPDATE_TOKEN: sentinel }),
    fetch: async (url, options) => {
      calls++;
      assert.equal(new URL(url).origin, 'https://api.github.com');
      assert.equal(options.headers.Authorization, 'Bearer ' + sentinel);
      return new Response(JSON.stringify(bundledManifest));
    } });
  assert.equal((await updater.check()).state, 'current');
  assert.equal(calls, 1);
  for (const name of fs.readdirSync(dataDir, { recursive: true })) {
    const file = path.join(dataDir, name);
    if (fs.statSync(file).isFile()) assert.ok(!fs.readFileSync(file).includes(sentinel));
  }
  const denied = createUpdater({ bundledRoot, bundledManifest, dataDir, config: runtimeSettings(cfg, {}),
    fetch: async (url, options) => {
      assert.equal(new URL(url).origin, 'https://raw.githubusercontent.com');
      assert.ok(!options.headers.Authorization);
      return new Response('', { status: 404 });
    } });
  assert.equal((await denied.check()).state, 'error');
  assert.equal(denied.root(), bundledRoot);
});
