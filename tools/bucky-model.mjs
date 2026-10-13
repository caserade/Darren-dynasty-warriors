// Builds the game's Bucky model (dist/3d/assets/bucky.glb) from the original supplied model
// (art-source/bucky-3d-original.glb, the file as first exported), Claude update 10. Every step
// is code, so it can be re-run and reviewed; nothing is hand-edited in the binary file.
// Same approach as tools/darren-model.mjs and tools/tormund-model.mjs; the small mesh helpers are
// repeated here on purpose so the heroes' builds never change each other.
//
// Rig and skin (studio pass 2):
//   - joints on the middle of each limb: the supplied arm and leg joints sat on the top-front
//     surface of the limb, so elbows, knees and shoulders turned about the skin instead of inside it;
//   - softer blends round the hips, thighs and ankles, where his belly, bottom and thighs meet;
//   - closed paws: the supplied paws are flat and open; the fingers and claws are curled into a
//     grip around a line that runs front to back under each palm.
//
// One-time setup outside the game folder's tests (same as tools/darren-model.mjs):
//   npm i --no-save @gltf-transform/core@4 @gltf-transform/extensions@4 @gltf-transform/functions@4 sharp
// Run: node tools/bucky-model.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import sharp from 'sharp';
import { dedup, prune, quantize } from '@gltf-transform/functions';
import * as THREE from '../dist/3d/vendor/three.core.js';

const here = path.dirname(fileURLToPath(import.meta.url)),
  SRC = path.join(here, '../art-source/bucky-3d-original.glb'),
  OUT = path.join(here, '../dist/3d/assets/bucky.glb');
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(SRC),
  root = doc.getRoot(),
  skin = root.listSkins()[0];

const smoothstep = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const nodeByName = (n) => root.listNodes().find((x) => x.getName() === n);
const joints = skin.listJoints(),
  J = Object.fromEntries(joints.map((j, i) => [j.getName(), i]));
const worldPos = (name) => {
  const m = nodeByName(name).getWorldMatrix();
  return new THREE.Vector3(m[12], m[13], m[14]);
};
const mainMesh = root.listMeshes().find((m) => /^tripo_mesh/.test(m.getName())),
  main = mainMesh.listPrimitives()[0];

// ---------- skeleton: joints on the middle of the limbs and tail (studio pass 2) ----------
// Bind-pose positions (model space, metres), measured from cross-sections of the supplied mesh.
// Moving a joint keeps its rest rotation, so every authored pose keeps its meaning; only the
// point it turns about moves.
const JOINT_AT = {
  upperarm_L: [0.47, 1.37, -0.12],
  forearm_L: [0.9, 1.36, -0.12],
  hand_L: [1.21, 1.35, -0.09],
  thigh_L: [0.44, 0.63, -0.1],
  shin_L: [0.5, 0.34, -0.12],
  foot_L: [0.52, 0.15, -0.06],
};
function placeJoint(name, p) {
  const n = nodeByName(name),
    parentInv = new THREE.Matrix4().fromArray(n.getParentNode().getWorldMatrix()).invert();
  n.setTranslation(new THREE.Vector3(...p).applyMatrix4(parentInv).toArray());
}
function placeJoints() {
  // Parents before children, so each child is placed against its parent's new position.
  for (const [name, p] of Object.entries(JOINT_AT)) {
    placeJoint(name, p);
    if (name.endsWith('_L')) placeJoint(name.replace(/_L$/, '_R'), [-p[0], p[1], p[2]]);
  }
}
function rebindAll() {
  const ibm = doc
    .createAccessor()
    .setType('MAT4')
    .setArray(new Float32Array(joints.length * 16));
  joints.forEach((j, i) =>
    ibm.setElement(i, new THREE.Matrix4().fromArray(j.getWorldMatrix()).invert().toArray())
  );
  for (const s of root.listSkins()) s.setInverseBindMatrices(ibm);
}

// ---------- skin weight helpers ----------
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
const normalize = (m) => {
  const s = Object.values(m).reduce((a, b) => a + b, 0) || 1;
  for (const k of Object.keys(m)) m[k] /= s;
  return m;
};
// Positions welded across texture seams, with each welded point's neighbours.
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
  const nb = Array.from({ length: keys.size }, () => new Set());
  for (let t = 0; t < idx.getCount(); t += 3) {
    const v = [0, 1, 2].map((k) => weld[idx.getScalar(t + k)]);
    for (let k = 0; k < 3; k++) {
      nb[v[k]].add(v[(k + 1) % 3]);
      nb[v[k]].add(v[(k + 2) % 3]);
    }
  }
  return { P, weld, nb, n };
}
// Averages each welded point's weights with its neighbours' (keeps bends soft, never spreads far).
function smoothWeights(top, maps, rounds, keep = 0.5, only = () => true) {
  for (let r = 0; r < rounds; r++) {
    const first = new Map();
    maps.forEach((m, i) => first.has(top.weld[i]) || first.set(top.weld[i], i));
    const next = new Map();
    for (const [w, i] of first) {
      if (!only(i)) continue;
      const out = {};
      for (const [j, v] of Object.entries(maps[i])) out[j] = v * keep;
      const share = (1 - keep) / top.nb[w].size;
      for (const o of top.nb[w])
        for (const [j, v] of Object.entries(maps[first.get(o)])) out[j] = (out[j] || 0) + v * share;
      next.set(w, out);
    }
    maps.forEach((m, i) => next.has(top.weld[i]) && (maps[i] = { ...next.get(top.weld[i]) }));
  }
}

// ---------- skin weights (studio pass 2) ----------
// Measured with the stretch check (tools/review/stretch.cjs: edges pulled past 1.6x or squeezed
// under half their length, worst frame per bone, every clip but the rolling dash, which pass 4
// rebuilds): 4,930 for the supplied rig. Limb joints on the middle of the limb 4,815; softer hips,
// thighs and ankles 4,516; closed paws 4,425.
// Tried and dropped: moving the tail bones onto the middle of the tail, and giving the tail
// bones only the tail (the back and bottom to the hips and spine). Both measured worse (up to
// 5,600): the tail's lift then bends at one sharp line at the rump instead of spreading along the
// back. The 'sheet' his back tore into comes from poses that point the tail straight up when he
// leans into a smash; pass 4 lets the tail hang back to balance him instead.
function softenHips(prim) {
  const top = topology(prim),
    maps = readWeights(prim).map(normalize);
  smoothWeights(top, maps, 8, 0.5, (i) => {
    const [, y, z] = top.P[i];
    return y < 0.95 && z > -0.7;
  });
  writeWeights(prim, maps);
}

// ---------- closed paws (studio pass 2) ----------
// The fingers (past the knuckles) are wrapped round a circle under the palm, like a bend
// deformer: a point s metres past the knuckle line and h above the palm's underside goes to
// angle s / (R + mid) on a circle of radius R + h around the grip line. Continuous at the
// knuckles, so the paw stays one smooth surface. The claws curl under and hook round the handle.
const FIST = { knuckle: 1.3, palm: 1.25, R: 0.04, mid: 0.06 };
function makeFists(prim) {
  const pos = prim.getAttribute('POSITION'),
    nrm = prim.getAttribute('NORMAL'),
    { knuckle, palm, R, mid } = FIST,
    cy = palm - R;
  for (let i = 0; i < pos.getCount(); i++) {
    const [x, y, z] = pos.getElement(i, []),
      ax = Math.abs(x),
      sx = Math.sign(x);
    if (ax <= knuckle || y < 1.1 || y > 1.6) continue;
    const s = ax - knuckle,
      h = y - palm,
      phi = s / (R + mid),
      r = R + h;
    pos.setElement(i, [sx * (knuckle + r * Math.sin(phi)), cy + r * Math.cos(phi), z]);
    const [nx, ny, nz] = nrm.getElement(i, []),
      lx = nx * sx,
      c = Math.cos(phi),
      sn = Math.sin(phi);
    nrm.setElement(i, [sx * (lx * c + ny * sn), -lx * sn + ny * c, nz]);
  }
}
// Where the paw holds things: the grip line's centre in each paw (bind pose, model space).
const gripCentre = (sx) => new THREE.Vector3(sx * (FIST.knuckle - 0.01), FIST.palm - FIST.R, -0.1);

// PNG maps become high-quality JPEGs, as tools/shrink-models.mjs did for the old file.
async function jpegTextures() {
  for (const texture of root.listTextures()) {
    if (texture.getMimeType() !== 'image/png') continue;
    texture
      .setImage(
        await sharp(texture.getImage())
          .removeAlpha()
          .jpeg({ quality: 90, chromaSubsampling: '4:4:4', mozjpeg: true })
          .toBuffer()
      )
      .setMimeType('image/jpeg');
  }
}

// BUCKY_STEPS (comma list) builds with only some steps, for measuring each one on its own.
const STEPS = new Set((process.env.BUCKY_STEPS || 'joints,soft,fists').split(','));
if (STEPS.has('joints')) {
  placeJoints();
  rebindAll();
}
if (STEPS.has('soft')) softenHips(main);
if (STEPS.has('fists')) makeFists(main);
// The supplied clips are dropped (studio pass 4): the game builds every Bucky clip from clips.mjs,
// and with no Attack1 its fallback for a missing move is Idle, not the stiff supplied swing.
for (const a of root.listAnimations()) {
  for (const sm of a.listSamplers()) {
    sm.getInput()?.dispose();
    sm.getOutput()?.dispose();
    sm.dispose();
  }
  for (const c of a.listChannels()) c.dispose();
  a.dispose();
}
await jpegTextures();

// keepLeaves: empty marker nodes on the hand are leaves and must stay.
await doc.transform(dedup(), prune({ keepLeaves: true }), quantize(), prune({ keepLeaves: true }));
await io.write(OUT, doc);
console.log('bucky.glb', (fs.statSync(OUT).size / 1048576).toFixed(2), 'MB');
void gripCentre;
