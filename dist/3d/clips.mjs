// Hand-authored animation library for Darren, Tormund and Bucky (Claude update 6).
// Every clip is built from key poses (see anim.mjs for the pose format) when the game loads.
import { makeClip, mix, mirror } from './anim.mjs';
import { MOVESETS } from './moves.mjs';

const { sin, cos, PI } = Math,
  TAU = PI * 2,
  S = (p, k = 1) => sin(p * TAU * k),
  C = (p, k = 1) => cos(p * TAU * k),
  lerp = (a, b, t) => a + (b - a) * t,
  smooth = (t) => t * t * (3 - 2 * t),
  clamp01 = (t) => Math.max(0, Math.min(1, t));
// A tail made of n bones waves with each bone a little behind the one before it.
function tailWave(n, p, yaw, pitch = 0, lag = 0.12, base = 0, roles = 'tail') {
  const out = {};
  for (let i = 1; i <= n; i++)
    out[roles + i] = [base + pitch * S(p - i * lag), yaw * S(p - i * lag + 0.25), 0];
  return out;
}
const seq = (...poses) => poses.reduce((a, b) => mix(a, b), {});

// ======================= DARREN =======================
// Short one-bone legs and arms, big head, wings and a five-bone tail.
const D_STANCE = {
  spine: [4, 0, 0],
  head: [-4, 0, 0],
  armL: { aim: [0.45, -1, 0.18] },
  armR: { aim: [-0.45, -1, 0.18] },
  handL: { aim: [0.25, -1, 0.4] },
  handR: { aim: [-0.25, -1, 0.4] },
  wingL: { aim: [0.6, 0.55, -0.65] },
  wingR: { aim: [-0.6, 0.55, -0.65] },
  tail1: [-6, 0, 0],
};
const D_ARMS = (l, r) => ({
  armL: { aim: l[0] },
  handL: { aim: l[1] || l[0] },
  armR: { aim: r[0] },
  handR: { aim: r[1] || r[0] },
});
// A tucked forward roll; u runs 0..1 over the roll.
function darrenRoll(u0) {
  const p = u0 * 0.8,
    u = smooth(u0),
    th = TAU * u,
    tuck = sin(PI * clamp01(p / 0.86)) ** 0.5,
    cy = lerp(0.78, 0.68, tuck) + 0.1 * sin(PI * u),
    oy = 0.3,
    oz = 0.2;
  // Spin about the middle of the curled-up body, not the hip joint, so he rolls over the ground.
  return seq({
    hips: {
      r: [360 * u, 0, 0],
      p: [0, cy - (oy * cos(th) - oz * sin(th)) - 0.48, oz - (oy * sin(th) + oz * cos(th))],
    },
    spine: [45 * tuck, 0, 0],
    head: [40 * tuck, 0, 0],
    legL: [-105 * tuck, 0, 10 * tuck],
    legR: [-105 * tuck, 0, -10 * tuck],
    footL: [50 * tuck, 0, 0],
    footR: [50 * tuck, 0, 0],
    armL: { aim: [lerp(0.45, 0.15, tuck), lerp(-1, -0.5, tuck), lerp(0.18, 1, tuck)] },
    armR: { aim: [lerp(-0.45, -0.15, tuck), lerp(-1, -0.5, tuck), lerp(0.18, 1, tuck)] },
    handL: { aim: [lerp(0.25, -0.4, tuck), lerp(-1, -0.8, tuck), lerp(0.4, 0.4, tuck)] },
    handR: { aim: [lerp(-0.25, 0.4, tuck), lerp(-1, -0.8, tuck), lerp(0.4, 0.4, tuck)] },
    wingL: { aim: [lerp(0.6, 0.2, tuck), lerp(0.55, 0.1, tuck), -0.95] },
    wingR: { aim: [lerp(-0.6, -0.2, tuck), lerp(0.55, 0.1, tuck), -0.95] },
    tail1: [30 * tuck, 0, 0],
    tail2: [35 * tuck, 0, 0],
    tail3: [35 * tuck, 0, 0],
    tail4: [30 * tuck, 0, 0],
  });
}
function darrenLocomotion() {
  return {
    Idle: {
      dur: 2.4,
      loop: true,
      fn: (p) =>
        seq(
          {
            hips: { p: [0, -0.008 + 0.008 * S(p), 0] },
            spine: [1.5 * S(p), 2 * S(p, 1) * 0, 0],
            head: [-1.5 * S(p - 0.1), 3 * S(p * 0.5 + 0.1), 2 * S(p * 0.5)],
            armL: { aim: [0.45 + 0.04 * S(p), -1, 0.18 + 0.05 * S(p - 0.15)] },
            armR: { aim: [-0.45 - 0.04 * S(p), -1, 0.18 + 0.05 * S(p - 0.15)] },
            wingL: { aim: [0.6 + 0.05 * S(p, 2), 0.55 + 0.08 * S(p), -0.65] },
            wingR: { aim: [-0.6 - 0.05 * S(p, 2), 0.55 + 0.08 * S(p), -0.65] },
            wingtipL: [0, 0, 4 * S(p - 0.1)],
            wingtipR: [0, 0, -4 * S(p - 0.1)],
          },
          tailWave(5, p, 9, 2, 0.08)
        ),
    },
    // One step per half cycle; one-bone legs swing like pendulums, so the hips rise as a leg passes under.
    Walk: {
      dur: 0.62,
      loop: true,
      fn: (p) => {
        const s = S(p),
          c = C(p, 2);
        return seq(
          {
            hips: { r: [3, 7 * s, 3 * s], p: [0.015 * s, 0.025 * -c, 0] },
            spine: [2, -10 * s, -2 * s],
            head: [-2, 5 * s, 0],
            legL: [-28 * s, 0, 2],
            legR: [28 * s, 0, -2],
            footL: [18 * s + 10 * Math.max(0, C(p - 0.1)), 0, 0],
            footR: [-18 * s + 10 * Math.max(0, -C(p - 0.1)), 0, 0],
            armL: { aim: [0.4, -1, 0.15 + 0.55 * s] },
            armR: { aim: [-0.4, -1, 0.15 - 0.55 * s] },
            wingL: { aim: [0.6, 0.55 + 0.05 * c, -0.65] },
            wingR: { aim: [-0.6, 0.55 + 0.05 * c, -0.65] },
          },
          tailWave(5, p, 12, 3, 0.1)
        );
      },
    },
    // A bouncy bounding run: a moment in the air each step, wings flick back, arms pump.
    Run: {
      dur: 0.4,
      loop: true,
      fn: (p) => {
        const s = S(p),
          b = Math.abs(S(p - 0.08 * 0)) ** 0.8,
          c = C(p, 2);
        return seq(
          {
            hips: { r: [14, 10 * s, 4 * s], p: [0, -0.03 + 0.09 * b, 0] },
            spine: [6 - 3 * c, -14 * s, -3 * s],
            head: [-14 + 3 * c, 7 * s, 0],
            legL: [-48 * s, 0, 3],
            legR: [48 * s, 0, -3],
            footL: [25 * s + 25 * Math.max(0, -S(p + 0.2)), 0, 0],
            footR: [-25 * s + 25 * Math.max(0, S(p + 0.2)), 0, 0],
            armL: { aim: [0.35, -0.7, 0.2 + 0.9 * s] },
            handL: { aim: [0.15, -0.2 + 0.6 * Math.max(0, s), 1] },
            armR: { aim: [-0.35, -0.7, 0.2 - 0.9 * s] },
            handR: { aim: [-0.15, -0.2 + 0.6 * Math.max(0, -s), 1] },
            wingL: { aim: [0.55, 0.45 + 0.15 * c, -0.85] },
            wingR: { aim: [-0.55, 0.45 + 0.15 * c, -0.85] },
            wingtipL: [0, 0, 10 * c],
            wingtipR: [0, 0, -10 * c],
          },
          tailWave(5, p, 10, 6, 0.1, 6)
        );
      },
    },
    JumpUp: {
      dur: 0.35,
      keys: [
        [
          0,
          {
            hips: { p: [0, -0.12, 0] },
            spine: [16, 0, 0],
            legL: [-20, 0, 0],
            legR: [-20, 0, 0],
            ...D_ARMS([[0.5, -0.6, -0.6]], [[-0.5, -0.6, -0.6]]),
            wingL: { aim: [0.9, 0.9, -0.3] },
            wingR: { aim: [-0.9, 0.9, -0.3] },
          },
        ],
        [
          0.12,
          {
            hips: { p: [0, 0.04, 0] },
            spine: [-8, 0, 0],
            head: [-12, 0, 0],
            legL: [8, 0, 0],
            legR: [14, 0, 0],
            footL: [30, 0, 0],
            footR: [30, 0, 0],
            ...D_ARMS([[0.5, 0.9, 0.3]], [[-0.5, 0.9, 0.3]]),
            wingL: { aim: [0.8, -0.3, -0.4] },
            wingR: { aim: [-0.8, -0.3, -0.4] },
          },
          0.8,
        ],
        [
          0.35,
          {
            spine: [-4, 0, 0],
            head: [-8, 0, 0],
            legL: [-30, 0, 0],
            legR: [-12, 0, 0],
            footL: [10, 0, 0],
            ...D_ARMS([[0.7, 0.5, 0.2]], [[-0.7, 0.5, 0.2]]),
            wingL: { aim: [0.7, 0.8, -0.3] },
            wingR: { aim: [-0.7, 0.8, -0.3] },
            tail1: [-15, 0, 0],
            tail2: [-10, 0, 0],
          },
        ],
      ],
    },
    // Falling: little wing flutters slow him down a touch.
    Fall: {
      dur: 0.5,
      loop: true,
      fn: (p) =>
        seq(
          {
            spine: [-2, 0, 0],
            head: [4, 0, 0],
            legL: [-22 + 4 * S(p), 0, 4],
            legR: [-14 - 4 * S(p), 0, -4],
            footL: [-10, 0, 0],
            ...D_ARMS([[0.85, 0.15 + 0.1 * S(p), 0.15]], [[-0.85, 0.15 + 0.1 * S(p), 0.15]]),
            wingL: { aim: [0.85, 0.45 + 0.45 * S(p), -0.35] },
            wingR: { aim: [-0.85, 0.45 + 0.45 * S(p), -0.35] },
            wingtipL: [0, 0, 18 * S(p - 0.1)],
            wingtipR: [0, 0, -18 * S(p - 0.1)],
          },
          tailWave(5, p, 6, 8, 0.1, -10)
        ),
    },
    Land: {
      dur: 0.36,
      keys: [
        [
          0,
          {
            legL: [-18, 0, 4],
            legR: [-10, 0, -4],
            ...D_ARMS([[0.8, 0.2, 0.2]], [[-0.8, 0.2, 0.2]]),
          },
        ],
        [
          0.06,
          {
            hips: { p: [0, -0.11, 0.02] },
            spine: [18, 0, 0],
            head: [-10, 0, 0],
            legL: [-8, 0, 12],
            legR: [-8, 0, -12],
            footL: [8, 0, 0],
            footR: [8, 0, 0],
            ...D_ARMS([[0.7, -0.6, 0.5]], [[-0.7, -0.6, 0.5]]),
            wingL: { aim: [0.9, 0.2, -0.4] },
            wingR: { aim: [-0.9, 0.2, -0.4] },
            tail1: [8, 0, 0],
          },
          0.3,
        ],
        [0.36, {}],
      ],
    },
    // Dodge: a tucked forward roll (DW-style evade). Invincible for the first 0.45 s in the simulation.
    Dodge: { dur: 0.55, fn: (p) => darrenRoll(clamp01(p / 0.8)) },
    HurtF: {
      dur: 0.42,
      keys: [
        [0, {}],
        [
          0.07,
          {
            hips: { r: [-10, 0, 0], p: [0, -0.02, -0.05] },
            spine: [-22, 8, 0],
            head: [-18, -10, 6],
            ...D_ARMS([[0.7, -0.2, 0.6]], [[-0.7, 0.1, 0.6]]),
            wingL: { aim: [0.9, 0.7, 0.1] },
            wingR: { aim: [-0.9, 0.7, 0.1] },
            tail1: [15, 0, 0],
          },
          0.2,
        ],
        [0.42, {}],
      ],
    },
    HurtB: {
      dur: 0.42,
      keys: [
        [0, {}],
        [
          0.07,
          {
            hips: { r: [12, 0, 0], p: [0, -0.02, 0.05] },
            spine: [20, -6, 0],
            head: [16, 8, -4],
            ...D_ARMS([[0.8, -0.4, -0.4]], [[-0.8, -0.2, -0.4]]),
            wingL: { aim: [0.9, 0.8, -0.2] },
            wingR: { aim: [-0.9, 0.8, -0.2] },
            tail1: [20, 0, 0],
            tail2: [15, 0, 0],
          },
          0.2,
        ],
        [0.42, {}],
      ],
    },
    // Knocked flat on his back, a little bounce, then lying still.
    Knockdown: {
      dur: 0.8,
      keys: [
        [0, {}],
        [
          0.12,
          {
            hips: { r: [-35, 0, 0], p: [0, 0.12, -0.1] },
            tail1: [30, 0, 0],
            spine: [-15, 0, 0],
            head: [-15, 0, 0],
            legL: [-40, 0, 10],
            legR: [-30, 0, -10],
            ...D_ARMS([[0.9, 0.5, 0.3]], [[-0.9, 0.5, 0.3]]),
            wingL: { aim: [0.9, 0.6, 0.2] },
            wingR: { aim: [-0.9, 0.6, 0.2] },
          },
          0.6,
        ],
        [
          0.36,
          {
            hips: { r: [-85, 0, 0], p: [0, -0.22, -0.35] },
            tail1: [65, 0, 0],
            spine: [-5, 0, 0],
            head: [10, 0, 0],
            legL: [-45, 0, 12],
            legR: [-30, 0, -12],
            ...D_ARMS([[1, 0.2, 0.1]], [[-1, 0.2, 0.1]]),
            wingL: { aim: [0.9, -0.1, -0.3] },
            wingR: { aim: [-0.9, -0.1, -0.3] },
          },
          0.2,
        ],
        [
          0.5,
          {
            hips: { r: [-78, 0, 0], p: [0, -0.16, -0.38] },
            tail1: [60, 0, 0],
            legL: [-55, 0, 12],
            legR: [-40, 0, -12],
            head: [5, 0, 0],
          },
          0.4,
        ],
        [
          0.8,
          {
            hips: { r: [-86, 0, 0], p: [0, -0.25, -0.4] },
            tail1: [70, 0, 0],
            tail2: [10, 0, 0],
            spine: [-2, 0, 0],
            head: [12, 0, 6],
            legL: [-20, 0, 14],
            legR: [-14, 0, -14],
            ...D_ARMS([[1, 0.05, 0.1]], [[-1, 0.05, 0.1]]),
            wingL: { aim: [0.95, -0.2, -0.3] },
            wingR: { aim: [-0.95, -0.2, -0.3] },
          },
        ],
      ],
    },
    // Lying knocked out; used for resting friends (dizzy head wobble).
    Down: {
      dur: 1.6,
      loop: true,
      fn: (p) => ({
        hips: { r: [-86, 0, 0], p: [0, -0.25 + 0.006 * S(p), -0.4] },
        tail1: [70, 0, 0],
        tail2: [10, 8 * S(p), 0],
        spine: [-2 + 2 * S(p), 0, 0],
        head: [12, 10 * S(p), 6],
        legL: [-20, 0, 14],
        legR: [-14, 0, -14],
        ...D_ARMS([[1, 0.05, 0.1]], [[-1, 0.05, 0.1]]),
        wingL: { aim: [0.95, -0.2, -0.3] },
        wingR: { aim: [-0.95, -0.2, -0.3] },
      }),
    },
    GetUp: {
      dur: 0.7,
      keys: [
        [
          0,
          {
            hips: { r: [-86, 0, 0], p: [0, -0.25, -0.4] },
            tail1: [70, 0, 0],
            tail2: [10, 0, 0],
            spine: [-2, 0, 0],
            head: [12, 0, 6],
            legL: [-20, 0, 14],
            legR: [-14, 0, -14],
            ...D_ARMS([[1, 0.05, 0.1]], [[-1, 0.05, 0.1]]),
            wingL: { aim: [0.95, -0.2, -0.3] },
            wingR: { aim: [-0.95, -0.2, -0.3] },
          },
        ],
        [
          0.25,
          {
            hips: { r: [-30, 0, 0], p: [0, -0.2, -0.1] },
            tail1: [25, 0, 0],
            spine: [40, 0, 0],
            head: [-10, 0, 0],
            legL: [-70, 0, 10],
            legR: [-60, 0, -10],
            footL: [50, 0, 0],
            footR: [50, 0, 0],
            ...D_ARMS([[0.6, -0.6, -0.4]], [[-0.6, -0.6, -0.4]]),
          },
          0.6,
        ],
        [
          0.45,
          {
            hips: { r: [8, 0, 0], p: [0, -0.1, 0] },
            spine: [20, 0, 0],
            legL: [-10, 0, 8],
            legR: [-6, 0, -8],
            ...D_ARMS([[0.7, -0.5, 0.3]], [[-0.7, -0.5, 0.3]]),
            wingL: { aim: [0.9, 0.7, -0.3] },
            wingR: { aim: [-0.9, 0.7, -0.3] },
          },
          0.5,
        ],
        [0.7, {}],
      ],
    },
    // Gathering power: crouched, paws cupped low in front, a little shiver.
    Charge: {
      dur: 0.5,
      loop: true,
      fn: (p) => ({
        hips: { r: [6, 0, 0], p: [0.006 * S(p, 3), -0.07, 0] },
        spine: [16 + 1.5 * S(p, 2), 0, 0],
        head: [-10, 0, 0],
        legL: [-12, 0, 10],
        legR: [-12, 0, -10],
        footL: [12, 0, 0],
        footR: [12, 0, 0],
        armL: { aim: [0.2, -0.7, 0.7] },
        handL: { aim: [-0.5, -0.3, 0.8] },
        armR: { aim: [-0.2, -0.7, 0.7] },
        handR: { aim: [0.5, -0.3, 0.8] },
        wingL: { aim: [0.8, 0.75 + 0.1 * S(p, 2), -0.35] },
        wingR: { aim: [-0.8, 0.75 + 0.1 * S(p, 2), -0.35] },
        wingtipL: [0, 0, 6 * S(p, 3)],
        wingtipR: [0, 0, -6 * S(p, 3)],
        tail1: [10, 6 * S(p), 0],
        tail2: [10, 6 * S(p - 0.1), 0],
        tail3: [5, 6 * S(p - 0.2), 0],
      }),
    },
    // Released packed snowball: big overhand throw with the right paw (impact at 0.42 s).
    ChargeAttack: {
      dur: 1.05,
      keys: [
        [
          0,
          {
            hips: { r: [6, 0, 0], p: [0, -0.07, 0] },
            spine: [16, 0, 0],
            ...D_ARMS(
              [
                [0.2, -0.7, 0.7],
                [-0.5, -0.3, 0.8],
              ],
              [
                [-0.2, -0.7, 0.7],
                [0.5, -0.3, 0.8],
              ]
            ),
          },
        ],
        [
          0.24,
          {
            hips: { r: [0, -35, 0], p: [0, -0.02, -0.04] },
            spine: [-14, -30, 6],
            head: [-6, 40, 0],
            legL: [-25, 0, 6],
            legR: [20, 0, -6],
            ...D_ARMS(
              [[0.7, 0.2, 0.7]],
              [
                [-0.4, 0.6, -0.8],
                [0, 1, -0.4],
              ]
            ),
            wingL: { aim: [0.9, 0.7, -0.2] },
            wingR: { aim: [-0.9, 0.7, -0.2] },
            tail1: [-10, 20, 0],
          },
          0.4,
        ],
        [
          0.42,
          {
            hips: { r: [12, 25, 0], p: [0, -0.06, 0.08] },
            spine: [24, 30, -4],
            head: [-14, -20, 0],
            legL: [-35, 0, 6],
            legR: [25, 0, -6],
            footR: [-20, 0, 0],
            ...D_ARMS(
              [[0.6, -0.8, -0.3]],
              [
                [-0.1, 0.1, 1],
                [0, -0.2, 1],
              ]
            ),
            wingL: { aim: [0.7, 0.4, -0.7] },
            wingR: { aim: [-0.7, 0.4, -0.7] },
            tail1: [10, -20, 0],
            tail2: [5, -15, 0],
          },
          1,
        ],
        [
          0.62,
          {
            hips: { r: [10, 20, 0], p: [0, -0.05, 0.06] },
            spine: [18, 18, -4],
            head: [-10, -10, 0],
            legL: [-30, 0, 6],
            legR: [22, 0, -6],
            ...D_ARMS([[0.6, -0.8, -0.2]], [[0.2, -0.7, 0.6]]),
          },
          0.3,
        ],
        [1.05, {}],
      ],
    },
    Interact: {
      dur: 1.1,
      keys: [
        [0, {}],
        [
          0.3,
          {
            hips: { r: [10, 0, 0], p: [0, -0.1, 0] },
            spine: [30, 0, 0],
            head: [10, 0, 0],
            legL: [-15, 0, 8],
            legR: [-10, 0, -8],
            ...D_ARMS(
              [
                [0.2, -0.7, 0.8],
                [0.1, -0.9, 0.5],
              ],
              [
                [-0.2, -0.7, 0.8],
                [-0.1, -0.9, 0.5],
              ]
            ),
          },
          0.4,
        ],
        [
          0.55,
          {
            hips: { r: [8, 0, 0], p: [0, -0.1, 0] },
            spine: [26, 0, 0],
            head: [6, 8, 6],
            ...D_ARMS(
              [
                [0.2, -0.6, 0.8],
                [0.1, -0.8, 0.6],
              ],
              [
                [-0.2, -0.6, 0.8],
                [-0.1, -0.8, 0.6],
              ]
            ),
          },
          0.4,
        ],
        [
          0.85,
          {
            spine: [-4, 0, 0],
            head: [-14, -6, -4],
            ...D_ARMS(
              [
                [0.2, 0.1, 1],
                [0, 0.4, 0.9],
              ],
              [
                [-0.2, 0.1, 1],
                [0, 0.4, 0.9],
              ]
            ),
            wingL: { aim: [0.8, 0.8, -0.3] },
            wingR: { aim: [-0.8, 0.8, -0.3] },
          },
          0.4,
        ],
        [1.1, {}],
      ],
    },
    // Two happy hops, paws up, wings flapping and tail wagging.
    Celebrate: {
      dur: 1.8,
      fn: (p) => {
        const hop = Math.max(0, S(p * 2 - 0.05)) ** 1.2,
          e = Math.min(1, p * 8, (1 - p) * 6);
        return seq(
          {
            hips: {
              r: [-6 * e, 0, 6 * S(p, 2) * e],
              p: [0, 0.22 * hop * e - 0.04 * e * (1 - hop), 0],
            },
            spine: [-8 * e, 0, 0],
            head: [-14 * e, 12 * S(p, 2) * e, 0],
            legL: [-25 * hop * e, 0, 6 * e],
            legR: [-15 * hop * e, 0, -6 * e],
            footL: [20 * hop * e, 0, 0],
            footR: [20 * hop * e, 0, 0],
            armL: { aim: [lerp(0.45, 0.5, e), lerp(-1, 1, e), lerp(0.18, 0.2 + 0.2 * S(p, 4), e)] },
            armR: {
              aim: [lerp(-0.45, -0.5, e), lerp(-1, 1, e), lerp(0.18, 0.2 - 0.2 * S(p, 4), e)],
            },
            handL: { aim: [lerp(0.25, 0.3, e), lerp(-1, 1, e), lerp(0.4, 0.3, e)] },
            handR: { aim: [lerp(-0.25, -0.3, e), lerp(-1, 1, e), lerp(0.4, 0.3, e)] },
            wingL: { aim: [0.6 + 0.3 * e, 0.55 + 0.4 * S(p, 6) * e, -0.65 + 0.3 * e] },
            wingR: { aim: [-0.6 - 0.3 * e, 0.55 + 0.4 * S(p, 6) * e, -0.65 + 0.3 * e] },
            wingtipL: [0, 0, 20 * S(p * 6 - 0.15) * e],
            wingtipR: [0, 0, -20 * S(p * 6 - 0.15) * e],
          },
          tailWave(5, p * 5, 22 * e, 4 * e, 0.08, 6 * e)
        );
      },
    },
  };
}

// ---- Darren · Bare Paws attacks (timed to moves.mjs) ----
// Fighting guard: weight low, left paw forward, right paw cocked by the chin.
const D_GUARD = {
  hips: { r: [4, -18, 0], p: [0, -0.05, 0] },
  spine: [8, 12, 0],
  head: [-8, 6, 0],
  legL: [-18, 0, 5],
  legR: [14, 0, -5],
  footL: [12, 0, 0],
  footR: [-6, 0, 0],
  armL: { aim: [0.35, -0.35, 0.85] },
  handL: { aim: [0.05, 0.3, 1] },
  armR: { aim: [-0.5, -0.55, 0.55] },
  handR: { aim: [0.1, 0.45, 1] },
  wingL: { aim: [0.75, 0.6, -0.45] },
  wingR: { aim: [-0.75, 0.6, -0.45] },
  tail1: [4, 10, 0],
};
const G = (p = {}) => mix(D_GUARD, p);
// Turns a whole pose about the vertical by deg: the hips yaw, and every aimed limb swings round with
// them (aims are in character space, so without this the arms would stay put while the body spun).
function spinPose(pose, deg) {
  const a = deg * (PI / 180),
    c = cos(a),
    s = sin(a),
    out = mix(pose, { hips: { r: [0, deg, 0] } });
  for (const v of Object.values(out))
    if (v?.aim) v.aim = [v.aim[0] * c + v.aim[2] * s, v.aim[1], -v.aim[0] * s + v.aim[2] * c];
  return out;
}
function spinKeys(t0, t1, turns, pose, ease = smooth) {
  return (p, t) => {
    const u = ease(clamp01((t - t0) / (t1 - t0)));
    return spinPose(pose(u, t), -360 * turns * u);
  };
}
function darrenPaws() {
  const M = MOVESETS.paws,
    N = M.normal,
    Cc = M.charge;
  return {
    // Jab with the left paw, stepping in.
    PawN1: {
      dur: N[0].dur,
      keys: [
        [0, G()],
        [
          0.06,
          G({
            hips: { r: [0, 6, 0] },
            spine: [0, 8, 0],
            armL: { aim: [0.45, -0.3, 0.6] },
            handL: { aim: [0.1, 0.4, 0.9] },
          }),
          0.7,
        ],
        [
          0.12,
          G({
            hips: { r: [6, -10, 0], p: [0, -0.02, 0.06] },
            spine: [8, -26, 0],
            head: [-6, 16, 0],
            legL: [-30, 0, 5],
            legR: [22, 0, -5],
            armL: { aim: [0.02, 0.08, 1] },
            handL: { aim: [0, 0.05, 1] },
            tail1: [4, 28, 0],
          }),
          0.2,
        ],
        [
          0.22,
          G({
            hips: { r: [5, -12, 0], p: [0, -0.03, 0.05] },
            spine: [8, -20, 0],
            legL: [-28, 0, 5],
            legR: [20, 0, -5],
            armL: { aim: [0.1, 0.0, 1] },
            handL: { aim: [0, 0.1, 1] },
            tail1: [4, 20, 0],
          }),
          0.5,
        ],
        [N[0].dur, G()],
      ],
    },
    // Right cross: hips and shoulders whip round.
    PawN2: {
      dur: N[1].dur,
      keys: [
        [0, G({ armL: { aim: [0.1, 0.0, 1] } })],
        [
          0.07,
          G({
            hips: { r: [0, -26, 0] },
            spine: [6, -10, 0],
            armR: { aim: [-0.6, -0.4, 0.2] },
            handR: { aim: [-0.1, 0.5, 1] },
          }),
          0.7,
        ],
        [
          0.14,
          G({
            hips: { r: [8, 22, 0], p: [0, -0.04, 0.08] },
            spine: [10, 34, 0],
            head: [-6, -24, 0],
            legL: [-26, 0, 5],
            legR: [28, 0, -5],
            footR: [-25, 0, 0],
            armR: { aim: [-0.02, 0.08, 1] },
            handR: { aim: [0, 0.05, 1] },
            armL: { aim: [0.5, -0.6, 0.2] },
            handL: { aim: [0.1, 0.3, 1] },
            tail1: [4, -30, 0],
            tail2: [0, -15, 0],
          }),
          0.2,
        ],
        [
          0.25,
          G({
            hips: { r: [6, 18, 0], p: [0, -0.04, 0.07] },
            spine: [8, 28, 0],
            legL: [-24, 0, 5],
            legR: [24, 0, -5],
            armR: { aim: [-0.08, 0, 1] },
            handR: { aim: [0, 0.1, 1] },
            tail1: [4, -20, 0],
          }),
          0.5,
        ],
        [N[1].dur, G()],
      ],
    },
    // Hop kick with the left foot.
    PawN3: {
      dur: N[2].dur,
      keys: [
        [0, G({ armR: { aim: [-0.08, 0, 1] } })],
        [
          0.08,
          G({
            hips: { r: [10, 0, 0], p: [0, -0.1, 0] },
            spine: [16, 0, 0],
            legL: [-10, 0, 6],
            legR: [-6, 0, -6],
            ...D_ARMS([[0.6, -0.5, 0.4]], [[-0.6, -0.5, 0.4]]),
          }),
          0.6,
        ],
        [
          0.2,
          G({
            hips: { r: [-22, 0, 0], p: [0, 0.14, 0.05] },
            spine: [-12, 0, 0],
            head: [10, 0, 0],
            legL: [-95, 0, 4],
            footL: [-30, 0, 0],
            legR: [25, 0, -4],
            footR: [20, 0, 0],
            ...D_ARMS([[0.95, 0.2, -0.3]], [[-0.95, 0.2, -0.3]]),
            wingL: { aim: [0.95, 0.55, -0.1] },
            wingR: { aim: [-0.95, 0.55, -0.1] },
            tail1: [-25, 0, 0],
            tail2: [-15, 0, 0],
          }),
          0.3,
        ],
        [
          0.32,
          G({
            hips: { r: [-10, 0, 0], p: [0, 0.04, 0.05] },
            spine: [-4, 0, 0],
            legL: [-55, 0, 4],
            footL: [-10, 0, 0],
            legR: [15, 0, -4],
            ...D_ARMS([[0.9, 0, -0.1]], [[-0.9, 0, -0.1]]),
          }),
          0.5,
        ],
        [
          0.4,
          G({
            hips: { p: [0, -0.09, 0.05] },
            spine: [14, 0, 0],
            legL: [-20, 0, 6],
            legR: [10, 0, -6],
          }),
          0.4,
        ],
        [N[2].dur, G()],
      ],
    },
    // Full spin: the tail whips round twice-hitting everything nearby.
    PawN4: {
      dur: N[3].dur,
      fn: spinKeys(0.08, 0.44, 1, (u, t) => {
        const e = sin(PI * clamp01((t - 0.03) / 0.5));
        return G({
          hips: { r: [6 * e, 18, 0], p: [0, -0.08 * e, 0] },
          spine: [10 * e, 18, -8 * e],
          head: [0, -20 * e, 0],
          legL: [-10, 0, 14 * e],
          legR: [10, 0, -14 * e],
          armL: { aim: [0.9, 0.2 * e, 0.3] },
          armR: { aim: [-0.9, 0.2 * e, -0.2] },
          wingL: { aim: [0.9, 0.7, -0.2] },
          wingR: { aim: [-0.9, 0.7, -0.2] },
          tail1: [12 * e, 30 * e, 0],
          tail2: [6 * e, 10 * e, 0],
          tail3: [0, -5 * e, 0],
          tail4: [0, -20 * e, 0],
        });
      }),
    },
    // Wing buffet: both paws shove forward as the wings clap in front.
    PawN5: {
      dur: N[4].dur,
      keys: [
        [0, G()],
        [
          0.12,
          G({
            hips: { r: [-6, 0, 0], p: [0, -0.04, -0.03] },
            spine: [-14, 0, 0],
            head: [-6, 0, 0],
            ...D_ARMS(
              [
                [0.7, -0.2, -0.3],
                [0.3, 0.6, 0.5],
              ],
              [
                [-0.7, -0.2, -0.3],
                [-0.3, 0.6, 0.5],
              ]
            ),
            wingL: { aim: [0.8, 0.5, -0.8] },
            wingR: { aim: [-0.8, 0.5, -0.8] },
            wingtipL: [0, 0, 20],
            wingtipR: [0, 0, -20],
          }),
          0.6,
        ],
        [
          0.22,
          G({
            hips: { r: [14, 0, 0], p: [0, -0.06, 0.1] },
            spine: [22, 0, 0],
            head: [-18, 0, 0],
            legL: [-30, 0, 6],
            legR: [24, 0, -6],
            ...D_ARMS(
              [
                [0.2, 0.15, 1],
                [0, 0.6, 0.8],
              ],
              [
                [-0.2, 0.15, 1],
                [0, 0.6, 0.8],
              ]
            ),
            wingL: { aim: [0.75, 0.3, 0.75] },
            wingR: { aim: [-0.75, 0.3, 0.75] },
            wingtipL: [0, 0, -15],
            wingtipR: [0, 0, 15],
            tail1: [20, 0, 0],
            tail2: [10, 0, 0],
          }),
          0.2,
        ],
        [
          0.34,
          G({
            hips: { r: [10, 0, 0], p: [0, -0.05, 0.08] },
            spine: [16, 0, 0],
            legL: [-26, 0, 6],
            legR: [20, 0, -6],
            ...D_ARMS([[0.3, 0.05, 1]], [[-0.3, 0.05, 1]]),
            wingL: { aim: [0.85, 0.4, 0.4] },
            wingR: { aim: [-0.85, 0.4, 0.4] },
          }),
          0.5,
        ],
        [N[4].dur, G()],
      ],
    },
    // Somersault tail slam: flips forward and brings the tail crashing down in front.
    PawN6: {
      dur: N[5].dur,
      fn: (p, t) => {
        const crouch =
            1 -
            smooth(clamp01(t / 0.1)) +
            smooth(clamp01((t - 0.62) / 0.08)) * (1 - smooth(clamp01((t - 0.72) / 0.14))),
          flip = smooth(clamp01((t - 0.12) / 0.34)),
          tuck = sin(PI * flip),
          th = TAU * flip,
          slam = smooth(clamp01((t - 0.38) / 0.12)),
          over = sin(PI * clamp01((t - 0.3) / 0.25)) * (1 - slam);
        return G({
          hips: {
            r: [360 * flip, 0, 0],
            p: [0, -0.1 * crouch + (0.3 - 0.3 * cos(th)) * 0.5, -0.25 * sin(th)],
          },
          spine: [40 * tuck + 14 * slam * (1 - smooth(clamp01((t - 0.6) / 0.2))), 0, 0],
          head: [30 * tuck, 0, 0],
          legL: [-90 * tuck - 10 * crouch, 0, 8],
          legR: [-90 * tuck - 10 * crouch, 0, -8],
          footL: [40 * tuck, 0, 0],
          footR: [40 * tuck, 0, 0],
          ...D_ARMS(
            [[lerp(0.6, 0.2, tuck), lerp(-0.4, -0.3, tuck), lerp(0.4, 1, tuck)]],
            [[lerp(-0.6, -0.2, tuck), lerp(-0.4, -0.3, tuck), lerp(0.4, 1, tuck)]]
          ),
          wingL: { aim: [0.9, 0.7 - 0.6 * tuck, -0.4] },
          wingR: { aim: [-0.9, 0.7 - 0.6 * tuck, -0.4] },
          tail1: [60 * over - 25 * slam + 30 * tuck, 0, 0],
          tail2: [45 * over - 20 * slam + 30 * tuck, 0, 0],
          tail3: [30 * over - 10 * slam + 20 * tuck, 0, 0],
          tail4: [20 * over, 0, 0],
        });
      },
    },
    // C2 wing uppercut: crouch, then explode upward with the right paw while the wings beat down.
    PawC2: {
      dur: Cc[1].dur,
      keys: [
        [0, G()],
        [
          0.1,
          G({
            hips: { r: [16, -20, 0], p: [0, -0.14, 0] },
            spine: [24, -16, 0],
            head: [-14, 10, 0],
            legL: [-24, 0, 10],
            legR: [14, 0, -10],
            footL: [20, 0, 0],
            armR: { aim: [-0.5, -0.9, 0.2] },
            handR: { aim: [0, -0.3, 1] },
            wingL: { aim: [0.9, 0.9, -0.2] },
            wingR: { aim: [-0.9, 0.9, -0.2] },
          }),
          0.6,
        ],
        [
          0.2,
          G({
            hips: { r: [-10, 24, 0], p: [0, 0.16, 0.06] },
            spine: [-18, 26, 0],
            head: [-26, -10, 0],
            legL: [-5, 0, 4],
            legR: [20, 0, -4],
            footL: [30, 0, 0],
            footR: [30, 0, 0],
            armR: { aim: [-0.05, 1, 0.3] },
            handR: { aim: [0, 1, 0.15] },
            armL: { aim: [0.7, -0.6, 0.1] },
            wingL: { aim: [0.8, -0.4, -0.4] },
            wingR: { aim: [-0.8, -0.4, -0.4] },
            wingtipL: [0, 0, -25],
            wingtipR: [0, 0, 25],
            tail1: [-20, 0, 0],
            tail2: [-15, 0, 0],
          }),
          0.3,
        ],
        [
          0.36,
          G({
            hips: { r: [-6, 18, 0], p: [0, 0.08, 0.05] },
            spine: [-10, 20, 0],
            head: [-20, -6, 0],
            armR: { aim: [-0.1, 0.95, 0.3] },
            handR: { aim: [0, 1, 0.3] },
            wingL: { aim: [0.9, 0.5, -0.4] },
            wingR: { aim: [-0.9, 0.5, -0.4] },
          }),
          0.5,
        ],
        [0.5, G({ hips: { p: [0, -0.08, 0.04] }, spine: [14, 0, 0] }), 0.4],
        [Cc[1].dur, G()],
      ],
    },
    // C3 tail-sweep trip: drops low and spins with the tail flat along the snow.
    PawC3: {
      dur: Cc[2].dur,
      fn: spinKeys(0.06, 0.42, 1, (u, t) => {
        const e = sin(PI * clamp01(t / 0.62)) ** 0.6;
        return G({
          hips: { r: [18 * e, 0, 0], p: [0, -0.17 * e, 0] },
          spine: [28 * e, 0, 0],
          head: [-22 * e, 0, 0],
          legL: [-40 * e, 0, 18 * e],
          legR: [20 * e, 0, -18 * e],
          footL: [30 * e, 0, 0],
          ...D_ARMS([[0.7, -0.75, 0.3]], [[-0.7, -0.75, 0.3]]),
          tail1: [-14 * e, 25 * e, 0],
          tail2: [-6 * e, 12 * e, 0],
          tail3: [0, 0, 0],
          wingL: { aim: [0.95, 0.45, -0.2] },
          wingR: { aim: [-0.95, 0.45, -0.2] },
        });
      }),
    },
    // C4 snowball volley: left throw, right throw, then a big two-paw heave.
    PawC4: {
      dur: Cc[3].dur,
      keys: [
        [0, G()],
        [
          0.1,
          G({
            hips: { r: [0, 20, 0] },
            spine: [-10, 20, 0],
            armL: { aim: [0.5, 0.6, -0.8] },
            handL: { aim: [0.1, 1, -0.3] },
          }),
          0.5,
        ],
        [
          0.2,
          G({
            hips: { r: [8, -16, 0], p: [0, -0.04, 0.05] },
            spine: [16, -26, 0],
            legL: [-24, 0, 5],
            legR: [18, 0, -5],
            armL: { aim: [0.05, 0.25, 1] },
            handL: { aim: [0, -0.2, 1] },
            armR: { aim: [-0.5, 0.5, -0.7] },
            handR: { aim: [-0.1, 1, -0.3] },
          }),
          0.4,
        ],
        [
          0.36,
          G({
            hips: { r: [8, 20, 0], p: [0, -0.04, 0.06] },
            spine: [16, 28, 0],
            legL: [-20, 0, 5],
            legR: [22, 0, -5],
            armR: { aim: [-0.05, 0.25, 1] },
            handR: { aim: [0, -0.2, 1] },
            armL: { aim: [0.5, 0.6, -0.6] },
            handL: { aim: [0.1, 1, -0.2] },
          }),
          0.4,
        ],
        [
          0.44,
          G({
            hips: { r: [-8, 0, 0], p: [0, 0, -0.02] },
            spine: [-22, 0, 0],
            head: [-10, 0, 0],
            ...D_ARMS(
              [
                [0.3, 0.9, -0.4],
                [0, 1, -0.3],
              ],
              [
                [-0.3, 0.9, -0.4],
                [0, 1, -0.3],
              ]
            ),
            wingL: { aim: [0.9, 0.8, -0.2] },
            wingR: { aim: [-0.9, 0.8, -0.2] },
          }),
          0.5,
        ],
        [
          0.52,
          G({
            hips: { r: [16, 0, 0], p: [0, -0.07, 0.08] },
            spine: [26, 0, 0],
            head: [-18, 0, 0],
            legL: [-26, 0, 6],
            legR: [22, 0, -6],
            ...D_ARMS(
              [
                [0.15, 0.1, 1],
                [0, -0.2, 1],
              ],
              [
                [-0.15, 0.1, 1],
                [0, -0.2, 1],
              ]
            ),
            tail1: [20, 0, 0],
          }),
          0.3,
        ],
        [0.66, G({ hips: { r: [10, 0, 0], p: [0, -0.06, 0.06] }, spine: [16, 0, 0] }), 0.5],
        [Cc[3].dur, G()],
      ],
    },
    // C5 wing gust: wings sweep wide behind him, then beat forward in one big blast of wind.
    PawC5: {
      dur: Cc[4].dur,
      keys: [
        [0, G()],
        [
          0.22,
          G({
            hips: { r: [-10, 0, 0], p: [0, -0.03, -0.05] },
            spine: [-20, 0, 0],
            head: [-6, 0, 0],
            ...D_ARMS([[0.9, 0.1, -0.4]], [[-0.9, 0.1, -0.4]]),
            wingL: { aim: [0.8, 0.75, -0.75] },
            wingR: { aim: [-0.8, 0.75, -0.75] },
            wingtipL: [0, 0, 25],
            wingtipR: [0, 0, -25],
            tail1: [-15, 0, 0],
          }),
          0.5,
        ],
        [
          0.34,
          G({
            hips: { r: [16, 0, 0], p: [0, -0.07, 0.08] },
            spine: [26, 0, 0],
            head: [-22, 0, 0],
            legL: [-24, 0, 8],
            legR: [20, 0, -8],
            ...D_ARMS([[0.5, 0.1, 0.85]], [[-0.5, 0.1, 0.85]]),
            wingL: { aim: [0.55, 0.2, 0.85] },
            wingR: { aim: [-0.55, 0.2, 0.85] },
            wingtipL: [0, 0, -30],
            wingtipR: [0, 0, 30],
            tail1: [25, 0, 0],
            tail2: [15, 0, 0],
          }),
          0.2,
        ],
        [
          0.5,
          G({
            hips: { r: [12, 0, 0], p: [0, -0.06, 0.06] },
            spine: [18, 0, 0],
            wingL: { aim: [0.75, 0.3, 0.5] },
            wingR: { aim: [-0.75, 0.3, 0.5] },
          }),
          0.5,
        ],
        [Cc[4].dur, G()],
      ],
    },
    // C6 belly flop: leaps up, belly out, and crashes down flat for a shockwave; up again with a wobble.
    PawC6: {
      dur: Cc[5].dur,
      keys: [
        [0, G()],
        [
          0.11,
          {
            hips: { r: [12, 0, 0], p: [0, -0.15, 0] },
            spine: [18, 0, 0],
            legL: [-20, 0, 10],
            legR: [-20, 0, -10],
            footL: [20, 0, 0],
            footR: [20, 0, 0],
            ...D_ARMS([[0.6, -0.6, -0.4]], [[-0.6, -0.6, -0.4]]),
          },
          0.5,
        ],
        [
          0.3,
          {
            hips: { r: [-18, 0, 0], p: [0, 0.05, 0] },
            spine: [-24, 0, 0],
            head: [-16, 0, 0],
            legL: [10, 0, 8],
            legR: [10, 0, -8],
            footL: [30, 0, 0],
            footR: [30, 0, 0],
            ...D_ARMS([[0.6, 0.9, 0.1]], [[-0.6, 0.9, 0.1]]),
            wingL: { aim: [0.9, 0.9, -0.1] },
            wingR: { aim: [-0.9, 0.9, -0.1] },
            tail1: [-15, 0, 0],
          },
          0.5,
        ],
        [
          0.55,
          {
            hips: { r: [40, 0, 0], p: [0, 0.1, 0.1] },
            spine: [10, 0, 0],
            head: [-30, 0, 0],
            legL: [30, 0, 10],
            legR: [30, 0, -10],
            ...D_ARMS([[0.8, 0.3, 0.5]], [[-0.8, 0.3, 0.5]]),
            wingL: { aim: [0.95, 0.5, -0.1] },
            wingR: { aim: [-0.95, 0.5, -0.1] },
            tail1: [-10, 0, 0],
          },
          0.5,
        ],
        [
          0.84,
          {
            hips: { r: [82, 0, 0], p: [0, -0.1, 0.3] },
            spine: [6, 0, 0],
            head: [-50, 0, 0],
            legL: [40, 0, 14],
            legR: [40, 0, -14],
            ...D_ARMS([[1, 0.05, 0.25]], [[-1, 0.05, 0.25]]),
            wingL: { aim: [0.95, 0.1, -0.2] },
            wingR: { aim: [-0.95, 0.1, -0.2] },
            wingtipL: [0, 0, -20],
            wingtipR: [0, 0, 20],
            tail1: [-60, 0, 0],
          },
          0.1,
        ],
        [
          0.9,
          {
            hips: { r: [80, 0, 0], p: [0, -0.12, 0.3] },
            spine: [8, 0, 0],
            head: [-48, 0, 0],
            legL: [44, 0, 14],
            legR: [44, 0, -14],
            ...D_ARMS([[1, 0.15, 0.25]], [[-1, 0.15, 0.25]]),
            tail1: [-55, 0, 0],
            tail2: [10, 0, 0],
          },
          0.3,
        ],
        [
          1.04,
          {
            hips: { r: [20, 0, 0], p: [0, -0.15, 0.1] },
            spine: [30, 0, 0],
            head: [-12, 0, 0],
            legL: [-30, 0, 10],
            legR: [-25, 0, -10],
            footL: [30, 0, 0],
            footR: [30, 0, 0],
            ...D_ARMS([[0.6, -0.8, 0.2]], [[-0.6, -0.8, 0.2]]),
          },
          0.5,
        ],
        [Cc[5].dur, G()],
      ],
    },
    // Jump attack: a corkscrew tail spin in the air.
    PawJump: {
      dur: M.jump.dur,
      fn: spinKeys(0.02, 0.42, 2, (u, t) => {
        const e = sin(PI * clamp01(t / 0.5)) ** 0.5;
        return {
          hips: { r: [10 * e, 0, 0] },
          spine: [20 * e, 0, 0],
          head: [-10 * e, 0, 0],
          legL: [-60 * e, 0, 6],
          legR: [-50 * e, 0, -6],
          footL: [30 * e, 0, 0],
          ...D_ARMS([[0.4, 0.2, 0.9]], [[-0.4, 0.2, 0.9]]),
          wingL: { aim: [0.95, 0.4, -0.2] },
          wingR: { aim: [-0.95, 0.4, -0.2] },
          tail1: [20 * e, 25 * e, 0],
          tail2: [5 * e, 10 * e, 0],
        };
      }),
    },
    // Dash attack: a rolling tackle into the crowd.
    PawDash: { dur: M.dash.dur, fn: (p, t) => darrenRoll(clamp01(t / 0.5)) },
    // Scarf-Star Blizzard: spins faster and faster flinging snow, then a big overhead burst.
    PawSpecial: {
      dur: M.special.dur,
      fn: (p, t) => {
        const up = smooth(clamp01(t / 0.3)),
          end = smooth(clamp01((t - 2.02) / 0.13)),
          after = smooth(clamp01((t - 2.15) / 0.25)),
          spinA = 360 * (1.2 * t + 0.45 * t * t);
        const air = up * (1 - end) * (0.18 + 0.03 * sin(t * 20));
        return spinPose(
          {
            hips: { p: [0, air - 0.12 * end * (1 - after), 0] },
            spine: [-6 * up + 30 * end * (1 - after), 0, 0],
            head: [-12 * up, 0, 0],
            legL: [-20 * up, 0, 10 * up],
            legR: [-10 * up, 0, -10 * up],
            armL: {
              aim: [
                lerp(0.45, 1, up * (1 - end)) + 0.2 * end,
                lerp(-1, 0.2, up) * (1 - end) - 0.7 * end + 1.2 * end * (1 - after),
                lerp(0.18, -0.2, up) + 0.9 * end,
              ],
            },
            armR: {
              aim: [
                lerp(-0.45, -1, up * (1 - end)) - 0.2 * end,
                lerp(-1, 0.2, up) * (1 - end) - 0.7 * end + 1.2 * end * (1 - after),
                lerp(0.18, -0.2, up) + 0.9 * end,
              ],
            },
            wingL: { aim: [0.95, 0.6 + 0.3 * sin(t * 25), 0] },
            wingR: { aim: [-0.95, 0.6 + 0.3 * sin(t * 25), 0] },
            tail1: [10 * up, 0, 0],
            tail2: [10 * up, 0, 0],
          },
          -spinA * (1 - end)
        );
      },
    },
  };
}
// ======================= TORMUND & BUCKY: full biped rigs =======================
// Both have thigh/shin/foot legs and upper/fore/hand arms, so legs bend at the knee and the feet are
// kept flat by giving each foot the opposite of the thigh and shin pitch. Rotations are additive down
// the chain: thigh -X swings the leg forward, shin +X bends the knee.
const leg = (side, thigh, knee, toe = 0, spread = 0) => ({
  ['leg' + side]: [-thigh, 0, side === 'L' ? spread : -spread],
  ['shin' + side]: [knee, 0, 0],
  ['foot' + side]: [thigh - knee - toe, 0, 0],
});
const legs = (l, r) => ({ ...leg('L', ...l), ...leg('R', ...r) });
// A crouch of depth k (0..1) for a leg of length len: knees forward, hips drop.
const crouch = (k, len, spread = 4) => ({
  hips: { p: [0, -len * (1 - cos(k * 0.9)) * 0.9, 0] },
  ...legs([40 * k, 80 * k, 0, spread], [40 * k, 80 * k, 0, spread]),
});
// cfg: { base, h (hip height), len (leg length), walk/run: { dur, thigh, knee, bob, yaw, lean },
//        arms(kind, s, c) -> arm pose for 'idle'|'walk'|'run'|'air'|'land'|'roll'|'hurt', tail }
function bipedLocomotion(cfg) {
  const { len, h } = cfg,
    tail = (p, yaw, pitch = 0, lag = 0.12, base = 0) => tailWave(3, p, yaw, pitch, lag, base);
  // One stride: left thigh forward while s > 0; a leg's knee bends while it swings through.
  const stride = (p, g) => {
    const s = S(p),
      c = C(p),
      kL = g.knee * Math.max(0, c) ** 1.4 + g.knee * 0.12,
      kR = g.knee * Math.max(0, -c) ** 1.4 + g.knee * 0.12,
      toeL = g.toe * Math.max(0, -S(p + 0.15)),
      toeR = g.toe * Math.max(0, S(p + 0.15));
    return {
      hips: {
        r: [g.lean, g.yaw * s, g.roll * c],
        p: [0, g.bob * C(p, 2) - g.drop, 0],
      },
      spine: [g.lean * 0.3, -g.yaw * 0.7 * s, 0],
      chest: [g.lean * 0.2, -g.yaw * 0.6 * s, -g.roll * 0.5 * c],
      neck: [-g.lean * 0.4, g.yaw * 0.3 * s, 0],
      head: [-g.lean * 0.6, g.yaw * 0.3 * s, 0],
      ...legs([g.thigh * s, kL, toeL, 3], [-g.thigh * s, kR, toeR, 3]),
    };
  };
  const roll = (u0) => {
    const u = smooth(u0),
      th = TAU * u,
      tuck = sin(PI * clamp01(u0 / 0.9)) ** 0.6,
      cy = lerp(h + cfg.rollPivot[0], cfg.rollH, tuck) + 0.1 * sin(PI * u),
      oy = cfg.rollPivot[0],
      oz = cfg.rollPivot[1];
    return {
      hips: {
        r: [360 * u, 0, 0],
        p: [0, cy - (oy * cos(th) - oz * sin(th)) - h, oz - (oy * sin(th) + oz * cos(th))],
      },
      spine: [35 * tuck, 0, 0],
      chest: [25 * tuck, 0, 0],
      neck: [20 * tuck, 0, 0],
      head: [20 * tuck, 0, 0],
      ...legs([110 * tuck, 130 * tuck, 0, 6], [100 * tuck, 125 * tuck, 0, 6]),
      ...cfg.arms('roll', tuck, 0),
    };
  };
  return {
    Idle: {
      dur: 3,
      loop: true,
      fn: (p) =>
        seq(
          {
            hips: { p: [0, -0.01 + 0.01 * S(p), 0], r: [0, 0, 1.2 * S(p * 0.5)] },
            spine: [1 * S(p), 0, 0],
            chest: [1.5 * S(p - 0.1), 0, 0],
            neck: [0, 4 * S(p * 0.5 + 0.2), 0],
            head: [-1.5 * S(p - 0.15), 5 * S(p * 0.5 + 0.1), 2 * S(p * 0.5)],
            ...legs([0, 4 + 2 * S(p), 0, 4], [0, 4 + 2 * S(p), 0, 4]),
          },
          cfg.arms('idle', S(p), C(p)),
          tail(p, 8, 3, 0.1)
        ),
    },
    Walk: {
      dur: cfg.walk.dur,
      loop: true,
      fn: (p) => seq(stride(p, cfg.walk), cfg.arms('walk', S(p), C(p)), tail(p, 10, 3, 0.12)),
    },
    Run: {
      dur: cfg.run.dur,
      loop: true,
      fn: (p) => seq(stride(p, cfg.run), cfg.arms('run', S(p), C(p)), tail(p, 14, 6, 0.12, 6)),
    },
    JumpUp: {
      dur: 0.35,
      keys: [
        [
          0,
          seq(crouch(0.45, len), { spine: [14, 0, 0], chest: [6, 0, 0] }, cfg.arms('air', -1, 0)),
        ],
        [
          0.12,
          seq(
            { hips: { p: [0, 0.04, 0] }, spine: [-6, 0, 0], head: [-10, 0, 0] },
            legs([-6, 10, -25], [-14, 20, -25]),
            cfg.arms('air', 1, 0)
          ),
          0.8,
        ],
        [0.35, seq({ spine: [-2, 0, 0] }, legs([35, 70, 0], [15, 40, 0]), cfg.arms('air', 0.6, 0))],
      ],
    },
    Fall: {
      dur: 0.6,
      loop: true,
      fn: (p) =>
        seq(
          { spine: [-3, 0, 0], head: [6, 0, 0] },
          legs([20 + 6 * S(p), 30, 0, 5], [8 - 6 * S(p), 25, 0, 5]),
          cfg.arms('air', 0.4 + 0.15 * S(p), 0),
          tail(p, 6, 8, 0.1, -10)
        ),
    },
    Land: {
      dur: 0.42,
      keys: [
        [0, seq(legs([20, 30, 0], [10, 25, 0]), cfg.arms('air', 0.4, 0))],
        [
          0.07,
          seq(
            crouch(0.55 * cfg.weight, len, 8),
            { spine: [16, 0, 0], chest: [6, 0, 0], head: [-12, 0, 0] },
            cfg.arms('land', 1, 0),
            { tail1: [10, 0, 0] }
          ),
          0.3,
        ],
        [0.42, {}],
      ],
    },
    Dodge: cfg.dodge || { dur: 0.55, fn: (p) => roll(clamp01(p / 0.85)) },
    HurtF: {
      dur: 0.42,
      keys: [
        [0, {}],
        [
          0.07,
          seq(
            {
              hips: { r: [-8, 0, 0], p: [0, -0.04, -0.06] },
              spine: [-14, 6, 0],
              chest: [-8, 4, 0],
              neck: [-8, 0, 0],
              head: [-14, -10, 6],
            },
            legs([-6, 14, 0, 6], [10, 20, 0, 6]),
            cfg.arms('hurt', 1, 0)
          ),
          0.2,
        ],
        [0.42, {}],
      ],
    },
    HurtB: {
      dur: 0.42,
      keys: [
        [0, {}],
        [
          0.07,
          seq(
            {
              hips: { r: [10, 0, 0], p: [0, -0.04, 0.06] },
              spine: [14, -6, 0],
              chest: [8, 0, 0],
              head: [14, 8, -4],
            },
            legs([12, 22, 0, 6], [-4, 12, 0, 6]),
            cfg.arms('hurt', -1, 0),
            { tail1: [20, 0, 0] }
          ),
          0.2,
        ],
        [0.42, {}],
      ],
    },
    // Thrown onto his back: hips swing round to lie flat, a bounce, then still.
    Knockdown: {
      dur: 0.8,
      keys: [
        [0, {}],
        [
          0.12,
          seq(
            { hips: { r: [-30, 0, 0], p: [0, -0.1, -0.2] }, spine: [-12, 0, 0], head: [-10, 0, 0] },
            legs([30, 40, 0, 8], [20, 30, 0, 8]),
            cfg.arms('hurt', 1, 0)
          ),
          0.5,
        ],
        [
          0.34,
          seq(
            {
              hips: { r: [-82, 0, 0], p: [0, cfg.lieH - h, -0.35] },
              spine: [-6, 0, 0],
              neck: [12, 0, 0],
              head: [10, 0, 0],
            },
            legs([30, 30, 0, 10], [20, 20, 0, 10]),
            cfg.arms('down', 1, 0),
            { tail1: [70, 0, 0] }
          ),
          0.2,
        ],
        [
          0.48,
          seq(
            {
              hips: { r: [-86, 0, 0], p: [0, cfg.lieH - h + 0.06, -0.38] },
              neck: [16, 0, 0],
              head: [14, 0, 0],
            },
            legs([36, 26, 0, 12], [24, 18, 0, 12]),
            cfg.arms('down', 1, 0),
            { tail1: [70, 0, 0] }
          ),
          0.4,
        ],
        [
          0.8,
          seq(
            {
              hips: { r: [-88, 0, 0], p: [0, cfg.lieH - h, -0.38] },
              neck: [8, 0, 0],
              head: [6, 0, 0],
            },
            legs([24, 20, 0, 14], [12, 16, 0, 14]),
            cfg.arms('down', 1, 0),
            { tail1: [70, 0, 0] }
          ),
        ],
      ],
    },
    Down: {
      dur: 2,
      loop: true,
      fn: (p) =>
        seq(
          {
            hips: { r: [-88, 0, 0], p: [0, cfg.lieH - h + 0.01 * S(p), -0.38] },
            chest: [1.5 * S(p), 0, 0],
            neck: [8, 0, 0],
            head: [6, 0, 0],
          },
          legs([24, 20, 0, 14], [12, 16, 0, 14]),
          cfg.arms('down', 1, 0),
          { tail1: [70, 0, 0] }
        ),
    },
    // Rolls up to sitting, plants a foot and pushes up.
    GetUp: {
      dur: 0.7,
      keys: [
        [
          0,
          seq(
            {
              hips: { r: [-88, 0, 0], p: [0, cfg.lieH - h, -0.38] },
              neck: [8, 0, 0],
              head: [6, 0, 0],
            },
            legs([24, 20, 0, 14], [12, 16, 0, 14]),
            cfg.arms('down', 1, 0),
            { tail1: [70, 0, 0] }
          ),
        ],
        [
          0.25,
          seq(
            {
              hips: { r: [-20, 0, 0], p: [0, cfg.sitH - h, -0.2] },
              spine: [30, 0, 0],
              chest: [20, 0, 0],
              head: [-20, 0, 0],
            },
            legs([95, 130, 0, 10], [80, 40, 0, 10]),
            cfg.arms('land', 1, 0),
            { tail1: [30, 0, 0] }
          ),
          0.5,
        ],
        [
          0.48,
          seq(
            crouch(0.7, len, 6),
            { spine: [30, 0, 0], chest: [10, 0, 0], head: [-20, 0, 0] },
            cfg.arms('land', 1, 0)
          ),
          0.5,
        ],
        [0.7, {}],
      ],
    },
  };
}

// ---- Tormund: sword in his LEFT paw, shield on his RIGHT ----
// Knightly stance: shield side turned a little forward, sword held up and ready.
// A held weapon sits across the fist, so the paw points along the forearm with the blade (or shield
// face) square to it: the paw's aim is the forearm direction with the blade direction taken out.
function across(fore, blade) {
  const n = Math.hypot(...blade) || 1,
    b = blade.map((x) => x / n),
    d = fore[0] * b[0] + fore[1] * b[1] + fore[2] * b[2],
    a = fore.map((x, i) => x - d * b[i]);
  return Math.hypot(...a) < 1e-3 ? [b[1], -b[0], b[2]] : a;
}
const T_SWORD = (arm, fore, blade) => ({
  armL: { aim: arm },
  foreL: { aim: fore },
  handL: { aim: across(fore, blade), up: blade },
});
const T_SHIELD = (arm, fore, face) => ({
  armR: { aim: arm },
  foreR: { aim: fore },
  handR: { aim: across(fore, face), face },
});
const T_BASE = {
  hips: { r: [0, 12, 0], p: [0, -0.03, 0] },
  spine: [3, 0, 0],
  chest: [2, 2, 0],
  neck: [0, -6, 0],
  head: [-3, -6, 0],
  ...T_SWORD([0.25, -0.95, 0.15], [-0.1, -0.35, 0.95], [0.05, 0.6, 0.8]),
  ...T_SHIELD([-0.2, -0.9, 0.35], [0.75, -0.1, 0.65], [0.25, 0, 1]),
  legL: [-8, 0, 4],
  shinL: [12, 0, 0],
  footL: [-4, 0, 0],
  legR: [8, 0, -4],
  shinR: [10, 0, 0],
  footR: [-18, 0, 0],
};
function tormundArms(kind, s, c) {
  switch (kind) {
    case 'idle':
      return T_SWORD(
        [0.25, -0.95, 0.15 + 0.02 * s],
        [-0.1, -0.35, 0.95],
        [0.05 + 0.03 * c, 0.6, 0.8]
      );
    case 'walk':
      return {
        ...T_SWORD([0.25, -0.95, 0.1 - 0.3 * s], [-0.05, -0.45, 0.9 - 0.2 * s], [0.05, 0.65, 0.75]),
        ...T_SHIELD([-0.2, -0.92, 0.3 + 0.12 * s], [0.75, -0.15, 0.65], [0.25, 0, 1]),
      };
    case 'run':
      // Shield carried up in front, sword trailing low and back, pumping with the stride.
      return {
        ...T_SWORD([0.3, -0.85, -0.2 - 0.45 * s], [0.15, -0.8, 0.4 - 0.5 * s], [0.1, -0.25, -1]),
        ...T_SHIELD([-0.2, -0.75, 0.6 + 0.15 * s], [0.8, 0.05, 0.6], [0.3, 0.1, 1]),
      };
    case 'air':
      return {
        ...T_SWORD([0.7, -0.2 + 0.5 * s, -0.2], [0.6, 0.3 * s, 0.6], [0.2, 0.9, 0.3]),
        ...T_SHIELD([-0.7, -0.3 + 0.4 * s, 0.2], [0.3, 0, 1], [0, 0.2, 1]),
      };
    case 'land':
      return {
        ...T_SWORD([0.55, -0.7, 0.3], [0.2, -0.6, 0.75], [0.4, 0.4, 0.8]),
        ...T_SHIELD([-0.4, -0.7, 0.5], [0.7, -0.3, 0.6], [0.2, 0, 1]),
      };
    case 'roll':
      // Tucked: sword pointed back along the body so it never digs in, shield on the forearm.
      return {
        ...T_SWORD([0.35, -0.6 + 0.2 * s, 0.6 * s], [0.2, 0.3 * s - 0.4, 0.9], [0.1, -0.3, -1]),
        ...T_SHIELD([-0.3, -0.6, 0.7 * s], [0.6, 0.3 * s, 0.7], [0.2, 0.3, 1]),
      };
    case 'hurt':
      return s > 0
        ? {
            ...T_SWORD([0.75, -0.5, -0.1], [0.6, -0.4, 0.5], [0.4, 0.7, 0.2]),
            ...T_SHIELD([-0.4, -0.6, 0.6], [0.6, 0.3, 0.7], [0, 0.3, 1]),
          }
        : {
            ...T_SWORD([0.6, -0.6, -0.5], [0.4, -0.5, 0.4], [0.2, 0.6, 0.6]),
            ...T_SHIELD([-0.6, -0.6, -0.4], [-0.2, -0.4, 0.8], [0, 0, 1]),
          };
    case 'down':
      return {
        ...T_SWORD([0.85, 0.1, 0.4], [0.85, 0.4, 0.2], [0.3, -0.2, 1]),
        ...T_SHIELD([-0.8, 0.1, 0.4], [-0.6, 0.4, 0.6], [0, 1, 0.1]),
      };
  }
  return {};
}
function tormundLocomotion() {
  return bipedLocomotion({
    h: 0.85,
    len: 0.75,
    weight: 1,
    rollH: 0.5,
    rollPivot: [0.32, 0.12],
    lieH: 0.28,
    sitH: 0.32,
    arms: tormundArms,
    walk: {
      dur: 0.95,
      thigh: 24,
      knee: 42,
      toe: 14,
      bob: 0.025,
      drop: 0.02,
      yaw: 7,
      roll: 2,
      lean: 3,
    },
    run: {
      dur: 0.62,
      thigh: 42,
      knee: 85,
      toe: 25,
      bob: 0.06,
      drop: 0.07,
      yaw: 9,
      roll: 3,
      lean: 14,
    },
  });
}

// ---- Tormund · Sword and Shield attacks (timed to moves.mjs) ----
// A blade direction plus where the sword arm reaches; the shield on its forearm.
const TSw = (arm, fore, blade) => T_SWORD(arm, fore, blade);
const lerpV = (a, b, t) => a.map((x, i) => lerp(x, b[i], t));
const TG_SW = [
  [0.35, -0.8, 0.3],
  [0.05, -0.15, 1],
  [0.1, 0.65, 0.75],
];
const TSh = (arm, fore, face) => T_SHIELD(arm, fore, face);
const T_GUARD = {
  ...crouch(0.18, 0.75, 6),
  hips: { r: [4, 18, 0], p: [0, -0.06, 0] },
  spine: [5, 0, 0],
  chest: [4, -6, 0],
  head: [-6, -10, 0],
  ...TSw([0.35, -0.8, 0.3], [0.05, -0.15, 1], [0.1, 0.65, 0.75]),
  ...TSh([-0.15, -0.8, 0.55], [0.8, 0, 0.6], [0.3, 0.05, 1]),
};
const TG = (p = {}) => mix(T_GUARD, p);
// A stride for charging/ramming: legs pump at rate k strides per second.
const pump = (t, k, amp = 40) => {
  const s = sin(TAU * k * t),
    c = cos(TAU * k * t);
  return legs(
    [amp * s, 30 + 50 * Math.max(0, c), 0, 4],
    [-amp * s, 30 + 50 * Math.max(0, -c), 0, 4]
  );
};
function tormundSword() {
  const M = MOVESETS.tormund,
    N = M.normal,
    Cc = M.charge;
  return {
    // Rising slash: from low across his right hip up and out to his left.
    TorN1: {
      dur: N[0].dur,
      keys: [
        [0, TG()],
        [
          0.07,
          TG({
            hips: { r: [0, -16, 0] },
            chest: [6, -18, 0],
            ...TSw([-0.3, -0.75, 0.55], [-0.7, -0.55, 0.4], [-0.55, -0.7, 0.45]),
          }),
          0.8,
        ],
        [
          0.17,
          TG({
            hips: { r: [-4, 26, 0], p: [0, -0.06, 0.08] },
            chest: [-6, 22, 0],
            head: [-2, -24, 0],
            ...legs([30, 30, 0, 6], [-12, 24, 0, 6]),
            ...TSw([0.65, 0.35, 0.65], [0.55, 0.7, 0.45], [0.55, 0.65, 0.5]),
            tail1: [0, -20, 0],
          }),
          0.8,
        ],
        [
          0.3,
          TG({
            hips: { r: [-2, 30, 0], p: [0, -0.06, 0.07] },
            chest: [-4, 26, 0],
            ...legs([28, 30, 0, 6], [-10, 24, 0, 6]),
            ...TSw([0.75, 0.55, 0.1], [0.4, 0.9, -0.1], [0.3, 0.8, -0.5]),
          }),
          0.4,
        ],
        [N[0].dur, TG()],
      ],
    },
    // Backhand: from high on his left, flat across to his right.
    TorN2: {
      dur: N[1].dur,
      keys: [
        [0, TG({ ...TSw([0.75, 0.55, 0.1], [0.4, 0.9, -0.1], [0.3, 0.8, -0.5]) })],
        [
          0.07,
          TG({
            hips: { r: [0, 30, 0] },
            chest: [0, 20, 0],
            ...TSw([0.85, 0.2, -0.3], [0.6, 0.3, -0.7], [0.4, 0.15, -0.9]),
          }),
          0.8,
        ],
        [
          0.16,
          TG({
            hips: { r: [2, -16, 0], p: [0, -0.07, 0.08] },
            chest: [4, -24, 0],
            head: [-4, 16, 0],
            ...legs([26, 34, 0, 6], [-14, 22, 0, 6]),
            ...TSw([-0.1, 0.05, 1], [-0.65, 0.05, 0.75], [-0.85, 0.05, 0.5]),
            tail1: [0, 24, 0],
          }),
          0.8,
        ],
        [
          0.28,
          TG({
            hips: { r: [2, -22, 0] },
            chest: [4, -28, 0],
            ...TSw([-0.45, -0.2, 0.75], [-0.9, -0.2, 0.2], [-0.8, -0.25, -0.5]),
          }),
          0.4,
        ],
        [N[1].dur, TG()],
      ],
    },
    // Shield bash: steps in shoulder-first and punches the shield out.
    TorN3: {
      dur: N[2].dur,
      keys: [
        [0, TG({ ...TSw([-0.45, -0.2, 0.75], [-0.9, -0.2, 0.2], [-0.8, -0.25, -0.5]) })],
        [
          0.08,
          TG({
            hips: { r: [0, 34, 0] },
            chest: [0, 20, 0],
            ...TSh([-0.5, -0.5, -0.3], [0.2, -0.1, 0.95], [0.6, 0, 0.8]),
            ...TSw([0.6, -0.6, -0.3], [0.3, -0.4, 0.8], [0.3, 0.6, 0.7]),
          }),
          0.7,
        ],
        [
          0.19,
          TG({
            hips: { r: [8, -8, 0], p: [0, -0.1, 0.12] },
            spine: [10, 0, 0],
            chest: [6, -20, 0],
            head: [-12, 10, 0],
            ...legs([38, 40, 0, 6], [-20, 20, 0, 6]),
            ...TSh([-0.05, -0.05, 1], [0.25, 0.05, 1], [0, 0.05, 1]),
            ...TSw([0.6, -0.6, -0.3], [0.3, -0.5, 0.8], [0.2, 0.6, 0.7]),
          }),
          0.3,
        ],
        [
          0.34,
          TG({
            hips: { r: [6, -4, 0], p: [0, -0.09, 0.1] },
            spine: [8, 0, 0],
            ...legs([34, 38, 0, 6], [-18, 20, 0, 6]),
            ...TSh([-0.1, -0.25, 0.95], [0.4, 0, 0.9], [0.1, 0, 1]),
          }),
          0.4,
        ],
        [N[2].dur, TG()],
      ],
    },
    // Thrust: drives the sword point straight out, long step.
    TorN4: {
      dur: N[3].dur,
      keys: [
        [0, TG()],
        [
          0.1,
          TG({
            hips: { r: [0, -26, 0], p: [0, -0.08, -0.04] },
            chest: [0, -14, 0],
            ...TSw([0.6, -0.3, -0.6], [0.4, -0.1, 0.9], [0, 0.05, 1]),
          }),
          0.6,
        ],
        [
          0.22,
          TG({
            hips: { r: [8, -34, 0], p: [0, -0.14, 0.18] },
            spine: [8, 0, 0],
            chest: [6, -18, 0],
            head: [-12, 30, 0],
            ...legs([50, 50, 0, 6], [-30, 14, 0, 6]),
            ...TSw([0.1, 0, 1], [0.12, -0.05, 1], [-0.12, 0.1, 1]),
            ...TSh([-0.6, -0.5, -0.4], [0.2, -0.5, 0.8], [0, 0, 1]),
            tail1: [10, 20, 0],
          }),
          0.2,
        ],
        [
          0.36,
          TG({
            hips: { r: [6, -30, 0], p: [0, -0.12, 0.16] },
            ...legs([46, 48, 0, 6], [-26, 16, 0, 6]),
            ...TSw([0.15, -0.05, 1], [0.15, -0.1, 1], [-0.1, 0.05, 1]),
          }),
          0.5,
        ],
        [N[3].dur, TG()],
      ],
    },
    // Spinning cleave: one full turn with the blade out flat, finishing low.
    TorN5: {
      dur: N[4].dur,
      fn: spinKeys(0.1, 0.42, 1, (u, t) => {
        const e = sin(PI * clamp01((t - 0.02) / 0.7)),
          low = smooth(clamp01((t - 0.3) / 0.12)) * (1 - smooth(clamp01((t - 0.55) / 0.3)));
        return TG({
          hips: { r: [6 * e, 0, 0], p: [0, -0.1 * e - 0.06 * low, 0] },
          spine: [8 * e, 0, -6 * e],
          chest: [0, 10 * e, -6 * e],
          head: [0, -14 * e, 0],
          ...legs([24 * e, 40 * e, 0, 14 * e], [10 * e, 40 * e, 0, 14 * e]),
          ...TSw(
            lerpV(TG_SW[0], [1, 0.1 - 0.3 * low, 0.15], e),
            lerpV(TG_SW[1], [0.95, 0.05 - 0.3 * low, 0.3], e),
            lerpV(TG_SW[2], [0.25, -0.1 * low, 1], e)
          ),
          ...TSh([-0.5, -0.7, 0.3], [0.6, -0.2, 0.7], [0, 0, 1]),
          tail1: [8 * e, -30 * e, 0],
          tail2: [0, -15 * e, 0],
        });
      }),
    },
    // C2 shield charge: shoulder down behind the shield, running three hits through the crowd.
    TorC2: {
      dur: Cc[1].dur,
      fn: (p, t) => {
        const e = smooth(clamp01(t / 0.1)) * (1 - smooth(clamp01((t - 0.55) / 0.22)));
        return TG(
          seq(
            {
              hips: { r: [18 * e, 30 * e, 0], p: [0, -0.1 * e, 0] },
              spine: [14 * e, 0, 0],
              chest: [6 * e, -10 * e, 0],
              head: [-22 * e, -14 * e, 0],
              ...TSh([-0.1, -0.15, 1], [0.75, 0, 0.65], [0.05, 0.05, 1]),
              ...TSw([0.5, -0.7, -0.4], [0.3, -0.6, 0.6], [0.2, 0.1, -1]),
              tail1: [20 * e, 0, 0],
            },
            mix(
              legs([0, 0], [0, 0]),
              (() => {
                const l = pump(t, 3.2, 40 * e);
                for (const k of Object.keys(l)) l[k] = l[k].map((x) => x * e);
                return l;
              })()
            )
          )
        );
      },
    },
    // C3 launcher cut: dips low, then a vertical upward slash that lifts him onto his toes.
    TorC3: {
      dur: Cc[2].dur,
      keys: [
        [0, TG()],
        [
          0.1,
          TG({
            ...crouch(0.6, 0.75, 6),
            spine: [20, 0, 0],
            chest: [10, 0, 0],
            ...TSw([0.25, -0.9, 0.35], [0.1, -0.7, 0.7], [0.1, -0.5, 0.85]),
          }),
          0.7,
        ],
        [
          0.22,
          TG({
            hips: { r: [-10, 4, 0], p: [0, 0.04, 0.06] },
            spine: [-10, 0, 0],
            chest: [-10, 6, 0],
            head: [-20, 0, 0],
            ...legs([20, 6, -30, 6], [-14, 6, -30, 6]),
            ...TSw([0.25, 0.95, 0.25], [0.1, 1, 0.1], [0.05, 0.6, -0.8]),
            tail1: [-20, 0, 0],
          }),
          0.4,
        ],
        [
          0.42,
          TG({
            hips: { r: [-4, 4, 0] },
            ...TSw([0.35, 0.8, 0.3], [0.2, 0.9, 0.2], [0.1, 0.2, -1]),
          }),
          0.4,
        ],
        [Cc[2].dur, TG()],
      ],
    },
    // C4 guard-break: heaves the sword high behind his head, then chops straight down.
    TorC4: {
      dur: Cc[3].dur,
      keys: [
        [0, TG()],
        [
          0.34,
          TG({
            hips: { r: [-8, 6, 0], p: [0, -0.02, -0.04] },
            spine: [-12, 0, 0],
            chest: [-12, 0, 0],
            head: [-10, 0, 0],
            ...TSw([0.15, 0.95, -0.2], [-0.1, 0.4, -0.9], [0, 0.3, -1]),
            ...TSh([-0.4, -0.5, 0.6], [0.6, 0.1, 0.75], [0.1, 0.2, 1]),
            tail1: [-20, 0, 0],
          }),
          0.15,
        ],
        [
          0.46,
          TG({
            ...crouch(0.6, 0.75, 8),
            hips: { r: [20, 0, 0], p: [0, -0.1, 0.16] },
            spine: [16, 0, 0],
            chest: [10, 0, 0],
            head: [-22, 0, 0],
            ...TSw([0.08, -0.25, 1], [0, -0.55, 0.85], [0, -0.55, 0.85]),
            ...TSh([-0.5, -0.6, 0.2], [0.5, -0.4, 0.75], [0.2, 0, 1]),
            tail1: [20, 0, 0],
          }),
          0.1,
        ],
        [
          0.7,
          TG({
            ...crouch(0.5, 0.75, 8),
            hips: { r: [16, 0, 0], p: [0, -0.08, 0.14] },
            spine: [12, 0, 0],
            ...TSw([0.15, -0.4, 0.9], [0.05, -0.7, 0.7], [0, -0.75, 0.6]),
          }),
          0.4,
        ],
        [Cc[3].dur, TG()],
      ],
    },
    // C5 sweeping arc: drops into a low crouch and cuts a full circle at ankle height, twice.
    TorC5: {
      dur: Cc[4].dur,
      fn: spinKeys(0.14, 0.5, 2, (u, t) => {
        const e = smooth(clamp01(t / 0.12)) * (1 - smooth(clamp01((t - 0.55) / 0.22)));
        return TG({
          ...crouch(0.7 * e, 0.75, 14),
          hips: { r: [14 * e, 0, 0], p: [0, -0.12 * e, 0] },
          spine: [12 * e, 0, -8 * e],
          head: [-14 * e, 0, 0],
          ...TSw(
            lerpV(TG_SW[0], [1, -0.35, 0.1], e),
            lerpV(TG_SW[1], [0.9, -0.5, 0.3], e),
            lerpV(TG_SW[2], [0.2, -0.3, 1], e)
          ),
          ...TSh([-0.6, -0.6, 0.2], [0.4, -0.3, 0.8], [0, 0, 1]),
          tail1: [10 * e, -30 * e, 0],
        });
      }),
    },
    // C6 leaping cleave: a big jump with the sword raised, crashing down in a crescent at the landing.
    TorC6: {
      dur: Cc[5].dur,
      keys: [
        [0, TG()],
        [
          0.1,
          TG({
            ...crouch(0.65, 0.75, 6),
            spine: [18, 0, 0],
            ...TSw([0.6, -0.6, -0.4], [0.3, -0.5, -0.7], [0.1, 0, -1]),
          }),
          0.6,
        ],
        [
          0.3,
          TG({
            hips: { r: [-10, 0, 0] },
            spine: [-10, 0, 0],
            head: [-14, 0, 0],
            ...legs([40, 70, 0, 6], [20, 60, 0, 6]),
            ...TSw([0.25, 0.95, -0.1], [0.1, 0.5, -0.85], [0, 0.2, -1]),
            ...TSh([-0.7, -0.3, 0.3], [0.3, 0, 0.9], [0, 0.2, 1]),
          }),
          0.6,
        ],
        [
          0.74,
          TG({
            hips: { r: [-14, 0, 0] },
            spine: [-14, 0, 0],
            chest: [-8, 0, 0],
            ...legs([30, 50, 0, 6], [10, 40, 0, 6]),
            ...TSw([0.1, 1, -0.3], [-0.1, 0.3, -0.95], [0, -0.1, -1]),
          }),
          0.3,
        ],
        [
          0.88,
          TG({
            ...crouch(0.75, 0.75, 10),
            hips: { r: [24, 0, 0], p: [0, -0.18, 0.14] },
            spine: [18, 0, 0],
            chest: [10, 0, 0],
            head: [-26, 0, 0],
            ...TSw([0.05, -0.35, 1], [0, -0.7, 0.7], [0, -0.75, 0.65]),
            ...TSh([-0.7, -0.4, 0.2], [0.3, -0.3, 0.9], [0, 0, 1]),
            tail1: [25, 0, 0],
          }),
          0.1,
        ],
        [
          1.0,
          TG({
            ...crouch(0.6, 0.75, 10),
            hips: { r: [18, 0, 0], p: [0, -0.14, 0.12] },
            spine: [14, 0, 0],
            ...TSw([0.1, -0.5, 0.85], [0, -0.8, 0.6], [0, -0.85, 0.5]),
          }),
          0.4,
        ],
        [Cc[5].dur, TG()],
      ],
    },
    // Jump attack, plunge: flips the sword point-down and drives it into the snow on landing.
    TorJump: {
      dur: M.jump.dur,
      keys: [
        [
          0,
          {
            ...legs([30, 50, 0], [20, 40, 0]),
            ...TSw([0.4, 0.5, 0.3], [0.2, 0.9, 0.2], [0.1, 0.2, 1]),
          },
        ],
        [
          0.14,
          {
            spine: [10, 0, 0],
            head: [-10, 0, 0],
            ...legs([40, 70, 0, 8], [30, 60, 0, 8]),
            ...TSw([0.3, 0.9, 0.1], [0.1, 1, -0.1], [0.05, -1, 0.15]),
            ...TSh([-0.6, -0.3, 0.5], [0.4, 0, 0.9], [0, 0, 1]),
          },
          0.6,
        ],
        [
          0.3,
          {
            ...crouch(0.7, 0.75, 10),
            spine: [24, 0, 0],
            chest: [10, 0, 0],
            head: [-26, 0, 0],
            ...TSw([0.15, -0.6, 0.75], [0.05, -0.95, 0.3], [0, -1, 0.1]),
            ...TSh([-0.6, -0.4, 0.5], [0.4, -0.3, 0.85], [0, 0, 1]),
          },
          0.2,
        ],
        [
          0.48,
          {
            ...crouch(0.6, 0.75, 10),
            spine: [20, 0, 0],
            ...TSw([0.2, -0.6, 0.7], [0.05, -0.95, 0.3], [0, -1, 0.1]),
          },
          0.5,
        ],
        [M.jump.dur, TG()],
      ],
    },
    // Dash attack, shield ram: a low running shove behind the shield.
    TorDash: {
      dur: M.dash.dur,
      fn: (p, t) => {
        const e = smooth(clamp01(t / 0.08)) * (1 - smooth(clamp01((t - 0.36) / 0.22))),
          hit = Math.exp(-(((t - 0.18) / 0.07) ** 2));
        const l = pump(t, 3.4, 38);
        for (const k of Object.keys(l)) l[k] = l[k].map((x) => x * e);
        return TG({
          hips: { r: [20 * e, 32 * e, 0], p: [0, -0.1 * e, 0] },
          spine: [10 * e + 6 * hit, 0, 0],
          chest: [6 * e, -12 * e, 0],
          head: [-24 * e, -16 * e, 0],
          ...l,
          ...TSh([-0.05, -0.1 * (1 - hit), 1], [0.75 - 0.1 * hit, 0.05, 0.65], [0.05, 0.1, 1]),
          ...TSw([0.5, -0.7, -0.4], [0.3, -0.6, 0.6], [0.2, 0.1, -1]),
        });
      },
    },
    // Golden Crescent: a whirlwind of crescent cuts, then sword high and one great cleave forward.
    TorSpecial: {
      dur: M.special.dur,
      fn: (p, t) => {
        const up = smooth(clamp01(t / 0.25)),
          stop = smooth(clamp01((t - 1.7) / 0.15)),
          raise = smooth(clamp01((t - 1.72) / 0.26)) * (1 - smooth(clamp01((t - 1.98) / 0.07))),
          slam = smooth(clamp01((t - 1.98) / 0.07)),
          rest = smooth(clamp01((t - 2.2) / 0.2)),
          // Three whole turns that ease in and out, so he ends facing forward for the cleave.
          spinA = 360 * 3 * smooth(clamp01((t - 0.12) / 1.62)),
          w = up * (1 - stop),
          hold = slam * (1 - rest),
          arm = (a, b, c, g) => lerp(lerp(lerp(a, b, raise), c, slam), g, rest),
          swordOut = [1 - stop, 0.15, 0.1],
          blade = [0.25 * (1 - stop), 0.2, 1];
        return spinPose(
          TG({
            ...crouch(0.35 * w + 0.65 * hold, 0.75, 14),
            hips: { r: [6 * w - 10 * raise + 22 * hold, 0, 0], p: [0, -0.12 * hold, 0.14 * hold] },
            spine: [6 * w - 14 * raise + 16 * hold, 0, -8 * w],
            head: [-12 * raise - 20 * hold, 0, 0],
            ...TSw(
              [
                arm(swordOut[0], 0.15, 0.08, 0.35),
                arm(swordOut[1], 0.95, -0.25, -0.8),
                arm(swordOut[2], -0.2, 1, 0.3),
              ],
              [
                arm(0.95 * (1 - stop), 0, 0, 0.05),
                arm(0.1, 0.4, -0.55, -0.15),
                arm(0.3, -0.9, 0.85, 1),
              ],
              [
                arm(blade[0], 0, 0, 0.1),
                arm(blade[1], 0.3, -0.55, 0.65),
                arm(blade[2], -1, 0.85, 0.75),
              ]
            ),
            ...TSh([-0.6, -0.5, 0.3], [0.5, -0.2, 0.8], [0, 0, 1]),
            tail1: [10 * w, -30 * w, 0],
          }),
          -spinA
        );
      },
    },
    // Parry: shield snaps up in front, braced on bent knees.
    Parry: {
      dur: M.parry.dur,
      keys: [
        [0, TG()],
        [
          0.06,
          TG({
            ...crouch(0.35, 0.75, 10),
            hips: { r: [6, 26, 0], p: [0, -0.08, -0.03] },
            chest: [6, 8, 0],
            head: [-10, -22, 0],
            ...TSh([-0.1, -0.25, 1], [0.75, 0.25, 0.6], [0.15, 0.15, 1]),
            ...TSw([0.6, -0.55, -0.2], [0.3, -0.3, 0.9], [0.2, 0.5, 0.8]),
          }),
          0.2,
        ],
        [
          0.32,
          TG({
            ...crouch(0.3, 0.75, 10),
            hips: { r: [4, 24, 0], p: [0, -0.07, -0.02] },
            chest: [4, 8, 0],
            ...TSh([-0.1, -0.25, 1], [0.75, 0.25, 0.6], [0.15, 0.15, 1]),
          }),
          0.4,
        ],
        [M.parry.dur, TG()],
      ],
    },
    // Counter-cut straight out of the block: a fast diagonal cut down from his left shoulder.
    TorCounter: {
      dur: M.parry.counter.dur,
      keys: [
        [
          0,
          TG({
            ...crouch(0.3, 0.75, 10),
            hips: { r: [4, 24, 0] },
            ...TSh([-0.1, -0.25, 1], [0.75, 0.25, 0.6], [0.15, 0.15, 1]),
            ...TSw([0.75, 0.6, -0.1], [0.4, 0.8, -0.4], [0.2, 0.5, -0.8]),
          }),
        ],
        [
          0.14,
          TG({
            hips: { r: [8, -24, 0], p: [0, -0.1, 0.12] },
            chest: [8, -26, 0],
            head: [-10, 20, 0],
            ...legs([36, 40, 0, 6], [-20, 20, 0, 6]),
            ...TSw([-0.2, -0.2, 1], [-0.7, -0.4, 0.6], [-0.6, -0.55, 0.55]),
            ...TSh([-0.55, -0.6, 0.2], [0.4, -0.3, 0.85], [0, 0, 1]),
            tail1: [0, 26, 0],
          }),
          0.6,
        ],
        [
          0.3,
          TG({
            hips: { r: [6, -24, 0], p: [0, -0.08, 0.1] },
            chest: [6, -28, 0],
            ...TSw([-0.5, -0.5, 0.6], [-0.85, -0.45, 0], [-0.6, -0.6, -0.5]),
          }),
          0.4,
        ],
        [M.parry.counter.dur, TG()],
      ],
    },
    // Victory flourish: a twirl of the sword, then raised high with the shield on his chest.
    Celebrate: {
      dur: 1.8,
      fn: (p, t) => {
        const tw = smooth(clamp01((t - 0.1) / 0.5)),
          up = smooth(clamp01((t - 0.55) / 0.3)),
          down = smooth(clamp01((t - 1.45) / 0.3)),
          k = up * (1 - down),
          a = TAU * 1.5 * tw;
        return {
          hips: { r: [0, 12 * (1 - k), 0], p: [0, 0.02 * k, 0] },
          spine: [-6 * k, 0, 0],
          chest: [-8 * k, 0, 0],
          head: [-14 * k, 0, 0],
          ...legs([0, 4, 0, 6], [0, 4, 0, 6]),
          ...T_SWORD(
            lerpV([0.6, -0.4, 0.6], [0.2, 1, 0.1], k),
            lerpV([0.4, -0.1 + 0.3 * sin(a), 0.9], [0.1, 1, 0.15], k),
            lerpV([sin(a) * 0.9, cos(a), 0.4], [0.05, 0.95, 0.3], k)
          ),
          ...T_SHIELD([-0.2, -0.8, 0.45], [0.8, 0.15 * k, 0.55], [0.2, 0.05, 1]),
          ...tailWave(3, p * 3, 18 * k, 0, 0.1),
        };
      },
    },
    // Interact: kneels on one knee to look, sword resting point-down.
    Interact: {
      dur: 1.1,
      keys: [
        [0, {}],
        [
          0.35,
          {
            hips: { p: [0, -0.32, 0.05] },
            spine: [16, 0, 0],
            chest: [8, 0, 0],
            head: [16, 0, 0],
            ...legs([70, 80, 0, 4], [-10, 95, 0, 4]),
            ...T_SWORD([0.3, -0.7, 0.5], [0.05, -0.6, 0.8], [0.05, -1, 0.1]),
            ...T_SHIELD([-0.35, -0.8, 0.3], [0.2, -0.9, 0.4], [0, 0, 1]),
          },
          0.3,
        ],
        [
          0.8,
          {
            hips: { p: [0, -0.32, 0.05] },
            spine: [16, 0, 0],
            chest: [8, 0, 0],
            head: [10, 8, 0],
            ...legs([70, 80, 0, 4], [-10, 95, 0, 4]),
            ...T_SWORD([0.3, -0.7, 0.5], [0.05, -0.6, 0.8], [0.05, -1, 0.1]),
            ...T_SHIELD([-0.35, -0.8, 0.3], [0.2, -0.9, 0.4], [0, 0, 1]),
          },
          0.3,
        ],
        [1.1, {}],
      ],
    },
    // Charging the Crescent cleave: sword drawn back low behind him, shield up.
    Charge: {
      dur: 0.5,
      loop: true,
      fn: (p) =>
        TG({
          ...crouch(0.4, 0.75, 10),
          hips: { r: [6, 30, 0], p: [0, -0.08, -0.02] },
          chest: [4, 10, 0],
          head: [-6, -30, 0],
          ...TSw([0.75, -0.45, -0.45], [0.5, -0.2, -0.85], [0.3 + 0.03 * S(p, 2), 0.2, -0.9]),
          ...TSh([-0.1, -0.5, 0.85], [0.7, 0.1, 0.7], [0.25, 0.05, 1]),
        }),
    },
    // Crescent cleave (hold move): impact at 0.42 of 1.05 s, a wide golden arc in front.
    ChargeAttack: {
      dur: 1.05,
      keys: [
        [
          0,
          TG({
            ...crouch(0.4, 0.75, 10),
            hips: { r: [6, 30, 0] },
            ...TSw([0.75, -0.45, -0.45], [0.5, -0.2, -0.85], [0.3, 0.2, -0.9]),
          }),
        ],
        [
          0.3,
          TG({
            ...crouch(0.45, 0.75, 10),
            hips: { r: [6, 40, 0], p: [0, -0.1, -0.04] },
            chest: [0, 14, 0],
            ...TSw([0.95, 0.1, -0.3], [0.6, 0.2, -0.8], [0.3, 0.3, -0.9]),
          }),
          0.8,
        ],
        [
          0.42,
          TG({
            ...crouch(0.5, 0.75, 12),
            hips: { r: [10, -24, 0], p: [0, -0.12, 0.12] },
            chest: [6, -26, 0],
            head: [-10, 20, 0],
            ...TSw([-0.3, 0.05, 1], [-0.8, 0.05, 0.6], [-0.9, 0.1, 0.4]),
            tail1: [0, 30, 0],
          }),
          0.8,
        ],
        [
          0.62,
          TG({
            ...crouch(0.4, 0.75, 12),
            hips: { r: [8, -34, 0], p: [0, -0.1, 0.1] },
            chest: [6, -30, 0],
            ...TSw([-0.85, -0.1, 0.3], [-0.9, -0.2, -0.4], [-0.6, -0.1, -0.8]),
          }),
          0.4,
        ],
        [1.05, TG()],
      ],
    },
  };
}

// ---- Bucky: a heavy beaver with the mallet in his LEFT paw ----
const B_MAL = (arm, fore, axis) => ({
  armL: { aim: arm },
  foreL: { aim: fore },
  handL: { aim: across(fore, axis), up: axis },
});
const B_FREE = (arm, fore, hand) => ({
  armR: { aim: arm },
  foreR: { aim: fore },
  handR: { aim: hand || fore },
});
// Mallet resting on his left shoulder, free paw hanging, feet planted wide.
const B_BASE = {
  hips: { p: [0, -0.02, 0] },
  spine: [-3, 0, 0],
  chest: [-2, 0, 0],
  neck: [4, 0, 0],
  head: [2, 0, 0],
  ...B_MAL([0.45, -0.65, 0.45], [-0.15, 0.85, 0.35], [-0.05, 0.55, -0.85]),
  ...B_FREE([-0.4, -0.92, 0.1], [-0.15, -0.9, 0.35], [-0.05, -0.8, 0.6]),
  legL: [-2, 0, 6],
  shinL: [6, 0, 0],
  footL: [-4, 0, 0],
  legR: [-2, 0, -6],
  shinR: [6, 0, 0],
  footR: [-4, 0, 0],
};
function buckyArms(kind, s, c) {
  switch (kind) {
    case 'idle':
      return {
        ...B_MAL([0.45, -0.65, 0.45 + 0.03 * s], [-0.15, 0.85, 0.35], [-0.05, 0.55, -0.85]),
        ...B_FREE([-0.4, -0.92, 0.1 + 0.04 * s], [-0.15, -0.9, 0.35], [-0.05, -0.8, 0.6]),
      };
    case 'walk':
      return {
        ...B_MAL(
          [0.45, -0.65, 0.45 - 0.08 * s],
          [-0.15, 0.85, 0.35],
          [-0.05 + 0.1 * s, 0.55, -0.85]
        ),
        ...B_FREE([-0.42, -0.9, 0.1 + 0.4 * s], [-0.2, -0.8, 0.5 + 0.4 * s], [-0.05, -0.7, 0.7]),
      };
    case 'run':
      // Mallet carried across his chest, free paw pumping.
      return {
        ...B_MAL([0.4, -0.6, 0.6 - 0.15 * s], [-0.6, 0.45, 0.6], [-0.75, 0.6, 0.3]),
        ...B_FREE([-0.45, -0.75, 0.2 + 0.6 * s], [-0.2, -0.3, 0.9 + 0.3 * s], [-0.05, 0, 1]),
      };
    case 'air':
      return {
        ...B_MAL([0.8, -0.1 + 0.4 * s, 0.1], [0.6, 0.6, 0.4], [0.3, 0.9, -0.3]),
        ...B_FREE([-0.85, -0.1 + 0.4 * s, 0.1], [-0.7, 0.3 * s, 0.6]),
      };
    case 'land':
      return {
        ...B_MAL([0.7, -0.6, 0.4], [0.3, -0.5, 0.8], [0.1, 0.8, 0.6]),
        ...B_FREE([-0.7, -0.6, 0.4], [-0.3, -0.7, 0.6]),
      };
    case 'roll':
      return {
        ...B_MAL([0.5, -0.5, 0.6], [0, 0.4, 0.9], [0.2, 0.6, -0.8]),
        ...B_FREE([-0.5, -0.5, 0.6], [0, -0.3, 0.95]),
      };
    case 'hurt':
      return s > 0
        ? {
            ...B_MAL([0.85, -0.3, -0.2], [0.6, 0.5, -0.3], [0.2, 0.9, -0.3]),
            ...B_FREE([-0.85, -0.2, 0.4], [-0.5, 0.4, 0.7]),
          }
        : {
            ...B_MAL([0.7, -0.6, -0.4], [0.4, -0.6, 0.6], [0.3, 0.6, 0.7]),
            ...B_FREE([-0.7, -0.6, -0.4], [-0.3, -0.6, 0.7]),
          };
    case 'down':
      return {
        ...B_MAL([0.9, 0.2, 0.3], [0.7, 0.6, 0.3], [0.3, -0.2, 1]),
        ...B_FREE([-0.9, 0.2, 0.3], [-0.7, 0.6, 0.3]),
      };
  }
  return {};
}
function buckyLocomotion() {
  const L = bipedLocomotion({
    h: 0.55,
    len: 0.5,
    weight: 1.4,
    rollH: 0.45,
    rollPivot: [0.45, 0.15],
    lieH: 0.42,
    sitH: 0.38,
    arms: buckyArms,
    // A rolling waddle: short steps, lots of side-to-side, the belly leading.
    walk: {
      dur: 0.95,
      thigh: 20,
      knee: 34,
      toe: 8,
      bob: 0.03,
      drop: 0.015,
      yaw: 6,
      roll: 6,
      lean: -2,
    },
    run: {
      dur: 0.6,
      thigh: 36,
      knee: 70,
      toe: 18,
      bob: 0.07,
      drop: 0.05,
      yaw: 8,
      roll: 7,
      lean: 8,
    },
    // Hip-bump dodge: a heavy hop forward that leads with the belly and swings the hips out.
    dodge: {
      dur: 0.55,
      keys: [
        [0, {}],
        [
          0.08,
          seq(
            crouch(0.5, 0.5, 10),
            { spine: [16, 0, 0], chest: [8, 0, 0] },
            buckyArms('land', 1, 0)
          ),
          0.6,
        ],
        [
          0.22,
          seq(
            {
              hips: { r: [-16, 30, 18], p: [0.08, 0.16, 0.08] },
              spine: [-18, -12, -10],
              chest: [-8, -8, -6],
              head: [10, 10, 0],
            },
            legs([20, 40, -20, 10], [-10, 30, -20, 10]),
            buckyArms('air', 0.4, 0),
            { tail1: [-25, -20, 0], tail2: [-10, -10, 0] }
          ),
          0.6,
        ],
        [
          0.4,
          seq(
            crouch(0.6, 0.5, 12),
            { hips: { r: [6, 10, -6] }, spine: [14, 0, 0], head: [-10, 0, 0] },
            buckyArms('land', 1, 0),
            { tail1: [15, 0, 0] }
          ),
          0.4,
        ],
        [0.55, {}],
      ],
    },
  });
  return L;
}

// ---- Darren · Polka Scarf (timed to moves.mjs) ----
// The scarf's free end is in his right paw; the ribbon itself is simulated in game.mjs (ScarfRibbon),
// so these clips only have to swing the paw on clean arcs. A lash = wind back, whip the paw through
// fast, then let the arm follow on so the ribbon cracks out past it.
const SG = {
  hips: { r: [3, 14, 0], p: [0, -0.04, 0] },
  spine: [6, -6, 0],
  head: [-6, -8, 0],
  legL: [-16, 0, 6],
  legR: [12, 0, -6],
  footL: [10, 0, 0],
  armL: { aim: [0.45, -0.45, 0.75] },
  handL: { aim: [0.2, 0.1, 1] },
  armR: { aim: [-0.85, -0.45, -0.1] },
  handR: { aim: [-0.6, -0.7, 0.35] },
  wingL: { aim: [0.7, 0.6, -0.5] },
  wingR: { aim: [-0.7, 0.6, -0.5] },
  tail1: [4, -8, 0],
};
const SGp = (p = {}) => mix(SG, p);
const R = (arm, hand) => ({ armR: { aim: arm }, handR: { aim: hand || arm } });
// The right paw circling on a ring of radius rad at height y; a turns from start angle a0 (0 = right).
const ringAim = (ang, y = 0.2, fwd = 0) => [-cos(ang), y, sin(ang) + fwd];
function darrenScarf() {
  const M = MOVESETS.scarf,
    N = M.normal,
    Cc = M.charge;
  return {
    // Charging the Polka Snare: the scarf twirls overhead like a lasso.
    ScarfCharge: {
      dur: 0.5,
      loop: true,
      fn: (p) =>
        SGp({
          hips: { r: [0, 0, 0], p: [0, -0.06, 0] },
          spine: [-4, 0, 0],
          head: [-10, 0, 0],
          ...R([-0.35 + 0.35 * C(p), 1, 0.35 * S(p)], [-0.6 * C(p), 0.5, -0.6 * S(p)]),
          tail1: [4, 10 * S(p), 0],
        }),
    },
    // N1 lash: forehand, the paw whips from behind his right hip across to his left.
    ScarfN1: {
      dur: N[0].dur,
      keys: [
        [0, SGp()],
        [
          0.07,
          SGp({
            hips: { r: [0, -16, 0] },
            spine: [0, -14, 0],
            ...R([-0.75, 0.15, -0.6], [-0.4, 0.3, -0.9]),
          }),
          0.8,
        ],
        [
          0.15,
          SGp({
            hips: { r: [6, 4, 0], p: [0, -0.04, 0.06] },
            spine: [8, 22, 0],
            head: [-6, -14, 0],
            legL: [-28, 0, 6],
            legR: [22, 0, -6],
            ...R([-0.1, 0.1, 1], [0.35, 0.05, 1]),
            tail1: [4, -24, 0],
          }),
          0.8,
        ],
        [
          0.26,
          SGp({
            hips: { r: [4, 20, 0], p: [0, -0.05, 0.05] },
            spine: [6, 30, 0],
            legL: [-24, 0, 6],
            legR: [20, 0, -6],
            ...R([0.65, -0.3, 0.6], [0.8, -0.4, 0.3]),
          }),
          0.4,
        ],
        [N[0].dur, SGp({ ...R([0.4, -0.6, 0.6], [0.2, -0.8, 0.5]) })],
      ],
    },
    // N2 backhand: back across the body from his left to far right.
    ScarfN2: {
      dur: N[1].dur,
      keys: [
        [0, SGp({ ...R([0.4, -0.6, 0.6], [0.2, -0.8, 0.5]) })],
        [
          0.07,
          SGp({
            hips: { r: [0, 26, 0] },
            spine: [4, 22, 0],
            head: [0, -10, 0],
            ...R([0.75, 0.2, 0.35], [0.7, 0.35, -0.3]),
          }),
          0.8,
        ],
        [
          0.15,
          SGp({
            hips: { r: [6, -10, 0], p: [0, -0.04, 0.06] },
            spine: [8, -26, 0],
            head: [-6, 12, 0],
            legL: [-24, 0, 6],
            legR: [26, 0, -6],
            ...R([-0.35, 0.15, 1], [-0.75, 0.1, 0.7]),
            tail1: [4, 26, 0],
          }),
          0.8,
        ],
        [
          0.26,
          SGp({
            hips: { r: [4, -22, 0] },
            spine: [6, -24, 0],
            ...R([-0.95, 0.05, -0.1], [-0.8, 0, -0.6]),
          }),
          0.4,
        ],
        [N[1].dur, SGp()],
      ],
    },
    // N3 overhead crack: paw up and back, then straight down the middle; the crack lands out in front.
    ScarfN3: {
      dur: N[2].dur,
      keys: [
        [0, SGp()],
        [
          0.12,
          SGp({
            hips: { r: [-8, 0, 0], p: [0, 0.02, -0.03] },
            spine: [-14, 0, 0],
            head: [-12, 0, 0],
            legL: [-8, 0, 6],
            legR: [6, 0, -6],
            ...R([-0.25, 1, -0.45], [-0.1, 0.4, -1]),
            armL: { aim: [0.6, 0.1, 0.5] },
            tail1: [-12, 0, 0],
          }),
          0.7,
        ],
        [
          0.25,
          SGp({
            hips: { r: [18, 0, 0], p: [0, -0.1, 0.08] },
            spine: [22, 0, 0],
            head: [-22, 0, 0],
            legL: [-34, 0, 6],
            legR: [26, 0, -6],
            footR: [-15, 0, 0],
            ...R([-0.12, -0.15, 1], [-0.05, -0.4, 1]),
            armL: { aim: [0.6, -0.5, 0.2] },
            tail1: [20, 0, 0],
            tail2: [10, 0, 0],
          }),
          0.3,
        ],
        [
          0.38,
          SGp({
            hips: { r: [12, 0, 0], p: [0, -0.08, 0.07] },
            spine: [16, 0, 0],
            legL: [-28, 0, 6],
            legR: [22, 0, -6],
            ...R([-0.2, -0.6, 0.8], [-0.1, -0.9, 0.4]),
          }),
          0.4,
        ],
        [N[2].dur, SGp()],
      ],
    },
    // N4 twirl: a full turn and a half with the ribbon held straight out, three hits around him.
    ScarfN4: {
      dur: N[3].dur,
      fn: spinKeys(0.1, 0.52, 1, (u, t) => {
        const e = sin(PI * clamp01((t - 0.02) / 0.62));
        return SGp({
          hips: { r: [0, 0, 0], p: [0, -0.06 * e, 0] },
          spine: [6 * e, 0, 10 * e],
          head: [0, 10 * e, 0],
          legL: [-6, 0, 14 * e],
          legR: [6, 0, -14 * e],
          ...R([-1, 0.15 * e - 0.3 * (1 - e), 0.15], [-1, 0.1, -0.2]),
          armL: { aim: [0.85, 0.1, 0.4] },
          wingL: { aim: [0.9, 0.6, -0.2] },
          wingR: { aim: [-0.9, 0.6, -0.2] },
          tail1: [10 * e, -24 * e, 0],
          tail2: [0, -10 * e, 0],
        });
      }),
    },
    // N5 figure-eight: the paw draws a sideways eight in front of him, a lash on each loop.
    ScarfN5: {
      dur: N[4].dur,
      fn: (p, t) => {
        const u = clamp01((t - 0.03) / 0.52),
          e = sin(PI * clamp01(t / 0.66)),
          x = -sin(TAU * u),
          y = 0.35 * sin(2 * TAU * u);
        return SGp({
          hips: { r: [6 * e, -22 * x * e, 0], p: [0, -0.05 * e, 0.04 * e] },
          spine: [8 * e, -18 * x * e, 6 * x * e],
          head: [-8 * e, 14 * x * e, 0],
          legL: [-24 * e, 0, 6],
          legR: [20 * e, 0, -6],
          ...R(
            [lerp(-0.85, 0.85 * x - 0.15, e), lerp(-0.45, 0.25 + y, e), lerp(-0.1, 0.75, e)],
            [lerp(-0.6, 1.1 * x - 0.1, e), lerp(-0.7, y * 1.4, e), lerp(0.35, 0.6, e)]
          ),
          tail1: [4, 22 * x * e, 0],
        });
      },
    },
    // N6 helicopter rise: a hop into a climbing spin with the scarf whirling overhead, launching foes.
    ScarfN6: {
      dur: N[5].dur,
      fn: spinKeys(0.14, 0.74, 2, (u, t) => {
        const e = sin(PI * clamp01((t - 0.05) / 0.85)),
          crouch = smooth(clamp01(1 - t / 0.13)) * smooth(clamp01(t / 0.06)),
          rise = smooth(clamp01((t - 0.56) / 0.16));
        return SGp({
          hips: { r: [-6 * e, 0, 0], p: [0, -0.12 * crouch, 0] },
          spine: [-8 * e, 0, 0],
          head: [-14 * e, 0, 0],
          legL: [-30 * e, 0, 10 * e],
          legR: [-40 * e, 0, -10 * e],
          footL: [30 * e, 0, 0],
          footR: [30 * e, 0, 0],
          ...R([-0.5 + 0.35 * rise, 1, 0.1], [-1, 0.2 + 0.6 * rise, 0]),
          armL: { aim: [0.8, 0.1 + 0.5 * rise, 0.3] },
          wingL: { aim: [0.95, 0.5 + 0.3 * e, -0.1] },
          wingR: { aim: [-0.95, 0.5 + 0.3 * e, -0.1] },
          tail1: [20 * e, 0, 0],
          tail2: [10 * e, 0, 0],
        });
      }),
    },
    // C1 hold, Polka Snare: a lasso circle overhead, the long lash straight out, then a hard yank back.
    ScarfSnare: {
      dur: Cc[0].dur,
      fn: (p, t) => {
        const wind = clamp01(t / 0.28),
          ang = TAU * 1.25 * smooth(wind),
          throwT = smooth(clamp01((t - 0.26) / 0.12)),
          yank = smooth(clamp01((t - 0.5) / 0.18)),
          rest = smooth(clamp01((t - 0.75) / 0.2));
        const over = [-0.3 + 0.3 * cos(ang), 1, 0.3 * sin(ang)];
        const out = [-0.08, 0.12, 1],
          back = [-0.55, -0.15, -0.7];
        const arm = [0, 1, 2].map((k) =>
          lerp(lerp(lerp(over[k], out[k], throwT), back[k], yank), SG.armR.aim[k], rest)
        );
        return SGp({
          hips: {
            r: [
              lerp(lerp(-4, 14, throwT), -10, yank) * (1 - rest),
              lerp(0, -12, yank) * (1 - rest),
              0,
            ],
            p: [0, -0.04 - 0.05 * throwT, lerp(lerp(0, 0.08, throwT), -0.06, yank) * (1 - rest)],
          },
          spine: [
            lerp(lerp(-10, 16, throwT), -14, yank) * (1 - rest),
            lerp(0, -18, yank) * (1 - rest),
            0,
          ],
          head: [lerp(-10, -16, throwT) * (1 - rest), 0, 0],
          legL: [lerp(-16, -32, throwT) * (1 - rest) - 16 * rest, 0, 6],
          legR: [lerp(12, 24, throwT) * (1 - rest) + 12 * rest, 0, -6],
          armR: { aim: arm },
          handR: { aim: [arm[0] * 0.7, arm[1] * 0.8 - 0.1, arm[2] + 0.2] },
          armL: { aim: [0.55, lerp(-0.2, -0.5, throwT), 0.6] },
          tail1: [lerp(0, 18, throwT) * (1 - yank), 0, 0],
        });
      },
    },
    // C2 launcher: a low-to-high lash that pops foes up, body stretching tall.
    ScarfC2: {
      dur: Cc[1].dur,
      keys: [
        [0, SGp()],
        [
          0.1,
          SGp({
            hips: { r: [14, 6, 0], p: [0, -0.13, 0] },
            spine: [16, 6, 0],
            legL: [-30, 0, 8],
            legR: [-10, 0, -8],
            footL: [20, 0, 0],
            ...R([-0.45, -0.9, 0.3], [-0.2, -1, 0.5]),
          }),
          0.7,
        ],
        [
          0.22,
          SGp({
            hips: { r: [-10, -6, 0], p: [0, 0.06, 0.05] },
            spine: [-14, -8, 0],
            head: [-18, 0, 0],
            legL: [-12, 0, 6],
            legR: [18, 0, -6],
            footR: [-30, 0, 0],
            ...R([-0.15, 1, 0.45], [0, 1, -0.2]),
            armL: { aim: [0.7, -0.2, 0.3] },
            wingL: { aim: [0.9, 0.8, -0.2] },
            wingR: { aim: [-0.9, 0.8, -0.2] },
            tail1: [-18, 0, 0],
          }),
          0.4,
        ],
        [
          0.4,
          SGp({
            hips: { r: [-4, 0, 0], p: [0, 0.02, 0.03] },
            spine: [-6, 0, 0],
            ...R([-0.4, 0.8, 0.2], [-0.4, 0.2, -0.6]),
          }),
          0.4,
        ],
        [Cc[1].dur, SGp()],
      ],
    },
    // C3 spinning top: a low crouching spin with the ribbon flat out, steerable.
    ScarfC3: {
      dur: Cc[2].dur,
      fn: spinKeys(0.06, 0.88, 4, (u, t) => {
        const e = smooth(clamp01(t / 0.1)) * smooth(clamp01((0.98 - t) / 0.14));
        return SGp({
          hips: { r: [8 * e, 0, 0], p: [0, -0.13 * e, 0] },
          spine: [10 * e, 0, 14 * e],
          head: [-12 * e, 0, -10 * e],
          legL: [-30 * e, 0, 20 * e],
          legR: [-30 * e, 0, -20 * e],
          footL: [30 * e, 0, 0],
          footR: [30 * e, 0, 0],
          ...R([-1, lerp(-0.45, -0.05, e), 0.2 * (1 - e)], [-1, -0.05, -0.3]),
          armL: { aim: [0.9, lerp(-0.45, 0.25, e), 0.2] },
          wingL: { aim: [0.95, 0.35, -0.3] },
          wingR: { aim: [-0.95, 0.35, -0.3] },
          tail1: [12 * e, -30 * e, 0],
          tail2: [6 * e, -15 * e, 0],
        });
      }),
    },
    // C4 lasso yank and kick: throw the loop, haul the foe in, then a flying kick with the left foot.
    ScarfC4: {
      dur: Cc[3].dur,
      keys: [
        [0, SGp()],
        [
          0.1,
          SGp({
            hips: { r: [-6, -10, 0] },
            spine: [-10, -10, 0],
            ...R([-0.35, 1, -0.2], [-0.2, 0.6, -0.8]),
          }),
          0.8,
        ],
        [
          0.22,
          SGp({
            hips: { r: [12, 6, 0], p: [0, -0.06, 0.08] },
            spine: [16, 10, 0],
            legL: [-30, 0, 6],
            legR: [24, 0, -6],
            ...R([-0.08, 0.1, 1], [0, 0.05, 1]),
          }),
          0.5,
        ],
        [
          0.38,
          SGp({
            hips: { r: [-14, -20, 0], p: [0, -0.04, -0.06] },
            spine: [-16, -20, 0],
            head: [-6, 18, 0],
            legL: [-6, 0, 6],
            legR: [24, 0, -6],
            ...R([-0.6, -0.1, -0.7], [-0.4, -0.3, -0.9]),
            armL: { aim: [0.6, 0, 0.6] },
          }),
          0.6,
        ],
        [
          0.56,
          SGp({
            hips: { r: [-26, 10, 0], p: [0, 0.12, 0.08] },
            spine: [-16, 6, 0],
            head: [12, 0, 0],
            legL: [-100, 0, 4],
            footL: [-35, 0, 0],
            legR: [20, 0, -4],
            footR: [20, 0, 0],
            ...R([-0.9, 0.3, -0.3], [-0.6, 0.2, -0.8]),
            armL: { aim: [0.95, 0.3, -0.2] },
            wingL: { aim: [0.95, 0.6, -0.1] },
            wingR: { aim: [-0.95, 0.6, -0.1] },
            tail1: [-25, 0, 0],
          }),
          0.3,
        ],
        [
          0.7,
          SGp({
            hips: { r: [-6, 0, 0], p: [0, -0.06, 0.05] },
            legL: [-30, 0, 6],
            ...R([-0.85, -0.3, 0], [-0.6, -0.6, 0.4]),
          }),
          0.5,
        ],
        [Cc[3].dur, SGp()],
      ],
    },
    // C5 ribbon dance: two pirouettes with little hops, the paw sweeping high and low, then a big flourish.
    ScarfC5: {
      dur: Cc[4].dur,
      fn: spinKeys(0.04, 0.76, 2, (u, t) => {
        const e = sin(PI * clamp01(t / 0.95)),
          hop = Math.abs(sin(PI * clamp01(t / 0.75) * 3)) * e,
          wave = sin(TAU * 1.5 * u);
        return SGp({
          hips: { r: [-4 * e, 0, 8 * wave * e], p: [0, 0.08 * hop - 0.04, 0] },
          spine: [-6 * e, 0, -10 * wave * e],
          head: [-12 * e, 0, 0],
          legL: [-10 - 30 * hop, 0, 8],
          legR: [10 + 20 * hop, 0, -8],
          footL: [20 * hop, 0, 0],
          ...R([-0.95, 0.5 * wave + 0.2, 0.25], [-0.9, 0.6 * wave, -0.3]),
          armL: { aim: [0.8, 0.5 - 0.3 * wave, 0.4] },
          wingL: { aim: [0.9, 0.7, -0.2 + 0.2 * wave] },
          wingR: { aim: [-0.9, 0.7, -0.2 - 0.2 * wave] },
          tail1: [6 * e, -20 * e, 0],
          tail2: [0, -10 * e, 0],
        });
      }),
    },
    // C6 shockwave crack: rear back with the scarf high behind, then crack it down the line in front.
    ScarfC6: {
      dur: Cc[5].dur,
      keys: [
        [0, SGp()],
        [
          0.42,
          SGp({
            hips: { r: [-14, 0, 0], p: [0, 0.02, -0.08] },
            spine: [-26, 0, 0],
            head: [-16, 0, 0],
            legL: [-24, 0, 8],
            legR: [18, 0, -8],
            ...R([-0.2, 0.95, -0.7], [-0.1, 0.3, -1]),
            armL: { aim: [0.75, 0.5, 0.3] },
            wingL: { aim: [0.85, 0.9, -0.3] },
            wingR: { aim: [-0.85, 0.9, -0.3] },
            tail1: [-25, 0, 0],
            tail2: [-10, 0, 0],
          }),
          0.2,
        ],
        [
          0.56,
          SGp({
            hips: { r: [28, 0, 0], p: [0, -0.14, 0.12] },
            spine: [30, 0, 0],
            head: [-34, 0, 0],
            legL: [-46, 0, 8],
            legR: [34, 0, -8],
            footR: [-20, 0, 0],
            ...R([-0.08, -0.3, 1], [0, -0.55, 1]),
            armL: { aim: [0.75, -0.4, -0.2] },
            wingL: { aim: [0.95, 0.3, 0.3] },
            wingR: { aim: [-0.95, 0.3, 0.3] },
            tail1: [30, 0, 0],
            tail2: [10, 0, 0],
          }),
          0.1,
        ],
        [
          0.78,
          SGp({
            hips: { r: [22, 0, 0], p: [0, -0.12, 0.1] },
            spine: [24, 0, 0],
            head: [-26, 0, 0],
            legL: [-40, 0, 8],
            legR: [30, 0, -8],
            ...R([-0.15, -0.6, 0.8], [0, -0.9, 0.4]),
          }),
          0.4,
        ],
        [Cc[5].dur, SGp()],
      ],
    },
    // Jump attack, spiral drop: tipped forward and spinning down with the ribbon spiralling out.
    ScarfJump: {
      dur: M.jump.dur,
      fn: spinKeys(0.02, 0.46, 2, (u, t) => {
        const e = sin(PI * clamp01(t / 0.56)) ** 0.5;
        return {
          hips: { r: [16 * e, 0, 0] },
          spine: [18 * e, 0, 0],
          head: [-14 * e, 0, 0],
          legL: [-50 * e, 0, 8],
          legR: [-35 * e, 0, -8],
          footL: [30 * e, 0, 0],
          ...R([-1, -0.35 * e, 0.1], [-0.9, -0.3, -0.3]),
          armL: { aim: [0.8, 0.2, 0.5] },
          wingL: { aim: [0.95, 0.5, -0.2] },
          wingR: { aim: [-0.95, 0.5, -0.2] },
          tail1: [20 * e, -20 * e, 0],
        };
      }),
    },
    // Dash attack, ribbon slide: a low skid on one leg with a sweeping lash.
    ScarfDash: {
      dur: M.dash.dur,
      keys: [
        [0, SGp({ hips: { r: [10, 0, 0] }, spine: [12, 0, 0] })],
        [
          0.08,
          SGp({
            hips: { r: [-18, 0, 0], p: [0, -0.22, 0] },
            spine: [6, 0, 0],
            head: [-6, 0, 0],
            legL: [-75, 0, 6],
            footL: [-20, 0, 0],
            legR: [40, 0, -8],
            footR: [-30, 0, 0],
            ...R([-0.95, 0, -0.4], [-0.6, 0.1, -0.8]),
            armL: { aim: [0.9, -0.5, 0] },
          }),
          0.6,
        ],
        [
          0.22,
          SGp({
            hips: { r: [-18, 10, 0], p: [0, -0.22, 0] },
            spine: [8, 28, 0],
            head: [-8, -20, 0],
            legL: [-75, 0, 6],
            footL: [-20, 0, 0],
            legR: [40, 0, -8],
            footR: [-30, 0, 0],
            ...R([0.2, 0.05, 1], [0.6, 0, 0.8]),
            armL: { aim: [0.9, -0.5, 0] },
            tail1: [-10, -20, 0],
          }),
          0.5,
        ],
        [
          0.4,
          SGp({
            hips: { r: [-8, 10, 0], p: [0, -0.15, 0] },
            spine: [6, 18, 0],
            legL: [-45, 0, 6],
            legR: [25, 0, -8],
            ...R([0.6, -0.3, 0.6], [0.6, -0.6, 0.4]),
          }),
          0.5,
        ],
        [M.dash.dur, SGp()],
      ],
    },
    // Polka Cyclone: an accelerating whirl that drags everything in, rising off the ground, then a slam.
    ScarfSpecial: {
      dur: M.special.dur,
      fn: (p, t) => {
        const up = smooth(clamp01(t / 0.25)),
          end = smooth(clamp01((t - 2.25) / 0.15)),
          after = smooth(clamp01((t - 2.4) / 0.2)),
          spinA = 360 * (1.1 * t + 0.5 * t * t),
          air = up * (1 - end) * (0.14 + 0.04 * sin(t * 18)),
          w = up * (1 - end);
        return spinPose(
          SGp({
            hips: { r: [0, 0, 0], p: [0, air - 0.14 * end * (1 - after), 0] },
            spine: [-6 * w + 26 * end * (1 - after), 0, 8 * w],
            head: [-14 * w, 0, 0],
            legL: [-24 * w, 0, 12 * w],
            legR: [-14 * w, 0, -12 * w],
            ...R(
              [
                lerp(-0.85, -0.6, w) + 0.6 * end,
                lerp(-0.45, 0.75, w) - 1 * end * (1 - after),
                lerp(-0.1, 0.1, w) + 0.9 * end,
              ],
              [lerp(-0.6, -1, w), lerp(-0.7, 0.3, w) - 0.9 * end, lerp(0.35, -0.2, w) + 0.6 * end]
            ),
            armL: { aim: [0.9, lerp(-0.45, 0.4, w) - 0.6 * end, 0.3 + 0.6 * end] },
            wingL: { aim: [0.95, 0.6 + 0.3 * sin(t * 25), 0] },
            wingR: { aim: [-0.95, 0.6 + 0.3 * sin(t * 25), 0] },
            tail1: [10 * w, -20 * w, 0],
            tail2: [6 * w, -10 * w, 0],
          }),
          -spinA * (1 - end)
        );
      },
    },
  };
}
export const LIBRARY = {
  Darren: {
    base: D_STANCE,
    clips: () => ({ ...darrenLocomotion(), ...darrenPaws(), ...darrenScarf() }),
  },
  Tormund: { base: T_BASE, clips: () => ({ ...tormundLocomotion(), ...tormundSword() }) },
  Bucky: { base: B_BASE, clips: () => ({ ...buckyLocomotion() }) },
};

// Builds every authored clip for one rig. Specs with fn/keys and dur become AnimationClips.
export function buildClips(rig) {
  const lib = LIBRARY[rig.name];
  if (!lib) return [];
  const out = [];
  for (const [name, spec] of Object.entries(lib.clips()))
    out.push(makeClip(rig, { base: lib.base, ...spec, name }));
  return out;
}
export { mirror, mix };
