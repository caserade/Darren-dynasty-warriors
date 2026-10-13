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
function partFromGeometry(g, uv, weightOf, material) {
  const n = g.attributes.position.count,
    joints = new Uint8Array(n * 4),
    weights = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    const w = weightOf(g.attributes.position.getY(i));
    w.forEach(([j, v], k) => {
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
  const neckW = (y) => {
    const h = smoothstep(0.95, 1.07, y) * 0.8;
    return h > 0.01
      ? [
          [J.spine, 1 - h],
          [J.head, h],
        ]
      : [[J.spine, 1]];
  };
  const chest = () => [[J.spine, 1]];
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
    parts.push(['Polka scarf collar', partFromGeometry(finish(geo, 0), geo.UV, neckW, mat)]);
  }
  const front = bodyFront(prim);
  // Knot at the front left of the collar.
  {
    const c = new THREE.Vector3(-0.115, 0.92, 0.245),
      g = new THREE.SphereGeometry(1, 20, 14);
    g.scale(0.065, 0.055, 0.04);
    g.translate(c.x, c.y, c.z);
    const uv = Array.from(g.attributes.uv.array, (v) => v * 2);
    parts.push(['Polka scarf knot', partFromGeometry(g, uv, chest, mat)]);
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
    parts.push([name, partFromGeometry(finish(geo, 12), geo.UV, chest, mat)]);
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

const mainMesh = root.listMeshes().find((m) => m.getName() === 'Darren_Game'),
  main = mainMesh.listPrimitives()[0];
rebindAll();
reskinBody(main);
const { crown, redUV } = flattenCrest(main);
smoothNormals(main);
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
