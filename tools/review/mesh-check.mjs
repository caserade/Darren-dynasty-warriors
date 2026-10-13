// Close test of a hero's mesh (Claude update 12): node tools/review/mesh-check.mjs [file.glb]
// Per mesh: counts, broken or thin triangles, duplicate faces, open edges (holes), edges shared by
// more than two faces, normals that point inward or are not unit length, skin weights that do not
// add up to 1 or name a missing bone, unused vertices and bad numbers; then how far the scarf,
// horn and eyes sit from the body skin at rest (sunk in or floating).
// Needs the same npm packages as tools/darren-model.mjs.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dequantize } from '@gltf-transform/functions';

const here = path.dirname(fileURLToPath(import.meta.url)),
  file = process.argv[2] || path.join(here, '../../dist/3d/assets/darren.glb');
const doc = await new NodeIO().registerExtensions(ALL_EXTENSIONS).read(file);
await doc.transform(dequantize());
const root = doc.getRoot(),
  joints = root.listSkins()[0]?.listJoints().length ?? 0;
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  cross = (a, b) => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ],
  dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  len = (a) => Math.hypot(...a);
const report = {},
  meshes = [];
for (const node of root.listNodes()) {
  const mesh = node.getMesh();
  if (!mesh) continue;
  // Positions in the model's own space at bind: a skinned vertex is placed by its bones (the
  // node's own transform does not apply), anything else by the node's transform.
  const skin = node.getSkin(),
    mul = (M, p) =>
      [0, 1, 2].map((r) => M[r] * p[0] + M[4 + r] * p[1] + M[8 + r] * p[2] + M[12 + r]),
    M = node.getWorldMatrix(),
    bindOf = skin
      ? skin.listJoints().map((j, k) => {
          const W = j.getWorldMatrix(),
            I = skin.getInverseBindMatrices().getElement(k, []),
            o = new Array(16).fill(0);
          for (let r = 0; r < 4; r++)
            for (let c = 0; c < 4; c++)
              for (let t = 0; t < 4; t++) o[c * 4 + r] += W[t * 4 + r] * I[c * 4 + t];
          return o;
        })
      : null;
  for (const prim of mesh.listPrimitives()) {
    const Js = prim.getAttribute('JOINTS_0'),
      Ws = prim.getAttribute('WEIGHTS_0');
    const xfi = (p, i) => {
      if (!bindOf || !Js) return mul(M, p);
      const j = Js.getElement(i, []),
        w = Ws.getElement(i, []),
        o = [0, 0, 0];
      for (let k = 0; k < 4; k++)
        if (w[k] > 0) mul(bindOf[j[k]], p).forEach((v, q) => (o[q] += v * w[k]));
      return o;
    };
    const pos = prim.getAttribute('POSITION'),
      nrm = prim.getAttribute('NORMAL'),
      Jt = prim.getAttribute('JOINTS_0'),
      Wt = prim.getAttribute('WEIGHTS_0'),
      idx = prim.getIndices(),
      n = pos.getCount(),
      P = Array.from({ length: n }, (_, i) => xfi(pos.getElement(i, []), i));
    const r = {
      vertices: n,
      triangles: idx.getCount() / 3,
      badNumbers: 0,
      thinTriangles: 0,
      duplicateFaces: 0,
      openEdges: 0,
      overSharedEdges: 0,
      inwardNormals: 0,
      nonUnitNormals: 0,
      weightSumOff: 0,
      missingBone: 0,
      unusedVertices: 0,
    };
    // Weld across texture seams for edge checks (seams are not holes).
    const key = (p) => p.map((v) => Math.round(v * 2e4)).join(),
      ids = new Map(),
      weld = P.map((p) => {
        const k = key(p);
        if (!ids.has(k)) ids.set(k, ids.size);
        return ids.get(k);
      });
    const used = new Uint8Array(n),
      edges = new Map(),
      faces = new Set(),
      faceN = Array.from({ length: n }, () => [0, 0, 0]);
    for (let t = 0; t < idx.getCount(); t += 3) {
      const v = [0, 1, 2].map((k) => idx.getScalar(t + k));
      v.forEach((i) => (used[i] = 1));
      const c = cross(sub(P[v[1]], P[v[0]]), sub(P[v[2]], P[v[0]])),
        area = len(c) / 2,
        longest = Math.max(...[0, 1, 2].map((k) => len(sub(P[v[(k + 1) % 3]], P[v[k]]))));
      // Thin: area tiny for its longest side (a sliver that shades badly), or no area at all.
      if (area < 1e-10 || area / (longest * longest) < 0.002) r.thinTriangles++;
      const fk = v
        .map((i) => weld[i])
        .sort((a, b) => a - b)
        .join();
      if (faces.has(fk)) r.duplicateFaces++;
      faces.add(fk);
      for (const i of v) for (let k = 0; k < 3; k++) faceN[i][k] += c[k];
      for (let k = 0; k < 3; k++) {
        const a = weld[v[k]],
          b = weld[v[(k + 1) % 3]];
        if (a === b) continue;
        const e = a < b ? a + ',' + b : b + ',' + a;
        edges.set(e, (edges.get(e) || 0) + 1);
      }
    }
    for (const c of edges.values()) {
      if (c === 1) r.openEdges++;
      if (c > 2) r.overSharedEdges++;
    }
    for (let i = 0; i < n; i++) {
      if (!used[i]) r.unusedVertices++;
      if (P[i].some((x) => !Number.isFinite(x))) r.badNumbers++;
      if (nrm) {
        const q = nrm.getElement(i, []),
          l = len(q);
        if (Math.abs(l - 1) > 0.02) r.nonUnitNormals++;
        if (len(faceN[i]) > 0 && dot(q, faceN[i]) < 0) {
          r.inwardNormals++;
          if (process.env.SHOW)
            console.log('inward normal at', P[i].map((v) => v.toFixed(3)).join(' '));
        }
      }
      if (Jt && Wt) {
        const j = Jt.getElement(i, []),
          w = Wt.getElement(i, []);
        if (Math.abs(w.reduce((s, x) => s + x, 0) - 1) > 0.01) r.weightSumOff++;
        if (j.some((x, k) => w[k] > 0 && x >= joints)) r.missingBone++;
      }
    }
    report[mesh.getName()] = r;
    meshes.push({ name: mesh.getName(), P, faceN, n });
  }
}
console.log('mesh checks (open edges = holes; inward = normal facing into the body):');
for (const [name, r] of Object.entries(report))
  console.log(
    ' ',
    name.padEnd(20),
    Object.entries(r)
      .map(([k, v]) => `${k} ${v}`)
      .join(', ')
  );
// Pieces against the body skin at rest: the nearest body point and which side of it they are.
const body = meshes.find((m) => m.name === 'Darren_Game');
if (body) {
  const cell = 0.04,
    grid = new Map(),
    ck = (p) => p.map((v) => Math.floor(v / cell)).join();
  body.P.forEach((p, i) => {
    const k = ck(p);
    (grid.get(k) || grid.set(k, []).get(k)).push(i);
  });
  const near = (p) => {
    let best = Infinity,
      bi = -1;
    const c = p.map((v) => Math.floor(v / cell));
    for (let dx = -2; dx <= 2; dx++)
      for (let dy = -2; dy <= 2; dy++)
        for (let dz = -2; dz <= 2; dz++)
          for (const i of grid.get([c[0] + dx, c[1] + dy, c[2] + dz].join()) || []) {
            const d = len(sub(body.P[i], p));
            if (d < best) ((best = d), (bi = i));
          }
    return [best, bi];
  };
  console.log('\nat rest, against the body skin (sunk = under the skin, mm):');
  for (const m of meshes) {
    if (m === body) continue;
    let sunk = 0,
      deepest = 0,
      far = 0;
    for (const p of m.P) {
      const [d, bi] = near(p);
      if (bi < 0) {
        far++;
        continue;
      }
      const side = dot(sub(p, body.P[bi]), body.faceN[bi]);
      if (side < 0) {
        sunk++;
        deepest = Math.max(deepest, d);
      }
    }
    console.log(
      ' ',
      m.name.padEnd(20),
      `${sunk} of ${m.n} vertices under the skin (deepest ${(deepest * 1000).toFixed(0)} mm), ${far} more than 8 cm away`
    );
  }
}
