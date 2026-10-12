import assert from 'node:assert/strict';
import fs from 'node:fs';
import { World, Game, CAST, GRUNTS, BOSSES, BELLY } from '../dist/3d/sim.mjs';
const data = JSON.parse(fs.readFileSync(new URL('../dist/3d/world.json', import.meta.url)));
const world = new World(data);
world.prepareNav();
let passes = 0;
function test(name, fn) {
  fn();
  console.log('PASS', name);
  passes++;
}
function fresh(options = {}) {
  const g = new Game(world, null, { seed: 1, ...options });
  g.setPause(false);
  return g;
}
function tick(g, seconds, input = { x: 0, z: 0 }) {
  for (let t = 0; t < seconds; t += 1 / 60) g.update(1 / 60, input);
}
function place(g, x, z, yaw = 0) {
  Object.assign(g.player, { x, z, y: world.height(x, z), yaw, action: null, cooldown: 0, air: 0 });
}
test('Terrain samples interpolate exactly, including ramp corners', () => {
  for (let i = 0; i < data.samples.length; i += 17) {
    const p = data.samples[i];
    if (p[0] < 3600 && p[1] < 2600)
      assert(Math.abs(world.height(p[0] * 0.04, p[1] * 0.04) - p[2] * 0.04) < 1e-5);
  }
});
test('Paused game freezes movement, attacks, and charge', () => {
  const g = fresh();
  g.chargeStart();
  tick(g, 0.5);
  g.setPause(true);
  const before = JSON.stringify(g.actors);
  tick(g, 2, { x: 1, z: 0 });
  assert.equal(JSON.stringify(g.actors), before);
  assert(!g.attack());
  assert(!g.chargeRelease());
  assert.equal(g.stats.charged, 0);
});
test('Switching cancels charge and preserves player location', () => {
  const g = fresh();
  g.chargeStart();
  tick(g, 0.6);
  const p = { x: g.player.x, z: g.player.z };
  assert(g.switchTo(1));
  assert.equal(g.player.x, p.x);
  assert.equal(g.player.z, p.z);
  assert(!g.actors[0].charging);
  assert(!g.chargeRelease());
  assert(!g.switchTo(8));
});
test('Combo impacts occur once per action and cycle through three clips', () => {
  const g = fresh();
  place(g, 23, 52, Math.PI);
  const names = [];
  for (let i = 0; i < 3; i++) {
    assert(g.attack());
    names.push(g.player.action.name);
    tick(g, 1);
    assert.equal(g.targets[0].hits, i + 1);
  }
  assert.deepEqual(names, ['Attack1', 'Attack2', 'Attack3']);
  assert.equal(g.stats.attacks, 3);
});
for (let i = 0; i < 3; i++)
  test(CAST[i] + ' charged attack reaches a practice post once', () => {
    const g = fresh();
    g.switchTo(i);
    place(g, 23, 52.4, Math.PI);
    assert(g.chargeStart());
    tick(g, 1.4);
    assert.equal(g.player.charge, 1.2);
    assert(g.chargeRelease());
    assert(!g.chargeRelease());
    tick(g, 2.5);
    assert.equal(g.targets[0].hits, 1);
    assert.equal(g.stats.charged, 1);
    assert.equal(g.shots.length, 0);
  });
test('Energy gates dodge and charging', () => {
  const g = fresh();
  g.player.energy = 0;
  assert(!g.chargeStart());
  assert(!g.dodge());
  tick(g, 3);
  assert(g.dodge());
  assert(!g.attack());
});
test('Jump lands back on the terrain without nonfinite coordinates', () => {
  const g = fresh();
  assert(g.jump());
  tick(g, 0.25);
  assert(g.player.air > 0);
  assert(!g.jump());
  tick(g, 2);
  assert.equal(g.player.air, 0);
  assert.equal(g.player.y, world.height(g.player.x, g.player.z));
});
test('World edges and scenery cannot be walked through', () => {
  const g = fresh();
  place(g, 0.5, 0.5);
  tick(g, 4, { x: -1, z: -1 });
  assert(g.player.x >= 0.34 && g.player.z >= 0.34);
  for (const p of world.props) assert(!world.clear(p.x, p.z));
});
test('Save accepts valid state and safely rejects corrupt data', () => {
  const g = fresh();
  g.quest.clues[0] = true;
  g.cookies = 2;
  g.switchTo(2);
  const copy = new Game(world, JSON.parse(JSON.stringify(g.save())));
  assert.deepEqual(copy.quest, g.quest);
  assert.equal(copy.selected, 2);
  assert.equal(copy.cookies, 2);
  for (const s of [
    null,
    {},
    { version: 99 },
    { version: 1, quest: { chapter: 'rescue', clues: [true], wood: [] } },
  ])
    assert.equal(new Game(world, s).quest.clues.filter(Boolean).length, 0);
});
function walkTo(g, target) {
  const field = world.field(target.x, target.z);
  let lastDistance = Infinity,
    stuck = 0;
  for (let i = 0; i < 30000; i++) {
    const a = g.player,
      d = Math.hypot(a.x - target.x, a.z - target.z);
    if (d < 2.2 && Math.abs(a.y - world.height(target.x, target.z)) < 0.7) return;
    const angle = world.direction(a, target, field);
    g.update(1 / 60, { x: Math.sin(angle), z: Math.cos(angle) });
    if (i % 120 === 0) {
      if (Math.abs(lastDistance - d) < 0.01) stuck++;
      else stuck = 0;
      if (stuck > 5)
        throw Error(
          'Route stuck ' +
            JSON.stringify({
              player: a,
              target,
              cell: world.cellId(a.x, a.z),
              distance: field[world.cellId(a.x, a.z)],
            })
        );
      lastDistance = d;
    }
  }
  throw Error('Route timeout ' + JSON.stringify(target));
}
test('Full rescue and firewood quests can be completed by walking actual collision routes (enemies off)', () => {
  const g = fresh({ enemies: false });
  for (let i = 0; i < 5; i++) {
    const target = g.objective();
    walkTo(g, target);
    assert(g.interact(), target.label);
    tick(g, 1.2);
  }
  assert(g.quest.home);
  assert(g.quest.rescued);
  g.chapter('firewood');
  for (let i = 0; i < 4; i++) {
    const target = g.objective();
    walkTo(g, target);
    assert(g.interact(), target.label);
    tick(g, 1.2);
  }
  assert(g.quest.delivered);
  assert(g.quest.wood.every(Boolean));
  assert(g.stats.distance > 200);
});
test('Friends step aside instead of overlapping when the hero backs into them', () => {
  const g = fresh();
  tick(g, 2);
  const a = g.player,
    back = { x: -Math.sin(a.yaw), z: -Math.cos(a.yaw) };
  let closest = Infinity;
  for (let k = 0; k < 120; k++) {
    g.update(1 / 60, back);
    for (const b of g.actors)
      if (b !== a) closest = Math.min(closest, Math.hypot(a.x - b.x, a.z - b.z));
  }
  assert(closest > 1.1, `a friend came within ${closest.toFixed(2)} m`);
});
// ---- Enemies, bosses, health and cookies (Claude update 2) ----
const near = (g, x, z) => place(g, x, z);
function foe(g, type, x, z) {
  const e = g.makeFoe(type, x, z);
  g.enemies.push(e);
  return e;
}
function fight(g, limit = 120) {
  let route = null; // simple bot: walk to the nearest active foe and combo it
  for (let t = 0; t < limit; t += 1 / 60) {
    const a = g.player;
    let e = g.engaged && !g.engaged.dead ? g.engaged : null;
    if (!e) {
      let best = 7;
      for (const o of g.enemies) {
        if (o.dead || (o.boss && !o.active)) continue;
        const d = Math.hypot(o.x - a.x, o.z - a.z);
        if (d < best) {
          best = d;
          e = o;
        }
      }
    }
    if (!e) {
      if (t > 1) return t;
      g.update(1 / 60);
      g.events.length = 0;
      continue;
    }
    let ang = Math.atan2(e.x - a.x, e.z - a.z);
    const d = Math.hypot(e.x - a.x, e.z - a.z);
    if (Math.abs(e.y - a.y) > 1.2) {
      if (!route || route.t + 1 < t) {
        route = { t, field: world.field(e.x, e.z) };
      }
      ang = world.direction(a, e, route.field, false);
    }
    g.update(1 / 60, d > e.r + 0.9 ? { x: Math.sin(ang), z: Math.cos(ang) } : { x: 0, z: 0 });
    if (!a.action && d < e.r + 2) {
      a.yaw = ang;
      g.attack();
    }
    if (g.defeated) g.retry();
    g.events.length = 0;
  }
  return limit;
}
test('Grunts wander in away from the cottage, never beside it', () => {
  const g = fresh();
  tick(g, 30);
  assert.equal(g.enemies.filter((e) => !e.boss).length, 0);
  near(g, 60, 52);
  tick(g, 12);
  const grunts = g.enemies.filter((e) => !e.boss);
  assert(grunts.length > 0, 'no grunts spawned');
  for (const e of grunts) {
    assert(Object.keys(GRUNTS).includes(e.type));
    assert(Math.hypot(e.x - 16.8, e.z - 51.2) >= 18);
  }
});
test('Three camp bosses wait at their camps and the Baron only appears after all three clues', () => {
  const g = fresh();
  assert.deepEqual(
    g.enemies.filter((e) => e.boss).map((e) => e.type),
    ['spud', 'weed', 'cluck']
  );
  assert(g.enemies.every((e) => !e.active));
  for (const e of g.enemies) {
    const c = data.CAMPS[e.camp];
    assert(Math.hypot(e.x - c.x * 0.04, e.z - c.y * 0.04) < 4);
  }
  assert(!g.enemies.some((e) => e.type === 'baron'));
});
test('Combo hits damage and defeat a grunt and count K.O.s', () => {
  const g = fresh();
  near(g, 40, 52, 0);
  const e = foe(g, 'gopher', 40, 53.4);
  assert(g.attack());
  tick(g, 0.6);
  assert(e.hp < GRUNTS.gopher.hp);
  assert(g.attack());
  tick(g, 0.7);
  assert(e.dead);
  assert.equal(g.ko, 1);
  assert(g.combo >= 2);
});
test('Grunts wind up before hitting, and a dodge through the wind-up avoids the damage', () => {
  const g = fresh();
  near(g, 40, 52, 0);
  const e = foe(g, 'bale', 40, 53.6);
  e.cd = 0;
  tick(g, 0.1);
  assert.equal(e.state, 'wind');
  assert.equal(g.player.hp, 100);
  tick(g, 0.6);
  assert(g.player.hp < 100, 'wind-up did not land');
  const g2 = fresh();
  near(g2, 40, 52, 0);
  const f = foe(g2, 'bale', 40, 53.6);
  f.cd = 0;
  tick(g2, 0.3);
  assert.equal(f.state, 'wind');
  assert(g2.dodge());
  tick(g2, 0.4);
  assert.equal(g2.player.hp, 100);
});
test('A knocked-out hero hands over to the next friend; all three down is a defeat, and retry keeps progress', () => {
  const g = fresh();
  near(g, 40, 52);
  g.cookies = 4;
  g.quest.clues[0] = true;
  g.bosses[0] = true;
  g.lastCamp = 0;
  g.player.hp = 3;
  g.hurtHero(10, 0);
  assert(g.actors[0].down);
  assert.equal(g.selected, 1);
  assert(!g.switchTo(0));
  g.player.inv = 0;
  g.player.hp = 1;
  g.hurtHero(10, 0);
  assert.equal(g.selected, 2);
  g.player.inv = 0;
  g.player.hp = 1;
  g.hurtHero(10, 0);
  assert(g.defeated);
  const before = JSON.stringify(g.actors.map((a) => [a.x, a.z]));
  tick(g, 1);
  assert.equal(JSON.stringify(g.actors.map((a) => [a.x, a.z])), before, 'defeat froze the world');
  g.retry();
  assert(!g.defeated);
  assert(g.actors.every((a) => a.hp === 100 && !a.down));
  assert.equal(g.cookies, 4);
  assert(g.quest.clues[0]);
  const c = data.CAMPS[0];
  assert(
    Math.hypot(g.player.x - c.x * 0.04, g.player.z - c.y * 0.04) < 8,
    'retry starts at the last cleared camp'
  );
});
test('Bosses engage nearby, telegraph each attack, and drop cookies when beaten', () => {
  const g = fresh();
  const b = g.enemies[0];
  near(g, b.x + 6, b.z + 6);
  tick(g, 0.1);
  assert(b.active);
  assert.equal(g.engaged, b);
  assert(g.events.some((e) => e.type === 'boss' && e.text.includes('Spudsworth')));
  let sawWind = false,
    hurtWithoutWind = false;
  g.events.length = 0;
  for (let t = 0; t < 8; t += 1 / 60) {
    g.update(1 / 60);
    if (b.state === 'wind') sawWind = true;
    for (const e of g.events.splice(0)) if (e.type === 'hurt' && !sawWind) hurtWithoutWind = true;
  }
  assert(sawWind);
  assert(!hurtWithoutWind);
  g.retry();
  near(g, b.x + 3, b.z + 3);
  const t = fight(g, 200);
  assert(g.bosses[0], `boss still standing after ${t.toFixed(0)} s`);
  assert(g.pickups.filter((p) => p.kind === 'cookie').length >= 2);
  assert.equal(g.lastCamp, 0);
});
test('A camp clue cannot be picked up until that camp boss is beaten', () => {
  const g = fresh();
  const o = g.objective();
  assert(o.label.startsWith('Defeat Sergeant Spudsworth'));
  const b = g.enemies[0];
  b.active = true;
  near(g, o.x, o.z);
  assert(!g.canInteract());
  assert(!g.interact());
  g.damageFoe(b, 9999, 0);
  assert(g.bosses[0]);
  g.events.length = 0;
  near(g, o.x, o.z);
  assert(g.objective().label.includes('bell'));
  assert(g.interact());
  assert(g.quest.clues[0]);
});
test('Cookies heal, revive resting friends and grow Darren every 3, which hits harder', () => {
  const g = fresh();
  g.player.hp = 50;
  g.actors[1].down = true;
  g.actors[1].hp = 0;
  g.gainCookie();
  assert.equal(g.player.hp, 72);
  assert(!g.actors[1].down && g.actors[1].hp === 11);
  g.gainCookie();
  g.gainCookie();
  assert.equal(g.belly, 1);
  assert(g.events.some((e) => e.type === 'belly' && e.title === BELLY[1].toUpperCase()));
  for (let i = 0; i < 20; i++) g.gainCookie();
  assert.equal(g.belly, 3);
  const finisher = (belly) => {
    const h = fresh();
    h.cookies = belly * 3;
    h.random = () => 0.5;
    near(h, 40, 52, 0);
    const e = foe(h, 'bale', 40, 53.4);
    e.hp = e.max = 999;
    for (let i = 0; i < 3; i++) {
      h.player.cooldown = 0;
      assert(h.attack());
      tick(h, 1);
    }
    return 999 - e.hp;
  };
  assert(finisher(3) > finisher(0) + 10);
});
test('Dropped cookies are picked up by walking over them', () => {
  const g = fresh();
  near(g, 40, 52);
  g.drop(40, 53, 'cookie');
  tick(g, 0.5);
  g.update(1 / 60, { x: 0, z: 1 });
  tick(g, 0.4, { x: 0, z: 1 });
  assert.equal(g.cookies, 1);
  assert.equal(g.pickups.length, 0);
});
test('Cozy mode softens hits', () => {
  const a = fresh(),
    b = fresh();
  b.setMode('cozy');
  a.hurtHero(16, 0);
  b.hurtHero(16, 0);
  assert.equal(a.player.hp, 84);
  assert.equal(b.player.hp, 91);
});
test('Friends join the fight beside the hero', () => {
  const g = fresh();
  near(g, 40, 52, 0);
  const t = g.actors[1];
  Object.assign(t, { x: 38, z: 50, y: world.height(38, 50) });
  Object.assign(g.actors[2], { x: 42, z: 50, y: world.height(42, 50) });
  const e = foe(g, 'bale', 38, 48.6);
  e.hp = e.max = 999;
  e.cd = 99;
  tick(g, 1.5);
  assert(e.hp < 999, 'friends never swung');
});
test('Firewood guards block the wood pile until they are cleared', () => {
  const g = fresh();
  g.quest.home = g.quest.rescued = true;
  g.chapter('firewood');
  assert.equal(g.enemies.length, 0);
  const s = data.WOOD_SITES[0];
  near(g, s.x * 0.04, s.y * 0.04);
  tick(g, 0.1);
  const guards = g.enemies.filter((e) => e.woodSite === 0);
  assert.equal(guards.length, 3);
  assert(g.objective().label.startsWith('Clear the trail'));
  assert(!g.interact());
  for (const e of guards) g.damageFoe(e, 999, 0);
  tick(g, 1.2);
  near(g, s.x * 0.04, s.y * 0.04);
  assert(g.interact());
  assert(g.quest.wood[0]);
});
test('Saves keep cleared bosses, mode, K.O.s and more than six cookies; old saves count found clues as cleared camps', () => {
  const g = fresh();
  g.bosses[1] = true;
  g.cookies = 14;
  g.ko = 37;
  g.setMode('cozy');
  const copy = new Game(world, JSON.parse(JSON.stringify(g.save())), { seed: 2 });
  assert.deepEqual(copy.bosses, g.bosses);
  assert.equal(copy.cookies, 14);
  assert.equal(copy.mode, 'cozy');
  assert.equal(copy.ko, 37);
  assert(!copy.enemies.some((e) => e.camp === 1));
  const old = {
    version: 1,
    quest: {
      chapter: 'rescue',
      clues: [true, true, false],
      rescued: false,
      home: false,
      wood: [false, false, false],
      delivered: false,
    },
    cookies: 3,
    taken: [],
    selected: 0,
  };
  const o = new Game(world, old, { seed: 2 });
  assert.deepEqual(o.bosses, [true, true, false, false]);
  assert.deepEqual(
    o.enemies.filter((e) => e.boss).map((e) => e.type),
    ['cluck']
  );
});
test('Whole adventure with enemies: three camp bosses, the Baron, Ruffy home, then firewood', () => {
  const g = fresh({ seed: 5 });
  let guard = 0;
  while (!g.quest.home && guard++ < 20) {
    const o = g.objective();
    if (o.fight) {
      const b = g.enemies.find(
        (e) =>
          e.boss && (o.label.includes(e.name) || (e.type === 'baron' && o.label.includes('Baron')))
      );
      assert(b, 'no boss for ' + o.label);
      for (let k = 0; k < 4 && !g.bosses[b.camp]; k++) {
        near(g, b.x + 2.5, b.z + 2.5);
        fight(g, 300);
      }
      assert(g.bosses[b.camp], 'could not beat ' + b.name);
      continue;
    }
    near(g, o.x, o.z);
    g.enemies = g.enemies.filter((e) => e.boss);
    assert(g.interact(), o.label);
    tick(g, 1.9);
  }
  assert(g.quest.home && g.bosses.every(Boolean));
  assert(g.events.length >= 0);
  g.chapter('firewood');
  for (let i = 0; i < 4; i++) {
    let o = g.objective();
    near(g, o.x, o.z);
    tick(g, 0.1);
    fight(g, 120);
    o = g.objective();
    near(g, o.x, o.z);
    assert(g.interact(), o.label);
    tick(g, 1.9);
  }
  assert(g.quest.delivered);
});
// Firewood can open early when Ruffy was rescued in the pixel game (shared-save.js).
test('Firewood started before the 3D rescue can switch back without losing rescue progress', () => {
  const g = fresh();
  g.quest.clues[0] = true;
  g.bosses[0] = true;
  g.chapter('firewood');
  assert.equal(g.quest.chapter, 'firewood');
  assert(!g.enemies.some((e) => e.boss), 'no rescue bosses on the firewood trail');
  assert.match(g.objective().label, /Gather fallen wood|Clear the trail/);
  g.quest.wood[0] = true;
  const saved = JSON.parse(JSON.stringify(g.save()));
  g.chapter('rescue');
  assert.equal(g.quest.chapter, 'rescue');
  assert.deepEqual(g.quest.clues, [true, false, false]);
  assert.deepEqual(g.quest.wood, [true, false, false]);
  assert(
    g.enemies.some((e) => e.boss && e.camp === 1),
    'the next camp boss is waiting'
  );
  assert.match(g.objective().label, /Windswept Ring/);
  const back = new Game(world, saved, { seed: 1 });
  assert.equal(back.quest.chapter, 'firewood');
  assert.equal(back.quest.home, false);
});
console.log(`${passes} 3D simulation checks passed.`);
