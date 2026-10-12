// Shared settings and progress between the pixel and 3D games (dist/shared-save.js).
const assert = require('assert'),
  fs = require('fs'),
  vm = require('vm');
const sharedSource = fs.readFileSync('dist/shared-save.js', 'utf8');

function context(seed = {}) {
  const store = new Map(Object.entries(seed));
  const c = {
    JSON,
    Number,
    Array,
    Object,
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
    },
  };
  vm.createContext(c);
  vm.runInContext(sharedSource, c, { filename: 'shared-save.js' });
  return { c, store, S: c.SnowdayShared };
}
const plain = (o) => JSON.parse(JSON.stringify(o));
const PAD_3D = { jump: 0, dodge: 1, combo: 2, charge: 3, switch: 4, interact: 5, pause: 9 };
const NAMES_3D = { attack: 'combo', dodge: 'dodge', pause: 'pause' };
const NAMES_PIXEL = { attack: 'throw', dodge: 'dodge', pause: 'pause' };
let passed = 0;
function check(name, fn) {
  fn();
  passed++;
  console.log('PASS', name);
}

check('A fresh browser has no shared settings and changes nothing', () => {
  const { S } = context();
  assert.strictEqual(S.sound(), null);
  assert.strictEqual(S.mode(), null);
  assert.deepStrictEqual(plain(S.buttons()), {});
  assert.deepStrictEqual(plain(S.applyButtons({ ...PAD_3D }, NAMES_3D)), PAD_3D);
  assert.strictEqual(S.describe(S.story().pixel, 'pixel game'), '');
});

check('Broken or unknown shared records are ignored', () => {
  for (const bad of ['{not json', '{"version":2,"sound":false}', '"text"', '[1,2]']) {
    const { S } = context({ 'snowday-shared-v1': bad });
    assert.strictEqual(S.sound(), null, bad);
    assert.deepStrictEqual(plain(S.buttons()), {}, bad);
  }
  const { S } = context({
    'snowday-shared-v1': JSON.stringify({
      version: 1,
      mode: 'hard',
      buttons: { attack: 99, dodge: 1.5, pause: 9 },
    }),
  });
  assert.strictEqual(S.mode(), null);
  assert.deepStrictEqual(plain(S.buttons()), { pause: 9 });
});

check('Sound and mode are remembered for the other game', () => {
  const { S, store } = context();
  S.setSound(false);
  S.setMode('cozy');
  const again = context(Object.fromEntries(store)).S;
  assert.strictEqual(again.sound(), false);
  assert.strictEqual(again.mode(), 'cozy');
  again.setMode('anything else');
  assert.strictEqual(again.mode(), 'adventure');
});

check('A button chosen in the pixel game carries into the 3D game with a swap', () => {
  const { S } = context();
  S.rememberButtons({ attack: 5 }); // pixel: throw moved to RB
  const b = S.applyButtons({ ...PAD_3D }, NAMES_3D);
  assert.strictEqual(b.combo, 5);
  assert.strictEqual(b.interact, 2, 'Talk / gather takes the old combo button');
  assert.strictEqual(new Set(Object.values(b)).size, Object.keys(b).length, 'no button used twice');
});

check('Only buttons the player chose on purpose are shared', () => {
  const { S } = context();
  S.rememberButtons({ dodge: 1 }); // 3D: dodge on B (its default) does not touch pixel attack
  const pixel = S.applyButtons(
    { throw: 2, roll: 1, dodge: 0, special: 3, left: 4, right: 5, pause: 9, style: 8 },
    NAMES_PIXEL
  );
  assert.strictEqual(pixel.dodge, 1);
  assert.strictEqual(pixel.roll, 0, 'roll swaps onto the old dodge button');
  assert.strictEqual(pixel.throw, 2);
  assert.strictEqual(pixel.pause, 9);
});

check('Restoring standard buttons forgets the shared choices', () => {
  const { S } = context();
  S.rememberButtons({ attack: 4, pause: 8 });
  S.setSound(false);
  S.forgetButtons();
  assert.deepStrictEqual(plain(S.buttons()), {});
  assert.strictEqual(S.sound(), false, 'other shared settings stay');
});

check('Story progress is read from each game’s own save', () => {
  const { S } = context({
    'darren-snowday-v3': JSON.stringify({ version: 3, camps: [true, true, true], complete: true }),
    'darren-firewood-v1': JSON.stringify({
      version: 1,
      collected: [true, true, false],
      complete: false,
    }),
    'snowday-3d-v1': JSON.stringify({
      version: 1,
      quest: {
        chapter: 'rescue',
        clues: [true, false, false],
        rescued: false,
        home: false,
        wood: [false, false, false],
      },
    }),
  });
  const s = plain(S.story());
  assert.deepStrictEqual(s.pixel, { camps: 3, rescued: true, wood: 2, delivered: false });
  assert.deepStrictEqual(s.threeD, { camps: 1, rescued: false, wood: 0, delivered: false });
  assert.strictEqual(
    S.describe(s.pixel, 'pixel game'),
    'In the pixel game: Ruffy is home, 2 of 3 wood piles gathered.'
  );
  assert.strictEqual(S.describe(s.threeD, '3D valley'), 'In the 3D valley: 1 of 3 camps cleared.');
});

check('The pixel game applies shared buttons on load and keeps its own save as it was', () => {
  const own = JSON.stringify({
    throw: 2,
    roll: 1,
    dodge: 0,
    special: 3,
    left: 4,
    right: 5,
    pause: 9,
    style: 8,
  });
  const { c, store } = context({
    'darren-controls-v1': own,
    'snowday-shared-v1': JSON.stringify({ version: 1, buttons: { attack: 3 } }),
  });
  Object.assign(c, { Map, Set, Math, document: { querySelector: () => null } });
  vm.runInContext(fs.readFileSync('dist/controls.js', 'utf8'), c, { filename: 'controls.js' });
  const b = plain(vm.runInContext('padBindings', c));
  assert.strictEqual(b.throw, 3);
  assert.strictEqual(b.special, 2);
  assert.strictEqual(store.get('darren-controls-v1'), own);
});

console.log(passed + ' shared save checks passed.');
