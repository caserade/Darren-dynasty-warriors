// Checks the desktop app's game updater (desktop-app/updater.cjs) against a local web server
// that plays the part of GitHub. Plain Node, no Electron or network: node tests/desktop-update.cjs
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { buildManifest, checkManifest } = require('../desktop-app/game-manifest.cjs');
const { createUpdater, makeSource, newerVersion, safeLink } = require('../desktop-app/updater.cjs');
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
  const url = decodeURIComponent(req.url.split('?')[0]);
  requests.push(url);
  if (down) return req.socket.destroy();
  const file = path.join(server, url);
  if (!file.startsWith(server + path.sep) || !fs.existsSync(file)) {
    res.writeHead(404);
    return res.end();
  }
  let data = fs.readFileSync(file);
  if (tamper && url.endsWith(tamper)) data = Buffer.from('tampered');
  res.writeHead(200);
  res.end(data);
});

(async () => {
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const baseUrl = 'http://127.0.0.1:' + srv.address().port;
  const dataDir = path.join(tmp, 'userdata');
  const changes = [];
  const make = (extra = {}) =>
    createUpdater({
      bundledRoot,
      bundledManifest,
      dataDir,
      appVersion: '1.9.0',
      source: makeSource({ baseUrl }),
      onChange: (s) => changes.push(s.state),
      ...extra,
    });
  const gameFiles = () => requests.filter((u) => u.startsWith('/game/'));

  // An old, never-released updater kept its downloads in game-updates/; they are ignored.
  write(path.join(dataDir, 'game-updates', 'b999'), { 'index.html': 'OLD' });
  fs.writeFileSync(path.join(dataDir, 'game-updates', 'current.json'), '{"build":999}');

  let up = make();
  rec('first start uses the bundled game', up.root() === bundledRoot && up.status().bundled);
  rec(
    'old game-updates folder is ignored and left alone',
    read(path.join(dataDir, 'game-updates', 'b999'), 'index.html') === 'OLD'
  );
  rec('first start shows no "updated" news', up.status().justUpdated === false);

  fs.rmSync(server, { recursive: true, force: true });
  let s = await up.check();
  rec('nothing published yet is reported plainly', /No game updates/.test(s.message), s.message);

  publish(200, { ...base, 'index.html': '<h1>pixel v2</h1>', '3d/new.mjs': 'export {}' });
  requests = [];
  s = await up.check();
  rec(
    'a newer game is offered, not downloaded yet',
    s.state === 'available' && !gameFiles().length,
    s.state
  );
  rec(
    'the offer says what it is and how much downloads',
    s.offer.build === 200 &&
      s.offer.notes === 'test 200' &&
      s.offer.files === 2 &&
      s.offer.downloadBytes === '<h1>pixel v2</h1>'.length + 'export {}'.length,
    JSON.stringify(s.offer)
  );
  changes.length = 0;
  s = await up.install();
  rec('Update downloads it', s.state === 'ready', s.message);
  rec(
    'the page is told about each step',
    changes.includes('downloading') && changes.at(-1) === 'ready',
    changes.join(',')
  );
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
    'the menus are told once that the game was updated',
    up.status().justUpdated && up.status().game.notes === 'test 200'
  );
  up.seenUpdate();
  rec('...and not again after it was shown', up.status().justUpdated === false);

  up = make();
  rec(
    'after a restart the downloaded game is used',
    up.build() === 200 && up.root().endsWith('b200')
  );
  rec('the update news is not repeated after a restart', up.status().justUpdated === false);
  requests = [];
  s = await up.check();
  rec(
    'same game again: up to date, nothing downloaded',
    s.state === 'current' && !gameFiles().length
  );

  // A download finished but the app closed before the page reloaded: the next start uses it.
  publish(250, { ...base, 'index.html': '<h1>pixel v2.5</h1>' });
  await up.install();
  up = make();
  rec('a finished download is used from the next start', up.build() === 250);

  publish(260, { ...base, 'index.html': '<h1>pixel v2.5</h1>' }, { notes: 'same files again' });
  s = await up.check();
  rec('the same game published again is not offered', s.state === 'current' && !s.offer);

  publish(150, base);
  s = await up.check();
  rec('an older game never replaces a newer one', s.state === 'current' && up.build() === 250);

  publish(300, { ...base, 'game.js': 'console.log(3)' });
  tamper = 'game.js';
  s = await up.install();
  tamper = null;
  rec(
    'a file that fails its checksum stops the update',
    s.state === 'error' && up.build() === 250,
    s.message
  );
  rec(
    'a failed update leaves nothing half-written',
    !fs.existsSync(path.join(dataDir, 'updates', 'b300')) &&
      !fs.existsSync(path.join(dataDir, 'updates', 'b300.partial'))
  );
  rec('after a failed update a restart keeps the good game', make().build() === 250);

  // Simulate disk state after the process stops during a download, then after the
  // stage was renamed but before current.json was committed. Neither may replace b250.
  write(path.join(dataDir, 'Local Storage'), { 'save-sentinel': 'existing progress' });
  write(path.join(dataDir, 'updates', 'b310.partial'), { 'index.html': 'unfinished' });
  write(path.join(dataDir, 'updates', 'b320'), { 'index.html': 'not activated' });
  up = make();
  rec('interrupted stages keep the last activated game after restart', up.build() === 250);
  rec(
    'interrupted stages are discarded without touching saves',
    !fs.existsSync(path.join(dataDir, 'updates', 'b310.partial')) &&
      !fs.existsSync(path.join(dataDir, 'updates', 'b320')) &&
      read(path.join(dataDir, 'Local Storage'), 'save-sentinel') === 'existing progress'
  );

  const evil = publish(400, base);
  evil.files['../../escaped.txt'] = evil.files['game.js'];
  fs.writeFileSync(path.join(server, 'latest.json'), JSON.stringify(evil));
  s = await up.install();
  rec(
    'file names that leave the game folder are refused',
    s.state === 'error' && !fs.existsSync(path.join(dataDir, 'escaped.txt')) && up.build() === 250,
    s.message
  );
  rec('manifest check names the bad entry', /unsafe file name/.test(checkManifest(evil)));

  publish(500, base, { minApp: '9.0.0' });
  s = await up.check();
  rec(
    'a game that needs a newer app is not offered',
    s.state === 'needs-app' && !s.offer && up.build() === 250
  );

  publish(500, base, {
    app: {
      version: '1.10.0',
      url: 'https://github.com/caserade/darren-dynasty-warriors/releases/tag/app-v1.10.0',
    },
  });
  s = await up.check();
  rec(
    'a newer app is announced with its download page',
    s.app && s.app.version === '1.10.0' && s.state === 'available'
  );
  publish(500, base, { app: { version: '1.10.0', url: 'https://evil.example/app.zip' } });
  s = await up.check();
  rec('an app link outside GitHub is never offered', !s.app);
  publish(500, base, { app: { version: '1.9.0', url: 'https://github.com/x/y' } });
  s = await up.check();
  rec('the same app version is not announced', !s.app);

  down = true;
  s = await up.check();
  down = false;
  rec(
    'offline: says so and keeps playing the current game',
    s.state === 'offline' && up.build() === 250
  );

  // Damage the installed update: the next start falls back to the bundled game.
  fs.rmSync(path.join(dataDir, 'updates', 'b250', 'index.html'));
  up = make();
  rec('a damaged download falls back to the bundled game', up.root() === bundledRoot);

  publish(600, { ...base, 'index.html': '<h1>pixel v6</h1>' });
  await up.install();
  up.apply();
  const newerApp = createUpdater({
    bundledRoot,
    bundledManifest: { ...bundledManifest, build: 700 },
    dataDir,
    source: makeSource({ baseUrl }),
  });
  rec(
    'a new copy of the app with a newer game wins and old downloads are cleared',
    newerApp.root() === bundledRoot && !fs.existsSync(path.join(dataDir, 'updates', 'b600'))
  );

  up = make();
  publish(800, { ...base, 'index.html': '<h1>pixel v8</h1>' });
  await up.install();
  up.apply();
  up.reset();
  rec(
    '"use the game that came with the app" works',
    up.root() === bundledRoot && make().root() === bundledRoot
  );

  // Two clicks on Update share one download.
  publish(900, { ...base, 'index.html': '<h1>pixel v9</h1>' });
  up = make();
  requests = [];
  const [a, b] = await Promise.all([up.install(), up.install()]);
  rec(
    'pressing Update twice downloads once',
    a.state === 'ready' && b.state === 'ready' && gameFiles().length === 1,
    gameFiles().join(' ')
  );

  rec('no update source means updates are off', make({ source: null }).status().state === 'off');
  const pub = makeSource({ repo: 'caserade/darren-dynasty-warriors' });
  rec(
    'public repo: plain download from the game-updates branch, no key',
    pub.url('game/3d/a b.js', 'abc') ===
      'https://raw.githubusercontent.com/caserade/darren-dynasty-warriors/game-updates/game/3d/a%20b.js?v=abc'
  );
  rec('bad repo names give no source', makeSource({ repo: 'a/b/../c' }) === null);
  rec(
    'version compare',
    newerVersion('1.10.0', '1.9.0') &&
      !newerVersion('1.9.0', '1.9.0') &&
      !newerVersion('1.8.9', '1.9')
  );
  rec(
    'links: GitHub https only',
    !!safeLink('https://github.com/a/b') &&
      !safeLink('http://github.com/a') &&
      !safeLink('https://github.com.evil.io/') &&
      !safeLink('file:///c:/x')
  );

  const real = gameManifest();
  rec(
    'the real dist/ makes a valid manifest with the app release',
    !checkManifest(real) &&
      real.build > 1700000000 &&
      real.notes.length > 0 &&
      real.app.version === require('../desktop-app/package.json').version &&
      !!safeLink(real.app.url),
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
