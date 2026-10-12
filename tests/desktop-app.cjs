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
let fails = 0;
function rec(check, ok, note = '') {
  if (!ok) fails++;
  console.log(ok ? 'PASS' : 'FAIL', 'desktop ·', check, note);
}
async function launch(env = {}) {
  const args = ['--no-sandbox', '--user-data-dir=' + profile, '--ignore-gpu-blocklist'];
  const app = await electron.launch(
    packaged
      ? { executablePath: packaged, args, env: { ...process.env, ...env } }
      : {
          executablePath: require(path.join(appDir, 'node_modules', 'electron')),
          args: [appDir, ...args],
          env: { ...process.env, ...env },
        }
  );
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
  let { app, p, log } = await launch();
  rec('opens on the game chooser', p.url() === 'snowday://game/__desktop/', p.url());
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
  await p.click('#play');
  await p.waitForTimeout(4000);
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
      const r = await fetch('snowday://game/%2E%2E%2Fdesktop-app%2Fmain.cjs').catch(() => null);
      return !r || !r.ok;
    })
  );
  await app.close();

  ({ app, p, log } = await launch());
  rec(
    'saves survive closing and reopening the app',
    (await p.evaluate(() => localStorage.getItem('desktop-test-marker'))) === 'kept'
  );
  await app.close();

  fs.rmSync(profile, { recursive: true, force: true });
  console.log(fails ? fails + ' failed' : 'all desktop checks passed');
  process.exit(fails ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
