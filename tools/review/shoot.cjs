// Renders review sheets of one hero: node tools/review/shoot.cjs <out-dir> <jobs.json> [hero]
// jobs.json: [{ "file": "front.png", "clip": "Idle", "t": 0, "yaw": 0, "mode": "tex" }, ...]
const { chromium } = require('playwright');
const fs = require('fs'),
  path = require('path');
const { serve } = require('./serve.cjs');
(async () => {
  const [out, jobsFile, hero = 'Darren'] = process.argv.slice(2);
  const jobs = JSON.parse(fs.readFileSync(jobsFile, 'utf8'));
  fs.mkdirSync(out, { recursive: true });
  const server = await serve();
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium',
    args: ['--ignore-gpu-blocklist', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage({ viewport: { width: 640, height: 640 } });
  page.on('console', (m) => m.type() === 'error' && console.error(m.text()));
  page.on('pageerror', (e) => console.error(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/review.html?hero=${hero}`);
  await page.waitForFunction(() => window.reviewReady, null, { timeout: 120000 });
  const info = await page.evaluate(() => ({
    clips: review.clips,
    bones: review.bones,
    stats: review.stats(),
  }));
  fs.writeFileSync(path.join(out, 'info.json'), JSON.stringify(info, null, 1));
  for (const j of jobs) {
    await page.evaluate((j) => review.shot(j), j);
    await page.locator('canvas').screenshot({ path: path.join(out, j.file) });
  }
  await browser.close();
  server.close();
})();
