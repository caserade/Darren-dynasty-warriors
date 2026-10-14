'use strict';
// Palette-based sprites, rasterized on whole pixels. No gradients or scaled vector outlines.
const PIXEL_PALETTE = {
  outline: '#642b40',
  deep: '#9d3041',
  red: '#e94d49',
  light: '#ff7d64',
  shine: '#ffb18a',
  pink: '#f897b4',
  pinkShade: '#c55786',
  gold: '#ffe183',
  goldShade: '#dfa448',
  dot: '#ec73aa',
  snow: '#fcffff',
  ice: '#9ccbdd',
  ink: '#302b41',
};
const DARREN_STATES = {
  idle: 8,
  walk: 8,
  charge: 4,
  throw: 4,
  roll: 8,
  dodge: 4,
  hurt: 2,
  special: 8,
  punch: 8,
  cross: 8,
  kick: 8,
  tail: 8,
};
const DARREN_FRAME_W = 112,
  DARREN_FRAME_H = 128;
const DARREN_LIVE_W = 256,
  DARREN_LIVE_H = 288,
  DARREN_FOOT_Y = 248,
  DARREN_WORLD_SCALE = 0.72;
function pxRect(c, x, y, w, h, color) {
  c.fillStyle = color;
  c.fillRect(x, y, w, h);
}
function pxOval(c, x, y, rx, ry, color) {
  c.fillStyle = color;
  c.beginPath();
  c.ellipse(x, y, Math.max(0.01, rx), Math.max(0.01, ry), 0, 0, Math.PI * 2);
  c.fill();
}
function pxPoly(c, points, color) {
  c.fillStyle = color;
  c.beginPath();
  points.forEach((p, i) => (i ? c.lineTo(...p) : c.moveTo(...p)));
  c.closePath();
  c.fill();
}
function pxLine(c, x0, y0, x1, y1, color, w = 1) {
  c.strokeStyle = color;
  c.lineWidth = w;
  c.lineCap = 'round';
  c.beginPath();
  c.moveTo(x0, y0);
  c.lineTo(x1, y1);
  c.stroke();
}
function pixelWing(c, rootX, rootY, sign, lift, far = false) {
  const p = PIXEL_PALETTE;
  const pts = [
    [rootX, rootY],
    [rootX + sign * 6, rootY - 13 - lift],
    [rootX + sign * 18, rootY - 23 - lift],
    [rootX + sign * 20, rootY - 10],
    [rootX + sign * 24, rootY + 1],
    [rootX + sign * 14, rootY - 2],
    [rootX + sign * 8, rootY + 5],
  ];
  pxPoly(c, pts, p.outline);
  pxPoly(
    c,
    [
      [rootX + sign, rootY - 1],
      [rootX + sign * 7, rootY - 12 - lift],
      [rootX + sign * 17, rootY - 20 - lift],
      [rootX + sign * 18, rootY - 9],
      [rootX + sign * 21, rootY - 1],
      [rootX + sign * 14, rootY - 4],
      [rootX + sign * 8, rootY + 2],
    ],
    far ? p.pinkShade : p.pink
  );
  pxLine(c, rootX, rootY, rootX + sign * 6, rootY - 13 - lift, p.deep, 2);
  pxLine(c, rootX + sign * 6, rootY - 13 - lift, rootX + sign * 18, rootY - 23 - lift, p.red, 2);
  pxLine(c, rootX + sign * 6, rootY - 13 - lift, rootX + sign * 14, rootY - 3, p.deep);
  pxPoly(
    c,
    [
      [rootX + sign * 16, rootY - 21 - lift],
      [rootX + sign * 16, rootY - 28 - lift],
      [rootX + sign * 20, rootY - 23 - lift],
    ],
    p.snow
  );
}
function paintDarrenFallback(
  c,
  dir,
  state,
  frame,
  weight = 0,
  scarf = true,
  motion = 0,
  attackTime = null
) {
  const p = PIXEL_PALETTE,
    count = DARREN_STATES[state],
    phase = (frame / count) * TAU,
    walking = state === 'walk' || state === 'roll',
    back = dir >= 5,
    side = dir === 0 || dir === 4,
    front = dir === 2,
    straightBack = dir === 6;
  const mirror = [3, 4, 5].includes(dir);
  c.save();
  if (mirror) {
    c.translate(64, 0);
    c.scale(-1, 1);
  }
  const stride = walking ? Math.round(Math.sin(phase) * 3) : 0,
    bob = walking
      ? -Math.abs(Math.round(Math.sin(phase) * 2))
      : state === 'special'
        ? -4 - Math.round(Math.sin(phase) * 2)
        : state === 'dodge'
          ? -3
          : 0;
  const melee = ['punch', 'cross', 'kick', 'tail'].includes(state),
    poseT = frame / 7,
    extension = melee ? darrenStrikeExtension(state, attackTime, frame) : 0;
  const fx = Math.abs(Math.cos((dir * Math.PI) / 4)),
    fy = Math.sin((dir * Math.PI) / 4);
  const squash = state === 'dodge' ? 2 : state === 'hurt' ? 1 : 0,
    lean =
      state === 'throw'
        ? Math.round(Math.sin((frame / 4) * Math.PI) * 3)
        : state === 'roll'
          ? 2
          : melee
            ? Math.round(extension * 3)
            : 0;
  const softness = softMotion && !reduceMotion;
  const breath = softness && state === 'idle' ? Math.sin(phase) : 0,
    wobble = softness
      ? Math.sin(phase - (melee ? 2 : 1)) *
        Math.min(2, weight * 0.65) *
        (walking || melee ? 1.3 : 0.6)
      : 0;
  const bX = 32 + lean + Math.round(wobble + (softness ? motion : 0)),
    bY = 48 + bob + Math.round(breath * 0.55),
    bW = 8 + weight + breath * 0.55,
    headX = front || straightBack ? 32 : side ? 36 : 34,
    headY = 27 + bob + squash;
  // Long curling tail and narrow limbs keep the silhouette unmistakably Shoyru.
  const tailSign = front || straightBack ? 1 : -1,
    tail = !softness
      ? 0
      : walking
        ? Math.round(Math.sin(phase - 1) * 2)
        : Math.round(Math.sin(phase) * 1);
  if (state !== 'tail') {
    pxPoly(
      c,
      [
        [bX - 2, 53 + bob],
        [bX + tailSign * 14, 58 + bob],
        [bX + tailSign * 25, 51 + tail],
        [bX + tailSign * 22, 58 + tail],
        [bX + tailSign * 10, 62],
        [bX - 4, 59],
      ],
      p.outline
    );
    pxPoly(
      c,
      [
        [bX - 1, 53 + bob],
        [bX + tailSign * 14, 58 + bob],
        [bX + tailSign * 22, 54 + tail],
        [bX + tailSign * 19, 58 + tail],
        [bX + tailSign * 10, 60],
        [bX - 3, 57],
      ],
      p.deep
    );
  }
  function sweepingTail() {
    const reach = 22 + Math.max(0, extension) * 6,
      tx = bX + fx * reach,
      ty = 54 + bob + fy * reach * 0.48;
    pxPoly(
      c,
      [
        [bX - 5, 51 + bob],
        [bX + 5, 53 + bob],
        [tx, ty - 4],
        [tx + 2, ty + 3],
        [tx - 5, ty + 5],
        [bX - 5, 59 + bob],
      ],
      p.outline
    );
    pxPoly(
      c,
      [
        [bX - 3, 53 + bob],
        [bX + 5, 55 + bob],
        [tx - 1, ty - 2],
        [tx, ty + 2],
        [tx - 6, ty + 3],
        [bX - 3, 57 + bob],
      ],
      p.red
    );
    pxLine(c, bX + 4, 55 + bob, tx - 4, ty, p.light, 2);
  }
  if (state === 'tail' && fy <= 0) sweepingTail();
  const flap =
    state === 'special'
      ? Math.round(Math.sin(phase) * 5)
      : softness
        ? Math.round(Math.sin(phase) * 2)
        : 0;
  if (!back) {
    pixelWing(c, 31, 40 + bob, 1, flap, true);
    pixelWing(c, 27, 40 + bob, -1, flap, false);
  }
  for (const [x, s] of [
    [27, -stride],
    [37, stride],
  ]) {
    if (state === 'kick' && x === 37) {
      const ex = x + fx * extension * 21,
        ey = 61 + bob + fy * extension * 15 - Math.sin((Math.max(0, extension) * Math.PI) / 2) * 10;
      pxLine(c, bX + 4, 51 + bob, x + fx * extension * 11, 55 + bob - 5 * extension, p.outline, 5);
      pxLine(c, x + fx * extension * 11, 55 + bob - 5 * extension, ex, ey, p.outline, 5);
      pxLine(c, bX + 5, 52 + bob, ex, ey, p.red, 3);
      pxOval(c, ex, ey, 6, 4, p.outline);
      pxOval(c, ex, ey - 1, 5, 3, p.red);
      pxOval(c, ex + 2, ey, 3, 2, p.deep);
      pxRect(c, ex, ey - 2, 2, 1, p.shine);
      continue;
    }
    pxRect(c, x - 2, 54 + bob, 4, 8 + s - bob, p.outline);
    pxRect(c, x - 1, 54 + bob, 2, 8 + s - bob, p.red);
    pxOval(c, x + (side ? 2 : 0), 63 + s, 5, 3, p.outline);
    pxOval(c, x + (side ? 2 : 0), 62 + s, 4, 2, p.red);
    pxRect(c, x + (side ? 2 : 0), 63 + s, 4, 2, p.deep);
    pxRect(c, x + 1, 62 + s, 1, 1, p.shine);
  }
  pxOval(c, bX, bY, bW + 1, 13 - squash, p.outline);
  pxOval(c, bX, bY - 1, bW, 12 - squash, p.red);
  // Single continuous surface, including the chest. Only the belly radius changes.
  pxOval(c, bX - 2, bY - 1, bW - 2, 10 - squash, p.light);
  pxOval(c, bX + 5, bY + 3, 3, 6, p.red);
  if (back) {
    pixelWing(c, 29, 40 + bob, -1, flap, true);
    pixelWing(c, 35, 40 + bob, 1, flap, false);
  }
  const charge = state === 'charge',
    throwing = state === 'throw',
    rolling = state === 'roll',
    dodge = state === 'dodge';
  for (const sign of [-1, 1]) {
    const extend = charge
      ? 4
      : throwing
        ? Math.round(Math.sin((frame / 4) * Math.PI) * 10)
        : rolling
          ? 6
          : dodge
            ? -3
            : 0;
    let handX = bX + sign * (bW + 1) + (front ? 0 : extend),
      handY =
        44 + bob + (walking ? sign * stride : 0) - (charge ? 5 : throwing ? 8 : rolling ? 2 : 0);
    if (melee) {
      const striking = (state === 'punch' && sign === -1) || (state === 'cross' && sign === 1);
      if (striking) {
        handX = clamp(bX + fx * extension * 29 + sign * 3, 3, 60);
        handY = 44 + bob + fy * extension * 16 - 4 * extension;
      } else {
        handX = bX + sign * (bW + 3) - fx * extension * 3;
        handY = 42 + bob - 4;
      }
    }
    pxLine(c, bX + sign * 6, 41 + bob, handX, handY, p.outline, 4);
    pxLine(c, bX + sign * 6, 41 + bob, handX, handY, p.red, 2);
    pxOval(c, handX + 1, handY + 1, 3, 3, p.outline);
    pxOval(c, handX + 1, handY, 2, 2, p.light);
  }
  if (state === 'tail' && fy > 0) sweepingTail();
  // Scarf streamers carry a delayed sway, with pink dots at every angle.
  const flow = !softness
    ? melee
      ? Math.round(extension * 2)
      : 0
    : Math.round(
        (walking || melee
          ? Math.sin(phase - 1) * Math.min(6, melee ? 5 + weight * 0.3 : 3 + weight * 0.45)
          : Math.sin(phase)) +
          motion * 0.5
      );
  if (scarf && (!back || straightBack)) {
    pxPoly(
      c,
      [
        [27, 37 + bob],
        [20, 42 + bob],
        [8, 39 + flow + bob],
        [11, 45 + flow + bob],
        [24, 47 + bob],
        [30, 41 + bob],
      ],
      p.goldShade
    );
    pxLine(c, 12, 42 + flow + bob, 22, 44 + bob, p.gold, 2);
    pxRect(c, 14, 42 + flow + bob, 2, 2, p.dot);
    pxRect(c, 23, 43 + bob, 2, 2, p.dot);
  }
  // Single swept crest.
  pxPoly(
    c,
    [
      [headX - 9, headY - 8],
      [headX - 9, headY - 18],
      [headX - 13, headY - 25],
      [headX - 6, headY - 24],
      [headX + 4, headY - 14],
      [headX + 7, headY - 5],
    ],
    p.outline
  );
  pxPoly(
    c,
    [
      [headX - 7, headY - 8],
      [headX - 7, headY - 18],
      [headX - 10, headY - 23],
      [headX - 6, headY - 21],
      [headX + 3, headY - 13],
      [headX + 5, headY - 7],
    ],
    p.red
  );
  pxLine(c, headX - 8, headY - 21, headX - 2, headY - 16, p.light, 2);
  pxOval(c, headX, headY, 13, 14, p.outline);
  pxOval(c, headX, headY - 1, 12, 13, p.red);
  pxOval(c, headX - 3, headY - 4, 9, 9, p.light);
  if (back) {
    pxOval(c, headX + 4, headY + 3, 7, 9, p.red);
    pxRect(c, headX - 5, headY - 7, 3, 2, p.shine);
  } else {
    const muzzle = front ? headX : headX + 8;
    pxOval(c, muzzle, headY + 8, front ? 10 : 9, 6, p.outline);
    pxOval(c, muzzle, headY + 7, front ? 9 : 9, 5, p.light);
    const blink = state === 'hurt' || (state === 'idle' && frame === 7);
    const eyes = front ? [headX - 6, headX + 6] : side ? [headX + 3] : [headX - 4, headX + 7];
    for (const ex of eyes) {
      if (blink) {
        pxLine(c, ex - 2, headY, ex + 2, headY + 1, p.ink, 1);
      } else {
        pxOval(c, ex, headY, 3, 6, p.outline);
        pxOval(c, ex, headY, 2, 5, p.snow);
        pxRect(c, ex, headY - 2, 2, 6, p.deep);
        pxRect(c, ex + 1, headY - 1, 1, 5, p.ink);
        pxRect(c, ex, headY - 3, 1, 2, p.snow);
      }
      pxLine(c, ex - 3, headY - 7, ex + 2, headY - 6, p.deep);
    }
    pxRect(c, muzzle + (front ? 4 : 6), headY + 6, 1, 1, p.deep);
    pxLine(c, muzzle - 2, headY + 10, muzzle + 5, headY + 10, p.deep);
    pxRect(c, headX - 7, headY - 10, 4, 1, p.shine);
  }
  if (scarf) {
    pxOval(c, 32, 39 + bob, 11, 4, p.outline);
    pxOval(c, 32, 38 + bob, 10, 3, p.gold);
    pxRect(c, 23, 40 + bob, 18, 2, p.goldShade);
    for (const x of [25, 32, 39]) pxRect(c, x, 37 + bob, 2, 2, p.dot);
    if (!back) {
      pxPoly(
        c,
        [
          [32, 40 + bob],
          [40, 40 + bob],
          [39, 52 + bob + flow],
          [33, 54 + bob + flow],
        ],
        p.goldShade
      );
      pxRect(c, 33, 41 + bob, 5, 10 + flow, p.gold);
      pxRect(c, 34, 44 + bob, 2, 2, p.dot);
      pxRect(c, 35, 49 + bob + flow, 2, 2, p.dot);
    }
  }
  // The striking paw crosses in front of the scarf on the contact frames.
  if ((state === 'punch' || state === 'cross') && extension > 0.1) {
    const sign = state === 'punch' ? -1 : 1,
      hx = clamp(bX + fx * extension * 29 + sign * 3, 3, 60),
      hy = 44 + bob + fy * extension * 16 - 4 * extension;
    pxLine(c, bX + sign * 6, 42 + bob, hx, hy, p.outline, 5);
    pxLine(c, bX + sign * 6 + 1, 43 + bob, hx, hy, p.red, 3);
    pxOval(c, hx, hy, 4, 4, p.outline);
    pxOval(c, hx, hy - 1, 3, 3, p.light);
    pxRect(c, hx - 1, hy - 3, 2, 1, p.shine);
  }
  if (charge) {
    pxOval(c, bX + (front ? 0 : 11), 37 + bob, 4 + frame, 4 + frame, p.ice);
    pxOval(c, bX + (front ? 0 : 11) - 1, 36 + bob, 3 + frame, 3 + frame, p.snow);
  }
  c.restore();
}
function facing8(angle) {
  const p = groundProject(Math.cos(angle), Math.sin(angle));
  return (Math.round(Math.atan2(p.y, p.x) / (Math.PI / 4)) + 8) % 8;
}
function buildDarrenAtlas(scene, weight) {
  const key =
    'darren-' +
    weight +
    '-' +
    (wearScarf ? 'scarf' : 'bare') +
    '-' +
    (softMotion ? 'soft' : 'still');
  if (scene.textures.exists(key)) return key;
  const total = Object.values(DARREN_STATES).reduce((a, b) => a + b, 0) * 8,
    tex = scene.textures.createCanvas(
      key,
      16 * DARREN_FRAME_W,
      Math.ceil(total / 16) * DARREN_FRAME_H
    ),
    c = tex.context;
  let i = 0;
  for (const [state, count] of Object.entries(DARREN_STATES))
    for (let dir = 0; dir < 8; dir++)
      for (let frame = 0; frame < count; frame++) {
        const x = (i % 16) * DARREN_FRAME_W,
          y = Math.floor(i / 16) * DARREN_FRAME_H;
        c.save();
        c.beginPath();
        c.rect(x, y, DARREN_FRAME_W, DARREN_FRAME_H);
        c.clip();
        c.translate(x, y);
        paintDarren(c, dir, state, frame, weight, wearScarf);
        c.restore();
        tex.add(`${state}-${dir}-${frame}`, 0, x, y, DARREN_FRAME_W, DARREN_FRAME_H);
        i++;
      }
  tex.setFilter(Phaser.Textures.FilterMode.NEAREST);
  tex.refresh();
  return key;
}
function meleeAnimation(mode) {
  return ['punch', 'cross', 'kick', 'tail'].includes(mode);
}
function darrenAnimation() {
  if (!P || state === 'title')
    return { state: 'idle', frame: Math.floor(rt * 5) % 8, dir: 1, weight: 0 };
  const mode =
    P.hurtT > 0
      ? 'hurt'
      : P.dash > 0
        ? 'dodge'
        : P.musou
          ? 'special'
          : P.atk
            ? P.atk.d.pose
            : P.throwT > 0
              ? 'throw'
              : P.roll
                ? 'roll'
                : chargeHeld
                  ? 'charge'
                  : P.moving
                    ? 'walk'
                    : 'idle';
  const count = DARREN_STATES[mode];
  let frame =
    Math.floor(mode === 'roll' ? P.roll.age * 12 : mode === 'walk' ? P.animT * 12 : P.t * 5) %
    count;
  if (P.atk && meleeAnimation(mode)) frame = clamp(Math.floor((P.atk.t / P.atk.d.dur) * 8), 0, 7);
  if (mode === 'hurt') frame = clamp(Math.floor(((0.3 - P.hurtT) / 0.3) * count), 0, count - 1);
  if (mode === 'dodge') frame = clamp(Math.floor(((0.2 - P.dash) / 0.2) * count), 0, count - 1);
  if (mode === 'special') frame = Math.floor(P.musou.t * 8) % count;
  if (mode === 'throw')
    frame = clamp(
      Math.floor((((P.throwDuration || 0.28) - P.throwT) / (P.throwDuration || 0.28)) * 4),
      0,
      3
    );
  if (mode === 'charge') frame = clamp(Math.floor((chargeTime / 0.8) * 4), 0, 3);
  return {
    state: mode,
    frame,
    dir: facing8(
      P.dir + (mode === 'tail' ? darrenTailTurn(clamp(P.atk.t / P.atk.d.dur, 0, 1)) * TAU : 0)
    ),
    weight: Number.isFinite(P.displayWeight) ? P.displayWeight : P.weight,
    motion: P.bellyMotion || 0,
    attackTime: P.atk && meleeAnimation(mode) ? P.atk.t : null,
  };
}
// Make the retained prairie cast share the same crisp pixel density and stepped shading.
function quantizePixels(c, w, h) {
  const image = c.getImageData(0, 0, w, h),
    d = image.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 96) {
      d[i + 3] = 0;
      continue;
    }
    d[i + 3] = 255;
    for (let j = 0; j < 3; j++) d[i + j] = Math.min(255, Math.round(d[i + j] / 17) * 17);
  }
  c.putImageData(image, 0, 0);
}

// Cosmetic only: combat and checkpoint storage continue to use the integer P.weight.
function updateDarrenMotion(dt) {
  if (!P || !Number.isFinite(dt) || dt <= 0) return;
  dt = Math.min(0.04, dt);
  if (!Number.isFinite(P.displayWeight)) P.displayWeight = P.weight;
  const prior = P.motionWeight ?? P.weight;
  P.bellyVelocity = P.bellyVelocity || 0;
  P.bellyMotion = P.bellyMotion || 0;
  if (P.weight !== prior) {
    P.bellyVelocity = clamp(P.bellyVelocity - (P.weight - prior) * 6, -9, 9);
    P.motionWeight = P.weight;
  }
  P.displayWeight += (P.weight - P.displayWeight) * (1 - Math.exp(-dt * 6));
  if (Math.abs(P.weight - P.displayWeight) < 0.002) P.displayWeight = P.weight;
  P.bellyVelocity += (-65 * P.bellyMotion - 12 * P.bellyVelocity) * dt;
  P.bellyMotion = clamp(P.bellyMotion + P.bellyVelocity * dt, -1.2, 1.2);
}

function darrenStrikeExtension(state, time, frame = 0) {
  const d = WEAPONS.paws.chain.find((a) => a.pose === state);
  if (!d) return 0;
  const t = time == null ? (frame / 7) * d.dur : clamp(time, 0, d.dur),
    ease = (u) => {
      u = clamp(u, 0, 1);
      return u * u * (3 - 2 * u);
    },
    back = d.act[0] * 0.4;
  if (t < back) return -0.15 * ease(t / back);
  if (t < d.act[0]) return -0.15 + 1.15 * ease((t - back) / (d.act[0] - back));
  if (t <= d.act[1]) return 1;
  return 1 - ease((t - d.act[1]) / (d.dur - d.act[1]));
}
