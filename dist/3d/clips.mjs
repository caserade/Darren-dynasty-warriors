// Hand-authored animation library for Darren, Tormund and Bucky (Claude update 6).
// Every clip is built from key poses (see anim.mjs for the pose format) when the game loads.
import { makeClip, mix, mirror } from './anim.mjs';

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
    Dodge: {
      dur: 0.55,
      fn: (p) => {
        const u = smooth(clamp01(p / 0.8)),
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
      },
    },
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

export const LIBRARY = {
  Darren: { base: D_STANCE, clips: () => ({ ...darrenLocomotion() }) },
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
