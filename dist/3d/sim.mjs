import { MOVESETS, movesetKey } from './moves.mjs';
export { MOVESETS };
export const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
export const CAST = ['Darren', 'Tormund', 'Bucky'];
export const KITS = [
  { attack: 'Paw combo', charge: 'Packed snowball', color: 0xe64b42, speed: 5.8 },
  { attack: 'Sword and shield', charge: 'Crescent cleave', color: 0xe5bc61, speed: 5.5 },
  { attack: 'Mallet', charge: 'Timber quake', color: 0x518fcb, speed: 5.1 },
];
const TAU = Math.PI * 2,
  S = 0.04;
// Enemies and bosses follow the pixel game (dist/game.js GRUNTS, OFFICERS, MOVE_WIND), converted from pixels to metres (x 0.04).
export const GRUNTS = {
  gopher: { name: 'Gopher', hp: 22, r: 0.65, speed: 3.7, dmg: 5 },
  crow: { name: 'Crow', hp: 14, r: 0.55, speed: 5.2, dmg: 4 },
  bale: { name: 'Hay bale', hp: 46, r: 0.85, speed: 2.3, dmg: 8 },
};
export const BOSSES = {
  spud: {
    name: 'Sergeant Spudsworth',
    hp: 440,
    r: 1.36,
    speed: 3.2,
    moves: ['swipe', 'slam'],
    hello:
      'Sergeant Spudsworth: HALT! Nobody crosses the Spud Barricade without paying the toll. The toll is one (1) cookie. Do you have a cookie? No? Then FIGHT.\nDarren: Have you seen a little dog? Blue-and-white fur, red collar?\nSergeant Spudsworth: I have seen NOTHING. I am a potato. ...Also maybe a dog.',
  },
  weed: {
    name: 'Madame Tumbleweed',
    hp: 540,
    r: 1.36,
    speed: 3.8,
    moves: ['charge', 'swipe', 'charge'],
    hello:
      'Madame Tumbleweed: Darling. The prairie wind takes everything in the end. Hats. Hopes. Little dogs.\nDarren: Then I’ll take him back.\nMadame Tumbleweed: Ooh, feisty! Let us ROLL.',
  },
  cluck: {
    name: 'Colonel Cluck',
    hp: 640,
    r: 1.5,
    speed: 3.5,
    moves: ['slam', 'eggs', 'swipe'],
    hello:
      'Colonel Cluck: TEN-HUT! This perimeter is SECURE! Nothing gets past Coop Command. BAWK.\nDarren: A puppy got past you, didn’t he.\nColonel Cluck: ...Classified. EGG BARRAGE!',
  },
  baron: {
    name: 'The Bramble Baron',
    hp: 1350,
    r: 2.1,
    speed: 2.9,
    moves: ['slam', 'thorns', 'charge', 'swipe', 'thorns'],
    hello:
      'The Bramble Baron: So. The little red dragon with the polka-dot scarf. That puppy wandered into MY hollow. Finders keepers, as the prairie says.\nDarren: The prairie doesn’t say that. Give. Him. Back.',
  },
};
export const CAMP_BOSSES = ['spud', 'weed', 'cluck'];
export const MOVE_WIND = { swipe: 0.6, slam: 1, charge: 0.75, thorns: 0.85, eggs: 0.7 };
export const BELLY = ['Little adventurer', 'Cozy belly', 'Round & ready', 'Snowball sturdy'];
// Combo damage per hit for Darren, Tormund and Bucky (Darren matches the pixel game's Bare Paws jab, cross and kick).
export const COMBO_DAMAGE = [
  [16, 19, 28],
  [18, 20, 30],
  [20, 22, 34],
];
const HOME = { x: 16.8, z: 51.2 };
function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const angleDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
export class World {
  constructor(data) {
    this.data = data;
    this.w = data.WORLD.w * S;
    this.d = data.WORLD.h * S;
    this.cols = data.WORLD.w / data.sampleStep + 1;
    this.cell = data.sampleStep * S;
    this.props = data.props
      .filter((p) => p.r)
      .map((p) => ({
        ...p,
        x: p.x * S,
        z: p.y * S,
        r: p.r * S,
        box: p.box ? { w: p.box.w * S, d: p.box.d * S } : null,
      }));
    this.navStep = 1.6;
    this.nx = Math.ceil(this.w / this.navStep);
    this.nz = Math.ceil(this.d / this.navStep);
    this.nav = null;
  }
  height(x, z) {
    x = clamp(x, 0, this.w - 0.001);
    z = clamp(z, 0, this.d - 0.001);
    const ix = Math.floor(x / this.cell),
      iz = Math.floor(z / this.cell),
      fx = x / this.cell - ix,
      fz = z / this.cell - iz,
      a = iz * this.cols + ix;
    const h00 = this.data.samples[a][2] * S,
      h10 = this.data.samples[a + 1][2] * S,
      h01 = this.data.samples[a + this.cols][2] * S,
      h11 = this.data.samples[a + this.cols + 1][2] * S;
    return fx + fz <= 1
      ? h00 + (h10 - h00) * fx + (h01 - h00) * fz
      : h11 + (h01 - h11) * (1 - fx) + (h10 - h11) * (1 - fz);
  }
  clear(x, z, r = 0.34) {
    if (x < r || z < r || x > this.w - r || z > this.d - r) return false;
    return !this.props.some((p) =>
      p.box
        ? Math.abs(x - p.x) < p.box.w / 2 + r && Math.abs(z - p.z) < p.box.d / 2 + r
        : Math.hypot(x - p.x, z - p.z) < p.r + r
    );
  }
  step(ax, az, x, z, r = 0.34, airY = null) {
    return (
      this.clear(x, z, r) &&
      (airY !== null
        ? this.height(x, z) < airY + 0.25
        : Math.abs(this.height(x, z) - this.height(ax, az)) <=
          Math.hypot(x - ax, z - az) * 0.86 + 0.12)
    );
  }
  move(a, dx, dz) {
    const n = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.15));
    for (let i = 0; i < n; i++) {
      const x = dx / n,
        z = dz / n,
        air = a.air > 0 ? a.y : null;
      if (this.step(a.x, a.z, a.x + x, a.z + z, 0.34, air)) {
        a.x += x;
        a.z += z;
      } else if (this.step(a.x, a.z, a.x + x, a.z, 0.34, air)) a.x += x;
      else if (this.step(a.x, a.z, a.x, a.z + z, 0.34, air)) a.z += z;
    }
  }
  safe(x, z) {
    if (this.clear(x, z)) return { x, z };
    for (let r = 0.5; r < 12; r += 0.5)
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * TAU,
          q = { x: x + Math.sin(a) * r, z: z + Math.cos(a) * r };
        if (this.clear(q.x, q.z) && Math.abs(this.height(q.x, q.z) - this.height(x, z)) < 0.5)
          return q;
      }
    return { x: 16.8, z: 52 };
  }
  visible(a, b) {
    const n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.2);
    for (let i = 1; i < n; i++) {
      const t = i / n,
        x = a.x + (b.x - a.x) * t,
        z = a.z + (b.z - a.z) * t;
      if (
        !this.clear(x, z, 0.05) ||
        this.height(x, z) >
          Math.max(a.y ?? this.height(a.x, a.z), b.y ?? this.height(b.x, b.z)) + 0.8
      )
        return false;
    }
    return true;
  }
  cellId(x, z) {
    return (
      clamp(Math.floor(x / this.navStep), 0, this.nx - 1) +
      clamp(Math.floor(z / this.navStep), 0, this.nz - 1) * this.nx
    );
  }
  center(id) {
    return {
      x: ((id % this.nx) + 0.5) * this.navStep,
      z: (Math.floor(id / this.nx) + 0.5) * this.navStep,
    };
  }
  prepareNav() {
    if (this.nav) return;
    this.nav = Array.from({ length: this.nx * this.nz }, () => []);
    for (let i = 0; i < this.nav.length; i++) {
      const a = this.center(i);
      if (!this.clear(a.x, a.z)) continue;
      for (const [dx, dz] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const x = (i % this.nx) + dx,
          z = Math.floor(i / this.nx) + dz;
        if (x < 0 || z < 0 || x >= this.nx || z >= this.nz) continue;
        const j = x + z * this.nx,
          b = this.center(j);
        let good = true,
          px = a.x,
          pz = a.z;
        for (let k = 1; k <= 8; k++) {
          const qx = a.x + ((b.x - a.x) * k) / 8,
            qz = a.z + ((b.z - a.z) * k) / 8;
          if (!this.step(px, pz, qx, qz)) {
            good = false;
            break;
          }
          px = qx;
          pz = qz;
        }
        if (good) this.nav[i].push(j);
      }
    }
  }
  field(x, z) {
    this.prepareNav();
    let target = this.cellId(x, z);
    if (!this.nav[target].length) {
      let best = Infinity;
      for (let i = 0; i < this.nav.length; i++)
        if (this.nav[i].length) {
          const p = this.center(i),
            d = Math.hypot(p.x - x, p.z - z);
          if (d < best) {
            target = i;
            best = d;
          }
        }
    }
    const distances = new Int32Array(this.nav.length).fill(-1),
      queue = [target];
    distances[target] = 0;
    for (let k = 0; k < queue.length; k++)
      for (const j of this.nav[queue[k]])
        if (distances[j] < 0) {
          distances[j] = distances[queue[k]] + 1;
          queue.push(j);
        }
    return distances;
  }
  direction(a, b, field, shortcut = true) {
    if (shortcut && Math.hypot(a.x - b.x, a.z - b.z) < 4 && this.visible(a, b))
      return Math.atan2(b.x - a.x, b.z - a.z);
    const id = this.cellId(a.x, a.z);
    let best = id;
    for (const j of this.nav[id] || [])
      if (field[j] >= 0 && (field[best] < 0 || field[j] < field[best])) best = j;
    const p = this.center(best);
    return Math.atan2(p.x - a.x, p.z - a.z);
  }
}
export class Game {
  constructor(world, saved = null, options = {}) {
    this.world = world;
    this.time = 0;
    this.paused = true;
    this.selected = 0;
    this.events = [];
    this.effects = [];
    this.shots = [];
    this.random = seeded(options.seed ?? Date.now());
    this.enemiesOn = options.enemies !== false;
    this.mode = 'adventure';
    this.style = 'paws';
    this.input = { x: 0, z: 0 };
    this.targets = [
      { x: 23, z: 50.5 },
      { x: 25, z: 52 },
      { x: 23, z: 54 },
    ].map((p, i) => ({ ...p, y: world.height(p.x, p.z), id: i, hits: 0, last: 0 }));
    this.actors = CAST.map((name, i) => {
      const p = world.safe(16.8 + i * 2, 52);
      return {
        name,
        ...p,
        y: world.height(p.x, p.z),
        air: 0,
        vy: 0,
        yaw: Math.PI,
        animation: 'Idle',
        action: null,
        cooldown: 0,
        energy: 100,
        charge: 0,
        charging: false,
        combo: 0,
        comboWindow: 0,
        moving: false,
        speed: 0,
        hp: 100,
        max: 100,
        inv: 0,
        down: false,
        kx: 0,
        kz: 0,
        vx: 0,
        vz: 0,
        assist: null,
        assistCd: 0,
        mus: 0,
        sprint: 0,
        buffer: null,
        airAttacked: false,
      };
    });
    this.quest = {
      chapter: 'rescue',
      clues: [false, false, false],
      rescued: false,
      home: false,
      wood: [false, false, false],
      delivered: false,
    };
    this.cookies = 0;
    this.cookieSpots = [
      { x: 20, z: 52 },
      { x: 48, z: 52.8 },
      { x: 56, z: 64 },
      { x: 85, z: 48 },
      { x: 101, z: 49 },
      { x: 125, z: 53 },
    ].map((p, i) => ({ ...p, id: i, taken: false }));
    this.navAge = 0;
    this.navField = null;
    this.stats = { attacks: 0, charged: 0, hits: 0, distance: 0 };
    this.bosses = [false, false, false, false];
    this.enemies = [];
    this.foeShots = [];
    this.pickups = [];
    this.ko = 0;
    this.nextKo = 100;
    this.combo = 0;
    this.comboTime = 0;
    this.bestCombo = 0;
    this.engaged = null;
    this.defeated = false;
    this.lastCamp = -1;
    this.spawnTimer = 3;
    this.nextId = 1;
    this.woodGuards = [false, false, false];
    this.restore(saved);
    this.spawnBosses();
  }
  get player() {
    return this.actors[this.selected];
  }
  get kit() {
    return KITS[this.selected];
  }
  // Darren's belly stage grows every 3 cookies, like the pixel game's P.weight (0-3).
  get belly() {
    return Math.min(3, Math.floor(this.cookies / 3));
  }
  get found() {
    return this.cookieSpots.filter((p) => p.taken).length;
  }
  rand(a = 0, b = 1) {
    return a + (b - a) * this.random();
  }
  emit(type, data = {}) {
    this.events.push({ type, ...data });
  }
  save() {
    return {
      version: 1,
      quest: this.quest,
      cookies: this.cookies,
      taken: this.cookieSpots.map((p) => p.taken),
      selected: this.selected,
      stats: this.stats,
      mode: this.mode,
      style: this.style,
      bosses: this.bosses.slice(),
      ko: this.ko,
      bestCombo: this.bestCombo,
      lastCamp: this.lastCamp,
    };
  }
  restore(s) {
    if (!s || s.version !== 1) return;
    const q = s.quest;
    if (
      q &&
      ['rescue', 'firewood'].includes(q.chapter) &&
      Array.isArray(q.clues) &&
      q.clues.length === 3 &&
      q.clues.every((v) => typeof v === 'boolean') &&
      Array.isArray(q.wood) &&
      q.wood.length === 3 &&
      q.wood.every((v) => typeof v === 'boolean')
    ) {
      this.quest = {
        chapter: q.chapter,
        clues: q.clues.slice(),
        rescued: q.rescued === true,
        home: q.home === true,
        wood: q.wood.slice(),
        delivered: q.delivered === true,
      };
      this.cookies = clamp(Math.floor(Number(s.cookies) || 0), 0, 999);
      if (Array.isArray(s.taken))
        this.cookieSpots.forEach((p, i) => (p.taken = s.taken[i] === true));
      this.selected = clamp(Math.floor(Number(s.selected) || 0), 0, 2);
      // Saves from before enemies existed have no boss list: a found clue means that camp is already cleared.
      this.bosses = [0, 1, 2].map(
        (i) => this.quest.clues[i] || (Array.isArray(s.bosses) && s.bosses[i] === true)
      );
      this.bosses[3] = this.quest.rescued || (Array.isArray(s.bosses) && s.bosses[3] === true);
      this.mode = s.mode === 'cozy' ? 'cozy' : 'adventure';
      this.style = s.style === 'scarf' ? 'scarf' : 'paws';
      this.ko = clamp(Math.floor(Number(s.ko) || 0), 0, 1e7);
      this.nextKo = (Math.floor(this.ko / 100) + 1) * 100;
      this.bestCombo = clamp(Math.floor(Number(s.bestCombo) || 0), 0, 1e7);
      const c = Math.floor(Number(s.lastCamp));
      this.lastCamp =
        c >= 0 && c < 3 && this.bosses[c] ? c : this.bosses.slice(0, 3).lastIndexOf(true);
    }
  }
  setMode(mode) {
    this.mode = mode === 'cozy' ? 'cozy' : 'adventure';
    this.emit('save');
  }
  setPause(value) {
    this.paused = value;
    this.cancelCharge();
    this.emit('pause', { paused: value });
  }
  cancelCharge() {
    for (const a of this.actors) {
      a.charging = false;
      a.charge = 0;
      if (!a.action && !a.assist) a.animation = 'Idle';
    }
  }
  switchTo(i) {
    if (
      !Number.isInteger(i) ||
      i < 0 ||
      i > 2 ||
      this.player.action ||
      this.player.air > 0 ||
      this.actors[i].down
    )
      return false;
    this.cancelCharge();
    const p = this.player,
      q = this.actors[i];
    if (q !== p) {
      [p.x, q.x] = [q.x, p.x];
      [p.z, q.z] = [q.z, p.z];
      [p.y, q.y] = [q.y, p.y];
      q.yaw = p.yaw;
      q.assist = null;
      [q.vx, q.vz, p.vx, p.vz] = [p.vx, p.vz, 0, 0];
    }
    this.selected = i;
    this.navAge = 99;
    this.emit('save');
    return true;
  }
  // Used when the hero is knocked out: the next friend steps in even mid-air or mid-attack.
  forceSwitch(i) {
    const p = this.player;
    Object.assign(p, {
      action: null,
      air: 0,
      vy: 0,
      y: this.world.height(p.x, p.z),
      animation: 'Idle',
      assist: null,
      vx: 0,
      vz: 0,
    });
    this.cancelCharge();
    const q = this.actors[i];
    [p.x, q.x] = [q.x, p.x];
    [p.z, q.z] = [q.z, p.z];
    [p.y, q.y] = [q.y, p.y];
    q.yaw = p.yaw;
    q.action = null;
    q.assist = null;
    q.inv = 1.2;
    this.selected = i;
    this.navAge = 99;
  }
  healParty(amount, revive = false) {
    for (const a of this.actors) {
      if (a.down && !revive) continue;
      if (a.down) {
        a.down = false;
        a.hp = 0;
      }
      a.hp = Math.min(a.max, a.hp + amount);
    }
  }
  regroup(spot) {
    this.cancelCharge();
    for (let i = 0; i < 3; i++) {
      const a = this.actors[i],
        p = this.world.safe(spot.x + i * 2, spot.z);
      Object.assign(a, p, {
        y: this.world.height(p.x, p.z),
        air: 0,
        vy: 0,
        action: null,
        animation: 'Idle',
        energy: 100,
        hp: a.max,
        down: false,
        inv: 1.5,
        kx: 0,
        kz: 0,
        vx: 0,
        vz: 0,
        assist: null,
      });
    }
    this.shots = [];
    this.foeShots = [];
    this.navAge = 99;
    this.defeated = false;
    this.engaged = null;
    this.spawnTimer = 4;
    this.combo = 0;
    this.enemies = this.enemies.filter((e) => e.boss && !e.dead);
    for (const e of this.enemies) this.resetBoss(e);
    this.woodGuards = this.quest.wood.slice();
    this.spawnBosses();
  }
  home() {
    this.regroup(HOME);
  }
  // After a defeat, start again beside the last cleared camp (or the cottage). Cleared camps, clues and cookies stay.
  retry() {
    const c =
      this.quest.chapter === 'rescue' && this.lastCamp >= 0
        ? this.world.data.CAMPS[this.lastCamp]
        : null;
    this.regroup(c ? { x: c.x * S, z: c.y * S + 3.6 } : HOME);
    this.emit('save');
  }
  resetBoss(e) {
    const p = this.world.safe(e.home.x, e.home.z);
    Object.assign(e, p, {
      y: this.world.height(p.x, p.z),
      hp: e.max,
      active: false,
      state: 'idle',
      st: 0,
      cd: 1,
      kx: 0,
      kz: 0,
      move: null,
    });
  }
  makeFoe(type, x, z, boss = false) {
    const b = boss ? BOSSES[type] : GRUNTS[type],
      p = this.world.clear(x, z, 0.5) ? { x, z } : this.world.safe(x, z);
    return {
      id: this.nextId++,
      type,
      boss,
      name: b.name,
      x: p.x,
      z: p.z,
      y: this.world.height(p.x, p.z),
      hp: b.hp,
      max: b.hp,
      r: b.r,
      speed: b.speed,
      dmg: b.dmg || 12,
      state: 'idle',
      st: 0,
      cd: this.rand(0.6, 1.6),
      kx: 0,
      kz: 0,
      yaw: 0,
      active: !boss,
      dead: false,
      fly: null,
      flash: 0,
      move: null,
      cdir: 0,
      guard: null,
      home: { x: p.x, z: p.z },
      moving: false,
      t: this.rand(0, 10),
      camp: -1,
      woodSite: -1,
    };
  }
  spawnBosses() {
    if (!this.enemiesOn || this.quest.chapter !== 'rescue') return;
    const camps = this.world.data.CAMPS;
    for (let i = 0; i < 3; i++)
      if (!this.bosses[i] && !this.enemies.some((e) => e.camp === i)) {
        const e = this.makeFoe(CAMP_BOSSES[i], camps[i].x * S, camps[i].y * S, true);
        e.camp = i;
        this.enemies.push(e);
      }
    if (
      this.quest.clues.every(Boolean) &&
      !this.bosses[3] &&
      !this.enemies.some((e) => e.type === 'baron')
    ) {
      const h = this.world.data.HOLLOW,
        b = this.makeFoe('baron', h.x * S, h.y * S, true);
      b.camp = 3;
      this.enemies.push(b);
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * TAU,
          e = this.makeFoe(
            ['gopher', 'bale', 'crow'][k % 3],
            h.x * S + Math.sin(a) * 6,
            h.y * S + Math.cos(a) * 5
          );
        e.guard = { x: h.x * S, z: h.y * S };
        this.enemies.push(e);
      }
    }
  }
  startAction(name, duration, impact = null, charge = 0) {
    const a = this.player;
    a.action = { name, time: 0, duration, impact, done: false, charge, kind: this.selected };
    a.animation = name;
    a.cooldown = 0.12;
    this.emit('animation', { actor: this.selected, name });
  }
  // Hit reactions are short actions of their own so the right animation plays and the hero can't act mid-stagger.
  react(a, name, duration, extra = {}) {
    a.action = {
      name,
      time: 0,
      duration,
      impact: null,
      done: true,
      charge: 0,
      kind: this.actors.indexOf(a),
      react: true,
      ...extra,
    };
    a.animation = name;
    a.vx = a.vz = 0;
  }
  // The moveset of the hero being played (Darren's depends on his weapon style).
  moveset(i = this.selected) {
    return MOVESETS[movesetKey(i, this.style)];
  }
  // Starts a move from moves.mjs. The hero turns to the stick, or else toward the nearest foe in front.
  startMove(a, m, type, index = 0) {
    const i = this.actors.indexOf(a),
      inp = this.input;
    if (a === this.player && inp && Math.hypot(inp.x, inp.z) > 0.2)
      a.yaw = Math.atan2(inp.x, inp.z);
    else {
      let best = null,
        bd = 5.5;
      for (const e of this.enemies) {
        if (e.dead || (e.boss && !e.active)) continue;
        const d = Math.hypot(e.x - a.x, e.z - a.z) - e.r;
        if (d < bd && Math.abs(angleDiff(Math.atan2(e.x - a.x, e.z - a.z), a.yaw)) < 2) {
          bd = d;
          best = e;
        }
      }
      if (best) a.yaw = Math.atan2(best.x - a.x, best.z - a.z);
    }
    a.action = {
      name: m.anim,
      anim: m.anim,
      move: m,
      type,
      index,
      time: 0,
      duration: m.dur,
      impact: null,
      done: true,
      next: 0,
      shot: 0,
      pulse: m.pulse ? m.pulse.from : null,
      hopped: false,
      charge: 0,
      kind: i,
      armor: !!m.armor,
      blend: m.blend,
    };
    a.animation = m.anim;
    a.cooldown = 0.08;
    a.buffer = null;
    a.charging = false;
    a.charge = 0;
    if (type === 'normal') a.combo = index;
    if (type === 'jump' && m.dive !== undefined) a.vy = Math.min(a.vy, 1.5);
    this.stats.attacks++;
    this.emit('animation', { actor: i, name: m.anim, type });
    if (type === 'special') this.emit('special', { actor: i, name: m.name });
  }
  attack() {
    const a = this.player;
    if (this.paused || a.charging || a.down || this.defeated) return false;
    const set = this.moveset();
    if (a.action) {
      // Pressed during a move: remembered and used at the move's cancel point (the next hit of the string).
      if (a.action.move && a.action.type !== 'special') {
        a.buffer = 'attack';
        return true;
      }
      return false;
    }
    if (a.cooldown > 0) return false;
    if (a.air > 0) {
      if (!set.jump || a.airAttacked) return false;
      a.airAttacked = true;
      this.startMove(a, set.jump, 'jump');
      return true;
    }
    if (set.dash && a.sprint > 0.7) {
      this.startMove(a, set.dash, 'dash');
      return true;
    }
    const i = a.comboWindow > 0 ? (a.combo + 1) % set.normal.length : 0;
    this.startMove(a, set.normal[i], 'normal', i);
    return true;
  }
  // The finisher that follows normal hit n, if this hero has one.
  finisher(n) {
    return this.moveset().charge[n] || null;
  }
  chargeStart() {
    const a = this.player;
    if (this.paused || a.down || this.defeated) return false;
    const q = a.action;
    if (q?.move && q.type === 'normal' && this.finisher(q.index + 1)) {
      a.buffer = 'charge';
      return true;
    }
    if (!q && a.comboWindow > 0 && a.air <= 0 && this.finisher(a.combo + 1)) {
      this.startMove(a, this.finisher(a.combo + 1), 'charge', a.combo + 1);
      a.comboWindow = 0;
      return true;
    }
    if (q || a.cooldown > 0 || a.energy < 15 || a.air > 0) return false;
    a.charging = true;
    a.charge = 0;
    a.animation = 'Charge';
    return true;
  }
  // A buffered button fires at the cancel point of the current move.
  followUp(a) {
    const q = a.action,
      b = a.buffer,
      set = this.moveset();
    a.buffer = null;
    if (b === 'attack') {
      if (q.type === 'normal') {
        this.startMove(
          a,
          set.normal[(q.index + 1) % set.normal.length],
          'normal',
          (q.index + 1) % set.normal.length
        );
        return;
      }
      a.action = null;
      a.cooldown = 0;
      a.comboWindow = 0;
      this.attack();
    } else if (b === 'charge' && q.type === 'normal') {
      const c = this.finisher(q.index + 1);
      if (c) this.startMove(a, c, 'charge', q.index + 1);
    }
  }
  special() {
    const a = this.player;
    if (this.paused || a.down || this.defeated || a.charging || (a.mus || 0) < 100) return false;
    if (a.action && !(a.action.move && a.action.type !== 'special' && a.action.time > 0.1))
      return false;
    const m = this.moveset().special;
    if (!m) return false;
    a.mus = 0;
    a.air = Math.max(0, a.air);
    this.startMove(a, m, 'special');
    a.inv = Math.max(a.inv, 0.3);
    return true;
  }
  // Darren switches between Bare Paws and the Polka Scarf.
  switchStyle(style) {
    const a = this.player;
    if (this.selected !== 0 || this.paused || a.action || a.charging) return false;
    const next = style || (this.style === 'paws' ? 'scarf' : 'paws');
    if ((next !== 'paws' && next !== 'scarf') || next === this.style) return false;
    this.style = next;
    a.combo = 0;
    a.comboWindow = 0;
    this.emit('style', { style: next, name: MOVESETS[next].name });
    this.emit('save');
    return true;
  }
  chargeRelease() {
    const a = this.player;
    if (!a.charging) return false;
    const q = clamp(a.charge / 1.2, 0, 1);
    a.charging = false;
    a.charge = 0;
    if (this.paused) return false;
    a.energy = Math.max(0, a.energy - (15 + q * 20));
    const hold = this.moveset().charge[0];
    if (hold) {
      // A hold move from moves.mjs, stretched by how long it was charged (Polka Snare).
      const h = hold.hits[0];
      this.startMove(
        a,
        { ...hold, hits: [{ ...h, r: h.r + q * 2.5, dmg: Math.round(h.dmg + q * 30) }] },
        'hold'
      );
      a.action.charge = q;
    } else this.startAction('ChargeAttack', 1.05, 0.42, q);
    this.stats.charged++;
    return true;
  }
  // Jumping is free movement now (no locked action), so the hero can steer and attack in the air.
  jump() {
    const a = this.player;
    if (this.paused || a.air > 0 || a.action || a.charging) return false;
    a.air = 0.01;
    a.vy = 7.2;
    // A hero knocked out mid-air never touched down, so clear the jump-attack flag here too.
    a.airAttacked = false;
    a.animation = 'Jump';
    a.cooldown = 0.12;
    this.emit('jump', { actor: this.selected });
    return true;
  }
  dodge() {
    const a = this.player,
      inp = this.input;
    if (this.paused || a.action || a.charging) return false;
    // Tormund standing still raises his shield instead: a parry window that answers with a counter-cut.
    const set = this.moveset();
    if (set.parry && a.air <= 0 && !(inp && Math.hypot(inp.x, inp.z) > 0.2)) {
      if (a.energy < 10) return false;
      a.energy -= 10;
      this.startAction('Parry', set.parry.dur);
      return true;
    }
    if (a.energy < 18) return false;
    a.energy -= 18;
    this.startAction('Dodge', 0.55);
    return true;
  }
  hit(a, r, charge, arc = Math.PI * 1.3, damage = 0, kb = 4) {
    let count = 0;
    this.striker = this.actors.indexOf(a);
    for (const t of this.targets) {
      const d = Math.hypot(t.x - a.x, t.z - a.z),
        angle = Math.atan2(t.x - a.x, t.z - a.z),
        diff = Math.atan2(Math.sin(angle - a.yaw), Math.cos(angle - a.yaw));
      if (
        d <= r &&
        Math.abs(t.y - a.y) < 1.2 &&
        Math.abs(diff) < arc / 2 &&
        this.world.visible(a, t)
      ) {
        t.hits++;
        t.last = this.time;
        this.stats.hits++;
        count++;
        this.emit('hit', {
          x: t.x,
          z: t.z,
          y: t.y + 1,
          power: charge,
          actor: this.striker,
          angle: a.yaw,
        });
      }
    }
    if (damage > 0)
      for (const e of this.enemies) {
        if (e.dead) continue;
        const d = Math.hypot(e.x - a.x, e.z - a.z),
          angle = Math.atan2(e.x - a.x, e.z - a.z);
        if (
          d <= r + e.r * 0.85 &&
          Math.abs(e.y - a.y) < 1.6 &&
          Math.abs(angleDiff(angle, a.yaw)) < arc / 2 + (d < e.r + 0.6 ? 0.8 : 0) &&
          this.world.visible(a, e)
        ) {
          this.damageFoe(e, damage, angle, kb, charge > 1);
          count++;
        }
      }
    this.striker = -1;
    return count;
  }
  // One hit of a move: everything inside reach and arc (centre pushed forward by off) takes it.
  strike(a, h, q) {
    const off = h.off || 0,
      c = { x: a.x + Math.sin(a.yaw) * off, z: a.z + Math.cos(a.yaw) * off, y: a.y },
      dmg = h.dmg + (q.kind === 0 && h.belly ? this.belly * h.belly : 0),
      heavy = !!(h.down || h.launch || h.kb >= 10);
    let count = 0;
    // Who landed the blow, for the hit effects (game.mjs); friends' assists count as nobody's.
    this.striker = q.friend ? -1 : q.kind;
    for (const t of this.targets) {
      const d = Math.hypot(t.x - c.x, t.z - c.z);
      if (
        d <= h.r &&
        Math.abs(t.y - a.y) < 1.4 &&
        (h.arc >= TAU - 0.01 ||
          Math.abs(angleDiff(Math.atan2(t.x - c.x, t.z - c.z), a.yaw)) < h.arc / 2)
      ) {
        t.hits++;
        t.last = this.time;
        this.stats.hits++;
        count++;
        this.emit('hit', {
          x: t.x,
          z: t.z,
          y: t.y + 1,
          power: heavy ? 2 : 1,
          actor: this.striker,
          angle: a.yaw,
        });
      }
    }
    for (const e of this.enemies) {
      if (e.dead) continue;
      const d = Math.hypot(e.x - c.x, e.z - c.z),
        angle = Math.atan2(e.x - c.x, e.z - c.z);
      if (
        d <= h.r + e.r * 0.85 &&
        Math.abs(e.y - a.y) < (e.boss ? 2.6 : h.launch ? 2.4 : 1.8) &&
        (h.line
          ? this.inLine(a, e, h.r)
          : h.arc >= TAU - 0.01 ||
            Math.abs(angleDiff(angle, a.yaw)) < h.arc / 2 + (d < e.r + 0.6 ? 0.8 : 0)) &&
        this.world.visible(c, e)
      ) {
        let kb = h.kb;
        if (h.pull) {
          // Drag the foe in to just in front of the hero (knockback travels kb*2.4/8 m), never past.
          const reach = Math.hypot(e.x - a.x, e.z - a.z) - e.r - 1.2;
          kb = Math.min(h.pull, Math.max(0, (reach * 8) / 2.4 / (e.boss ? 0.22 : 1)));
        }
        this.damageFoe(
          e,
          dmg,
          h.pull ? Math.atan2(e.x - a.x, e.z - a.z) + Math.PI : angle,
          kb,
          heavy,
          h
        );
        count++;
      }
    }
    this.emit('swing', {
      actor: q.kind,
      x: c.x,
      z: c.z,
      y: a.y + 0.1,
      r: h.ring || 1.2,
      strong: !!h.ring,
      power: heavy ? 1 : 0,
      move: q.anim,
    });
    if (count && !q.friend)
      this.emit('hitstop', {
        t: h.down || h.launch ? 0.075 : heavy ? 0.06 : 0.035,
        actor: q.kind,
        heavy,
      });
    this.striker = -1;
    return count;
  }
  // A straight crack along the hero's facing: ahead of him and within about a metre of the line.
  inLine(a, e, r) {
    const dx = e.x - a.x,
      dz = e.z - a.z,
      along = dx * Math.sin(a.yaw) + dz * Math.cos(a.yaw),
      side = Math.abs(dx * Math.cos(a.yaw) - dz * Math.sin(a.yaw));
    return along > -0.5 && along <= r + e.r && side < 1 + e.r;
  }
  throwBall(a, angle, speed, dmg, r, power = 0) {
    this.shots.push({
      x: a.x + Math.sin(angle) * 0.8,
      z: a.z + Math.cos(angle) * 0.8,
      y: a.y + 1.1,
      vx: Math.sin(angle) * speed,
      vz: Math.cos(angle) * speed,
      vy: 1.5,
      life: 1.6,
      r,
      power,
      damage: dmg,
      struck: new Set(),
    });
  }
  // Runs the timed parts of a move: hits, snowballs, hops and repeating special pulses.
  runMove(a, q) {
    const m = q.move;
    while (m.hits && q.next < m.hits.length && q.time >= m.hits[q.next].t)
      this.strike(a, m.hits[q.next++], q);
    while (m.shots && q.shot < m.shots.length && q.time >= m.shots[q.shot].t) {
      const s = m.shots[q.shot++];
      this.throwBall(a, a.yaw + s.spread, s.speed, s.dmg, s.r, 0.3);
      this.emit('throw');
    }
    if (m.hop && !q.hopped && q.time >= m.hop.t) {
      q.hopped = true;
      a.air = Math.max(a.air, 0.01);
      a.vy = m.hop.vy;
    }
    if (m.dive !== undefined && q.time > 0.1 && a.air > 0) a.vy = Math.min(a.vy, m.dive);
    const p = m.pulse;
    while (p && q.pulse !== null && q.pulse <= p.to && q.time >= q.pulse) {
      this.strike(a, { r: p.r, arc: TAU, dmg: p.dmg, kb: p.kb, pull: p.pull }, q);
      for (let k = 0; k < (p.shots || 0); k++)
        this.throwBall(a, (k / p.shots) * TAU + q.time * 1.7, 12, 10, 0.2, 0.2);
      q.pulse += p.every;
    }
  }
  impact(a, action) {
    const strong = action.name === 'ChargeAttack',
      k = action.kind;
    if (strong && k === 0) {
      this.shots.push({
        x: a.x + Math.sin(a.yaw) * 0.8,
        z: a.z + Math.cos(a.yaw) * 0.8,
        y: a.y + 1.15,
        vx: Math.sin(a.yaw) * (10 + action.charge * 8),
        vz: Math.cos(a.yaw) * (10 + action.charge * 8),
        vy: 2.5,
        life: 2.5,
        r: 0.18 + action.charge * 0.35,
        power: action.charge,
        damage: Math.round(30 + action.charge * 40 + this.belly * 5),
        struck: new Set(),
      });
      this.emit('throw');
    } else {
      const r = strong ? (k === 2 ? 3 + action.charge * 2 : 2.3 + action.charge * 1.5) : 2.1,
        step = strong ? 0 : Number(action.name.slice(6)) - 1,
        damage = strong
          ? Math.round(k === 1 ? 28 + action.charge * 34 : 26 + action.charge * 30)
          : COMBO_DAMAGE[k][step] + (k === 0 && step === 2 ? this.belly * 4 : 0);
      this.hit(
        a,
        r,
        strong ? 1 + action.charge : 1,
        strong && k === 2 ? TAU : Math.PI * 1.4,
        damage,
        strong ? 10 : step === 2 ? 8 : 4
      );
      this.emit('swing', {
        actor: k,
        x: a.x,
        z: a.z,
        y: a.y + 0.1,
        r: strong ? r : 1.4,
        strong,
        power: action.charge,
      });
    }
  }
  damageFoe(e, damage, angle, kb = 4, heavy = false, h = null) {
    if (e.dead) return;
    if (e.boss && !e.active) this.engage(e);
    damage = Math.round(damage * this.rand(0.9, 1.15));
    e.hp -= damage;
    e.flash = 0.15;
    const res = e.boss ? 0.22 : 1;
    e.kx += Math.sin(angle) * kb * res * 2.4;
    e.kz += Math.cos(angle) * kb * res * 2.4;
    if (!e.boss) {
      // Launchers pop grunts into the air (they can be juggled); sweeps knock them flat.
      if (h?.launch) {
        e.vy = h.launch * (e.type === 'bale' ? 0.7 : 1);
        e.air = Math.max(e.air || 0, 0.01);
        e.state = 'air';
      } else if (e.air > 0) {
        e.vy = Math.max(e.vy, 3.2);
      } else if (h?.down) {
        e.state = 'down';
        e.st = 0.95;
      } else if (e.state !== 'down') {
        e.state = 'hurt';
        e.st = 0.32;
      }
    } else if (e.state === 'idle' || e.state === 'hurt') {
      e.state = 'hurt';
      e.st = 0.1;
    }
    const p = this.player;
    if (!(p.action?.type === 'special')) p.mus = Math.min(100, (p.mus || 0) + (e.boss ? 3.2 : 2.3));
    this.combo++;
    this.comboTime = 2.4;
    this.bestCombo = Math.max(this.bestCombo, this.combo);
    this.stats.hits++;
    this.emit('hit', {
      x: e.x,
      z: e.z,
      y: e.y + (e.boss ? 2 : 1),
      power: heavy ? 2 : 1,
      damage,
      foe: e.id,
      actor: this.striker ?? -1,
      angle,
    });
    if (e.hp <= 0) this.killFoe(e, angle);
  }
  killFoe(e, angle) {
    e.dead = true;
    e.hp = 0;
    e.state = 'dead';
    e.fly = {
      t: 0,
      vx: Math.sin(angle) * this.rand(6, 10) * (e.boss ? 0.2 : 1),
      vz: Math.cos(angle) * this.rand(6, 10) * (e.boss ? 0.2 : 1),
      vy: e.boss ? 5 : this.rand(8, 12),
      spin: this.rand(-12, 12),
    };
    this.ko++;
    this.emit('ko', { x: e.x, z: e.z, boss: e.boss });
    if (this.ko >= this.nextKo) {
      this.emit('banner', { title: this.nextKo + ' K.O.!', text: 'Keep going, friends' });
      this.nextKo += 100;
      this.player.hp = Math.min(this.player.max, this.player.hp + 15);
    }
    if (e.boss) {
      this.bossDown(e);
      return;
    }
    const r = this.random();
    if (r < 0.07) this.drop(e.x, e.z, 'cookie');
    else if (r < 0.2) this.drop(e.x, e.z, 'orb');
  }
  drop(x, z, kind) {
    const p = this.world.clear(x, z, 0.2) ? { x, z } : this.world.safe(x, z);
    this.pickups.push({ id: this.nextId++, x: p.x, z: p.z, kind, t: 0 });
  }
  bossDown(e) {
    if (this.engaged === e) this.engaged = null;
    this.drop(e.x - 0.8, e.z, 'cookie');
    this.drop(e.x + 0.8, e.z, 'cookie');
    this.drop(e.x, e.z + 0.8, 'orb');
    for (const o of this.enemies)
      if (!o.boss && !o.dead && Math.hypot(o.x - e.x, o.z - e.z) < 17)
        this.killFoe(o, Math.atan2(o.x - e.x, o.z - e.z));
    this.foeShots = [];
    if (e.type === 'baron') {
      this.bosses[3] = true;
      for (const o of this.enemies) if (!o.dead) this.killFoe(o, Math.atan2(o.x - e.x, o.z - e.z));
      this.healParty(25, true);
      this.emit('bossDown', {
        name: e.name,
        boss: e.type,
        title: 'THE BARON FALLS',
        text: 'A small bark under the brambles',
      });
      this.emit('save');
      return;
    }
    this.bosses[e.camp] = true;
    this.lastCamp = e.camp;
    this.healParty(25, true);
    const label = this.world.data.CAMPS[e.camp].label;
    this.emit('bossDown', {
      name: e.name,
      boss: e.type,
      title: label.toUpperCase() + ' CLEARED',
      text: 'Look around the camp for a clue',
    });
    this.emit('save');
  }
  engage(e) {
    if (e.active || e.dead) return;
    e.active = true;
    if (!this.engaged || this.engaged.dead) this.engaged = e;
    this.emit('boss', {
      name: e.name,
      boss: e.type,
      text: BOSSES[e.type].hello,
      final: e.type === 'baron',
    });
  }
  hurtHero(damage, angle) {
    const a = this.player;
    if (
      this.defeated ||
      a.inv > 0 ||
      a.down ||
      (a.action?.name === 'Dodge' && a.action.time < 0.45) ||
      (a.action?.move?.inv &&
        a.action.time >= a.action.move.inv[0] &&
        a.action.time <= a.action.move.inv[1])
    )
      return false;
    const parry = this.moveset().parry;
    if (
      parry &&
      a.action?.name === 'Parry' &&
      a.action.time <= parry.window &&
      Math.abs(angleDiff(angle, a.yaw + Math.PI)) < Math.PI * 0.6
    ) {
      // Blocked from the front: the attacker reels and Tormund cuts back at once.
      for (const e of this.enemies)
        if (!e.dead && Math.hypot(e.x - a.x, e.z - a.z) < 3.2 + e.r && !e.boss) {
          e.state = 'hurt';
          e.st = 0.6;
        }
      this.stats.parries = (this.stats.parries || 0) + 1;
      a.mus = Math.min(100, (a.mus || 0) + 6);
      this.emit('parry', { actor: this.selected, x: a.x, z: a.z, y: a.y + 1.3 });
      this.emit('hitstop', { t: 0.09 });
      this.startMove(a, parry.counter, 'counter');
      a.inv = Math.max(a.inv, 0.35);
      return false;
    }
    damage = Math.max(1, Math.round(damage * (this.mode === 'cozy' ? 0.55 : 1)));
    a.hp -= damage;
    a.inv = 0.7;
    a.kx += Math.sin(angle) * 6;
    a.kz += Math.cos(angle) * 6;
    this.combo = 0;
    // Big blows knock the hero down (then up again, untouchable meanwhile); medium ones stagger;
    // small ones only make the body flinch. Armoured moves (Bucky's heavy swings) shrug them off.
    const front = Math.abs(angleDiff(angle, a.yaw + Math.PI)) < Math.PI / 2,
      armored = a.action?.armor && damage < 20;
    if (!armored && a.air <= 0 && damage >= 14) {
      this.react(a, 'Knockdown', 0.8, { then: { name: 'GetUp', duration: 0.62 } });
      a.inv = 1.6;
      a.kx += Math.sin(angle) * 4;
      a.kz += Math.cos(angle) * 4;
    } else if (!armored && a.air <= 0 && damage >= 7)
      this.react(a, front ? 'HurtF' : 'HurtB', 0.36);
    if (!armored) {
      a.charging = false;
      a.charge = 0;
    }
    this.emit('hurt', { damage, actor: this.selected, x: a.x, z: a.z, y: a.y + 1.6, angle });
    if (a.hp <= 0) {
      a.hp = 0;
      a.down = true;
      const next = [1, 2].map((k) => (this.selected + k) % 3).find((i) => !this.actors[i].down);
      if (next !== undefined) {
        const name = a.name;
        this.forceSwitch(next);
        this.emit('down', { name, next: this.player.name });
      } else {
        this.defeated = true;
        this.foeShots = [];
        this.emit('defeat');
      }
    }
    return true;
  }
  gainCookie() {
    const before = this.belly;
    this.cookies = Math.min(999, this.cookies + 1);
    const heal = this.mode === 'cozy' ? 32 : 22,
      a = this.player;
    a.hp = Math.min(a.max, a.hp + heal);
    for (const b of this.actors)
      if (b !== a) {
        if (b.down) {
          b.down = false;
          b.hp = 0;
        }
        b.hp = Math.min(b.max, b.hp + Math.round(heal / 2));
      }
    this.emit('cookie', { heal });
    if (this.belly > before)
      this.emit('belly', {
        stage: this.belly,
        title: BELLY[this.belly].toUpperCase(),
        text: 'Darren’s finisher and packed snowball hit harder',
      });
    this.emit('save');
  }
  objective() {
    const q = this.quest,
      camps = this.world.data.CAMPS;
    if (q.chapter === 'rescue') {
      const i = q.clues.indexOf(false);
      if (i >= 0) {
        const p = camps[i];
        if (this.enemiesOn && !this.bosses[i])
          return {
            x: p.x * S,
            z: p.y * S,
            label: `Defeat ${BOSSES[CAMP_BOSSES[i]].name} at ${p.label}`,
            fight: true,
          };
        return {
          x: p.x * S,
          z: p.y * S,
          label: [
            'Find Ruffy’s bell at Spud Barricade',
            'Find the chewed toy at Windswept Ring',
            'Follow the paw prints at Coop Command',
          ][i],
        };
      }
      if (!q.rescued) {
        if (this.enemiesOn && !this.bosses[3])
          return {
            x: 129.6,
            z: 53.2,
            label: 'Defeat the Bramble Baron in Bramble Hollow',
            fight: true,
          };
        return { x: 129.6, z: 53.2, label: 'Find Ruffy beside Bramble Keep' };
      }
      if (!q.home) return { x: 16.8, z: 50.4, label: 'Bring Ruffy home' };
      return { x: 16.8, z: 50.4, label: 'Ruffy is home! Start Firewood for Mom from Pause.' };
    }
    const i = q.wood.indexOf(false);
    if (i >= 0) {
      const p = this.world.data.WOOD_SITES[i];
      if (this.enemies.some((e) => !e.dead && e.woodSite === i))
        return {
          x: p.x * S,
          z: p.y * S,
          label: `Clear the trail at ${p.name} · ${q.wood.filter(Boolean).length * 2}/6 bundles`,
          fight: true,
        };
      return {
        x: p.x * S,
        z: p.y * S,
        label: `Gather fallen wood · ${p.name} · ${q.wood.filter(Boolean).length * 2}/6 bundles`,
      };
    }
    return {
      x: 16.8,
      z: 50.4,
      label: q.delivered
        ? 'Six bundles delivered. A warm home, thanks to friends.'
        : 'Bring all six bundles home to Mom',
    };
  }
  // True when the hero stands at the objective and nothing (an undefeated boss or wood guards) blocks it.
  canInteract() {
    const o = this.objective(),
      a = this.player;
    if (o.fight) return false;
    if (Math.hypot(a.x - o.x, a.z - o.z) > 2.8 || Math.abs(a.y - this.world.height(o.x, o.z)) > 1)
      return false;
    const q = this.quest;
    return q.chapter === 'rescue' ? !q.home : !q.delivered;
  }
  interact() {
    if (this.paused || this.player.action || !this.canInteract()) return false;
    const q = this.quest;
    if (q.chapter === 'rescue') {
      const i = q.clues.indexOf(false);
      if (i >= 0) {
        q.clues[i] = true;
        this.emit('dialogue', {
          text: [
            'Darren: His bell! He crossed the valley. Tormund: We’ll follow the path together.',
            'Darren: Ruffy’s favorite toy. Bucky: He can’t be far.',
            'Tormund: Fresh paw prints head east. Darren: Hang on, Ruffy!',
          ][i],
        });
        if (q.clues.every(Boolean) && this.enemiesOn && !this.bosses[3]) {
          this.spawnBosses();
          this.emit('banner', { title: 'THE HOLLOW STIRS', text: 'Head east to Bramble Hollow' });
        }
      } else if (!q.rescued) {
        q.rescued = true;
        this.emit('dialogue', {
          text: 'Ruffy is safe! He bounds toward Darren. Let’s bring him home.',
        });
      } else if (!q.home) {
        q.home = true;
        this.emit('dialogue', {
          text: 'Mom: You’re all home! Come warm your paws. Firewood for Mom is now available in Pause.',
        });
      } else return false;
    } else {
      const i = q.wood.indexOf(false);
      if (i >= 0) {
        q.wood[i] = true;
        this.healParty(12);
        this.emit('dialogue', {
          text: 'Bucky bundles the fallen branches. Two more dry bundles for Mom!',
        });
      } else if (!q.delivered) {
        q.delivered = true;
        this.emit('dialogue', {
          text: 'Mom: Six bundles! The hearth will be warm tonight. Cocoa for everyone.',
        });
      } else return false;
    }
    const complete = q.chapter === 'rescue' ? q.home : q.delivered;
    this.startAction(complete ? 'Celebrate' : 'Interact', complete ? 1.8 : 1.1);
    this.emit('save');
    return true;
  }
  chapter(chapter) {
    if (!['rescue', 'firewood'].includes(chapter)) return;
    this.quest.chapter = chapter;
    this.enemies = [];
    this.pickups = [];
    this.home();
    this.emit('save');
  }
  update(dt, input = { x: 0, z: 0 }) {
    if (this.paused || this.defeated) return;
    dt = clamp(dt, 0, 0.05);
    this.time += dt;
    this.input = input;
    const a = this.player,
      kit = this.kit;
    for (const actor of this.actors) {
      actor.energy = Math.min(100, actor.energy + dt * 9);
      actor.cooldown = Math.max(0, actor.cooldown - dt);
      actor.comboWindow = Math.max(0, actor.comboWindow - dt);
      actor.inv = Math.max(0, actor.inv - dt);
      actor.assistCd = Math.max(0, actor.assistCd - dt);
      actor.moving = false;
      if (actor !== a && !actor.down) actor.hp = Math.min(actor.max, actor.hp + dt);
    }
    this.comboTime = Math.max(0, this.comboTime - dt);
    if (this.comboTime <= 0) this.combo = 0;
    if (a.charging) {
      a.charge = Math.min(1.2, a.charge + dt);
      a.animation = 'Charge';
    }
    let dx = input.x || 0,
      dz = input.z || 0,
      n = Math.hypot(dx, dz);
    if (n > 1) {
      dx /= n;
      dz /= n;
      n = 1;
    }
    // Smooth movement (Claude update 6): the hero accelerates and turns instead of snapping.
    const steer = !a.action && !a.charging;
    if (n > 0.05 && steer) {
      const want = Math.atan2(dx, dz),
        diff = angleDiff(want, a.yaw),
        rate = a.speed < 0.5 || Math.abs(diff) > 2.6 ? 26 : 15;
      a.yaw += clamp(diff, -rate * dt, rate * dt);
      a.yaw = Math.atan2(Math.sin(a.yaw), Math.cos(a.yaw));
    }
    let speed = kit.speed * (a.charging ? 0.2 : a.action ? 0.12 : 1),
      tx = dx * speed,
      tz = dz * speed,
      accel = n > 0.05 ? (a.air > 0 ? 6 : 13) : a.air > 0 ? 2 : 16;
    const mv = a.action?.move;
    if (mv) {
      // Moves carry their own footwork: lunges forward, and some can be steered (specials).
      let lunge = 0;
      for (const [t0, t1, v] of mv.lunge || [])
        if (a.action.time >= t0 && a.action.time < t1) lunge = v;
      // Lunges stop at the foe in front instead of running through it.
      if (lunge)
        for (const e of this.enemies)
          if (
            !e.dead &&
            Math.hypot(e.x - a.x, e.z - a.z) < e.r + 0.75 &&
            Math.abs(angleDiff(Math.atan2(e.x - a.x, e.z - a.z), a.yaw)) < 1.1
          ) {
            lunge = -1;
            break;
          }
      const blocked = lunge < 0;
      if (blocked) lunge = 0;
      tx = Math.sin(a.yaw) * lunge + (mv.steer ? dx * mv.steer : 0);
      tz = Math.cos(a.yaw) * lunge + (mv.steer ? dz * mv.steer : 0);
      accel = lunge || blocked ? 30 : a.air > 0 ? 2 : 14;
      if (a.air > 0 && !lunge && !blocked && !mv.steer) {
        tx = a.vx;
        tz = a.vz;
      }
    }
    if (a.action?.name === 'Dodge') {
      const t = a.action.time,
        v = 10.5 * (1 - clamp((t - 0.3) / 0.25, 0, 1) ** 2);
      tx = Math.sin(a.yaw) * v;
      tz = Math.cos(a.yaw) * v;
      accel = 40;
    }
    a.vx += (tx - a.vx) * (1 - Math.exp(-accel * dt));
    a.vz += (tz - a.vz) * (1 - Math.exp(-accel * dt));
    if (Math.hypot(a.vx, a.vz) < 0.03 && n < 0.05) a.vx = a.vz = 0;
    const ox = a.x,
      oz = a.z;
    this.world.move(a, a.vx * dt + a.kx * dt, a.vz * dt + a.kz * dt);
    // Bumping into a wall stops the push into it, so the hero doesn't keep "running" on the spot.
    const mx = (a.x - ox) / Math.max(dt, 1e-4) - a.kx,
      mz = (a.z - oz) / Math.max(dt, 1e-4) - a.kz;
    if (Math.abs(mx) < Math.abs(a.vx) * 0.5) a.vx = mx;
    if (Math.abs(mz) < Math.abs(a.vz) * 0.5) a.vz = mz;
    a.kx *= Math.exp(-8 * dt);
    a.kz *= Math.exp(-8 * dt);
    a.speed = Math.hypot(a.x - ox, a.z - oz) / Math.max(dt, 0.0001);
    a.moving = a.speed > 0.1;
    a.sprint = !a.action && a.air <= 0 && a.speed > kit.speed * 0.8 ? (a.sprint || 0) + dt : 0;
    this.stats.distance += a.speed * dt;
    const ground = this.world.height(a.x, a.z);
    if (a.air > 0) {
      a.vy -= 18 * dt;
      a.y += a.vy * dt;
      a.air = Math.max(0.001, a.y - ground);
      if (a.y <= ground) {
        a.y = ground;
        a.air = 0;
        a.vy = 0;
        a.airAttacked = false;
        // A jump attack ends when it touches down.
        if (a.action?.type === 'jump' && a.action.time > 0.15)
          a.action.time = Math.max(a.action.time, a.action.duration - 0.12);
      }
    } else a.y = ground;
    if (a.action) {
      const q = a.action;
      q.time += dt;
      if (q.impact !== null && !q.done && q.time >= q.impact) {
        q.done = true;
        this.impact(a, q);
      }
      if (q.move) this.runMove(a, q);
      if (a.action === q && a.buffer && q.move && q.type === 'normal' && q.time >= q.move.chain)
        this.followUp(a);
      else if (a.action === q && q.time >= q.duration) {
        a.action = null;
        a.animation = a.air > 0 ? 'Jump' : a.moving ? 'Run' : 'Idle';
        if (q.react && q.then) this.react(a, q.then.name, q.then.duration);
        if (q.move) {
          a.comboWindow = q.type === 'normal' ? 0.5 : 0;
          if (a.buffer) {
            const b = a.buffer;
            a.buffer = null;
            a.cooldown = 0;
            if (b === 'attack') this.attack();
          }
        }
      }
    } else if (!a.charging) a.animation = a.air > 0 ? 'Jump' : a.moving ? 'Run' : 'Idle';
    this.navAge += dt;
    if (this.navAge > 0.65) {
      this.navField = this.world.field(a.x, a.z);
      this.navAge = 0;
    }
    this.assistFriends(dt);
    let follower = 0;
    for (let i = 0; i < 3; i++) {
      if (i === this.selected) continue;
      const b = this.actors[i],
        side = follower++ === 0 ? -1 : 1;
      if (b.assist || b.engaging) continue;
      const dist = Math.hypot(a.x - b.x, a.z - b.z),
        goal = this.world.safe(
          a.x - Math.sin(a.yaw) * 2.8 + Math.cos(a.yaw) * side * 1.8,
          a.z - Math.cos(a.yaw) * 2.8 - Math.sin(a.yaw) * side * 1.8
        );
      goal.y = this.world.height(goal.x, goal.z);
      const near = dist < 5 && this.world.visible(b, goal),
        remaining = near ? Math.hypot(goal.x - b.x, goal.z - b.z) : dist;
      if (remaining > 0.3 && this.navField) {
        const angle = near
            ? Math.atan2(goal.x - b.x, goal.z - b.z)
            : this.world.direction(b, a, this.navField),
          x = b.x,
          z = b.z;
        this.world.move(
          b,
          Math.sin(angle) * Math.min(6, remaining * 2) * dt,
          Math.cos(angle) * Math.min(6, remaining * 2) * dt
        );
        b.speed = Math.hypot(b.x - x, b.z - z) / Math.max(dt, 0.001);
        b.moving = b.speed > 0.1;
        b.yaw = angle;
      } else b.speed = 0;
      b.y = this.world.height(b.x, b.z);
      b.animation = b.moving ? 'Run' : 'Idle';
    }
    // Keep friends from standing inside the hero or each other (models are ~1.5 m wide).
    for (let i = 0; i < 3; i++) {
      if (i === this.selected) continue;
      const b = this.actors[i];
      for (let j = 0; j < 3; j++) {
        if (j === i) continue;
        const o = this.actors[j],
          dx = b.x - o.x,
          dz = b.z - o.z,
          d = Math.hypot(dx, dz),
          gap = 1.6;
        if (d < gap) {
          const k = (gap - d) * Math.min(1, dt * 25),
            ux = d > 1e-4 ? dx / d : Math.sin(i * 2.1),
            uz = d > 1e-4 ? dz / d : Math.cos(i * 2.1);
          this.world.move(b, ux * k, uz * k);
          b.y = this.world.height(b.x, b.z);
        }
      }
    }
    for (const shot of this.shots) {
      shot.life -= dt;
      const steps = Math.max(1, Math.ceil((Math.hypot(shot.vx, shot.vz) * dt) / 0.15));
      for (let i = 0; i < steps && shot.life > 0; i++) {
        shot.x += (shot.vx * dt) / steps;
        shot.z += (shot.vz * dt) / steps;
        shot.y += (shot.vy * dt) / steps;
        shot.vy -= (7 * dt) / steps;
        let impact =
          shot.y - shot.r <= this.world.height(shot.x, shot.z) ||
          !this.world.clear(shot.x, shot.z, 0.05);
        for (const t of this.targets)
          if (
            Math.hypot(shot.x - t.x, shot.z - t.z) < shot.r + 0.45 &&
            Math.abs(shot.y - (t.y + 1)) < 1.2
          ) {
            t.hits++;
            t.last = this.time;
            this.stats.hits++;
            impact = true;
            this.emit('hit', { x: t.x, z: t.z, y: t.y + 1, power: 1 + shot.power });
          }
        // The packed snowball rolls through grunts (like the pixel game's rolling snowball) but stops on a boss.
        for (const e of this.enemies)
          if (
            !e.dead &&
            !shot.struck?.has(e) &&
            Math.hypot(shot.x - e.x, shot.z - e.z) < shot.r + e.r &&
            shot.y > e.y - 0.3 &&
            shot.y < e.y + (e.boss ? 3.5 : 1.8)
          ) {
            shot.struck?.add(e);
            this.damageFoe(e, shot.damage || 30, Math.atan2(shot.vx, shot.vz), 10, true);
            if (e.boss) impact = true;
          }
        if (impact) {
          shot.life = 0;
          this.emit('snowburst', { x: shot.x, z: shot.z, y: shot.y });
        }
      }
    }
    this.shots = this.shots.filter((s) => s.life > 0);
    for (const p of this.cookieSpots)
      if (
        !p.taken &&
        Math.hypot(a.x - p.x, a.z - p.z) < 0.8 &&
        Math.abs(a.y - this.world.height(p.x, p.z)) < 0.5
      ) {
        p.taken = true;
        this.gainCookie();
      }
    for (const p of this.pickups) {
      p.t += dt;
      if (
        p.t > 0.4 &&
        Math.hypot(a.x - p.x, a.z - p.z) < 1 &&
        Math.abs(a.y - this.world.height(p.x, p.z)) < 0.8
      ) {
        p.got = true;
        if (p.kind === 'cookie') this.gainCookie();
        else {
          a.energy = Math.min(100, a.energy + 30);
          this.emit('orb');
        }
      }
    }
    this.pickups = this.pickups.filter((p) => !p.got && p.t < 45);
    if (this.enemiesOn) {
      this.spawnFoes(dt);
      this.updateFoes(dt);
      this.updateFoeShots(dt);
    }
  }
  // Friends who aren't being played (Claude update 6): they pick a foe near the hero, walk over and
  // fight it with their own string (every fourth swing is a finisher), step out of a boss's marked
  // attack, and drop the fight to catch up when the hero moves on.
  assistFriends(dt) {
    const a = this.player;
    for (let i = 0; i < 3; i++) {
      if (i === this.selected) continue;
      const b = this.actors[i],
        set = this.moveset(i);
      b.engaging = false;
      if (b.assist) {
        const q = b.assist,
          m = q.move;
        q.time += dt;
        while (q.next < m.hits.length && q.time >= m.hits[q.next].t) {
          const h = m.hits[q.next++];
          this.strike(
            b,
            { ...h, dmg: Math.round(h.dmg * 0.8) },
            { kind: i, anim: m.anim, friend: true }
          );
        }
        if (q.time >= q.dur) {
          b.assist = null;
          b.animation = 'Idle';
        }
        continue;
      }
      if (b.down) continue;
      const out = this.escape(b);
      if (out !== null) {
        b.engaging = true;
        this.world.move(b, Math.sin(out) * 6 * dt, Math.cos(out) * 6 * dt);
        b.yaw = out;
        b.moving = true;
        b.animation = 'Run';
        b.y = this.world.height(b.x, b.z);
        continue;
      }
      let target = null,
        best = Infinity;
      for (const e of this.enemies) {
        if (e.dead || (e.boss && !e.active) || e.air > 0) continue;
        const d = Math.hypot(e.x - b.x, e.z - b.z) - e.r,
          fromHero = Math.hypot(e.x - a.x, e.z - a.z);
        if (d < best && d < 7 && fromHero < 8 && Math.abs(e.y - b.y) < 1.6) {
          best = d;
          target = e;
        }
      }
      if (!target || Math.hypot(a.x - b.x, a.z - b.z) > 9) continue;
      const k = b.combo || 0,
        m =
          k % 4 === 3 && set.charge[2] && set.charge[2].hits
            ? set.charge[2]
            : set.normal[k % set.normal.length],
        reach = Math.min(2.2, m.hits?.[0]?.r ?? 2) + target.r * 0.5,
        ang = Math.atan2(target.x - b.x, target.z - b.z);
      b.engaging = true;
      if (best > reach - target.r * 0.5) {
        // Walk over to the fight.
        const sp = Math.min(5.5, (best - reach + 1) * 4);
        this.world.move(b, Math.sin(ang) * sp * dt, Math.cos(ang) * sp * dt);
        b.yaw = ang;
        b.moving = true;
        b.speed = sp;
        b.animation = 'Run';
        b.y = this.world.height(b.x, b.z);
        continue;
      }
      b.speed = 0;
      b.moving = false;
      if (b.assistCd > 0 || !m.hits) continue;
      b.yaw = ang;
      b.assist = { time: 0, next: 0, move: m, dur: m.dur, target };
      b.assistCd = (i === 2 ? 0.7 : 0.5) + this.rand(0, 0.4);
      b.combo = k + 1;
      b.animation = m.anim;
    }
  }
  spawnFoes(dt) {
    const a = this.player,
      q = this.quest;
    if (q.chapter === 'firewood') {
      const sites = this.world.data.WOOD_SITES;
      for (let i = 0; i < 3; i++) {
        const s = sites[i],
          x = s.x * S,
          z = s.y * S;
        if (q.wood[i] || this.woodGuards[i] || Math.hypot(a.x - x, a.z - z) > 12.8) continue;
        this.woodGuards[i] = true;
        for (let k = 0; k < 3 + i; k++) {
          const ang = (k / (3 + i)) * TAU,
            e = this.makeFoe(
              k % 3 === 2 ? 'bale' : 'gopher',
              x + 3.2 + Math.sin(ang) * 3.2,
              z + Math.cos(ang) * 2.8
            );
          e.guard = { x, z };
          e.woodSite = i;
          this.enemies.push(e);
        }
        this.emit('banner', { title: s.name.toUpperCase(), text: 'Clear the fallen-wood pile' });
      }
      return;
    }
    // Rescue chapter: small groups wander in from the snow, but never near Mom's cottage. More arrive as clues are found; only a few during a boss fight.
    if (q.rescued) return;
    this.spawnTimer -= dt;
    if (this.spawnTimer > 0) return;
    this.spawnTimer = this.rand(2.5, 4);
    if (Math.hypot(a.x - HOME.x, a.z - HOME.z) < 22) return;
    const max = this.engaged ? 3 : Math.min(12, 6 + 2 * q.clues.filter(Boolean).length);
    let grunts = 0;
    for (const e of this.enemies) if (!e.boss && !e.dead && !e.guard) grunts++;
    if (grunts >= max) return;
    const type = ['gopher', 'gopher', 'gopher', 'crow', 'crow', 'bale'][
        Math.floor(this.random() * 6)
      ],
      count = Math.min(max - grunts, type === 'bale' ? 1 : 2 + Math.floor(this.random() * 2));
    for (let tries = 0; tries < 8; tries++) {
      const ang = this.rand(0, TAU),
        r = this.rand(18, 26),
        x = a.x + Math.sin(ang) * r,
        z = a.z + Math.cos(ang) * r;
      if (
        !this.world.clear(x, z, 1) ||
        Math.hypot(x - HOME.x, z - HOME.z) < 22 ||
        Math.abs(this.world.height(x, z) - a.y) > 4.5
      )
        continue;
      for (let k = 0; k < count; k++)
        this.enemies.push(this.makeFoe(type, x + this.rand(-1.5, 1.5), z + this.rand(-1.5, 1.5)));
      break;
    }
  }
  // Smarter grunts (Claude update 6): the nearest few press the attack while the rest circle in a
  // loose ring waiting their turn; they back off from a charging hero, the badly hurt run, crows
  // dive-bomb, hay bales roll-charge, and all of them step out of their boss's marked attack.
  planFoes() {
    const a = this.player,
      near = [];
    for (const e of this.enemies)
      if (!e.boss && !e.dead) {
        e.dist = Math.hypot(e.x - a.x, e.z - a.z);
        e.role = 'engage';
        if (e.dist < 14) near.push(e);
      }
    near.sort((p, q) => p.dist - q.dist);
    near.forEach((e, k) => (e.role = k < 4 ? 'engage' : 'wait'));
    // The boss's marked attack, if one is winding up: a circle (slam) or a lane (charge, swipe).
    const b = this.engaged;
    this.danger = null;
    if (b && !b.dead && b.state === 'wind') {
      if (b.move === 'slam') this.danger = { x: b.x, z: b.z, r: this.slamRadius(b) + 0.8 };
      else if (b.move === 'charge')
        this.danger = { x: b.x, z: b.z, dir: b.cdir, len: 14, w: b.r + 1.2 };
      else if (b.move === 'swipe') this.danger = { x: b.x, z: b.z, r: b.r + 4 };
    }
  }
  // Which way (if any) a foe or friend at p should step to get out of the marked attack.
  escape(p) {
    const z = this.danger;
    if (!z) return null;
    if (z.r) {
      const d = Math.hypot(p.x - z.x, p.z - z.z);
      return d < z.r ? Math.atan2(p.x - z.x, p.z - z.z) : null;
    }
    const dx = p.x - z.x,
      dz = p.z - z.z,
      along = dx * Math.sin(z.dir) + dz * Math.cos(z.dir),
      side = dx * Math.cos(z.dir) - dz * Math.sin(z.dir);
    if (along < -1 || along > z.len || Math.abs(side) > z.w) return null;
    return z.dir + (side >= 0 ? -Math.PI / 2 : Math.PI / 2);
  }
  updateFoes(dt) {
    const a = this.player;
    let winding = 0;
    for (const e of this.enemies) if (!e.boss && e.state === 'wind') winding++;
    this.planFoes();
    for (let i = 0; i < this.enemies.length; i++) {
      const e = this.enemies[i];
      e.t += dt;
      e.flash = Math.max(0, e.flash - dt);
      if (e.dead) {
        const f = e.fly;
        f.t += dt;
        e.x += f.vx * dt;
        e.z += f.vz * dt;
        e.y += f.vy * dt;
        f.vy -= 24 * dt;
        const g = this.world.height(e.x, e.z);
        if (e.y < g) {
          e.y = g;
          f.vy *= -0.3;
        }
        continue;
      }
      if (Math.abs(e.kx) + Math.abs(e.kz) > 0.01) {
        this.world.move(e, e.kx * dt, e.kz * dt);
        e.kx *= Math.exp(-8 * dt);
        e.kz *= Math.exp(-8 * dt);
      }
      const dx = a.x - e.x,
        dz = a.z - e.z,
        d = Math.hypot(dx, dz);
      e.moving = false;
      if (!e.boss && (e.air > 0 || e.state === 'air')) {
        e.vy -= 24 * dt;
        e.y += e.vy * dt;
        const g = this.world.height(e.x, e.z);
        if (e.y <= g) {
          e.y = g;
          e.air = 0;
          e.vy = 0;
          e.state = 'down';
          e.st = 0.55;
        } else e.air = e.y - g;
        continue;
      }
      if (e.boss) this.updateBoss(e, dt, dx, dz, d);
      else if (e.state === 'down') {
        e.st -= dt;
        if (e.st <= 0) e.state = 'idle';
      } else {
        if (e.state !== 'rec') e.yaw = Math.atan2(dx, dz);
        if (e.state === 'hurt') {
          e.st -= dt;
          if (e.st <= 0) e.state = 'idle';
        } else if (e.state === 'wind') {
          e.st -= dt;
          if (e.st <= 0) {
            e.state = 'rec';
            e.st = 0.4;
            if (d < e.r + 1.4 && Math.abs(a.y - e.y) < 1.2)
              this.hurtHero(e.dmg, Math.atan2(dx, dz));
          }
        } else if (e.state === 'rec') {
          e.st -= dt;
          if (e.st <= 0) e.state = 'idle';
        } else if (e.state === 'aim') {
          // Telegraph before a crow's dive or a bale's roll: it squats, glowing, locked on.
          e.st -= dt;
          e.cdir = Math.atan2(dx, dz);
          if (e.st <= 0) {
            e.state = 'dash';
            e.st = e.type === 'crow' ? 0.42 : 0.85;
            e.struck = false;
          }
        } else if (e.state === 'dash') {
          e.st -= dt;
          e.yaw = e.cdir;
          const sp = e.type === 'crow' ? 13 : 9.5,
            ox = e.x,
            oz = e.z;
          this.world.move(e, Math.sin(e.cdir) * sp * dt, Math.cos(e.cdir) * sp * dt);
          e.moving = true;
          if (!e.struck && d < e.r + 0.6 && Math.abs(a.y - e.y) < 1.2) {
            e.struck = true;
            this.hurtHero(e.dmg + 3, e.cdir);
          }
          if (e.st <= 0 || Math.hypot(e.x - ox, e.z - oz) < sp * dt * 0.25) {
            e.state = 'rec';
            e.st = 0.7;
            e.cd = this.rand(1.5, 2.6);
            e.special = this.rand(4, 7);
          }
        } else if (e.state === 'flee') {
          // Badly hurt: runs off for a moment, then comes back for more.
          e.st -= dt;
          const away = Math.atan2(-dx, -dz);
          this.world.move(
            e,
            Math.sin(away) * e.speed * 1.1 * dt,
            Math.cos(away) * e.speed * 1.1 * dt
          );
          e.yaw = away;
          e.moving = true;
          if (e.st <= 0) e.state = 'idle';
        } else {
          e.cd -= dt;
          e.special = (e.special ?? this.rand(2, 5)) - dt;
          const level = Math.abs(a.y - e.y) < 1.2,
            out = this.escape(e);
          // A hero's special leaves grunts too dazed to do anything clever.
          if (a.action?.type === 'special' && d < 8) continue;
          if (!e.fled && !e.guard && e.type !== 'bale' && e.hp < e.max * 0.25 && d < 6) {
            e.fled = true;
            e.state = 'flee';
            e.st = 1.6;
            continue;
          }
          if (out !== null) {
            this.world.move(
              e,
              Math.sin(out) * e.speed * 1.2 * dt,
              Math.cos(out) * e.speed * 1.2 * dt
            );
            e.yaw = out;
            e.moving = true;
            continue;
          }
          if (
            e.special <= 0 &&
            level &&
            e.role === 'engage' &&
            ((e.type === 'crow' && d > 2.5 && d < 7) || (e.type === 'bale' && d > 3.5 && d < 9)) &&
            this.world.visible(e, a)
          ) {
            e.state = 'aim';
            e.st = e.type === 'crow' ? 0.5 : 0.65;
            e.cdir = Math.atan2(dx, dz);
            this.emit('tell', { grunt: e.type });
            continue;
          }
          if (a.charging && d < 4.2 && e.state === 'idle') {
            // Wary of a charging hero: back off out of reach.
            const away = Math.atan2(-dx, -dz);
            this.world.move(
              e,
              Math.sin(away) * e.speed * 0.8 * dt,
              Math.cos(away) * e.speed * 0.8 * dt
            );
            e.moving = true;
            continue;
          }
          if (e.role === 'wait' && d < 9 && level) {
            // Circle at the edge of the fight, drifting round to a free spot.
            e.slotA = (e.slotA ?? this.rand(0, TAU)) + dt * 0.35 * (e.id % 2 ? 1 : -1);
            const gx = a.x + Math.sin(e.slotA) * 3.8,
              gz = a.z + Math.cos(e.slotA) * 3.8,
              gd = Math.hypot(gx - e.x, gz - e.z);
            if (gd > 0.4) {
              const ang = Math.atan2(gx - e.x, gz - e.z),
                sp = Math.min(e.speed * 0.75, gd * 3);
              this.world.move(e, Math.sin(ang) * sp * dt, Math.cos(ang) * sp * dt);
              e.moving = true;
            }
            continue;
          }
          if (d < e.r + 0.9 && e.cd <= 0 && winding < 3 && Math.abs(a.y - e.y) < 1.2) {
            e.state = 'wind';
            e.st = 0.55;
            e.cd = this.rand(1.3, 2.4);
            winding++;
          } else {
            let goal = null;
            if (d < 28.8) {
              if (d > e.r + 0.7 || !level) goal = a;
            } else if (e.guard && Math.hypot(e.x - e.guard.x, e.z - e.guard.z) > 9.6)
              goal = e.guard;
            if (goal) {
              const angle =
                (goal === a && this.navField
                  ? this.world.direction(e, a, this.navField, level)
                  : Math.atan2(goal.x - e.x, goal.z - e.z)) +
                (e.type === 'crow' ? Math.sin(e.t * 3) * 0.6 : 0);
              this.world.move(e, Math.sin(angle) * e.speed * dt, Math.cos(angle) * e.speed * dt);
              e.moving = true;
            }
            if (!e.guard && d > 60) e.gone = true;
          }
        }
      }
      // Keep foes from piling into each other or into the hero.
      for (let k = 1; k <= 3 && this.enemies.length > 1; k++) {
        const o = this.enemies[(i + k) % this.enemies.length];
        if (o === e || o.dead) continue;
        const sx = e.x - o.x,
          sz = e.z - o.z,
          sd = Math.hypot(sx, sz),
          m = e.r + o.r;
        if (sd < m && sd > 1e-4) {
          const push = (m - sd) * 0.5;
          if (!e.boss) this.world.move(e, (sx / sd) * push, (sz / sd) * push);
          if (!o.boss) this.world.move(o, (-sx / sd) * push, (-sz / sd) * push);
        }
      }
      if (d < e.r + 0.45 && d > 1e-4) {
        const push = e.r + 0.45 - d;
        if (e.boss) {
          this.world.move(a, (dx / d) * push, (dz / d) * push);
          a.y = a.air > 0 ? a.y : this.world.height(a.x, a.z);
        } else this.world.move(e, (-dx / d) * push, (-dz / d) * push);
      }
      for (const b of this.actors) {
        if (b === a) continue;
        const fx = b.x - e.x,
          fz = b.z - e.z,
          fd = Math.hypot(fx, fz);
        if (fd < e.r + 0.5 && fd > 1e-4) {
          this.world.move(b, (fx / fd) * (e.r + 0.5 - fd), (fz / fd) * (e.r + 0.5 - fd));
          b.y = this.world.height(b.x, b.z);
        }
      }
      e.y = this.world.height(e.x, e.z);
    }
    this.enemies = this.enemies.filter(
      (e) => !(e.dead && e.fly.t > (e.boss ? 1.6 : 0.9)) && !e.gone
    );
    if (this.engaged && (this.engaged.dead || !this.enemies.includes(this.engaged)))
      this.engaged = null;
    if (!this.engaged)
      this.engaged = this.enemies.find((e) => e.boss && e.active && !e.dead) || null;
  }
  // Port of the pixel game's updateOfficer: every boss attack has a visible wind-up (state 'wind') before it lands.
  updateBoss(e, dt, dx, dz, d) {
    const a = this.player,
      baron = e.type === 'baron',
      dm = baron ? 1.3 : 1,
      reach = Math.abs(a.y - e.y) < 2;
    if (!e.active) {
      if (d < 19.2 && !this.engaged && reach) this.engage(e);
      return;
    }
    // Running far away calms the boss down; it goes home and heals.
    if (d > 45) {
      this.resetBoss(e);
      if (this.engaged === e) this.engaged = null;
      return;
    }
    // A boss stranded on a ledge it can't leave hops back to its camp instead of waiting forever.
    e.stranded = reach ? 0 : (e.stranded || 0) + dt;
    if (e.stranded > 5) {
      const p = this.world.safe(e.home.x, e.home.z);
      Object.assign(e, p, { y: this.world.height(p.x, p.z), state: 'idle', st: 0, stranded: 0 });
      return;
    }
    e.st -= dt;
    // How long the hero has stood their ground near this boss (standing still or guarding).
    e.planted =
      d < 9 && (a.speed || 0) < 0.6
        ? (e.planted || 0) + dt
        : Math.max(0, (e.planted || 0) - dt * 2);
    if (e.state !== 'charge') e.yaw = Math.atan2(dx, dz);
    switch (e.state) {
      case 'hurt':
        if (e.st <= 0) e.state = 'idle';
        break;
      case 'idle': {
        e.cd -= dt;
        if (d > e.r + 2 || !reach) {
          const angle = this.navField
            ? this.world.direction(e, a, this.navField, reach)
            : Math.atan2(dx, dz);
          this.world.move(e, Math.sin(angle) * e.speed * dt, Math.cos(angle) * e.speed * dt);
          e.moving = true;
        }
        if (e.cd <= 0 && d < 24.8 && (reach || d > 8)) {
          const m = this.chooseBossMove(e, d, reach);
          const enraged = e.hp < e.max * 0.5;
          e.move = m;
          e.state = 'wind';
          // Phase two: faster wind-ups (still always shown) and less rest between attacks.
          e.windMax = e.st = MOVE_WIND[m] * (enraged ? 0.8 : 1);
          e.cd = this.rand(1.1, 2) * (baron ? 0.75 : 1) * (enraged ? 0.7 : 1);
          e.cdir = Math.atan2(dx, dz);
          e.last = m;
          this.emit('tell', { boss: e.type, move: m });
        }
        break;
      }
      case 'wind':
        if (e.move === 'charge' || e.move === 'swipe') e.cdir = Math.atan2(dx, dz);
        if (e.st <= 0) {
          const m = e.move;
          if (m === 'swipe') {
            if (reach && d < e.r + 3.4 && Math.abs(angleDiff(Math.atan2(dx, dz), e.cdir)) < 1.2)
              this.hurtHero(Math.round(10 * dm), e.cdir);
            e.state = 'rec';
            e.st = 0.45;
          } else if (m === 'slam') {
            const R = this.slamRadius(e);
            if (d < R && reach) this.hurtHero(Math.round(16 * dm), Math.atan2(dx, dz));
            this.emit('slam', { x: e.x, z: e.z, y: e.y + 0.1, r: R });
            e.state = 'rec';
            e.st = 0.8;
          } else if (m === 'charge') {
            e.state = 'charge';
            e.st = baron ? 0.9 : 0.8;
          } else if (m === 'thorns') {
            const n = baron ? 18 : 12,
              off = this.rand(0, TAU);
            for (let i = 0; i < n; i++) this.foeShot(e, off + (i / n) * TAU, 10, 'thorn', 2.6);
            e.state = 'rec';
            e.st = 0.6;
          } else if (m === 'eggs') {
            for (let i = -2; i <= 2; i++) this.foeShot(e, e.cdir + i * 0.22, 12.8, 'egg', 2.2);
            e.state = 'rec';
            e.st = 0.6;
          }
        }
        break;
      case 'charge': {
        const sp = baron ? 16 : 17,
          x = e.x,
          z = e.z;
        this.world.move(e, Math.sin(e.cdir) * sp * dt, Math.cos(e.cdir) * sp * dt);
        e.moving = true;
        if (d < e.r + 0.9 && reach) this.hurtHero(Math.round(14 * dm), e.cdir);
        if (e.st <= 0 || Math.hypot(e.x - x, e.z - z) < sp * dt * 0.25) {
          e.state = 'rec';
          e.st = 0.8;
        }
        break;
      }
      case 'rec':
        if (e.st <= 0) {
          e.state = 'idle';
          // Enraged bosses often go straight into a second attack.
          if (e.hp < e.max * 0.5 && !e.chained && this.random() < 0.45) {
            e.cd = 0;
            e.chained = true;
          } else e.chained = false;
        }
        break;
    }
    if (!e.enraged && e.hp < e.max * 0.5 && !e.dead) {
      e.enraged = true;
      this.emit('banner', {
        title: e.name.toUpperCase() + ' IS FURIOUS',
        text: 'Faster attacks: watch the warnings!',
      });
    }
  }
  // Picks a boss's next attack from where the hero is and how they've been fighting: close heroes get
  // swiped, heroes who plant themselves (standing still or charging) get slammed or shot at, far
  // ones get charged; the same move rarely comes twice in a row.
  chooseBossMove(e, d, reach) {
    const a = this.player,
      moves = [...new Set(BOSSES[e.type].moves)],
      planted = (e.planted || 0) > 1.4 || a.charging,
      w = {};
    for (const m of moves) {
      let k = 1;
      if (m === 'swipe') k = d < e.r + 3.2 ? 3 : d < e.r + 4.8 ? 1 : 0;
      if (m === 'slam')
        k = d < this.slamRadius(e) - 0.5 ? (planted ? 3.5 : 1.6) : d < 10.4 ? 0.4 : 0;
      if (m === 'charge') k = d > 7 ? 3 : d > 4 ? 1.2 : 0.3;
      if (m === 'thorns') k = planted ? 2.5 : d > 5 ? 1.6 : 0.8;
      if (m === 'eggs') k = d > 5 ? (planted ? 3 : 2) : 0.6;
      if (!reach && m !== 'thorns' && m !== 'eggs' && m !== 'charge') k *= 0.2;
      if (m === e.last) k *= 0.25;
      w[m] = k;
    }
    let total = 0;
    for (const m of moves) total += w[m];
    if (total <= 0) return moves[0];
    let r = this.random() * total;
    for (const m of moves) if ((r -= w[m]) <= 0) return m;
    return moves[moves.length - 1];
  }
  slamRadius(e) {
    return e.type === 'baron' ? 7.6 : 6.4;
  }
  foeShot(e, angle, speed, kind, life) {
    this.foeShots.push({
      x: e.x + Math.sin(angle) * e.r,
      z: e.z + Math.cos(angle) * e.r,
      y: e.y + 1.2,
      vx: Math.sin(angle) * speed,
      vz: Math.cos(angle) * speed,
      r: kind === 'egg' ? 0.36 : 0.32,
      dmg: 7,
      life,
      kind,
    });
  }
  updateFoeShots(dt) {
    const a = this.player;
    for (const s of this.foeShots) {
      s.life -= dt;
      s.x += s.vx * dt;
      s.z += s.vz * dt;
      if (!this.world.clear(s.x, s.z, 0.05) || this.world.height(s.x, s.z) > s.y) {
        s.life = 0;
        continue;
      }
      if (Math.hypot(a.x - s.x, a.z - s.z) < s.r + 0.45 && Math.abs(a.y + 1 - s.y) < 1.3) {
        if (this.hurtHero(s.dmg, Math.atan2(s.vx, s.vz))) s.life = 0;
      }
    }
    this.foeShots = this.foeShots.filter((s) => s.life > 0);
  }
}
