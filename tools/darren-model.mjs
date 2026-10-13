// Builds the game's Darren model (dist/3d/assets/darren.glb) from the original supplied model
// (art-source/darren-3d-original.glb), Claude update 8. Every step is code, so it can be re-run
// and reviewed; nothing is hand-edited in the binary file.
//
// Rig and skin (studio pass 2):
//   - clean skin weights: the head bone moves only the head (it used to twist the chest and a
//     wing), the wing bones only the wings (they used to pull the cheek), feet follow their bones;
//   - elbows: hand_L / hand_R move from the paw tip to mid-arm and now carry the forearm and paw,
//     so the forearm aims the animations always had finally bend the arm;
//   - knees: new shin_L / shin_R bones between leg and foot.
//
// One-time setup outside the game folder's tests (same as tools/shrink-models.mjs):
//   npm i --no-save @gltf-transform/core@4 @gltf-transform/extensions@4 @gltf-transform/functions@4 sharp
// Run: node tools/darren-model.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, KHRMaterialsClearcoat } from '@gltf-transform/extensions';
import sharp from 'sharp';
import { dedup, prune, quantize } from '@gltf-transform/functions';
import * as THREE from '../dist/3d/vendor/three.core.js';

const here = path.dirname(fileURLToPath(import.meta.url)),
  SRC = path.join(here, '../art-source/darren-3d-original.glb'),
  OUT = path.join(here, '../dist/3d/assets/darren.glb');
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(SRC),
  root = doc.getRoot(),
  skin = root.listSkins()[0];

const smoothstep = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const nodeByName = (n) => root.listNodes().find((x) => x.getName() === n);

// ---------- skeleton: elbows and knees ----------
function addKnee(side) {
  const leg = nodeByName('leg_' + side),
    foot = nodeByName('foot_' + side),
    [fx, fy, fz] = foot.getTranslation(),
    k = 0.5;
  const shin = doc.createNode('shin_' + side).setTranslation([fx * k, fy * k, fz * k]);
  leg.removeChild(foot);
  leg.addChild(shin);
  shin.addChild(foot);
  foot.setTranslation([fx * (1 - k), fy * (1 - k), fz * (1 - k)]);
  skin.addJoint(shin);
}
for (const side of ['L', 'R']) {
  const hand = nodeByName('hand_' + side),
    t = hand.getTranslation();
  hand.setTranslation([t[0] / 2, t[1] / 2, t[2] / 2]);
  addKnee(side);
}
// Weight paint passes (Claude update 11), measured with tools/review/weights.cjs over every clip;
// each pass stays only if it measured better. DARREN_WEIGHTS (comma list) builds with only some
// passes, for measuring each one alone.
const PASSES = new Set(
  (process.env.DARREN_WEIGHTS ?? 'repaint,scarf,wings,clear,feet,ground').split(',').filter(Boolean)
);
const joints = skin.listJoints(),
  J = Object.fromEntries(joints.map((j, i) => [j.getName(), i]));
function rebindAll() {
  const ibm = doc
    .createAccessor()
    .setType('MAT4')
    .setArray(new Float32Array(joints.length * 16));
  joints.forEach((j, i) =>
    ibm.setElement(i, new THREE.Matrix4().fromArray(j.getWorldMatrix()).invert().toArray())
  );
  for (const s of root.listSkins()) s.setInverseBindMatrices(ibm);
  // Every skinned mesh shares one skin, so the scarf pieces pick up the new joints too.
}
const worldPos = (name) => {
  const m = nodeByName(name).getWorldMatrix();
  return new THREE.Vector3(m[12], m[13], m[14]);
};

// ---------- skin weights ----------
// Reads a primitive's weights into one map per vertex: { jointIndex: weight }.
function readWeights(prim) {
  const Jt = prim.getAttribute('JOINTS_0'),
    Wt = prim.getAttribute('WEIGHTS_0'),
    out = [];
  for (let i = 0; i < Jt.getCount(); i++) {
    const j = Jt.getElement(i, []),
      w = Wt.getElement(i, []),
      m = {};
    for (let k = 0; k < 4; k++) if (w[k] > 0) m[j[k]] = (m[j[k]] || 0) + w[k];
    out.push(m);
  }
  return out;
}
function writeWeights(prim, maps) {
  const n = maps.length,
    ja = new Uint8Array(n * 4),
    wa = new Float32Array(n * 4);
  maps.forEach((m, i) => {
    const top = Object.entries(m)
      .filter(([, w]) => w > 1e-3)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4);
    const sum = top.reduce((s, [, w]) => s + w, 0) || 1;
    top.forEach(([j, w], k) => {
      ja[i * 4 + k] = +j;
      wa[i * 4 + k] = w / sum;
    });
    if (!top.length) wa[i * 4] = 1;
  });
  prim.setAttribute('JOINTS_0', doc.createAccessor().setType('VEC4').setArray(ja));
  prim.setAttribute('WEIGHTS_0', doc.createAccessor().setType('VEC4').setArray(wa));
}
const take = (m, from, to, amount = 1) => {
  const v = (m[from] || 0) * amount;
  if (!v) return;
  m[from] -= v;
  m[to] = (m[to] || 0) + v;
};
// Positions welded across texture seams, and their connected shells (body, wings, eyes, brows).
function topology(prim) {
  const pos = prim.getAttribute('POSITION'),
    idx = prim.getIndices(),
    n = pos.getCount(),
    P = [],
    weld = [],
    keys = new Map();
  for (let i = 0; i < n; i++) {
    const a = pos.getElement(i, []);
    P.push(a);
    const k = a.map((v) => Math.round(v * 4000)).join();
    if (!keys.has(k)) keys.set(k, keys.size);
    weld.push(keys.get(k));
  }
  const par = [...Array(keys.size).keys()],
    find = (x) => (par[x] === x ? x : (par[x] = find(par[x]))),
    nb = Array.from({ length: keys.size }, () => new Set());
  for (let t = 0; t < idx.getCount(); t += 3) {
    const v = [0, 1, 2].map((k) => weld[idx.getScalar(t + k)]);
    for (let k = 0; k < 3; k++) {
      nb[v[k]].add(v[(k + 1) % 3]);
      nb[v[k]].add(v[(k + 2) % 3]);
      par[find(v[k])] = find(v[(k + 1) % 3]);
    }
  }
  const shell = weld.map((w) => find(w));
  return { P, weld, nb, shell, n };
}
// Averages each welded vertex's weights with its neighbours' (keeps bends soft, never spreads far).
function smoothWeights(top, maps, rounds, keep = 0.5) {
  for (let r = 0; r < rounds; r++) {
    const acc = new Map();
    maps.forEach((m, i) => {
      const w = top.weld[i];
      if (!acc.has(w)) acc.set(w, { m, n: 1 });
    });
    const next = new Map();
    for (const [w, { m }] of acc) {
      const out = {};
      for (const [j, v] of Object.entries(m)) out[j] = v * keep;
      const share = (1 - keep) / top.nb[w].size;
      for (const o of top.nb[w])
        for (const [j, v] of Object.entries(acc.get(o).m)) out[j] = (out[j] || 0) + v * share;
      next.set(w, out);
    }
    maps.forEach((m, i) => (maps[i] = { ...next.get(top.weld[i]) }));
  }
}
function reskinBody(prim) {
  const top = topology(prim),
    maps = readWeights(prim),
    sizes = new Map();
  top.shell.forEach((s) => sizes.set(s, (sizes.get(s) || 0) + 1));
  const body = [...sizes].sort((a, b) => b[1] - a[1])[0][0];
  const knee = { L: worldPos('shin_L'), R: worldPos('shin_R') },
    ankle = { L: worldPos('foot_L'), R: worldPos('foot_R') },
    shoulder = { L: worldPos('arm_L'), R: worldPos('arm_R') },
    elbow = { L: worldPos('hand_L'), R: worldPos('hand_R') };
  maps.forEach((m, i) => {
    const [x, y, z] = top.P[i],
      s = x >= 0 ? 'L' : 'R',
      inBody = top.shell[i] === body;
    if (!inBody && sizes.get(top.shell[i]) < 600) {
      // Eyes and brows: the head only.
      maps[i] = { [J.head]: 1 };
      return;
    }
    if (!inBody) {
      // Wing shells: the wing root takes what the head used to hold; nothing else moves a wing.
      const ws = x >= 0 ? 'L' : 'R';
      for (const j of Object.keys(m))
        if (+j !== J['wing_' + ws] && +j !== J['wingtip_' + ws]) take(m, j, J['wing_' + ws]);
      return;
    }
    // Body: wing weights go to the head (above the chin) or the chest.
    for (const ws of ['L', 'R'])
      for (const b of ['wing_', 'wingtip_']) take(m, J[b + ws], y > 1.04 ? J.head : J.spine);
    const arm = (m[J.arm_L] || 0) + (m[J.arm_R] || 0) + (m[J.hand_L] || 0) + (m[J.hand_R] || 0);
    // Head from the chin up, chest below; the neck blends between them.
    const h = smoothstep(0.95, 1.07, y);
    if (arm < 0.3) {
      for (const j of Object.keys(m)) if (+j !== J.head) m[j] *= 1 - h;
      m[J.spine] = (m[J.spine] || 0) + (1 - h) * (m[J.head] || 0);
      m[J.head] = h;
    } else take(m, J.head, J.spine, 1 - h);
    // Elbow: the outer half of the arm (forearm and paw) follows hand_X, with a soft bend.
    for (const as of ['L', 'R']) {
      const a = (m[J['arm_' + as]] || 0) + (m[J['hand_' + as]] || 0);
      if (!a) continue;
      const along =
          (Math.abs(x) - Math.abs(shoulder[as].x)) /
          (Math.abs(elbow[as].x) - Math.abs(shoulder[as].x)),
        f = smoothstep(0.75, 1.25, along);
      m[J['arm_' + as]] = a * (1 - f);
      m[J['hand_' + as]] = a * f;
    }
    // Knee and ankle along each leg.
    for (const ls of ['L', 'R']) {
      const a = (m[J['leg_' + ls]] || 0) + (m[J['shin_' + ls]] || 0) + (m[J['foot_' + ls]] || 0);
      if (!a) continue;
      const foot = 1 - smoothstep(ankle[ls].y - 0.02, ankle[ls].y + 0.08, y),
        shin = (1 - smoothstep(knee[ls].y - 0.07, knee[ls].y + 0.07, y)) * (1 - foot);
      m[J['foot_' + ls]] = a * foot;
      m[J['shin_' + ls]] = a * shin;
      m[J['leg_' + ls]] = a * (1 - foot - shin);
    }
    void z;
    void s;
  });
  smoothWeights(top, maps, 2, 0.6);
  // Smoothing must not carry the head back down into the chest or a wing onto the face.
  maps.forEach((m, i) => {
    const y = top.P[i][1];
    if (top.shell[i] === body && y < 0.93) delete m[J.head];
    if (top.shell[i] === body)
      for (const b of ['wing_L', 'wing_R', 'wingtip_L', 'wingtip_R']) delete m[J[b]];
  });
  weightPasses(top, maps, body);
  writeWeights(prim, maps);
  bodySkin = { top, maps, body };
}

// ---------- weight paint passes (Claude update 11) ----------
// Measured with tools/review/weights.cjs over every clip; each pass stays only if it measured
// better. DARREN_WEIGHTS (comma list) builds with only some passes, for measuring each one alone.
let bodySkin = null;
// Tried and dropped (measured worse): pass 1 faded out bones far from each vertex (it left
// creases where the mesh runs on from cheek to shoulder), and pass 3 added half-way joints at the
// hips and shoulders driven from anim.mjs (more torn skin, not less).
function weightPasses(top, maps, body) {
  // Pass 2, repaint: the body skin painted again from Darren's shape, joint by joint, instead of
  // patching the supplied (auto-rigged) weights. Every blend is a soft ramp measured in metres,
  // so it does not depend on how dense the mesh happens to be in that spot. The widths are the
  // measured best; DARREN_<KEY> overrides one for trying others. The hip blend (pass 6) stops
  // at 0.38-0.66 m: wider (0.2-0.5) tore even less but left the thighs rubbery.
  if (PASSES.has('repaint')) {
    const P = (k, d) => +(process.env['DARREN_' + k] ?? d);
    const W = {
      shoulder: [P('SH0', 0.12), P('SH1', 0.28)],
      armBand: [P('AB0', 0.07), P('AB1', 0.12)],
      elbow: [P('EL0', 0.34), P('EL1', 0.45)],
      neck: [P('NK0', 0.95), P('NK1', 1.07)],
      waist: [P('WA0', 0.45), P('WA1', 0.8)],
      hip: [P('HP0', 0.38), P('HP1', 0.66)],
      legSide: [P('LS0', 0), P('LS1', 0.1)],
      legR: [P('LR0', 0.1), P('LR1', 0.18)],
      knee: P('KN', 0.07),
      ankle: [P('AN0', -0.02), P('AN1', 0.08)],
      tailZ: [P('TZ0', -0.2), P('TZ1', -0.34)],
      tailB: P('TB', 0.08),
    };
    const knee = { L: worldPos('shin_L').y, R: worldPos('shin_R').y },
      ankle = { L: worldPos('foot_L').y, R: worldPos('foot_R').y },
      hipJ = { L: worldPos('leg_L'), R: worldPos('leg_R') };
    // The tail as a curve through its joints and on to the tip.
    const chain = ['tail_1', 'tail_2', 'tail_3', 'tail_4', 'tail_5'].map(worldPos);
    chain.push(new THREE.Vector3(0.3, 0.54, -1.3));
    const arc = [0];
    for (let k = 1; k < chain.length; k++) arc.push(arc[k - 1] + chain[k].distanceTo(chain[k - 1]));
    const along = (q) => {
      let best = 9,
        s = 0;
      for (let k = 0; k < chain.length - 1; k++) {
        const a = chain[k],
          d = chain[k + 1].clone().sub(a),
          u = Math.max(0, Math.min(1, q.clone().sub(a).dot(d) / d.lengthSq())),
          dist = q.distanceTo(a.clone().addScaledVector(d, u));
        if (dist < best) ((best = dist), (s = arc[k] + u * d.length()));
      }
      return s;
    };
    const add = (o, j, w) => w > 0 && (o[J[j]] = (o[J[j]] || 0) + w);
    maps.forEach((m, i) => {
      if (top.shell[i] !== body) return;
      const [x, y, z] = top.P[i],
        side = x >= 0 ? 'L' : 'R',
        ax = Math.abs(x),
        q = new THREE.Vector3(x, y, z),
        o = {};
      // How much of this vertex is arm, leg or tail; the rest is trunk.
      const A =
        smoothstep(W.shoulder[0], W.shoulder[1], ax) *
        (1 - smoothstep(W.armBand[0], W.armBand[1], Math.abs(y - 0.945)));
      const rl = Math.hypot(x - hipJ[side].x, z - hipJ[side].z + 0.03);
      let L =
        smoothstep(W.legSide[0], W.legSide[1], ax) *
        (1 - smoothstep(W.hip[0], W.hip[1], y)) *
        // Near the hip only the round thigh is leg; from the knee down everything is.
        (1 - smoothstep(W.legR[0], W.legR[1], rl) * smoothstep(0.3, 0.4, y)) *
        // and never back on the tail lying behind him.
        (1 - smoothstep(-0.22, -0.32, z));
      // Behind the back the tail starts; only beside the body does height matter (the tip curls up).
      let T =
        smoothstep(W.tailZ[0], W.tailZ[1], z) *
        (1 - smoothstep(0.72, 0.8, y) * (1 - smoothstep(-0.4, -0.5, z)));
      const sum = A + L + T;
      if (sum > 1) [L, T] = [(L / sum) * (1 - A / sum) * sum, (T / sum) * (1 - A / sum) * sum];
      const trunk = Math.max(0, 1 - A - L - T);
      const h = smoothstep(W.neck[0], W.neck[1], y);
      add(o, 'head', trunk * h);
      const sp = smoothstep(W.waist[0], W.waist[1], y);
      add(o, 'spine', trunk * (1 - h) * sp);
      add(o, 'hips', trunk * (1 - h) * (1 - sp));
      const e = smoothstep(W.elbow[0], W.elbow[1], ax);
      add(o, 'arm_' + side, A * (1 - e));
      add(o, 'hand_' + side, A * e);
      const foot = 1 - smoothstep(ankle[side] + W.ankle[0], ankle[side] + W.ankle[1], y),
        shin = (1 - smoothstep(knee[side] - W.knee, knee[side] + W.knee, y)) * (1 - foot);
      add(o, 'foot_' + side, L * foot);
      add(o, 'shin_' + side, L * shin);
      add(o, 'leg_' + side, L * (1 - foot - shin));
      if (T > 0) {
        const s = along(q);
        let prev = 1;
        for (let k = 0; k < 5; k++) {
          const t = k < 4 ? smoothstep(arc[k + 1] - W.tailB, arc[k + 1] + W.tailB, s) : 0;
          add(o, 'tail_' + (k + 1), T * (prev - t));
          prev = t;
        }
        // The first stretch of tail blends into the pelvis.
        const root = 1 - smoothstep(0, 0.1, s);
        const t1 = o[J.tail_1] || 0;
        o[J.tail_1] = t1 * (1 - root * 0.5);
        add(o, 'hips', t1 * root * 0.5);
      }
      maps[i] = o;
    });
    smoothWeights(top, maps, +(process.env.DARREN_RSMOOTH ?? 8), 0.6);
    maps.forEach((m, i) => {
      if (top.shell[i] !== body) return;
      if (top.P[i][1] < 0.93) delete m[J.head];
      for (const b of ['wing_L', 'wing_R', 'wingtip_L', 'wingtip_R']) delete m[J[b]];
    });
  }
  // Pass 5, wings: each wing membrane is painted along its own length, root to tip, instead of
  // the supplied patchy split. Skin far below the tip joint (the hanging lower corner) used to be
  // half tip, so every flap swung it through a wide arc and tore the thin membrane edge.
  if (PASSES.has('wings')) {
    const U0 = +(process.env.DARREN_WU0 ?? 0.3),
      U1 = +(process.env.DARREN_WU1 ?? 1.1);
    for (const ws of ['L', 'R']) {
      const a = worldPos('wing_' + ws),
        d = worldPos('wingtip_' + ws).sub(a),
        L2 = d.lengthSq();
      maps.forEach((m, i) => {
        if (top.shell[i] === body || !(J['wing_' + ws] in m || J['wingtip_' + ws] in m)) return;
        const u = new THREE.Vector3(...top.P[i]).sub(a).dot(d) / L2,
          t = smoothstep(U0, U1, u);
        maps[i] = { [J['wing_' + ws]]: 1 - t, [J['wingtip_' + ws]]: t };
      });
    }
  }
}

// ---------- head: one swept-back horn (studio pass 3) ----------
// The supplied sculpt has a row of four spikes along the crown; the approved design has a single
// horn sweeping back. The spikes are pressed down onto the skull (a smooth surface fitted to the
// crown around them) and one new horn is grown in their place.
function solve(A, b) {
  const n = b.length,
    M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  return M.map((r, i) => r[n] / r[i]);
}
const CREST = { x: 0.13, y: 1.66 };
// The crown around the old spikes, down to the forehead below the front one.
const inCrownPatch = ([x, y, z]) => Math.abs(x) < 0.16 && y > 1.5 && z > -0.34 && z < 0.45;
function flattenCrest(prim) {
  const top = topology(prim),
    pos = prim.getAttribute('POSITION'),
    uv = prim.getAttribute('TEXCOORD_0'),
    sizes = new Map();
  top.shell.forEach((s) => sizes.set(s, (sizes.get(s) || 0) + 1));
  const body = [...sizes].sort((a, b) => b[1] - a[1])[0][0];
  // Crown height y = f(x, z) fitted to the skull just beside the crest.
  const terms = (x, z) => [1, x, z, x * x, z * z, x * z],
    A = Array.from({ length: 6 }, () => Array(6).fill(0)),
    b = Array(6).fill(0);
  top.P.forEach(([x, y, z], i) => {
    if (top.shell[i] !== body || y < 1.5 || Math.abs(x) < 0.15 || Math.abs(x) > 0.34) return;
    if (z < -0.32 || z > 0.42) return;
    const t = terms(x, z);
    for (let r = 0; r < 6; r++) {
      b[r] += t[r] * y;
      for (let c = 0; c < 6; c++) A[r][c] += t[r] * t[c];
    }
  });
  const k = solve(A, b),
    crown = (x, z) => terms(x, z).reduce((s, t, i) => s + t * k[i], 0);
  let best = -1,
    hi = -9;
  top.P.forEach(([x, y, z], i) => {
    if (top.shell[i] === body && Math.abs(x) < 0.05 && y > hi) ((hi = y), (best = i));
  });
  // The crest patch is rebuilt as a smooth membrane: its vertices are spread evenly over the
  // patch seen from above (a Tutte embedding: every inner point is the average of its
  // neighbours, the rim stays put, so no triangle can fold over), then laid on the fitted skull,
  // with the rim's own small height differences blended in so there is no step at the edge.
  const inPatch = inCrownPatch;
  const W = new Map();
  top.P.forEach((p, i) => {
    if (top.shell[i] === body && inPatch(p)) W.set(top.weld[i], p.slice());
  });
  const rim = new Set([...W.keys()].filter((w) => [...top.nb[w]].some((o) => !W.has(o)))),
    inner = [...W.keys()].filter((w) => !rim.has(w)),
    uv2 = new Map([...W].map(([w, p]) => [w, [p[0], p[2], 0]]));
  for (const w of rim) {
    const [x, y, z] = W.get(w);
    uv2.get(w)[2] = y - crown(x, z);
  }
  for (const w of inner) uv2.get(w)[2] = 0;
  for (let it = 0; it < 4000; it++) {
    let moved = 0;
    for (const w of inner) {
      const a = [0, 0, 0],
        nb = [...top.nb[w]];
      for (const o of nb) uv2.get(o).forEach((v, k) => (a[k] += v / nb.length));
      const c = uv2.get(w);
      moved = Math.max(moved, Math.abs(a[0] - c[0]) + Math.abs(a[1] - c[1]));
      uv2.set(w, a);
    }
    if (moved < 1e-7) break;
  }
  top.P.forEach((p, i) => {
    const w = top.weld[i];
    if (!W.has(w) || rim.has(w)) return;
    const [x, z, off] = uv2.get(w),
      q = [x, crown(x, z) + off, z];
    pos.setElement(i, q);
    p.splice(0, 3, ...q);
  });
  return { crown, redUV: uv.getElement(best, []) };
}
// A curved horn: rings of an ellipse that narrows toward the tip and sweeps back as it rises.
function hornPrimitive(crown, redUV, material) {
  const RINGS = 16,
    SEG = 24,
    zc = 0.06,
    base = crown(0, zc) - 0.06,
    H = 0.42,
    S = 0.3,
    W = 0.085,
    L = 0.23,
    P = [],
    N = [],
    index = [];
  const centre = (t) => new THREE.Vector3(0, base + H * t, zc + 0.02 - S * t * t * 1.15);
  for (let r = 0; r <= RINGS; r++) {
    const t = r / RINGS,
      c = centre(t),
      d = centre(Math.min(1, t + 0.01))
        .sub(centre(Math.max(0, t - 0.01)))
        .normalize(),
      ex = new THREE.Vector3(1, 0, 0),
      ez = new THREE.Vector3().crossVectors(ex, d).normalize(),
      w = W * (1 - t) ** 0.75,
      l = L * (1 - t) ** 0.85;
    for (let s = 0; s < SEG; s++) {
      const a = (s / SEG) * Math.PI * 2,
        // A fuller leading edge and a thinner trailing edge, like the design's fin.
        lz = Math.sin(a) > 0 ? l : l * 0.75;
      P.push(
        c
          .clone()
          .addScaledVector(ex, Math.cos(a) * w)
          .addScaledVector(ez, Math.sin(a) * lz)
      );
    }
  }
  const tip = centre(1);
  P.push(tip);
  for (let r = 0; r < RINGS; r++)
    for (let s = 0; s < SEG; s++) {
      const a = r * SEG + s,
        b = r * SEG + ((s + 1) % SEG),
        c = a + SEG,
        d = b + SEG;
      index.push(a, c, b, b, c, d);
    }
  for (let s = 0; s < SEG; s++)
    index.push(RINGS * SEG + s, P.length - 1, RINGS * SEG + ((s + 1) % SEG));
  // Outward winding check: the first side face must point away from the horn's axis.
  const g = new THREE.BufferGeometry().setFromPoints(P);
  g.setIndex(index);
  g.computeVertexNormals();
  const nrm = g.attributes.normal;
  if (nrm.getX(0) < 0) {
    for (let i = 0; i < index.length; i += 3)
      [index[i + 1], index[i + 2]] = [index[i + 2], index[i + 1]];
    g.setIndex(index);
    g.computeVertexNormals();
  }
  // The tip point's faces cancel out; it points along the horn.
  const tipDir = centre(1).sub(centre(0.97)).normalize();
  nrm.setXYZ(P.length - 1, tipDir.x, tipDir.y, tipDir.z);
  for (let i = 0; i < P.length; i++) N.push(nrm.getX(i), nrm.getY(i), nrm.getZ(i));
  return primitiveFrom(
    P.flatMap((p) => p.toArray()),
    N,
    index,
    P.map(() => redUV).flat(),
    J.head,
    material
  );
}
function primitiveFrom(positions, normals, index, uvs, joint, material) {
  const n = positions.length / 3,
    joints = new Uint8Array(n * 4),
    weights = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    joints[i * 4] = joint;
    weights[i * 4] = 1;
  }
  const acc = (type, arr) => doc.createAccessor().setType(type).setArray(arr);
  const prim = doc
    .createPrimitive()
    .setAttribute('POSITION', acc('VEC3', new Float32Array(positions)))
    .setAttribute('NORMAL', acc('VEC3', new Float32Array(normals)))
    .setAttribute('JOINTS_0', acc('VEC4', joints))
    .setAttribute('WEIGHTS_0', acc('VEC4', weights))
    .setIndices(acc('SCALAR', new Uint16Array(index)))
    .setMaterial(material);
  if (uvs) prim.setAttribute('TEXCOORD_0', acc('VEC2', new Float32Array(uvs)));
  return prim;
}
// Smooth vertex normals across texture seams (the supplied ones split hard in 56 places).
function smoothNormals(prim) {
  const top = topology(prim),
    idx = prim.getIndices(),
    acc = Array.from({ length: top.nb.length }, () => new THREE.Vector3()),
    a = new THREE.Vector3(),
    b = new THREE.Vector3(),
    c = new THREE.Vector3();
  for (let t = 0; t < idx.getCount(); t += 3) {
    const v = [0, 1, 2].map((k) => idx.getScalar(t + k));
    a.fromArray(top.P[v[0]]);
    b.fromArray(top.P[v[1]]).sub(a);
    c.fromArray(top.P[v[2]]).sub(a);
    const n = new THREE.Vector3().crossVectors(b, c); // area weighted
    for (const i of v) acc[top.weld[i]].add(n);
  }
  const nrm = prim.getAttribute('NORMAL');
  for (let i = 0; i < top.n; i++) {
    const n = acc[top.weld[i]].clone().normalize();
    if (Number.isFinite(n.x)) nrm.setElement(i, n.toArray());
  }
}

// ---------- the Polka Scarf (studio pass 3) ----------
// The supplied scarf was a faceted ring, a flat box and three balls. It is replaced by a soft
// knitted collar, a knot at the front and two loose ends, all with pink dots, in a small
// generated texture. The ends keep the "Scarf tail" names the game hides while the long scarf
// whip is out (game.mjs), and the knot sits where that whip leaves the collar (ribbon.mjs).
async function polkaTexture() {
  const W = 256,
    px = Buffer.alloc(W * W * 3);
  for (let y = 0; y < W; y++)
    for (let x = 0; x < W; x++) {
      // Knit ribs run along v; big dots on a staggered grid, two across and two down.
      const rib = 0.96 + 0.04 * Math.cos(((x % 16) / 16) * Math.PI * 2),
        cx = (x % 128) - 64,
        cy = ((y + (Math.floor(x / 128) % 2) * 64) % 128) - 64,
        d = Math.hypot(cx, cy);
      const dot = smoothstep(31, 28, d);
      const yellow = [255, 222, 74],
        pink = [255, 111, 177];
      for (let k = 0; k < 3; k++)
        px[(y * W + x) * 3 + k] = Math.round((yellow[k] * (1 - dot) + pink[k] * dot) * rib);
    }
  return sharp(px, { raw: { width: W, height: W, channels: 3 } })
    .png()
    .toBuffer();
}
// Front surface of the body (largest z) near a point, for laying the scarf ends on the belly.
function bodyFront(prim) {
  const pos = prim.getAttribute('POSITION'),
    cells = new Map();
  for (let i = 0; i < pos.getCount(); i++) {
    const [x, y, z] = pos.getElement(i, []);
    const k = Math.round(x * 40) + ',' + Math.round(y * 40);
    cells.set(k, Math.max(cells.get(k) ?? -9, z));
  }
  return (x, y) => {
    let best = -9;
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++)
        best = Math.max(
          best,
          cells.get(Math.round(x * 40) + dx + ',' + (Math.round(y * 40) + dy)) ?? -9
        );
    return best;
  };
}
// A closed tube along a path: cross-section half sizes a (across) and b (thickness) per point.
function tubeGeometry(path, across, outward, a, b, seg, uScale, vScale) {
  const P = [],
    UV = [],
    index = [],
    n = path.length;
  for (let i = 0; i < n; i++)
    for (let s = 0; s < seg; s++) {
      const t = (s / seg) * Math.PI * 2;
      P.push(
        path[i]
          .clone()
          .addScaledVector(across[i], Math.cos(t) * a[i])
          .addScaledVector(outward[i], Math.sin(t) * b[i])
      );
      UV.push((s / seg) * uScale, (i / (n - 1)) * vScale);
    }
  for (let i = 0; i < n - 1; i++)
    for (let s = 0; s < seg; s++) {
      const p = i * seg + s,
        q = i * seg + ((s + 1) % seg);
      index.push(p, q, p + seg, q, q + seg, p + seg);
    }
  return { P, UV, index };
}
function finish(geo, closedEnds) {
  // Caps: fan the first and last rings to their centres.
  const { P, UV, index } = geo,
    seg = closedEnds;
  if (seg) {
    const rings = P.length / seg;
    for (const [r, flip] of [
      [0, true],
      [rings - 1, false],
    ]) {
      const c = new THREE.Vector3();
      for (let s = 0; s < seg; s++) c.add(P[r * seg + s]);
      P.push(c.divideScalar(seg));
      UV.push(UV[r * seg * 2], UV[r * seg * 2 + 1]);
      const ci = P.length - 1;
      for (let s = 0; s < seg; s++) {
        const a = r * seg + s,
          b = r * seg + ((s + 1) % seg);
        if (flip) index.push(ci, b, a);
        else index.push(ci, a, b);
      }
    }
  }
  const g = new THREE.BufferGeometry().setFromPoints(P);
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}
// group (optional): vertex index -> key; vertices with the same key share one averaged weight
// (a whole ring of a knitted tube, so the knit never shears across its own thickness).
// along (optional, Claude update 12): rounds of averaging each group's weights with the groups
// next to it (ring k with rings k-1 and k+1), so a loose scarf end bends smoothly along its
// length instead of shearing where the belly under it folds.
function partFromGeometry(g, uv, weightOf, material, group, along = 0) {
  const n = g.attributes.position.count,
    joints = new Uint8Array(n * 4),
    weights = new Float32Array(n * 4),
    pa = g.attributes.position,
    per = [];
  for (let i = 0; i < n; i++) per.push(weightOf(pa.getY(i), pa.getX(i), pa.getZ(i)));
  if (group) {
    const sums = new Map();
    per.forEach((w, i) => {
      const k = group(i),
        s = sums.get(k) || {};
      for (const [j, v] of w) s[j] = (s[j] || 0) + v;
      sums.set(k, s);
    });
    for (let r = 0; r < along; r++) {
      const next = new Map();
      for (const [k, s] of sums) {
        const o = {},
          nb = [k - 1, k, k + 1].filter((x) => sums.has(x));
        for (const x of nb) {
          const sx = sums.get(x),
            tot = Object.values(sx).reduce((a, v) => a + v, 0) || 1;
          for (const [j, v] of Object.entries(sx)) o[j] = (o[j] || 0) + v / tot / nb.length;
        }
        next.set(k, o);
      }
      for (const [k, o] of next) sums.set(k, o);
    }
    for (let i = 0; i < n; i++) {
      const top4 = Object.entries(sums.get(group(i)))
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4);
      const t = top4.reduce((a, [, v]) => a + v, 0);
      per[i] = top4.map(([j, v]) => [+j, v / t]);
    }
  }
  for (let i = 0; i < n; i++) {
    per[i].forEach(([j, v], k) => {
      joints[i * 4 + k] = j;
      weights[i * 4 + k] = v;
    });
  }
  const acc = (type, arr) => doc.createAccessor().setType(type).setArray(arr);
  return doc
    .createPrimitive()
    .setAttribute('POSITION', acc('VEC3', new Float32Array(g.attributes.position.array)))
    .setAttribute('NORMAL', acc('VEC3', new Float32Array(g.attributes.normal.array)))
    .setAttribute('TEXCOORD_0', acc('VEC2', new Float32Array(uv)))
    .setAttribute('JOINTS_0', acc('VEC4', joints))
    .setAttribute('WEIGHTS_0', acc('VEC4', weights))
    .setIndices(acc('SCALAR', new Uint16Array(g.index.array)))
    .setMaterial(material);
}
async function buildScarf(prim) {
  for (const node of root.listNodes())
    if (/^(Polka scarf collar|Scarf )/.test(node.getName())) {
      node.getMesh()?.dispose();
      node.dispose();
    }
  const tex = doc
    .createTexture('Polka knit')
    .setImage(await polkaTexture())
    .setMimeType('image/png');
  const mat = doc
    .createMaterial('Polka scarf knit')
    .setBaseColorTexture(tex)
    .setRoughnessFactor(0.85)
    .setMetallicFactor(0)
    // A little self-light, like the long scarf whip (ribbon.mjs), so it stays sunny yellow.
    .setEmissiveTexture(tex)
    .setEmissiveFactor([0.22, 0.22, 0.22])
    .setDoubleSided(false);
  // The collar follows the chest, its top edge turns a little with the head like the neck does.
  let neckW = (y) => {
    const h = smoothstep(0.95, 1.07, y) * 0.8;
    return h > 0.01
      ? [
          [J.spine, 1 - h],
          [J.head, h],
        ]
      : [[J.spine, 1]];
  };
  let chest = () => [[J.spine, 1]];
  // Ring of a tube built by tubeGeometry (cap centres join the end rings); off without pass 4.
  const ringOf = (seg, rings) =>
    PASSES.has('scarf')
      ? (i) => (i < seg * rings ? Math.floor(i / seg) : i === seg * rings ? 0 : rings - 1)
      : null;
  // Pass 4, scarf (Claude update 11): every scarf vertex moves like the skin right under it (the
  // nearest few body vertices, closer ones counting more), so the collar rides the neck and
  // shoulders and the ends ride the belly instead of the chest bone alone.
  if (PASSES.has('scarf') && bodySkin) {
    const { top, maps, body } = bodySkin,
      ids = [];
    // Skin from the chin down only: the collar sits under the jowls but must not turn with them.
    top.P.forEach((p, i) => top.shell[i] === body && p[1] < 0.99 && ids.push(i));
    const fromSkin = (y, x, z) => {
      const best = [];
      for (const i of ids) {
        const p = top.P[i],
          d = (p[0] - x) ** 2 + (p[1] - y) ** 2 + (p[2] - z) ** 2;
        if (best.length < 6 || d < best[5][0]) {
          best.push([d, i]);
          best.sort((a, b) => a[0] - b[0]);
          if (best.length > 6) best.pop();
        }
      }
      const acc = {};
      for (const [d, i] of best)
        for (const [j, w] of Object.entries(maps[i])) acc[j] = (acc[j] || 0) + w / (d + 1e-5);
      const top4 = Object.entries(acc)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4);
      const sum = top4.reduce((s, [, w]) => s + w, 0);
      return top4.map(([j, w]) => [+j, w / sum]);
    };
    // The collar is a stiff knitted roll: it takes only part of the shoulders' swing (the rest
    // stays with the chest), so an arm raise does not wrench it out of shape.
    const armShare = +(process.env.DARREN_COLLAR_ARM ?? 0.25);
    neckW = (y, x, z) => {
      const out = {};
      for (const [j, w] of fromSkin(y, x, z)) {
        const arm = /^(arm|hand)_/.test(joints[j].getName());
        out[j] = (out[j] || 0) + w * (arm ? armShare : 1);
        if (arm) out[J.spine] = (out[J.spine] || 0) + w * (1 - armShare);
      }
      return Object.entries(out).map(([j, w]) => [+j, w]);
    };
    chest = fromSkin;
  }
  const parts = [];
  // Collar: a thick knitted loop sitting a little lower at the front, bunched where it is tied.
  {
    const N = 72,
      path = [],
      across = [],
      out = [],
      a = [],
      b = [];
    for (let i = 0; i <= N; i++) {
      const t = (i / N) * Math.PI * 2,
        front = Math.max(0, Math.cos(t)),
        toKnot = ((t - 5.81 + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      const c = new THREE.Vector3(
        Math.sin(t) * 0.215,
        0.965 - 0.035 * front * front,
        0.02 + Math.cos(t) * 0.215
      );
      path.push(c);
      const radial = new THREE.Vector3(Math.sin(t), 0, Math.cos(t));
      out.push(radial);
      across.push(new THREE.Vector3(0, 1, 0));
      const bunch = 1 + 0.25 * Math.exp(-(toKnot * toKnot) / 0.08);
      a.push(0.05 * bunch);
      b.push(0.04 * bunch);
    }
    const geo = tubeGeometry(path, across, out, a, b, 14, 1, 4.5);
    // Close the loop exactly: the last ring is the first ring.
    parts.push([
      'Polka scarf collar',
      partFromGeometry(finish(geo, 0), geo.UV, neckW, mat, ringOf(14, N + 1)),
    ]);
  }
  const front = bodyFront(prim);
  // Knot at the front left of the collar.
  {
    const c = new THREE.Vector3(-0.115, 0.92, 0.245),
      g = new THREE.SphereGeometry(1, 20, 14);
    g.scale(0.065, 0.055, 0.04);
    g.translate(c.x, c.y, c.z);
    const uv = Array.from(g.attributes.uv.array, (v) => v * 2);
    parts.push(['Polka scarf knot', partFromGeometry(g, uv, chest, mat, () => 0)]);
  }
  // Two loose ends hanging over the chest and belly, the front one shorter.
  for (const [name, x0, x1, len, lift, width] of [
    ['Scarf tail', -0.13, -0.19, 0.31, 0.012, 0.062],
    ['Scarf tail.001', -0.1, -0.05, 0.22, 0.03, 0.055],
  ]) {
    const N = 16,
      path = [],
      across = [],
      out = [],
      a = [],
      b = [];
    for (let i = 0; i < N; i++) {
      const t = i / (N - 1),
        x = x0 + (x1 - x0) * t + 0.012 * Math.sin(t * Math.PI * 2),
        y = 0.9 - len * t,
        z = Math.max(front(x, y), 0.15) + 0.022 + lift;
      path.push(new THREE.Vector3(x, y, z));
    }
    for (let i = 0; i < N; i++) {
      const d = path[Math.min(N - 1, i + 1)]
          .clone()
          .sub(path[Math.max(0, i - 1)])
          .normalize(),
        o = new THREE.Vector3(0, 0, 1),
        ac = new THREE.Vector3().crossVectors(d, o).normalize();
      o.crossVectors(ac, d).normalize();
      across.push(ac);
      out.push(o);
      const t = i / (N - 1);
      a.push(width * (1 + 0.15 * t) * (i === N - 1 ? 0.9 : 1));
      b.push(0.014);
    }
    const geo = tubeGeometry(path, across, out, a, b, 12, 1, len / 0.25);
    parts.push([
      name,
      partFromGeometry(
        finish(geo, 12),
        geo.UV,
        chest,
        mat,
        ringOf(12, N),
        +(process.env.DARREN_TAIL_ALONG ?? 3)
      ),
    ]);
  }
  for (const [name, p] of parts) {
    p.knit = true;
    const node = doc.createNode(name).setMesh(doc.createMesh(name).addPrimitive(p)).setSkin(skin);
    nodeByName('Darren_Rig').addChild(node);
  }
}

// ---------- look: glossy finish and soft built-in shadowing (studio pass 3) ----------
// The design is glossy; the supplied material was one rough matte coat.
function glossy(material) {
  const ext = doc.createExtension(KHRMaterialsClearcoat);
  material
    .setRoughnessFactor(0.45)
    .setExtension(
      'KHR_materials_clearcoat',
      ext.createClearcoat().setClearcoatFactor(0.55).setClearcoatRoughnessFactor(0.28)
    );
}
// The old spikes' paint (darker edges) is covered with the crown's own red.
async function paintCrown(prim) {
  const tex = prim.getMaterial().getBaseColorTexture(),
    img = sharp(tex.getImage()),
    { data, info } = await img.raw().toBuffer({ resolveWithObject: true }),
    W = info.width,
    H = info.height,
    C = info.channels,
    pos = prim.getAttribute('POSITION'),
    uv = prim.getAttribute('TEXCOORD_0'),
    idx = prim.getIndices(),
    mask = new Uint8Array(W * H),
    samples = [];
  const inPatch = (i) => inCrownPatch(pos.getElement(i, []));
  for (let t = 0; t < idx.getCount(); t += 3) {
    const v = [0, 1, 2].map((k) => idx.getScalar(t + k));
    if (!v.every(inPatch)) continue;
    const q = v.map((i) => uv.getElement(i, []).map((c, k) => c * (k ? H : W)));
    const minX = Math.floor(Math.min(...q.map((p) => p[0]))) - 2,
      maxX = Math.ceil(Math.max(...q.map((p) => p[0]))) + 2,
      minY = Math.floor(Math.min(...q.map((p) => p[1]))) - 2,
      maxY = Math.ceil(Math.max(...q.map((p) => p[1]))) + 2;
    const area =
      (q[1][0] - q[0][0]) * (q[2][1] - q[0][1]) - (q[2][0] - q[0][0]) * (q[1][1] - q[0][1]);
    if (Math.abs(area) < 1e-9) continue;
    for (let py = minY; py <= maxY; py++)
      for (let px = minX; px <= maxX; px++) {
        if (px < 0 || py < 0 || px >= W || py >= H) continue;
        // Inside the triangle grown by about two texels, so no dark rim stays at its edges.
        const e = [0, 1, 2].map((k) => {
          const a = q[k],
            b = q[(k + 1) % 3];
          const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
          return (
            (((b[0] - a[0]) * (py + 0.5 - a[1]) - (b[1] - a[1]) * (px + 0.5 - a[0])) / len) *
            Math.sign(area)
          );
        });
        if (e.every((d) => d > -2.5)) mask[py * W + px] = 1;
      }
  }
  // The crown's red: the brightest half of the masked texels (the shading paint is the dark part).
  for (let i = 0; i < W * H; i++)
    if (mask[i]) samples.push([data[i * C], data[i * C + 1], data[i * C + 2]]);
  if (!samples.length) return;
  samples.sort((a, b) => b[0] + b[1] + b[2] - (a[0] + a[1] + a[2]));
  const top = samples.slice(0, Math.max(1, samples.length >> 2)),
    red = [0, 1, 2].map((k) => Math.round(top.reduce((s, p) => s + p[k], 0) / top.length));
  for (let i = 0; i < W * H; i++) if (mask[i]) for (let k = 0; k < 3; k++) data[i * C + k] = red[k];
  tex.setImage(
    await sharp(data, { raw: { width: W, height: H, channels: C } })
      .removeAlpha()
      .jpeg({ quality: 90, chromaSubsampling: '4:4:4', mozjpeg: true })
      .toBuffer()
  );
  tex.setMimeType('image/jpeg');
}
// Ambient occlusion baked into vertex colours: the hero is voxelised and each vertex looks
// around itself; creases, armpits, under the chin and under the wings come out softly darker.
function bakeAO(prims) {
  const V = 0.02,
    min = [-1.15, -0.05, -1.4],
    dims = [116, 112, 100],
    grid = new Uint8Array(dims[0] * dims[1] * dims[2]),
    at = (x, y, z) => (x * dims[1] + y) * dims[2] + z,
    cell = (p) => p.map((v, k) => Math.floor((v - min[k]) / V));
  const inside = (c) => c.every((v, k) => v >= 0 && v < dims[k]);
  const tri = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  for (const prim of prims) {
    const pos = prim.getAttribute('POSITION'),
      idx = prim.getIndices();
    for (let t = 0; t < idx.getCount(); t += 3) {
      for (let k = 0; k < 3; k++) tri[k].fromArray(pos.getElement(idx.getScalar(t + k), []));
      const len = Math.max(
          tri[0].distanceTo(tri[1]),
          tri[1].distanceTo(tri[2]),
          tri[2].distanceTo(tri[0])
        ),
        steps = Math.max(1, Math.ceil(len / (V * 0.5)));
      for (let i = 0; i <= steps; i++)
        for (let j = 0; j <= steps - i; j++) {
          const u = i / steps,
            v = j / steps,
            p = [0, 1, 2].map(
              (k) =>
                tri[0].getComponent(k) * (1 - u - v) +
                tri[1].getComponent(k) * u +
                tri[2].getComponent(k) * v
            ),
            c = cell(p);
          if (inside(c)) grid[at(...c)] = 1;
        }
    }
  }
  // Everything the outside can't reach is solid.
  const outside = new Uint8Array(grid.length),
    stack = [at(0, 0, 0)];
  outside[stack[0]] = 1;
  while (stack.length) {
    const i = stack.pop(),
      z = i % dims[2],
      y = Math.floor(i / dims[2]) % dims[1],
      x = Math.floor(i / dims[2] / dims[1]);
    for (const [dx, dy, dz] of [
      [1, 0, 0],
      [-1, 0, 0],
      [0, 1, 0],
      [0, -1, 0],
      [0, 0, 1],
      [0, 0, -1],
    ]) {
      const c = [x + dx, y + dy, z + dz];
      if (!inside(c)) continue;
      const j = at(...c);
      if (!outside[j] && !grid[j]) {
        outside[j] = 1;
        stack.push(j);
      }
    }
  }
  const solid = (p) => {
    const c = cell(p);
    return inside(c) && !outside[at(...c)];
  };
  // Directions spread evenly over a sphere; each vertex uses the ones in front of it.
  const dirs = [];
  for (let i = 0; i < 64; i++) {
    const y = 1 - (2 * (i + 0.5)) / 64,
      r = Math.sqrt(1 - y * y),
      th = i * 2.399963;
    dirs.push(new THREE.Vector3(Math.cos(th) * r, y, Math.sin(th) * r));
  }
  for (const prim of prims) {
    const pos = prim.getAttribute('POSITION'),
      nrm = prim.getAttribute('NORMAL'),
      n = pos.getCount(),
      col = new Float32Array(n * 4),
      p = new THREE.Vector3(),
      nn = new THREE.Vector3(),
      q = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      p.fromArray(pos.getElement(i, []));
      nn.fromArray(nrm.getElement(i, []));
      let seen = 0,
        total = 0;
      for (const d of dirs) {
        const w = d.dot(nn);
        if (w <= 0.05) continue;
        total += w;
        let hit = false;
        for (let s = 2.5; s < 16 && !hit; s += 1) {
          q.copy(p)
            .addScaledVector(nn, V * 1.5)
            .addScaledVector(d, s * V);
          hit = solid(q.toArray());
        }
        if (!hit) seen += w;
      }
      const ao = total ? seen / total : 1,
        k = prim.knit ? 0.62 + 0.38 * Math.min(1, ao * 1.2) : 0.42 + 0.58 * Math.min(1, ao * 1.15);
      col.set([k, k, k, 1], i * 4);
    }
    prim.setAttribute('COLOR_0', doc.createAccessor().setType('VEC4').setArray(col));
  }
}

// ---------- clearance: wings and paws keep out of the head (Claude update 12) ----------
// The wings rise right beside his big head, so a wing swung forward (or the head turned toward a
// foe) pushed the wing arm and its claw through his cheeks and eyes. The model now carries what
// the game needs to stop that (anim.mjs keepClear): the head's shape as a few balls in the head
// bone's own frame (extras.clear on the head), and probe points on each wing and forearm, in the
// frames of the bones that move them (extras.probe on wing_X and hand_X). Every frame the game
// turns a wing or arm away from the head just enough that no probe sinks into a ball.
function clearance(prim) {
  if (!['clear', 'feet', 'ground'].some((p) => PASSES.has(p)) || !bodySkin) return;
  const { top, maps, body } = bodySkin,
    pos = prim.getAttribute('POSITION'),
    idx = prim.getIndices(),
    n = pos.getCount(),
    P = Array.from({ length: n }, (_, i) => pos.getElement(i, []));
  const topBone = maps.map((m) => {
    let best = -1,
      bw = 0;
    for (const [j, w] of Object.entries(m)) if (w > bw) ((bw = w), (best = +j));
    return best;
  });
  const isWing = (i) => top.shell[i] !== body && topBone[i] !== J.head;
  // Voxels inside the head: the body and eyes made solid, then the cells whose nearest skin is
  // head skin.
  const V = 0.02,
    min = [-0.8, 0.6, -0.6],
    dims = [80, 75, 60],
    at = (x, y, z) => (x * dims[1] + y) * dims[2] + z,
    cell = (p) => p.map((v, k) => Math.floor((v - min[k]) / V)),
    inside = (c) => c.every((v, k) => v >= 0 && v < dims[k]),
    grid = new Uint8Array(dims[0] * dims[1] * dims[2]);
  const tri = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  for (let t = 0; t < idx.getCount(); t += 3) {
    const v = [0, 1, 2].map((k) => idx.getScalar(t + k));
    if (v.some(isWing)) continue;
    for (let k = 0; k < 3; k++) tri[k].fromArray(P[v[k]]);
    const len = Math.max(
        tri[0].distanceTo(tri[1]),
        tri[1].distanceTo(tri[2]),
        tri[2].distanceTo(tri[0])
      ),
      steps = Math.max(1, Math.ceil(len / (V * 0.5)));
    for (let a = 0; a <= steps; a++)
      for (let b = 0; b <= steps - a; b++) {
        const u = a / steps,
          w = b / steps,
          c = cell(
            [0, 1, 2].map(
              (k) =>
                tri[0].getComponent(k) * (1 - u - w) +
                tri[1].getComponent(k) * u +
                tri[2].getComponent(k) * w
            )
          );
        if (inside(c)) grid[at(...c)] = 1;
      }
  }
  // Below the box is all body; flood the outside from the box's top corner.
  const outside = new Uint8Array(grid.length),
    stack = [at(0, dims[1] - 1, 0)];
  outside[stack[0]] = 1;
  while (stack.length) {
    const i = stack.pop(),
      z = i % dims[2],
      y = Math.floor(i / dims[2]) % dims[1],
      x = Math.floor(i / dims[2] / dims[1]);
    for (const [dx, dy, dz] of [
      [1, 0, 0],
      [-1, 0, 0],
      [0, 1, 0],
      [0, -1, 0],
      [0, 0, 1],
      [0, 0, -1],
    ]) {
      const c = [x + dx, y + dy, z + dz];
      if (!inside(c) || c[1] === 0) continue; // the open bottom of the box is not outside
      const j = at(...c);
      if (!outside[j] && !grid[j]) {
        outside[j] = 1;
        stack.push(j);
      }
    }
  }
  const skin = [];
  for (let i = 0; i < n; i++) if (!isWing(i)) skin.push(i);
  const headSkin = skin.filter((i) => topBone[i] === J.head);
  const nearestIsHead = (p) => {
    let best = 9,
      head = false;
    for (const i of skin) {
      const q = P[i],
        d = (q[0] - p[0]) ** 2 + (q[1] - p[1]) ** 2 + (q[2] - p[2]) ** 2;
      if (d < best) ((best = d), (head = topBone[i] === J.head));
    }
    return head;
  };
  const cells = [];
  for (let x = 0; x < dims[0]; x++)
    for (let y = 1; y < dims[1]; y++)
      for (let z = 0; z < dims[2]; z++)
        if (!outside[at(x, y, z)] && (x + y + z) % 2 === 0) {
          const p = [x, y, z].map((c, k) => min[k] + (c + 0.5) * V);
          if (nearestIsHead(p)) cells.push(p);
        }
  // Balls: greedily the one that fills most of what is still uncovered, each as big as fits
  // inside the head skin.
  const radius = (p) => {
    let best = 9;
    for (const i of headSkin) {
      const q = P[i];
      best = Math.min(best, (q[0] - p[0]) ** 2 + (q[1] - p[1]) ** 2 + (q[2] - p[2]) ** 2);
    }
    return Math.sqrt(best);
  };
  // Greedily the ball that brings the most head skin to within 2.5 cm of a ball, each as big as
  // fits inside the head skin, until nearly all of it is.
  const cand = cells.filter((_, k) => k % 2 === 0).map((p) => [...p, radius(p)]),
    surf = headSkin.filter((_, k) => k % 2 === 0).map((i) => P[i]),
    left = new Set(surf.keys()),
    balls = [],
    M = 0.025;
  while (balls.length < 32 && left.size > surf.length * 0.02) {
    let best = null,
      bestN = 0;
    for (const c of cand) {
      let k = 0;
      const rr = (c[3] + M) ** 2;
      for (const i of left) {
        const p = surf[i];
        if ((p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 + (p[2] - c[2]) ** 2 < rr) k++;
      }
      if (k > bestN) ((bestN = k), (best = c));
    }
    if (!best) break;
    balls.push(best);
    for (const i of [...left]) {
      const p = surf[i];
      if (
        (p[0] - best[0]) ** 2 + (p[1] - best[1]) ** 2 + (p[2] - best[2]) ** 2 <
        (best[3] + M) ** 2
      )
        left.delete(i);
    }
  }
  const local = (name, p) =>
    new THREE.Vector3(...p).applyMatrix4(
      new THREE.Matrix4().fromArray(nodeByName(name).getWorldMatrix()).invert()
    );
  const r3 = (v) => Math.round(v * 1000) / 1000;
  const head = nodeByName('head');
  if (PASSES.has('clear'))
    head.setExtras({
      ...head.getExtras(),
      clear: balls.map((b) => [...local('head', b).toArray(), b[3]].map(r3)),
    });
  // Clearance of a point from the balls at rest (negative = already inside).
  const gap = (p) =>
    Math.min(...balls.map((b) => Math.hypot(p[0] - b[0], p[1] - b[1], p[2] - b[2]) - b[3]));
  // Probe points: spread evenly over the part (farthest point first), skipping skin near the
  // root that never comes near the head anyway. Each keeps the gap it has at rest as a floor,
  // so a probe that rests close to the head is only kept from getting closer.
  const probes = (ids, bones, rootPos, count) => {
    const pts = ids.filter((i) => new THREE.Vector3(...P[i]).distanceTo(rootPos) > 0.15),
      chosen = [];
    if (!pts.length) return [];
    let far = pts.map(() => 9);
    let next = pts.reduce((a, i, k) => (P[i][1] > P[pts[a]][1] ? k : a), 0);
    while (chosen.length < count) {
      const c = pts[next];
      chosen.push(c);
      far = far.map((d, k) => {
        const q = P[pts[k]];
        return Math.min(d, Math.hypot(q[0] - P[c][0], q[1] - P[c][1], q[2] - P[c][2]));
      });
      next = far.reduce((a, d, k) => (d > far[a] ? k : a), 0);
    }
    return chosen.map((i) => {
      const m = maps[i],
        tot = bones.reduce((s, b) => s + (m[J[b]] || 0), 0) || 1,
        t = bones.length > 1 ? (m[J[bones[1]]] || 0) / tot : 0;
      return [
        ...local(bones[0], P[i]).toArray(),
        ...(bones[1] ? local(bones[1], P[i]).toArray() : [0, 0, 0]),
        t,
        Math.min(0.03, gap(P[i])),
      ].map(r3);
    });
  };
  for (const s of PASSES.has('clear') ? ['L', 'R'] : []) {
    const wingIds = [],
      foreIds = [];
    for (let i = 0; i < n; i++) {
      if (isWing(i) && (s === 'L') === P[i][0] > 0) wingIds.push(i);
      if (top.shell[i] === body && topBone[i] === J['hand_' + s]) foreIds.push(i);
    }
    const wing = nodeByName('wing_' + s),
      hand = nodeByName('hand_' + s);
    wing.setExtras({
      ...wing.getExtras(),
      probe: probes(wingIds, ['wing_' + s, 'wingtip_' + s], worldPos('wing_' + s), 48),
    });
    hand.setExtras({
      ...hand.getExtras(),
      probe: probes(foreIds, ['hand_' + s], worldPos('hand_' + s), 16),
    });
  }
  // Soles (fix pass 2): points spread over the bottom of each foot, in the foot bone's frame, so
  // the game can lift a foot that a pose pushes into the ground (anim.mjs plantFeet).
  if (PASSES.has('feet'))
    for (const s of ['L', 'R']) {
      const ids = [];
      for (let i = 0; i < n; i++)
        if (top.shell[i] === body && topBone[i] === J['foot_' + s]) ids.push(i);
      const low = Math.min(...ids.map((i) => P[i][1])),
        sole = ids.filter((i) => P[i][1] < low + 0.03),
        chosen = [sole[0]];
      while (chosen.length < 10) {
        let best = -1,
          bd = -1;
        for (const i of sole) {
          const d = Math.min(
            ...chosen.map((c) => Math.hypot(P[i][0] - P[c][0], P[i][2] - P[c][2]))
          );
          if (d > bd) ((bd = d), (best = i));
        }
        chosen.push(best);
      }
      const foot = nodeByName('foot_' + s);
      foot.setExtras({
        ...foot.getExtras(),
        sole: chosen.map((i) =>
          local('foot_' + s, P[i])
            .toArray()
            .map(r3)
        ),
      });
    }
  // Ground probes (fix pass 5): points spread over the trunk, head and each tail bone's skin, in
  // the frame of the bone that moves them, so the game can keep his body, head and tail out of
  // the ground (anim.mjs groundBody and groundTail).
  if (PASSES.has('ground')) {
    const spread = (ids, count) => {
      const chosen = [ids.reduce((a, i) => (P[i][1] < P[a][1] ? i : a), ids[0])],
        far = new Map(ids.map((i) => [i, 9]));
      while (chosen.length < Math.min(count, ids.length)) {
        const c = chosen[chosen.length - 1];
        let best = -1,
          bd = -1;
        for (const i of ids) {
          const d = Math.min(
            far.get(i),
            Math.hypot(P[i][0] - P[c][0], P[i][1] - P[c][1], P[i][2] - P[c][2])
          );
          far.set(i, d);
          if (d > bd) ((bd = d), (best = i));
        }
        chosen.push(best);
      }
      return chosen;
    };
    for (const [name, count] of [
      ['hips', 24],
      ['spine', 24],
      ['head', 40],
      ['tail_1', 8],
      ['tail_2', 8],
      ['tail_3', 8],
      ['tail_4', 8],
      ['tail_5', 8],
    ]) {
      const ids = [];
      for (let i = 0; i < n; i++) if (top.shell[i] === body && topBone[i] === J[name]) ids.push(i);
      if (!ids.length) continue;
      const bone = nodeByName(name);
      bone.setExtras({
        ...bone.getExtras(),
        ground: spread(ids, count).map((i) => local(name, P[i]).toArray().map(r3)),
      });
    }
  }
  console.log(
    'clearance:',
    balls.length,
    'head balls',
    'fitted to the head;',
    headSkin.filter((i) => gap(P[i]) < 0.03).length,
    'of',
    headSkin.length,
    'head skin points within 3 cm of a ball'
  );
}

const mainMesh = root.listMeshes().find((m) => m.getName() === 'Darren_Game'),
  main = mainMesh.listPrimitives()[0];
rebindAll();
reskinBody(main);
const { crown, redUV } = flattenCrest(main);
smoothNormals(main);
clearance(main);
const hornMesh = doc
  .createMesh('Darren_Horn')
  .addPrimitive(hornPrimitive(crown, redUV, main.getMaterial()));
const hornNode = doc.createNode('Darren horn').setMesh(hornMesh).setSkin(skin);
nodeByName('Darren_Rig').addChild(hornNode);
await buildScarf(main);
await paintCrown(main);
glossy(main.getMaterial());
bakeAO(
  root
    .listMeshes()
    .filter((m) => /Darren|Polka|Scarf/.test(m.getName()))
    .flatMap((m) => m.listPrimitives())
);

// The four supplied clips nobody can see (Attack1-3, Jump) and the seven the authored library
// replaces are dropped; the game builds every Darren clip from clips.mjs.
for (const a of root.listAnimations()) {
  for (const s of a.listSamplers()) {
    s.getInput()?.dispose();
    s.getOutput()?.dispose();
    s.dispose();
  }
  for (const c of a.listChannels()) c.dispose();
  a.dispose();
}

await doc.transform(dedup(), prune(), quantize(), prune());
await io.write(OUT, doc);
console.log('darren.glb', (fs.statSync(OUT).size / 1048576).toFixed(2), 'MB');
