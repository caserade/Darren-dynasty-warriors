// Checks the Electron desktop app (desktop-app/) by launching it and driving it with
// Playwright's Electron support. Not part of npm test: needs `npm install` in desktop-app/
// and the playwright package. Run: node tests/desktop-app.cjs [path-to-packaged-executable]
// Without an argument it runs the app from the checkout (desktop-app/ + dist/). Pass the
// executable of a Linux build (DESKTOP_PLATFORM=linux npm run build:win) to check the
// packaged folder layout. The packaged executable can also be tested on Windows.
const { _electron: electron } = require('playwright');
const path = require('node:path'),
  fs = require('node:fs'),
  os = require('node:os');
const appDir = path.join(__dirname, '..', 'desktop-app');
const packaged = process.argv[2];
const out = path.join(__dirname, '..', 'qa-screenshots') + path.sep;
fs.mkdirSync(out, { recursive: true });
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'snowday-desktop-'));
// A local web folder plays the part of the game-updates branch on GitHub. It is empty (nothing
// published) until the update checks at the end publish a newer game into it.
const http = require('node:http');
const { buildManifest } = require('../desktop-app/game-manifest.cjs');
const updDir = fs.mkdtempSync(path.join(os.tmpdir(), 'snowday-updsrv-'));
let updRequests = [];
const updServer = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split('?')[0]);
  updRequests.push(rel);
  const file = path.join(updDir, rel);
  if (!file.startsWith(updDir + path.sep) || !fs.existsSync(file)) {
    res.writeHead(404);
    return res.end();
  }
  res.writeHead(200);
  res.end(fs.readFileSync(file));
});
let fails = 0;
function rec(check, ok, note = '') {
  if (!ok) fails++;
  console.log(ok ? 'PASS' : 'FAIL', 'desktop ·', check, note);
}
async function launch(env = {}) {
  env = { SNOWDAY_UPDATE_URL: 'http://127.0.0.1:' + updServer.address().port, ...env };
  const args = ['--user-data-dir=' + profile];
  // Keep normal Windows sandbox/GPU behavior; the Linux container needs these flags.
  if (process.platform === 'linux') args.push('--no-sandbox', '--ignore-gpu-blocklist');
  const app = await electron.launch(
    packaged
      ? { executablePath: packaged, args, env: { ...process.env, ...env } }
      : {
          executablePath: require(path.join(appDir, 'node_modules', 'electron')),
          args: [appDir, ...args],
          env: { ...process.env, ...env },
        }
  );
  const actualProfile = await app.evaluate(({ app }) => app.getPath('userData'));
  if (path.resolve(actualProfile) !== path.resolve(profile)) {
    await app.close();
    throw new Error('Refusing to test outside the isolated save profile');
  }
  const p = await app.firstWindow();
  const log = [];
  p.on('pageerror', (e) => log.push('[pageerror] ' + e.message));
  p.on('console', (m) => m.type() === 'error' && log.push('[error] ' + m.text()));
  p.on('requestfailed', (r) =>
    log.push('[reqfail] ' + r.url() + ' ' + (r.failure()?.errorText || ''))
  );
  p.on('response', (r) => r.status() >= 400 && log.push('[http ' + r.status() + '] ' + r.url()));
  await p.waitForLoadState('load');
  return { app, p, log };
}
const tag = packaged ? 'packaged' : 'checkout';
(async () => {
  await new Promise((r) => updServer.listen(0, '127.0.0.1', r));
  let { app, p, log } = await launch();
  rec('opens on the 3D title screen', p.url() === 'snowday://game/3d/', p.url());
  await p.waitForFunction(() => !document.querySelector('#fx-start').disabled, null, {
    timeout: 240000,
  });
  rec('title screen shows Press Start', await p.isVisible('#fx-start'));
  await p.screenshot({ path: out + `desktop-00-title-${tag}.png` });
  await p.goto('snowday://game/__desktop/');
  rec(
    'chooser art loads',
    await p.evaluate(() => document.querySelector('img.hero').naturalWidth > 0)
  );
  await p.screenshot({ path: out + `desktop-01-chooser-${tag}.png` });

  await Promise.all([p.waitForNavigation(), p.keyboard.press('1')]);
  await p.waitForTimeout(2500);
  rec('key 1 opens the pixel game', p.url() === 'snowday://game/', p.url());
  rec('pixel title screen shows', await p.isVisible('#toSelect'));
  await p.screenshot({ path: out + `desktop-02-pixel-${tag}.png` });
  await p.click('#toSelect');
  await p.waitForTimeout(600);
  await p.click('#pickScarf');
  await p.waitForTimeout(2500);
  rec('pixel game starts (HUD visible)', await p.isVisible('#hud'));
  await p.evaluate(() => localStorage.setItem('desktop-test-marker', 'kept'));

  await p.goto('snowday://game/3d/?test');
  const t0 = Date.now();
  await p.waitForFunction(() => !document.querySelector('#play').disabled, null, {
    timeout: 240000,
  });
  rec(
    '3D valley loads models and animations',
    await p.evaluate(() => snowdayTest.heroes.every((h) => Object.keys(h.actions).length >= 11)),
    ((Date.now() - t0) / 1000).toFixed(1) + 's'
  );
  rec(
    'both games share one save storage',
    (await p.evaluate(() => localStorage.getItem('desktop-test-marker'))) === 'kept'
  );
  // Title screen, Story Mode, the next battle, hero select, briefing.
  for (const sel of [
    '#fx-start',
    '#fx-main-list [data-go="story"]',
    '.fx-battle:has(.fx-chip.next)',
    '#fx-hero-opts .fx-go',
    '#fx-begin',
  ])
    await p.click(sel);
  await p.waitForTimeout(4000);
  rec('a story battle starts from the menus', await p.evaluate(() => !snowdayTest.game.paused));
  await p.screenshot({ path: out + `desktop-03-3d-${tag}.png` });

  // Leaving to the open web is refused inside the window.
  await p.evaluate(() => (location.href = 'https://example.com/'));
  await p.waitForTimeout(800);
  rec('web links stay out of the game window', p.url().startsWith('snowday://game/3d/'), p.url());
  // Streamed reads from the app's own snowday:// files are reported as net::ERR_ABORTED by
  // Chromium once the stream ends, even though every byte arrives (checked just below), so
  // those entries are not counted as failures.
  const glbBytes = await p.evaluate(async () => {
    const names = ['darren', 'tormund', 'bucky', 'terrain'];
    return Promise.all(
      names.map(async (n) => {
        const reader = (await fetch('/3d/assets/' + n + '.glb')).body.getReader();
        let total = 0;
        for (let r; !(r = await reader.read()).done; ) total += r.value.length;
        return [n, total];
      })
    );
  });
  rec(
    '3D models arrive complete when streamed',
    glbBytes.every(
      ([n, b]) =>
        b === fs.statSync(path.join(appDir, '..', 'dist', '3d', 'assets', n + '.glb')).size
    ),
    glbBytes.map((x) => x.join(':')).join(' ')
  );
  const real = log.filter((l) => !/^\[reqfail\] \S+\.glb net::ERR_ABORTED$/.test(l));
  rec('no page errors or missing files', real.length === 0, real.slice(0, 5).join(' | '));
  rec(
    'outside the game folder is refused',
    await p.evaluate(async () => {
      const bad = [
        'snowday://game/%2E%2E%2Fdesktop-app%2Fmain.cjs',
        'snowday://game/..%5C..%5Cdesktop-app%5Cmain.cjs',
      ];
      for (const u of bad) {
        const r = await fetch(u).catch(() => null);
        if (r && r.ok) return false;
      }
      return true;
    })
  );
  rec(
    'a folder without its slash still loads its own files',
    await p.evaluate(async () => {
      const r = await fetch('snowday://game/3d');
      return r.ok && r.url === 'snowday://game/3d/' && /importmap/.test(await r.text());
    })
  );
  await app.close();

  ({ app, p, log } = await launch());
  rec(
    'saves survive closing and reopening the app',
    (await p.evaluate(() => localStorage.getItem('desktop-test-marker'))) === 'kept'
  );
  await app.close();

  // ---- Updates: a newer game is published, the menus say so, Update installs it ----
  const game = path.join(updDir, 'game');
  fs.cpSync(path.join(appDir, '..', 'dist'), game, { recursive: true });
  const html = path.join(game, '3d', 'index.html');
  fs.writeFileSync(
    html,
    fs
      .readFileSync(html, 'utf8')
      .replace('<head>', '<head>\n    <meta name="snowday-test" content="updated-game" />')
  );
  fs.writeFileSync(
    path.join(updDir, 'latest.json'),
    JSON.stringify({
      ...buildManifest(game, { build: 4000000000, notes: 'Test update from the desktop check' }),
      minApp: '1.9.0',
      app: {
        version: '9.9.9',
        url: 'https://github.com/caserade/darren-dynasty-warriors/releases',
      },
    })
  );
  ({ app, p, log } = await launch());
  await p.waitForFunction(() => !document.querySelector('#fx-start').disabled, null, {
    timeout: 240000,
  });
  await p.waitForSelector('#fx-upd-note:not([hidden])', { timeout: 20000 }).catch(() => {});
  rec(
    'title screen says a new update is available',
    /update available/i.test((await p.textContent('#fx-upd-note').catch(() => '')) || '') &&
      (await p.isVisible('#fx-upd-note'))
  );
  rec(
    'window title says so too',
    /update available/.test(
      await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getTitle())
    )
  );
  await p.screenshot({ path: out + `desktop-04-update-notice-${tag}.png` });
  await p.click('#fx-start');
  await p.waitForTimeout(500);
  rec(
    'main menu has Update marked NEW',
    await p.evaluate(() => {
      const b = document.querySelector('#fx-main-list [data-go="update"]');
      return !!b && b.classList.contains('fx-upd-new') && /ready to install/.test(b.textContent);
    })
  );
  await p.screenshot({ path: out + `desktop-05-update-menu-${tag}.png` });
  await p.click('#fx-main-list [data-go="update"]');
  await p.waitForSelector('#fx-upd-actions [data-act="install"]', { timeout: 15000 });
  rec(
    'Update page explains the update',
    /A new update is ready/.test(await p.textContent('#fx-upd-head')) &&
      /Test update from the desktop check/.test(await p.textContent('#fx-upd-text'))
  );
  rec(
    'Update page offers the new app as well',
    await p.isVisible('#fx-upd-actions [data-act="app"]')
  );
  rec(
    'Update now has focus, ready for Enter or the A button',
    await p.evaluate(() => document.activeElement?.dataset.act === 'install')
  );
  await p.waitForTimeout(700); // let the scroll finish unrolling
  await p.screenshot({ path: out + `desktop-06-update-page-${tag}.png` });
  updRequests = [];
  await Promise.all([
    p.waitForNavigation({ timeout: 60000 }),
    p.click('#fx-upd-actions [data-act="install"]'),
  ]);
  await p.waitForLoadState('load');
  rec(
    'only the changed file was downloaded',
    updRequests.filter((u) => u.startsWith('/game/')).join() === '/game/3d/index.html',
    updRequests.join(' ')
  );
  rec(
    'the game restarts as the new version',
    (await p.evaluate(() => document.querySelector('meta[name="snowday-test"]')?.content)) ===
      'updated-game'
  );
  await p.waitForFunction(() => !document.querySelector('#fx-start').disabled, null, {
    timeout: 240000,
  });
  await p.waitForSelector('#fx-upd-note:not([hidden])', { timeout: 10000 }).catch(() => {});
  rec(
    'title screen says the game was updated',
    /Updated to the newest version/.test(await p.textContent('#fx-upd-note'))
  );
  rec(
    'saves are kept through the update',
    (await p.evaluate(() => localStorage.getItem('desktop-test-marker'))) === 'kept'
  );
  await p.screenshot({ path: out + `desktop-07-updated-${tag}.png` });
  const real2 = log.filter((l) => !/^\[reqfail\] \S+\.glb net::ERR_ABORTED$/.test(l));
  rec('no page errors during the update', real2.length === 0, real2.slice(0, 5).join(' | '));
  await app.close();

  ({ app, p, log } = await launch());
  rec(
    'after reopening the app the new version is still used',
    (await p.evaluate(() => document.querySelector('meta[name="snowday-test"]')?.content)) ===
      'updated-game'
  );
  await app.close();
  updServer.close();
  fs.rmSync(updDir, { recursive: true, force: true });

  fs.rmSync(profile, { recursive: true, force: true });
  console.log(fails ? fails + ' failed' : 'all desktop checks passed');
  process.exit(fails ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
