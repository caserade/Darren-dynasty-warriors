// Checks the desktop app's game updater (desktop-app/updater.cjs) against a local web server
// that plays the part of GitHub. Plain Node, no Electron or network: node tests/desktop-update.cjs
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { buildManifest, checkManifest } = require('../desktop-app/game-manifest.cjs');
const { createUpdater, makeSource } = require('../desktop-app/updater.cjs');
const { gameManifest } = require('../tools/publish-game-update.cjs');

let fails = 0;
function rec(check, ok, note = '') {
  if (!ok) fails++;
  console.log(ok ? 'PASS' : 'FAIL', 'updates ·', check, note);
}
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'snowday-update-'));
const write = (root, files) => {
  for (const [rel, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), text);
  }
};
const read = (root, rel) => fs.readFileSync(path.join(root, rel), 'utf8');

// The game that "came with the app".
const bundledRoot = path.join(tmp, 'bundled');
const base = {
  'index.html': '<h1>pixel v1</h1>',
  'game.js': 'console.log(1)',
  '3d/index.html': '<h1>3d</h1>',
  '3d/assets/big.glb': 'x'.repeat(5000),
};
write(bundledRoot, base);
const bundledManifest = buildManifest(bundledRoot, { build: 100 });

// The "GitHub" side: server/latest.json and server/game/.
const server = path.join(tmp, 'server');
let requests = [];
let tamper = null;
let down = false;
function publish(build, files, extra = {}) {
  fs.rmSync(server, { recursive: true, force: true });
  write(path.join(server, 'game'), files);
  const m = {
    ...buildManifest(path.join(server, 'game'), { build, notes: 'test ' + build }),
    ...extra,
  };
  fs.writeFileSync(path.join(server, 'latest.json'), JSON.stringify(m));
  return m;
}
const srv = http.createServer((req, res) => {
  requests.push(decodeURIComponent(req.url));
  if (down) return req.socket.destroy();
  const file = path.join(server, decodeURIComponent(req.url.split('?')[0]));
  if (!file.startsWith(server + path.sep) || !fs.existsSync(file)) {
    res.writeHead(404);
    return res.end();
  }
  let data = fs.readFileSync(file);
  if (tamper && req.url.endsWith(tamper)) data = Buffer.from('tampered');
  res.writeHead(200);
  res.end(data);
});

(async () => {
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const baseUrl = 'http://127.0.0.1:' + srv.address().port;
  const dataDir = path.join(tmp, 'userdata');
  const make = (extra = {}) =>
    createUpdater({
      bundledRoot,
      bundledManifest,
      dataDir,
      appVersion: '1.1.0',
      config: { baseUrl },
      ...extra,
    });
  const gameFiles = () => requests.filter((u) => u.startsWith('/game/'));

  let up = make();
  rec('first start uses the bundled game', up.root() === bundledRoot && up.build() === 100);
  rec('first start shows no "updated" news', up.status().justUpdated === false);

  fs.rmSync(server, { recursive: true, force: true });
  let s = await up.check();
  rec(
    'nothing published yet is reported plainly',
    s.state === 'error' && /No game updates/.test(s.message),
    s.message
  );

  publish(200, { ...base, 'index.html': '<h1>pixel v2</h1>', '3d/new.mjs': 'export {}' });
  requests = [];
  s = await up.check();
  rec('a newer game downloads', s.state === 'ready', s.message);
  rec(
    'only the changed and new files are downloaded',
    gameFiles().sort().join() === '/game/3d/new.mjs,/game/index.html',
    gameFiles().join(' ')
  );
  rec('nothing switches before apply()', up.root() === bundledRoot);
  rec('apply switches to the new game', up.apply() && up.build() === 200);
  rec(
    'new game has the new and the unchanged files',
    read(up.root(), 'index.html') === '<h1>pixel v2</h1>' &&
      read(up.root(), '3d/assets/big.glb') === base['3d/assets/big.glb'] &&
      read(up.root(), '3d/new.mjs') === 'export {}'
  );
  rec('the bundled game is never changed', read(bundledRoot, 'index.html') === '<h1>pixel v1</h1>');
  rec(
    'the start screen is told about the update',
    up.status().justUpdated && up.status().notes === 'test 200'
  );

  up = make();
  rec(
    'after a restart the downloaded game is used',
    up.build() === 200 && up.root().endsWith('b200')
  );
  rec('the update news is shown only once', up.status().justUpdated === false);
  requests = [];
  s = await up.check();
  rec(
    'same game again: up to date, nothing downloaded',
    s.state === 'current' && !gameFiles().length
  );

  publish(150, base);
  s = await up.check();
  rec('an older game never replaces a newer one', s.state === 'current' && up.build() === 200);

  publish(300, { ...base, 'game.js': 'console.log(3)' });
  tamper = 'game.js';
  s = await up.check();
  tamper = null;
  rec(
    'a file that fails its checksum stops the update',
    s.state === 'error' && up.build() === 200,
    s.message
  );
  rec(
    'a failed update leaves nothing half-written',
    !fs.existsSync(path.join(dataDir, 'game-updates', 'b300')) &&
      !fs.existsSync(path.join(dataDir, 'game-updates', 'b300.partial'))
  );
  rec('after a failed update a restart keeps the good game', make().build() === 200);

  const evil = publish(400, base);
  evil.files['../../escaped.txt'] = evil.files['game.js'];
  fs.writeFileSync(path.join(server, 'latest.json'), JSON.stringify(evil));
  s = await up.check();
  rec(
    'file names that leave the game folder are refused',
    s.state === 'error' && !fs.existsSync(path.join(dataDir, 'escaped.txt')) && up.build() === 200,
    s.message
  );
  rec('manifest check names the bad entry', /unsafe file name/.test(checkManifest(evil)));

  publish(500, base, { minApp: '9.0.0' });
  s = await up.check();
  rec(
    'a game that needs a newer app is not installed',
    s.state === 'needs-app' && up.build() === 200
  );

  down = true;
  s = await up.check();
  down = false;
  rec(
    'offline: says so and keeps playing the current game',
    s.state === 'offline' && up.build() === 200
  );

  // Damage the installed update: the next start falls back to the bundled game.
  fs.rmSync(path.join(dataDir, 'game-updates', 'b200', '3d', 'new.mjs'));
  up = make();
  rec('a damaged download falls back to the bundled game', up.root() === bundledRoot);

  publish(600, { ...base, 'index.html': '<h1>pixel v6</h1>' });
  await up.check();
  up.apply();
  const newerApp = createUpdater({
    bundledRoot,
    bundledManifest: { ...bundledManifest, build: 700 },
    dataDir,
    config: { baseUrl },
  });
  rec(
    'a new copy of the app with a newer game wins and old downloads are cleared',
    newerApp.root() === bundledRoot && !fs.existsSync(path.join(dataDir, 'game-updates', 'b600'))
  );

  up = make();
  publish(800, { ...base, 'index.html': '<h1>pixel v8</h1>' });
  await up.check();
  up.apply();
  up.reset();
  rec(
    '"go back to the bundled game" works',
    up.root() === bundledRoot && make().root() === bundledRoot
  );

  rec('no update source means updates are off', make({ config: {} }).status().state === 'off');
  const priv = makeSource({
    repo: 'caserade/darren-dynasty-warriors',
    branch: 'game-updates',
    token: 'k',
  });
  rec(
    'private repo: GitHub API with the read-only key',
    priv.url('game/3d/a b.js') ===
      'https://api.github.com/repos/caserade/darren-dynasty-warriors/contents/game/3d/a%20b.js?ref=game-updates' &&
      priv.headers.Authorization === 'Bearer k' &&
      priv.headers.Accept === 'application/vnd.github.raw'
  );
  const pub = makeSource({ repo: 'caserade/snowday-updates' });
  rec(
    'public repo: plain download, no key',
    pub.url('latest.json') ===
      'https://raw.githubusercontent.com/caserade/snowday-updates/game-updates/latest.json' &&
      !pub.headers.Authorization
  );

  const real = gameManifest();
  rec(
    'the real dist/ makes a valid manifest',
    !checkManifest(real) && real.build > 1700000000 && real.notes.length > 0,
    Object.keys(real.files).length + ' files, "' + real.notes + '"'
  );

  srv.close();
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(fails ? fails + ' failed' : 'all update checks passed');
  process.exit(fails ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
