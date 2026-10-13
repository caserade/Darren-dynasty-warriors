// Skin-weight diagnosis over every clip (Claude update 11): node tools/review/weights.cjs [hero] [out.json]
// Prints the headline numbers (tears, strain, volume) and the worst clips, bone pairs and regions,
// and the static checks (influences far from their bone, left/right mix-ups, hard weight seams).
// The full result goes to out.json when given, for comparing passes.
// WEIGHTS_SAMPLES=n samples per clip (default 12). STRETCH_SKIP=ClipA,ClipB leaves clips out.
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
  const r = await page.evaluate((o) => review.diagnose(o), {
    samples: +(process.env.WEIGHTS_SAMPLES || 12),
    skip: (process.env.STRETCH_SKIP || '').split(','),
  });
  await browser.close();
  server.close();
  if (out) fs.writeFileSync(out, JSON.stringify(r, null, 1));
  const top = (o, n, f = (v) => v) =>
    Object.entries(o)
      .sort((a, b) => f(b[1]) - f(a[1]))
      .slice(0, n);
  console.log(`${hero}: torn edge-frames ${r.tears}, strained edge-frames ${r.strain}`);
  console.log(
    `drift of skin inside one body part from its bone: ${r.drift.cm.toFixed(2)} cm average (${r.drift.verts} vertices: ` +
      Object.entries(r.drift.by)
        .map(([k, v]) => `${k} ${v.toFixed(1)}`)
        .join(', ') +
      ')'
  );
  console.log(
    `scarf vertex-frames sunk into the body ${r.scarf.sunk}, lifted off it ${r.scarf.lifted} (` +
      Object.entries(r.scarf.by)
        .map(([k, e]) => `${k} ${e.sunk}/${e.lifted}`)
        .join(', ') +
      ')'
  );
  console.log(
    `body volume ${(r.volume.lo * 100).toFixed(1)}% (${r.volume.loClip}) to ${(r.volume.hi * 100).toFixed(1)}% (${r.volume.hiClip}) of rest`
  );
  console.log('\nworst clips (torn edge-frames, worst single frame at time):');
  for (const [c, e] of top(r.clips, 12, (e) => e.tears))
    console.log(
      ' ',
      c.padEnd(14),
      String(e.tears).padStart(6),
      ' peak',
      e.peak,
      '@',
      e.peakT.toFixed(2) + 's'
    );
  console.log('\nworst bone pairs (torn edge-frames):');
  for (const [k, n] of top(r.pairs, 14)) console.log(' ', k.padEnd(44), n);
  console.log('\nregions (vertices ever torn / ever strained / total):');
  for (const [k, e] of top(r.regions, 20, (e) => e.torn))
    console.log(
      ' ',
      k.padEnd(30),
      String(e.torn).padStart(5),
      String(e.strained).padStart(6),
      String(e.verts).padStart(6),
      ' ',
      top(e.clips, 3)
        .map(([c, n]) => c + ' ' + n)
        .join(', ')
    );
  console.log('\ninfluences per vertex (0..4):', r.statics.influences.join(' '));
  console.log('far-away influences (bone on main bone: vertices, max weight):');
  for (const [k, e] of top(r.statics.far, 12, (e) => e.n))
    console.log(' ', k.padEnd(44), e.n, e.w.toFixed(2));
  console.log('left/right mix-ups (vertices, max weight):');
  for (const [k, e] of top(r.statics.crossSide, 12, (e) => e.n))
    console.log(' ', k.padEnd(44), e.n, e.w.toFixed(2));
  console.log('hard weight seams (edges whose weights jump by over half):');
  for (const [k, n] of top(r.statics.hardSeams, 12)) console.log(' ', k.padEnd(44), n);
})();
