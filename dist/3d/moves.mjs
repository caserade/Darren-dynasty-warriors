// Movesets for the 3D heroes (Claude update 6). Pure data, shared by the simulation (sim.mjs)
// and the animation library (clips.mjs) so hit frames and key poses always line up.
//
// Dynasty Warriors style: Attack builds the normal string (N1, N2, ...). Pressing Charge right
// after hit N gives that hero's finisher C(N+1). Holding Charge from neutral is C1, the hold-and-
// release power move. Attack in the air is the jump attack; Attack after a sprint is the dash
// attack. Special spends a full Special meter.
//
// Move fields (seconds and metres):
//   anim   clip name          dur   length of the move
//   chain  time from which a buffered next input fires (the cancel point)
//   hits   [{ t, r, arc, dmg, kb, off, launch, down, pull, belly, ring }]
//          r reach, arc width in radians, off pushes the hit centre forward,
//          launch knocks grunts up (m/s), down knocks them over, pull drags them in,
//          belly adds damage per Darren belly stage, ring draws a shock ring of that radius
//   shots  [{ t, spread, speed, dmg, r }] snowballs thrown forward
//   lunge  [[t0, t1, speed]] forward travel     hop  { t, vy } small jump
//   pulse  { from, to, every, r, dmg, kb, shots } repeated hits (specials)
//   inv    [t0, t1] untouchable      armor  shrugs off staggers    steer  move while attacking
//   parry  (moveset) { dur, window, counter }: dodge from standing blocks hits, then counters
const TAU = Math.PI * 2;

// ---- Darren · Bare Paws: a quick, bouncy brawler who fights with paws, tail and wings ----
const PAWS = {
  name: 'Bare Paws',
  normal: [
    {
      anim: 'PawN1',
      dur: 0.38,
      chain: 0.2,
      lunge: [[0, 0.14, 3.6]],
      hits: [{ t: 0.12, r: 1.9, arc: 1.7, dmg: 14, kb: 3 }],
    },
    {
      anim: 'PawN2',
      dur: 0.42,
      chain: 0.23,
      lunge: [[0, 0.16, 3.6]],
      hits: [{ t: 0.14, r: 2, arc: 1.8, dmg: 16, kb: 4 }],
    },
    {
      anim: 'PawN3',
      dur: 0.52,
      chain: 0.3,
      lunge: [[0.04, 0.22, 4.5]],
      hits: [{ t: 0.2, r: 2.2, arc: 1.9, dmg: 20, kb: 7 }],
    },
    {
      anim: 'PawN4',
      dur: 0.6,
      chain: 0.4,
      hits: [
        { t: 0.2, r: 2.5, arc: TAU, dmg: 12, kb: 5 },
        { t: 0.33, r: 2.5, arc: TAU, dmg: 12, kb: 6 },
      ],
    },
    {
      anim: 'PawN5',
      dur: 0.56,
      chain: 0.36,
      lunge: [[0.08, 0.24, 3]],
      hits: [{ t: 0.22, r: 2.4, arc: 2.2, dmg: 22, kb: 11 }],
    },
    {
      anim: 'PawN6',
      dur: 0.86,
      chain: 0.7,
      lunge: [[0.08, 0.46, 3.4]],
      hop: { t: 0.1, vy: 5.5 },
      hits: [
        { t: 0.5, r: 2.8, arc: 2.6, dmg: 30, kb: 12, off: 0.6, down: true, belly: 4, ring: 2.6 },
      ],
    },
  ],
  // charge[0] is the hold move (C1); charge[n] follows normal hit n.
  charge: [
    null,
    {
      anim: 'PawC2',
      dur: 0.64,
      lunge: [[0, 0.18, 3]],
      hits: [{ t: 0.2, r: 2.1, arc: 1.8, dmg: 18, kb: 2, launch: 9 }],
    },
    {
      anim: 'PawC3',
      dur: 0.72,
      hits: [{ t: 0.24, r: 2.8, arc: TAU, dmg: 20, kb: 4, down: true, ring: 2.8 }],
    },
    {
      anim: 'PawC4',
      dur: 0.86,
      shots: [
        { t: 0.2, spread: -0.22, speed: 17, dmg: 14, r: 0.22 },
        { t: 0.36, spread: 0.22, speed: 17, dmg: 14, r: 0.22 },
        { t: 0.52, spread: 0, speed: 19, dmg: 18, r: 0.28 },
      ],
    },
    { anim: 'PawC5', dur: 0.8, hits: [{ t: 0.34, r: 4.8, arc: 1.5, dmg: 16, kb: 18, ring: 0 }] },
    {
      anim: 'PawC6',
      dur: 1.2,
      lunge: [[0.12, 0.8, 3.4]],
      hop: { t: 0.12, vy: 6.6 },
      // Lands at about 0.85 s (6.6 m/s up against 18 m/s² gravity).
      hits: [{ t: 0.84, r: 3.4, arc: TAU, dmg: 30, kb: 12, down: true, belly: 6, ring: 3.4 }],
    },
  ],
  jump: {
    anim: 'PawJump',
    dur: 0.5,
    dive: -5,
    hits: [
      { t: 0.14, r: 2.2, arc: TAU, dmg: 12, kb: 5 },
      { t: 0.3, r: 2.2, arc: TAU, dmg: 12, kb: 7 },
    ],
  },
  dash: {
    anim: 'PawDash',
    dur: 0.62,
    lunge: [[0, 0.4, 8]],
    hits: [{ t: 0.2, r: 2, arc: 1.6, dmg: 20, kb: 10, down: true }],
  },
  special: {
    anim: 'PawSpecial',
    name: 'SCARF-STAR BLIZZARD',
    dur: 2.4,
    inv: [0, 2.4],
    steer: 1.6,
    pulse: { from: 0.3, to: 2.05, every: 0.18, r: 3, dmg: 8, kb: 6, shots: 8 },
    hits: [{ t: 2.15, r: 5, arc: TAU, dmg: 30, kb: 14, down: true, ring: 5 }],
  },
};

// ---- Darren · Polka Scarf: his yellow scarf with pink dots as a long whip; reach and flow ----
const SCARF = {
  name: 'Polka Scarf',
  scarf: true,
  normal: [
    {
      anim: 'ScarfN1',
      dur: 0.44,
      chain: 0.26,
      lunge: [[0, 0.12, 2.4]],
      hits: [{ t: 0.15, r: 3, arc: 2.2, dmg: 12, kb: 4 }],
    },
    {
      anim: 'ScarfN2',
      dur: 0.44,
      chain: 0.26,
      lunge: [[0, 0.12, 2.4]],
      hits: [{ t: 0.15, r: 3, arc: 2.2, dmg: 12, kb: 4 }],
    },
    {
      anim: 'ScarfN3',
      dur: 0.56,
      chain: 0.34,
      lunge: [[0.05, 0.2, 2.4]],
      hits: [{ t: 0.25, r: 3.4, arc: 1, dmg: 18, kb: 7, ring: 1.2, off: 1.6 }],
    },
    {
      anim: 'ScarfN4',
      dur: 0.7,
      chain: 0.48,
      hits: [
        { t: 0.2, r: 2.8, arc: TAU, dmg: 8, kb: 3 },
        { t: 0.32, r: 2.8, arc: TAU, dmg: 8, kb: 3 },
        { t: 0.44, r: 2.8, arc: TAU, dmg: 9, kb: 5 },
      ],
    },
    {
      anim: 'ScarfN5',
      dur: 0.7,
      chain: 0.5,
      lunge: [[0.1, 0.4, 2]],
      hits: [
        { t: 0.18, r: 3.2, arc: 2.4, dmg: 12, kb: 4 },
        { t: 0.42, r: 3.2, arc: 2.4, dmg: 14, kb: 6 },
      ],
    },
    {
      anim: 'ScarfN6',
      dur: 0.96,
      chain: 0.82,
      hop: { t: 0.14, vy: 5 },
      hits: [
        { t: 0.24, r: 3, arc: TAU, dmg: 9, kb: 3 },
        { t: 0.38, r: 3, arc: TAU, dmg: 9, kb: 3 },
        { t: 0.52, r: 3, arc: TAU, dmg: 9, kb: 3 },
        { t: 0.7, r: 3.2, arc: TAU, dmg: 22, kb: 6, launch: 8, ring: 3.2 },
      ],
    },
  ],
  charge: [
    // C1: hold to charge the Polka Snare, a long lash that drags foes in (built from this when released).
    {
      anim: 'ScarfSnare',
      dur: 0.95,
      hits: [{ t: 0.38, r: 4, arc: 0.7, dmg: 20, kb: 0, pull: 10 }],
    },
    { anim: 'ScarfC2', dur: 0.64, hits: [{ t: 0.22, r: 3, arc: 1.4, dmg: 18, kb: 2, launch: 9 }] },
    {
      anim: 'ScarfC3',
      dur: 1,
      steer: 3.5,
      pulse: { from: 0.15, to: 0.8, every: 0.13, r: 2.7, dmg: 6, kb: 3 },
    },
    {
      anim: 'ScarfC4',
      dur: 0.86,
      hits: [
        { t: 0.22, r: 4.6, arc: 0.9, dmg: 10, kb: 0, pull: 9 },
        { t: 0.56, r: 2, arc: 1.6, dmg: 24, kb: 10, down: true },
      ],
    },
    {
      anim: 'ScarfC5',
      dur: 1,
      hits: [
        { t: 0.2, r: 3.2, arc: TAU, dmg: 14, kb: 6 },
        { t: 0.45, r: 3.2, arc: TAU, dmg: 14, kb: 6 },
        { t: 0.7, r: 3.4, arc: TAU, dmg: 16, kb: 9, ring: 3.4 },
      ],
    },
    {
      anim: 'ScarfC6',
      dur: 1.06,
      hits: [{ t: 0.56, r: 6.5, arc: 0.55, dmg: 38, kb: 14, down: true, line: true }],
    },
  ],
  jump: {
    anim: 'ScarfJump',
    dur: 0.56,
    dive: -6,
    hits: [
      { t: 0.15, r: 2.8, arc: TAU, dmg: 11, kb: 4 },
      { t: 0.32, r: 2.8, arc: TAU, dmg: 11, kb: 6 },
    ],
  },
  dash: {
    anim: 'ScarfDash',
    dur: 0.62,
    lunge: [[0, 0.35, 7.5]],
    hits: [{ t: 0.22, r: 3, arc: 1.8, dmg: 16, kb: 8 }],
  },
  special: {
    anim: 'ScarfSpecial',
    name: 'POLKA CYCLONE',
    dur: 2.6,
    inv: [0, 2.6],
    steer: 2,
    pulse: { from: 0.25, to: 2.25, every: 0.15, r: 6, dmg: 6, kb: 0, pull: 4 },
    hits: [{ t: 2.4, r: 5, arc: TAU, dmg: 34, kb: 14, down: true, ring: 5 }],
  },
};

// ---- Tormund · Sword and Shield: a steady knight; reach with the blade, the shield to bully ----
// The sword is in his left paw and the shield on his right. Holding Charge from neutral keeps his
// Crescent cleave power move (ChargeAttack in sim.mjs).
const TORMUND = {
  name: 'Sword and Shield',
  // Dodge while standing still: shield up; a hit from the front inside the window is blocked and
  // answered with the counter-cut.
  parry: {
    dur: 0.5,
    window: 0.32,
    counter: {
      anim: 'TorCounter',
      dur: 0.55,
      lunge: [[0, 0.12, 3]],
      hits: [{ t: 0.14, r: 2.6, arc: 2.6, dmg: 30, kb: 10, down: true }],
    },
  },
  normal: [
    {
      anim: 'TorN1',
      dur: 0.5,
      chain: 0.28,
      lunge: [[0, 0.16, 3.4]],
      hits: [{ t: 0.17, r: 2.4, arc: 2.2, dmg: 18, kb: 4 }],
    },
    {
      anim: 'TorN2',
      dur: 0.5,
      chain: 0.28,
      lunge: [[0, 0.15, 3.2]],
      hits: [{ t: 0.16, r: 2.4, arc: 2.4, dmg: 18, kb: 5 }],
    },
    {
      anim: 'TorN3',
      dur: 0.56,
      chain: 0.34,
      lunge: [[0.04, 0.2, 5]],
      hits: [{ t: 0.19, r: 1.9, arc: 1.5, dmg: 20, kb: 10 }],
    },
    {
      anim: 'TorN4',
      dur: 0.58,
      chain: 0.36,
      lunge: [[0.06, 0.24, 4.5]],
      hits: [{ t: 0.22, r: 3, arc: 0.8, dmg: 26, kb: 7, off: 0.4 }],
    },
    {
      anim: 'TorN5',
      dur: 0.86,
      chain: 0.72,
      lunge: [[0.05, 0.3, 2.5]],
      hits: [{ t: 0.32, r: 2.9, arc: TAU, dmg: 30, kb: 12, down: true, ring: 2.9 }],
    },
  ],
  charge: [
    null,
    {
      anim: 'TorC2',
      dur: 0.8,
      armor: true,
      lunge: [[0.1, 0.5, 8.5]],
      hits: [
        { t: 0.22, r: 1.8, arc: 1.6, dmg: 12, kb: 9 },
        { t: 0.36, r: 1.8, arc: 1.6, dmg: 12, kb: 9 },
        { t: 0.5, r: 2, arc: 1.8, dmg: 16, kb: 14, down: true },
      ],
    },
    {
      anim: 'TorC3',
      dur: 0.7,
      lunge: [[0, 0.16, 3]],
      hits: [{ t: 0.22, r: 2.5, arc: 1.8, dmg: 22, kb: 2, launch: 10 }],
    },
    {
      anim: 'TorC4',
      dur: 0.92,
      armor: true,
      lunge: [[0.2, 0.42, 3]],
      hits: [{ t: 0.46, r: 2.6, arc: 1.2, dmg: 44, kb: 10, down: true, ring: 2.2, off: 0.8 }],
    },
    {
      anim: 'TorC5',
      dur: 0.8,
      hits: [
        { t: 0.26, r: 3.2, arc: TAU, dmg: 18, kb: 6, down: true },
        { t: 0.42, r: 3.2, arc: TAU, dmg: 18, kb: 9, ring: 3.2 },
      ],
    },
    {
      anim: 'TorC6',
      dur: 1.15,
      armor: true,
      lunge: [[0.12, 0.62, 4]],
      hop: { t: 0.12, vy: 7 },
      // Lands at about 0.9 s.
      hits: [{ t: 0.88, r: 3.6, arc: TAU, dmg: 42, kb: 14, down: true, ring: 3.6 }],
    },
  ],
  jump: {
    anim: 'TorJump',
    dur: 0.6,
    dive: -14,
    hits: [{ t: 0.3, r: 2.6, arc: TAU, dmg: 26, kb: 9, down: true, ring: 2.6 }],
  },
  dash: {
    anim: 'TorDash',
    dur: 0.62,
    armor: true,
    lunge: [[0, 0.4, 9]],
    hits: [{ t: 0.18, r: 1.9, arc: 1.6, dmg: 22, kb: 13, down: true }],
  },
  special: {
    anim: 'TorSpecial',
    name: 'GOLDEN CRESCENT',
    dur: 2.4,
    inv: [0, 2.4],
    steer: 1.2,
    pulse: { from: 0.3, to: 1.7, every: 0.2, r: 3.4, dmg: 10, kb: 5 },
    hits: [{ t: 2.05, r: 6.5, arc: 1.4, dmg: 46, kb: 16, down: true, ring: 6 }],
  },
};

// Bucky keeps his first three-hit string until his own passes.
const legacy = (dmg, clipPrefix = 'Attack') => ({
  name: 'Standard',
  normal: [
    {
      anim: clipPrefix + '1',
      dur: 0.55,
      chain: 0.4,
      hits: [{ t: 0.24, r: 2.1, arc: Math.PI * 1.4, dmg: dmg[0], kb: 4 }],
    },
    {
      anim: clipPrefix + '2',
      dur: 0.65,
      chain: 0.48,
      hits: [{ t: 0.3, r: 2.1, arc: Math.PI * 1.4, dmg: dmg[1], kb: 4 }],
    },
    {
      anim: clipPrefix + '3',
      dur: 0.9,
      chain: 0.75,
      hits: [{ t: 0.43, r: 2.1, arc: Math.PI * 1.4, dmg: dmg[2], kb: 8 }],
    },
  ],
  charge: [null],
});

export const MOVESETS = {
  paws: PAWS,
  scarf: SCARF,
  tormund: TORMUND,
  bucky: legacy([20, 22, 34]),
};
// Which moveset a hero uses (Darren's depends on his chosen weapon style).
export function movesetKey(hero, style = 'paws') {
  return hero === 0 ? style : hero === 1 ? 'tormund' : 'bucky';
}
