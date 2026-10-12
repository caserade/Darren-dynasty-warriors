// Checks the built Tormund model (dist/3d/assets/tormund.glb, made by tools/tormund-model.mjs) keeps
// what the studio pass gave it (Claude update 9). Reads the file's JSON part only; no packages.
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const glb = fs.readFileSync(path.join(__dirname, '../dist/3d/assets/tormund.glb'));
assert.equal(glb.toString('utf8', 0, 4), 'glTF', 'not a .glb file');
const json = JSON.parse(glb.toString('utf8', 20, 20 + glb.readUInt32LE(12)));
const names = json.nodes.map((n) => n.name),
  node = (n) => json.nodes[names.indexOf(n)];
const triangles = (n) =>
  json.meshes[node(n).mesh].primitives.reduce((s, p) => s + json.accessors[p.indices].count / 3, 0);
// Which paw holds which (the model's own sides: hand_L is his left).
const SWORD_HAND = 'hand_L',
  SHIELD_HAND = 'hand_R';
const jointOf = (n) => {
  const p = json.meshes[node(n).mesh].primitives[0],
    acc = json.accessors[p.attributes.JOINTS_0],
    view = json.bufferViews[acc.bufferView],
    bin = 20 + glb.readUInt32LE(12) + 8,
    joints = json.skins[node(n).skin].joints;
  return json.nodes[joints[glb[bin + (view.byteOffset || 0) + (acc.byteOffset || 0)]]].name;
};
const checks = [
  [
    'every joint the game poses is there',
    () => {
      for (const n of ['pelvis', 'chest', 'neck', 'head', 'hand_L', 'hand_R', 'shin_L', 'tail_03'])
        assert(names.includes(n), n + ' missing');
      assert(
        json.skins.every((s) => s.joints.length === 23),
        'skins should have 23 joints'
      );
    },
  ],
  [
    'a real sword and shield, not the old boxes',
    () => {
      for (const n of ['Sword blade', 'Sword guard', 'Sword gems', 'Sword grip'])
        assert(names.includes(n), n + ' missing');
      for (const n of ['Shield face', 'Shield back', 'Shield rim'])
        assert(names.includes(n), n + ' missing');
      assert(triangles('Sword grip') > 500, 'grip is too plain');
      assert(triangles('Shield face') > 1000, 'shield face is too plain');
      assert(triangles('Shield rim') > 500, 'shield rim is too plain');
      const tex = json.materials.find((m) => m.name === 'Shield paint');
      assert(tex?.pbrMetallicRoughness?.baseColorTexture, 'the shield has lost its emblem');
    },
  ],
  [
    'sword in the sword paw, shield on the shield arm',
    () => {
      for (const n of ['Sword blade', 'Sword guard', 'Sword grip'])
        assert.equal(jointOf(n), SWORD_HAND, n);
      for (const n of ['Shield face', 'Shield rim']) assert.equal(jointOf(n), SHIELD_HAND, n);
    },
  ],
  [
    'sword trail markers ride on the sword paw (game.mjs needs them)',
    () => {
      for (const n of ['blade_base', 'blade_tip']) {
        assert(names.includes(n), n + ' missing');
        assert(node(SWORD_HAND).children.includes(names.indexOf(n)), n + ' is not on the paw');
      }
    },
  ],
  [
    'baked soft shadowing on the body',
    () => {
      const mesh = json.meshes.find((m) => /^tripo_mesh/.test(m.name));
      assert('COLOR_0' in mesh.primitives[0].attributes);
    },
  ],
  ['the file stays small', () => assert(glb.length < 3.5 * 1048576, glb.length + ' bytes')],
];
for (const [name, fn] of checks) {
  fn();
  console.log('PASS', name);
}
console.log(checks.length + ' Tormund model checks passed.');
