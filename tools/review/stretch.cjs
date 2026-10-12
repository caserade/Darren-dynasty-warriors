// Worst mesh stretch per bone over every clip (Claude update 9): node tools/review/stretch.cjs [hero]
// Prints, for each bone, the most an edge it drives is stretched or squashed in any clip frame
// (1.00 = never changes length), and in which clip. Big numbers mean tearing or pinching.
// 'badly stretched edges' counts edges over 1.6x or under 0.5x their rest length in that bone's
// worst frame: roughly how much of the surface visibly tears or pinches.
const { chromium } = require('playwright');
const { serve } = require('./serve.cjs');
(async () => {
  const hero = process.argv[2] || 'Darren';
  const server = await serve();
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium',
    args: ['--ignore-gpu-blocklist', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage({ viewport: { width: 64, height: 64 } });
  await page.goto(`http://127.0.0.1:${server.address().port}/review.html?hero=${hero}`);
  await page.waitForFunction(() => window.reviewReady, null, { timeout: 120000 });
  const worst = await page.evaluate(() => {
    const w = {};
    for (const c of review.clips)
      for (let k = 0; k < 8; k++) {
        const s = review.stretch({ clip: c.name, t: (c.dur * k) / 8 });
        for (const [bone, v] of Object.entries(s)) {
          const e = (w[bone] ??= { max: 1, maxClip: '', min: 1, minClip: '', bad: 0, badClip: '' });
          if (v.bad > e.bad) Object.assign(e, { bad: v.bad, badClip: c.name });
          if (v.max > e.max) Object.assign(e, { max: v.max, maxClip: c.name });
          if (v.min < e.min) Object.assign(e, { min: v.min, minClip: c.name });
        }
      }
    return w;
  });
  const rows = Object.entries(worst).sort((a, b) => b[1].bad - a[1].bad);
  for (const [bone, e] of rows)
    console.log(
      bone.padEnd(14),
      'stretch',
      e.max.toFixed(2),
      e.maxClip.padEnd(12),
      'squash',
      e.min.toFixed(2),
      e.minClip.padEnd(12),
      'badly stretched edges',
      e.bad,
      e.badClip
    );
  console.log(
    'total bad edges (worst frame per bone):',
    rows.reduce((s, [, e]) => s + e.bad, 0)
  );
  await browser.close();
  server.close();
})();
