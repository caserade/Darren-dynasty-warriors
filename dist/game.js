'use strict';
const $ = (s) => document.querySelector(s);
const TAU = Math.PI * 2;
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const pick = (a) => a[Math.floor(Math.random() * a.length)];
function angDiff(a, b) {
  let d = (a - b) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}
function ell(c, x, y, rx, ry, r = 0) {
  c.beginPath();
  c.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), r, 0, TAU);
  c.fill();
}
function circ(c, x, y, r) {
  c.beginPath();
  c.arc(x, y, Math.max(0.1, r), 0, TAU);
  c.fill();
}

/* ---------------- canvas ---------------- */
const cvs = $('#game');
let g = document.createElement('canvas').getContext('2d');
let W = 0,
  H = 0,
  DPR = 1,
  zoom = 1;
function viewportSize() {
  const v = window.visualViewport;
  return v && (!v.scale || Math.abs(v.scale - 1) < 0.02)
    ? { w: Math.round(v.width), h: Math.round(v.height) }
    : { w: innerWidth, h: innerHeight };
}
function phoneViewport() {
  return (
    matchMedia('(pointer: coarse)').matches ||
    ((navigator.maxTouchPoints || 0) > 0 && Math.min(W, H) < 1100)
  );
}
function cameraAnchorY() {
  return phoneViewport() ? H * (W > H ? 0.51 : 0.47) : H * (H < 520 && W > 680 ? 0.67 : 0.54);
}
function resize() {
  const v = viewportSize();
  W = Math.max(1, v.w);
  H = Math.max(1, v.h);
  DPR = 0.5;
  zoom = phoneViewport()
    ? clamp(Math.min(W / 850, H / 650), 0.42, 1.05)
    : clamp(Math.min(W / 1250, H / 820), 0.6, 1.05);
}
resize();
const motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
let reduceMotion = motionPreference.matches;
motionPreference.addEventListener?.('change', (e) => {
  reduceMotion = e.matches;
});

/* ---------------- world ---------------- */
const WORLD = { w: 3600, h: 2600 };
const CAMPS = [
  { x: 1300, y: 620, off: 'spud', color: '#7DBA5A', label: 'Spud Barricade' },
  { x: 1450, y: 2000, off: 'weed', color: '#D8A85A', label: 'Windswept Ring' },
  { x: 2520, y: 1180, off: 'cluck', color: '#E85A5A', label: 'Coop Command' },
];
const HOLLOW = { x: 3240, y: 1330 };
const START = { x: 420, y: 1300 };

const groundTile = document.createElement('canvas');
groundTile.width = groundTile.height = 512;
(() => {
  const c = groundTile.getContext('2d');
  c.fillStyle = '#D9E1F0';
  c.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 40; i++) {
    const x = Math.random() * 512,
      y = Math.random() * 512,
      r = rand(40, 120);
    const light = Math.random() < 0.55;
    for (const ox of [-512, 0, 512])
      for (const oy of [-512, 0, 512]) {
        const gr = c.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
        gr.addColorStop(0, light ? 'rgba(248,250,255,.55)' : 'rgba(170,185,215,.28)');
        gr.addColorStop(1, light ? 'rgba(248,250,255,0)' : 'rgba(170,185,215,0)');
        c.fillStyle = gr;
        c.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
      }
  }
  for (let i = 0; i < 500; i++) {
    c.fillStyle = Math.random() < 0.5 ? 'rgba(160,176,210,.35)' : 'rgba(255,255,255,.7)';
    c.fillRect(Math.random() * 512, Math.random() * 512, 2, 2);
  }
})();
let groundPat = null;

const tufts = [],
  props = [];
function farFromPOI(x, y, r) {
  if (Math.hypot(x - START.x, y - START.y) < r) return false;
  if (Math.hypot(x - HOLLOW.x, y - HOLLOW.y) < r + 120) return false;
  for (const c of CAMPS) if (Math.hypot(x - c.x, y - c.y) < r + 40) return false;
  return true;
}
for (let i = 0; i < 900; i++) {
  const x = rand(0, WORLD.w),
    y = rand(0, WORLD.h);
  tufts.push({ x, y, s: rand(0.6, 1.3), hue: Math.random() });
}
for (let i = 0; i < 46; i++) {
  const x = rand(80, WORLD.w - 80),
    y = rand(80, WORLD.h - 80);
  if (farFromPOI(x, y, 260)) props.push({ kind: 'bale', x, y, r: 24 });
}
for (let i = 0; i < 40; i++) {
  const x = rand(80, WORLD.w - 80),
    y = rand(80, WORLD.h - 80);
  if (farFromPOI(x, y, 260)) props.push({ kind: 'pine', x, y, r: 16, s: rand(0.8, 1.25) });
}
// fence lines
for (let k = 0; k < 7; k++) {
  let x = rand(200, WORLD.w - 400),
    y = rand(200, WORLD.h - 200);
  const dx = rand(-1, 1) > 0 ? 1 : -1;
  for (let j = 0; j < 9; j++) {
    if (farFromPOI(x, y, 240))
      props.push({
        kind: 'post',
        x,
        y,
        r: 0,
        rail: j < 8 ? { dx: dx * 70, dy: rand(-12, 12) } : null,
      });
    x += dx * 70;
    y += rand(-12, 12);
  }
}
// camp stakes
CAMPS.forEach((c, ci) => {
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * TAU;
    if (Math.abs(angDiff(a, Math.PI)) < 0.4) continue;
    props.push({
      kind: 'stake',
      x: c.x + Math.cos(a) * 250,
      y: c.y + Math.sin(a) * 190,
      r: 0,
      color: c.color,
    });
  }
  props.push({ kind: 'tent', x: c.x - 70, y: c.y - 60, r: 30, color: c.color });
  props.push({ kind: 'flag', x: c.x + 80, y: c.y - 40, r: 0, color: c.color, camp: ci });
});
for (let i = 0; i < 26; i++) {
  const a = (i / 26) * TAU;
  if (Math.abs(angDiff(a, Math.PI)) < 0.45) continue;
  props.push({
    kind: 'bramble',
    x: HOLLOW.x + Math.cos(a) * rand(270, 310),
    y: HOLLOW.y + Math.sin(a) * rand(210, 240),
    r: 26,
    s: rand(0.8, 1.3),
  });
}

for (const y of [HOLLOW.y - 215, HOLLOW.y + 215])
  props.push({ kind: 'tower', x: HOLLOW.x + 210, y, r: 46 });
for (let i = 0; i < 90; i++) {
  const x = 120 + ((i * 719) % 3350),
    y = 100 + ((i * 487) % 2400);
  if (!farFromPOI(x, y, 440)) continue;
  let nearRoad = false;
  for (const [a, b] of [
    [START, CAMPS[0]],
    [CAMPS[0], CAMPS[1]],
    [CAMPS[1], CAMPS[2]],
    [CAMPS[2], HOLLOW],
  ]) {
    const dx = b.x - a.x,
      dy = b.y - a.y,
      t = clamp(((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy), 0, 1);
    if (Math.hypot(x - a.x - dx * t, y - a.y - dy * t) < 100) nearRoad = true;
  }
  if (!nearRoad) props.push({ kind: 'pine', x, y, r: 16, s: 1.05 + (i % 4) * 0.13 });
}
/* ---------------- definitions ---------------- */
const WEAPONS = {
  scarf: {
    name: 'Polka Scarf',
    musou: 'POLKA CYCLONE',
    chain: [
      { dur: 0.34, act: [0.08, 0.22], r: 118, arc: 2.3, dmg: 9, kb: 5, side: 1 },
      { dur: 0.34, act: [0.08, 0.22], r: 118, arc: 2.3, dmg: 9, kb: 5, side: -1 },
      { dur: 0.4, act: [0.1, 0.26], r: 132, arc: 2.6, dmg: 11, kb: 7, side: 1 },
      { dur: 0.62, act: [0.1, 0.48], r: 142, arc: TAU, dmg: 15, kb: 12, spin: true },
    ],
  },
  paws: {
    name: 'Bare Paws · unarmed',
    musou: 'SCARF-STAR BLIZZARD',
    chain: [
      {
        pose: 'punch',
        side: -1,
        name: 'Jab',
        dur: 0.28,
        act: [0.08, 0.17],
        r: 70,
        arc: 1.8,
        dmg: 16,
        kb: 3,
        lunge: 1.8,
      },
      {
        pose: 'cross',
        side: 1,
        name: 'Cross',
        dur: 0.32,
        act: [0.1, 0.2],
        r: 77,
        arc: 1.9,
        dmg: 19,
        kb: 5,
        lunge: 2,
      },
      {
        pose: 'kick',
        name: 'Kick',
        dur: 0.43,
        act: [0.14, 0.29],
        r: 98,
        arc: 2.1,
        dmg: 28,
        kb: 9,
        lunge: 1.2,
        launch: true,
      },
      {
        pose: 'tail',
        name: 'Tail sweep',
        dur: 0.58,
        act: [0.16, 0.39],
        r: 128,
        arc: TAU,
        dmg: 34,
        kb: 12,
        spin: true,
      },
    ],
  },
};
WEAPONS.snow = { name: 'Snowball hero', musou: 'SCARF-STAR BLIZZARD', chain: [] };
const GRUNTS = {
  gopher: { hp: 22, rad: 16, spd: 1.55, dmg: 5 },
  crow: { hp: 14, rad: 14, spd: 2.15, dmg: 4 },
  bale: { hp: 46, rad: 21, spd: 0.95, dmg: 8 },
};
const OFFICERS = {
  spud: {
    name: 'Sergeant Spudsworth',
    hp: 440,
    rad: 34,
    spd: 1.35,
    moves: ['swipe', 'slam'],
    hello: [
      [
        'Sergeant Spudsworth',
        'HALT! Nobody crosses the Spud Barricade without paying the toll. The toll is one (1) cookie. Do you have a cookie? No? Then FIGHT.',
      ],
      ['Darren', 'Have you seen a little dog? Blue-and-white fur, red collar?'],
      ['Sergeant Spudsworth', 'I have seen NOTHING. I am a potato. ...Also maybe a dog.'],
    ],
    clue: [
      [
        'Narrator',
        "Something glints in the snow behind the sergeant's barricade. A small red collar tag with a bell.",
      ],
      ['Darren', 'R... U... F... F... Y. The bell is still warm. He came through here.'],
    ],
  },
  weed: {
    name: 'Madame Tumbleweed',
    hp: 540,
    rad: 34,
    spd: 1.6,
    moves: ['charge', 'swipe', 'charge'],
    hello: [
      [
        'Madame Tumbleweed',
        'Darling. The prairie wind takes everything in the end. Hats. Hopes. Little dogs.',
      ],
      ['Darren', "Then I'll take him back."],
      ['Madame Tumbleweed', 'Ooh, feisty! Let us ROLL.'],
    ],
  },
  cluck: {
    name: 'Colonel Cluck',
    hp: 640,
    rad: 38,
    spd: 1.45,
    moves: ['slam', 'eggs', 'swipe'],
    hello: [
      ['Colonel Cluck', 'TEN-HUT! This perimeter is SECURE! Nothing gets past Coop Command. BAWK.'],
      ['Darren', "A puppy got past you, didn't he."],
      ['Colonel Cluck', '...Classified. EGG BARRAGE!'],
    ],
    clue: [
      [
        'Narrator',
        'Behind the coop, tiny paw prints in the fresh snow, too small to be anything but a pup.',
      ],
      ['Darren', 'They lead east. Straight into the Bramble Hollow.'],
      ['Narrator', 'Far off, a thin, frightened bark. Then nothing.'],
    ],
  },
  baron: {
    name: 'The Bramble Baron',
    hp: 1350,
    rad: 54,
    spd: 1.2,
    moves: ['slam', 'thorns', 'charge', 'swipe', 'thorns'],
    hello: [
      [
        'The Bramble Baron',
        'So. The little red dragon with the polka-dot scarf. That puppy wandered into MY hollow.',
      ],
      ['The Bramble Baron', 'Finders keepers, as the prairie says.'],
      ['Darren', "The prairie doesn't say that. Give. Him. Back."],
    ],
  },
};
OFFICERS.weed.clue = [
  ['Narrator', "Tangled in the tumbleweed's branches: a squeaky bone, chewed flat."],
  ['Darren', "He only chews like this when he's scared. Hang on, buddy."],
];

/* ---------------- state ---------------- */
let state = 'title',
  paused = false,
  dialogOpen = false;
let P, enemies, parts, projs, pickups, floaters, ruffy, G;
let cam = { x: START.x, y: START.y },
  shake = 0,
  hitstop = 0,
  spawnT = 0,
  gtime = 0,
  flashRed = 0;
function newGame(mode = 'adventure') {
  const weapon = 'paws';
  clearControls();
  checkpointRun = null;
  clearTimeout(bannerT);
  $('#banner').classList.remove('show');
  gameRun++;
  scheduled = [];
  shots = [];
  ally = null;
  chargeHeld = false;
  chargeTime = 0;
  brawlHeld = false;
  lastHud = {};
  P = {
    vx: 0,
    vy: 0,
    animT: 0,
    throwT: 0,
    stepT: 0,
    weight: 0,
    cookies: 0,
    displayWeight: 0,
    motionWeight: 0,
    bellyMotion: 0,
    bellyVelocity: 0,
    rollCd: 0,
    shotCd: 0,
    roll: null,
    x: START.x,
    y: START.y,
    dir: 0,
    face: 1,
    hp: 100,
    max: 100,
    mus: 0,
    atk: null,
    queued: false,
    dash: 0,
    dashCd: 0,
    inv: 0,
    musou: null,
    combo: 0,
    comboT: 0,
    maxCombo: 0,
    ko: 0,
    hurtT: 0,
    moving: false,
    t: 0,
    weapon,
    dvx: 0,
    dvy: 0,
    kx: 0,
    ky: 0,
    trail: [],
  };
  enemies = [];
  parts = [];
  projs = [];
  pickups = [{ x: START.x + 100, y: START.y - 80, kind: 'cookie', t: 0 }];
  floaters = [];
  ruffy = null;
  G = {
    mode,
    friend: false,
    assistCd: 0,
    time: 0,
    clues: 0,
    campsDone: [false, false, false],
    lastCamp: -1,
    boss: null,
    engaged: null,
    baronSpawned: false,
    ending: null,
    nextKoMark: 100,
  };
  CAMPS.forEach((c, i) => {
    const o = makeEnemy(c.off, c.x, c.y, true);
    o.camp = i;
    enemies.push(o);
    for (let k = 0; k < 9; k++) {
      const e = makeEnemy(
        pick(['gopher', 'gopher', 'crow', 'bale']),
        c.x + rand(-200, 200),
        c.y + rand(-150, 150)
      );
      e.guard = { x: c.x, y: c.y };
      enemies.push(e);
    }
  });
  cam.x = P.x;
  cam.y = P.y;
  cam.z = groundHeight(P.x, P.y);
  spawnT = 1;
  hpTrail = 100;
  $('#bossBox').hidden = true;
  $('#saveNote').textContent = '';
  $('#wName').textContent = WEAPONS[weapon].name;
  P.sweepCd = 0;
  updateStyleLabels();
}
function makeEnemy(type, x, y, officer = false) {
  const b = officer ? OFFICERS[type] : GRUNTS[type];
  if (typeof canOccupy === 'function' && !canOccupy(x, y, 18)) {
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * TAU,
        xx = x + Math.cos(a) * 90,
        yy = y + Math.sin(a) * 90;
      if (canOccupy(xx, yy, 18)) {
        x = xx;
        y = yy;
        break;
      }
    }
  }
  const e = {
    type,
    x,
    y,
    hp: b.hp,
    max: b.hp,
    rad: b.rad,
    spd: b.spd,
    dmg: b.dmg || 12,
    officer,
    state: 'idle',
    st: 0,
    cd: rand(0.6, 1.6),
    kx: 0,
    ky: 0,
    face: -1,
    t: rand(0, 10),
    active: !officer,
    dead: false,
    fly: null,
    flash: 0,
    move: null,
    cdir: 0,
    guard: null,
    moving: false,
  };
  if (type === 'weed') {
    e.scrib = [];
    for (let i = 0; i < 16; i++)
      e.scrib.push([rand(-26, 26), rand(-60, -8), rand(8, 22), rand(0, TAU), rand(1.5, 4)]);
  }
  if (type === 'baron') {
    e.blobs = [];
    for (let i = 0; i < 11; i++) {
      const a = (i / 11) * TAU;
      e.blobs.push([Math.cos(a) * 30, -56 + Math.sin(a) * 30, rand(20, 28)]);
    }
  }
  return e;
}

/* ---------------- input ---------------- */
const keys = {};
const isAtk = (c) => c === 'KeyJ' || c === 'KeyZ';
addEventListener('keydown', (e) => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code))
    e.preventDefault();
  if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName) && !['Escape', 'KeyP'].includes(e.code))
    return;
  inputMode = 'keyboard';
  updateControlLabels();
  if (handleMenuKey(e)) return;
  if (e.repeat) {
    keys[e.code] = true;
    return;
  }
  keys[e.code] = true;
  if (dialogOpen) {
    if (isAtk(e.code) || e.code === 'Enter' || e.code === 'Space') nextLine();
    return;
  }
  if (state !== 'play') return;
  if (e.code === 'KeyP' || e.code === 'Escape') {
    togglePause();
    return;
  }
  if (paused) return;
  if (isAtk(e.code)) pressAttack();
  else if (
    e.code === 'Space' ||
    e.code === 'KeyX' ||
    e.code === 'ShiftLeft' ||
    e.code === 'ShiftRight'
  )
    pressDash();
  else if (e.code === 'KeyK') pressRoll();
  else if (e.code === 'KeyL' || e.code === 'KeyC') pressMusou();
  else if (e.code === 'KeyG') blockHeld = true;
  else if (e.code === 'KeyF') switchStyle();
  else if (e.code === 'KeyB') turnView(-1);
  else if (e.code === 'KeyN') turnView(1);
  else if (e.code === 'KeyE') userZoom = clamp(userZoom + 0.1, 0.75, 1.6);
  else if (e.code === 'KeyQ') userZoom = clamp(userZoom - 0.1, 0.75, 1.6);
});
addEventListener('keyup', (e) => {
  keys[e.code] = false;
  if (isAtk(e.code)) releaseAttack();
  if (e.code === 'KeyG') blockHeld = false;
});
addEventListener('blur', () => {
  clearControls();
  if (state === 'play' && !paused) togglePause();
});
const stick = { x: 0, y: 0, id: null };
function inputVec() {
  let x = 0,
    y = 0;
  if (keys.KeyA || keys.ArrowLeft) x--;
  if (keys.KeyD || keys.ArrowRight) x++;
  if (keys.KeyW || keys.ArrowUp) y--;
  if (keys.KeyS || keys.ArrowDown) y++;
  x += stick.x + padMove.x;
  y += stick.y + padMove.y;
  const m = Math.hypot(x, y);
  if (m > 1) {
    x /= m;
    y /= m;
  }
  const u = x / (2 * ISO_X) + y / (2 * ISO_Y),
    v = y / (2 * ISO_Y) - x / (2 * ISO_X),
    a = (-viewQuarter * Math.PI) / 2,
    co = Math.cos(a),
    si = Math.sin(a),
    wx = u * co - v * si,
    wy = u * si + v * co,
    len = Math.hypot(wx, wy) || 1;
  return { x: (wx / len) * Math.min(1, m), y: (wy / len) * Math.min(1, m), m: Math.min(1, m) };
}

/* ---------------- audio ---------------- */
let AC = null,
  master,
  musicBus,
  sfxBus,
  revIn,
  noiseBuf,
  nextBar = 0,
  barIdx = 0,
  loopN = 0,
  muted = false;
const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);
function initAudio() {
  if (AC) {
    if (AC.state === 'suspended') AC.resume().catch(() => {});
    return;
  }
  try {
    AC = new (window.AudioContext || window.webkitAudioContext)();
  } catch (err) {
    AC = null;
    return;
  }
  const comp = AC.createDynamicsCompressor();
  comp.threshold.value = -16;
  comp.ratio.value = 4;
  comp.connect(AC.destination);
  master = AC.createGain();
  master.gain.value = muted ? 0 : 0.9;
  master.connect(comp);
  const conv = AC.createConvolver();
  const len = AC.sampleRate * 5,
    ib = AC.createBuffer(2, len, AC.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = ib.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
  }
  conv.buffer = ib;
  revIn = AC.createGain();
  revIn.connect(conv);
  const wet = AC.createGain();
  wet.gain.value = 0.75;
  conv.connect(wet);
  wet.connect(master);
  musicBus = AC.createGain();
  musicBus.gain.value = 0.55;
  musicBus.connect(master);
  const ms = AC.createGain();
  ms.gain.value = 1;
  musicBus.connect(ms);
  ms.connect(revIn);
  sfxBus = AC.createGain();
  sfxBus.gain.value = 0.5;
  sfxBus.connect(master);
  const ss = AC.createGain();
  ss.gain.value = 0.18;
  sfxBus.connect(ss);
  ss.connect(revIn);
  noiseBuf = AC.createBuffer(1, AC.sampleRate, AC.sampleRate);
  const nd = noiseBuf.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  nextBar = AC.currentTime + 0.3;
  setInterval(schedMusic, 120);
}
const VOWELS = {
  a: [
    [800, 1],
    [1150, 0.5],
    [2900, 0.1],
  ],
  o: [
    [450, 1],
    [800, 0.35],
    [2830, 0.06],
  ],
  u: [
    [325, 1],
    [700, 0.22],
    [2530, 0.04],
  ],
  e: [
    [400, 1],
    [1700, 0.3],
    [2600, 0.12],
  ],
};
function choir(f, t, dur, vel, vowel, bus) {
  bus = bus || musicBus;
  const out = AC.createGain(),
    end = t + dur + 2.2;
  out.gain.setValueAtTime(0, t);
  out.gain.linearRampToValueAtTime(vel, t + Math.min(1.6, dur * 0.4));
  out.gain.setValueAtTime(vel, t + dur * 0.75);
  out.gain.linearRampToValueAtTime(0, end);
  const src = AC.createGain();
  src.gain.value = 0.55;
  const lfo = AC.createOscillator(),
    lg = AC.createGain();
  lfo.frequency.value = 4.6 + Math.random() * 0.8;
  lg.gain.value = f * 0.007;
  lfo.connect(lg);
  lfo.start(t);
  lfo.stop(end);
  for (const det of [-11, 0, 10]) {
    const o = AC.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = f;
    o.detune.value = det + rand(-3, 3);
    lg.connect(o.frequency);
    o.connect(src);
    o.start(t);
    o.stop(end);
  }
  for (const [ff, a] of VOWELS[vowel]) {
    const bp = AC.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = ff * (f > 500 ? 1.08 : 1);
    bp.Q.value = ff / 110;
    const ga = AC.createGain();
    ga.gain.value = a * 2.2;
    src.connect(bp);
    bp.connect(ga);
    ga.connect(out);
  }
  const s = AC.createOscillator(),
    sg = AC.createGain();
  s.frequency.value = f;
  sg.gain.value = 0.09;
  s.connect(sg);
  sg.connect(out);
  s.start(t);
  s.stop(end);
  out.connect(bus);
}
function bell(f, t, v, bus) {
  bus = bus || musicBus;
  for (const [m, a, d] of [
    [1, 1, 2.6],
    [3.01, 0.35, 1.1],
    [5.4, 0.12, 0.5],
  ]) {
    const o = AC.createOscillator(),
      gn = AC.createGain();
    o.type = 'sine';
    o.frequency.value = f * m;
    gn.gain.setValueAtTime(0, t);
    gn.gain.linearRampToValueAtTime(v * a, t + 0.005);
    gn.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(gn);
    gn.connect(bus);
    o.start(t);
    o.stop(t + d + 0.05);
  }
}
function sub(f, t, dur, v) {
  const o = AC.createOscillator(),
    gn = AC.createGain(),
    lp = AC.createBiquadFilter();
  o.type = 'triangle';
  o.frequency.value = f;
  lp.type = 'lowpass';
  lp.frequency.value = 300;
  gn.gain.setValueAtTime(0, t);
  gn.gain.linearRampToValueAtTime(v, t + 1.2);
  gn.gain.linearRampToValueAtTime(0, t + dur + 1.2);
  o.connect(lp);
  lp.connect(gn);
  gn.connect(musicBus);
  o.start(t);
  o.stop(t + dur + 1.3);
}
function drum(t, v) {
  const o = AC.createOscillator(),
    gn = AC.createGain();
  o.frequency.setValueAtTime(120, t);
  o.frequency.exponentialRampToValueAtTime(42, t + 0.35);
  gn.gain.setValueAtTime(v, t);
  gn.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
  o.connect(gn);
  gn.connect(musicBus);
  o.start(t);
  o.stop(t + 0.65);
  noiseHit(t, 0.05, 900, v * 0.25, 'lowpass', musicBus);
}
function noiseHit(t, dur, f, v, type, bus) {
  if (!AC) return;
  const s = AC.createBufferSource();
  s.buffer = noiseBuf;
  const fl = AC.createBiquadFilter();
  fl.type = type || 'bandpass';
  fl.frequency.value = f;
  fl.Q.value = 1.2;
  const gn = AC.createGain();
  gn.gain.setValueAtTime(v, t);
  gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(fl);
  fl.connect(gn);
  gn.connect(bus || sfxBus);
  s.start(t, Math.random() * 0.5);
  s.stop(t + dur + 0.02);
  return fl;
}
// D minor: Dm  Bb  Fmaj7  C  Gm  Dm  Bbmaj7  Asus/A
const CHORDS = [
  [38, 57, 62, 65],
  [34, 58, 62, 65],
  [41, 57, 60, 64],
  [36, 55, 60, 64],
  [31, 58, 62, 67],
  [38, 57, 62, 65],
  [34, 57, 62, 69],
  [33, 57, 62, 64],
];
const MEL = [
  [
    [69, 0, 2],
    [67, 2, 1],
    [65, 3, 1],
  ],
  [
    [62, 0, 3],
    [65, 3, 1],
  ],
  [
    [69, 0, 1.5],
    [72, 1.5, 0.5],
    [70, 2, 2],
  ],
  [[67, 0, 4]],
  [
    [70, 0, 2],
    [69, 2, 1],
    [67, 3, 1],
  ],
  [
    [65, 0, 2],
    [62, 2, 2],
  ],
  [
    [65, 0, 1],
    [67, 1, 1],
    [69, 2, 2],
  ],
  [
    [73, 0, 2],
    [69, 2, 2],
  ],
];
const BAR = 4.4;
function schedMusic() {
  if (!AC) return;
  while (nextBar < AC.currentTime + 1.2) {
    const t = nextBar,
      beat = BAR / 4,
      ch = CHORDS[barIdx];
    sub(midi(ch[0]), t, BAR, 0.22);
    for (let k = 1; k < ch.length; k++)
      choir(midi(ch[k]), t, BAR, 0.07, k === ch.length - 1 ? 'a' : 'o');
    if (barIdx === 7) choir(midi(61), t + BAR / 2, BAR / 2, 0.07, 'o'); // A major resolve
    const mode = loopN % 4;
    if (mode === 1 || mode === 3)
      for (const [n, b, l] of MEL[barIdx]) choir(midi(n), t + b * beat, l * beat, 0.11, 'u');
    if (mode === 2 || mode === 3)
      for (const [n, b] of MEL[barIdx])
        if (Math.random() < 0.75) bell(midi(n + 12), t + b * beat, 0.05);
    if (mode === 0)
      for (let k = 0; k < 4; k++)
        if (Math.random() < 0.5) bell(midi(pick(ch.slice(1)) + 24), t + (k + 0.5) * beat, 0.025);
    if (state === 'play' && !paused) {
      const v = G && G.engaged ? 0.5 : 0.28;
      drum(t, v);
      drum(t + 2 * beat, v * 0.7);
      if (G && G.engaged) {
        drum(t + 3 * beat + beat / 2, v * 0.5);
      }
    }
    barIdx = (barIdx + 1) % 8;
    if (barIdx === 0) loopN++;
    nextBar += BAR;
  }
}
const sfx = {
  swing(w, i) {
    if (!AC || muted) return;
    const t = AC.currentTime;
    const f = noiseHit(t, w === 'scarf' ? 0.22 : 0.1, 700, w === 'scarf' ? 0.25 : 0.18);
    if (f) f.frequency.exponentialRampToValueAtTime(2600, t + 0.15);
  },
  hit(heavy) {
    if (!AC || muted) return;
    const t = AC.currentTime;
    noiseHit(t, 0.07, 1700, 0.45);
    const o = AC.createOscillator(),
      gn = AC.createGain();
    o.type = 'square';
    o.frequency.setValueAtTime(heavy ? 180 : 260, t);
    o.frequency.exponentialRampToValueAtTime(60, t + 0.09);
    gn.gain.setValueAtTime(0.12, t);
    gn.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
    o.connect(gn);
    gn.connect(sfxBus);
    o.start(t);
    o.stop(t + 0.12);
  },
  squeak() {
    if (!AC || muted) return;
    const t = AC.currentTime;
    const o = AC.createOscillator(),
      gn = AC.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(900, t);
    o.frequency.linearRampToValueAtTime(1700, t + 0.06);
    o.frequency.linearRampToValueAtTime(1100, t + 0.14);
    gn.gain.setValueAtTime(0.12, t);
    gn.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    o.connect(gn);
    gn.connect(sfxBus);
    o.start(t);
    o.stop(t + 0.18);
  },
  // A blocked blow: a short wooden knock with a bright tick on top.
  block() {
    if (!AC || muted) return;
    const t = AC.currentTime;
    for (const [f, len, vol] of [
      [320, 0.09, 0.1],
      [1240, 0.05, 0.04],
    ]) {
      const o = AC.createOscillator(),
        gn = AC.createGain();
      o.type = 'triangle';
      o.frequency.setValueAtTime(f, t);
      o.frequency.exponentialRampToValueAtTime(f * 0.6, t + len);
      gn.gain.setValueAtTime(vol, t);
      gn.gain.exponentialRampToValueAtTime(0.0001, t + len);
      o.connect(gn);
      gn.connect(sfxBus);
      o.start(t);
      o.stop(t + len + 0.02);
    }
  },
  hurt() {
    if (!AC || muted) return;
    const t = AC.currentTime;
    const o = AC.createOscillator(),
      gn = AC.createGain(),
      lp = AC.createBiquadFilter();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(200, t);
    o.frequency.exponentialRampToValueAtTime(70, t + 0.25);
    lp.type = 'lowpass';
    lp.frequency.value = 800;
    gn.gain.setValueAtTime(0.3, t);
    gn.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    o.connect(lp);
    lp.connect(gn);
    gn.connect(sfxBus);
    o.start(t);
    o.stop(t + 0.32);
  },
  musou() {
    if (!AC || muted) return;
    const t = AC.currentTime;
    for (const n of [74, 77, 81, 86]) choir(midi(n), t, 1.8, 0.12, 'a', sfxBus);
    const f = noiseHit(t, 1.2, 400, 0.3);
    if (f) f.frequency.exponentialRampToValueAtTime(5000, t + 1);
  },
  pickup() {
    if (!AC || muted) return;
    const t = AC.currentTime;
    bell(midi(86), t, 0.12, sfxBus);
    bell(midi(93), t + 0.08, 0.1, sfxBus);
  },
  boom() {
    if (!AC || muted) return;
    const t = AC.currentTime;
    const o = AC.createOscillator(),
      gn = AC.createGain();
    o.frequency.setValueAtTime(90, t);
    o.frequency.exponentialRampToValueAtTime(30, t + 0.5);
    gn.gain.setValueAtTime(0.6, t);
    gn.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
    o.connect(gn);
    gn.connect(sfxBus);
    o.start(t);
    o.stop(t + 0.75);
    noiseHit(t, 0.4, 500, 0.4, 'lowpass');
  },
  tell() {
    if (!AC || muted) return;
    const t = AC.currentTime;
    bell(midi(81), t, 0.06, sfxBus);
  },
  bark() {
    if (!AC || muted) return;
    const t = AC.currentTime;
    for (const d of [0, 0.22]) {
      const o = AC.createOscillator(),
        gn = AC.createGain(),
        bp = AC.createBiquadFilter();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(700, t + d);
      o.frequency.exponentialRampToValueAtTime(380, t + d + 0.1);
      bp.type = 'bandpass';
      bp.frequency.value = 1200;
      bp.Q.value = 2;
      gn.gain.setValueAtTime(0.0001, t + d);
      gn.gain.linearRampToValueAtTime(0.3, t + d + 0.01);
      gn.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.13);
      o.connect(bp);
      bp.connect(gn);
      gn.connect(sfxBus);
      o.start(t + d);
      o.stop(t + d + 0.15);
    }
  },
};
function setMuted(m) {
  muted = m;
  $('#muteBtn').textContent = m ? '×' : '♪';
  $('#muteBtn').setAttribute('aria-label', m ? 'Unmute music' : 'Mute music');
  if (master) master.gain.setTargetAtTime(m ? 0 : 0.9, AC.currentTime, 0.05);
}

/* ---------------- UI flow ---------------- */
function show(id) {
  for (const s of ['#sTitle', '#sSelect', '#sPause', '#sEnd']) $(s).hidden = s !== id;
}
$('#toSelect').onclick = () => {
  initAudio();
  show('#sSelect');
};
$('#pickScarf').onclick = () => pickMode('adventure');
$('#pickPaws').onclick = () => pickMode('cozy');
function pickMode(mode) {
  if (typeof SnowdayShared !== 'undefined') SnowdayShared.setMode(mode);
  startGame(mode);
}
$('#again').onclick = () => {
  show('#sSelect');
  state = 'title';
  $('#hud').hidden = true;
  $('#touch').hidden = true;
};
$('#resume').onclick = () => togglePause();
$('#pauseBtn').onclick = () => togglePause();
$('#muteBtn').onclick = () => {
  setMuted(!muted);
  if (typeof SnowdayShared !== 'undefined') SnowdayShared.setSound(!muted);
};
$('#dialog').onclick = () => nextLine();
function togglePause() {
  if (state !== 'play') return;
  clearControls();
  paused = !paused;
  show(paused ? '#sPause' : null);
  if (!paused && AC?.state === 'suspended') AC.resume().catch(() => {});
}
function startGame(w) {
  initAudio();
  newGame(w);
  show(null);
  state = 'play';
  paused = false;
  $('#hud').hidden = false;
  if (isTouch) $('#touch').hidden = false;
  dialog([
    [
      'Narrator',
      'First snow of the year. Ruffy saw a jackrabbit, slipped his leash, and bolted into the white prairie.',
    ],
    ['Darren', "RUFFY! ...He's so small. He'll freeze out there."],
    [
      'Narrator',
      "The Bramble Baron's goons hold every hill. Three officers guard three camps. Someone out there has seen Ruffy.",
    ],
    ['Darren', "Rubber chickens won't stop me. Hang on, buddy. I'm coming."],
  ]);
}
let dlgQ = [],
  dlgDone = null;
function dialog(lines, done) {
  clearControls();
  dlgQ = lines.slice();
  dlgDone = done || null;
  nextLine();
}
function nextLine() {
  if (!dlgQ.length) {
    $('#dialog').hidden = true;
    dialogOpen = false;
    const d = dlgDone;
    dlgDone = null;
    if (d) d();
    return;
  }
  dialogOpen = true;
  const [who, text] = dlgQ.shift();
  const w = $('#dialog .who');
  w.textContent = who;
  w.className =
    'who' + (who === 'Narrator' ? ' narr' : who === 'Darren' || who === 'Ruffy' ? '' : ' foe');
  $('#dialog p').textContent = text;
  $('#dialog').hidden = false;
}
let bannerT = null;
function banner(text, sub) {
  const b = $('#banner');
  b.innerHTML = '';
  b.append(text);
  if (sub) {
    const s = document.createElement('small');
    s.textContent = sub;
    b.append(s);
  }
  b.classList.add('show');
  clearTimeout(bannerT);
  bannerT = setTimeout(() => b.classList.remove('show'), 1500);
}

/* touch */
let isTouch =
  matchMedia('(pointer: coarse)').matches ||
  ((navigator.maxTouchPoints || 0) > 0 && innerWidth < 1100);
if (isTouch) document.body.classList.add('touch');
(() => {
  const st = $('#stick'),
    kn = $('#knob');
  function mv(e) {
    const r = st.getBoundingClientRect();
    let x = (e.clientX - r.left - r.width / 2) / (r.width / 2),
      y = (e.clientY - r.top - r.height / 2) / (r.height / 2);
    const m = Math.hypot(x, y);
    if (m > 1) {
      x /= m;
      y /= m;
    }
    stick.x = x;
    stick.y = y;
    const travel = Math.max(0, (r.width - kn.offsetWidth) / 2 - 2);
    kn.style.transform = `translate(${x * travel}px,${y * travel}px)`;
  }
  st.addEventListener('pointerdown', (e) => {
    if (stick.id !== null || state !== 'play' || paused || dialogOpen) return;
    e.preventDefault();
    stick.id = e.pointerId;
    st.setPointerCapture(e.pointerId);
    mv(e);
  });
  st.addEventListener('pointermove', (e) => {
    if (e.pointerId === stick.id) mv(e);
  });
  const end = (e) => {
    if (e.pointerId === stick.id) {
      stick.id = null;
      stick.x = stick.y = 0;
      kn.style.transform = '';
    }
  };
  st.addEventListener('pointerup', end);
  st.addEventListener('pointercancel', end);
  st.addEventListener('lostpointercapture', end);
  const tap = (id, fn) =>
    $(id).addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (dialogOpen) {
        nextLine();
        return;
      }
      if (state === 'play' && !paused) fn();
    });
  tap('#tDash', pressDash);
  tap('#tMu', pressMusou);
  tap('#tRoll', pressRoll);
  // Block is held: it guards while a finger stays on it.
  const block = $('#tBlock');
  block.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (state === 'play' && !paused && !dialogOpen) {
      blockHeld = true;
      block.setPointerCapture(e.pointerId);
    }
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'])
    block.addEventListener(type, () => (blockHeld = false));
})();

/* ---------------- player actions ---------------- */
function nearestEnemy(maxD, origin = P) {
  let best = null,
    bd = maxD;
  for (const e of enemies) {
    if (
      e.dead ||
      (!e.active && e.officer) ||
      !groundCombatReach(origin, e) ||
      !lineOfTerrain(origin.x, origin.y, e.x, e.y, groundHeight(origin.x, origin.y) + 45)
    )
      continue;
    const d = Math.hypot(e.x - origin.x, e.y - origin.y);
    if (d < bd) {
      bd = d;
      best = e;
    }
  }
  return best;
}
function pressAttack() {
  if (!canAct() || P.musou || P.roll || P.dash > 0) return;
  if (P.weapon === 'paws') {
    brawlHeld = true;
    if (P.atk) P.queued = true;
    else startAtk(0);
    return;
  }
  if (P.shotCd > 0) {
    bufferAction('attack');
    return;
  }
  chargeHeld = true;
  chargeTime = 0;
}
function startAtk(index = 0) {
  if (!canAct() || P.weapon !== 'paws') return;
  const d = WEAPONS.paws.chain[index];
  P.queued = false;
  P.dir = targetAngle();
  P.face = Math.cos(P.dir) >= 0 ? 1 : -1;
  P.atk = { i: index, d, t: 0, hit: new Set() };
  P.throwT = 0;
  sfx.swing('paws', index);
  padRumble(index === 3 ? 0.22 : 0.09, 45);
}
function switchStyle() {
  if (!canAct() || P.dash > 0 || P.musou) return;
  chargeHeld = false;
  brawlHeld = false;
  chargeTime = 0;
  actionBuffer = null;
  P.roll = null;
  P.atk = null;
  P.queued = false;
  P.weapon = P.weapon === 'paws' ? 'snow' : 'paws';
  lastHud.mu = -1;
  updateStyleLabels();
  saveCampAppearance();
}
function updateStyleLabels() {
  const paws = P?.weapon === 'paws';
  $('#wName').textContent = WEAPONS[paws ? 'paws' : 'snow'].name;
  $('#aThrow b').textContent = paws ? 'Punch combo' : 'Snowball';
  $('#aThrow>span').textContent = paws ? '✦' : '❄';
  $('#aRoll b').textContent = paws ? 'Tail sweep' : 'Snow roll';
  $('#aRoll>span').textContent = paws ? '↻' : '◉';
  $('#tAtk').textContent = paws ? 'COMBO' : 'SNOW';
  $('#styleToggle').textContent = paws ? 'Paws ⇄ Snow' : 'Snow ⇄ Paws';
  $('#styleToggle').setAttribute(
    'aria-label',
    paws ? 'Switch to snowball style' : 'Switch to unarmed style'
  );
  updateControlLabels();
}
function pressDash() {
  if (!canAct() || P.musou) return;
  if (P.dashCd > 0) {
    bufferAction('dash');
    return;
  }
  chargeHeld = false;
  brawlHeld = false;
  P.queued = false;
  P.roll = null;
  const v = inputVec();
  if (v.m > 0.2) P.dir = Math.atan2(v.y, v.x);
  P.dash = 0.2;
  P.dashCd = 0.85;
  P.inv = Math.max(P.inv, 0.25);
  P.atk = null;
  for (let i = 0; i < 8; i++)
    parts.push({
      x: P.x,
      y: P.y - 4,
      vx: rand(-60, 60),
      vy: rand(-40, 10),
      life: 0.5,
      max: 0.5,
      size: rand(4, 8),
      color: '#FFFFFF',
      kind: 'puff',
    });
}
function pressMusou() {
  if (!canAct() || P.mus < 100 || P.musou) return;
  chargeHeld = false;
  brawlHeld = false;
  P.atk = null;
  P.queued = false;
  P.roll = null;
  P.mus = 0;
  P.musou = { t: 0, dur: 2.2, tick: 0 };
  banner('SCARF-STAR BLIZZARD', 'Darren’s signature snow special');
  sfx.musou();
  shake = reduceMotion ? 0 : 6;
}

function hitEnemy(e, dmg, ang, kb, heavy) {
  if (e.dead || (e.officer && !e.active)) return;
  dmg = Math.round(dmg * rand(0.9, 1.15));
  e.hp -= dmg;
  e.flash = 0.12;
  const res = e.officer ? 0.22 : 1;
  e.kx += Math.cos(ang) * kb * res * 60;
  e.ky += Math.sin(ang) * kb * res * 60;
  if (!e.officer) {
    e.state = 'hurt';
    e.st = 0.32;
  } else if (e.state === 'idle' || e.state === 'hurt') {
    e.state = 'hurt';
    e.st = 0.1;
  }
  P.combo++;
  P.comboT = 2.4;
  if (P.combo > P.maxCombo) P.maxCombo = P.combo;
  if (!P.musou) P.mus = Math.min(100, P.mus + (e.officer ? 3.2 : 2.3));
  floaters.push({ x: e.x + rand(-8, 8), y: e.y, z: e.rad * 2.2 + 24, v: dmg, life: 0.7, heavy });
  const col = P.weapon === 'scarf' ? ['#F6D23A', '#EC5C9A'] : ['#FFFFFF', '#FFB4A8'];
  for (let i = 0; i < (heavy ? 10 : 5); i++) {
    const a = ang + rand(-1, 1),
      s = rand(80, 260);
    parts.push({
      x: e.x,
      y: e.y - e.rad,
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s - 60,
      life: 0.4,
      max: 0.4,
      size: rand(2, 5),
      color: pick(col),
      kind: 'dot',
    });
  }
  parts.push({
    x: e.x,
    y: e.y - e.rad,
    life: 0.16,
    max: 0.16,
    size: heavy ? 30 : 20,
    kind: 'star',
  });
  padRumble(heavy ? 0.38 : 0.13, heavy ? 90 : 40);
  sfx.hit(heavy);
  if (e.type === 'gopher' && Math.random() < 0.35) sfx.squeak();
  hitstop = Math.max(hitstop, heavy ? 0.06 : 0.025);
  shake = Math.max(shake, heavy ? 7 : 3);
  if (e.hp <= 0) killEnemy(e, ang);
}
function killEnemy(e, ang) {
  e.dead = true;
  e.hp = 0;
  e.fly = {
    t: 0,
    vx: Math.cos(ang) * rand(250, 420),
    vy: Math.sin(ang) * rand(150, 300),
    z: 0,
    vz: rand(320, 480),
    r: 0,
    vr: rand(-12, 12),
  };
  if (e.officer) {
    e.fly.vx *= 0.2;
    e.fly.vy *= 0.2;
    e.fly.vz = 200;
  }
  P.ko++;
  if (P.ko >= G.nextKoMark) {
    banner(G.nextKoMark + ' K.O.!', 'Keep going, Darren');
    G.nextKoMark += 100;
    P.hp = Math.min(P.max, P.hp + 15);
  }
  const r = Math.random();
  if (r < 0.07) pickups.push({ x: e.x, y: e.y, kind: 'cookie', t: 0 });
  else if (r < 0.2) pickups.push({ x: e.x, y: e.y, kind: 'orb', t: 0 });
  for (let i = 0; i < 8; i++) {
    const a = rand(0, TAU);
    parts.push({
      x: e.x,
      y: e.y - 8,
      vx: Math.cos(a) * rand(40, 120),
      vy: Math.sin(a) * rand(20, 60),
      life: 0.6,
      max: 0.6,
      size: rand(5, 10),
      color: '#FFFFFF',
      kind: 'puff',
    });
  }
  if (e.officer) officerDown(e);
}
// Held block (update 17): 25% off each blow, same as the 3D game.
const BLOCK_CUT = 0.25;
function guarding() {
  return blockHeld && canAct() && !P.musou && !P.atk && !P.roll && P.dash <= 0 && !chargeHeld;
}
function hurtPlayer(dmg, ang) {
  if (P.inv > 0 || P.musou || P.hp <= 0 || G.ending) return;
  dmg = Math.round(dmg * (G.mode === 'cozy' ? 0.55 : 1));
  if (guarding()) {
    // The guard holds: less damage, a short slide back, no lost combo or broken move.
    const full = dmg;
    dmg = Math.max(1, Math.round(full * (1 - BLOCK_CUT)));
    P.hp -= dmg;
    P.inv = 0.45;
    P.kx += Math.cos(ang) * 120;
    P.ky += Math.sin(ang) * 120;
    P.blockT = 0.25;
    P.blocked = (P.blocked || 0) + 1;
    shake = Math.max(shake, 3);
    padRumble(0.25, 70);
    sfx.block();
    for (let i = 0; i < 8; i++)
      parts.push({
        x: P.x - Math.cos(ang) * 26,
        y: P.y - Math.sin(ang) * 26,
        vx: rand(-90, 90) - Math.cos(ang) * 80,
        vy: rand(-90, 40) - Math.sin(ang) * 80,
        life: 0.35,
        max: 0.35,
        size: rand(3, 6),
        color: '#cfeeff',
        kind: 'puff',
      });
    floaters.push({ x: P.x, y: P.y, z: 86, v: '-' + dmg + ' BLOCK', life: 0.8, block: true });
    if (P.hp <= 0) {
      P.hp = 0;
      loseGame();
    }
    return;
  }
  P.hp -= dmg;
  P.inv = 0.7;
  P.hurtT = 0.3;
  P.kx += Math.cos(ang) * 260;
  P.ky += Math.sin(ang) * 260;
  P.mus = Math.min(100, P.mus + 5);
  P.combo = 0;
  shake = Math.max(shake, 8);
  flashRed = 0.25;
  padRumble(0.6, 130);
  sfx.hurt();
  if (dmg >= 12) P.atk = null;
  floaters.push({ x: P.x, y: P.y, z: 86, v: -dmg, life: 0.8, player: true });
  if (P.hp <= 0) {
    P.hp = 0;
    loseGame();
  }
}

/* ---------------- objectives ---------------- */
function officerEngage(e) {
  G.engaged = e;
  $('#bossBox').hidden = false;
  $('#bossName').textContent = OFFICERS[e.type].name;
  sfx.boom();
  banner(
    OFFICERS[e.type].name.toUpperCase(),
    e.type === 'baron' ? 'FINAL BATTLE' : 'OFFICER ENGAGED'
  );
  later(0.7, () => {
    if (state === 'play' && !G.ending && !G.lost && !e.dead && G.engaged === e)
      dialog(OFFICERS[e.type].hello);
  });
}
function officerDown(e) {
  G.engaged = null;
  $('#bossBox').hidden = true;
  pickups.push(
    { x: e.x - 20, y: e.y, kind: 'cookie', t: 0 },
    { x: e.x + 20, y: e.y, kind: 'cookie', t: 0 },
    { x: e.x, y: e.y + 20, kind: 'orb', t: 0 }
  );
  for (const o of enemies)
    if (!o.officer && !o.dead && Math.hypot(o.x - e.x, o.y - e.y) < 420)
      killEnemy(o, Math.atan2(o.y - e.y, o.x - e.x));
  if (e.type === 'baron') {
    beginEnding(e);
    return;
  }
  G.campsDone[e.camp] = true;
  G.lastCamp = e.camp;
  G.clues++;
  P.hp = Math.min(P.max, P.hp + 25);
  if (!G.friend) {
    G.friend = true;
    ally = { x: P.x - 65, y: P.y + 35, t: 0 };
  }
  saveCheckpoint();
  banner('CLUE ' + G.clues + ' / 3', CAMPS[e.camp].label + ' cleared');
  later(0.9, () => {
    if (G.lost || G.ending || state !== 'play') return;
    const lines = OFFICERS[e.type].clue.slice();
    if (G.clues === 1)
      lines.push([
        'Tormund',
        'You helped clear the road! I will watch your back. Let us find Ruffy.',
      ]);
    dialog(lines, () => {
      if (G.clues >= 3) spawnBaron();
    });
  });
}
function spawnBaron() {
  if (G.baronSpawned) return;
  G.baronSpawned = true;
  const b = makeEnemy('baron', HOLLOW.x, HOLLOW.y, true);
  enemies.push(b);
  G.boss = b;
  for (let k = 0; k < 12; k++) {
    const e = makeEnemy(
      pick(['gopher', 'bale', 'crow']),
      HOLLOW.x + rand(-220, 220),
      HOLLOW.y + rand(-160, 160)
    );
    e.guard = { x: HOLLOW.x, y: HOLLOW.y };
    enemies.push(e);
  }
  banner('THE HOLLOW STIRS', 'Head east');
}
function safeReunionPoint(b) {
  const desired = { x: b.x + 20, y: b.y + 10 },
    candidates = [desired];
  for (const radius of [60, 90, 130, 180])
    for (let i = 0; i < 32; i++) {
      const a = (i * TAU) / 32;
      candidates.push({ x: P.x + Math.cos(a) * radius, y: P.y + Math.sin(a) * radius });
    }
  const safe = candidates.filter(
    (q) =>
      canOccupy(q.x, q.y, 7) && groundCombatReach(P, q) && walkableSegment(P.x, P.y, q.x, q.y, 7)
  );
  safe.sort(
    (a, c) =>
      Math.hypot(a.x - desired.x, a.y - desired.y) - Math.hypot(c.x - desired.x, c.y - desired.y)
  );
  return safe[0] || { x: P.x, y: P.y };
}
function beginEnding(b) {
  G.ending = { t: 0, phase: 'run' };
  const start = safeReunionPoint(b);
  ruffy = { x: start.x, y: start.y, face: -1, t: 0 };
  sfx.bark();
  for (const e of enemies) if (!e.dead) killEnemy(e, Math.atan2(e.y - P.y, e.x - P.x));
  banner('THE BARON FALLS', 'A small bark under the brambles');
}
function loseGame() {
  if (state !== 'play' || G.lost) return;
  G.lost = true;
  clearControls();
  scheduled = [];
  dlgQ = [];
  dialogOpen = false;
  $('#dialog').hidden = true;
  later(0.8, () => {
    state = 'over';
    $('#hud').hidden = true;
    $('#touch').hidden = true;
    $('#endTitle').textContent = 'A little rest. Another try.';
    $('#endText').textContent =
      'Darren warms his paws inside his scarf. Ruffy still needs him. Your cleared camps are saved: continue from your last camp, or start a new snowday.';
    fillStats();
    show('#sEnd');
    $('#endContinue').hidden = !checkpoint || checkpoint.complete;
  });
}
function winGame() {
  G.complete = true;
  saveCheckpoint();
  state = 'over';
  $('#endContinue').hidden = true;
  $('#hud').hidden = true;
  $('#touch').hidden = true;
  $('#endTitle').textContent = 'Found you.';
  $('#endText').textContent =
    'Ruffy rides home tucked inside the polka-dot scarf, warm for the first time all day. The snow keeps falling on the prairie, softer now. Nobody is lost anymore.';
  fillStats();
  show('#sEnd');
}
function fillStats() {
  $('#stKo').textContent = P.ko;
  $('#stCombo').textContent = P.maxCombo;
  const s = Math.floor(G.time);
  $('#stTime').textContent = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  $('#stStyle').textContent = WEAPONS[P.weapon].name;
}

/* ---------------- update ---------------- */
function update(dt) {
  tickScheduled(dt);
  if (state !== 'play' || dialogOpen) return;
  if (G.lost) {
    P.t += dt;
    return;
  }
  const motionX = P.x,
    motionY = P.y;
  G.time += dt;
  P.t += dt;
  navAge += dt;
  updateSnow(dt);
  const v = inputVec();
  P.throwT = Math.max(0, P.throwT - dt);
  P.inv = Math.max(0, P.inv - dt);
  P.hurtT = Math.max(0, P.hurtT - dt);
  P.dashCd = Math.max(0, P.dashCd - dt);
  P.blockT = Math.max(0, (P.blockT || 0) - dt);
  if (
    brawlHeld &&
    P.weapon === 'paws' &&
    !P.atk &&
    P.hurtT <= 0 &&
    P.dash <= 0 &&
    !P.musou &&
    canAct()
  )
    startAtk(0);
  P.sweepCd = Math.max(0, (P.sweepCd || 0) - dt);
  P.comboT -= dt;
  if (P.comboT <= 0) P.combo = 0;
  let mx = 0,
    my = 0;
  if (G.ending) {
    updateEnding(dt);
  } else if (P.musou) {
    updateMusou(dt, v);
  } else if (P.dash > 0) {
    P.vx = P.vy = 0;
    P.dash -= dt;
    mx = Math.cos(P.dir) * 720;
    my = Math.sin(P.dir) * 720;
    P.trailT = (P.trailT || 0) + dt;
    if (P.trailT >= 0.03) {
      P.trailT = 0;
      P.trail.push({ x: P.x, y: P.y, life: 0.25, face: P.face, anim: { ...darrenAnimation() } });
    }
  } else {
    const sp = P.roll ? 0.72 : chargeHeld ? 0.8 : guarding() ? 0.4 : 1;
    const accel = v.m > 0.05 ? 32 : 44;
    P.vx += (v.x * 260 * sp - P.vx) * (1 - Math.exp(-accel * dt));
    P.vy += (v.y * 260 * sp - P.vy) * (1 - Math.exp(-accel * dt));
    if (v.m < 0.05 && Math.hypot(P.vx, P.vy) < 3) P.vx = P.vy = 0;
    mx = P.vx;
    my = P.vy;
    if (v.m > 0.15 && !P.atk) {
      P.dir = Math.atan2(v.y, v.x);
      P.face = v.x > 0.1 ? 1 : v.x < -0.1 ? -1 : P.face;
    }
    if (P.atk) {
      const a = P.atk,
        d = a.d;
      a.t += dt;
      if (d.lunge && a.t < d.act[1]) {
        mx += Math.cos(P.dir) * d.lunge * 60;
        my += Math.sin(P.dir) * d.lunge * 60;
      }
      if (a.t >= d.act[0] && a.t <= d.act[1]) doHits(d, a);
      const chain = WEAPONS[P.weapon].chain;
      if (a.t >= d.dur) {
        if (P.queued || brawlHeld) startAtk((a.i + 1) % chain.length);
        else P.atk = null;
      }
    }
  }
  P.moving = Math.hypot(mx, my) > 20 && !P.atk;
  if (P.moving) {
    P.stepT += dt;
    if (P.stepT > (P.dash > 0 ? 0.035 : 0.12)) {
      P.stepT = 0;
      parts.push({
        x: P.x,
        y: P.y,
        life: 0.42,
        max: 0.42,
        size: rand(3, 6),
        color: '#f9ffff',
        kind: 'puff',
        vx: -mx * 0.14,
        vy: -my * 0.14,
      });
      if (!reduceMotion && P.dash <= 0) snowStep();
    }
  }
  terrainMove(P, (mx + P.kx) * dt, (my + P.ky) * dt, 14);
  P.kx *= Math.exp(-9 * dt);
  P.ky *= Math.exp(-9 * dt);
  if (P.moving && P.dash <= 0) P.animT += Math.hypot(P.x - motionX, P.y - motionY) / 260;
  for (const tr of P.trail) tr.life -= dt;
  P.trail = P.trail.filter((t) => t.life > 0);

  updateEnemies(dt);
  for (const p of projs) {
    const ox = p.x,
      oy = p.y;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt;
    p.rot = (p.rot || 0) + dt * 8;
    if (!lineOfTerrain(ox, oy, p.x, p.y, p.z)) {
      p.life = 0;
      continue;
    }
    if (
      Math.abs(p.z - groundHeight(P.x, P.y) - 35) < 38 &&
      Math.hypot(p.x - P.x, p.y - P.y) < p.r + 16
    ) {
      hurtPlayer(p.dmg, Math.atan2(p.vy, p.vx));
      p.life = 0;
    }
  }
  projs = projs.filter((p) => p.life > 0);
  for (const pk of pickups) {
    pk.t += dt;
    const d = Math.hypot(pk.x - P.x, pk.y - P.y);
    if (d < 120 && pk.t > 0.4 && groundCombatReach(P, pk)) {
      pk.x += (P.x - pk.x) * dt * 6;
      pk.y += (P.y - pk.y) * dt * 6;
    }
    if (d < 34 && pk.t > 0.4 && groundCombatReach(P, pk)) {
      pk.got = true;
      sfx.pickup();
      if (pk.kind === 'cookie') {
        gainCookie();
        P.hp = Math.min(P.max, P.hp + (G.mode === 'cozy' ? 32 : 22));
        floaters.push({
          x: P.x,
          y: P.y,
          z: 96,
          v: G.mode === 'cozy' ? '+32' : '+22',
          life: 0.8,
          heal: true,
        });
      } else {
        P.mus = Math.min(100, P.mus + 18);
      }
    }
  }
  pickups = pickups.filter((p) => !p.got && p.t < 25);

  // spawning
  if (!G.ending && !G.firewood) {
    spawnT -= dt;
    const grunts = enemies.reduce((n, e) => n + (!e.officer && !e.dead && !e.guard ? 1 : 0), 0),
      maxG = 26 + G.clues * 6;
    if (spawnT <= 0 && grunts < maxG) {
      spawnT = rand(0.6, 1.1);
      const a = rand(0, TAU),
        r = rand(620, 820),
        x = P.x + Math.cos(a) * r,
        y = P.y + Math.sin(a) * r;
      if (x > 60 && x < WORLD.w - 60 && y > 60 && y < WORLD.h - 60) {
        const type = pick(['gopher', 'gopher', 'gopher', 'crow', 'crow', 'bale']);
        const n = type === 'bale' ? 2 : rand(3, 5) | 0;
        for (let i = 0; i < n; i++)
          enemies.push(makeEnemy(type, x + rand(-50, 50), y + rand(-50, 50)));
      }
    }
  }
  enemies = enemies.filter((e) => !(e.dead && e.fly.t > 0.8) && !e.gone);

  for (const p of parts) {
    p.life -= dt;
    if (p.vx !== undefined) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= Math.exp(-3 * dt);
      p.vy *= Math.exp(-3 * dt);
    }
  }
  parts = parts.filter((p) => p.life > 0);
  if (parts.length > 500) parts.splice(0, parts.length - 500);
  for (const f of floaters) {
    f.life -= dt;
    f.z = (f.z || 30) + 40 * dt;
  }
  floaters = floaters.filter((f) => f.life > 0);

  // camera
  const lead = P.moving ? 50 : 0;
  cam.x += (P.x + Math.cos(P.dir) * lead - cam.x) * Math.min(1, dt * 5);
  cam.y += (P.y - 40 + Math.sin(P.dir) * lead - cam.y) * Math.min(1, dt * 5);
  cam.z += (groundHeight(P.x, P.y) - cam.z) * Math.min(1, dt * 8);
  updateDarrenMotion(dt);
}
function doHits(d, a) {
  for (const e of enemies) {
    if (
      e.dead ||
      a.hit.has(e) ||
      (e.officer && !e.active) ||
      !groundCombatReach(P, e) ||
      !lineOfTerrain(P.x, P.y, e.x, e.y, groundHeight(P.x, P.y) + 48)
    )
      continue;
    const dx = e.x - P.x,
      dy = e.y - P.y,
      dist = Math.hypot(dx, dy);
    if (dist > d.r + e.rad) continue;
    const ang = Math.atan2(dy, dx);
    if (!d.spin && Math.abs(angDiff(ang, P.dir)) > d.arc / 2 + 0.2) continue;
    a.hit.add(e);
    hitEnemy(
      e,
      d.dmg + (d.spin ? P.weight * 4 : d.launch ? P.weight * 2 : 0),
      ang,
      d.kb + (d.spin ? P.weight : 0),
      !!(d.spin || d.launch)
    );
  }
}
function updateMusou(dt, v) {
  const m = P.musou;
  m.t += dt;
  m.tick -= dt;
  P.inv = 0.3;
  terrainMove(P, v.x * 150 * dt, v.y * 150 * dt);
  if (m.tick <= 0) {
    m.tick = 0.18;
    for (let i = 0; i < 8; i++) snowShot((i * TAU) / 8 + m.t * 0.8, 12, 650, 16, true);
    parts.push({
      x: P.x,
      y: P.y,
      life: 0.4,
      max: 0.4,
      size: 110 + m.t * 25,
      kind: 'ring',
      color: '#9AE6FF',
    });
  }
  if (m.t >= m.dur) {
    P.musou = null;
    P.inv = 0.5;
  }
}
function updateEnemies(dt) {
  let winding = 0;
  for (const e of enemies) if (!e.officer && e.state === 'wind') winding++;
  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i];
    e.t += dt;
    e.flash -= dt;
    if (e.dead) {
      const f = e.fly;
      f.t += dt;
      e.x += f.vx * dt;
      e.y += f.vy * dt;
      f.z += f.vz * dt;
      f.vz -= 1100 * dt;
      if (f.z < 0) {
        f.z = 0;
        f.vz *= -0.3;
      }
      f.r += f.vr * dt;
      continue;
    }
    terrainMove(e, e.kx * dt, e.ky * dt, Math.min(e.rad, 22));
    e.kx *= Math.exp(-8 * dt);
    e.ky *= Math.exp(-8 * dt);
    const dx = P.x - e.x,
      dy = P.y - e.y,
      d = Math.hypot(dx, dy);
    e.moving = false;
    if (e.officer) {
      updateOfficer(e, dt, dx, dy, d);
    } else {
      if (e.state !== 'rec') e.face = dx > 0 ? 1 : -1;
      if (e.state === 'hurt') {
        e.st -= dt;
        if (e.st <= 0) e.state = 'idle';
      } else if (e.state === 'wind') {
        e.st -= dt;
        if (e.st <= 0) {
          e.state = 'rec';
          e.st = 0.4;
          if (d < e.rad + 46 && groundCombatReach(e, P)) hurtPlayer(e.dmg, Math.atan2(dy, dx));
        }
      } else if (e.state === 'rec') {
        e.st -= dt;
        if (e.st <= 0) e.state = 'idle';
      } else {
        e.cd -= dt;
        if (d < e.rad + 32 && e.cd <= 0 && winding < 3 && !G.ending) {
          e.state = 'wind';
          e.st = 0.55;
          e.cd = rand(1.3, 2.4);
          winding++;
        } else {
          let tx = null,
            ty = null;
          if (d < 720 && !G.ending) {
            if (d > e.rad + 20) {
              tx = P.x;
              ty = P.y;
            }
          } else if (e.guard && Math.hypot(e.x - e.guard.x, e.y - e.guard.y) > 240) {
            tx = e.guard.x;
            ty = e.guard.y;
          }
          if (tx !== null) {
            const a = navDirection(e, tx, ty) + (e.type === 'crow' ? Math.sin(e.t * 3) * 0.6 : 0);
            terrainMove(
              e,
              Math.cos(a) * e.spd * 60 * dt,
              Math.sin(a) * e.spd * 60 * dt,
              Math.min(e.rad, 22)
            );
            e.moving = true;
          }
        }
        if (!e.guard && d > 1500) e.gone = true;
      }
    }
    // separation
    for (let k = 1; k <= 3; k++) {
      const o = enemies[(i + k) % enemies.length];
      if (o === e || o.dead) continue;
      const sx = e.x - o.x,
        sy = e.y - o.y,
        sd = Math.hypot(sx, sy),
        m = e.rad + o.rad;
      if (sd < m && sd > 0) {
        const push = (m - sd) * 0.5;
        if (!e.officer) terrainMove(e, (sx / sd) * push, (sy / sd) * push, Math.min(e.rad, 20));
        if (!o.officer) terrainMove(o, (-sx / sd) * push, (-sy / sd) * push, Math.min(o.rad, 20));
      }
    }
    e.x = clamp(e.x, 20, WORLD.w - 20);
    e.y = clamp(e.y, 30, WORLD.h - 20);
  }
}
const MOVE_WIND = { swipe: 0.6, slam: 1, charge: 0.75, thorns: 0.85, eggs: 0.7 };
function updateOfficer(e, dt, dx, dy, d) {
  if (!e.active) {
    if (d < 480 && !G.ending && !G.engaged) {
      e.active = true;
      officerEngage(e);
    }
    return;
  }
  const boss = e.type === 'baron',
    dm = boss ? 1.3 : 1;
  e.st -= dt;
  if (e.state !== 'charge') e.face = dx > 0 ? 1 : -1;
  switch (e.state) {
    case 'hurt':
      if (e.st <= 0) e.state = 'idle';
      break;
    case 'idle': {
      e.cd -= dt;
      if (d > e.rad + 50) {
        const a = navDirection(e, P.x, P.y);
        terrainMove(
          e,
          Math.cos(a) * e.spd * 60 * dt,
          Math.sin(a) * e.spd * 60 * dt,
          Math.min(e.rad, 22)
        );
        e.moving = true;
      }
      if (e.cd <= 0 && d < 620) {
        const moves = OFFICERS[e.type].moves;
        let m = pick(moves);
        if (d < e.rad + 80 && moves.includes('swipe') && Math.random() < 0.5) m = 'swipe';
        if (m === 'swipe' && d > e.rad + 120)
          m = moves.includes('charge') ? 'charge' : moves.includes('eggs') ? 'eggs' : 'slam';
        if (m === 'slam' && d > 260) m = moves.includes('charge') ? 'charge' : 'swipe';
        e.move = m;
        e.state = 'wind';
        e.st = MOVE_WIND[m];
        e.cd = rand(1.1, 2) * (boss ? 0.75 : 1);
        e.cdir = Math.atan2(dy, dx);
        sfx.tell();
      }
      break;
    }
    case 'wind':
      if (e.move === 'charge' || e.move === 'swipe') e.cdir = Math.atan2(dy, dx);
      if (e.st <= 0) {
        const m = e.move;
        if (m === 'swipe') {
          if (
            groundCombatReach(e, P) &&
            d < e.rad + 85 &&
            Math.abs(angDiff(Math.atan2(dy, dx), e.cdir)) < 1.2
          )
            hurtPlayer(Math.round(10 * dm), e.cdir);
          e.state = 'rec';
          e.st = 0.45;
        } else if (m === 'slam') {
          const R = boss ? 190 : 160;
          if (d < R && groundCombatReach(e, P)) hurtPlayer(Math.round(16 * dm), Math.atan2(dy, dx));
          parts.push({
            x: e.x,
            y: e.y,
            life: 0.45,
            max: 0.45,
            size: R,
            kind: 'ring',
            color: '#FFFFFF',
          });
          for (let i = 0; i < 14; i++) {
            const a = rand(0, TAU);
            parts.push({
              x: e.x + Math.cos(a) * R * 0.6,
              y: e.y + Math.sin(a) * R * 0.45,
              vx: Math.cos(a) * 120,
              vy: Math.sin(a) * 60 - 40,
              life: 0.6,
              max: 0.6,
              size: rand(6, 12),
              color: '#FFFFFF',
              kind: 'puff',
            });
          }
          sfx.boom();
          shake = Math.max(shake, 10);
          e.state = 'rec';
          e.st = 0.8;
        } else if (m === 'charge') {
          e.state = 'charge';
          e.st = boss ? 0.9 : 0.8;
        } else if (m === 'thorns') {
          const n = boss ? 18 : 12,
            off = rand(0, TAU);
          for (let i = 0; i < n; i++) {
            const a = off + (i / n) * TAU;
            projs.push({
              z: groundHeight(e.x, e.y) + 40,
              x: e.x,
              y: e.y,
              vx: Math.cos(a) * 250,
              vy: Math.sin(a) * 250,
              r: 8,
              dmg: 7,
              life: 2.6,
              kind: 'thorn',
            });
          }
          e.state = 'rec';
          e.st = 0.6;
        } else if (m === 'eggs') {
          for (let i = -2; i <= 2; i++) {
            const a = e.cdir + i * 0.22;
            projs.push({
              z: groundHeight(e.x, e.y) + 40,
              x: e.x,
              y: e.y,
              vx: Math.cos(a) * 320,
              vy: Math.sin(a) * 320,
              r: 9,
              dmg: 7,
              life: 2.2,
              kind: 'egg',
            });
          }
          e.state = 'rec';
          e.st = 0.6;
        }
      }
      break;
    case 'charge': {
      const sp = boss ? 560 : 600;
      terrainMove(e, Math.cos(e.cdir) * sp * dt, Math.sin(e.cdir) * sp * dt, Math.min(e.rad, 22));
      e.face = Math.cos(e.cdir) >= 0 ? 1 : -1;
      e.moving = true;
      if (d < e.rad + 22 && groundCombatReach(e, P)) hurtPlayer(Math.round(14 * dm), e.cdir);
      if (Math.random() < 0.6)
        parts.push({
          x: e.x,
          y: e.y,
          vx: rand(-30, 30),
          vy: rand(-30, 0),
          life: 0.5,
          max: 0.5,
          size: rand(6, 12),
          color: '#FFFFFF',
          kind: 'puff',
        });
      if (e.st <= 0 || e.x < 40 || e.x > WORLD.w - 40 || e.y < 50 || e.y > WORLD.h - 30) {
        e.state = 'rec';
        e.st = 0.8;
      }
      break;
    }
    case 'rec':
      if (e.st <= 0) e.state = 'idle';
      break;
  }
}
function updateEnding(dt) {
  const E = G.ending;
  E.t += dt;
  ruffy.t += dt;
  if (E.phase === 'run') {
    const dx = P.x - ruffy.x,
      dy = P.y - ruffy.y,
      d = Math.hypot(dx, dy);
    ruffy.face = dx > 0 ? 1 : -1;
    if (d > 40) {
      const a = navDirection(ruffy, P.x, P.y);
      terrainMove(ruffy, Math.cos(a) * 300 * dt, Math.sin(a) * 300 * dt, 7);
    } else {
      E.phase = 'hug';
      E.t = 0;
      sfx.bark();
      P.face = -ruffy.face;
      for (let i = 0; i < 16; i++)
        parts.push({
          x: P.x + rand(-30, 30),
          y: P.y - 60,
          vx: rand(-40, 40),
          vy: rand(-120, -40),
          life: 1.6,
          max: 1.6,
          size: rand(8, 13),
          kind: 'heart',
        });
      later(1.2, () =>
        dialog(
          [
            ['Ruffy', 'Arf! Arf arf!'],
            ['Darren', 'Found you. Found you. You silly, silly pup.'],
            [
              'Narrator',
              'Ruffy is shivering. Darren unwinds his polka-dot scarf and wraps him up in it, all the way to the nose.',
            ],
            ['Darren', "Let's go home."],
          ],
          winGame
        )
      );
    }
  } else {
    if (Math.random() < 0.1)
      parts.push({
        x: P.x + rand(-30, 30),
        y: P.y - 60,
        vx: rand(-20, 20),
        vy: rand(-80, -30),
        life: 1.4,
        max: 1.4,
        size: rand(7, 11),
        kind: 'heart',
      });
  }
}

/* ---------------- drawing: characters ---------------- */
const RED = '#F13227',
  RED_D = '#C52320',
  SCARF = '#F6D23A',
  DOT = '#EC5C9A';
function foot(c, x, y) {
  c.fillStyle = '#ef3025';
  ell(c, x, y - 1, 8.8, 6.2);
  c.fillStyle = '#650f10';
  ell(c, x + 4, y + 1, 5.5, 4.2);
  c.fillStyle = 'rgba(255,255,255,.5)';
  ell(c, x + 3, y - 1, 1.4, 0.8);
}
function wing(c, ox, oy, ang, far) {
  c.save();
  c.translate(ox, oy);
  c.rotate(-0.12 + ang);
  const fr = far ? '#A82019' : RED,
    mem = far ? '#E77983' : '#FF9199';
  c.fillStyle = mem;
  c.beginPath();
  c.moveTo(0, 0);
  c.lineTo(-12, -30);
  c.lineTo(-40, -46);
  c.quadraticCurveTo(-40, -27, -52, -14);
  c.quadraticCurveTo(-40, -14, -35, -3);
  c.quadraticCurveTo(-25, -6, -18, 5);
  c.closePath();
  c.fill();
  c.strokeStyle = fr;
  c.lineCap = 'round';
  c.lineJoin = 'round';
  c.lineWidth = 5.5;
  c.beginPath();
  c.moveTo(0, 0);
  c.lineTo(-12, -30);
  c.lineTo(-40, -46);
  c.stroke();
  c.lineWidth = 3;
  c.beginPath();
  c.moveTo(-12, -30);
  c.lineTo(-52, -14);
  c.moveTo(-12, -30);
  c.lineTo(-35, -3);
  c.moveTo(-12, -30);
  c.lineTo(-18, 5);
  c.stroke();
  c.fillStyle = '#F4F1EC';
  c.beginPath();
  c.moveTo(-15, -31);
  c.quadraticCurveTo(-14, -44, -7, -48);
  c.quadraticCurveTo(-8, -39, -9, -30);
  c.closePath();
  c.fill();
  c.restore();
}
function eye(c, x, y, s, hurt) {
  if (hurt) {
    c.strokeStyle = '#2A0C0A';
    c.lineWidth = 2.4;
    c.beginPath();
    c.moveTo(x - 4, y - 4);
    c.lineTo(x + 3, y);
    c.lineTo(x - 4, y + 4);
    c.stroke();
    return;
  }
  c.fillStyle = '#FFFFFF';
  ell(c, x, y, 5.6 * s, 7.4);
  c.fillStyle = '#7A2018';
  ell(c, x + 1.4, y + 1, 4 * s, 5.6);
  c.fillStyle = '#160606';
  ell(c, x + 1.8, y + 1.4, 2.2 * s, 3.4);
  c.fillStyle = '#FFFFFF';
  circ(c, x, y - 2, 1.5);
}
function drawDarren(c, x, y, face, t, o = {}) {
  const s = o.size || 0.94;
  c.save();
  c.translate(x, y);
  if (o.alpha !== undefined) c.globalAlpha = o.alpha;
  if (!o.noShadow) {
    c.fillStyle = 'rgba(40,55,95,.28)';
    ell(c, 0, 0, 26 * s, 7.5 * s);
  }
  c.scale(face * s, s);
  const mv = o.moving,
    bob = mv ? -Math.abs(Math.sin(t * 11)) * 4 : Math.sin(t * 2.5) * 1.2,
    step = mv ? Math.sin(t * 11) * 5 : 0;
  const flap =
    Math.sin(t * (mv ? 13 : 3.4)) * (mv ? 0.32 : 0.1) + (o.musou ? Math.sin(t * 30) * 0.4 : 0);
  foot(c, -8 - step, -4);
  foot(c, 9 + step, -4);
  c.translate(0, bob);
  // tail
  c.fillStyle = RED_D;
  c.beginPath();
  c.moveTo(-8, -30);
  c.quadraticCurveTo(-31, -19, -51, -35 + Math.sin(t * 4) * 3);
  c.quadraticCurveTo(-41, -4, -8, -11);
  c.closePath();
  c.fill();
  wing(c, 4, -46, flap * 0.8 + 0.1, true);
  wing(c, -4, -44, flap, false);
  // body
  const gr = c.createRadialGradient(-2, -34, 3, 0, -24, 26);
  gr.addColorStop(0, '#F45C4F');
  gr.addColorStop(1, '#C92A22');
  c.fillStyle = gr;
  ell(c, 0, -26, 15.5, 23);
  // arm
  c.fillStyle = '#F03328';
  c.save();
  c.translate(9, -30);
  c.rotate(o.punch ? -1.45 : 0.75 + Math.sin(t * 3) * 0.08);
  ell(c, 6, 0, 9.5, 5.6);
  c.restore();
  // scarf tails
  const fl = mv ? Math.sin(t * 14) * 4 : Math.sin(t * 3) * 1.5;
  if (!o.noScarf) {
    c.fillStyle = SCARF;
    c.beginPath();
    c.moveTo(-10, -42);
    c.quadraticCurveTo(-24, -45 + fl, -36, -38 + fl * 1.5);
    c.lineTo(-32, -31 + fl);
    c.quadraticCurveTo(-21, -36, -10, -35);
    c.closePath();
    c.fill();
    c.beginPath();
    c.moveTo(4, -40);
    c.quadraticCurveTo(-2 + fl * 0.4, -26, -6 + fl * 0.6, -15);
    c.lineTo(4 + fl * 0.6, -13);
    c.quadraticCurveTo(6, -28, 12, -40);
    c.closePath();
    c.fill();
  }
  // head
  const hg = c.createRadialGradient(-2, -66, 3, 2, -58, 22);
  hg.addColorStop(0, '#F45C4F');
  hg.addColorStop(1, '#D02E25');
  c.fillStyle = '#F5372A';
  c.beginPath();
  c.moveTo(-10, -73);
  c.quadraticCurveTo(-8, -91, -15, -107);
  c.quadraticCurveTo(6, -103, 13, -75);
  c.closePath();
  c.fill();
  c.strokeStyle = 'rgba(255,255,255,.6)';
  c.lineWidth = 1.5;
  c.beginPath();
  c.moveTo(-13, -104);
  c.quadraticCurveTo(-1, -100, 6, -90);
  c.stroke();
  c.fillStyle = hg;
  ell(c, 2, -60, 21, 22);
  ell(c, 15, -50, 14.5, 9.5);
  eye(c, -2, -61, 0.95, o.hurt);
  eye(c, 13, -62, 1.08, o.hurt);
  c.strokeStyle = '#2A0C0A';
  c.lineWidth = 2.8;
  c.lineCap = 'round';
  c.beginPath();
  c.moveTo(-7, -71);
  c.lineTo(2, -69.5);
  c.moveTo(8, -70);
  c.lineTo(18, -71.5);
  c.stroke();
  c.strokeStyle = '#7A1712';
  c.lineWidth = 1.8;
  c.beginPath();
  c.moveTo(10, -47);
  c.quadraticCurveTo(16, -43, 23, -47.5);
  c.stroke();
  c.fillStyle = '#7A1712';
  circ(c, 25, -53, 1.1);
  c.fillStyle = 'rgba(255,255,255,.3)';
  ell(c, -6, -72, 5, 2, -0.5);
  ell(c, 19, -53, 3, 1);
  ell(c, -5, -26, 2, 4, -0.3);
  // scarf band + dots
  if (!o.noScarf) {
    c.fillStyle = SCARF;
    ell(c, 2, -40.5, 17.5, 6.2);
    c.fillStyle = DOT;
    for (const [dx2, dy2] of [
      [-9, -41],
      [1, -38.5],
      [11, -41.5],
      [2, -27],
      [-1, -19],
      [-22, -41 + fl * 0.6],
      [-31, -36 + fl],
    ])
      circ(c, dx2, dy2, 2.2);
  }
  c.restore();
}
function drawRuffy(c, x, y, face, t, s = 1) {
  c.save();
  c.translate(x, y);
  c.fillStyle = 'rgba(40,55,95,.25)';
  ell(c, 0, 0, 15 * s, 4.5 * s);
  c.scale(face * s, s);
  const hop = Math.abs(Math.sin(t * 14)) * -3,
    wag = Math.sin(t * 22) * 0.7;
  c.translate(0, hop);
  c.save();
  c.translate(-12, -15);
  c.rotate(-0.9 + wag);
  c.fillStyle = '#78BBF0';
  ell(c, 0, -6, 3, 8);
  c.restore();
  c.fillStyle = '#3584BF';
  for (const lx of [-8, -3, 5, 10]) c.fillRect(lx - 1.5, -7, 3.5, 7);
  c.fillStyle = '#F4FAFF';
  ell(c, 0, -12, 14, 8.5);
  c.fillStyle = '#68B9F1';
  ell(c, -5, -15, 6, 3.6);
  c.fillStyle = '#F4FAFF';
  circ(c, 12, -21, 9);
  ell(c, 19, -19, 5, 3.8);
  c.fillStyle = '#308AD1';
  ell(c, 7, -22, 3.8, 7.5, 0.35);
  c.fillStyle = '#1A1010';
  circ(c, 14, -23, 1.6);
  circ(c, 23.5, -19.5, 1.7);
  c.strokeStyle = '#D2342A';
  c.lineWidth = 3;
  c.beginPath();
  c.arc(9, -17, 6, 0.3, 2.4);
  c.stroke();
  c.fillStyle = '#F2C230';
  circ(c, 8, -10.5, 2);
  c.restore();
}
function weaponProp(c, kind, ang) {
  c.save();
  c.rotate(ang);
  if (kind === 'chicken') {
    c.fillStyle = '#F4D03F';
    ell(c, 0, -16, 4.5, 14);
    c.fillStyle = '#E04B3A';
    ell(c, -1, -31, 3, 2.5);
    c.fillStyle = '#F39C12';
    c.beginPath();
    c.moveTo(3, -28);
    c.lineTo(8, -27);
    c.lineTo(3, -25);
    c.fill();
    c.fillStyle = '#222';
    circ(c, 1.5, -28, 0.9);
  } else if (kind === 'umbrella') {
    c.strokeStyle = '#5A4636';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(0, 4);
    c.lineTo(0, -22);
    c.stroke();
    c.fillStyle = '#8FB8F0';
    c.beginPath();
    c.arc(0, -22, 12, Math.PI, 0);
    c.fill();
    c.fillStyle = '#F28AB5';
    c.beginPath();
    c.arc(0, -22, 12, Math.PI * 1.33, Math.PI * 1.66);
    c.lineTo(0, -22);
    c.fill();
  } else if (kind === 'baguette') {
    c.fillStyle = '#D9A35A';
    c.beginPath();
    c.roundRect(-4, -36, 8, 40, 4);
    c.fill();
    c.strokeStyle = '#F2D39B';
    c.lineWidth = 1.5;
    for (let i = 0; i < 4; i++) {
      c.beginPath();
      c.moveTo(-3, -30 + i * 8);
      c.lineTo(3, -34 + i * 8);
      c.stroke();
    }
  } else if (kind === 'noodle') {
    c.fillStyle = '#4CC07A';
    c.beginPath();
    c.roundRect(-6, -92, 12, 96, 6);
    c.fill();
    c.fillStyle = '#2E9A5A';
    circ(c, 0, -88, 3);
  } else if (kind === 'fan') {
    c.strokeStyle = '#6B3A1E';
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(0, 4);
    c.lineTo(0, -20);
    c.stroke();
    for (let i = -3; i <= 3; i++) {
      c.fillStyle = i % 2 ? '#F49AC1' : '#FFFFFF';
      ell(c, i * 7, -36 + Math.abs(i) * 3, 6, 20, i * 0.25);
    }
  } else if (kind === 'mallet') {
    c.fillStyle = '#8B5A2B';
    c.fillRect(-3, -58, 6, 62);
    c.fillStyle = '#F06AA0';
    c.beginPath();
    c.roundRect(-18, -74, 36, 22, 8);
    c.fill();
    c.fillStyle = '#FFC0DA';
    c.fillRect(-14, -70, 28, 4);
  } else if (kind === 'duster') {
    c.fillStyle = '#6E4A2A';
    c.fillRect(-3, -70, 6, 74);
    for (let i = 0; i < 9; i++) {
      c.fillStyle = ['#B77BE0', '#E59AD8', '#8E5BC2'][i % 3];
      ell(c, Math.cos(i) * 10, -82 + Math.sin(i * 2) * 8, 9, 14, i * 0.7);
    }
  }
  c.restore();
}
function armAngle(e, rest) {
  if (e.state === 'wind') return -1.6 + Math.sin(e.t * 40) * 0.06;
  if (e.state === 'rec') return 1.1;
  if (e.state === 'charge') return -0.6;
  return rest + Math.sin(e.t * 4) * 0.15;
}
function drawEnemy(c, e) {
  c.save();
  let x = e.x,
    y = e.y,
    rot = 0;
  if (e.dead) {
    const f = e.fly;
    y -= f.z;
    rot = f.r;
    c.globalAlpha = clamp(1 - (f.t - 0.4) / 0.4, 0, 1);
  }
  c.translate(x, y);
  if (!e.dead || e.fly.z < 10) {
    c.fillStyle = 'rgba(40,55,95,.25)';
    ell(c, 0, e.dead ? e.fly.z : 0, e.rad * 1.1, e.rad * 0.35);
  }
  if (rot) c.rotate(rot);
  if (e.flash > 0 && !e.dead) c.filter = 'brightness(2.2)';
  const bob = e.moving ? -Math.abs(Math.sin(e.t * 11)) * 3 : 0;
  c.translate(0, bob);
  c.scale(e.face, 1);
  switch (e.type) {
    case 'gopher':
      c.fillStyle = '#A0703F';
      ell(c, 0, -16, 13, 16);
      c.fillStyle = '#EBD3A6';
      ell(c, 3, -13, 8, 10);
      c.fillStyle = '#A0703F';
      circ(c, 2, -32, 11.5);
      circ(c, -6, -41, 3.6);
      circ(c, 8, -42, 3.6);
      c.fillStyle = '#1B1210';
      circ(c, 7, -34, 2);
      c.fillStyle = '#E87B8E';
      circ(c, 13, -31, 2.5);
      c.fillStyle = '#FFFFFF';
      c.fillRect(9, -28, 5, 5);
      c.save();
      c.translate(11, -20);
      weaponProp(c, 'chicken', armAngle(e, 0.4));
      c.restore();
      break;
    case 'crow': {
      const hy = -24 + Math.sin(e.t * 5) * 3,
        fl = Math.sin(e.t * 18) * 0.8;
      c.translate(0, hy);
      c.fillStyle = '#2A2C3A';
      c.save();
      c.rotate(-fl * 0.6);
      ell(c, -8, -6, 14, 5, -0.5);
      c.restore();
      c.fillStyle = '#1F2130';
      ell(c, 0, 0, 12, 11);
      circ(c, 7, -8, 8);
      c.fillStyle = '#F2A33A';
      c.beginPath();
      c.moveTo(13, -9);
      c.lineTo(21, -7);
      c.lineTo(13, -5);
      c.fill();
      c.fillStyle = '#FFFFFF';
      circ(c, 9, -10, 3);
      c.fillStyle = '#000';
      circ(c, 10, -10, 1.5);
      c.save();
      c.translate(6, 2);
      weaponProp(c, 'umbrella', armAngle(e, 0.3));
      c.restore();
      break;
    }
    case 'bale':
      c.fillStyle = '#4A3B2A';
      c.fillRect(-12, -8, 6, 8);
      c.fillRect(6, -8, 6, 8);
      c.fillStyle = '#E2B84E';
      c.beginPath();
      c.roundRect(-20, -44, 40, 38, 9);
      c.fill();
      c.strokeStyle = '#C2962F';
      c.lineWidth = 1.5;
      for (let i = 0; i < 6; i++) {
        c.beginPath();
        c.moveTo(-17, -38 + i * 6);
        c.lineTo(17, -40 + i * 6);
        c.stroke();
      }
      c.strokeStyle = '#8B5A2B';
      c.lineWidth = 2.5;
      c.beginPath();
      c.moveTo(-20, -24);
      c.lineTo(20, -24);
      c.stroke();
      c.fillStyle = '#FFFFFF';
      ell(c, 4, -32, 4, 5);
      ell(c, 13, -32, 4, 5);
      c.fillStyle = '#000';
      circ(c, 6, -31, 2);
      circ(c, 14.5, -31, 2);
      c.strokeStyle = '#3A2A1A';
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(0, -39);
      c.lineTo(8, -37);
      c.moveTo(11, -37);
      c.lineTo(18, -39);
      c.stroke();
      c.save();
      c.translate(18, -22);
      weaponProp(c, 'baguette', armAngle(e, 0.5));
      c.restore();
      break;
    case 'spud':
      c.fillStyle = '#5B4632';
      c.fillRect(-16, -10, 10, 10);
      c.fillRect(6, -10, 10, 10);
      c.fillStyle = '#C49A6C';
      ell(c, 0, -40, 30, 36, 0.08);
      c.fillStyle = '#A47B50';
      for (const [a, b] of [
        [-14, -50],
        [10, -24],
        [-8, -20],
        [16, -56],
      ])
        ell(c, a, b, 3.5, 2.5);
      c.fillStyle = '#9AA3B5';
      c.beginPath();
      c.arc(2, -66, 22, Math.PI, 0);
      c.fill();
      c.fillStyle = '#6D778C';
      for (let i = -2; i <= 2; i++) circ(c, 2 + i * 8, -74 + Math.abs(i) * 3, 2);
      c.fillRect(22, -68, 10, 4);
      c.fillStyle = '#FFFFFF';
      ell(c, 4, -52, 6, 7);
      ell(c, 18, -52, 6, 7);
      c.fillStyle = '#000';
      circ(c, 6, -51, 3);
      circ(c, 19, -51, 3);
      c.fillStyle = '#3A2A1A';
      ell(c, 6, -41, 10, 3.5, -0.1);
      ell(c, 18, -41, 9, 3.5, 0.15);
      c.save();
      c.translate(26, -34);
      weaponProp(c, 'noodle', armAngle(e, 0.5));
      c.restore();
      break;
    case 'weed': {
      const spin = e.state === 'charge' ? e.t * 14 : 0;
      c.save();
      c.translate(0, -34);
      c.rotate(spin);
      c.translate(0, 34);
      c.strokeStyle = '#A07A45';
      c.lineWidth = 2.5;
      for (const [sx, sy, r, a0, len] of e.scrib) {
        c.beginPath();
        c.arc(sx * 0.9, sy * 0.9 + 6, r, a0, a0 + len);
        c.stroke();
      }
      c.restore();
      c.fillStyle = '#FFFFFF';
      ell(c, 0, -40, 6, 8);
      ell(c, 14, -40, 6, 8);
      c.fillStyle = '#3A1E4A';
      circ(c, 2, -39, 3.2);
      circ(c, 15, -39, 3.2);
      c.strokeStyle = '#222';
      c.lineWidth = 1.5;
      for (const ex of [0, 14])
        for (let k = -1; k <= 1; k++) {
          c.beginPath();
          c.moveTo(ex + k * 3, -48);
          c.lineTo(ex + k * 4, -52);
          c.stroke();
        }
      c.fillStyle = '#7A3D9C';
      ell(c, 4, -70, 24, 6);
      c.fillRect(-6, -84, 20, 14);
      c.fillStyle = '#F49AC1';
      ell(c, -10, -88, 5, 16, -0.6);
      c.save();
      c.translate(26, -30);
      weaponProp(c, 'fan', armAngle(e, 0.3));
      c.restore();
      break;
    }
    case 'cluck':
      c.fillStyle = '#F2A33A';
      c.fillRect(-12, -10, 4, 10);
      c.fillRect(6, -10, 4, 10);
      c.fillStyle = '#FAFAF5';
      ell(c, -4, -36, 30, 28);
      circ(c, 14, -62, 17);
      c.fillStyle = '#E6E6DE';
      ell(c, -12, -34, 16, 12, -0.3);
      c.fillStyle = '#E0362C';
      circ(c, 8, -80, 6);
      circ(c, 15, -82, 6);
      circ(c, 22, -78, 5);
      ell(c, 30, -54, 4, 7);
      c.fillStyle = '#F2A33A';
      c.beginPath();
      c.moveTo(28, -64);
      c.lineTo(42, -60);
      c.lineTo(28, -56);
      c.fill();
      c.fillStyle = '#4E6B3A';
      c.beginPath();
      c.roundRect(-2, -80, 30, 9, 3);
      c.fill();
      c.fillRect(20, -74, 14, 4);
      c.fillStyle = '#F2C230';
      circ(c, 12, -76, 2.5);
      c.fillStyle = '#000';
      circ(c, 20, -64, 3);
      c.strokeStyle = '#000';
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(14, -71);
      c.lineTo(25, -68);
      c.stroke();
      c.save();
      c.translate(22, -36);
      weaponProp(c, 'mallet', armAngle(e, 0.4));
      c.restore();
      break;
    case 'baron':
      c.fillStyle = '#8E2030';
      c.beginPath();
      c.moveTo(-30, -70);
      c.quadraticCurveTo(-70, -30, -56, 6);
      c.lineTo(20, 6);
      c.lineTo(10, -70);
      c.fill();
      for (const [bx, by, br] of e.blobs) {
        c.fillStyle = '#2F5A3A';
        circ(c, bx, by, br);
      }
      c.fillStyle = '#3B6E46';
      circ(c, 0, -56, 30);
      c.strokeStyle = '#1E3A26';
      c.lineWidth = 3;
      for (let i = 0; i < 22; i++) {
        const a = (i / 22) * TAU;
        const r1 = 56,
          r2 = 70;
        c.beginPath();
        c.moveTo(Math.cos(a) * r1, -56 + Math.sin(a) * r1);
        c.lineTo(Math.cos(a + 0.08) * r2, -56 + Math.sin(a + 0.08) * r2);
        c.stroke();
      }
      c.fillStyle = '#8E5BC2';
      for (const [a, b] of [
        [-30, -30],
        [26, -80],
        [-38, -78],
        [34, -30],
        [-4, -14],
      ])
        circ(c, a, b, 5);
      c.fillStyle = '#F2C230';
      c.beginPath();
      c.moveTo(-20, -108);
      c.lineTo(-20, -124);
      c.lineTo(-10, -114);
      c.lineTo(0, -128);
      c.lineTo(10, -114);
      c.lineTo(20, -124);
      c.lineTo(20, -108);
      c.closePath();
      c.fill();
      c.fillStyle = '#FFF4C2';
      ell(c, 4, -62, 9, 11);
      ell(c, 26, -62, 9, 11);
      c.fillStyle = '#4A1A5A';
      circ(c, 8, -60, 5);
      circ(c, 29, -60, 5);
      c.strokeStyle = '#14281A';
      c.lineWidth = 4;
      c.beginPath();
      c.moveTo(-6, -78);
      c.lineTo(12, -72);
      c.moveTo(20, -72);
      c.lineTo(38, -78);
      c.stroke();
      c.strokeStyle = '#14281A';
      c.lineWidth = 3;
      c.beginPath();
      c.moveTo(6, -40);
      c.quadraticCurveTo(16, -46, 28, -40);
      c.stroke();
      c.save();
      c.translate(44, -40);
      weaponProp(c, 'duster', armAngle(e, 0.4));
      c.restore();
      break;
  }
  c.restore();
}
function drawTelegraph(c, e) {
  if (!e.officer || e.dead || e.state !== 'wind') return;
  const T = MOVE_WIND[e.move],
    p = 1 - e.st / T;
  c.save();
  c.globalAlpha = 0.25 + 0.35 * p;
  c.strokeStyle = '#E8414F';
  c.fillStyle = 'rgba(232,65,79,.18)';
  c.lineWidth = 3;
  if (e.move === 'slam') {
    const R = e.type === 'baron' ? 190 : 160;
    c.beginPath();
    c.ellipse(e.x, e.y, R, R * 0.62, 0, 0, TAU);
    c.stroke();
    c.beginPath();
    c.ellipse(e.x, e.y, R * p, R * 0.62 * p, 0, 0, TAU);
    c.fill();
  } else if (e.move === 'charge') {
    c.translate(e.x, e.y);
    c.rotate(e.cdir);
    c.fillRect(0, -e.rad * 0.8, 480, e.rad * 1.6);
  } else if (e.move === 'swipe') {
    c.beginPath();
    c.moveTo(e.x, e.y);
    c.arc(e.x, e.y, e.rad + 85, e.cdir - 1.2, e.cdir + 1.2);
    c.closePath();
    c.fill();
  } else {
    c.beginPath();
    c.arc(e.x, e.y - 40, e.rad + 20 + p * 30, 0, TAU);
    c.stroke();
  }
  c.restore();
}
function drawScarfWhip(c) {
  const a = P.atk;
  if (!a || P.weapon !== 'scarf') return;
  const d = a.d;
  const p = clamp((a.t - d.act[0] * 0.4) / (d.act[1] - d.act[0] * 0.4), 0, 1);
  const side = d.side || 1;
  const start = d.spin ? P.dir : P.dir - (side * d.arc) / 2,
    ang = d.spin ? P.dir + p * TAU * 1.15 : start + side * d.arc * p;
  const ox = P.x,
    oy = P.y - 32,
    len = d.r * 0.95,
    tx = P.x + Math.cos(ang) * len,
    ty = P.y - 14 + Math.sin(ang) * len * 0.8;
  c.save();
  c.globalAlpha = 0.3;
  c.strokeStyle = SCARF;
  c.lineWidth = 16;
  c.lineCap = 'round';
  c.beginPath();
  const steps = 14;
  for (let i = 0; i <= steps; i++) {
    const aa = start + ((ang - start) * i) / steps;
    const x = P.x + Math.cos(aa) * len,
      y = P.y - 14 + Math.sin(aa) * len * 0.8;
    i ? c.lineTo(x, y) : c.moveTo(x, y);
  }
  c.stroke();
  c.restore();
  const cx = (ox + tx) / 2 + Math.cos(ang - side * 1.4) * 30,
    cy = (oy + ty) / 2 + Math.sin(ang - side * 1.4) * 20;
  c.strokeStyle = SCARF;
  c.lineWidth = 10;
  c.lineCap = 'round';
  c.beginPath();
  c.moveTo(ox, oy);
  c.quadraticCurveTo(cx, cy, tx, ty);
  c.stroke();
  c.fillStyle = DOT;
  for (let i = 1; i <= 6; i++) {
    const u = i / 6.5,
      x = (1 - u) * (1 - u) * ox + 2 * (1 - u) * u * cx + u * u * tx,
      y = (1 - u) * (1 - u) * oy + 2 * (1 - u) * u * cy + u * u * ty;
    circ(c, x, y, 2.6);
  }
  c.fillStyle = SCARF;
  ell(c, tx, ty, 9, 6, ang);
}
function drawFists(c) {
  const a = P.atk;
  if (!a || P.weapon !== 'paws') return;
  const d = a.d;
  const p = clamp(a.t / d.dur, 0, 1),
    ext = Math.sin(Math.min(1, p * 1.6) * Math.PI);
  const reach = 18 + d.r * 0.62 * ext,
    ang = P.dir + (d.launch ? -0.5 * Math.cos(P.dir) : a.i % 2 ? 0.25 : -0.25);
  const fx = P.x + Math.cos(ang) * reach,
    fy = P.y - 34 + Math.sin(ang) * reach * 0.7 - (d.launch ? ext * 30 : 0);
  c.fillStyle = '#D8302A';
  c.strokeStyle = '#5A120E';
  c.lineWidth = 2;
  c.beginPath();
  c.arc(fx, fy, d.launch ? 11 : 8.5, 0, TAU);
  c.fill();
  c.stroke();
  if (a.t >= d.act[0] && a.t <= d.act[1])
    drawStar(c, fx + Math.cos(ang) * 10, fy + Math.sin(ang) * 8, d.launch ? 22 : 14, '#FFFFFF');
}
function drawStar(c, x, y, r, col) {
  c.fillStyle = col;
  c.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU - Math.PI / 2,
      rr = i % 2 ? r * 0.42 : r;
    c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  c.closePath();
  c.fill();
}
function drawHeart(c, x, y, s) {
  c.beginPath();
  c.moveTo(x, y + s * 0.3);
  c.bezierCurveTo(x, y, x - s * 0.5, y, x - s * 0.5, y + s * 0.3);
  c.bezierCurveTo(x - s * 0.5, y + s * 0.6, x, y + s * 0.8, x, y + s);
  c.bezierCurveTo(x, y + s * 0.8, x + s * 0.5, y + s * 0.6, x + s * 0.5, y + s * 0.3);
  c.bezierCurveTo(x + s * 0.5, y, x, y, x, y + s * 0.3);
  c.fill();
}

/* ---------------- drawing: props ---------------- */
function drawProp(c, p, t) {
  switch (p.kind) {
    case 'bale':
      c.fillStyle = 'rgba(40,55,95,.22)';
      ell(c, p.x, p.y, 30, 9);
      c.fillStyle = '#D9AE4A';
      c.beginPath();
      c.roundRect(p.x - 28, p.y - 40, 56, 40, 10);
      c.fill();
      c.fillStyle = '#C2962F';
      ell(c, p.x + 20, p.y - 20, 9, 19);
      c.strokeStyle = '#B08530';
      c.lineWidth = 2;
      c.beginPath();
      c.arc(p.x + 20, p.y - 20, 5, 0, TAU);
      c.stroke();
      c.fillStyle = '#F4F7FD';
      c.beginPath();
      c.roundRect(p.x - 27, p.y - 44, 52, 10, 6);
      c.fill();
      break;
    case 'pine': {
      const s = p.s;
      c.fillStyle = 'rgba(40,55,95,.22)';
      ell(c, p.x, p.y, 22 * s, 7 * s);
      c.fillStyle = '#5A3E2A';
      c.fillRect(p.x - 4 * s, p.y - 14 * s, 8 * s, 14 * s);
      for (let i = 0; i < 3; i++) {
        const yy = p.y - 14 * s - i * 22 * s,
          w = (32 - i * 8) * s;
        c.fillStyle = '#2F5A4A';
        c.beginPath();
        c.moveTo(p.x - w, yy);
        c.lineTo(p.x, yy - 34 * s);
        c.lineTo(p.x + w, yy);
        c.fill();
        c.fillStyle = '#F4F7FD';
        c.beginPath();
        c.moveTo(p.x - w * 0.55, yy - 14 * s);
        c.lineTo(p.x, yy - 34 * s);
        c.lineTo(p.x + w * 0.55, yy - 14 * s);
        c.quadraticCurveTo(p.x, yy - 20 * s, p.x - w * 0.55, yy - 14 * s);
        c.fill();
      }
      break;
    }
    case 'post':
      c.fillStyle = '#6B4A32';
      c.fillRect(p.x - 3, p.y - 30, 6, 30);
      c.fillStyle = '#F4F7FD';
      c.fillRect(p.x - 4, p.y - 33, 8, 4);
      if (p.rail) {
        c.strokeStyle = '#7E5A3E';
        c.lineWidth = 3;
        c.beginPath();
        c.moveTo(p.x, p.y - 22);
        c.lineTo(p.x + p.rail.dx, p.y + p.rail.dy - 22);
        c.moveTo(p.x, p.y - 11);
        c.lineTo(p.x + p.rail.dx, p.y + p.rail.dy - 11);
        c.stroke();
      }
      break;
    case 'stake':
      c.fillStyle = '#6B4A32';
      c.beginPath();
      c.moveTo(p.x - 5, p.y);
      c.lineTo(p.x - 5, p.y - 34);
      c.lineTo(p.x, p.y - 42);
      c.lineTo(p.x + 5, p.y - 34);
      c.lineTo(p.x + 5, p.y);
      c.fill();
      c.fillStyle = p.color;
      c.fillRect(p.x - 5, p.y - 26, 10, 4);
      break;
    case 'tent':
      c.fillStyle = 'rgba(40,55,95,.22)';
      ell(c, p.x, p.y, 50, 12);
      c.fillStyle = p.color;
      c.beginPath();
      c.moveTo(p.x - 46, p.y);
      c.lineTo(p.x, p.y - 62);
      c.lineTo(p.x + 46, p.y);
      c.fill();
      c.fillStyle = 'rgba(255,255,255,.35)';
      c.beginPath();
      c.moveTo(p.x - 23, p.y);
      c.lineTo(p.x, p.y - 62);
      c.lineTo(p.x - 6, p.y);
      c.fill();
      c.fillStyle = '#2A2030';
      c.beginPath();
      c.moveTo(p.x - 10, p.y);
      c.lineTo(p.x, p.y - 26);
      c.lineTo(p.x + 10, p.y);
      c.fill();
      break;
    case 'flag': {
      const done = G && G.campsDone[p.camp];
      c.fillStyle = '#4A3828';
      c.fillRect(p.x - 2, p.y - 90, 4, 90);
      const wv = Math.sin(t * 3 + p.x) * 4;
      c.fillStyle = done ? SCARF : p.color;
      c.beginPath();
      c.moveTo(p.x + 2, p.y - 90);
      c.quadraticCurveTo(p.x + 22, p.y - 86 + wv, p.x + 42, p.y - 84);
      c.lineTo(p.x + 42, p.y - 62);
      c.quadraticCurveTo(p.x + 22, p.y - 66 + wv, p.x + 2, p.y - 66);
      c.fill();
      if (done) {
        c.fillStyle = DOT;
        circ(c, p.x + 16, p.y - 77, 3);
        circ(c, p.x + 30, p.y - 72, 3);
      }
      break;
    }
    case 'bramble': {
      const s = p.s;
      c.fillStyle = 'rgba(40,55,95,.25)';
      ell(c, p.x, p.y, 34 * s, 10 * s);
      c.fillStyle = '#2E4A36';
      for (const [a, b, r] of [
        [-16, -18, 18],
        [12, -20, 20],
        [0, -34, 18],
      ])
        circ(c, p.x + a * s, p.y + b * s, r * s);
      c.strokeStyle = '#1A2E20';
      c.lineWidth = 2;
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU;
        c.beginPath();
        c.moveTo(p.x + Math.cos(a) * 24 * s, p.y - 22 * s + Math.sin(a) * 20 * s);
        c.lineTo(p.x + Math.cos(a) * 32 * s, p.y - 22 * s + Math.sin(a) * 28 * s);
        c.stroke();
      }
      c.fillStyle = '#F4F7FD';
      ell(c, p.x, p.y - 48 * s, 14 * s, 5 * s);
      c.fillStyle = '#8E5BC2';
      circ(c, p.x + 10 * s, p.y - 26 * s, 3);
      break;
    }
  }
}
function drawTuft(c, tf) {
  const s = tf.s;
  c.strokeStyle = tf.hue < 0.6 ? '#C9A75A' : '#A88A4E';
  c.lineWidth = 1.6;
  c.beginPath();
  for (let i = -2; i <= 2; i++) {
    c.moveTo(tf.x + i * 2 * s, tf.y);
    c.quadraticCurveTo(
      tf.x + i * 3 * s,
      tf.y - 8 * s,
      tf.x + i * 5 * s + 2,
      tf.y - 14 * s + Math.abs(i) * 3
    );
  }
  c.stroke();
}

/* ---------------- render ---------------- */
const flakes = [];
for (let i = 0; i < 140; i++)
  flakes.push({ x: Math.random(), y: Math.random(), z: rand(0.3, 1), ph: rand(0, TAU) });
let rt = 0,
  miniTick = 0;
// Orthographic isometric projection: 30-degree ground axes, upright characters.
let viewQuarter = 0;
const ISO_X = Math.sqrt(3) / 2,
  ISO_Y = 0.5;
function groundHeight(x, y) {
  return worldHeight(x, y);
}

function groundProject(x, y) {
  const a = (viewQuarter * Math.PI) / 2,
    co = Math.cos(a),
    si = Math.sin(a),
    u = x * co - y * si,
    v = x * si + y * co;
  return { x: (u - v) * ISO_X, y: (u + v) * ISO_Y };
}
function isoPoint(x, y, z = 0) {
  const p = groundProject(x, y);
  p.y -= groundHeight(x, y) + z;
  return p;
}
function cameraPoint() {
  const p = groundProject(cam.x, cam.y);
  p.y -= state === 'title' ? groundHeight(cam.x, cam.y) : (cam.z ?? groundHeight(cam.x, cam.y));
  return p;
}
function screenPoint(x, y, z = 0) {
  const p = isoPoint(x, y, z),
    c = cameraPoint();
  return {
    x: W / 2 + (p.x - c.x) * zoom * userZoom,
    y: cameraAnchorY() + (p.y - c.y) * zoom * userZoom,
  };
}
function isoFace(dir) {
  const p = groundProject(Math.cos(dir), Math.sin(dir));
  return p.x >= 0 ? 1 : -1;
}
function turnView(delta) {
  if (state === 'play' && !dialogOpen) {
    viewQuarter = (viewQuarter + delta + 4) % 4;
    P.vx = P.vy = 0;
  }
}
function poly(c, points, fill, stroke) {
  c.beginPath();
  points.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)));
  c.closePath();
  if (fill) {
    c.fillStyle = fill;
    c.fill();
  }
  if (stroke) {
    c.strokeStyle = stroke;
    c.lineWidth = 1;
    c.stroke();
  }
}
function isoBox(c, x, y, w, d, h, color = '#9cb8c8', base = 0) {
  const corners = [
      [x - w / 2, y - d / 2],
      [x + w / 2, y - d / 2],
      [x + w / 2, y + d / 2],
      [x - w / 2, y + d / 2],
    ],
    bottom = corners.map((p) => isoPoint(...p, base)),
    top = corners.map((p) => isoPoint(...p, h + base));
  const faces = [];
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    faces.push({ depth: (bottom[i].y + bottom[j].y) / 2, i, j });
  }
  faces.sort((a, b) => a.depth - b.depth);
  for (const f of faces) {
    poly(
      c,
      [bottom[f.i], bottom[f.j], top[f.j], top[f.i]],
      f.i % 2 ? '#718da5' : color,
      '#566d8540'
    );
  }
  poly(c, top, '#f3fbff', '#d3e7ef');
  return top;
}
function terrain(c) {
  const step = 120;
  // Snow-topped cliff walls around the playable land.
  const edge = [
      [0, 0],
      [WORLD.w, 0],
      [WORLD.w, WORLD.h],
      [0, WORLD.h],
    ],
    low = edge.map((p) => isoPoint(...p, -62)),
    hi = edge.map((p) => isoPoint(...p));
  const sides = edge
    .map((_, i) => ({ i, j: (i + 1) % 4, y: (hi[i].y + hi[(i + 1) % 4].y) / 2 }))
    .sort((a, b) => a.y - b.y);
  for (const f of sides)
    poly(c, [hi[f.i], hi[f.j], low[f.j], low[f.i]], f.i % 2 ? '#7796af' : '#9ab9ca', '#5d7f9c');
  for (let x = 0; x < WORLD.w; x += step)
    for (let y = 0; y < WORLD.h; y += step) {
      const p = screenPoint(x + 60, y + 60);
      if (p.x < -200 || p.x > W + 200 || p.y < -180 || p.y > H + 180) continue;
      const x2 = Math.min(x + step, WORLD.w),
        y2 = Math.min(y + step, WORLD.h);
      const h = groundHeight(x + 60, y + 60),
        n = Math.sin(x * 0.013 + y * 0.009);
      const shade = Math.round(237 + n * 3 - h * 0.14);
      poly(
        c,
        [
          [x, y],
          [x2, y],
          [x2, y2],
          [x, y2],
        ].map((v) => isoPoint(...v)),
        `rgb(${shade - 13},${shade},${Math.min(255, shade + 8)})`,
        `rgb(${shade - 13},${shade},${Math.min(255, shade + 8)})`
      );
    }
  // Continuous paths connect story destinations; they follow the same slopes.
  for (const [from, to] of [
    [START, CAMPS[0]],
    [CAMPS[0], CAMPS[1]],
    [CAMPS[1], CAMPS[2]],
    [CAMPS[2], HOLLOW],
  ]) {
    c.strokeStyle = '#b5d0df';
    c.lineWidth = 36;
    c.lineCap = 'round';
    c.beginPath();
    for (let i = 0; i <= 32; i++) {
      const t = i / 32,
        p = isoPoint(from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t);
      i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y);
    }
    c.stroke();
    c.strokeStyle = '#d6e8f0';
    c.lineWidth = 24;
    c.stroke();
  }
  for (let k = 0; k < CAMPS.length; k++) {
    const camp = CAMPS[k],
      done = G && G.campsDone[k],
      points = [];
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * TAU;
      points.push(isoPoint(camp.x + Math.cos(a) * 230, camp.y + Math.sin(a) * 190));
    }
    poly(c, points, done ? '#e8ecce' : '#d0e1e9', done ? '#a3ba7a' : '#a6c1d2');
  }
}
function isoWarning(e) {
  if (e.dead || !e.officer || e.state !== 'wind') return;
  const progress = clamp(1 - e.st / MOVE_WIND[e.move], 0, 1),
    pts = [];
  if (e.move === 'charge') {
    const a = e.cdir,
      r = e.rad * 0.8;
    for (const [f, s] of [
      [0, -r],
      [480, -r],
      [480, r],
      [0, r],
    ])
      pts.push(
        isoPoint(
          e.x + Math.cos(a) * f - Math.sin(a) * s,
          e.y + Math.sin(a) * f + Math.cos(a) * s,
          2
        )
      );
  } else {
    const r = e.move === 'slam' ? (e.type === 'baron' ? 190 : 160) : e.rad + 85;
    const arc = e.move === 'swipe' ? 2.4 : TAU;
    if (arc < TAU) pts.push(isoPoint(e.x, e.y, 2));
    for (let i = 0; i <= 40; i++) {
      const a = e.cdir - arc / 2 + (i / 40) * arc;
      pts.push(isoPoint(e.x + Math.cos(a) * r, e.y + Math.sin(a) * r, 2));
    }
  }
  poly(g, pts, `rgba(235,84,117,${0.18 + progress * 0.3})`, '#d64e76');
}

function objectiveTarget() {
  if (G.ending) return null;
  if (G.baronSpawned && G.boss && !G.boss.dead)
    return { x: G.boss.x, y: G.boss.y, label: 'The Bramble Hollow' };
  let best = null,
    bd = 1e9;
  CAMPS.forEach((c, i) => {
    if (G.campsDone[i]) return;
    const d = Math.hypot(c.x - P.x, c.y - P.y);
    if (d < bd) {
      bd = d;
      best = { x: c.x, y: c.y, label: c.label };
    }
  });
  return best;
}
function drawObjectiveArrow() {
  const t = objectiveTarget();
  if (!t) return;
  const projected = screenPoint(t.x, t.y);
  const sx = projected.x,
    sy = projected.y;
  if (sx > 40 && sx < W - 40 && sy > 60 && sy < H - 60) return;
  const a = Math.atan2(sy - H / 2, sx - W / 2),
    m = Math.min(W, H) * 0.5 - 50;
  const ax = W / 2 + Math.cos(a) * Math.min(W / 2 - 50, m * 1.4),
    ay = H / 2 + Math.sin(a) * m;
  g.save();
  g.translate(clamp(ax, 40, W - 40), clamp(ay, 80, H - 80));
  g.rotate(a);
  g.fillStyle = SCARF;
  g.strokeStyle = '#121829';
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(18, 0);
  g.lineTo(-10, -12);
  g.lineTo(-4, 0);
  g.lineTo(-10, 12);
  g.closePath();
  g.fill();
  g.stroke();
  g.restore();
}
let lastHud = {};
function updateHud() {
  const hp = clamp(Math.round((P.hp / P.max) * 100), 0, 100),
    mu = Math.floor(P.mus);
  if (lastHud.hp !== hp) {
    $('#hpFill').style.width = hp + '%';
    lastHud.hp = hp;
  }
  if (lastHud.mu !== mu) {
    $('#muFill').style.width = mu + '%';
    $('#muBar').classList.toggle('full', mu >= 100);
    $('#muHint').textContent =
      mu >= 100
        ? '✦ Blizzard ready!'
        : chargeHeld
          ? 'Packing snow… ' + Math.round(clamp(chargeTime / 0.8, 0, 1) * 100) + '%'
          : 'Land hits to charge your special';
    lastHud.mu = mu;
  }
  const hint =
    mu >= 100
      ? '✦ Blizzard ready!'
      : chargeHeld
        ? 'Packing snow… ' + Math.round(clamp(chargeTime / 0.8, 0, 1) * 100) + '%'
        : 'Land hits to charge your special';
  if (lastHud.muHint !== hint) {
    $('#muHint').textContent = hint;
    lastHud.muHint = hint;
  }
  if (lastHud.ko !== P.ko) {
    $('#koN').textContent = P.ko;
    lastHud.ko = P.ko;
  }
  const cb = P.combo;
  if (lastHud.cb !== cb) {
    $('#comboN').textContent = cb;
    $('#combo').classList.toggle('on', cb >= 3);
    lastHud.cb = cb;
  }
  const obj = G.ending
    ? 'Ruffy!'
    : G.baronSpawned
      ? 'Storm the Bramble Hollow. Ruffy is close.'
      : `Defeat the camp officers to find clues (${G.clues}/3)`;
  if (lastHud.obj !== obj) {
    $('#objText').textContent = obj;
    lastHud.obj = obj;
  }
  if (G.engaged) {
    const e = G.engaged;
    $('#bossFill').style.width = Math.max(0, (e.hp / e.max) * 100) + '%';
    $('#bossValue').textContent =
      Math.ceil(e.hp) +
      ' / ' +
      e.max +
      ' HP · ' +
      (e.state === 'wind'
        ? '⚠ Dodge the marked attack!'
        : e.state === 'rec'
          ? 'Opening! Strike or throw a packed snowball.'
          : 'Keep moving and watch for warnings');
    $('#bossMeter').setAttribute('aria-valuenow', Math.ceil(e.hp));
    $('#bossMeter').setAttribute('aria-valuemax', e.max);
  }
  updateNewHud();
}
const mini = $('#mini'),
  mg = mini.getContext('2d');
function drawMini() {
  const w = mini.width,
    h = mini.height;
  mg.clearRect(0, 0, w, h);
  mg.fillStyle = '#345674';
  mg.fillRect(0, 0, w, h);
  const corners = [
      [0, 0],
      [WORLD.w, 0],
      [WORLD.w, WORLD.h],
      [0, WORLD.h],
    ].map((p) => groundProject(...p)),
    minX = Math.min(...corners.map((p) => p.x)),
    maxX = Math.max(...corners.map((p) => p.x)),
    minY = Math.min(...corners.map((p) => p.y)),
    maxY = Math.max(...corners.map((p) => p.y)),
    scale = Math.min((w - 22) / (maxX - minX), (h - 22) / (maxY - minY));
  const at = (x, y) => {
    const p = groundProject(x, y);
    return {
      x: w / 2 + (p.x - (minX + maxX) / 2) * scale,
      y: h / 2 + (p.y - (minY + maxY) / 2) * scale,
    };
  };
  poly(
    mg,
    [
      [0, 0],
      [WORLD.w, 0],
      [WORLD.w, WORLD.h],
      [0, WORLD.h],
    ].map((p) => at(...p)),
    '#a9c8d5',
    '#def0f6'
  );
  for (const t of TERRACES)
    poly(
      mg,
      [
        [t.x0, t.y0],
        [t.x1, t.y0],
        [t.x1, t.y1],
        [t.x0, t.y1],
      ].map((p) => at(...p)),
      '#c8dfd7',
      '#779eaa'
    );
  for (const path of TRAILS) {
    mg.beginPath();
    path.map((p) => at(...p)).forEach((p, i) => (i ? mg.lineTo(p.x, p.y) : mg.moveTo(p.x, p.y)));
    mg.strokeStyle = '#f4e5aa';
    mg.lineWidth = 2;
    mg.stroke();
  }
  for (const e of enemies)
    if (!e.dead && !e.officer) {
      const p = at(e.x, e.y);
      mg.fillStyle = '#bd6f8b';
      mg.fillRect(p.x - 1, p.y - 1, 2, 2);
    }
  CAMPS.forEach((c, i) => {
    const p = at(c.x, c.y);
    mg.fillStyle = G.campsDone[i] ? '#f8df72' : c.color;
    circ(mg, p.x, p.y, 6);
    mg.strokeStyle = '#365470';
    mg.lineWidth = 2;
    mg.stroke();
  });
  const b = at(HOLLOW.x, HOLLOW.y);
  mg.fillStyle = G.baronSpawned ? '#956bc1' : '#668797';
  circ(mg, b.x, b.y, 7);
  const p = at(P.x, P.y);
  mg.fillStyle = '#eb554f';
  circ(mg, p.x, p.y, 5);
  mg.strokeStyle = '#fff';
  mg.lineWidth = 2;
  mg.stroke();
  mg.fillStyle = '#ecf5fb';
  mg.font = 'bold 11px Trebuchet MS';
  mg.fillText('SNOW PRAIRIE', 8, h - 8);
}

/* Snowday v03: snowball combat, companion, checkpoint saves and accessible HUD. */
let attackPointer = null,
  brawlHeld = false,
  shots = [],
  ally = null,
  chargeHeld = false,
  blockHeld = false,
  chargeTime = 0,
  userZoom = 1,
  gameRun = 0,
  scheduled = [],
  hpTrail = 100;
let checkpoint = null,
  checkpointRun = null,
  saveMessage = '',
  volume = 0.55;
try {
  const data = JSON.parse(localStorage.getItem('darren-snowday-v3'));
  if (
    data &&
    data.version === 3 &&
    Array.isArray(data.camps) &&
    data.camps.length === 3 &&
    data.camps.every((x) => typeof x === 'boolean')
  )
    checkpoint = data;
} catch (e) {}
function later(seconds, fn) {
  scheduled.push({ left: seconds, fn, run: gameRun });
}
function tickScheduled(dt) {
  const pending = scheduled;
  scheduled = [];
  for (const item of pending) {
    if (item.run !== gameRun) continue;
    item.left -= dt;
    if (item.left <= 0) item.fn();
    else scheduled.push(item);
  }
}
function canAct() {
  return state === 'play' && !paused && !dialogOpen && P && P.hp > 0 && !G.ending && !G.lost;
}
function clearControls() {
  attackPointer = null;
  actionBuffer = null;
  padMove.x = padMove.y = padAim.x = padAim.y = 0;
  if (P) P.vx = P.vy = 0;
  for (const k in keys) keys[k] = false;
  stick.x = stick.y = 0;
  stick.id = null;
  $('#knob').style.transform = '';
  chargeHeld = false;
  brawlHeld = false;
  blockHeld = false;
  if (P) P.queued = false;
  chargeTime = 0;
}
function targetAngle() {
  if (Math.hypot(padAim.x, padAim.y) > 0.18) {
    const v = screenVector(padAim.x, padAim.y);
    return Math.atan2(v.y, v.x);
  }
  const v = inputVec(),
    e = nearestEnemy(650);
  if (e) return Math.atan2(e.y - P.y, e.x - P.x);
  return v.m > 0.1 ? Math.atan2(v.y, v.x) : P.dir;
}
function snowShot(angle, radius, speed, damage, pierce = false) {
  shots.push({
    z: groundHeight(P.x, P.y) + radius,
    x: P.x + Math.cos(angle) * 35,
    y: P.y + Math.sin(angle) * 35,
    angle,
    r: radius,
    speed,
    damage,
    pierce,
    life: 1.6,
    hit: new Set(),
  });
}
function releaseAttack() {
  brawlHeld = false;
  if (P?.weapon === 'paws') return;
  if (actionBuffer?.kind === 'attack') actionBuffer.released = true;
  if (!chargeHeld) return;
  chargeHeld = false;
  if (!canAct() || P.roll || P.shotCd > 0) return;
  const packed = chargeTime >= 0.8;
  P.dir = targetAngle();
  P.face = Math.cos(P.dir) >= 0 ? 1 : -1;
  snowShot(P.dir, packed ? 18 : 10, packed ? 580 : 720, packed ? 48 : 19, packed);
  P.shotCd = packed ? 0.5 : 0.24;
  P.throwT = P.throwDuration = 0.28;
  padRumble(packed ? 0.28 : 0.12, 80);
  sfx.swing('snow', 0);
  chargeTime = 0;
}
function pressRoll() {
  if (!canAct() || P.musou || P.dash > 0) return;
  if (P.weapon === 'paws') {
    if (P.sweepCd > 0 || P.atk) return;
    startAtk(3);
    P.sweepCd = 1.7;
    return;
  }
  chargeHeld = false;
  if (P.roll) {
    launchRoll();
    return;
  }
  if (P.rollCd > 0) {
    bufferAction('roll');
    return;
  }
  P.roll = { age: 0 };
  P.rollCd = 5;
}
function launchRoll() {
  if (!P.roll) return;
  const age = P.roll.age;
  P.roll = null;
  snowShot(P.dir, 24 + age * 12 + P.weight * 2, 480, 70 + age * 12 + P.weight * 5, true);
  shots.at(-1).rolling = true;
  P.throwT = P.throwDuration = 0.35;
  padRumble(0.5, 120);
  sfx.boom();
}
function updateSnow(dt) {
  P.shotCd = Math.max(0, P.shotCd - dt);
  P.rollCd = Math.max(0, P.rollCd - dt);
  if (chargeHeld) chargeTime = Math.min(1.6, chargeTime + dt);
  if (P.roll) {
    P.roll.age += dt;
    if (P.roll.age >= 2.2) launchRoll();
  }
  for (const s of shots) {
    const ox = s.x,
      oy = s.y;
    s.x += Math.cos(s.angle) * s.speed * dt;
    s.y += Math.sin(s.angle) * s.speed * dt;
    s.life -= dt;
    if (s.rolling) {
      if (!terrainCanStep(ox, oy, s.x, s.y)) {
        s.life = 0;
        continue;
      }
      s.z = groundHeight(s.x, s.y) + s.r;
    }
    if (!lineOfTerrain(ox, oy, s.x, s.y, s.z)) {
      s.life = 0;
      continue;
    }
    for (const e of enemies) {
      if (
        e.dead ||
        (e.officer && !e.active) ||
        s.hit.has(e) ||
        Math.abs(s.z - groundHeight(e.x, e.y) - 24) > s.r + 45
      )
        continue;
      const dx = s.x - ox,
        dy = s.y - oy,
        den = dx * dx + dy * dy;
      const t = den ? clamp(((e.x - ox) * dx + (e.y - oy) * dy) / den, 0, 1) : 0;
      if (Math.hypot(e.x - ox - dx * t, e.y - oy - dy * t) < e.rad + s.r) {
        s.hit.add(e);
        hitEnemy(e, s.damage, s.angle, s.r > 20 ? 12 : 5, s.r > 12);
        if (!s.pierce) {
          s.life = 0;
          break;
        }
      }
    }
  }
  shots = shots.filter((s) => s.life > 0);
  if (ally && !G.ending) updateStoryCompanion(ally, dt, 'tormund');
  if (G.firewood && bucky && G.firewood.met) updateStoryCompanion(bucky, dt, 'bucky');
}
function drawSnow(c) {
  function ball(x, y, r) {
    c.fillStyle = 'rgba(47,80,118,.18)';
    ell(c, x, y + 3, r, r * 0.32);
    c.fillStyle = '#FAFEFF';
    circ(c, x, y - r * 0.45, r);
    c.strokeStyle = '#83B5D0';
    c.lineWidth = 2;
    c.stroke();
    c.fillStyle = '#D1EBF5';
    ell(c, x + r * 0.3, y - r * 0.15, r * 0.45, r * 0.25);
    c.fillStyle = '#FFFFFF';
    circ(c, x - r * 0.3, y - r * 0.8, Math.max(2, r * 0.2));
  }
  for (const s of shots) ball(s.x, s.y, s.r);
  if (P.roll) {
    const r = 24 + P.roll.age * 12;
    ball(P.x + Math.cos(P.dir) * (r + 28), P.y + Math.sin(P.dir) * (r + 28), r);
  }
  if (chargeHeld) {
    ball(P.x + P.face * 24, P.y - 32, 7 + Math.min(chargeTime / 0.8, 1) * 10);
    c.strokeStyle = chargeTime >= 0.8 ? '#E96EA0' : '#77CFED';
    c.lineWidth = 4;
    c.beginPath();
    c.arc(P.x, P.y - 85, 14, -Math.PI / 2, -Math.PI / 2 + TAU * clamp(chargeTime / 0.8, 0, 1));
    c.stroke();
  }
}
function drawTormund(c, x, y) {
  c.save();
  c.translate(x, y);
  c.fillStyle = 'rgba(40,55,95,.22)';
  ell(c, 0, 0, 20, 6);
  c.fillStyle = '#414E6B';
  ell(c, -7, -5, 6, 5);
  ell(c, 7, -5, 6, 5);
  c.fillStyle = '#80ADC3';
  ell(c, 0, -23, 14, 19);
  c.strokeStyle = '#E3B956';
  c.lineWidth = 4;
  c.stroke();
  c.fillStyle = '#EABA62';
  circ(c, 0, -48, 14);
  c.beginPath();
  c.moveTo(-13, -52);
  c.lineTo(-15, -72);
  c.lineTo(-4, -59);
  c.moveTo(6, -59);
  c.lineTo(15, -71);
  c.lineTo(13, -51);
  c.fill();
  c.fillStyle = '#FFF6D3';
  ell(c, 4, -42, 9, 6);
  c.fillStyle = '#253249';
  circ(c, -3, -49, 2);
  circ(c, 7, -49, 2);
  c.fillStyle = '#FFF7C7';
  c.fillRect(20, -53, 4, 33);
  c.fillStyle = '#D9A341';
  c.fillRect(14, -24, 16, 4);
  c.font = 'bold 11px Trebuchet MS';
  c.textAlign = 'center';
  c.fillStyle = '#273D57';
  c.fillText('Tormund', 0, -80);
  c.restore();
}
function saveCheckpoint() {
  checkpointRun = gameRun;
  checkpoint = {
    version: 3,
    mode: G.mode,
    camps: G.campsDone.slice(),
    lastCamp: G.lastCamp,
    time: G.time,
    ko: P.ko,
    best: P.maxCombo,
    complete: !!G.complete,
    cookies: P.cookies,
    weight: P.weight,
    style: P.weapon,
  };
  try {
    localStorage.setItem('darren-snowday-v3', JSON.stringify(checkpoint));
    saveMessage = G.complete
      ? '✓ Ruffy rescued • adventure complete'
      : '✓ Camp saved • safe to take a break';
  } catch (e) {
    saveMessage = 'Saving unavailable • keep this game open';
  }
  $('#continueRun').hidden = !checkpoint || checkpoint.complete;
  $('#saveNote').textContent = saveMessage;
}
function saveCampAppearance() {
  if (
    !checkpoint ||
    checkpoint.complete ||
    checkpointRun !== gameRun ||
    !G?.campsDone?.some(Boolean) ||
    !checkpoint.camps.every((v, i) => v === G.campsDone[i])
  )
    return;
  checkpoint.cookies = P.cookies;
  checkpoint.weight = P.weight;
  checkpoint.style = P.weapon;
  try {
    localStorage.setItem('darren-snowday-v3', JSON.stringify(checkpoint));
    $('#saveNote').textContent = '✓ Camp and appearance saved';
  } catch (e) {
    $('#saveNote').textContent = 'Saving unavailable • keep this game open';
  }
}
function continueGame() {
  if (!checkpoint || checkpoint.complete) return;
  initAudio();
  const saved = checkpoint;
  newGame(saved.mode === 'cozy' ? 'cozy' : 'adventure');
  G.campsDone = saved.camps.slice();
  G.clues = G.campsDone.filter(Boolean).length;
  G.time = Math.max(0, Number(saved.time) || 0);
  P.ko = Math.max(0, Number(saved.ko) || 0);
  P.maxCombo = Math.max(0, Number(saved.best) || 0);
  P.cookies = clamp(Math.floor(Number(saved.cookies) || 0), 0, 999);
  P.weight = clamp(Math.floor(Number(saved.weight) || 0), 0, 3);
  P.cookies = Math.max(P.cookies, P.weight * 3);
  G.nextKoMark = (Math.floor(P.ko / 100) + 1) * 100;
  checkpointRun = gameRun;
  P.weapon = saved.style === 'paws' ? 'paws' : 'snow';
  P.displayWeight = P.weight;
  P.motionWeight = P.weight;
  updateStyleLabels();
  enemies = enemies.filter(
    (e) =>
      !(e.officer && G.campsDone[e.camp]) &&
      !(e.guard && CAMPS.some((c, i) => G.campsDone[i] && e.guard.x === c.x && e.guard.y === c.y))
  );
  const index =
    Number.isInteger(saved.lastCamp) &&
    saved.lastCamp >= 0 &&
    saved.lastCamp < 3 &&
    G.campsDone[saved.lastCamp]
      ? saved.lastCamp
      : G.campsDone.lastIndexOf(true);
  G.lastCamp = index;
  if (index >= 0) {
    P.x = CAMPS[index].x;
    P.y = CAMPS[index].y + 90;
    G.friend = true;
    ally = { x: P.x - 65, y: P.y + 45, t: 0 };
  }
  cam.x = P.x;
  cam.y = P.y;
  cam.z = groundHeight(P.x, P.y);
  hpTrail = 100;
  state = 'play';
  paused = false;
  dialogOpen = false;
  dlgQ = [];
  $('#dialog').hidden = true;
  show(null);
  $('#hud').hidden = false;
  $('#touch').hidden = !isTouch;
  $('#bossBox').hidden = true;
  if (G.clues >= 3) spawnBaron();
  banner('WELCOME BACK, DARREN', 'Saved camps restored · full health');
}
function updateNewHud() {
  hpTrail += (P.hp - hpTrail) * 0.1;
  if (hpTrail < P.hp) hpTrail = P.hp;
  $('#hpLag').style.width = clamp((hpTrail / P.max) * 100, 0, 100) + '%';
  $('#hpValue').textContent = Math.ceil(P.hp) + ' / ' + P.max;
  $('#hpBar').setAttribute('aria-valuenow', Math.ceil(P.hp));
  $('.status').classList.toggle('lowHealth', P.hp <= 25);
  $('#snowValue').textContent = Math.floor(P.mus) + ' / 100';
  $('#muBar').setAttribute('aria-valuenow', Math.floor(P.mus));
  $('#muHint').textContent = chargeHeld
    ? chargeTime >= 0.8
      ? '❄ Packed snowball ready — release!'
      : 'Packing snow… ' + Math.round(clamp(chargeTime / 0.8, 0, 1) * 100) + '%'
    : P.mus >= 100
      ? '✦ Blizzard ready!'
      : P.atk
        ? P.atk.d.name + ' · land hits for Snow'
        : 'Land hits to charge your special';
  const paws = P.weapon === 'paws',
    rollCd = paws ? P.sweepCd : P.rollCd;
  $('#rollHint').textContent = P.roll
    ? inputMode === 'gamepad'
      ? buttonName(padBindings.roll) + ' • launch now'
      : 'K • launch now'
    : rollCd > 0
      ? rollCd.toFixed(1) + 's'
      : inputMode === 'gamepad'
        ? buttonName(padBindings.roll) + ' • ready'
        : 'K • ready';
  $('#dashHint').textContent =
    P.dashCd > 0
      ? P.dashCd.toFixed(1) + 's'
      : inputMode === 'gamepad'
        ? buttonName(padBindings.dodge) + ' • ready'
        : 'Space • ready';
  $('#burstHint').textContent =
    P.mus >= 100
      ? inputMode === 'gamepad'
        ? buttonName(padBindings.special) + ' • ready!'
        : 'L • ready!'
      : (inputMode === 'gamepad' ? buttonName(padBindings.special) : 'L') +
        ' • ' +
        Math.floor(P.mus) +
        ' / 100';
  $('#tRoll').textContent = P.roll
    ? 'LAUNCH'
    : rollCd > 0
      ? rollCd.toFixed(1) + 's'
      : paws
        ? 'SWEEP'
        : 'ROLL';
  $('#tDash').textContent = P.dashCd > 0 ? P.dashCd.toFixed(1) + 's' : 'DODGE';
  $('#tMu').disabled = P.mus < 100;
  $('#tMu').hidden = P.mus < 100;
  $('#tMu').setAttribute('aria-label', 'Blizzard: ' + Math.floor(P.mus) + ' of 100 snow');
  $('#aRoll').disabled = !P.roll && rollCd > 0;
  $('#aDash').disabled = P.dashCd > 0;
  $('#aBurst').disabled = P.mus < 100;
  $('#aBurst').hidden = P.mus < 100;
  $('#aBurst').classList.toggle('ready', P.mus >= 100);
  $('#cluePips').textContent = G.campsDone
    .map((v, i) => (v ? '✓' : '○') + ' ' + ['Bell', 'Bone', 'Tracks'][i])
    .join('   ');
  $('#cluePips').setAttribute('aria-label', G.clues + ' of 3 clues found');
  $('#sizeText').textContent =
    SIZE_NAMES[P.weight] +
    ' · ' +
    (P.weight < 3 ? (P.cookies % 3) + '/3 cookies' : 'sweep +12 · roll +15');
  $('#rosterText').textContent = G.friend
    ? 'Tormund • sword assist ready'
    : 'Tormund • meet after first camp';
  $('#rosterDetails').textContent = G.friend
    ? 'Roster: Darren (paws + snow) + Tormund (automatic sword assist every 3 seconds when an enemy is close). More companions come in future chapters.'
    : 'Tormund joins after your first camp. He uses his sword; Darren fights with paws, kicks, tail sweeps and his own snow powers.';
}
function bindCharge(id) {
  const b = $(id);
  b.addEventListener('pointerdown', (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    e.preventDefault();
    if (dialogOpen) {
      nextLine();
      return;
    }
    if (!canAct() || attackPointer !== null) return;
    attackPointer = e.pointerId;
    b.setPointerCapture(e.pointerId);
    pressAttack();
  });
  const finish = (e, cancel) => {
    if (e.pointerId !== attackPointer) return;
    attackPointer = null;
    if (cancel) {
      chargeHeld = false;
      brawlHeld = false;
      P.queued = false;
    } else releaseAttack();
  };
  b.addEventListener('pointerup', (e) => finish(e, false));
  b.addEventListener('pointercancel', (e) => finish(e, true));
  b.addEventListener('lostpointercapture', (e) => finish(e, true));
  b.addEventListener('keydown', (e) => {
    if (e.code === 'Enter' || e.code === 'Space') {
      e.preventDefault();
      e.stopPropagation();
      if (!e.repeat) pressAttack();
    }
  });
  b.addEventListener('keyup', (e) => {
    if (e.code === 'Enter' || e.code === 'Space') {
      e.preventDefault();
      e.stopPropagation();
      releaseAttack();
    }
  });
}
bindCharge('#aThrow');
bindCharge('#tAtk');
bindCharge('#game');
$('#aRoll').onclick = pressRoll;
$('#aDash').onclick = pressDash;
$('#aBurst').onclick = pressMusou;
$('#continueRun').hidden = !checkpoint || checkpoint.complete;
$('#continueRun').onclick = continueGame;
$('#endContinue').onclick = continueGame;
$('#volume').oninput = (e) => {
  volume = Number(e.target.value) / 100;
  if (musicBus) musicBus.gain.setTargetAtTime(volume, AC.currentTime, 0.1);
};
$('#styleToggle').onclick = switchStyle;
$('#camLeft').onclick = () => turnView(-1);
$('#camRight').onclick = () => turnView(1);
$('#zoomOut').onclick = () => (userZoom = clamp(userZoom - 0.1, 0.75, 1.6));
$('#zoomIn').onclick = () => (userZoom = clamp(userZoom + 0.1, 0.75, 1.6));
// Settings and progress shared with the 3D game (shared-save.js).
if (typeof SnowdayShared !== 'undefined') {
  if (SnowdayShared.sound() === false) setMuted(true);
  const usual = SnowdayShared.mode();
  if (usual) $(usual === 'cozy' ? '#pickPaws' : '#pickScarf').classList.add('usualPick');
  const note = SnowdayShared.describe(SnowdayShared.story().threeD, '3D valley');
  $('#otherGameNote').textContent = note;
  $('#otherGameNote').hidden = !note;
}
// Losing focus should never leave a charge, movement key or touch stick held.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    clearControls();
    if (state === 'play' && !paused) togglePause();
  }
});
