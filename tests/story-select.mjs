// Story select rules for the 3D front end (dist/3d/story.mjs, Claude update 13): which battles
// are cleared, next or locked; replay saves leave the story alone; ranks and records.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { World, Game } from '../dist/3d/sim.mjs';
import {
  BATTLES,
  battleSite,
  battleWon,
  continueBattle,
  mergeRecord,
  rank,
  replaySave,
  storyStatus,
} from '../dist/3d/story.mjs';
const data = JSON.parse(fs.readFileSync(new URL('../dist/3d/world.json', import.meta.url)));
const world = new World(data);
world.prepareNav();
let passes = 0;
function test(name, fn) {
  fn();
  console.log('PASS', name);
  passes++;
}
function story(q = {}) {
  const g = new Game(world, null, { seed: 1 });
  Object.assign(g.quest, q);
  return JSON.parse(JSON.stringify(g.save()));
}

test('A new story: battle 1 is next, the rest locked', () => {
  assert.deepEqual(storyStatus(null), ['next', 'locked', 'locked', 'locked', 'locked']);
  assert.equal(continueBattle(null), 0);
});
test('Cleared camps unlock the next battle in order', () => {
  const s = story({ clues: [true, true, false] });
  assert.deepEqual(storyStatus(s), ['cleared', 'cleared', 'next', 'locked', 'locked']);
  assert.equal(continueBattle(s), 2);
});
test('After the Baron falls, Bramble Hollow stays next until Ruffy is home', () => {
  const s = story({ clues: [true, true, true], rescued: true });
  assert.equal(storyStatus(s)[3], 'next');
  assert.equal(storyStatus(s)[4], 'locked');
  const home = story({ clues: [true, true, true], rescued: true, home: true });
  assert.deepEqual(storyStatus(home), ['cleared', 'cleared', 'cleared', 'cleared', 'next']);
  const done = story({ clues: [true, true, true], rescued: true, home: true, delivered: true });
  assert.deepEqual(storyStatus(done), Array(5).fill('cleared'));
  assert.equal(continueBattle(done), -1);
});
test('Ruffy rescued in the pixel game opens Firewood for Mom early', () => {
  const s = story({ clues: [true, false, false] });
  assert.deepEqual(storyStatus(s, true), ['cleared', 'next', 'locked', 'locked', 'open']);
});
test('Replay saves start before the battle and load into the game', () => {
  const s = story({ clues: [true, true, true], rescued: true, home: true });
  s.cookies = 5;
  for (let i = 0; i < BATTLES.length; i++) {
    const r = replaySave(i, s, { hero: 2, style: 'scarf', mode: 'cozy' }),
      g = new Game(world, r, { seed: 2 });
    assert.equal(g.selected, 2);
    assert.equal(g.mode, 'cozy');
    assert.equal(g.cookies, 5);
    assert(!battleWon(BATTLES[i], g.quest), BATTLES[i].id + ' must not start won');
    if (i < 3) {
      assert.deepEqual(
        g.quest.clues,
        [0, 1, 2].map((k) => k < i)
      );
      assert(
        g.enemies.some((e) => e.boss && e.camp === i),
        'camp boss waits'
      );
    }
    if (i === 3) assert(g.enemies.some((e) => e.type === 'baron'));
    if (i === 4) assert.equal(g.quest.chapter, 'firewood');
  }
  // The story save itself is untouched.
  assert.equal(s.quest.home, true);
});
test('Game.reload swaps in a save without leftovers', () => {
  const g = new Game(world, null, { seed: 3 });
  g.ko = 50;
  g.enemies.push({ id: 999, dead: false });
  g.reload(replaySave(1, story({ clues: [true, false, false] })));
  assert.equal(g.ko, 0);
  assert(!g.enemies.some((e) => e.id === 999));
  assert.equal(g.quest.clues[0], true);
  assert.equal(g.paused, true);
});
test('Battle sites sit inside the valley', () => {
  for (const b of BATTLES) {
    const p = battleSite(b, data);
    assert(p.x > 0 && p.x < data.WORLD.w * 0.04 && p.z > 0 && p.z < data.WORLD.h * 0.04, b.id);
  }
});
test('Ranks and records', () => {
  const b = BATTLES[0];
  assert.equal(rank(b, { time: 100, ko: 40, hurt: 0, combo: 30 }), 'S');
  assert.equal(rank(b, { time: 9999, ko: 0, hurt: 999, combo: 0 }), 'C');
  const r1 = mergeRecord(null, { time: 200, ko: 10, combo: 8 }, 'B');
  const r2 = mergeRecord(r1, { time: 300, ko: 25, combo: 4 }, 'A');
  assert.deepEqual(r2, { time: 200, ko: 25, combo: 8, rank: 'A' });
  assert.equal(mergeRecord(r2, { time: 500, ko: 1, combo: 1 }, 'C').rank, 'A');
});
console.log(`${passes} story select checks passed`);
