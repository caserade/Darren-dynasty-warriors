// Weapon trail regression check (Claude update 16): a trail asked to draw before it has any
// sample (a swing that starts on a paused frame, such as the one a boss's greeting opens on)
// must stay hidden instead of throwing, which used to stop that frame's HUD and left the boss
// bar hidden behind Sergeant Spudsworth's dialogue.
import assert from 'node:assert/strict';
import { register } from 'node:module';
register(
  'data:text/javascript,' +
    encodeURIComponent(
      `export async function resolve(s, c, next) {
        const r = await next(s === 'three' ? new URL('../dist/3d/vendor/three.module.js', ${JSON.stringify(import.meta.url)}).href : s, c);
        return r.url.includes('/dist/3d/') ? { ...r, format: 'module' } : r;
      }`
    )
);
const THREE = await import('three');
const { WeaponTrail } = await import('../dist/3d/trail.mjs');
const scene = new THREE.Scene(),
  hand = new THREE.Object3D();
scene.add(hand);
const t = new WeaponTrail(scene, null, hand, 0, 1, 0xffffff, true);
assert.doesNotThrow(() => t.update(0, true), 'a paused first frame of a swing');
assert.equal(t.mesh.visible, false);
t.update(1 / 60, true);
hand.position.x = 1;
t.update(1 / 60, true);
assert.equal(t.mesh.visible, true, 'two samples draw a ribbon');
t.update(1, false);
assert.doesNotThrow(() => t.update(0, true), 'a swing restarting on a paused frame');
assert.equal(t.mesh.visible, false);
console.log('4 weapon trail checks passed.');
