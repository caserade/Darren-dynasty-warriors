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
// Look (studio pass 3):
//   - a real log mallet made to the design in place of the supplied boxes (tree-ring ends, iron
//     bands with rivets, a wooden handle with a knob), held in the closed left paw, with markers for
//     the game's trail and impact effects;
//   - soft built-in shadowing in creases, smooth shading across texture seams, and wetter, smoother
//     eyes, teeth, claws and mouth than his matte skin.
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

// ---------- geometry helpers (studio pass 3) ----------
// A part is plain arrays: positions, normals, uvs and triangle indices.
const part = () => ({ P: [], N: [], UV: [], I: [] });
function addGeometry(out, g, matrix) {
  const base = out.P.length / 3;
  if (matrix) g.applyMatrix4(matrix);
  if (!g.attributes.normal) g.computeVertexNormals();
  const pos = g.attributes.position,
    nrm = g.attributes.normal,
    uv = g.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    out.P.push(pos.getX(i), pos.getY(i), pos.getZ(i));
    out.N.push(nrm.getX(i), nrm.getY(i), nrm.getZ(i));
    out.UV.push(uv ? uv.getX(i) : 0, uv ? uv.getY(i) : 0);
  }
  if (g.index) for (let i = 0; i < g.index.count; i++) out.I.push(base + g.index.getX(i));
  else for (let i = 0; i < pos.count; i++) out.I.push(base + i);
  return out;
}
// Squeezes a geometry's uvs into one rectangle of a texture atlas (u0, v0, u1, v1).
function atlas(g, [u0, v0, u1, v1]) {
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++)
    uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), v0 + uv.getY(i) * (v1 - v0));
  return g;
}
// Colours are linear, as glTF stores them.
function material(name, color, metal, rough, extra = {}) {
  const m = doc
    .createMaterial(name)
    .setBaseColorFactor([...color, 1])
    .setMetallicFactor(metal)
    .setRoughnessFactor(rough);
  if (extra.texture) m.setBaseColorTexture(extra.texture);
  return m;
}
function skinnedPrimitive(pt, joint, mat) {
  const n = pt.P.length / 3,
    joints = new Uint8Array(n * 4),
    weights = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    joints[i * 4] = joint;
    weights[i * 4] = 1;
  }
  const acc = (type, arr) => doc.createAccessor().setType(type).setArray(arr);
  return doc
    .createPrimitive()
    .setAttribute('POSITION', acc('VEC3', new Float32Array(pt.P)))
    .setAttribute('NORMAL', acc('VEC3', new Float32Array(pt.N)))
    .setAttribute('TEXCOORD_0', acc('VEC2', new Float32Array(pt.UV)))
    .setAttribute('JOINTS_0', acc('VEC4', joints))
    .setAttribute('WEIGHTS_0', acc('VEC4', weights))
    .setIndices(acc('SCALAR', new Uint32Array(pt.I)))
    .setMaterial(mat);
}
function addPart(name, pt, joint, mat) {
  const node = doc
    .createNode(name)
    .setMesh(doc.createMesh(name).addPrimitive(skinnedPrimitive(pt, joint, mat)))
    .setSkin(skin);
  nodeByName('Bucky_Rig').addChild(node);
}
// An empty marker riding on a bone (the game reads its world position, e.g. for the trail).
function addMarker(name, bone, point) {
  const inv = new THREE.Matrix4().fromArray(nodeByName(bone).getWorldMatrix()).invert(),
    local = point.clone().applyMatrix4(inv);
  nodeByName(bone).addChild(doc.createNode(name).setTranslation(local.toArray()));
}

// ---------- the mallet (studio pass 3) ----------
// Made to the design sheet: a round log-end head with tree rings on both ends and pale split wood
// round its side, two dark iron bands with rivets, and a wooden handle with a rounded knob. The
// handle lies along the paw's grip line (front to back in the bind pose) with the head forward;
// the head's long axis runs along the arm, as the supplied box's did.
const MALLET = { below: 0.13, reach: 0.62, handle: 0.033, head: 0.17, length: 0.48 };
// One texture for the whole mallet: side grain on the left half, the log end on the top right,
// the handle's grain on the bottom right.
async function woodTexture() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
    <defs>
      <filter id="grain" x="0" y="0" width="1" height="1">
        <feTurbulence type="fractalNoise" baseFrequency="0.09 0.004" numOctaves="4" seed="7"/>
        <feColorMatrix values="0 0 0 0 0.36  0 0 0 0 0.2  0 0 0 0 0.08  0 0 0 -1.1 0.95"/>
      </filter>
      <filter id="warp" x="0" y="0" width="1" height="1">
        <feTurbulence type="fractalNoise" baseFrequency="0.012" numOctaves="2" seed="3" result="n"/>
        <feDisplacementMap in="SourceGraphic" in2="n" scale="26"/>
      </filter>
      <radialGradient id="end" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stop-color="#d9a35f"/><stop offset="0.82" stop-color="#c88d4c"/>
        <stop offset="0.9" stop-color="#9a6332"/><stop offset="1" stop-color="#6b3f1d"/>
      </radialGradient>
    </defs>
    <rect x="0" y="0" width="512" height="1024" fill="#c4874a"/>
    <rect x="0" y="0" width="512" height="1024" filter="url(#grain)"/>
    <rect x="512" y="512" width="512" height="512" fill="#a8693a"/>
    <rect x="512" y="512" width="512" height="512" filter="url(#grain)"/>
    <circle cx="768" cy="256" r="250" fill="url(#end)"/>
    <g filter="url(#warp)" fill="none" stroke="#9b6230" stroke-opacity="0.55">
      ${Array.from({ length: 11 }, (_, i) => `<circle cx="768" cy="256" r="${18 + i * 19}" stroke-width="${2 + (i % 3)}"/>`).join('')}
    </g>
    <g stroke="#6b3f1d" stroke-width="3" stroke-linecap="round" fill="none" stroke-opacity="0.7">
      <path d="M768 256 L800 330 L812 392"/><path d="M768 256 L700 214"/><path d="M768 256 L790 150"/>
    </g>
  </svg>`;
  const jpg = await sharp(Buffer.from(svg))
    .jpeg({ quality: 90, chromaSubsampling: '4:4:4' })
    .toBuffer();
  return doc.createTexture('Mallet wood').setImage(jpg).setMimeType('image/jpeg');
}
async function buildMallet(sx, hand) {
  const g0 = gripCentre(sx),
    { below, reach, handle, head, length } = MALLET,
    hz = g0.z + reach, // middle of the head
    wood = part(),
    iron = part(),
    tex = await woodTexture();
  // Handle: a lathe along +z from the knob to inside the head, a little thicker at the knob end.
  {
    const prof = [];
    const z0 = g0.z - below,
      z1 = hz;
    prof.push(new THREE.Vector2(0, z0 - 0.045));
    for (let k = 0; k <= 8; k++) {
      const a = (k / 8) * Math.PI;
      prof.push(
        new THREE.Vector2(0.046 * Math.sin(a) + 0.0001, z0 - 0.045 + 0.045 * (1 - Math.cos(a)))
      );
    }
    for (let k = 1; k <= 10; k++) {
      const t = k / 10;
      prof.push(new THREE.Vector2(handle * (1.08 - 0.16 * t), z0 + 0.02 + t * (z1 - z0 - 0.02)));
    }
    // Lathe turns about y; the handle runs along z, so y becomes z.
    const g = atlas(new THREE.LatheGeometry(prof, 24), [0.5, 0.5, 1, 1]);
    g.rotateX(Math.PI / 2);
    g.computeVertexNormals();
    addGeometry(wood, g, new THREE.Matrix4().makeTranslation(g0.x, g0.y, 0));
  }
  // Head side: a barrel with softly rounded rims, along x.
  {
    const prof = [],
      L = length / 2,
      bev = 0.03;
    for (let k = 0; k <= 6; k++) {
      const a = (k / 6) * (Math.PI / 2);
      prof.push(new THREE.Vector2(head - bev + bev * Math.sin(a), -L + bev - bev * Math.cos(a)));
    }
    for (let k = 1; k <= 10; k++) {
      const t = k / 10 - 0.5,
        bulge = 0.008 * Math.cos(t * Math.PI);
      prof.push(new THREE.Vector2(head + bulge, -L + bev + (k / 10) * 2 * (L - bev)));
    }
    for (let k = 1; k <= 6; k++) {
      const a = (k / 6) * (Math.PI / 2);
      prof.push(new THREE.Vector2(head - bev + bev * Math.cos(a), L - bev + bev * Math.sin(a)));
    }
    const g = atlas(new THREE.LatheGeometry(prof, 48), [0, 0, 0.5, 1]);
    g.rotateZ(-Math.PI / 2); // lathe axis y -> x
    g.computeVertexNormals();
    addGeometry(wood, g, new THREE.Matrix4().makeTranslation(g0.x, g0.y, hz));
    // Log ends: flat discs showing the rings.
    for (const e of [-1, 1]) {
      const r = head - 0.028,
        disc = new THREE.CircleGeometry(r, 48);
      const uv = disc.attributes.uv,
        p = disc.attributes.position;
      for (let i = 0; i < uv.count; i++)
        uv.setXY(i, 0.75 + (p.getX(i) / r) * 0.244, 0.25 - (p.getY(i) / r) * 0.244);
      disc.rotateY((e * Math.PI) / 2);
      addGeometry(wood, disc, new THREE.Matrix4().makeTranslation(g0.x + e * L, g0.y, hz));
    }
  }
  // Iron bands with rivets, a little in from each end.
  for (const e of [-1, 1]) {
    const band = new THREE.CylinderGeometry(head + 0.012, head + 0.012, 0.05, 48, 1, true);
    band.rotateZ(Math.PI / 2);
    const x = g0.x + e * (length / 2 - 0.07);
    addGeometry(iron, band, new THREE.Matrix4().makeTranslation(x, g0.y, hz));
    for (const s of [-1, 1]) {
      const edge = new THREE.TorusGeometry(head + 0.012, 0.006, 6, 48);
      edge.rotateY(Math.PI / 2);
      addGeometry(iron, edge, new THREE.Matrix4().makeTranslation(x + s * 0.025, g0.y, hz));
    }
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2 + Math.PI / 8,
        rivet = new THREE.SphereGeometry(0.011, 8, 6);
      addGeometry(
        iron,
        rivet,
        new THREE.Matrix4().makeTranslation(
          x,
          g0.y + Math.cos(a) * (head + 0.012),
          hz + Math.sin(a) * (head + 0.012)
        )
      );
    }
  }
  // A collar where the handle enters the head.
  {
    const collar = new THREE.CylinderGeometry(handle * 1.25, handle * 1.45, 0.03, 20);
    collar.rotateX(Math.PI / 2);
    addGeometry(iron, collar, new THREE.Matrix4().makeTranslation(g0.x, g0.y, hz - head - 0.004));
  }
  const j = J[hand];
  addPart('Mallet wood', wood, j, material('Mallet wood', [1, 1, 1], 0, 0.72, { texture: tex }));
  addPart('Mallet iron', iron, j, material('Mallet iron', [0.09, 0.09, 0.1], 0.35, 0.42));
  // Markers: the head's middle (impact effects) and the near and far sides of the head along the
  // handle, which the swing trail runs between.
  addMarker('mallet_head', hand, new THREE.Vector3(g0.x, g0.y, hz));
  addMarker('mallet_neck', hand, new THREE.Vector3(g0.x, g0.y, hz - head));
  addMarker('mallet_crown', hand, new THREE.Vector3(g0.x, g0.y, hz + head));
}

// ---------- look: soft built-in shadowing, smooth seams, finish (studio pass 3) ----------
// Smooth vertex normals across texture seams (the supplied ones split hard in 15 places).
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
    const nn = new THREE.Vector3().crossVectors(b, c); // area weighted
    for (const i of v) acc[top.weld[i]].add(nn);
  }
  const nrm = prim.getAttribute('NORMAL');
  for (let i = 0; i < top.n; i++) {
    const nn = acc[top.weld[i]].clone().normalize();
    if (Number.isFinite(nn.x)) nrm.setElement(i, nn.toArray());
  }
}
// Ambient occlusion baked into vertex colours: the hero is voxelised and each vertex looks around
// itself; creases (under the chin, the armpits, where belly meets thighs, under the tail) come out
// softly darker. Same method as Darren's and Tormund's, sized for Bucky.
function bakeAO(prims) {
  const V = 0.02,
    min = [-1.5, -0.05, -2.3],
    dims = [152, 116, 154],
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
        k = 0.45 + 0.55 * Math.min(1, ao * 1.15);
      col.set([k, k, k, 1], i * 4);
    }
    prim.setAttribute('COLOR_0', doc.createAccessor().setType('VEC4').setArray(col));
  }
}
// Finish, drawn from his own painted texture (one texel at a time):
//   - eyes, teeth, claws and the inside of his mouth are the warm colours on a blue hero; they get
//     a smoother, wetter surface than his matte skin (green channel of the metal/roughness map);
// Tried and dropped: scale relief drawn from the painting (its fine detail as a surface-detail
// map). The painting's brush strokes came through as fine hatching across his skin.
async function finishTextures(mat) {
  const raw = async (t) => sharp(t.getImage()).raw().toBuffer({ resolveWithObject: true });
  const col = await raw(mat.getBaseColorTexture()),
    mr = await raw(mat.getMetallicRoughnessTexture()),
    { width: w, height: h } = col.info,
    cc = col.info.channels,
    mc = mr.info.channels;
  const rough = Buffer.from(mr.data);
  for (let i = 0; i < w * h; i++) {
    const r = col.data[i * cc],
      g = col.data[i * cc + 1],
      b = col.data[i * cc + 2],
      warm = smoothstep(18, 60, r - b) * smoothstep(40, 90, r + g),
      dark = smoothstep(70, 30, r + g + b) * smoothstep(-4, 12, r - b);
    const k = Math.max(warm, dark),
      target = dark > warm ? 40 : 95;
    rough[i * mc + 1] = Math.round(rough[i * mc + 1] * (1 - k) + target * k);
  }
  mat
    .getMetallicRoughnessTexture()
    .setImage(
      await sharp(rough, { raw: { width: w, height: h, channels: mc } })
        .removeAlpha()
        .jpeg({ quality: 90, chromaSubsampling: '4:4:4', mozjpeg: true })
        .toBuffer()
    )
    .setMimeType('image/jpeg');
}

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
smoothNormals(main);
// The supplied boxes are replaced by the mallet made above.
for (const name of ['Mallet band', 'Mallet band.001', 'Mallet handle', 'Mallet head']) {
  const node = nodeByName(name);
  node.getMesh()?.dispose();
  node.dispose();
}
await buildMallet(1, 'hand_L');
bakeAO([main]);
await finishTextures(main.getMaterial());
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
void worldPos;
