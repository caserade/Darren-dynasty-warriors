// Shine for polished metal (Claude update 9, Tormund studio pass 3).
// Polished metal shows only what it reflects, and the valley had nothing for it to reflect, so
// Tormund's silver armour, sword and gold trim rendered dark brown or black. A small snowy sky
// (pale blue above, bright snow below, a warm sun) is made once and given to his materials as
// reflections only: lighting of everything that isn't shiny stays exactly as before.
import * as THREE from 'three';

let sky = null;
// The reflected surroundings, made once per renderer.
export function metalSky(renderer) {
  if (sky) return sky;
  const scene = new THREE.Scene(),
    geo = new THREE.SphereGeometry(10, 48, 24),
    pos = geo.attributes.position,
    col = new Float32Array(pos.count * 3),
    top = new THREE.Color(0x9cc6e8),
    horizon = new THREE.Color(0xf2f7fb),
    snow = new THREE.Color(0xe6edf2),
    shade = new THREE.Color(0x8f9aa3),
    c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / 10;
    if (y >= 0) c.copy(horizon).lerp(top, Math.pow(y, 0.7));
    else c.copy(snow).lerp(shade, Math.min(1, -y * 1.6));
    col.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  scene.add(
    new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide }))
  );
  // The sun, where the game's sunlight comes from, so highlights sit where the light is.
  const sun = new THREE.Mesh(
    new THREE.SphereGeometry(0.9, 16, 8),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(0xfff1d6).multiplyScalar(6) })
  );
  sun.position.set(4, 8, 5).setLength(9);
  scene.add(sun);
  const pmrem = new THREE.PMREMGenerator(renderer);
  sky = pmrem.fromScene(scene, 0.02).texture;
  pmrem.dispose();
  geo.dispose();
  return sky;
}

// Reflections only: the sky's light on matte surfaces (diffuse) is left out, so fur, cloth and
// leather look as they did; only shiny surfaces pick up the sky.
const REFLECT_ONLY = THREE.ShaderChunk.lights_fragment_maps.replace(
  'iblIrradiance += getIBLIrradiance( geometryNormal );',
  ''
);
export function addMetalShine(root, renderer) {
  const env = metalSky(renderer);
  root.traverse((o) => {
    if (!o.isMesh) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      if (!m.isMeshStandardMaterial || m.envMap) continue;
      m.envMap = env;
      m.envMapIntensity = 1;
      m.onBeforeCompile = (shader) => {
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <lights_fragment_maps>',
          REFLECT_ONLY
        );
      };
      m.customProgramCacheKey = () => 'reflect-only';
      m.needsUpdate = true;
    }
  });
}
