// Builds the game's Tormund model (dist/3d/assets/tormund.glb) from the original supplied model
// (art-source/tormund-3d-original.glb, the file as first exported), Claude update 9. Every step
// is code, so it can be re-run and reviewed; nothing is hand-edited in the binary file.
// Same approach as tools/darren-model.mjs; the small mesh helpers are repeated here on purpose
// so the two heroes' builds never change each other.
//
// Rig and skin (studio pass 2):
//   - the neck and head bones stop moving the top of the breastplate and the scarf's lower edge;
//   - softer blends between bones (see reskinBody for what was tried and dropped);
//   - fists: the supplied paws are flat and open; the fingers are curled into fists around a
//     grip line that runs front to back through each paw.
//
// One-time setup outside the game folder's tests (same as tools/darren-model.mjs):
//   npm i --no-save @gltf-transform/core@4 @gltf-transform/extensions@4 @gltf-transform/functions@4 sharp
// Run: node tools/tormund-model.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import sharp from 'sharp';
import { dedup, prune, quantize } from '@gltf-transform/functions';
import * as THREE from '../dist/3d/vendor/three.core.js';

const here = path.dirname(fileURLToPath(import.meta.url)),
  SRC = path.join(here, '../art-source/tormund-3d-original.glb'),
  OUT = path.join(here, '../dist/3d/assets/tormund.glb');
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
  main = mainMesh.listPrimitives()[0],
  bodyMat = main.getMaterial();

// ---------- texture lookups (the painted colour and the metal map, per vertex) ----------
async function sampler(texture) {
  const { data, info } = await sharp(texture.getImage())
    .raw()
    .toBuffer({ resolveWithObject: true });
  return (u, v) => {
    const x = Math.min(info.width - 1, Math.max(0, Math.floor(u * info.width))),
      y = Math.min(info.height - 1, Math.max(0, Math.floor(v * info.height))),
      i = (y * info.width + x) * info.channels;
    return [data[i], data[i + 1], data[i + 2]];
  };
}
const albedoAt = await sampler(bodyMat.getBaseColorTexture()),
  mrAt = await sampler(bodyMat.getMetallicRoughnessTexture());

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
// a*(1-t) + b*t for two weight maps.
const blend = (a, b, t) => {
  const out = {};
  for (const [k, v] of Object.entries(a)) out[k] = v * (1 - t);
  for (const [k, v] of Object.entries(b)) out[k] = (out[k] || 0) + v * t;
  return out;
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
// Averages each welded vertex's weights with its neighbours' (keeps bends soft, never spreads far).
function smoothWeights(top, maps, rounds, keep = 0.5) {
  for (let r = 0; r < rounds; r++) {
    const acc = new Map();
    maps.forEach((m, i) => {
      const w = top.weld[i];
      if (!acc.has(w)) acc.set(w, m);
    });
    const next = new Map();
    for (const [w, m] of acc) {
      const out = {};
      for (const [j, v] of Object.entries(m)) out[j] = v * keep;
      const share = (1 - keep) / top.nb[w].size;
      for (const o of top.nb[w])
        for (const [j, v] of Object.entries(acc.get(o))) out[j] = (out[j] || 0) + v * share;
      next.set(w, out);
    }
    maps.forEach((m, i) => (maps[i] = { ...next.get(top.weld[i]) }));
  }
}

// ---------- skin weights (studio pass 2) ----------
// Tried and dropped: making the breastplate and shoulder plates rigid, and hanging the tabard
// from the hips. The body is one fused surface (plates, sleeves, tabard and trousers are not
// separate pieces), so a rigid plate only moves the stretching to its edge: the stretch check
// (tools/review/stretch.cjs) got worse by about a third and the chainmail sleeves visibly
// squeezed into the shoulder plates. That needs the armour cut into separate pieces by an artist.
// What helps on this mesh: the neck and head stop at the collar, and every blend between two
// bones is softened a little (fewer sharply stretched edges at the knees, elbows and hips).
function reskinBody(prim) {
  const top = topology(prim),
    maps = readWeights(prim).map(normalize);
  maps.forEach((m, i) => {
    const y = top.P[i][1],
      up = smoothstep(1.5, 1.62, y);
    for (const b of [J.neck, J.head]) {
      const v = (m[b] || 0) * (1 - up);
      if (!v) continue;
      m[b] -= v;
      m[J.chest] = (m[J.chest] || 0) + v;
    }
  });
  smoothWeights(top, maps, 4, 0.5);
  // Smoothing must not carry the neck back down onto the breastplate.
  maps.forEach((m, i) => {
    const y = top.P[i][1];
    if (y < 1.47) {
      m[J.chest] = (m[J.chest] || 0) + (m[J.neck] || 0) + (m[J.head] || 0);
      delete m[J.neck];
      delete m[J.head];
    }
  });
  writeWeights(prim, maps);
}

// ---------- fists (studio pass 2) ----------
// The fingers (past the knuckles) are wrapped round a circle under the palm, like a bend
// deformer: a point s metres past the knuckle line and h above the palm's underside goes to
// angle s / (R + mid) on a circle of radius R + h around the grip line. Continuous at the knuckles,
// so the glove stays one smooth surface; the thumb (at the front of the paw) is left as it is.
const FIST = { knuckle: 1.14, palm: 1.405, R: 0.03, mid: 0.025, thumbZ: 0.345 };
function makeFists(prim) {
  const pos = prim.getAttribute('POSITION'),
    nrm = prim.getAttribute('NORMAL'),
    { knuckle, palm, R, mid, thumbZ } = FIST,
    cy = palm - R;
  for (let i = 0; i < pos.getCount(); i++) {
    const [x, y, z] = pos.getElement(i, []),
      ax = Math.abs(x),
      sx = Math.sign(x);
    if (ax <= knuckle || y < 1.3 || y > 1.56) continue;
    // Thumb: the front of the paw near the knuckles bends only a little.
    const thumb = smoothstep(thumbZ - 0.02, thumbZ + 0.02, z) * (1 - smoothstep(1.2, 1.24, ax)),
      s = ax - knuckle,
      h = y - palm,
      // Lengths are kept along the middle of the finger (mid above the palm), so the back of the
      // glove stretches and the palm side folds about evenly.
      phi = (s / (R + mid)) * (1 - 0.8 * thumb),
      r = R + h;
    pos.setElement(i, [sx * (knuckle + r * Math.sin(phi)), cy + r * Math.cos(phi), z]);
    // Normals turn with the finger: rotate (nx, ny) by phi toward -y.
    const [nx, ny, nz] = nrm.getElement(i, []),
      lx = nx * sx,
      c = Math.cos(phi),
      sn = Math.sin(phi);
    nrm.setElement(i, [sx * (lx * c + ny * sn), -lx * sn + ny * c, nz]);
  }
}
// Where the fist holds things: the grip line's centre in each paw (bind pose, model space).
const gripCentre = (sx) => new THREE.Vector3(sx * (FIST.knuckle - 0.005), FIST.palm - FIST.R, 0.28);

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

reskinBody(main);
makeFists(main);
await jpegTextures();

await doc.transform(dedup(), prune(), quantize(), prune());
await io.write(OUT, doc);
console.log('tormund.glb', (fs.statSync(OUT).size / 1048576).toFixed(2), 'MB');
void worldPos;
void gripCentre;
