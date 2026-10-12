'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, after } = require('node:test');
const { spawnSync } = require('node:child_process');
const { assertBuildEnvironment, assertSafeTree, stageApp, APP_FILES } = require('../desktop-app/package-security.cjs');
const { stageReturn } = require('../tools/stage-return-package.cjs');
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
  assert.throws(() => assertSafeTree(fixture({ 'update-config.json': JSON.stringify(cfg) })), /obsolete update settings/);
  assertSafeTree(fixture({ 'index.html': 'game' }));
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
