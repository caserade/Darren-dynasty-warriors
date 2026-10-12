// In-game look at one hero (Claude update 9): starts the 3D game in test mode, plays the hero
// and saves a few framed screenshots. node tools/review/ingame.cjs <out-dir> [hero 0|1|2] [prefix]
// Needs the game server running on port 8000 (npm start) and Playwright's Chromium.
const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const [out, hero = '1', prefix = 'ingame'] = process.argv.slice(2);
  fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch({
    executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium',
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
  p.on('pageerror', (e) => console.error(e.message));
  await p.goto('http://127.0.0.1:8000/3d/?test');
  await p.waitForFunction(() => window.snowdayTest?.ready, null, { timeout: 240000 });
  await p.click('#play');
  await p.waitForTimeout(800);
  for (let i = 0; i < 8; i++) {
    await p.keyboard.press('Enter');
    await p.waitForTimeout(100);
  }
  const shot = async (name, yaw, pitch, dist, steps) => {
    await p.evaluate(
      ([yaw, pitch, dist, steps, hero]) => {
        const t = snowdayTest,
          g = t.game;
        if (g.selected !== hero) g.switchTo(hero);
        g.player.inv = 999;
        t.setView(g.player.yaw + yaw, pitch, dist);
        for (const s of steps) {
          if (s === 'attack') g.attack();
          else if (s === 'foes')
            for (const [dx, dz] of [
              [1.6, 0.4],
              [-0.4, 1.7],
            ])
              g.enemies.push(g.makeFoe('gopher', g.player.x + dx, g.player.z + dz));
          else t.advance(s);
        }
        t.advance(0.05);
      },
      [yaw, pitch, dist, steps, +hero]
    );
    await p.screenshot({ path: `${out}/${prefix}-${name}.png` });
  };
  await shot('front', Math.PI, 0.18, 4.2, [1.2]);
  await shot('back', 0, 0.3, 5.5, [0.3]);
  await shot('side', Math.PI / 2, 0.15, 4.2, [0.3]);
  await shot('swing', Math.PI * 0.8, 0.25, 5, ['foes', 0.3, 'attack', 0.12]);
  await shot('swing2', Math.PI * 0.8, 0.25, 5, ['attack', 0.2, 'attack', 0.12]);
  await b.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
