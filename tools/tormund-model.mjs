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

// ---------- geometry helpers (studio pass 3) ----------
// A part is plain arrays: positions, normals, uvs and triangle indices.
const part = () => ({ P: [], N: [], UV: [], I: [] });
function addGeometry(out, g, matrix) {
  const base = out.P.length / 3,
    gg = g.index ? g : g;
  if (matrix) gg.applyMatrix4(matrix);
  gg.computeVertexNormals();
  const pos = gg.attributes.position,
    nrm = gg.attributes.normal,
    uv = gg.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    out.P.push(pos.getX(i), pos.getY(i), pos.getZ(i));
    out.N.push(nrm.getX(i), nrm.getY(i), nrm.getZ(i));
    out.UV.push(uv ? uv.getX(i) : 0, uv ? uv.getY(i) : 0);
  }
  if (gg.index) for (let i = 0; i < gg.index.count; i++) out.I.push(base + gg.index.getX(i));
  else for (let i = 0; i < pos.count; i++) out.I.push(base + i);
  return out;
}
// Flat-shaded copy (crisp bevels on steel and gems).
const faceted = (g) => {
  const f = g.index ? g.toNonIndexed() : g;
  f.computeVertexNormals();
  return f;
};
// A closed solid through cross-sections: ring k is section(k) placed by place(k, x, y).
function loft(rings, ringSize, at) {
  const P = [],
    I = [];
  for (let k = 0; k < rings; k++) for (let s = 0; s < ringSize; s++) P.push(at(k, s));
  for (let k = 0; k < rings - 1; k++)
    for (let s = 0; s < ringSize; s++) {
      const a = k * ringSize + s,
        b = k * ringSize + ((s + 1) % ringSize);
      I.push(a, b, a + ringSize, b, b + ringSize, a + ringSize);
    }
  // Caps.
  for (const [k, flip] of [
    [0, true],
    [rings - 1, false],
  ]) {
    const c = new THREE.Vector3();
    for (let s = 0; s < ringSize; s++) c.add(P[k * ringSize + s]);
    P.push(c.divideScalar(ringSize));
    const ci = P.length - 1;
    for (let s = 0; s < ringSize; s++) {
      const a = k * ringSize + s,
        b = k * ringSize + ((s + 1) % ringSize);
      if (flip) I.push(ci, b, a);
      else I.push(ci, a, b);
    }
  }
  const g = new THREE.BufferGeometry().setFromPoints(P);
  g.setIndex(I);
  // Winding check: the first ring's normal must point away from the solid's middle.
  g.computeVertexNormals();
  const mid = new THREE.Vector3();
  for (const p of P) mid.add(p);
  mid.divideScalar(P.length);
  const n = new THREE.Vector3().fromBufferAttribute(g.attributes.normal, ringSize),
    out = P[ringSize].clone().sub(mid);
  if (n.dot(out) < 0) {
    for (let i = 0; i < I.length; i += 3) [I[i + 1], I[i + 2]] = [I[i + 2], I[i + 1]];
    g.setIndex(I);
  }
  return g;
}
// Colours are linear, as glTF stores them (sRGB 212,160,60 gold is 0.66,0.36,0.06).
function material(name, color, metal, rough, extra = {}) {
  const m = doc
    .createMaterial(name)
    .setBaseColorFactor([...color, 1])
    .setMetallicFactor(metal)
    .setRoughnessFactor(rough);
  if (extra.emissive) m.setEmissiveFactor(extra.emissive);
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
  nodeByName('Tormund_Rig').addChild(node);
}
// An empty marker riding on a bone (the game reads its world position, e.g. for the sword trail).
function addMarker(name, bone, point) {
  const inv = new THREE.Matrix4().fromArray(nodeByName(bone).getWorldMatrix()).invert(),
    local = point.clone().applyMatrix4(inv);
  nodeByName(bone).addChild(doc.createNode(name).setTranslation(local.toArray()));
}

// ---------- the sword (studio pass 3) ----------
// Made to the design sheet: a pointed steel blade with bevelled edges and a central ridge, a gold
// cross-guard with diamond tips and a blue gem, a brown leather grip wrapped in a spiral, and a
// gold pommel with a blue gem. It sits in the fist with the grip along the fist's grip line
// (front to back in the bind pose), the blade pointing forward; its flats face the sides.
const SWORD = { grip: 0.21, blade: 0.86, width: 0.078 };
function buildSword(sx, hand) {
  const g0 = gripCentre(sx),
    z0 = g0.z - SWORD.grip / 2, // pommel end of the grip
    z1 = g0.z + SWORD.grip / 2, // guard
    place = new THREE.Matrix4().makeTranslation(g0.x, g0.y, 0);
  const steel = part(),
    gold = part(),
    gem = part(),
    leather = part();
  // Blade: six-sided section (flats facing x, edges up and down), narrowing to a point.
  const L = SWORD.blade,
    W = SWORD.width / 2,
    T = 0.011,
    zs = [];
  for (let k = 0; k <= 14; k++) zs.push(z1 + 0.035 + (L * k) / 14);
  const half = (z) => {
    const t = (z - z1 - 0.035) / L,
      point = smoothstep(0.82, 1, t);
    return [
      W * (1 - 0.18 * t) * Math.sqrt(Math.max(0, 1 - point * point)),
      T * (1 - 0.4 * t) * (1 - point),
    ];
  };
  const sect = [
    [0, 1],
    [1, 0.42],
    [1, -0.42],
    [0, -1],
    [-1, -0.42],
    [-1, 0.42],
  ];
  const blade = loft(zs.length, 6, (k, s) => {
    const [a, b] = half(zs[k]);
    return new THREE.Vector3(sect[s][0] * Math.max(b, 1e-4), sect[s][1] * Math.max(a, 1e-4), zs[k]);
  });
  addGeometry(steel, faceted(blade), place);
  // Ricasso block between guard and blade.
  addGeometry(
    steel,
    faceted(new THREE.BoxGeometry(0.02, W * 1.6, 0.04)),
    new THREE.Matrix4().makeTranslation(g0.x, g0.y, z1 + 0.02)
  );
  // Cross-guard: a bar along y with flared diamond tips and a centre block.
  addGeometry(
    gold,
    faceted(new THREE.BoxGeometry(0.03, 0.25, 0.032)),
    new THREE.Matrix4().makeTranslation(g0.x, g0.y, z1)
  );
  for (const e of [-1, 1]) {
    const tip = faceted(new THREE.OctahedronGeometry(0.03, 0));
    tip.scale(0.8, 1.3, 0.9);
    addGeometry(gold, tip, new THREE.Matrix4().makeTranslation(g0.x, g0.y + e * 0.135, z1));
  }
  const block = faceted(new THREE.OctahedronGeometry(0.05, 0));
  block.scale(0.55, 1, 0.9);
  addGeometry(gold, block, new THREE.Matrix4().makeTranslation(g0.x, g0.y, z1 + 0.005));
  for (const e of [-1, 1]) {
    const g = faceted(new THREE.OctahedronGeometry(0.026, 0));
    g.scale(0.5, 1.25, 0.85);
    addGeometry(gem, g, new THREE.Matrix4().makeTranslation(g0.x + e * 0.014, g0.y, z1 + 0.005));
  }
  // Grip: a leather cylinder with a raised spiral wrap.
  {
    const ringN = 40,
      seg = 16,
      grip = loft(ringN, seg, (k, s) => {
        const t = k / (ringN - 1),
          a = (s / seg) * Math.PI * 2,
          wrap = 0.0025 * Math.max(0, Math.cos(a - t * Math.PI * 2 * 7)) ** 4,
          r = 0.021 + wrap + 0.002 * Math.sin(t * Math.PI);
        return new THREE.Vector3(
          Math.cos(a) * r,
          Math.sin(a) * r,
          z0 + 0.01 + t * (SWORD.grip - 0.02)
        );
      });
    addGeometry(leather, grip, place);
  }
  // Pommel: a gold diamond with a gem on each flat, and a ferrule where it meets the grip.
  const pommel = faceted(new THREE.OctahedronGeometry(0.042, 0));
  pommel.scale(0.6, 1, 0.85);
  addGeometry(gold, pommel, new THREE.Matrix4().makeTranslation(g0.x, g0.y, z0 - 0.03));
  addGeometry(
    gold,
    new THREE.CylinderGeometry(0.025, 0.025, 0.018, 16).rotateX(Math.PI / 2),
    new THREE.Matrix4().makeTranslation(g0.x, g0.y, z0 + 0.004)
  );
  for (const e of [-1, 1]) {
    const g = faceted(new THREE.OctahedronGeometry(0.018, 0));
    g.scale(0.5, 1.2, 0.9);
    addGeometry(gem, g, new THREE.Matrix4().makeTranslation(g0.x + e * 0.02, g0.y, z0 - 0.03));
  }
  const j = J[hand];
  addPart('Sword blade', steel, j, material('Sword steel', [0.8, 0.83, 0.87], 1, 0.2));
  addPart('Sword guard', gold, j, material('Sword gold', [0.66, 0.36, 0.06], 1, 0.3));
  addPart(
    'Sword gems',
    gem,
    j,
    material('Sword gem', [0.02, 0.08, 0.6], 0.1, 0.08, { emissive: [0.01, 0.04, 0.2] })
  );
  addPart('Sword grip', leather, j, material('Sword leather', [0.12, 0.05, 0.02], 0, 0.7));
  // Trail markers: where the blade starts and where its point is.
  addMarker('blade_base', hand, new THREE.Vector3(g0.x, g0.y, z1 + 0.06));
  addMarker('blade_tip', hand, new THREE.Vector3(g0.x, g0.y, z1 + 0.035 + L));
}

// ---------- the shield (studio pass 3) ----------
// A heater (kite) shield to the design: rounded top corners, straight sides curving to a point,
// a gently domed blue face with the cream fleur-de-lis, a gold rim with rivets, a wooden back
// with a strap. It sits on the fist and forearm facing forward, as the old box did.
const SHIELD = { w: 0.255, top: 0.36, bottom: -0.38, waist: 0.04, dome: 0.04, thick: 0.03 };
function shieldOutline(n = 96) {
  // Right half from the top centre round to the point; the left half mirrors it.
  const { w, top, bottom, waist } = SHIELD,
    pts = [],
    corner = 0.06;
  const add = (u, v) => pts.push([u, v]);
  for (let i = 0; i <= 10; i++) {
    const u = ((w - corner) * i) / 10;
    add(u, top - 0.025 * (u / w) ** 2);
  }
  for (let i = 1; i <= 8; i++) {
    const a = (i / 8) * (Math.PI / 2);
    add(w - corner + corner * Math.sin(a), top - 0.025 - corner + corner * Math.cos(a));
  }
  for (let i = 1; i <= 6; i++)
    add(w, top - 0.025 - corner - ((top - 0.025 - corner - waist) * i) / 6);
  const arc = n / 2 - pts.length;
  for (let i = 1; i <= arc; i++) {
    const a = (i / arc) * (Math.PI / 2);
    add(w * Math.cos(a) ** 0.9, waist - (waist - bottom) * Math.sin(a));
  }
  const right = pts,
    left = right
      .slice(1, -1)
      .reverse()
      .map(([u, v]) => [-u, v]);
  return [...right, ...left]; // clockwise seen from the front, starting at the top centre
}
async function shieldTexture() {
  const fleur = `
    <g fill="#efe2bf" stroke="#9c8a62" stroke-width="1.2" stroke-linejoin="round">
      <path d="M50 4 C63 22 65 40 55.5 58 L44.5 58 C35 40 37 22 50 4 Z"/>
      <path d="M47 53 C41 40 35 27 24 23 C13 19 6 31 13 41 C15 33 21 30 27 33 C34 37 38 46 41 55 Z"/>
      <path d="M53 53 C59 40 65 27 76 23 C87 19 94 31 87 41 C85 33 79 30 73 33 C66 37 62 46 59 55 Z"/>
      <rect x="33" y="56" width="34" height="8" rx="2.5"/>
      <path d="M46 64 L54 64 L52.5 82 L50 88 L47.5 82 Z"/>
      <path d="M44 64 C35 67 30 76 34.5 85 C37 78 41 72 47 67 Z"/>
      <path d="M56 64 C65 67 70 76 65.5 85 C63 78 59 72 53 67 Z"/>
    </g>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 100 100">
    <defs>
      <radialGradient id="field" cx="0.42" cy="0.32" r="0.8">
        <stop offset="0" stop-color="#3f6fc0"/><stop offset="0.65" stop-color="#2b549f"/>
        <stop offset="1" stop-color="#1d3b74"/>
      </radialGradient>
      <filter id="paint"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3" seed="4"/>
        <feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.16 0"/>
        <feComposite in2="SourceGraphic" operator="in"/></filter>
    </defs>
    <rect width="100" height="100" fill="url(#field)"/>
    <rect width="100" height="100" fill="#000" filter="url(#paint)"/>
    <g transform="translate(9 6) scale(0.82)">${fleur}</g>
  </svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 90, chromaSubsampling: '4:4:4' }).toBuffer();
}
async function buildShield(sx, hand) {
  const g0 = gripCentre(sx),
    { w, top, bottom, dome, thick } = SHIELD,
    // Centre over the wrist and fist; its back clears the knuckles.
    cx = sx * 1.06,
    cy = g0.y + 0.03,
    zBack = 0.43,
    outline = shieldOutline(),
    n = outline.length,
    centre = [0, 0.02],
    zFront = (u) => zBack + thick + dome * (1 - (u / (w * 1.08)) ** 2),
    toUV = (u, v) => [
      (u / (w * 2) + 0.5) * 0.82 + 0.09,
      (0.5 - (v - (top + bottom) / 2) / (top - bottom)) * 0.86 + 0.07,
    ];
  const face = part(),
    back = part(),
    gold = part();
  // Front: rings of the outline shrunk toward the centre (the outline is star-shaped from there).
  const RINGS = 12,
    fp = [],
    fuv = [];
  for (let r = 0; r <= RINGS; r++) {
    const k = 1 - r / RINGS;
    for (let i = 0; i < n; i++) {
      const u = centre[0] + (outline[i][0] - centre[0]) * k,
        v = centre[1] + (outline[i][1] - centre[1]) * k;
      fp.push(new THREE.Vector3(cx + u, cy + v, zFront(u)));
      fuv.push(...toUV(u, v));
    }
  }
  const fi = [];
  for (let r = 0; r < RINGS; r++)
    for (let i = 0; i < n; i++) {
      const a = r * n + i,
        b = r * n + ((i + 1) % n);
      fi.push(a, a + n, b, b, a + n, b + n);
    }
  {
    const g = new THREE.BufferGeometry().setFromPoints(fp);
    g.setIndex(fi);
    g.setAttribute('uv', new THREE.Float32BufferAttribute(fuv, 2));
    g.computeVertexNormals();
    if (g.attributes.normal.getZ(n * 6) < 0) {
      for (let i = 0; i < fi.length; i += 3) [fi[i + 1], fi[i + 2]] = [fi[i + 2], fi[i + 1]];
      g.setIndex(fi);
    }
    addGeometry(face, g);
  }
  // Back and side: a flat back plate joined to the face's edge.
  {
    const P = [],
      I = [];
    for (let i = 0; i < n; i++)
      P.push(new THREE.Vector3(cx + outline[i][0], cy + outline[i][1], zBack));
    for (let i = 0; i < n; i++) P.push(fp[i].clone());
    P.push(new THREE.Vector3(cx + centre[0], cy + centre[1], zBack));
    const c = 2 * n;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      I.push(c, i, j); // back (faces -z: fixed below)
      I.push(i, n + i, j, j, n + i, n + j); // side
    }
    const g = new THREE.BufferGeometry().setFromPoints(P);
    g.setIndex(I);
    const flat = faceted(g);
    // Make every face point away from the shield's middle.
    const pos = flat.attributes.position,
      mid = new THREE.Vector3(cx, cy, zBack + thick / 2),
      a = new THREE.Vector3(),
      b = new THREE.Vector3(),
      c3 = new THREE.Vector3();
    for (let t = 0; t < pos.count; t += 3) {
      a.fromBufferAttribute(pos, t);
      b.fromBufferAttribute(pos, t + 1);
      c3.fromBufferAttribute(pos, t + 2);
      const nn = b.clone().sub(a).cross(c3.clone().sub(a)),
        out = a.clone().add(b).add(c3).divideScalar(3).sub(mid);
      if (nn.dot(out) < 0) {
        pos.setXYZ(t + 1, c3.x, c3.y, c3.z);
        pos.setXYZ(t + 2, b.x, b.y, b.z);
      }
    }
    flat.computeVertexNormals();
    addGeometry(back, flat);
    // Strap across the back, where the forearm goes through.
    addGeometry(
      back,
      faceted(new THREE.BoxGeometry(0.4, 0.05, 0.02)),
      new THREE.Matrix4().makeTranslation(cx - sx * 0.05, cy + 0.1, zBack - 0.012)
    );
  }
  // Gold rim: a flattened band along the outline, wrapping the front edge, with rivets.
  {
    const SEG = 8,
      rim = loft(n + 1, SEG, (k, s) => {
        const i = k % n,
          [u, v] = outline[i],
          [u0, v0] = outline[(i - 1 + n) % n],
          [u1, v1] = outline[(i + 1) % n],
          tx = u1 - u0,
          ty = v1 - v0,
          tl = Math.hypot(tx, ty),
          // inward direction in the shield plane (the outline runs clockwise from the front)
          ix = ty / tl,
          iy = -tx / tl,
          a = (s / SEG) * Math.PI * 2,
          inward = Math.cos(a) * 0.016 - 0.004,
          lift = Math.sin(a) * 0.024;
        return new THREE.Vector3(
          cx + u + ix * inward,
          cy + v + iy * inward,
          zBack + thick / 2 + 0.012 + lift + (zFront(u) - zBack - thick) * 0.6
        );
      });
    addGeometry(gold, rim);
    const rivets = 16;
    for (let r = 0; r < rivets; r++) {
      const i = Math.floor(((r + 0.5) / rivets) * n),
        [u, v] = outline[i],
        [u0, v0] = outline[(i - 1 + n) % n],
        [u1, v1] = outline[(i + 1) % n],
        tl = Math.hypot(u1 - u0, v1 - v0),
        ix = (v1 - v0) / tl,
        iy = -(u1 - u0) / tl,
        g = new THREE.SphereGeometry(0.011, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(
          Math.PI / 2
        );
      addGeometry(
        gold,
        g,
        new THREE.Matrix4().makeTranslation(
          cx + u + ix * 0.03,
          cy + v + iy * 0.03,
          zFront(u + ix * 0.03) - 0.002
        )
      );
    }
  }
  const tex = doc
    .createTexture('Shield face')
    .setImage(await shieldTexture())
    .setMimeType('image/jpeg');
  const j = J[hand];
  addPart('Shield face', face, j, material('Shield paint', [1, 1, 1], 0, 0.55, { texture: tex }));
  addPart('Shield back', back, j, material('Shield wood', [0.13, 0.07, 0.03], 0, 0.8));
  addPart('Shield rim', gold, j, material('Shield gold', [0.66, 0.36, 0.06], 1, 0.32));
}

// ---------- look: soft built-in shadowing and smooth seams (studio pass 3) ----------
// Smooth vertex normals across texture seams (the supplied ones split hard in 47 places).
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
// itself; creases (under the scarf, belt and tabard, between the legs, the tail root) come out
// softly darker. Same method as Darren's (tools/darren-model.mjs), sized for Tormund.
function bakeAO(prims) {
  const V = 0.02,
    min = [-1.45, -0.05, -0.75],
    dims = [146, 122, 78],
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
smoothNormals(main);
// The supplied boxes are replaced by the sword and shield made above.
for (const name of ['Shield face', 'Shield rim', 'Sword blade', 'Sword grip', 'Sword guard']) {
  const node = nodeByName(name);
  node.getMesh()?.dispose();
  node.dispose();
}
buildSword(1, 'hand_L');
await buildShield(-1, 'hand_R');
bakeAO([main]);
await jpegTextures();

// keepLeaves: the empty trail markers on the sword hand are leaves and must stay.
await doc.transform(dedup(), prune({ keepLeaves: true }), quantize(), prune({ keepLeaves: true }));
await io.write(OUT, doc);
console.log('tormund.glb', (fs.statSync(OUT).size / 1048576).toFixed(2), 'MB');
void worldPos;
