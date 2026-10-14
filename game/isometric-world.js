'use strict';
// A deterministic height field shared by drawing, traversal, projectiles and navigation.
const LAND_STEP = 80;
const TERRACES = [
  { x0: 160, x1: 880, y0: 960, y1: 1600, h: 96, name: 'Snowbell Overlook' },
  { x0: 1040, x1: 1680, y0: 320, y1: 960, h: 160, name: 'Spud Barricade' },
  { x0: 1120, x1: 1840, y0: 1680, y1: 2320, h: 128, name: 'Windswept Ring' },
  { x0: 2160, x1: 2880, y0: 800, y1: 1520, h: 224, name: 'Coop Command' },
  { x0: 3040, x1: 3520, y0: 960, y1: 1760, h: 320, name: 'Bramble Keep' },
];
const RAMPS = [
  { x0: 880, x1: 1200, y0: 1200, y1: 1440, axis: 'x', from: 96, to: 0 },
  { x0: 1280, x1: 1520, y0: 960, y1: 1280, axis: 'y', from: 160, to: 0 },
  { x0: 1280, x1: 1600, y0: 1360, y1: 1680, axis: 'y', from: 0, to: 128 },
  { x0: 1840, x1: 2160, y0: 1040, y1: 1360, axis: 'x', from: 0, to: 224 },
  { x0: 2880, x1: 3040, y0: 1200, y1: 1440, axis: 'x', from: 224, to: 320 },
];
const TRAILS = [
  [
    [420, 1300],
    [720, 1320],
    [1200, 1320],
    [1400, 1320],
  ],
  [
    [1400, 1320],
    [1400, 1120],
    [1360, 640],
  ],
  [
    [1400, 1320],
    [1440, 1640],
    [1440, 2000],
  ],
  [
    [1400, 1320],
    [1760, 1200],
    [2160, 1200],
    [2520, 1180],
  ],
  [
    [2520, 1180],
    [2720, 1320],
    [3120, 1320],
    [3240, 1330],
  ],
];
function insideRect(x, y, r) {
  return x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1;
}
function streamCenter(y) {
  return 1000 + Math.sin(y * 0.004) * 70;
}
function isFrozenStream(x, y) {
  return Math.abs(x - streamCenter(y)) < 72;
}
function worldHeight(x, y) {
  for (const r of RAMPS)
    if (insideRect(x, y, r)) {
      const t = r.axis === 'x' ? (x - r.x0) / (r.x1 - r.x0) : (y - r.y0) / (r.y1 - r.y0);
      return r.from + (r.to - r.from) * t;
    }
  for (const t of TERRACES) if (insideRect(x, y, t)) return t.h;
  return isFrozenStream(x, y) ? -24 : 0;
}
function worldPoint(x, y, z) {
  const p = groundProject(x, y);
  return { x: p.x, y: p.y - z };
}
function roadDistance(x, y) {
  let best = 1e9;
  for (const path of TRAILS)
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1],
        b = path[i],
        dx = b[0] - a[0],
        dy = b[1] - a[1],
        t = clamp(((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy), 0, 1);
      best = Math.min(best, Math.hypot(x - a[0] - dx * t, y - a[1] - dy * t));
    }
  return best;
}
function seedNoise(x, y, k = 0) {
  const f = Math.sin(x * 127.1 + y * 311.7 + k * 74.7) * 43758.5453;
  return f - Math.floor(f);
}
function terrainCanStep(ax, ay, bx, by) {
  if (bx < 24 || by < 24 || bx > WORLD.w - 24 || by > WORLD.h - 24) return false;
  return (
    Math.abs(worldHeight(bx, by) - worldHeight(ax, ay)) <=
    Math.max(26, Math.hypot(bx - ax, by - ay) * 0.85 + 3)
  );
}
function hitsScenery(x, y, r = 14) {
  for (const p of props) {
    if (!p.r) continue;
    if (p.box) {
      if (Math.abs(x - p.x) < p.box.w / 2 + r && Math.abs(y - p.y) < p.box.d / 2 + r) return true;
    } else if (Math.hypot(x - p.x, y - p.y) < p.r + r) return true;
  }
  return false;
}
function canOccupy(x, y, r = 14) {
  return x >= 24 && y >= 24 && x <= WORLD.w - 24 && y <= WORLD.h - 24 && !hitsScenery(x, y, r);
}
function terrainMove(actor, dx, dy, r = 14) {
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 10));
  dx /= steps;
  dy /= steps;
  for (let i = 0; i < steps; i++) {
    if (
      terrainCanStep(actor.x, actor.y, actor.x + dx, actor.y + dy) &&
      canOccupy(actor.x + dx, actor.y + dy, r)
    ) {
      actor.x += dx;
      actor.y += dy;
      continue;
    }
    if (
      terrainCanStep(actor.x, actor.y, actor.x + dx, actor.y) &&
      canOccupy(actor.x + dx, actor.y, r)
    )
      actor.x += dx;
    if (
      terrainCanStep(actor.x, actor.y, actor.x, actor.y + dy) &&
      canOccupy(actor.x, actor.y + dy, r)
    )
      actor.y += dy;
  }
}
// Shared reverse path field avoids a separate A* search for every grunt.
const NAV = 40,
  NX = Math.ceil(WORLD.w / NAV),
  NY = Math.ceil(WORLD.h / NAV);
let navField = null,
  navTarget = -1,
  navAge = 0,
  navEdges = null,
  navWalk = null;
function cellId(x, y) {
  return clamp(Math.floor(x / NAV), 0, NX - 1) + clamp(Math.floor(y / NAV), 0, NY - 1) * NX;
}
function navCenter(id) {
  return { x: ((id % NX) + 0.5) * NAV, y: (Math.floor(id / NX) + 0.5) * NAV };
}
function walkableSegment(ax, ay, bx, by, r = 12) {
  const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 10));
  let px = ax,
    py = ay;
  for (let i = 1; i <= n; i++) {
    const x = ax + ((bx - ax) * i) / n,
      y = ay + ((by - ay) * i) / n;
    if (!terrainCanStep(px, py, x, y) || !canOccupy(x, y, r)) return false;
    px = x;
    py = y;
  }
  return true;
}
function prepareNavigation() {
  navWalk = new Uint8Array(NX * NY);
  navEdges = new Int32Array(NX * NY * 4);
  navEdges.fill(-1);
  for (let id = 0; id < NX * NY; id++) {
    const p = navCenter(id);
    navWalk[id] = canOccupy(p.x, p.y, 14) ? 1 : 0;
  }
  const offsets = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  for (let id = 0; id < NX * NY; id++) {
    if (!navWalk[id]) continue;
    const a = navCenter(id),
      cx = id % NX,
      cy = Math.floor(id / NX);
    for (let j = 0; j < 4; j++) {
      const [ox, oy] = offsets[j],
        xx = cx + ox,
        yy = cy + oy;
      if (xx < 0 || yy < 0 || xx >= NX || yy >= NY) continue;
      const n = xx + yy * NX;
      if (!navWalk[n]) continue;
      const b = navCenter(n);
      if (walkableSegment(a.x, a.y, b.x, b.y, 14)) navEdges[id * 4 + j] = n;
    }
  }
}
function buildNavigation(x, y) {
  if (!navEdges) prepareNavigation();
  const requested = cellId(x, y);
  let target = requested;
  if (!navWalk[target]) {
    let nearest = Infinity;
    for (let i = 0; i < navWalk.length; i++) {
      if (!navWalk[i]) continue;
      const p = navCenter(i),
        d = Math.hypot(x - p.x, y - p.y);
      if (d < nearest) {
        nearest = d;
        target = i;
      }
    }
  }
  const dist = new Int32Array(NX * NY);
  dist.fill(-1);
  const queue = new Int32Array(NX * NY);
  queue[0] = target;
  dist[target] = 0;
  let start = 0,
    end = 1;
  while (start < end) {
    const id = queue[start++];
    for (let j = 0; j < 4; j++) {
      const n = navEdges[id * 4 + j];
      if (n < 0 || dist[n] >= 0) continue;
      dist[n] = dist[id] + 1;
      queue[end++] = n;
    }
  }
  navField = dist;
  navTarget = requested;
  navAge = 0;
}
function navDirection(e, tx, ty) {
  const dx = tx - e.x,
    dy = ty - e.y,
    d = Math.hypot(dx, dy) || 1;
  // A short clear segment may be smoothed; long paths must follow the complete field.
  if (d < 180 && walkableSegment(e.x, e.y, tx, ty, 12)) return Math.atan2(dy, dx);
  if (!navField || (navTarget !== cellId(tx, ty) && navAge > 0.25)) buildNavigation(tx, ty);
  const id = cellId(e.x, e.y),
    cx = id % NX,
    cy = Math.floor(id / NX);
  let best = id,
    score = navField[id] < 0 ? 1e9 : navField[id];
  for (const [ox, oy] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [1, 1],
    [-1, 1],
    [1, -1],
    [-1, -1],
  ]) {
    const xx = cx + ox,
      yy = cy + oy;
    if (xx < 0 || yy < 0 || xx >= NX || yy >= NY) continue;
    const n = xx + yy * NX,
      p = navCenter(n);
    if (navField[n] >= 0 && navField[n] < score && walkableSegment(e.x, e.y, p.x, p.y, 12)) {
      best = n;
      score = navField[n];
    }
  }
  const p = navCenter(best);
  return best === id ? Math.atan2(dy, dx) : Math.atan2(p.y - e.y, p.x - e.x);
}
function lineOfTerrain(ax, ay, bx, by, z) {
  const d = Math.hypot(bx - ax, by - ay);
  for (let t = 0; t <= 1; t += 1 / Math.max(1, Math.ceil(d / 18))) {
    const x = ax + (bx - ax) * t,
      y = ay + (by - ay) * t;
    if (worldHeight(x, y) > z + 5 || hitsScenery(x, y, 0)) return false;
  }
  return true;
}
function groundCombatReach(a, b) {
  return Math.abs(worldHeight(a.x, a.y) - worldHeight(b.x, b.y)) < 48;
}
function makeWorldScenery() {
  props.length = 0;
  tufts.length = 0;
  const add = (kind, x, y, extra = {}) => props.push({ kind, x, y, r: 0, ...extra });
  add('cottage', 330, 1090, { r: 92, box: { w: 170, d: 140 }, variant: 0 });
  add('cottage', 680, 1100, { r: 75, box: { w: 140, d: 124 }, variant: 1 });
  add('well', 620, 1490, { r: 27 });
  add('sign', 680, 1370, { r: 10 });
  add('lantern', 450, 1180, { r: 9 });
  add('lantern', 785, 1490, { r: 9 });
  for (const [x, y] of [
    [230, 1510],
    [215, 1370],
    [765, 980],
    [850, 1100],
    [185, 1000],
    [700, 1560],
  ])
    add('pine3d', x, y, { r: 16, s: 1.1 + seedNoise(x, y) * 0.35 });
  for (const c of CAMPS) {
    add('tent3d', c.x - 140, c.y - 120, { r: 53, box: { w: 110, d: 105 }, color: c.color });
    add('flag3d', c.x + 115, c.y - 60, { r: 8, color: c.color, camp: CAMPS.indexOf(c) });
    add('supply', c.x - 140, c.y + 140, { r: 30 });
    for (const [dx, dy] of [
      [-220, -170],
      [220, 200],
    ])
      add('lantern', c.x + dx, c.y + dy, { r: 8 });
  }
  // Rail posts follow the actual ramp surfaces; snowballs and characters share these heights.
  for (const r of [RAMPS[0], RAMPS[4]])
    for (let x = r.x0 + 16; x < r.x1; x += 56)
      for (const y of [r.y0 + 8, r.y1 - 8]) add('bridgeRail', x, y, { r: 5 });
  add('keep', 3380, 1150, { r: 100, box: { w: 180, d: 150 } });
  for (const y of [1080, 1630]) add('tower3d', 3140, y, { r: 48 });
  add('archPillar', 3035, 1180, { r: 22 });
  add('archPillar', 3035, 1460, { r: 22 });
  for (let i = 0; i < 235; i++) {
    const x = 90 + seedNoise(i, 5) * 3420,
      y = 90 + seedNoise(i, 6) * 2420;
    if (
      roadDistance(x, y) < 118 ||
      !farFromPOI(x, y, 285) ||
      RAMPS.some((r) => insideRect(x, y, r)) ||
      isFrozenStream(x, y) ||
      hitsScenery(x, y, 45)
    )
      continue;
    add(i % 6 ? 'pine3d' : 'rock3d', x, y, { r: i % 6 ? 17 : 23, s: 0.8 + seedNoise(i, 7) * 0.65 });
  }
  for (let i = 0; i < 570; i++) {
    const x = seedNoise(i, 8) * WORLD.w,
      y = seedNoise(i, 9) * WORLD.h;
    if (roadDistance(x, y) > 68 && !isFrozenStream(x, y))
      tufts.push({ x, y, s: 0.5 + seedNoise(i, 10) * 0.7, hue: seedNoise(i, 11) });
  }
}
makeWorldScenery();

// Mesh geometry is lit from one world-space sun, then projected at the active camera angle.
const SUN = { x: -0.55, y: -0.75, z: 1 };
function litColor(hex, n = [0, 0, 1], boost = 0) {
  const a = parseInt(hex.slice(1), 16),
    len = Math.hypot(...n) || 1,
    d = (n[0] * SUN.x + n[1] * SUN.y + n[2] * SUN.z) / len / 1.37,
    k = clamp(0.78 + Math.max(0, d) * 0.3 + boost, 0.52, 1.14);
  const r = clamp(Math.round((a >> 16) * k), 0, 255),
    g = clamp(Math.round(((a >> 8) & 255) * k), 0, 255),
    b = clamp(Math.round((a & 255) * k + (1 - k) * 19), 0, 255);
  return `rgb(${r},${g},${b})`;
}
function faceNormal(v) {
  const a = v[0],
    b = v[1],
    c = v[2],
    u = b.map((v, i) => v - a[i]),
    w = c.map((v, i) => v - a[i]);
  return [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
}
function addFace(m, v, col, glow = false) {
  m.push({ v, col, glow });
}
function meshBox(m, x, y, z, w, d, h, col, top = col) {
  const q = [
      [x - w / 2, y - d / 2, z],
      [x + w / 2, y - d / 2, z],
      [x + w / 2, y + d / 2, z],
      [x - w / 2, y + d / 2, z],
    ],
    t = q.map((p) => [p[0], p[1], z + h]);
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    addFace(m, [q[i], q[j], t[j], t[i]], col);
  }
  addFace(m, t, top);
}
function coneMesh(m, x, y, z, r, h, col, n = 8, phase = 0) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + phase,
      b = ((i + 1) / n) * TAU + phase;
    addFace(
      m,
      [
        [x + Math.cos(a) * r, y + Math.sin(a) * r, z],
        [x + Math.cos(b) * r, y + Math.sin(b) * r, z],
        [x, y, z + h],
      ],
      col
    );
  }
}
function modelMesh(p) {
  const m = [],
    s = p.s || 1;
  if (p.kind === 'pine3d') {
    meshBox(m, 0, 0, 0, 15 * s, 16 * s, 64 * s, '#7c6053');
    for (const [z, r, h] of [
      [27, 69, 101],
      [90, 55, 94],
      [145, 37, 83],
    ]) {
      coneMesh(m, 0, 0, z * s, r * s, h * s, '#367367');
      coneMesh(m, 0, 0, (z + 19) * s, r * 0.82 * s, (h - 18) * s, '#eef5e9');
    }
  } else if (p.kind === 'rock3d') {
    const n = 7;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU,
        b = ((i + 1) / n) * TAU,
        r = (32 + seedNoise(i, 2) * 10) * s;
      addFace(
        m,
        [
          [Math.cos(a) * r, Math.sin(a) * r, 0],
          [Math.cos(b) * r, Math.sin(b) * r, 0],
          [Math.cos(b) * r * 0.72, Math.sin(b) * r * 0.72, 35 * s],
          [Math.cos(a) * r * 0.72, Math.sin(a) * r * 0.72, 35 * s],
        ],
        '#72888a'
      );
    }
    coneMesh(m, 0, 0, 32 * s, 30 * s, 12 * s, '#e8f1e5', 7);
  } else if (p.kind === 'cottage' || p.kind === 'keep') {
    const keep = p.kind === 'keep',
      w = keep ? 180 : p.variant ? 140 : 170,
      d = keep ? 150 : p.variant ? 124 : 140,
      h = keep ? 170 : 96;
    meshBox(m, 0, 0, 0, w + 14, d + 14, 18, '#6b7980', '#b5c3bc');
    meshBox(m, 0, 0, 18, w, d, h, keep ? '#819597' : '#dfc6a0');
    for (const x of [-w / 2 + 5, w / 2 - 5])
      for (const y of [-d / 2 + 5, d / 2 - 5])
        meshBox(m, x, y, 18, 10, 10, h, keep ? '#647c80' : '#715443');
    meshBox(m, 0, 0, h + 12, w + 14, d + 14, 8, '#725653');
    const z = h + 20,
      roof = keep ? 95 : 77,
      a = [-w / 2 - 14, -d / 2 - 15, z],
      b = [w / 2 + 14, -d / 2 - 15, z],
      c = [w / 2 + 14, d / 2 + 15, z],
      dd = [-w / 2 - 14, d / 2 + 15, z],
      r1 = [0, -d / 2 - 15, z + roof],
      r2 = [0, d / 2 + 15, z + roof];
    addFace(m, [a, dd, r2, r1], '#eff6e8');
    addFace(m, [c, b, r1, r2], '#d5e7df');
    addFace(m, [a, b, r1], keep ? '#536d80' : '#866053');
    addFace(m, [c, dd, r2], keep ? '#718b99' : '#cba887');
    for (let y = -d / 2; y < d / 2; y += 26) {
      addFace(
        m,
        [
          [-w / 2 - 13, y, z + 2],
          [-w / 2 - 13, y + 4, z + 2],
          [0, y + 4, z + roof + 1],
          [0, y, z + roof + 1],
        ],
        '#d0e1da'
      );
    }
    meshBox(m, -w * 0.27, -d * 0.2, z + 15, 25, 28, roof, '#8c7168');
    meshBox(m, -w * 0.27, -d * 0.2, z + roof + 9, 34, 35, 9, '#f6f7e5');
    // Windows and door lie on the actual walls, not screen-facing stickers.
    addFace(
      m,
      [
        [-17, d / 2 + 1, 20],
        [17, d / 2 + 1, 20],
        [17, d / 2 + 1, 79],
        [-17, d / 2 + 1, 79],
      ],
      '#624b48'
    );
    for (const x of [-w * 0.31, w * 0.31]) {
      addFace(
        m,
        [
          [x - 13, d / 2 + 2, 54],
          [x + 13, d / 2 + 2, 54],
          [x + 13, d / 2 + 2, 83],
          [x - 13, d / 2 + 2, 83],
        ],
        '#ffc975',
        true
      );
      meshBox(m, x, d / 2 + 4, 50, 32, 8, 4, '#f0f3da');
    }
    addFace(
      m,
      [
        [w / 2 + 1, -20, 54],
        [w / 2 + 1, 12, 54],
        [w / 2 + 1, 12, 83],
        [w / 2 + 1, -20, 83],
      ],
      '#fbd496',
      true
    );
    for (let i = 0; i < 3; i++)
      meshBox(m, 0, d / 2 + 12 + i * 12, 0, 43, 14, 16 - i * 4, '#8e9c9c', '#e0e8da');
  } else if (p.kind === 'tower3d' || p.kind === 'archPillar') {
    const w = p.kind === 'archPillar' ? 38 : 78,
      h = p.kind === 'archPillar' ? 132 : 204;
    meshBox(m, 0, 0, 0, w + 12, w + 12, 16, '#5c7280');
    meshBox(m, 0, 0, 16, w, w, h, '#90a2a6', '#dce8df');
    for (let z = 40; z < h; z += 34) meshBox(m, 0, 0, z, w + 3, w + 3, 3, '#647e88');
    for (const x of [-w * 0.35, w * 0.35])
      for (const y of [-w * 0.35, w * 0.35])
        meshBox(m, x, y, h + 16, w * 0.25, w * 0.25, 26, '#91a3a6', '#ecf4e9');
    addFace(
      m,
      [
        [-8, w / 2 + 1, 103],
        [8, w / 2 + 1, 103],
        [8, w / 2 + 1, 144],
        [-8, w / 2 + 1, 144],
      ],
      '#354858'
    );
  } else if (p.kind === 'tent3d') {
    meshBox(m, 0, 0, 0, 118, 112, 12, '#847868', '#d8ded0');
    const a = [-55, -50, 12],
      b = [55, -50, 12],
      cc = [55, 50, 12],
      d = [-55, 50, 12],
      r1 = [0, -50, 115],
      r2 = [0, 50, 115];
    addFace(m, [a, d, r2, r1], p.color);
    addFace(m, [b, cc, r2, r1], '#e9e5b9');
    addFace(m, [d, cc, r2], p.color);
    addFace(
      m,
      [
        [-15, 51, 12],
        [15, 51, 12],
        [0, 51, 64],
      ],
      '#3b5153'
    );
    meshBox(m, 0, -48, 0, 5, 5, 121, '#75604b');
  } else if (p.kind === 'lantern') {
    meshBox(m, 0, 0, 0, 22, 22, 9, '#647775', '#c9ddd0');
    meshBox(m, 0, 0, 9, 8, 8, 93, '#5e6561');
    meshBox(m, 0, 0, 97, 23, 23, 6, '#51645f');
    meshBox(m, 0, 0, 103, 18, 18, 27, '#ffd182', '#ffe9a5');
    coneMesh(m, 0, 0, 132, 21, 18, '#cadbd6', 4, Math.PI / 4);
  } else if (p.kind === 'bridgeRail') {
    meshBox(m, 0, 0, 0, 10, 10, 55, '#8b7059', '#d5ded0');
    meshBox(m, 20, 0, 41, 52, 6, 7, '#a28c70', '#e6edda');
  } else if (p.kind === 'flag3d') {
    meshBox(m, 0, 0, 0, 7, 7, 138, '#82684f');
    const col = G?.campsDone[p.camp] ? '#ffe180' : p.color;
    addFace(
      m,
      [
        [4, 0, 135],
        [56, Math.sin(rt * 3) * 4, 127],
        [56, 0, 90],
        [4, 0, 100],
      ],
      col
    );
    coneMesh(m, 0, 0, 138, 7, 12, '#ffd57b', 4);
  } else if (p.kind === 'supply') {
    meshBox(m, 0, 0, 0, 48, 43, 44, '#c39a59', '#e4e7cc');
    meshBox(m, -22, 14, 0, 29, 31, 23, '#ab8a59', '#e5ecd4');
    meshBox(m, 0, 0, 21, 50, 45, 3, '#77634e');
  } else if (p.kind === 'well') {
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      meshBox(m, Math.cos(a) * 25, Math.sin(a) * 25, 0, 18, 18, 32, '#92a2a1', '#dbe7db');
    }
    for (const x of [-30, 30]) meshBox(m, x, 0, 20, 8, 8, 71, '#7d6451');
    meshBox(m, 0, 0, 87, 74, 45, 8, '#819a97', '#e8f0e0');
  } else if (p.kind === 'sign') {
    meshBox(m, 0, 0, 0, 8, 8, 67, '#8b6f53');
    meshBox(m, 0, 0, 40, 55, 8, 26, '#bb986c', '#e6e8d0');
  }
  return m;
}
function drawMesh(c, mesh) {
  const faces = mesh.map((f) => ({
    ...f,
    points: f.v.map((p) => worldPoint(...p)),
    depth: f.v.reduce((n, p) => n + groundProject(p[0], p[1]).y + p[2] * 0.8, 0) / f.v.length,
    normal: faceNormal(f.v),
  }));
  faces.sort((a, b) => a.depth - b.depth);
  for (const f of faces) {
    poly(c, f.points, f.glow ? f.col : litColor(f.col, f.normal), null);
  }
}

class IsometricWorldRenderer {
  constructor(scene) {
    this.scene = scene;
    this.keys = new Set();
    this.quarter = -1;
    this.tiles = [];
    this.frame = 0;
    for (let x = 0; x < WORLD.w; x += LAND_STEP)
      for (let y = 0; y < WORLD.h; y += LAND_STEP) {
        const x1 = Math.min(WORLD.w, x + LAND_STEP),
          y1 = Math.min(WORLD.h, y + LAND_STEP),
          cx = (x + x1) / 2,
          cy = (y + y1) / 2;
        this.tiles.push({ x, y, x1, y1, cx, cy, id: x + '-' + y, h: worldHeight(cx, cy) });
      }
  }
  imageFrame(key, draw, vertices, pad = 4) {
    const full = 'depth-' + this.quarter + '-' + key;
    if (this.scene.textures.exists(full)) {
      const t = this.scene.textures.get(full);
      return t.worldFrame;
    }
    const pts = vertices.map((p) => worldPoint(...p)),
      minX = Math.floor(Math.min(...pts.map((p) => p.x))) - pad,
      minY = Math.floor(Math.min(...pts.map((p) => p.y))) - pad,
      maxX = Math.ceil(Math.max(...pts.map((p) => p.x))) + pad,
      maxY = Math.ceil(Math.max(...pts.map((p) => p.y))) + pad;
    const w = maxX - minX,
      h = maxY - minY,
      t = this.scene.textures.createCanvas(full, Math.max(w, 2), Math.max(h, 2)),
      c = t.context;
    c.translate(-minX, -minY);
    c.imageSmoothingEnabled = true;
    draw(c);
    t.refresh();
    t.setFilter(Phaser.Textures.FilterMode.LINEAR);
    t.worldFrame = {
      texture: full,
      frame: '__BASE',
      originX: -minX / w,
      originY: -minY / h,
      pixelScale: 1,
    };
    this.keys.add(full);
    return t.worldFrame;
  }
  sync() {
    if (this.quarter !== viewQuarter) {
      for (const [k, v] of this.scene.objects)
        if (
          typeof k === 'string' &&
          (k.startsWith('land-') || k.startsWith('cliff-') || k.startsWith('solid-'))
        ) {
          v.destroy();
          this.scene.objects.delete(k);
        }
      for (const k of this.keys) this.scene.textures.remove(k);
      this.keys.clear();
      this.quarter = viewQuarter;
    }
    const visible = [];
    for (const tile of this.tiles) {
      const p = screenPoint(tile.cx, tile.cy);
      if (p.x < -170 || p.x > W + 170 || p.y < -260 || p.y > H + 260) continue;
      visible.push(tile);
    }
    for (const t of visible) {
      const loc = [
          [t.x, t.y],
          [t.x1, t.y],
          [t.x1, t.y1],
          [t.x, t.y1],
        ],
        corners = loc.map(([x, y]) => [
          x - t.cx,
          y - t.cy,
          worldHeight(x + (x === t.x ? 0.01 : -0.01), y + (y === t.y ? 0.01 : -0.01)) - t.h,
        ]);
      const frame = this.imageFrame('top-' + t.id, (c) => this.paintTop(c, t, corners), corners);
      // Back edge sorting keeps the whole character in front of the floor it stands on.
      this.scene.actor('land-' + t.id, t.cx, t.cy, frame, { depth: -42 });
      for (let edge = 0; edge < 4; edge++) {
        const next = (edge + 1) % 4,
          a = loc[edge],
          b = loc[next],
          normal = [
            [0, -1],
            [1, 0],
            [0, 1],
            [-1, 0],
          ][edge],
          depthNormal = groundProject(normal[0], normal[1]).y;
        if (depthNormal < 0.1) continue;
        const midx = (a[0] + b[0]) / 2,
          midy = (a[1] + b[1]) / 2,
          insideH = worldHeight(midx - normal[0] * 0.02, midy - normal[1] * 0.02),
          outside =
            midx + normal[0] * 0.1 < 0 ||
            midx + normal[0] * 0.1 > WORLD.w ||
            midy + normal[1] * 0.1 < 0 ||
            midy + normal[1] * 0.1 > WORLD.h
              ? -100
              : worldHeight(midx + normal[0] * 0.1, midy + normal[1] * 0.1);
        if (insideH - outside < 5) continue;
        const topA = corners[edge],
          topB = corners[next],
          bottomA = [topA[0], topA[1], outside - t.h],
          bottomB = [topB[0], topB[1], outside - t.h],
          verts = [topA, topB, bottomB, bottomA];
        const wf = this.imageFrame(
          'wall-' + t.id + '-' + edge,
          (c) => this.paintCliff(c, verts, normal, t),
          verts
        );
        this.scene.actor('cliff-' + t.id + '-' + edge, t.cx, t.cy, wf, {
          depth: groundProject(midx - t.cx, midy - t.cy).y + 0.3,
        });
      }
    }
    for (let i = 0; i < props.length; i++) {
      const p = props[i],
        s = screenPoint(p.x, p.y);
      if (s.x < -260 || s.x > W + 260 || s.y < -80 || s.y > H + 420) continue;
      const v = p.kind === 'flag3d' ? Math.floor(rt * 3) % 8 : 0,
        key =
          'model-' +
          p.kind +
          '-' +
          (p.variant || 0) +
          '-' +
          (p.color || '') +
          '-' +
          Math.round((p.s || 1) * 6) +
          '-' +
          !!G?.campsDone[p.camp] +
          '-' +
          v;
      const cached = 'depth-' + this.quarter + '-' + key;
      let f = storybookPropFrame(this.scene, p, this.quarter);
      if (f) {
      } else if (this.scene.textures.exists(cached)) f = this.scene.textures.get(cached).worldFrame;
      else {
        const mesh = modelMesh(p);
        f = this.imageFrame(
          key,
          (c) => drawMesh(c, mesh),
          mesh.flatMap((f) => f.v)
        );
      }
      let alpha = 1;
      if (P && (state === 'play' || state === 'over')) {
        const hp = screenPoint(P.x, P.y),
          dx = s.x - hp.x,
          dy = s.y - hp.y,
          h =
            p.kind === 'pine3d'
              ? 230 * (p.s || 1)
              : p.kind === 'cottage'
                ? 205
                : p.kind === 'keep'
                  ? 315
                  : 140;
        if (
          groundProject(p.x, p.y).y > groundProject(P.x, P.y).y &&
          Math.abs(dx) < 100 * zoom * userZoom &&
          dy > 0 &&
          dy < h * zoom * userZoom
        )
          alpha = 0.36;
      }
      this.scene.actor('solid-' + i, p.x, p.y, f, {
        alpha,
        depth: p.box ? Math.min(p.box.w, p.box.d) * 0.22 : 0,
      });
    }
  }
  paintTop(c, t, corners) {
    const centerH = t.h,
      stream = centerH < 0,
      normal = faceNormal(corners),
      snow = litColor('#edf1e8', normal, 0.04),
      base = stream ? '#76abb7' : snow;
    poly(
      c,
      corners.map((p) => worldPoint(...p)),
      base,
      base
    );
    // Uneven packed snow and cobbled paths have world-space texture, not a checkerboard grid.
    for (let ix = 0; ix < 8; ix++)
      for (let iy = 0; iy < 8; iy++) {
        const x = t.x + ix * 10,
          y = t.y + iy * 10,
          noise = seedNoise(x, y),
          path = roadDistance(x + 5, y + 5) < 48;
        if (!path && noise > 0.2) continue;
        const h = (xx, yy) =>
          worldHeight(clamp(xx, t.x + 0.01, t.x1 - 0.01), clamp(yy, t.y + 0.01, t.y1 - 0.01)) -
          centerH;
        const col = path
          ? noise > 0.55
            ? '#b4b9a5'
            : noise > 0.25
              ? '#c2c9b5'
              : '#96a99e'
          : stream
            ? noise > 0.1
              ? '#9fced0'
              : '#d4e4dd'
            : noise > 0.1
              ? '#ceded6'
              : '#eff4e4';
        const size = path ? 6 : 2,
          at = worldPoint(x + 4 - t.cx, y + 4 - t.cy, h(x + 4, y + 4) + 0.1);
        c.fillStyle = col;
        c.globalAlpha = path ? 0.6 : 0.32;
        c.beginPath();
        c.ellipse(at.x, at.y, size, size * 0.48, 0, 0, TAU);
        c.fill();
        c.globalAlpha = 1;
      }
    if (stream) {
      c.strokeStyle = '#b5dbd8';
      c.lineWidth = 1.4;
      for (let i = 0; i < 2; i++) {
        const x = seedNoise(t.x, i) * 55 - 27,
          y = seedNoise(t.y, i) * 55 - 27,
          a = worldPoint(x, y, 0),
          b = worldPoint(x + 14, y + 6, 0);
        c.beginPath();
        c.moveTo(a.x, a.y);
        c.lineTo(b.x, b.y);
        c.stroke();
      }
    }
    // Soft, long shadows make trunks and houses sit on the surface.
    c.save();
    c.beginPath();
    corners
      .map((p) => worldPoint(...p))
      .forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)));
    c.closePath();
    c.clip();
    for (const p of props) {
      const d = Math.hypot(p.x - t.cx, p.y - t.cy);
      if (d > 270 || Math.abs(worldHeight(p.x, p.y) - centerH) > 4) continue;
      const height =
          p.kind === 'pine3d'
            ? 225 * (p.s || 1)
            : p.kind === 'cottage'
              ? 190
              : p.kind === 'keep'
                ? 300
                : 80,
        rx = p.kind === 'pine3d' ? 42 : p.box ? p.box.w * 0.4 : 15,
        ry = rx * 0.6,
        shadow = [];
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * TAU,
          xx = p.x - t.cx + Math.cos(a) * rx + height * 0.31,
          yy = p.y - t.cy + Math.sin(a) * ry + height * 0.34;
        shadow.push(worldPoint(xx, yy, 0));
      }
      poly(c, shadow, '#315b6638');
    }
    c.restore();
  }
  paintCliff(c, v, n, t) {
    const col = litColor('#8993a1', [n[0], n[1], 0]);
    poly(
      c,
      v.map((p) => worldPoint(...p)),
      col,
      col
    );
    const topA = v[0],
      topB = v[1],
      bottom = v[2][2];
    for (let z = bottom + 8; z < Math.min(topA[2], topB[2]) - 8; z += 25) {
      const a = worldPoint(topA[0], topA[1], z),
        b = worldPoint(topB[0], topB[1], z + Math.sin(z) * 2);
      c.strokeStyle = z % 3 ? '#344e5e55' : '#adc2ac60';
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(a.x, a.y);
      c.lineTo(b.x, b.y);
      c.stroke();
    }
    // A thick snow lip and frozen hanging seams define the vertical edge.
    poly(
      c,
      [topA, topB, [topB[0], topB[1], topB[2] - 7], [topA[0], topA[1], topA[2] - 7]].map((p) =>
        worldPoint(...p)
      ),
      '#dfeedd'
    );
    for (let i = 1; i < 5; i++) {
      const f = i / 5,
        x = topA[0] + (topB[0] - topA[0]) * f,
        y = topA[1] + (topB[1] - topA[1]) * f,
        z = topA[2] + (topB[2] - topA[2]) * f;
      const p = worldPoint(x, y, z - 5);
      poly(
        c,
        [
          { x: p.x - 2, y: p.y },
          { x: p.x + 2, y: p.y },
          { x: p.x, y: p.y + 11 + seedNoise(t.x, i) * 15 },
        ],
        '#9dcac8'
      );
    }
  }
}
