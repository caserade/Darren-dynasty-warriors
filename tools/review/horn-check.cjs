// Is Darren's horn attached? (Claude update 15): node tools/review/horn-check.cjs <out-dir> [samples]
// Checks the horn's open bottom ring is under the skin, and per column around the horn how far
// its first point outside the skin sits from the skin (a big number = the horn floats there),
// at rest and over every clip. NOSHOTS=1 skips the head close-ups. Run from the game folder.
const { chromium } = require('playwright');
const fs = require('fs'),
  path = require('path');
const { serve } = require('./serve.cjs');
(async () => {
  const out = process.argv[2];
  fs.mkdirSync(out, { recursive: true });
  const samples = +(process.argv[3] || 8);
  const noShots = process.env.NOSHOTS;
  const server = await serve();
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium',
    args: ['--ignore-gpu-blocklist', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage({ viewport: { width: 640, height: 640 } });
  page.on('pageerror', (e) => console.error(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/review.html?hero=Darren`);
  await page.waitForFunction(() => window.reviewReady, null, { timeout: 120000 });
  const r = await page.evaluate(
    ({ samples }) => {
      const THREE = review.THREE;
      const horn = review.meshes.find((m) => /horn/i.test(m.name));
      const body = review.meshes.find((m) => m.name === 'Darren_Game');
      const v = new THREE.Vector3();
      const posed = (m) => {
        const p = m.geometry.attributes.position,
          a = new Float32Array(p.count * 3);
        for (let i = 0; i < p.count; i++) {
          m.getVertexPosition(i, v);
          m.localToWorld(v);
          a.set(v.toArray(), i * 3);
        }
        return a;
      };
      const ray = new THREE.Raycaster();
      function measure() {
        review.meshes[0].parent.updateMatrixWorld(true);
        const bp = posed(body),
          g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(bp, 3));
        g.setIndex(body.geometry.index);
        g.computeBoundingSphere();
        const bm = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
        const hp = posed(horn),
          n = hp.length / 3;
        // emergence gap: per column, the first ring outside the skin; its distance to the skin
        const tri = new THREE.Triangle(),
          cp = new THREE.Vector3(),
          idx = g.index;
        const surfDist = (p) => {
          let best = 9;
          for (let t = 0; t < idx.count; t += 3) {
            const a = idx.getX(t),
              b = idx.getX(t + 1),
              c = idx.getX(t + 2);
            if (Math.abs(bp[a * 3 + 1] - p.y) > 0.3) continue;
            tri.a.fromArray(bp, a * 3);
            tri.b.fromArray(bp, b * 3);
            tri.c.fromArray(bp, c * 3);
            tri.closestPointToPoint(p, cp);
            const d = cp.distanceTo(p);
            if (d < best) best = d;
          }
          return best;
        };
        const inside = (p) => {
          let votes = 0;
          for (const d of [
            [0, 1, 0],
            [1, 0.3, 0.2],
            [-1, 0.3, -0.2],
          ]) {
            ray.set(p, new THREE.Vector3(...d).normalize());
            if (ray.intersectObject(bm).length % 2 === 1) votes++;
          }
          return votes >= 2;
        };
        const cols = [];
        for (let s2 = 0; s2 < 24; s2++) {
          let r0 = -1;
          for (let r = 0; r < 16; r++) {
            const p = new THREE.Vector3().fromArray(hp, (r * 24 + s2) * 3);
            if (!inside(p)) {
              r0 = r;
              cols.push({ s: s2, ring: r, gap: +surfDist(p).toFixed(4) });
              break;
            }
          }
        }
        const rings = [];
        rings.cols = cols;
        for (let r = 0; r < 16; r++) {
          let out = 0,
            gap = 0;
          for (let s = 0; s < 24; s++) {
            const i = r * 24 + s,
              p = new THREE.Vector3().fromArray(hp, i * 3);
            // inside test: rays up and to the side, majority vote
            let votes = 0;
            for (const d of [
              [0, 1, 0],
              [1, 0.3, 0.2],
              [-1, 0.3, -0.2],
            ]) {
              ray.set(p, new THREE.Vector3(...d).normalize());
              if (ray.intersectObject(bm).length % 2 === 1) votes++;
            }
            const inside = votes >= 2;
            if (!inside) {
              out++;
              // how far outside: nearest body vertex
              let best = 9;
              for (let k = 0; k < bp.length; k += 3) {
                const dd = Math.hypot(bp[k] - p.x, bp[k + 1] - p.y, bp[k + 2] - p.z);
                if (dd < best) best = dd;
              }
              gap = Math.max(gap, best);
            }
          }
          rings.push({ out, gap: +gap.toFixed(4) });
        }
        g.dispose();
        return { rings, cols, maxGap: Math.max(...cols.map((c) => c.gap)), base0: rings[0].out };
      }
      review.shot({ bind: true, mode: 'clay' });
      const bind = measure();
      review.shot({ clip: 'Idle', t: 0, mode: 'clay' });
      const idle = measure();
      // every clip: base rings 0-1 outside the skin = an open hole at the horn root
      const worst = [];
      for (const c of review.clips) {
        for (let k = 0; k < samples; k++) {
          const t = (c.dur * k) / samples;
          review.shot({ clip: c.name, t, mode: 'clay' });
          const m = measure();
          worst.push({ clip: c.name, t: +t.toFixed(2), base0: m.base0, gap: m.maxGap });
        }
      }
      return { bind, idle, worst, clips: review.clips.length };
    },
    { samples }
  );
  fs.writeFileSync(path.join(out, 'probe.json'), JSON.stringify(r, null, 1));
  console.log('bind cols', JSON.stringify(r.bind.cols));
  console.log(
    'bind base ring verts outside skin',
    r.bind.base0,
    'max emergence gap',
    r.bind.maxGap
  );
  console.log(
    'frames with base ring showing:',
    r.worst.filter((w) => w.base0).length,
    'of',
    r.worst.length,
    ' frames with gap > 1cm:',
    r.worst.filter((w) => w.gap > 0.01).length,
    ' worst gap',
    Math.max(...r.worst.map((w) => w.gap))
  );
  console.log(r.worst.sort((a, b) => b.gap - a.gap).slice(0, 15));
  // close-ups
  const shots = [];
  for (const yaw of [0, 60, 90, 150, 180, 270])
    for (const mode of ['tex', 'clay'])
      shots.push({
        file: `head-${mode}-${yaw}.png`,
        clip: 'Idle',
        t: 0,
        yaw,
        pitch: 18,
        dist: 1.3,
        h: 1.55,
        mode,
      });
  if (!noShots)
    for (const j of shots) {
      await page.evaluate((j) => review.shot(j), j);
      await page.locator('canvas').screenshot({ path: path.join(out, j.file) });
    }
  await browser.close();
  server.close();
})();
