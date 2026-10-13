// Body parts going through each other over every clip (Claude update 12):
// node tools/review/collide.cjs [hero] [out.json]
// Counts vertex-frames of wings, arms, legs and tail pushed inside other body parts (new since
// the rest pose), per clip and per pair, plain and with the game's head look turned as far as it
// goes each way; and the lowest the feet reach per clip. LOOKS=plain skips the head-look runs.
const { chromium } = require('playwright');
const fs = require('fs');
const { serve } = require('./serve.cjs');
(async () => {
  const hero = process.argv[2] || 'Darren',
    out = process.argv[3];
  const server = await serve();
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium',
    args: ['--ignore-gpu-blocklist', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage({ viewport: { width: 64, height: 64 } });
  page.on('pageerror', (e) => console.error(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/review.html?hero=${hero}`);
  await page.waitForFunction(() => window.reviewReady, null, { timeout: 120000 });
  // anim.mjs procedural(): the head turns up to 0.65 rad sideways and 0.21 rad up or down.
  const looks = Object.fromEntries(
    Object.entries({
      plain: null,
      'look left': { head: [0, 0.65, 0] },
      'look right': { head: [0, -0.65, 0] },
      'look up': { head: [-0.21, 0, 0] },
      'look down': { head: [0.21, 0, 0] },
    }).filter(([k]) => !process.env.LOOKS || process.env.LOOKS.split(',').includes(k))
  );
  const all = {};
  for (const [k, turn] of Object.entries(looks)) {
    const r = (all[k] = await page.evaluate((o) => review.collide(o), {
      samples: +(process.env.WEIGHTS_SAMPLES || 12),
      turn,
      clips: process.env.CLIPS ? process.env.CLIPS.split(',') : null,
    }));
    const head = Object.entries(r.pairs)
      .filter(([p]) => /> head$/.test(p))
      .reduce((s, [, n]) => s + n, 0);
    const face = Object.entries(r.pairs)
      .filter(([p]) => /> face$/.test(p))
      .reduce((s, [, n]) => s + n, 0);
    console.log(
      `${k}: vertex-frames through the body ${r.total}, into the face ${face}, into the rest of the head ${head}`
    );
    for (const [p, n] of Object.entries(r.pairs).sort((a, b) => b[1] - a[1]))
      console.log('   ', p.padEnd(20), String(n).padStart(6), ' vertices', r.verts[p]);
    if (k !== 'plain') continue;
    console.log('  worst clips:');
    for (const [c, e] of Object.entries(r.clips)
      .sort((a, b) => b[1].inside - a[1].inside)
      .slice(0, 12))
      console.log(
        '   ',
        c.padEnd(14),
        String(e.inside).padStart(6),
        ' ',
        Object.entries(e.pairs)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([p, n]) => p + ' ' + n)
          .join(', ')
      );
    console.log('  feet below the ground (lowest foot skin, m):');
    console.log(
      '   ',
      Object.entries(r.ground)
        .filter(([, y]) => y < -0.02)
        .sort((a, b) => a[1] - b[1])
        .map(([c, y]) => c + ' ' + y.toFixed(3))
        .join(', ') || 'none'
    );
    console.log('  other parts below the ground by over 3 cm (deepest, m):');
    const deep = {};
    for (const [c, e] of Object.entries(r.under))
      for (const [p, y] of Object.entries(e))
        if (y < -0.03 && y < (deep[p]?.[1] ?? 0)) deep[p] = [c, y];
    console.log(
      '   ',
      Object.entries(deep)
        .map(([p, [c, y]]) => `${p} ${y.toFixed(3)} (${c})`)
        .join(', ') || 'none'
    );
  }
  await browser.close();
  server.close();
  if (out) fs.writeFileSync(out, JSON.stringify(all, null, 1));
})();
