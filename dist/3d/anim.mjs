// Animation toolkit for the 3D heroes (Claude update 6).
// Clips are authored in code as key poses on the existing skeletons and turned into
// THREE.AnimationClips when the game loads; the supplied models are never changed.
//
// Pose format, all in "character space" (x = the hero's left, y = up, z = forward):
//   { hips: { r: [x, y, z], p: [x, y, z] }, spine: [x, y, z], armL: { aim: [x, y, z], tw: 0 }, ... }
//   - an array or { r } rotates that bone by Euler degrees (order YXZ) about character axes,
//     on top of whatever its parent does (forward kinematics);
//   - { aim } points the bone along a character-space direction no matter what its parents do,
//     with tw degrees of twist around itself; { aim, up } or { aim, face } also turns the bone about
//     its aim so the axis that pointed up (or forward) at rest points as near as it can to that
//     direction: how a held sword blade or a shield face is steered;
//   - hips.p moves the hips in metres (root motion stays in the simulation, this is body bob).
// Rotations in a key are added to the clip's base pose; aims replace it.
import * as THREE from 'three';

const DEG = Math.PI / 180,
  X = new THREE.Vector3(),
  Y = new THREE.Vector3(),
  Q1 = new THREE.Quaternion(),
  Q2 = new THREE.Quaternion(),
  Q3 = new THREE.Quaternion(),
  E = new THREE.Euler(0, 0, 0, 'YXZ'),
  REF_UP = new THREE.Vector3(0, 1, 0),
  REF_FWD = new THREE.Vector3(0, 0, 1),
  RL = new THREE.Vector3(),
  AL = new THREE.Vector3(),
  ZL = new THREE.Vector3(),
  ZT = new THREE.Vector3(),
  ML = new THREE.Matrix4(),
  MT = new THREE.Matrix4();

// Role names used by poses, mapped to each rig's bone names.
export const RIG_ROLES = {
  Darren: {
    root: 'root',
    hips: 'hips',
    spine: 'spine',
    head: 'head',
    armL: 'arm_L',
    handL: 'hand_L',
    armR: 'arm_R',
    handR: 'hand_R',
    legL: 'leg_L',
    shinL: 'shin_L',
    footL: 'foot_L',
    legR: 'leg_R',
    shinR: 'shin_R',
    footR: 'foot_R',
    wingL: 'wing_L',
    wingtipL: 'wingtip_L',
    wingR: 'wing_R',
    wingtipR: 'wingtip_R',
    tail1: 'tail_1',
    tail2: 'tail_2',
    tail3: 'tail_3',
    tail4: 'tail_4',
    tail5: 'tail_5',
  },
  Tormund: {
    root: 'root',
    hips: 'pelvis',
    spine: 'spine',
    chest: 'chest',
    neck: 'neck',
    head: 'head',
    clavL: 'clavicle_L',
    armL: 'upperarm_L',
    foreL: 'forearm_L',
    handL: 'hand_L',
    clavR: 'clavicle_R',
    armR: 'upperarm_R',
    foreR: 'forearm_R',
    handR: 'hand_R',
    legL: 'thigh_L',
    shinL: 'shin_L',
    footL: 'foot_L',
    legR: 'thigh_R',
    shinR: 'shin_R',
    footR: 'foot_R',
    tail1: 'tail_01',
    tail2: 'tail_02',
    tail3: 'tail_03',
  },
  Bucky: {
    root: 'root',
    hips: 'pelvis',
    spine: 'spine',
    chest: 'chest',
    neck: 'neck',
    head: 'head',
    armL: 'upperarm_L',
    foreL: 'forearm_L',
    handL: 'hand_L',
    armR: 'upperarm_R',
    foreR: 'forearm_R',
    handR: 'hand_R',
    legL: 'thigh_L',
    shinL: 'shin_L',
    footL: 'foot_L',
    legR: 'thigh_R',
    shinR: 'shin_R',
    footR: 'foot_R',
    tail1: 'tail_01',
    tail2: 'tail_02',
    tail3: 'tail_03',
  },
};

// Reads the bind pose of a loaded hero: every bone's rest rotation in character space.
export function buildRig(root, name) {
  const roles = RIG_ROLES[name],
    byName = {};
  root.updateMatrixWorld(true);
  const rootInv = new THREE.Quaternion();
  root.getWorldQuaternion(rootInv).invert();
  root.traverse((o) => {
    if (o.isBone) byName[o.name] = o;
  });
  const bones = [],
    info = new Map();
  root.traverse((o) => {
    if (!o.isBone) return;
    const world = new THREE.Quaternion();
    o.getWorldQuaternion(world).premultiply(rootInv);
    const parentWorld = new THREE.Quaternion();
    if (o.parent) o.parent.getWorldQuaternion(parentWorld).premultiply(rootInv);
    const pos = new THREE.Vector3();
    o.getWorldPosition(pos);
    root.worldToLocal(pos);
    const pScale = new THREE.Vector3(1, 1, 1);
    if (o.parent) o.parent.getWorldScale(pScale).divide(root.getWorldScale(new THREE.Vector3()));
    bones.push(o);
    info.set(o, {
      restQ: o.quaternion.clone(),
      restP: o.position.clone(),
      restS: o.scale.clone(),
      world,
      parentWorld,
      parentWorldInv: parentWorld.clone().invert(),
      pos,
      pScale,
    });
  });
  const role = {};
  for (const [k, v] of Object.entries(roles)) if (byName[v]) role[k] = byName[v];
  return { name, root, bones, info, role, roles };
}

// ---------- pose math ----------
function rotOf(v) {
  return Array.isArray(v) ? v : v?.r;
}
// Merge pose b over a: rotations add, aims/positions replace (or add for p when add=true).
export function mix(a = {}, b = {}) {
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) {
    const o = out[k];
    if (v === null) {
      delete out[k];
      continue;
    }
    const n = {};
    const ra = o ? rotOf(o) : null,
      rb = rotOf(v);
    if (rb) n.r = ra ? [ra[0] + rb[0], ra[1] + rb[1], ra[2] + rb[2]] : rb.slice();
    else if (ra) n.r = ra.slice();
    if (v && !Array.isArray(v)) {
      if (v.aim) n.aim = v.aim.slice();
      else if (o && !Array.isArray(o) && o.aim) n.aim = o.aim.slice();
      for (const f of ['up', 'face'])
        if (v[f]) n[f] = v[f].slice();
        else if (o && !Array.isArray(o) && o[f]) n[f] = o[f].slice();
      if (v.tw !== undefined) n.tw = (o?.tw || 0) * (v.aim ? 0 : 1) + v.tw;
      else if (o && o.tw !== undefined) n.tw = o.tw;
      if (v.p) n.p = o?.p ? [o.p[0] + v.p[0], o.p[1] + v.p[1], o.p[2] + v.p[2]] : v.p.slice();
      else if (o?.p) n.p = o.p.slice();
    } else if (o && !Array.isArray(o)) {
      if (o.aim) n.aim = o.aim.slice();
      if (o.up) n.up = o.up.slice();
      if (o.face) n.face = o.face.slice();
      if (o.tw !== undefined) n.tw = o.tw;
      if (o.p) n.p = o.p.slice();
    }
    out[k] = n;
  }
  return out;
}
// Left/right mirror of a pose (swap sides, flip yaw/roll and x offsets).
export function mirror(pose) {
  const out = {};
  for (const [k, v] of Object.entries(pose)) {
    const key = k.endsWith('L') ? k.slice(0, -1) + 'R' : k.endsWith('R') ? k.slice(0, -1) + 'L' : k;
    const r = rotOf(v),
      n = {};
    if (r) n.r = [r[0], -r[1], -r[2]];
    if (!Array.isArray(v) && v) {
      if (v.aim) n.aim = [-v.aim[0], v.aim[1], v.aim[2]];
      if (v.up) n.up = [-v.up[0], v.up[1], v.up[2]];
      if (v.face) n.face = [-v.face[0], v.face[1], v.face[2]];
      if (v.tw !== undefined) n.tw = -v.tw;
      if (v.p) n.p = [-v.p[0], v.p[1], v.p[2]];
    }
    out[key] = n;
  }
  return out;
}
// Flatten a pose into channel values so poses can be interpolated.
function channels(pose) {
  const c = {};
  for (const [k, v] of Object.entries(pose)) {
    const r = rotOf(v);
    if (r) [c[k + '.rx'], c[k + '.ry'], c[k + '.rz']] = r;
    if (v && !Array.isArray(v)) {
      if (v.aim) {
        const n = Math.hypot(...v.aim) || 1;
        [c[k + '.ax'], c[k + '.ay'], c[k + '.az']] = v.aim.map((x) => x / n);
      }
      if (v.up) [c[k + '.ux'], c[k + '.uy'], c[k + '.uz']] = v.up;
      if (v.face) [c[k + '.fx'], c[k + '.fy'], c[k + '.fz']] = v.face;
      if (v.tw !== undefined) c[k + '.tw'] = v.tw;
      if (v.p) [c[k + '.px'], c[k + '.py'], c[k + '.pz']] = v.p;
    }
  }
  return c;
}
function unchannels(c) {
  const pose = {};
  for (const [key, val] of Object.entries(c)) {
    const [k, ch] = key.split('.');
    const b = (pose[k] ??= {});
    if (ch[0] === 'r') (b.r ??= [0, 0, 0])['xyz'.indexOf(ch[1])] = val;
    else if (ch[0] === 'a') (b.aim ??= [0, 0, 0])['xyz'.indexOf(ch[1])] = val;
    else if (ch[0] === 'u') (b.up ??= [0, 0, 0])['xyz'.indexOf(ch[1])] = val;
    else if (ch[0] === 'f') (b.face ??= [0, 0, 0])['xyz'.indexOf(ch[1])] = val;
    else if (ch === 'tw') b.tw = val;
    else if (ch[0] === 'p') (b.p ??= [0, 0, 0])['xyz'.indexOf(ch[1])] = val;
  }
  return pose;
}

// Applies a pose to the rig's bones (rest pose for every bone the pose leaves out).
export function applyPose(rig, pose) {
  const world = new Map();
  for (const bone of rig.bones) {
    const inf = rig.info.get(bone);
    bone.quaternion.copy(inf.restQ);
    bone.position.copy(inf.restP);
  }
  const roleOf = new Map(Object.entries(rig.role).map(([k, b]) => [b, k]));
  for (const bone of rig.bones) {
    const inf = rig.info.get(bone),
      k = roleOf.get(bone),
      v = k ? pose[k] : null;
    const pW = bone.parent && world.has(bone.parent) ? world.get(bone.parent) : inf.parentWorld;
    if (v) {
      const r = rotOf(v);
      if (r) {
        E.set(r[0] * DEG, r[1] * DEG, r[2] * DEG, 'YXZ');
        Q1.setFromEuler(E);
        // local = Prest^-1 * D * Prest * restLocal
        Q2.copy(inf.parentWorldInv).multiply(Q1).multiply(inf.parentWorld);
        bone.quaternion.copy(Q2).multiply(inf.restQ);
      }
      if (v.aim && (v.up || v.face)) {
        // Full orientation: bone axis onto the aim, and its rest up/forward axis toward up/face.
        X.set(v.aim[0], v.aim[1], v.aim[2]).normalize();
        Y.set(...(v.up || v.face)).normalize();
        const restRef = v.up ? REF_UP : REF_FWD;
        Q3.copy(inf.world).invert();
        RL.copy(restRef).applyQuaternion(Q3); // the reference axis in bone space
        AL.set(0, 1, 0);
        RL.addScaledVector(AL, -RL.dot(AL)).normalize();
        Y.addScaledVector(X, -Y.dot(X));
        if (Y.lengthSq() < 1e-6) Y.set(X.y, -X.x, 0.3);
        Y.addScaledVector(X, -Y.dot(X)).normalize();
        ML.makeBasis(AL, RL, ZL.crossVectors(AL, RL));
        MT.makeBasis(X, Y, ZT.crossVectors(X, Y));
        MT.multiply(ML.transpose());
        Q3.setFromRotationMatrix(MT);
        if (v.tw) Q3.premultiply(Q2.setFromAxisAngle(X, v.tw * DEG));
        bone.quaternion.copy(pW).invert().multiply(Q3);
      } else if (v.aim) {
        // Current world rotation if it simply followed its parent, then swing its axis onto the aim.
        Q3.copy(pW).multiply(bone.quaternion);
        Y.set(0, 1, 0).applyQuaternion(Q3);
        X.set(v.aim[0], v.aim[1], v.aim[2]).normalize();
        Q1.setFromUnitVectors(Y, X);
        Q3.premultiply(Q1);
        if (v.tw) Q3.premultiply(Q2.setFromAxisAngle(X, v.tw * DEG));
        bone.quaternion.copy(pW).invert().multiply(Q3);
      } else if (v.tw && !r) {
        Q3.copy(pW).multiply(bone.quaternion);
        Y.set(0, 1, 0).applyQuaternion(Q3);
        Q3.premultiply(Q2.setFromAxisAngle(Y, v.tw * DEG));
        bone.quaternion.copy(pW).invert().multiply(Q3);
      }
      if (v.p) {
        X.set(v.p[0], v.p[1], v.p[2]).applyQuaternion(inf.parentWorldInv).divide(inf.pScale);
        bone.position.copy(inf.restP).add(X);
      }
    }
    world.set(bone, new THREE.Quaternion().copy(pW).multiply(bone.quaternion));
  }
}

// Easing curve used between two keys: s0/s1 are how much the motion keeps flowing through each key (0 = settles, 1 = passes through).
function hermite(p0, p1, m0, m1, t) {
  const t2 = t * t,
    t3 = t2 * t;
  return (
    (2 * t3 - 3 * t2 + 1) * p0 + (t3 - 2 * t2 + t) * m0 + (-2 * t3 + 3 * t2) * p1 + (t3 - t2) * m1
  );
}

// Builds an AnimationClip from a spec { name, dur, loop, fps, base, keys: [[t, pose, flow?], ...] }.
// t is in seconds (or 0..1 when spec.norm is true). flow (0..1, default spec.flow ?? 0.5) is how much
// the motion keeps its speed through that key instead of settling into it.
export function makeClip(rig, spec) {
  const dur = spec.dur,
    fps = spec.fps || 30,
    base = spec.base || {},
    loop = !!spec.loop;
  if (spec.fn) spec = { ...spec, keys: [[0, {}]] };
  const keys = spec.keys.map(([t, pose, flow]) => ({
    t: spec.norm ? t * dur : t,
    c: channels(mix(base, pose || {})),
    f: flow ?? spec.flow ?? 0.5,
  }));
  keys.sort((a, b) => a.t - b.t);
  if (loop && keys[keys.length - 1].t < dur - 1e-6) keys.push({ ...keys[0], t: dur });
  // Every channel present in any key; keys missing a channel use the base value (or 0).
  const names = new Set();
  for (const k of keys) for (const n of Object.keys(k.c)) names.add(n);
  const baseC = channels(base);
  // A channel a key leaves out takes the base value; a missing aim or twist takes the nearest key's value.
  for (const n of names)
    keys.forEach((k, i) => {
      if (n in k.c) return;
      if (n in baseC) k.c[n] = baseC[n];
      else if (/\.(r|p)[xyz]$/.test(n)) k.c[n] = 0;
      else {
        for (let d = 1; d < keys.length; d++) {
          const o = keys[i - d]?.c[n] ?? keys[i + d]?.c[n];
          if (o !== undefined && (keys[i - d] ? n in keys[i - d].c : true)) {
            k.c[n] = o;
            return;
          }
        }
        k.c[n] = 0;
      }
    });
  const sample = (t) => {
    if (spec.fn) return channels(mix(base, spec.fn(t / dur, t)));
    if (keys.length === 1) return { ...keys[0].c };
    let i = 0;
    while (i < keys.length - 2 && t > keys[i + 1].t) i++;
    const a = keys[i],
      b = keys[i + 1],
      span = Math.max(1e-6, b.t - a.t),
      u = Math.min(1, Math.max(0, (t - a.t) / span));
    const prev =
        keys[i - 1] ||
        (loop ? { ...keys[keys.length - 2], t: keys[keys.length - 2].t - dur } : null),
      next = keys[i + 2] || (loop ? { ...keys[1], t: keys[1].t + dur } : null);
    const out = {};
    for (const n of names) {
      const p0 = a.c[n],
        p1 = b.c[n];
      const m0 = prev ? ((p1 - prev.c[n]) / (b.t - prev.t)) * span * a.f : 0,
        m1 = next ? ((next.c[n] - p0) / (next.t - a.t)) * span * b.f : 0;
      out[n] = hermite(p0, p1, m0, m1, u);
    }
    return out;
  };
  const frames = Math.max(2, Math.round(dur * fps) + 1),
    times = new Float32Array(frames),
    tracks = new Map();
  for (const bone of rig.bones) tracks.set(bone, { q: new Float32Array(frames * 4), p: null });
  const hips = rig.role.hips;
  tracks.get(hips).p = new Float32Array(frames * 3);
  for (let f = 0; f < frames; f++) {
    const t = (f / (frames - 1)) * dur;
    times[f] = t;
    applyPose(rig, unchannels(sample(t)));
    for (const bone of rig.bones) {
      const tr = tracks.get(bone);
      bone.quaternion.toArray(tr.q, f * 4);
      if (tr.p) bone.position.toArray(tr.p, f * 3);
    }
  }
  // Keep consecutive quaternions in the same hemisphere so interpolation never flips.
  for (const tr of tracks.values())
    for (let f = 1; f < frames; f++) {
      const a = (f - 1) * 4,
        b = f * 4;
      if (
        tr.q[a] * tr.q[b] +
          tr.q[a + 1] * tr.q[b + 1] +
          tr.q[a + 2] * tr.q[b + 2] +
          tr.q[a + 3] * tr.q[b + 3] <
        0
      )
        for (let k = 0; k < 4; k++) tr.q[b + k] *= -1;
    }
  const list = [];
  for (const [bone, tr] of tracks) {
    list.push(new THREE.QuaternionKeyframeTrack(bone.name + '.quaternion', times, tr.q));
    if (tr.p) list.push(new THREE.VectorKeyframeTrack(bone.name + '.position', times, tr.p));
  }
  applyPose(rig, {});
  return new THREE.AnimationClip(spec.name, dur, list);
}

// ---------- runtime animator ----------
// Smoothly blends authored clips (cross-fade times per transition, speed-matched walk/run with a
// shared phase so feet don't slide) and then adds procedural motion the clips can't know about:
// leaning into speed and turns, the head looking at the fight, springy tails/wings, landing squash
// and hit flinches.
const V1 = new THREE.Vector3(),
  QA = new THREE.Quaternion(),
  QB = new THREE.Quaternion(),
  EA = new THREE.Euler(0, 0, 0, 'YXZ');
const damp = (a, b, rate, dt) => a + (b - a) * (1 - Math.exp(-rate * dt));
const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));
class Spring {
  constructor(k = 120, d = 14) {
    this.k = k;
    this.d = d;
    this.x = 0;
    this.v = 0;
  }
  step(target, dt) {
    // Small fixed sub-steps keep the stiff springs (squash, flinch) stable on slow frames;
    // one big step at 10-12 fps used to blow up to NaN and hide the hero for good.
    const n = Math.min(12, Math.ceil(dt * 120));
    const h = n ? dt / n : 0;
    for (let i = 0; i < n; i++) {
      const a = (target - this.x) * this.k - this.v * this.d;
      this.v += a * h;
      this.x += this.v * h;
    }
    if (!Number.isFinite(this.x) || !Number.isFinite(this.v)) this.x = this.v = 0;
    return this.x;
  }
}
export class Animator {
  // opt: { loco: { walk: m/s at Walk's natural speed, run: m/s at Run's natural speed },
  //        chains: [[role, ...]] for springy tails, wings: [roleL, roleR] }
  constructor(root, rig, clips, opt = {}) {
    this.root = root;
    this.rig = rig;
    this.opt = opt;
    this.mixer = new THREE.AnimationMixer(root);
    this.clips = {};
    this.actions = {};
    for (const c of clips) {
      this.clips[c.name] = c;
      const a = this.mixer.clipAction(c);
      a.setLoop(THREE.LoopRepeat, Infinity);
      a.timeScale = 0;
      a.weight = 0;
      a.play();
      this.actions[c.name] = a;
    }
    this.entries = [];
    this.current = null;
    this.phase = 0;
    this.yaw = null;
    this.vel = new THREE.Vector2();
    this.lean = { x: new Spring(60, 12), z: new Spring(60, 12) };
    this.look = { y: 0, x: 0 };
    this.squash = new Spring(260, 16);
    this.flinch = { x: new Spring(220, 13), z: new Spring(220, 13) };
    this.chains = (opt.chains || []).map((roles) =>
      roles.map((r, i) => ({
        bone: rig.role[r],
        y: new Spring(70 - i * 8, 7 + i * 0.4),
        x: new Spring(70 - i * 8, 7 + i * 0.4),
      }))
    );
    this.wingSpring = new Spring(90, 9);
    this.wasAir = false;
    this.landT = 9;
    this.speedSm = 0;
  }
  has(name) {
    return !!this.actions[name];
  }
  // Called each frame with what the hero is doing.
  // d = { key, clip, time?, loop?, blend?, speed, air, vy, yaw, x, z, look: {x, y, z} | null, hurt: angle|null, still }
  update(dt, d) {
    // Idle breathing follows game time, so it holds still while the game is paused.
    this.idleT = (this.idleT || 0) + dt;
    // --- root yaw: follows the simulation, smoothed a little, and remembers how fast it turned
    if (this.yaw === null) this.yaw = d.yaw;
    const diff = wrapAngle(d.yaw - this.yaw),
      turnRate = d.snapYaw ? 60 : 22;
    const prevYaw = this.yaw;
    this.yaw = wrapAngle(this.yaw + diff * (1 - Math.exp(-turnRate * dt)));
    const yawVel = dt > 0 ? wrapAngle(this.yaw - prevYaw) / dt : 0;
    // --- velocity in character space (for lean)
    const vx = d.vx ?? 0,
      vz = d.vz ?? 0,
      c = Math.cos(this.yaw),
      s = Math.sin(this.yaw);
    const fwd = vx * s + vz * c,
      side = vx * c - vz * s;
    const ax = dt > 0 ? (fwd - this.vel.y) / dt : 0;
    this.vel.set(side, fwd);
    this.speedSm = damp(this.speedSm, d.speed, 10, dt);
    // --- choose / cross-fade the base clip
    if (d.key !== this.current) {
      const blend = d.blend ?? 0.15;
      for (const e of this.entries) e.out = Math.max(0.04, blend);
      this.entries.push({
        key: d.key,
        clip: d.clip,
        t: d.time ?? 0,
        w: this.entries.length ? 0 : 1,
        in: Math.max(0.001, blend),
        out: 0,
        loop: d.loop,
      });
      this.current = d.key;
    }
    const cur = this.entries[this.entries.length - 1];
    cur.clip = d.clip;
    cur.loop = d.loop;
    if (d.time !== undefined) cur.t = d.time;
    // landing squash and a short landing clip when nothing else is going on
    const air = d.air > 0.02;
    if (this.wasAir && !air) {
      this.squash.v -= Math.min(4, 1 + Math.abs(this.lastVy || 0) * 0.35);
      this.landT = 0;
    }
    if (air) this.lastVy = d.vy;
    this.wasAir = air;
    this.landT += dt;
    if (d.hurt !== null && d.hurt !== undefined) {
      const rel = d.hurt - this.yaw; // direction the blow travels, relative to facing
      this.flinch.x.v += Math.cos(rel) * 9;
      this.flinch.z.v += Math.sin(rel) * 7;
    }
    // --- advance entries and weights
    for (const e of this.entries) {
      if (e !== cur || d.time === undefined) {
        const clip = this.clips[e.clip];
        if (e.key === 'loco') e.t = 0;
        else if (clip) {
          e.t += dt * (e.rate ?? 1);
          e.t = e.loop ? e.t % clip.duration : Math.min(e.t, clip.duration - 1e-4);
        }
      }
      if (e === cur) e.w = Math.min(1, e.w + dt / e.in);
      else e.w -= dt / e.out;
    }
    this.entries = this.entries.filter((e) => e === cur || e.w > 0);
    if (this.entries.length > 4) this.entries.splice(0, this.entries.length - 4);
    for (const a of Object.values(this.actions)) a.weight = 0;
    let total = 0;
    for (const e of this.entries) total += Math.max(0, e.w);
    // Locomotion: idle / walk / run weights by ground speed with one shared stride phase.
    const L = this.opt.loco || { walk: 1.6, run: 5 },
      sp = this.speedSm,
      runW = Math.max(0, Math.min(1, (sp - L.walk * 0.9) / (L.run * 0.55 - L.walk * 0.9))),
      moveW = Math.max(0, Math.min(1, sp / (L.walk * 0.6)));
    const walkName = this.clips.Walk ? 'Walk' : 'Run',
      walkClip = this.clips[walkName],
      runClip = this.clips.Run;
    if (walkClip && runClip) {
      const cycWalk = L.walk * walkClip.duration,
        cycRun = L.run * runClip.duration,
        cycle = cycWalk + (cycRun - cycWalk) * runW;
      this.phase = (this.phase + (sp * dt) / Math.max(0.2, cycle)) % 1;
      if (sp < 0.05 && moveW < 0.01) this.phase = 0;
    }
    for (const e of this.entries) {
      const w = Math.max(0, e.w) / (total || 1);
      if (e.key === 'loco') {
        const idleW = 1 - moveW;
        this.setW('Idle', w * idleW, this.idleT % (this.clips.Idle?.duration || 1));
        this.setW(walkName, w * moveW * (1 - runW), this.phase * (walkClip?.duration || 1));
        this.setW('Run', w * moveW * runW, this.phase * (runClip?.duration || 1));
      } else this.setW(e.clip, w, e.t);
    }
    // three.js only writes a bone when its blended value changes, so the procedural layer below
    // must be undone first or it would pile up frame after frame.
    if (this.snap) this.rig.bones.forEach((b, i) => b.quaternion.fromArray(this.snap, i * 4));
    this.mixer.update(0);
    this.snap ??= new Float32Array(this.rig.bones.length * 4);
    this.rig.bones.forEach((b, i) => b.quaternion.toArray(this.snap, i * 4));
    this.procedural(dt, d, fwd, side, ax, yawVel, air);
  }
  setW(name, w, t) {
    const a = this.actions[name];
    if (!a) return;
    a.weight += w;
    a.time = Math.max(0, Math.min(t, a.getClip().duration - 1e-4));
  }
  // Rotate a bone by Euler degrees about character axes (as seen from its parent's rest frame).
  turn(bone, x, y, z) {
    if (!bone || (!x && !y && !z)) return;
    const inf = this.rig.info.get(bone);
    EA.set(x, y, z, 'YXZ');
    QA.setFromEuler(EA);
    QB.copy(inf.parentWorldInv).multiply(QA).multiply(inf.parentWorld);
    bone.quaternion.premultiply(QB);
  }
  procedural(dt, d, fwd, side, ax, yawVel, air) {
    const R = this.rig.role,
      k = d.still ? 0.25 : 1;
    // Lean into acceleration (forward/back) and bank into turns.
    const leanX = Math.max(-0.35, Math.min(0.35, ax * 0.018 + fwd * 0.012)) * k,
      leanZ = Math.max(-0.3, Math.min(0.3, -yawVel * Math.min(1, this.speedSm / 4) * 0.09)) * k;
    const lx = this.lean.x.step(air ? 0 : leanX, dt),
      lz = this.lean.z.step(air ? 0 : leanZ, dt);
    this.turn(R.hips, lx * 0.6, 0, lz);
    this.turn(R.spine, lx * 0.4, 0, lz * 0.3);
    // Hit flinch: the body snaps with the blow and springs back.
    const fx = this.flinch.x.step(0, dt),
      fz = this.flinch.z.step(0, dt);
    this.turn(R.spine, fx * 0.06, 0, fz * 0.05);
    this.turn(R.head, fx * 0.05, 0, fz * 0.04);
    // Head (and a little chest) turns toward what the hero is fighting.
    let ty = 0,
      tx = 0;
    if (d.look && !d.noLook) {
      const dx = d.look.x - d.x,
        dz = d.look.z - d.z,
        c = Math.cos(this.yaw),
        s = Math.sin(this.yaw),
        lf = dx * s + dz * c,
        ls = dx * c - dz * s;
      ty = Math.atan2(ls, lf);
      if (Math.abs(ty) > 1.9) ty = 0;
      ty = Math.max(-1, Math.min(1, ty));
      tx = -Math.max(
        -0.35,
        Math.min(0.35, Math.atan2((d.look.y ?? 0) - (d.y ?? 0) - 1, Math.hypot(lf, ls)))
      );
    }
    this.look.y = damp(this.look.y, ty, 6, dt);
    this.look.x = damp(this.look.x, tx, 6, dt);
    if (R.chest) this.turn(R.chest, 0, this.look.y * 0.2, 0);
    else this.turn(R.spine, 0, this.look.y * 0.15, 0);
    if (R.neck) this.turn(R.neck, this.look.x * 0.4, this.look.y * 0.35, 0);
    this.turn(R.head, this.look.x * 0.6, this.look.y * (R.neck ? 0.4 : 0.65), 0);
    // Springy tails: lag behind turns and speed changes, bob with the body.
    for (const chain of this.chains) {
      let carryY = 0,
        carryX = 0;
      chain.forEach((n, i) => {
        const gain = 1 + i * 0.25;
        const y = n.y.step(yawVel * 0.07 * gain + carryY * 0.5, dt),
          x = n.x.step((-ax * 0.012 - (air ? (d.vy || 0) * 0.03 : 0)) * gain + carryX * 0.5, dt);
        carryY = y;
        carryX = x;
        this.turn(n.bone, Math.max(-0.6, Math.min(0.6, x)), Math.max(-0.7, Math.min(0.7, y)), 0);
      });
    }
    // Wings flick open with sudden moves.
    if (this.opt.wings) {
      const w = this.wingSpring.step(
        Math.min(0.5, Math.abs(ax) * 0.02 + Math.abs(yawVel) * 0.04),
        dt
      );
      this.turn(R[this.opt.wings[0]], 0, -w * 0.4, w * 0.5);
      this.turn(R[this.opt.wings[1]], 0, w * 0.4, -w * 0.5);
    }
    this.squashY = 1 + this.squash.step(0, dt) * 0.06;
  }
}
