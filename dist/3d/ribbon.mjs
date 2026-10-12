// Darren's Polka Scarf as a weapon (Claude update 6): a long yellow ribbon with pink dots.
// It runs from the front of his collar into his right paw (a slack loop), then trails free past
// the paw as a chain of verlet points with gravity and air drag. During a lash the free end is
// pulled toward a straight line along his arm, which is what makes it crack out at the hit frame.
import * as THREE from 'three';

const FREE = 16, // free points past the paw
  LOOP = 6, // points on the collar-to-paw loop
  SEG = 0.12, // metres between free points before the hero's scale
  WIDTH = 0.2,
  GRAVITY = -9,
  STEP = 1 / 120;

function polkaTexture() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 256;
  const g = c.getContext('2d');
  // Same knit yellow and pink as the scarf on his neck (tools/darren-model.mjs).
  g.fillStyle = '#ffde4a';
  g.fillRect(0, 0, 64, 256);
  g.fillStyle = '#f0c232';
  g.fillRect(0, 0, 5, 256);
  g.fillRect(59, 0, 5, 256);
  g.fillStyle = '#ff6fb1';
  for (let y = 0; y < 4; y++)
    for (let x = 0; x < 2; x++) {
      g.beginPath();
      g.arc(16 + x * 32, 32 + y * 64 + (x ? 32 : 0) - (x && y === 3 ? 256 : 0), 13, 0, Math.PI * 2);
      g.fill();
    }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.ClampToEdgeWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const A = new THREE.Vector3(),
  B = new THREE.Vector3(),
  D = new THREE.Vector3(),
  V = new THREE.Vector3();

export class ScarfRibbon {
  // rig is the hero's rig from anim.mjs (bones by role); hide lists the short scarf-end meshes the
  // ribbon replaces while the scarf is in use.
  constructor(scene, rig, hide = []) {
    this.rig = rig;
    this.hide = hide;
    this.n = LOOP + FREE + 1;
    this.pos = Array.from({ length: FREE + 1 }, () => new THREE.Vector3());
    this.prev = Array.from({ length: FREE + 1 }, () => new THREE.Vector3());
    this.loop = Array.from({ length: LOOP }, () => new THREE.Vector3());
    this.fresh = true;
    this.acc = 0;
    this.pull = 0;
    let tex;
    const geo = new THREE.BufferGeometry(),
      count = this.n * 2;
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    const uv = new Float32Array(count * 2),
      index = [];
    for (let i = 0; i < this.n; i++) {
      uv.set([0, i * 0.5, 1, i * 0.5], i * 4);
      if (i < this.n - 1) {
        const a = i * 2;
        index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(index);
    this.mesh = new THREE.Mesh(
      geo,
      new THREE.MeshStandardMaterial({
        map: (tex = polkaTexture()),
        // A little self-light so the thin ribbon stays bright yellow from every camera angle.
        emissiveMap: tex,
        emissive: 0xffffff,
        emissiveIntensity: 0.35,
        roughness: 0.75,
        side: THREE.DoubleSide,
      })
    );
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
    this.mesh.visible = false;
    scene.add(this.mesh);
  }
  setActive(on) {
    if (on && !this.mesh.visible) this.fresh = true;
    this.mesh.visible = on;
    for (const m of this.hide) m.visible = !on;
  }
  // Collar front (on the spine), the paw, and the shoulder (for the lash direction), in world space.
  anchors(scale) {
    const r = this.rig.role;
    r.spine.updateWorldMatrix(true, false);
    A.set(-0.12, 0.3, 0.27).applyMatrix4(r.spine.matrixWorld);
    r.handR.updateWorldMatrix(true, false);
    // hand_R holds forearm and paw (studio pass 2), so the paw is a third of a metre down the bone.
    B.set(0, 0.33, 0).applyMatrix4(r.handR.matrixWorld);
    r.armR.updateWorldMatrix(true, false);
    D.setFromMatrixPosition(r.armR.matrixWorld);
    // Lash direction: shoulder to paw, carried on past the paw.
    V.subVectors(B, D);
    if (V.lengthSq() < 1e-6) V.set(0, -1, 0);
    V.normalize();
    this.seg = SEG * scale;
  }
  // pull 0..1: how hard the free end is drawn straight along the arm (high at a lash's hit frame).
  update(dt, pull, camera, scale = 1) {
    if (!this.mesh.visible) return;
    this.anchors(scale);
    if (!Number.isFinite(B.x + B.y + B.z + A.x + A.y + A.z)) return;
    const p = this.pos,
      q = this.prev;
    if (!Number.isFinite(p[FREE].x + p[FREE].y + p[FREE].z)) this.fresh = true;
    if (!Number.isFinite(dt)) dt = 0;
    if (this.fresh || p[0].distanceToSquared(B) > 9) {
      // Start hanging straight down from the paw, then lying out behind him on the snow.
      const back = new THREE.Vector3().setFromMatrixColumn(this.rig.root.matrixWorld, 2);
      back.y = 0;
      back.normalize().negate();
      const floor = this.floor ?? B.y - 10;
      for (let i = 0; i <= FREE; i++) {
        const drop = Math.min(i * this.seg, Math.max(0, B.y - floor)),
          along = i * this.seg - drop;
        p[i].copy(B).addScaledVector(back, along);
        p[i].y -= drop;
        q[i].copy(p[i]);
      }
      this.fresh = false;
    }
    this.pull += (pull - this.pull) * Math.min(1, dt * 30);
    const from = p[0].clone();
    this.acc = Math.min(this.acc + dt, 0.1);
    const steps = Math.max(1, Math.round(this.acc / STEP));
    for (let s = 0; s < steps && this.acc >= STEP * 0.5; s++, this.acc -= STEP) {
      const h = STEP,
        k = (s + 1) / steps;
      // The paw end follows the paw (interpolated across substeps so fast swings stay smooth).
      p[0].lerpVectors(from, B, k);
      q[0].copy(p[0]);
      const drag = 1 - 2.2 * h;
      for (let i = 1; i <= FREE; i++) {
        let vx = (p[i].x - q[i].x) * drag,
          vy = (p[i].y - q[i].y) * drag,
          vz = (p[i].z - q[i].z) * drag;
        // Never faster than 30 m/s, so a snag can't fling the ribbon across the map.
        const sp = Math.hypot(vx, vy, vz);
        if (sp > 0.25) ((vx *= 0.25 / sp), (vy *= 0.25 / sp), (vz *= 0.25 / sp));
        q[i].copy(p[i]);
        p[i].x += vx;
        p[i].y += vy + GRAVITY * h * h;
        p[i].z += vz;
        if (this.pull > 0.01) {
          // Draw the point toward where a straight lash along the arm would put it.
          const w = this.pull * 0.35;
          p[i].x += (B.x + V.x * i * this.seg - p[i].x) * w;
          p[i].y += (B.y + V.y * i * this.seg - p[i].y) * w;
          p[i].z += (B.z + V.z * i * this.seg - p[i].z) * w;
        }
      }
      // Keep the ribbon above the snow (rough: the ground under the hero), sliding with friction.
      const floor = this.floor ?? -Infinity;
      for (let it = 0; it < 8; it++) {
        for (let i = 1; i <= FREE; i++) {
          D.subVectors(p[i], p[i - 1]);
          const d = D.length() || 1e-6,
            f = (d - this.seg) / d;
          if (i === 1) p[i].addScaledVector(D, -f);
          else {
            p[i].addScaledVector(D, -f * 0.5);
            p[i - 1].addScaledVector(D, f * 0.5);
          }
        }
        for (let i = 1; i <= FREE; i++) if (p[i].y < floor) p[i].y = floor;
      }
      for (let i = 1; i <= FREE; i++)
        if (p[i].y <= floor + 1e-4) {
          q[i].y = p[i].y;
          q[i].x = p[i].x - (p[i].x - q[i].x) * 0.6;
          q[i].z = p[i].z - (p[i].z - q[i].z) * 0.6;
        }
    }
    // The loop from the collar into the paw: a sagging curve, slack shrinking as the arm reaches out.
    const span = A.distanceTo(B),
      sag = Math.sqrt(Math.max(0, (0.75 * scale) ** 2 - span * span)) * 0.45;
    for (let i = 0; i < LOOP; i++) {
      const t = i / LOOP;
      this.loop[i].lerpVectors(A, B, t);
      this.loop[i].y -= sag * 4 * t * (1 - t);
    }
    this.build(camera, scale);
  }
  // A camera-facing strip through the loop then the free points, tapering toward the tip.
  build(camera, scale) {
    const pts = [...this.loop, ...this.pos.slice(0, FREE)],
      pos = this.mesh.geometry.attributes.position,
      nor = this.mesh.geometry.attributes.normal,
      cam = camera.position,
      side = new THREE.Vector3(),
      dir = new THREE.Vector3(),
      view = new THREE.Vector3(),
      n = new THREE.Vector3();
    pts.push(this.pos[FREE]);
    for (let i = 0; i < this.n; i++) {
      const a = pts[Math.max(0, i - 1)],
        b = pts[Math.min(pts.length - 1, i + 1)];
      dir.subVectors(b, a).normalize();
      view.subVectors(cam, pts[i]).normalize();
      side.crossVectors(dir, view);
      if (!(side.lengthSq() > 1e-6)) side.set(1, 0, 0);
      side.normalize();
      const w = WIDTH * scale * (i < LOOP ? 1 : 1 - 0.45 * ((i - LOOP) / FREE)) * 0.5;
      pos.setXYZ(i * 2, pts[i].x + side.x * w, pts[i].y + side.y * w, pts[i].z + side.z * w);
      pos.setXYZ(i * 2 + 1, pts[i].x - side.x * w, pts[i].y - side.y * w, pts[i].z - side.z * w);
      n.crossVectors(side, dir).normalize();
      nor.setXYZ(i * 2, n.x, n.y, n.z);
      nor.setXYZ(i * 2 + 1, n.x, n.y, n.z);
    }
    pos.needsUpdate = nor.needsUpdate = true;
    this.mesh.geometry.computeBoundingSphere();
  }
  // Where the tip is (tests and effects).
  tip() {
    return this.pos[FREE];
  }
}
