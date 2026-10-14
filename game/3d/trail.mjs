// Weapon trails for the 3D heroes (Claude update 6): a short fading ribbon swept by a weapon's
// edge while an attack is under way, from two points on the bone that holds it.
import * as THREE from 'three';

const N = 12;

export class WeaponTrail {
  // bone: the hand bone; from/to: distances along the weapon's rest-up axis (in the bone's space),
  // or along the bone itself when alongBone is set (Darren's paws, at the end of his forearms).
  constructor(scene, rig, bone, from, to, color, alongBone = false) {
    const up = alongBone
      ? new THREE.Vector3(0, 1, 0)
      : new THREE.Vector3(0, 1, 0).applyQuaternion(rig.info.get(bone).world.clone().invert());
    this.bone = bone;
    this.a = up.clone().multiplyScalar(from);
    this.b = up.clone().multiplyScalar(to);
    this.pts = [];
    this.on = 0;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 2 * 3), 3));
    geo.setAttribute('alpha', new THREE.BufferAttribute(new Float32Array(N * 2), 1));
    const index = [];
    for (let i = 0; i < N - 1; i++)
      index.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    geo.setIndex(index);
    this.mesh = new THREE.Mesh(
      geo,
      new THREE.ShaderMaterial({
        uniforms: { color: { value: new THREE.Color(color) }, fade: { value: 1 } },
        vertexShader:
          'attribute float alpha; varying float vA; void main(){ vA = alpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader:
          'uniform vec3 color; uniform float fade; varying float vA; void main(){ gl_FragColor = vec4(color, vA * fade * 0.75); }',
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      })
    );
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    scene.add(this.mesh);
  }
  // A trail between two marker objects that ride on the weapon (from the model file).
  static between(scene, root, fromName, toName, color) {
    const from = root.getObjectByName(fromName),
      to = root.getObjectByName(toName);
    if (!from || !to) throw Error(`Weapon trail markers ${fromName}/${toName} are missing.`);
    const t = new WeaponTrail(scene, null, from.parent, 0, 0, color, true);
    t.a = from.position.clone();
    t.b = to.position.clone();
    return t;
  }
  // active: an attack is swinging; samples are taken every frame while it is.
  update(dt, active) {
    this.on = active ? 1 : Math.max(0, this.on - dt * 6);
    if (this.on <= 0) {
      this.pts.length = 0;
      this.mesh.visible = false;
      return;
    }
    this.bone.updateWorldMatrix(true, false);
    const m = this.bone.matrixWorld;
    // Sample at most 60 times a second so the trail is the same length on a 144 Hz screen
    // as at 60 Hz (the fight itself steps at 60 Hz, so extra samples were only duplicates).
    this.acc = (this.acc || 0) + dt;
    if (active && dt > 0 && (this.acc >= 1 / 61 || this.pts.length === 0)) {
      this.acc = 0;
      this.pts.unshift([this.a.clone().applyMatrix4(m), this.b.clone().applyMatrix4(m)]);
      if (this.pts.length > N) this.pts.length = N;
    }
    const pos = this.mesh.geometry.attributes.position,
      al = this.mesh.geometry.attributes.alpha,
      n = this.pts.length;
    for (let i = 0; i < N; i++) {
      const p = this.pts[Math.min(i, n - 1)];
      pos.setXYZ(i * 2, p[0].x, p[0].y, p[0].z);
      pos.setXYZ(i * 2 + 1, p[1].x, p[1].y, p[1].z);
      const k = i < n ? 1 - i / (N - 1) : 0;
      al.setX(i * 2, k * 0.3);
      al.setX(i * 2 + 1, k);
    }
    pos.needsUpdate = al.needsUpdate = true;
    this.mesh.material.uniforms.fade.value = this.on;
    this.mesh.visible = n > 1;
  }
}
