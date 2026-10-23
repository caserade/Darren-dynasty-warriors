// Enemy and boss characters (update 17): the grunts and the four bosses, built in code from shaped
// parts, with limbs that walk, wind up, strike and recover from what the simulation says they are
// doing. Replaces the plain-shape versions from Claude update 2; sizes, colours and the parts the
// game reads (wings, spin, glow) are kept so hit boxes and effects line up as before.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const { sin, cos, PI } = Math;
// Deterministic bumpy noise so a potato or a bramble is lumpy the same way every time.
function hash(x, y, z) {
  const s = sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return s - Math.floor(s);
}
function lumpy(geo, amount, freq = 3) {
  const p = geo.attributes.position,
    v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n =
      sin(v.x * freq + 1.3) * cos(v.y * freq * 1.1 + 0.4) * sin(v.z * freq * 0.9 + 2.1) * 0.6 +
      (hash(Math.round(v.x * 6), Math.round(v.y * 6), Math.round(v.z * 6)) - 0.5) * 0.4;
    v.multiplyScalar(1 + n * amount);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}
const G = {
  sphere: new THREE.SphereGeometry(1, 18, 12),
  lowSphere: new THREE.SphereGeometry(1, 10, 8),
  half: new THREE.SphereGeometry(1, 18, 9, 0, PI * 2, 0, PI / 2),
  cone: new THREE.ConeGeometry(1, 1, 10),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 18),
  box: new THREE.BoxGeometry(1, 1, 1),
  torus: new THREE.TorusGeometry(1, 0.08, 8, 28),
  capsule: new THREE.CapsuleGeometry(0.5, 1, 6, 12),
  potato: lumpy(new THREE.SphereGeometry(1, 28, 20), 0.09, 2.4),
  bramble: lumpy(new THREE.IcosahedronGeometry(1, 3), 0.16, 3.6),
};
// One twig for the tumbleweed: a gently bent tube across the ball.
const TWIGS = Array.from({ length: 4 }, (_, k) => {
  const pts = [];
  for (let i = 0; i <= 6; i++) {
    const a = (i / 6) * PI * 1.25 - 0.6;
    pts.push(new THREE.Vector3(cos(a), sin(a) * 0.95, sin(a * 2 + k) * 0.18));
  }
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 12, 0.035, 4, false);
});
function material(color, extra = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...extra });
}
// A shaped part: geometry, colour, position, scale (one number or three) and rotation.
function P(parent, geo, color, pos = [0, 0, 0], scale = 1, rot = null, extra) {
  const m = new THREE.Mesh(G[geo] || geo, material(color, extra));
  m.position.set(...pos);
  if (Array.isArray(scale)) m.scale.set(...scale);
  else m.scale.setScalar(scale);
  if (rot) m.rotation.set(...rot);
  parent.add(m);
  return m;
}
// A pivot for a limb: what hangs from it is built pointing down (-y) from the joint.
function joint(parent, pos) {
  const j = new THREE.Group();
  j.position.set(...pos);
  parent.add(j);
  return j;
}
function eyes(parent, { y, z, spread, size, brow = 0, browColor = 0x2a1d14, tilt = 0.35 }) {
  for (const s of [-1, 1]) {
    P(parent, 'sphere', 0xffffff, [s * spread, y, z], [size * 1.15, size * 1.3, size * 0.7]);
    P(
      parent,
      'sphere',
      0x1d2329,
      [s * spread * 0.98, y - size * 0.1, z + size * 0.55],
      size * 0.55
    );
    P(
      parent,
      'sphere',
      0xffffff,
      [s * spread * 0.94, y + size * 0.15, z + size * 0.9],
      size * 0.16
    );
    if (brow)
      P(
        parent,
        'box',
        browColor,
        [s * spread, y + size * 1.25, z + size * 0.3],
        [size * 1.7, size * 0.32, size * 0.4],
        [0, 0, s * tilt]
      );
  }
}
// Static parts of one colour inside a group become one mesh, so a crowd of grunts stays cheap to draw.
function bake(group) {
  const sets = new Map();
  for (const m of [...group.children]) {
    if (!m.isMesh || m.children.length || m.userData.keep) continue;
    const mat = m.material,
      key = [mat.color.getHex(), mat.transparent, mat.opacity, mat.emissive.getHex()].join();
    if (!sets.has(key)) sets.set(key, []);
    sets.get(key).push(m);
  }
  for (const list of sets.values()) {
    if (list.length < 2) continue;
    const geos = list.map((m) => {
      m.updateMatrix();
      const g = m.geometry.clone();
      g.applyMatrix4(m.matrix);
      for (const k of Object.keys(g.attributes))
        if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
      return g;
    });
    const merged = mergeGeometries(geos);
    for (const g of geos) g.dispose();
    if (!merged) continue;
    const one = new THREE.Mesh(merged, list[0].material);
    one.userData.baked = true;
    group.add(one);
    for (const m of list) {
      group.remove(m);
      if (m.material !== one.material) m.material.dispose();
    }
  }
  for (const c of group.children) if (!c.isMesh) bake(c);
}

// ---------------------------------------------------------------- grunts
const ART = {
  gopher(b, o) {
    const fur = 0xa8743f,
      dark = 0x7d5430,
      cream = 0xe8cc9c;
    P(b, 'sphere', fur, [0, 0.55, 0], [0.42, 0.52, 0.4]);
    P(b, 'sphere', cream, [0, 0.5, 0.2], [0.3, 0.38, 0.24]);
    const head = (o.head = joint(b, [0, 0.98, 0.06]));
    P(head, 'sphere', fur, [0, 0.04, 0], [0.32, 0.29, 0.3]);
    P(head, 'sphere', cream, [0, -0.04, 0.2], [0.22, 0.16, 0.16]);
    for (const s of [-1, 1]) {
      P(head, 'sphere', cream, [s * 0.13, -0.06, 0.26], [0.1, 0.08, 0.06]);
      P(head, 'sphere', dark, [s * 0.22, 0.24, -0.02], [0.09, 0.1, 0.05]);
      P(head, 'sphere', 0xd99a8a, [s * 0.22, 0.24, 0.01], [0.05, 0.06, 0.03]);
      for (const k of [-1, 1])
        P(
          head,
          'box',
          0x3a2a1a,
          [s * 0.25, -0.03 + k * 0.025, 0.3],
          [0.16, 0.008, 0.008],
          [0, s * 0.3, k * s * 0.15]
        );
    }
    eyes(head, { y: 0.1, z: 0.24, spread: 0.11, size: 0.055, brow: 1, browColor: dark });
    P(head, 'sphere', 0xd77a7a, [0, 0.0, 0.33], [0.055, 0.045, 0.04]);
    P(head, 'box', 0xffffff, [0, -0.13, 0.32], [0.1, 0.09, 0.03]);
    P(head, 'box', 0xc8c0b0, [0, -0.13, 0.333], [0.006, 0.09, 0.01]);
    o.arms = [-1, 1].map((s) => {
      const j = joint(b, [s * 0.34, 0.72, 0.12]);
      P(j, 'capsule', fur, [0, -0.13, 0], [0.11, 0.18, 0.11]);
      P(j, 'sphere', dark, [0, -0.3, 0.02], [0.08, 0.07, 0.08]);
      return j;
    });
    o.legs = [-1, 1].map((s) => {
      const j = joint(b, [s * 0.2, 0.2, 0.02]);
      P(j, 'sphere', fur, [0, -0.06, 0], [0.13, 0.14, 0.13]);
      P(j, 'sphere', dark, [0, -0.17, 0.08], [0.12, 0.06, 0.16]);
      return j;
    });
    const tail = P(b, 'sphere', dark, [0, 0.25, -0.38], [0.08, 0.05, 0.2], [0.5, 0, 0]);
    tail.userData.keep = true;
    o.stride = 11;
  },
  crow(b, o) {
    b.position.y = 0.6;
    const ink = 0x2c2f3d,
      sheen = 0x3b4257;
    P(b, 'sphere', ink, [0, 0.4, 0], [0.3, 0.28, 0.45]);
    P(b, 'sphere', sheen, [0, 0.36, 0.18], [0.22, 0.2, 0.22]);
    const head = (o.head = joint(b, [0, 0.66, 0.34]));
    P(head, 'sphere', ink, [0, 0, 0], 0.2);
    P(head, 'cone', 0xf0a63a, [0, -0.02, 0.27], [0.075, 0.24, 0.06], [PI / 2, 0, 0]);
    P(head, 'cone', 0xd38a26, [0, -0.06, 0.22], [0.05, 0.14, 0.035], [PI / 2 + 0.2, 0, 0]);
    eyes(head, {
      y: 0.06,
      z: 0.15,
      spread: 0.09,
      size: 0.045,
      brow: 1,
      browColor: 0x111318,
      tilt: 0.5,
    });
    P(head, 'box', ink, [0, 0.19, -0.02], [0.03, 0.12, 0.12], [0.4, 0, 0]);
    for (let i = -1; i <= 1; i++)
      P(b, 'box', 0x23252f, [i * 0.1, 0.42, -0.55], [0.1, 0.03, 0.34], [0.15, i * 0.35, 0]);
    o.wings = [-1, 1].map((s) => {
      const w = joint(b, [s * 0.25, 0.48, 0]);
      P(w, 'box', 0x23252f, [s * 0.22, 0, 0], [0.44, 0.04, 0.34]);
      const tip = joint(w, [s * 0.42, 0, 0]);
      for (let k = 0; k < 4; k++)
        P(
          tip,
          'box',
          k % 2 ? 0x23252f : 0x1b1d26,
          [s * (0.1 + k * 0.04), 0, 0.1 - k * 0.09],
          [0.26, 0.03, 0.08],
          [0, s * (0.2 + k * 0.15), 0]
        );
      w.userData.tip = tip;
      return w;
    });
    o.legs = [-1, 1].map((s) => {
      const j = joint(b, [s * 0.1, 0.16, 0.02]);
      P(j, 'cyl', 0xe09a30, [0, -0.16, 0], [0.02, 0.32, 0.02]);
      for (const a of [-0.5, 0, 0.5])
        P(
          j,
          'box',
          0xe09a30,
          [sin(a) * 0.05, -0.32, cos(a) * 0.05],
          [0.015, 0.015, 0.1],
          [0, a, 0]
        );
      return j;
    });
    o.stride = 14;
  },
  bale(b, o) {
    const straw = 0xd8b45a,
      light = 0xe9cf7f,
      twine = 0x9c6b2f;
    P(b, 'cyl', straw, [0, 0.62, 0], [0.6, 1.0, 0.6]);
    for (const y of [0.35, 0.88])
      P(b, 'torus', twine, [0, y, 0], [0.61, 0.61, 0.9], [PI / 2, 0, 0]);
    for (let i = 0; i < 26; i++) {
      const a = i * 2.39,
        y = 0.2 + ((i * 37) % 100) / 100;
      P(
        b,
        'box',
        i % 3 ? light : 0xc49c45,
        [sin(a) * 0.6, 0.12 + y * 0.95, cos(a) * 0.6],
        [0.02, 0.16, 0.02],
        [0.3 * sin(i), a, 0.4 * cos(i)]
      );
    }
    for (let i = 0; i < 9; i++) {
      const a = i * 1.3,
        r = 0.12 + (i % 3) * 0.13;
      P(
        b,
        'cone',
        light,
        [sin(a) * r, 1.2, cos(a) * r],
        [0.07, 0.28, 0.07],
        [sin(i) * 0.5, 0, cos(i) * 0.5]
      );
    }
    eyes(b, {
      y: 0.7,
      z: 0.58,
      spread: 0.18,
      size: 0.085,
      brow: 1,
      browColor: 0x5a3a1a,
      tilt: 0.55,
    });
    P(b, 'box', 0x5a3a1a, [0, 0.47, 0.6], [0.2, 0.04, 0.02], [0, 0, 0]);
    o.legs = [-1, 1].map((s) => {
      const j = joint(b, [s * 0.28, 0.14, 0.05]);
      P(j, 'cyl', 0xc49c45, [0, -0.04, 0.04], [0.1, 0.12, 0.13]);
      return j;
    });
    o.arms = [-1, 1].map((s) => {
      const j = joint(b, [s * 0.58, 0.7, 0.1]);
      for (let k = 0; k < 3; k++)
        P(
          j,
          'box',
          light,
          [s * 0.02 * k, -0.15, 0.03 * (k - 1)],
          [0.03, 0.3, 0.03],
          [0, 0, s * (0.1 + k * 0.12)]
        );
      return j;
    });
    o.stride = 8;
  },

  // ------------------------------------------------------------ bosses
  // Sergeant Spudsworth: a big lumpy potato in an army helmet, with a bristling moustache.
  spud(b, o) {
    const skin = 0xc49a5e,
      spot = 0x8e6a3d,
      army = 0x5f7a3c,
      armyDark = 0x4f6832;
    P(b, 'potato', skin, [0, 1.3, 0], [1.05, 1.3, 0.95]);
    for (let i = 0; i < 9; i++)
      P(
        b,
        'sphere',
        spot,
        [sin(i * 2.4) * 0.8, 0.75 + i * 0.14, cos(i * 2.4) * 0.7],
        [0.08, 0.06, 0.06]
      );
    // Belt with a brass buckle and sergeant stripes on the belly sash.
    P(b, 'cyl', 0x5a4128, [0, 0.95, 0], [1.02, 0.14, 0.93]);
    P(b, 'box', 0xe0b84a, [0, 0.95, 0.92], [0.24, 0.16, 0.05]);
    for (let k = 0; k < 3; k++)
      P(b, 'box', 0xf0d36a, [0.55, 1.45 - k * 0.1, 0.68], [0.24, 0.035, 0.03], [0, 0.65, 0.5]);
    const head = (o.head = joint(b, [0, 1.75, 0]));
    P(head, 'half', army, [0, 0.5, 0], [0.88, 0.62, 0.88]);
    P(head, 'cyl', armyDark, [0, 0.5, 0.06], [0.98, 0.06, 0.98], [0.08, 0, 0]);
    P(head, 'box', 0xe0b84a, [0, 0.82, 0.62], [0.2, 0.2, 0.04], [0.5, 0, PI / 4]);
    P(head, 'torus', 0x3d2c1c, [0, 0.12, 0.05], [0.82, 0.82, 1.6], [0.25, 0, 0]);
    eyes(head, {
      y: 0.08,
      z: 0.8,
      spread: 0.28,
      size: 0.12,
      brow: 1,
      browColor: 0x4b3320,
      tilt: 0.3,
    });
    // The moustache: two bristling tufts that twitch when he shouts.
    o.tache = [-1, 1].map((s) => {
      const j = joint(head, [s * 0.05, -0.2, 0.9]);
      for (let k = 0; k < 4; k++)
        P(
          j,
          'sphere',
          0x4b3320,
          [s * (0.08 + k * 0.08), -0.02 * k, -0.02 * k],
          [0.12, 0.07, 0.07],
          [0, 0, s * 0.25 * k]
        );
      return j;
    });
    P(head, 'sphere', 0xb08550, [0, -0.06, 0.92], [0.12, 0.1, 0.08]);
    o.arms = [-1, 1].map((s) => {
      const j = joint(b, [s * 1.02, 1.35, 0.05]);
      P(j, 'capsule', skin, [0, -0.28, 0], [0.24, 0.36, 0.24]);
      P(j, 'sphere', 0xf1ece0, [0, -0.62, 0.03], [0.24, 0.22, 0.24]);
      P(j, 'cyl', armyDark, [0, -0.46, 0.0], [0.2, 0.08, 0.2]);
      return j;
    });
    o.legs = [-1, 1].map((s) => {
      const j = joint(b, [s * 0.42, 0.3, 0.05]);
      P(j, 'cyl', skin, [0, -0.08, 0], [0.18, 0.2, 0.18]);
      P(j, 'sphere', 0x2f2a24, [0, -0.2, 0.12], [0.26, 0.14, 0.36]);
      P(j, 'cyl', 0x2f2a24, [0, -0.08, 0], [0.2, 0.12, 0.2]);
      return j;
    });
    o.stride = 6;
  },
  // Madame Tumbleweed: a rolling ball of twigs under a wide sun hat with a pink rose.
  weed(b, o) {
    const ball = new THREE.Group();
    b.add(ball);
    ball.position.y = 1.35;
    o.spin = ball;
    const twig = [0xc9a35a, 0xb08a45, 0xd9b870];
    for (let i = 0; i < 34; i++) {
      const m = P(ball, TWIGS[i % 4], twig[i % 3], [0, 0, 0], 1.25 - (i % 5) * 0.06, [
        hash(i, 1, 2) * PI * 2,
        hash(i, 3, 4) * PI * 2,
        hash(i, 5, 6) * PI * 2,
      ]);
      m.userData.twig = true;
    }
    const core = P(ball, 'lowSphere', 0x9d7b3f, [0, 0, 0], 0.8, null, {
      transparent: true,
      opacity: 0.55,
    });
    core.userData.keep = true;
    // The face and hat stay upright while the ball rolls under them.
    const face = (o.head = joint(b, [0, 1.35, 0]));
    eyes(face, { y: 0.32, z: 1.15, spread: 0.3, size: 0.13 });
    for (const s of [-1, 1])
      for (let k = 0; k < 3; k++)
        P(
          face,
          'box',
          0x1d2329,
          [s * (0.3 + (k - 1) * 0.09), 0.52, 1.15],
          [0.02, 0.12, 0.02],
          [0, 0, s * (k - 1) * 0.35]
        );
    P(face, 'sphere', 0xc8466b, [0, 0.0, 1.24], [0.15, 0.07, 0.05]);
    P(face, 'sphere', 0xef9db4, [0.42, 0.12, 1.1], [0.1, 0.07, 0.04]);
    P(face, 'sphere', 0xef9db4, [-0.42, 0.12, 1.1], [0.1, 0.07, 0.04]);
    const hat = joint(b, [0, 2.62, 0]);
    o.hat = hat;
    P(hat, 'cyl', 0xd96a8a, [0, 0.22, 0], [0.45, 0.42, 0.45]);
    P(hat, 'cyl', 0xe9a2b8, [0, 0.06, 0], [0.47, 0.1, 0.47]);
    P(hat, 'cyl', 0xd96a8a, [0, 0, 0], [0.95, 0.045, 0.95]);
    for (let k = 0; k < 5; k++)
      P(
        hat,
        'sphere',
        k ? 0xc8466b : 0xf06a8e,
        [0.38 + sin(k * 1.3) * 0.06 * (k ? 1 : 0), 0.18 + cos(k * 1.3) * 0.06 * (k ? 1 : 0), 0.28],
        k ? 0.07 : 0.09
      );
    P(hat, 'box', 0x6c9a4a, [0.48, 0.12, 0.3], [0.14, 0.02, 0.07], [0, 0.4, 0.3]);
    // Ribbon tails flutter behind.
    o.ribbon = joint(hat, [0, 0.08, -0.45]);
    P(o.ribbon, 'box', 0xe9a2b8, [0.06, -0.2, -0.04], [0.08, 0.42, 0.015], [0.3, 0, 0.1]);
    P(o.ribbon, 'box', 0xe9a2b8, [-0.06, -0.24, -0.03], [0.08, 0.48, 0.015], [0.25, 0, -0.12]);
    o.stride = 0;
  },
  // Colonel Cluck: a stout hen in an officer's cap, chest full of medals.
  cluck(b, o) {
    const white = 0xf3efe6,
      shade = 0xe4ddd0,
      red = 0xd8392b;
    P(b, 'sphere', white, [0, 1.2, 0], [1.05, 1, 1.25]);
    P(b, 'sphere', 0xfaf7f0, [0, 1.25, 0.6], [0.8, 0.78, 0.7]);
    for (let i = 0; i < 3; i++) {
      P(
        b,
        'cyl',
        [0xd8392b, 0x3a62b8, 0xe0b84a][i],
        [-0.35 + i * 0.22, 1.5, 1.2],
        [0.07, 0.12, 0.02],
        [PI / 2 - 0.25, 0, 0]
      );
      P(
        b,
        'cyl',
        0xe0b84a,
        [-0.35 + i * 0.22, 1.36, 1.24],
        [0.08, 0.02, 0.08],
        [PI / 2 - 0.3, 0, 0]
      );
    }
    const head = (o.head = joint(b, [0, 2.2, 0.6]));
    P(head, 'sphere', white, [0, 0.05, 0], 0.6);
    for (let i = 0; i < 4; i++)
      P(head, 'sphere', red, [0, 0.62 + sin(i * 1.4) * 0.05, -0.25 + i * 0.2], [0.11, 0.17, 0.12]);
    o.beak = joint(head, [0, -0.02, 0.56]);
    P(o.beak, 'cone', 0xf2b630, [0, 0.03, 0.15], [0.17, 0.34, 0.12], [PI / 2, 0, 0]);
    o.jaw = joint(head, [0, -0.08, 0.52]);
    P(o.jaw, 'cone', 0xe0a020, [0, -0.02, 0.1], [0.12, 0.22, 0.07], [PI / 2 + 0.25, 0, 0]);
    P(head, 'sphere', red, [0, -0.32, 0.45], [0.12, 0.2, 0.1]);
    eyes(head, {
      y: 0.18,
      z: 0.48,
      spread: 0.24,
      size: 0.095,
      brow: 1,
      browColor: 0x3c2b20,
      tilt: 0.45,
    });
    // Officer's cap with a gold badge.
    P(head, 'cyl', 0x4e6a3a, [0, 0.56, -0.05], [0.45, 0.24, 0.45]);
    P(head, 'cyl', 0x3f5a2e, [0, 0.45, 0.05], [0.47, 0.05, 0.47]);
    P(head, 'box', 0x2f3a22, [0, 0.44, 0.48], [0.5, 0.04, 0.28], [-0.15, 0, 0]);
    P(head, 'box', 0xe0b84a, [0, 0.6, 0.45], [0.14, 0.14, 0.03], [0, 0, PI / 4]);
    o.wings = [-1, 1].map((s) => {
      const w = joint(b, [s * 0.95, 1.6, -0.05]);
      P(w, 'sphere', shade, [s * 0.05, -0.38, 0], [0.24, 0.55, 0.72]);
      for (let k = 0; k < 3; k++)
        P(w, 'sphere', white, [s * 0.08, -0.75 - k * 0.04, -0.35 + k * 0.32], [0.08, 0.22, 0.14]);
      return w;
    });
    for (let i = 0; i < 5; i++)
      P(
        b,
        'sphere',
        i % 2 ? shade : 0xe8e2d6,
        [(i - 2) * 0.2, 1.8 + (i % 2) * 0.12, -1.2],
        [0.13, 0.48, 0.14],
        [-0.6, 0, (i - 2) * 0.15]
      );
    o.legs = [-1, 1].map((s) => {
      const j = joint(b, [s * 0.4, 0.42, 0.05]);
      P(j, 'cyl', 0xe39a2a, [0, -0.2, 0], [0.07, 0.42, 0.07]);
      for (const a of [-0.55, 0, 0.55])
        P(j, 'box', 0xe39a2a, [sin(a) * 0.12, -0.4, cos(a) * 0.12], [0.05, 0.04, 0.26], [0, a, 0]);
      return j;
    });
    o.stride = 7;
  },
  // The Bramble Baron: a towering thorn bush in a top hat and monocle, with a cape and thorny arms.
  baron(b, o) {
    const leaf = 0x2f5a2a,
      leafL = 0x3e6b33,
      wood = 0x6d4a2b;
    P(b, 'bramble', 0x24401f, [0, 2.1, 0], 1.4);
    for (let i = 0; i < 11; i++) {
      const a = (i / 11) * PI * 2;
      P(
        b,
        'bramble',
        i % 2 ? leaf : leafL,
        [cos(a) * 1.15, 2.2 + sin(a) * 1.15, sin(a * 2) * 0.4],
        0.62 + (i % 3) * 0.1
      );
    }
    for (let i = 0; i < 26; i++) {
      const a = i * 2.4,
        y = 0.9 + (((i * 7) % 11) / 11) * 2.7,
        t = P(b, 'cone', wood, [sin(a) * 1.5, y, cos(a) * 1.5], [0.1, 0.5, 0.1]);
      t.lookAt(sin(a) * 9, y, cos(a) * 9);
      t.rotateX(PI / 2);
    }
    // Cape over the back, deep purple lined in red.
    const cape = (o.cape = joint(b, [0, 3.1, -0.4]));
    P(cape, 'cyl', 0x3c1f4a, [0, -1.25, -0.75], [1.45, 2.5, 0.5], null, { side: THREE.DoubleSide });
    P(cape, 'box', 0x8a2233, [0, 0.05, -0.15], [2.0, 0.18, 0.5]);
    const head = (o.head = joint(b, [0, 3.0, 0.9]));
    // Glowing purple eyes, the monocle over his right one and a thin cruel smile.
    o.glow = [-1, 1].map((s) => {
      const e = P(head, 'sphere', 0xc86bff, [s * 0.45, -0.4, 0.55], 0.17, null, {
        emissive: 0x8a2fd0,
      });
      e.userData.keep = true;
      return e;
    });
    P(head, 'torus', 0xe0b84a, [-0.45, -0.4, 0.7], [0.26, 0.26, 0.6]);
    const lens = P(head, 'cyl', 0xcfe6ff, [-0.45, -0.4, 0.71], [0.24, 0.01, 0.24], [PI / 2, 0, 0], {
      transparent: true,
      opacity: 0.35,
    });
    lens.userData.keep = true;
    P(head, 'cyl', 0xe0b84a, [-0.62, -0.75, 0.62], [0.012, 0.6, 0.012], [0, 0, 0.3]);
    // A wide, thin grin full of pale thorn teeth, and heavy scowling brows.
    P(head, 'box', 0x0c1208, [0, -0.92, 0.66], [0.95, 0.16, 0.06]);
    for (let k = -3; k <= 3; k++)
      P(head, 'cone', 0xe8dfc0, [k * 0.13, -0.88, 0.7], [0.045, 0.12, 0.03], [PI, 0, 0]);
    for (const s of [-1, 1])
      P(head, 'box', 0x0c1208, [s * 0.45, -0.14, 0.62], [0.42, 0.09, 0.06], [0, 0, s * 0.35]);
    // Top hat with a band and a red rose.
    const hat = joint(b, [0, 3.45, 0]);
    o.hat = hat;
    P(hat, 'cyl', 0x1d1a22, [0, 0.03, 0], [0.95, 0.06, 0.95]);
    P(hat, 'cyl', 0x1d1a22, [0, 0.55, 0], [0.62, 1.0, 0.62]);
    P(hat, 'cyl', 0x8a2233, [0, 0.18, 0], [0.64, 0.18, 0.64]);
    for (let k = 0; k < 5; k++)
      P(
        hat,
        'sphere',
        k ? 0xb51f37 : 0xd8324d,
        [0.45 + sin(k * 1.3) * 0.07 * (k ? 1 : 0), 0.2 + cos(k * 1.3) * 0.07 * (k ? 1 : 0), 0.4],
        k ? 0.08 : 0.1
      );
    // Long vine arms ending in thorny clubs.
    o.arms = [-1, 1].map((s) => {
      const j = joint(b, [s * 1.95, 2.5, 0.3]);
      P(j, 'capsule', wood, [0, -0.55, 0], [0.22, 0.8, 0.22]);
      P(j, 'bramble', leaf, [0, -1.15, 0.05], 0.38);
      for (let k = 0; k < 6; k++) {
        const a = k * 1.05,
          t = P(
            j,
            'cone',
            0x5b3c22,
            [sin(a) * 0.38, -1.15 + cos(a) * 0.2, cos(a) * 0.38],
            [0.07, 0.3, 0.07]
          );
        t.lookAt(sin(a) * 4, -1.15, cos(a) * 4);
        t.rotateX(PI / 2);
      }
      return j;
    });
    o.legs = [-1, 1].map((s) => {
      const j = joint(b, [s * 0.8, 0.45, 0]);
      P(j, 'bramble', 0x2b4a24, [0, -0.1, 0.05], [0.45, 0.35, 0.6]);
      for (const a of [-0.6, 0, 0.6])
        P(
          j,
          'cone',
          wood,
          [sin(a) * 0.35, -0.35, cos(a) * 0.45],
          [0.09, 0.4, 0.09],
          [PI / 2 - 0.3, a, 0]
        );
      return j;
    });
    o.stride = 4.5;
  },
};
export function buildFoe(type, body, o) {
  ART[type](body, o);
  bake(body);
  o.pose = { armL: 0, armR: 0, armZ: 0, flap: 0, lean: 0 };
}
const ease = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
// Limbs follow what the foe is doing. Grunts: walk, wind up (arms back), strike, flinch.
// Bosses: slam lifts both arms overhead and brings them down; swipe draws one arm back and sweeps
// it across; charge pumps the legs; eggs flaps the wings; thorns throws the arms wide.
export function animateFoe(e, o, dt) {
  const t = e.t,
    p = o.pose,
    move = e.boss ? e.move : null,
    k = e.windMax ? 1 - Math.max(0, e.st) / e.windMax : 1;
  let aL = 0,
    aR = 0,
    zOut = 0,
    flap = 0,
    lean = 0;
  if (e.dead) {
    aL = aR = -2.4;
    zOut = 0.8;
  } else if (e.state === 'wind') {
    if (!e.boss) aL = aR = 1.1;
    else if (move === 'slam') aL = aR = -2.7 * Math.min(1, k * 1.4);
    else if (move === 'swipe') {
      aR = 0.9;
      zOut = 1.1;
    } else if (move === 'charge') {
      aL = aR = 0.9;
      lean = 0.25;
    } else if (move === 'eggs') flap = 1;
    else if (move === 'thorns') zOut = 1.5;
  } else if (e.state === 'rec') {
    if (!e.boss || move === 'slam') aL = aR = -0.9;
    else if (move === 'swipe') {
      aR = -1.3;
      zOut = -0.5;
    } else if (move === 'thorns') zOut = 0.6;
  } else if (e.state === 'charge' || e.state === 'dash') {
    aL = aR = 1.0;
    lean = 0.3;
  } else if (e.state === 'hurt' || e.state === 'down') {
    aL = -1.4 + sin(t * 30) * 0.3;
    aR = -1.2 - sin(t * 30) * 0.3;
    zOut = 0.5;
  } else if (e.state === 'aim') aL = aR = 1.2;
  const fast = e.state === 'wind' && move === 'swipe' ? 10 : e.state === 'rec' ? 22 : 12;
  p.armL = ease(p.armL, aL, fast, dt);
  p.armR = ease(p.armR, aR, fast, dt);
  p.armZ = ease(p.armZ, zOut, fast, dt);
  p.flap = ease(p.flap, flap, 10, dt);
  p.lean = ease(p.lean, lean, 8, dt);
  const walk = e.moving && !e.dead ? 1 : 0,
    rate = (o.stride || 8) * (e.state === 'charge' || e.state === 'dash' ? 1.8 : 1),
    swing = sin(t * rate) * walk;
  if (o.legs)
    o.legs.forEach((j, i) => {
      j.rotation.x = (i ? -1 : 1) * swing * 0.65;
    });
  if (o.arms)
    o.arms.forEach((j, i) => {
      const s = i ? -1 : 1,
        base = (i ? p.armR : p.armL) - s * swing * 0.35 * (1 - Math.abs(p.armL) / 3);
      j.rotation.x = base + sin(t * 2.2 + i) * 0.05;
      j.rotation.z = s * (0.12 + p.armZ * (i || !e.boss || move !== 'swipe' ? 1 : 0.3));
    });
  if (o.head) {
    o.head.rotation.x = -p.lean * 0.5 + (e.state === 'hurt' ? 0.25 : 0);
    o.head.rotation.z = sin(t * 1.7) * 0.04;
  }
  if (o.tache)
    o.tache.forEach(
      (j, i) =>
        (j.rotation.z =
          (i ? -1 : 1) * (e.state === 'wind' ? 0.25 + sin(t * 40) * 0.12 : sin(t * 3) * 0.04))
    );
  if (o.jaw)
    o.jaw.rotation.x = e.state === 'wind' || e.state === 'rec' ? 0.35 + sin(t * 26) * 0.15 : 0;
  if (o.hat) o.hat.rotation.z = sin(t * 2.3) * 0.05 + (e.state === 'charge' ? -0.25 : 0);
  if (o.ribbon) o.ribbon.rotation.x = 0.3 + sin(t * 9) * 0.25 + (e.moving ? 0.5 : 0);
  if (o.cape) o.cape.rotation.x = -0.05 - (e.moving ? 0.18 : 0) + sin(t * 2) * 0.03;
  if (o.wings) {
    // Crows flap all the time; the Colonel flaps for her egg barrage and when running.
    const crow = e.type === 'crow',
      amp = crow ? 0.6 : 0.15 + p.flap * 0.9 + (e.moving ? 0.15 : 0),
      f = crow ? 14 : 10 + p.flap * 12;
    o.wings.forEach((w, i) => {
      const s = i ? -1 : 1;
      w.rotation.z = s * (crow ? sin(t * f) * amp : 0.1 + Math.abs(sin(t * f)) * amp);
      if (w.userData.tip) w.userData.tip.rotation.z = s * sin(t * f - 0.8) * amp * 0.6;
    });
  }
  return p.lean;
}
