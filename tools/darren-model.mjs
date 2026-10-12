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
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
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
  writeWeights(prim, maps);
}

const main = root
  .listMeshes()
  .find((m) => m.getName() === 'Darren_Game')
  .listPrimitives()[0];
rebindAll();
reskinBody(main);

// The four supplied clips nobody can see (Attack1-3, Jump) and the seven the authored library
// replaces are dropped; the game builds every Darren clip from clips.mjs.
for (const a of root.listAnimations()) a.dispose();

await doc.transform(dedup(), prune(), quantize());
await io.write(OUT, doc);
console.log('darren.glb', (fs.statSync(OUT).size / 1048576).toFixed(2), 'MB');
