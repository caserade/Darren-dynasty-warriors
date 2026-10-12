// Real-browser check of both games (Playwright + Chromium). Start the game first with: node desktop-server.cjs
// then run: node tests/browser-qa.cjs   (needs the playwright package; not part of npm test).
// Screenshots and results.json go to qa-screenshots/.
const { chromium } = require('playwright');
const path = require('node:path'),
  fs = require('node:fs');
const out = path.join(__dirname, '..', 'qa-screenshots') + path.sep;
fs.mkdirSync(out, { recursive: true });
const B = process.env.GAME_URL || 'http://127.0.0.1:8000';
const results = [];
function rec(area, check, ok, note = '') {
  results.push({ area, check, ok, note });
  console.log(ok ? 'PASS' : 'FAIL', area, '·', check, note);
}
(async () => {
  const b = await chromium.launch({
    args: [
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      '--ignore-gpu-blocklist',
    ],
  });
  const log = [];
  async function ctxPage(opts = {}, tag = '') {
    const c = await b.newContext({ viewport: { width: 1440, height: 900 }, ...opts });
    const p = await c.newPage();
    p.on('console', (m) => {
      if (['error', 'warning'].includes(m.type())) log.push(`${tag} [${m.type()}] ${m.text()}`);
    });
    p.on('pageerror', (e) => log.push(tag + ' [pageerror] ' + e.message));
    p.on('requestfailed', (r) =>
      log.push(tag + ' [reqfail] ' + r.url() + ' ' + (r.failure()?.errorText || ''))
    );
    p.on('response', (r) => {
      if (r.status() >= 400) log.push(tag + ' [http ' + r.status() + '] ' + r.url());
    });
    return { c, p };
  }
  const shot = (p, n) => p.screenshot({ path: out + n + '.png' });
  const hold = async (p, key, ms) => {
    await p.keyboard.down(key);
    await p.waitForTimeout(ms);
    await p.keyboard.up(key);
  };
  // ---------- PIXEL ----------
  {
    const { c, p } = await ctxPage({}, 'pixel');
    await p.goto(B + '/');
    await p.waitForTimeout(2500);
    await shot(p, 'pixel-01-title');
    await p.click('#toSelect');
    await p.waitForTimeout(800);
    await shot(p, 'pixel-02-style-select');
    await p.click('#pickScarf');
    await p.waitForTimeout(3000);
    await shot(p, 'pixel-03-start');
    const hud = await p.isVisible('#hud');
    rec('pixel', 'game starts and HUD shows', hud);
    // dismiss any dialog
    for (let i = 0; i < 6; i++) {
      if (await p.isVisible('#dialog')) await p.keyboard.press('Enter');
      await p.waitForTimeout(300);
    }
    await shot(p, 'pixel-04-after-intro');
    await hold(p, 'KeyD', 1200);
    await hold(p, 'KeyS', 800);
    await p.keyboard.press('KeyJ');
    await p.waitForTimeout(200);
    await p.keyboard.press('KeyJ');
    await p.waitForTimeout(600);
    await shot(p, 'pixel-05-moved-attacked');
    await p.keyboard.press('KeyP');
    await p.waitForTimeout(800);
    const paused = await p.isVisible('#sPause');
    rec('pixel', 'P opens pause menu', paused);
    await shot(p, 'pixel-06-pause');
    // controller settings panel
    await p.evaluate(() =>
      document.querySelectorAll('#sPause details').forEach((d) => (d.open = true))
    );
    await p.waitForTimeout(300);
    await p.evaluate(() =>
      document.querySelector('img[src="assets/darren-reference.png"]')?.scrollIntoView()
    );
    await p
      .waitForFunction(
        () => {
          const i = document.querySelector('img[src="assets/darren-reference.png"]');
          return i && i.complete && i.naturalWidth > 0;
        },
        null,
        { timeout: 20000 }
      )
      .catch(() => {});
    const ref = await p.evaluate(() => {
      const i = document.querySelector('img[src="assets/darren-reference.png"]');
      return i ? { w: i.naturalWidth, h: i.naturalHeight, complete: i.complete } : null;
    });
    rec(
      'pixel',
      'Darren reference image loads in pause menu',
      !!ref && ref.w === 1254 && ref.complete,
      JSON.stringify(ref)
    );
    await p.evaluate(() =>
      document.querySelector('img[src="assets/darren-reference.png"]')?.scrollIntoView()
    );
    await p.waitForTimeout(500);
    await shot(p, 'pixel-07-pause-reference');
    await p.click('#resume').catch(() => p.keyboard.press('KeyP'));
    await p.waitForTimeout(500);
    rec('pixel', 'resume closes pause', !(await p.isVisible('#sPause')));
    await c.close();
  }
  {
    const { c, p } = await ctxPage({}, 'pixel-fw');
    await p.goto(B + '/');
    await p.waitForTimeout(2000);
    await p.click('#startFirewood');
    await p.waitForTimeout(3000);
    for (let i = 0; i < 6; i++) {
      if (await p.isVisible('#dialog')) await p.keyboard.press('Enter');
      await p.waitForTimeout(300);
    }
    await shot(p, 'pixel-08-firewood-chapter');
    rec('pixel', 'Chapter 2 Firewood starts from title', await p.isVisible('#hud'));
    await c.close();
  }
  {
    const { c, p } = await ctxPage(
      {
        viewport: { width: 412, height: 915 },
        hasTouch: true,
        isMobile: true,
        deviceScaleFactor: 2,
      },
      'pixel-phone'
    );
    await p.goto(B + '/');
    await p.waitForTimeout(2500);
    await shot(p, 'pixel-09-phone-title');
    await p.tap('#toSelect');
    await p.waitForTimeout(600);
    await p.tap('#pickScarf');
    await p.waitForTimeout(3000);
    for (let i = 0; i < 6; i++) {
      if (await p.isVisible('#dialog')) await p.tap('#dialog').catch(() => {});
      await p.waitForTimeout(300);
    }
    await shot(p, 'pixel-10-phone-play');
    rec('pixel', 'phone portrait: touch stick visible', await p.isVisible('#stick'));
    await c.close();
  }
  // ---------- 3D ----------
  {
    const { c, p } = await ctxPage({}, '3d');
    const t0 = Date.now();
    await p.goto(B + '/3d/?test');
    await p.waitForFunction(() => !document.querySelector('#play').disabled, null, {
      timeout: 180000,
    });
    rec(
      '3d',
      'valley loads (models + terrain, 33 animation clips)',
      await p.evaluate(() => snowdayTest.heroes.every((h) => Object.keys(h.actions).length >= 11)),
      `${((Date.now() - t0) / 1000).toFixed(1)}s`
    );
    await shot(p, '3d-01-menu');
    await p.click('#play');
    await p.waitForTimeout(1500);
    await shot(p, '3d-02-enter');
    // software GL here runs ~1-3 fps, so waits are frame/state based rather than wall-clock
    await p.evaluate((q) => {
      const e = document.querySelector('#quality');
      e.value = q;
      e.dispatchEvent(new Event('change'));
    }, 'low');
    const frames = (n) =>
      p.evaluate(
        (n) =>
          new Promise((r) => {
            let k = 0;
            (function s() {
              if (++k > n) r();
              else requestAnimationFrame(s);
            })();
          }),
        n
      );
    const idle = () =>
      p.waitForFunction(
        () => {
          const a = snowdayTest.game.player;
          return !a.action && a.air === 0 && a.cooldown <= 0 && !a.charging;
        },
        null,
        { timeout: 60000 }
      );
    const pos = () =>
      p.evaluate(() => {
        const a = snowdayTest.game.player;
        return {
          x: a.x,
          z: a.z,
          y: a.y,
          anim: a.animation,
          sel: snowdayTest.game.selected,
          energy: a.energy,
          time: snowdayTest.game.time,
        };
      });
    const p0 = await pos();
    await p.keyboard.down('KeyW');
    await p.waitForFunction((t) => snowdayTest.game.time > t + 1.5, p0.time, { timeout: 60000 });
    await p.keyboard.up('KeyW');
    const p1 = await pos();
    rec(
      '3d',
      'W moves the hero',
      Math.hypot(p1.x - p0.x, p1.z - p0.z) > 2,
      `moved ${Math.hypot(p1.x - p0.x, p1.z - p0.z).toFixed(1)} m in 1.5 game-seconds`
    );
    await shot(p, '3d-03-moved');
    await idle();
    await p.keyboard.press('KeyJ');
    await frames(2);
    rec(
      '3d',
      'J starts combo animation',
      (await pos()).anim.startsWith('Attack'),
      (await pos()).anim
    );
    await idle();
    await p.keyboard.down('KeyK');
    await p
      .waitForFunction(() => snowdayTest.game.player.charge >= 1.2, null, { timeout: 60000 })
      .catch(() => {});
    const ch = await p.evaluate(() => snowdayTest.game.player.charge);
    await p.evaluate((q) => {
      const e = document.querySelector('#quality');
      e.value = q;
      e.dispatchEvent(new Event('change'));
    }, 'high');
    await frames(2);
    await shot(p, '3d-04-charging');
    await p.keyboard.up('KeyK');
    await frames(2);
    rec(
      '3d',
      'hold K charges, release fires',
      ch >= 1.19 && (await pos()).anim === 'ChargeAttack',
      `charge ${ch.toFixed(2)}, anim ${(await pos()).anim}`
    );
    await p.evaluate((q) => {
      const e = document.querySelector('#quality');
      e.value = q;
      e.dispatchEvent(new Event('change'));
    }, 'low');
    await idle();
    await p.keyboard.press('Space');
    await frames(3);
    rec('3d', 'Space jumps', (await p.evaluate(() => snowdayTest.game.player.air)) > 0);
    await p.keyboard.press('Digit2');
    await frames(2);
    await idle();
    await frames(2);
    rec('3d', 'pressing 2 mid-jump switches on landing', (await pos()).sel === 1);
    await p.keyboard.press('Digit1');
    await frames(2);
    await idle();
    await p.keyboard.press('Digit2');
    await frames(2);
    rec('3d', '2 switches to Tormund', (await pos()).sel === 1);
    await p.evaluate((q) => {
      const e = document.querySelector('#quality');
      e.value = q;
      e.dispatchEvent(new Event('change'));
    }, 'high');
    await frames(2);
    await shot(p, '3d-05-tormund');
    await p.keyboard.press('Digit3');
    await frames(2);
    rec('3d', '3 switches to Bucky', (await pos()).sel === 2);
    await frames(2);
    await shot(p, '3d-06-bucky');
    await p.keyboard.press('Digit1');
    await frames(2);
    await p.keyboard.press('Escape');
    await frames(2);
    rec(
      '3d',
      'Escape pauses',
      await p.evaluate(() => snowdayTest.game.paused && !document.querySelector('#menu').hidden)
    );
    await shot(p, '3d-07-pause');
    await p.evaluate((q) => {
      const e = document.querySelector('#quality');
      e.value = q;
      e.dispatchEvent(new Event('change'));
    }, 'low');
    await frames(1);
    rec(
      '3d',
      'Low detail turns shadows off',
      await p.evaluate(() => !snowdayTest.renderer.shadowMap.enabled)
    );
    await p.keyboard.press('Escape');
    await frames(2);
    rec('3d', 'Escape resumes', await p.evaluate(() => !snowdayTest.game.paused));
    await shot(p, '3d-08-low-detail');
    await p.evaluate(() => {
      const g = snowdayTest.game;
      Object.assign(g.player, {
        x: 23,
        z: 52.4,
        y: snowdayTest.world.height(23, 52.4),
        yaw: Math.PI,
        action: null,
        cooldown: 0,
        air: 0,
      });
    });
    await frames(2);
    await p.keyboard.press('KeyJ');
    await p
      .waitForFunction(() => snowdayTest.game.stats.hits > 0, null, { timeout: 60000 })
      .catch(() => {});
    rec(
      '3d',
      'combo hits a practice post',
      (await p.evaluate(() => snowdayTest.game.stats.hits)) > 0
    );
    await p.evaluate((q) => {
      const e = document.querySelector('#quality');
      e.value = q;
      e.dispatchEvent(new Event('change'));
    }, 'high');
    await frames(2);
    await shot(p, '3d-09-practice-post');
    await p.evaluate(() => {
      snowdayTest.game.quest.clues[0] = true;
      snowdayTest.game.cookies = 2;
    });
    await p.keyboard.press('Escape');
    await frames(2);
    await p.reload();
    await p.waitForFunction(() => !document.querySelector('#play').disabled, null, {
      timeout: 180000,
    });
    const s = await p.evaluate(() => ({
      btn: document.querySelector('#play').textContent,
      cookies: snowdayTest.game.cookies,
      clue: snowdayTest.game.quest.clues[0],
    }));
    rec(
      '3d',
      'save survives reload',
      s.cookies === 2 && s.clue === true && s.btn === 'Continue adventure',
      JSON.stringify(s)
    );
    await p.evaluate((q) => {
      const e = document.querySelector('#quality');
      e.value = q;
      e.dispatchEvent(new Event('change'));
    }, 'low');
    await p.evaluate(() => {
      window.__pad = {
        connected: true,
        id: 'Sim pad',
        index: 0,
        mapping: 'standard',
        axes: [0, 0, 0, 0],
        buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })),
      };
      navigator.getGamepads = () => [window.__pad];
    });
    await p.click('#play');
    await frames(2);
    await idle();
    const press = async (i) => {
      await p.evaluate((i) => {
        __pad.buttons[i] = { pressed: true, value: 1 };
      }, i);
      await frames(2);
      await p.evaluate((i) => {
        __pad.buttons[i] = { pressed: false, value: 0 };
      }, i);
      await frames(2);
    };
    await press(4);
    rec('3d', 'gamepad LB cycles hero', (await pos()).sel === 1);
    const q0 = await pos();
    await p.evaluate(() => {
      __pad.axes[1] = -1;
    });
    await p.waitForFunction((t) => snowdayTest.game.time > t + 1, q0.time, { timeout: 60000 });
    await p.evaluate(() => {
      __pad.axes[1] = 0;
    });
    const q1 = await pos();
    rec('3d', 'gamepad left stick moves', Math.hypot(q1.x - q0.x, q1.z - q0.z) > 2);
    await idle();
    await p.evaluate(() => {
      const g = snowdayTest.game,
        f = g.attack.bind(g);
      window.__atk = 0;
      g.attack = () => {
        const r = f();
        if (r) __atk++;
        return r;
      };
    });
    await press(2);
    rec('3d', 'gamepad X combos', (await p.evaluate(() => __atk)) === 1);
    await idle();
    await press(9);
    rec('3d', 'gamepad Start pauses', await p.evaluate(() => snowdayTest.game.paused));
    await press(9);
    rec('3d', 'gamepad Start resumes', await p.evaluate(() => !snowdayTest.game.paused));
    // ---- controller remapping ----
    await press(9);
    await frames(2);
    await p.evaluate(() => (document.querySelector('#pad-settings').open = true));
    await frames(1);
    await p.click('[data-bind="jump"]');
    await frames(1);
    await press(7);
    rec(
      '3d remap',
      'Jump rebound to RT',
      (await p.evaluate(() => snowdayTest.padBindings().jump)) === 7
    );
    await p.click('[data-bind="dodge"]');
    await frames(1);
    await press(2);
    const bnd = await p.evaluate(() => snowdayTest.padBindings());
    rec(
      '3d remap',
      'binding X to Dodge swaps Combo onto B',
      bnd.dodge === 2 && bnd.combo === 1,
      JSON.stringify(bnd)
    );
    await p.click('[data-bind="combo"]');
    await frames(1);
    await press(9);
    rec(
      '3d remap',
      'Start cancels a pending change',
      (await p.evaluate(() => snowdayTest.padBindings().combo)) === 1 &&
        (await p.evaluate(() => snowdayTest.game.paused))
    );
    await p.evaluate(() => document.querySelector('#pad-settings').scrollIntoView());
    await frames(2);
    await shot(p, '3d-16-controller-remap');
    await p.evaluate(() => document.querySelector('#play').focus());
    await press(0);
    rec(
      '3d remap',
      'A on the focused Continue button resumes',
      await p.evaluate(() => !snowdayTest.game.paused)
    );
    await idle();
    await press(7);
    await frames(2);
    rec('3d remap', 'RT now jumps', (await p.evaluate(() => snowdayTest.game.player.air)) > 0);
    await idle();
    await press(0);
    await frames(2);
    rec(
      '3d remap',
      'A no longer jumps',
      (await p.evaluate(() => snowdayTest.game.player.air)) === 0
    );
    await idle();
    await p.evaluate(() => {
      const g = snowdayTest.game,
        f = g.attack.bind(g);
      window.__atk = 0;
      g.attack = () => {
        const r = f();
        if (r) __atk++;
        return r;
      };
    });
    const atk0 = await p.evaluate(() => snowdayTest.game.stats.attacks);
    await press(1);
    rec(
      '3d remap',
      'B now combos',
      (await p.evaluate(() => snowdayTest.game.stats.attacks)) > atk0
    );
    await idle();
    await p.reload();
    await p.waitForFunction(() => !document.querySelector('#play').disabled, null, {
      timeout: 180000,
    });
    rec(
      '3d remap',
      'bindings survive reload',
      (await p.evaluate(() => snowdayTest.padBindings().jump)) === 7
    );
    rec(
      '3d remap',
      'pause help shows new buttons',
      (await p.textContent('#pad-help')).includes('RT jump'),
      await p.textContent('#pad-help')
    );
    await p.evaluate(() => {
      document.querySelector('#pad-settings').open = true;
    });
    await p.click('#pad-reset');
    rec(
      '3d remap',
      'Restore standard buttons',
      JSON.stringify(await p.evaluate(() => snowdayTest.padBindings())) ===
        JSON.stringify({ jump: 0, dodge: 1, combo: 2, charge: 3, switch: 4, interact: 5, pause: 9 })
    );
    await p.evaluate(() => {
      window.__pad = {
        connected: true,
        id: 'Sim pad',
        index: 0,
        mapping: 'standard',
        axes: [0, 0, 0, 0],
        buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })),
      };
      navigator.getGamepads = () => [window.__pad];
    });
    await p.evaluate(() => document.querySelector('#play').focus());
    await frames(2);
    await press(13);
    const f1 = await p.evaluate(() => document.activeElement.id || document.activeElement.tagName);
    rec('3d remap', 'D-pad moves focus through the pause menu', f1 !== 'play', f1);
    await p.click('#play');
    await frames(2);
    await p.evaluate(() => {
      navigator.getGamepads = () => [null];
    });
    await frames(2);
    rec('3d', 'unplugging controller pauses', await p.evaluate(() => snowdayTest.game.paused));
    await shot(p, '3d-10-pad-disconnect-pause');
    await p.evaluate(() => {
      const g = snowdayTest.game;
      g.quest.rescued = true;
      g.quest.home = true;
      document.querySelector('#firewood').disabled = false;
    });
    await p.click('#firewood');
    await frames(3);
    rec(
      '3d',
      'Firewood for Mom chapter starts',
      await p.evaluate(() => snowdayTest.game.quest.chapter === 'firewood')
    );
    await p.evaluate((q) => {
      const e = document.querySelector('#quality');
      e.value = q;
      e.dispatchEvent(new Event('change'));
    }, 'high');
    await frames(2);
    await shot(p, '3d-11-firewood');
    await c.close();
  }
  {
    const { c, p } = await ctxPage(
      {
        viewport: { width: 412, height: 915 },
        hasTouch: true,
        isMobile: true,
        deviceScaleFactor: 2,
      },
      '3d-phone'
    );
    await p.goto(B + '/3d/?test');
    await p.waitForFunction(() => !document.querySelector('#play').disabled, null, {
      timeout: 180000,
    });
    await shot(p, '3d-12-phone-menu');
    await p.tap('#play');
    await p.waitForTimeout(1500);
    await shot(p, '3d-13-phone-play');
    rec('3d', 'phone portrait: touch controls shown', await p.isVisible('#stick'));
    await c.close();
  }
  {
    const { c, p } = await ctxPage(
      {
        viewport: { width: 915, height: 412 },
        hasTouch: true,
        isMobile: true,
        deviceScaleFactor: 2,
      },
      '3d-land'
    );
    await p.goto(B + '/3d/?test');
    await p.waitForFunction(() => !document.querySelector('#play').disabled, null, {
      timeout: 180000,
    });
    await shot(p, '3d-14-landscape-menu');
    await p.tap('#play');
    await p.waitForTimeout(1500);
    await shot(p, '3d-15-landscape-play');
    const ov = await p.evaluate(() => {
      const a = document.querySelector('#vitals').getBoundingClientRect(),
        b = document.querySelector('#stick').getBoundingClientRect();
      return !(a.bottom <= b.top || a.top >= b.bottom || a.right <= b.left || a.left >= b.right);
    });
    rec('3d', 'phone landscape: hero panel clear of joystick', !ov);
    await c.close();
  }
  // ---------- 3D ENEMIES, BOSSES, HEALTH AND COOKIES (Claude update 2) ----------
  {
    const { c, p } = await ctxPage({}, '3d-fight');
    await p.goto(B + '/3d/?test');
    await p.waitForFunction(() => !document.querySelector('#play').disabled, null, {
      timeout: 180000,
    });
    await p.evaluate(() => {
      const e = document.querySelector('#quality');
      e.value = 'low';
      e.dispatchEvent(new Event('change'));
    });
    await p.click('#play');
    const gt = async (s) => {
      const t = await p.evaluate(() => snowdayTest.game.time);
      await p.waitForFunction((x) => snowdayTest.game.time > x || snowdayTest.game.paused, t + s, {
        timeout: 120000,
      });
    };
    await p.evaluate(() => {
      const g = snowdayTest.game,
        w = snowdayTest.world;
      Object.assign(g.player, { x: 44, z: 52, y: w.height(44, 52), yaw: Math.PI / 2 });
      for (const [i, dx] of [
        [1, -2],
        [2, -4],
      ])
        Object.assign(g.actors[i], { x: 44 + dx, z: 53, y: w.height(44 + dx, 53) });
      for (const [t, x, z] of [
        ['gopher', 46.2, 52],
        ['crow', 47, 54],
        ['bale', 48, 50.5],
        ['gopher', 46.5, 50],
      ])
        g.enemies.push(g.makeFoe(t, x, z));
      snowdayTest.setView(-Math.PI / 2 + 0.5, 0.35, 9);
    });
    await gt(0.4);
    rec(
      '3d fight',
      'grunts are drawn',
      await p.evaluate(() => snowdayTest.foeViews.size >= 7),
      await p.evaluate(() => 'views ' + snowdayTest.foeViews.size)
    );
    await p.keyboard.press('KeyJ');
    await gt(1);
    await p.keyboard.press('KeyJ');
    await gt(1.2);
    await shot(p, '3d-20-grunts');
    rec(
      '3d fight',
      'J combo damages grunts',
      await p.evaluate(
        () =>
          snowdayTest.game.enemies.some((e) => !e.boss && (e.hp < e.max || e.dead)) ||
          snowdayTest.game.ko > 0
      )
    );
    await gt(4);
    rec(
      '3d fight',
      'grunts hurt the hero and the health bar follows',
      await p.evaluate(() => {
        const a = snowdayTest.game.player;
        return a.hp < 100 && parseFloat(document.querySelector('#health').style.width) < 100;
      }),
      await p.evaluate(() => snowdayTest.game.player.hp + ' hp')
    );
    await p.evaluate(() => {
      const g = snowdayTest.game,
        w = snowdayTest.world,
        b = g.enemies.find((e) => e.type === 'spud');
      g.enemies = g.enemies.filter((e) => e.boss);
      g.player.hp = 100;
      Object.assign(g.player, { x: b.x + 5, z: b.z + 4, y: w.height(b.x + 5, b.z + 4) });
      for (const i of [1, 2])
        Object.assign(g.actors[i], {
          x: b.x + 5 + i * 1.6,
          z: b.z + 6,
          y: w.height(b.x + 5 + i * 1.6, b.z + 6),
        });
      snowdayTest.setView(Math.atan2(5, 4), 0.42, 11);
    });
    await p
      .waitForFunction(() => !document.querySelector('#dialogue').hidden, null, { timeout: 60000 })
      .catch(() => {});
    rec(
      '3d fight',
      'meeting Sergeant Spudsworth opens his dialogue and the boss bar',
      await p.evaluate(
        () =>
          document.querySelector('#dialogue-copy').textContent.includes('Spud Barricade') &&
          !document.querySelector('#bossbox').hidden
      )
    );
    await shot(p, '3d-21-boss-hello');
    await p.click('#dialogue-close');
    await p
      .waitForFunction(
        () => {
          const e = snowdayTest.game.engaged;
          return e && e.state === 'wind' && e.st < 0.35;
        },
        null,
        { timeout: 120000 }
      )
      .catch(() => {});
    rec(
      '3d fight',
      'boss wind-up shows a red warning on the ground',
      await p.evaluate(() => {
        let n = 0;
        snowdayTest.scene.traverse((o) => {
          if (o.isMesh && o.material?.color?.getHex?.() === 0xeb5475) n++;
        });
        return n > 0;
      })
    );
    rec(
      '3d fight',
      'boss bar tells you to dodge',
      (await p.textContent('#bosshint')).includes('Dodge')
    );
    await shot(p, '3d-22-boss-warning');
    await p.evaluate(() => {
      const g = snowdayTest.game;
      g.cookies = 9;
      g.engaged.hp = 40;
    });
    await gt(0.3);
    await p.keyboard.press('KeyJ');
    await gt(0.5);
    await p.keyboard.press('KeyJ');
    await gt(0.6);
    await p.keyboard.press('KeyJ');
    await gt(0.8);
    await shot(p, '3d-23-belly-fight');
    rec(
      '3d fight',
      'Darren grows a belly stage with 9 cookies',
      await p.evaluate(
        () =>
          snowdayTest.heroes[0].root.scale.x > snowdayTest.heroes[0].base.x * 1.1 &&
          document.querySelector('#belly').textContent.startsWith('Snowball sturdy')
      )
    );
    await p.evaluate(() => {
      const g = snowdayTest.game;
      g.engaged && g.damageFoe(g.engaged, 999, 0);
    });
    await gt(0.5);
    rec(
      '3d fight',
      'beating the boss clears the camp and opens the clue',
      await p.evaluate(
        () => snowdayTest.game.bosses[0] && snowdayTest.game.objective().label.includes('bell')
      )
    );
    await shot(p, '3d-24-camp-cleared');
    await p.evaluate(() => {
      const g = snowdayTest.game;
      for (const a of g.actors) {
        a.hp = 1;
        a.inv = 0;
      }
      g.hurtHero(5, 0);
      g.player.inv = 0;
      g.hurtHero(5, 0);
      g.player.inv = 0;
      g.hurtHero(5, 0);
    });
    await p
      .waitForFunction(() => !document.querySelector('#defeat').hidden, null, { timeout: 30000 })
      .catch(() => {});
    rec('3d fight', 'all three knocked out shows the rest screen', await p.isVisible('#defeat'));
    await shot(p, '3d-25-defeat');
    await p.click('#retry');
    await gt(0.3);
    rec(
      '3d fight',
      'Try again heals everyone and keeps the cleared camp',
      await p.evaluate(() => {
        const g = snowdayTest.game;
        return !g.paused && !g.defeated && g.actors.every((a) => a.hp === 100) && g.bosses[0];
      })
    );
    await p.evaluate(() => {
      document.querySelector('#mode').value = 'cozy';
      document.querySelector('#mode').dispatchEvent(new Event('change'));
    });
    await p.keyboard.press('Escape');
    await p.waitForTimeout(500);
    await p.reload();
    await p.waitForFunction(() => !document.querySelector('#play').disabled, null, {
      timeout: 180000,
    });
    rec(
      '3d fight',
      'cleared camp and Cozy mode survive a reload',
      await p.evaluate(
        () =>
          snowdayTest.game.bosses[0] &&
          snowdayTest.game.mode === 'cozy' &&
          document.querySelector('#mode').value === 'cozy' &&
          !snowdayTest.game.enemies.some((e) => e.type === 'spud')
      )
    );
    await c.close();
  }
  {
    const { c, p } = await ctxPage(
      {
        viewport: { width: 412, height: 915 },
        hasTouch: true,
        isMobile: true,
        deviceScaleFactor: 2,
      },
      '3d-phone-fight'
    );
    await p.goto(B + '/3d/?test');
    await p.waitForFunction(() => !document.querySelector('#play').disabled, null, {
      timeout: 180000,
    });
    await p.evaluate(() => {
      const e = document.querySelector('#quality');
      e.value = 'low';
      e.dispatchEvent(new Event('change'));
    });
    await p.tap('#play');
    await p.evaluate(() => {
      const g = snowdayTest.game,
        w = snowdayTest.world,
        b = g.enemies.find((e) => e.type === 'cluck');
      Object.assign(g.player, { x: b.x + 5, z: b.z + 4, y: w.height(b.x + 5, b.z + 4) });
      snowdayTest.setView(Math.atan2(5, 4), 0.42, 11);
    });
    await p
      .waitForFunction(() => !document.querySelector('#dialogue').hidden, null, { timeout: 60000 })
      .catch(() => {});
    await p.tap('#dialogue-close');
    await p.waitForTimeout(1500);
    await shot(p, '3d-26-phone-boss');
    const lay = await p.evaluate(() => {
      const r = (id) => document.querySelector(id).getBoundingClientRect(),
        o = (a, b) =>
          !(a.bottom <= b.top || a.top >= b.bottom || a.right <= b.left || a.left >= b.right);
      return {
        bossQuest: o(r('#bossbox'), r('#quest')),
        bossParty: o(r('#bossbox'), r('#party')),
        vitalsStick: o(r('#vitals'), r('#stick')),
        inView: r('#bossbox').right <= innerWidth,
      };
    });
    rec(
      '3d fight',
      'phone portrait: boss bar clear of the quest, party and joystick',
      !lay.bossQuest && !lay.bossParty && !lay.vitalsStick && lay.inView,
      JSON.stringify(lay)
    );
    await c.close();
  }
  {
    const { c, p } = await ctxPage(
      {
        viewport: { width: 915, height: 412 },
        hasTouch: true,
        isMobile: true,
        deviceScaleFactor: 2,
      },
      '3d-land-fight'
    );
    await p.goto(B + '/3d/?test');
    await p.waitForFunction(() => !document.querySelector('#play').disabled, null, {
      timeout: 180000,
    });
    await p.evaluate(() => {
      const e = document.querySelector('#quality');
      e.value = 'low';
      e.dispatchEvent(new Event('change'));
    });
    await p.tap('#play');
    await p.evaluate(() => {
      const g = snowdayTest.game,
        w = snowdayTest.world,
        b = g.enemies.find((e) => e.type === 'cluck');
      Object.assign(g.player, { x: b.x + 5, z: b.z + 4, y: w.height(b.x + 5, b.z + 4) });
      snowdayTest.setView(Math.atan2(5, 4), 0.42, 11);
    });
    await p
      .waitForFunction(() => !document.querySelector('#dialogue').hidden, null, { timeout: 60000 })
      .catch(() => {});
    await p.tap('#dialogue-close');
    await p.waitForTimeout(1500);
    await shot(p, '3d-27-landscape-boss');
    const lay = await p.evaluate(() => {
      const r = (id) => document.querySelector(id).getBoundingClientRect(),
        o = (a, b) =>
          !(a.bottom <= b.top || a.top >= b.bottom || a.right <= b.left || a.left >= b.right);
      return {
        bossQuest: o(r('#bossbox'), r('#quest')),
        bossVitals: o(r('#bossbox'), r('#vitals')),
        bossActions: o(
          r('#bossbox'),
          document.querySelector('.touch-actions').getBoundingClientRect()
        ),
      };
    });
    rec(
      '3d fight',
      'phone landscape: boss bar clear of the quest, hero panel and buttons',
      !lay.bossQuest && !lay.bossVitals && !lay.bossActions,
      JSON.stringify(lay)
    );
    await c.close();
  }
  // ---------- SHARED SAVES AND SETTINGS BETWEEN BOTH GAMES (Claude update 3) ----------
  {
    const { c, p } = await ctxPage({}, 'shared');
    const load3d = async () => {
      await p.goto(B + '/3d/?test');
      await p.waitForFunction(() => !document.querySelector('#play').disabled, null, {
        timeout: 180000,
      });
    };
    // Ruffy rescued in the pixel game; the player picked Cozy and turned sound off there.
    await p.goto(B + '/');
    await p.evaluate(() => {
      localStorage.setItem(
        'darren-snowday-v3',
        JSON.stringify({ version: 3, mode: 'cozy', camps: [true, true, true], complete: true })
      );
      SnowdayShared.setMode('cozy');
      SnowdayShared.setSound(false);
      SnowdayShared.rememberButtons({ attack: 5 });
    });
    await load3d();
    const s = await p.evaluate(() => ({
      note: document.querySelector('#other-game').textContent,
      noteShown: !document.querySelector('#other-game').hidden,
      firewood: !document.querySelector('#firewood').disabled,
      mode: snowdayTest.game.mode,
      modeBox: document.querySelector('#mode').value,
      sound: document.querySelector('#sound').checked,
      pad: snowdayTest.padBindings(),
    }));
    await shot(p, '3d-30-shared-menu');
    rec(
      'shared',
      '3D menu shows pixel-game progress',
      s.noteShown && /Ruffy is home/.test(s.note),
      s.note
    );
    rec('shared', 'pixel rescue opens Firewood for Mom in 3D', s.firewood);
    rec(
      'shared',
      'new 3D game starts in the mode picked in the pixel game',
      s.mode === 'cozy' && s.modeBox === 'cozy'
    );
    rec('shared', 'sound off carries into 3D', s.sound === false);
    rec(
      'shared',
      'attack button carries into 3D with a swap',
      s.pad.combo === 5 && s.pad.interact === 2,
      JSON.stringify(s.pad)
    );
    await p.click('#firewood');
    await p.waitForFunction(() => snowdayTest.game.quest.chapter === 'firewood', null, {
      timeout: 60000,
    });
    await p.evaluate(() => snowdayTest.pause());
    const back = await p.evaluate(() => document.querySelector('#firewood').textContent);
    rec(
      'shared',
      'early firewood offers the way back to the rescue',
      /Back to Ruffy/.test(back),
      back
    );
    await p.click('#firewood');
    await p.waitForFunction(() => snowdayTest.game.quest.chapter === 'rescue', null, {
      timeout: 60000,
    });
    rec('shared', 'back to the rescue works', true);
    // Now change things in 3D and look at the pixel game.
    await p.evaluate(() => {
      snowdayTest.game.quest.clues[0] = true; // one camp cleared in 3D
      snowdayTest.game.bosses[0] = true;
      snowdayTest.pause();
      const m = document.querySelector('#mode');
      m.value = 'adventure';
      m.dispatchEvent(new Event('change'));
      const snd = document.querySelector('#sound');
      snd.checked = true;
      snd.dispatchEvent(new Event('change'));
    });
    await p.goto(B + '/');
    await p.waitForTimeout(2000);
    const px = await p.evaluate(() => ({
      usual: document.querySelector('#pickScarf').classList.contains('usualPick'),
      cozyTagged: document.querySelector('#pickPaws').classList.contains('usualPick'),
      mute: document.querySelector('#muteBtn').textContent,
      note: document.querySelector('#otherGameNote').textContent,
      noteShown: !document.querySelector('#otherGameNote').hidden,
      throwButton: padBindings.throw,
    }));
    await shot(p, 'pixel-30-shared-title');
    rec('shared', 'pixel game marks the mode picked last in 3D', px.usual && !px.cozyTagged);
    rec('shared', 'sound on carries into the pixel game', px.mute === '♪', px.mute);
    rec(
      'shared',
      'pixel title shows 3D progress',
      px.noteShown && px.note.includes('3D valley'),
      px.note
    );
    rec('shared', 'shared attack button applies in the pixel game', px.throwButton === 5);
    await p.click('#toSelect');
    await p.waitForTimeout(800);
    await shot(p, 'pixel-31-shared-last-pick');
    await c.close();
  }
  await b.close();
  require('fs').writeFileSync(out + 'results.json', JSON.stringify({ results, log }, null, 1));
  console.log('---- console/network log ----\n' + [...new Set(log)].join('\n'));
})().catch((e) => {
  console.error('SCRIPT ERROR', e);
  process.exit(1);
});
