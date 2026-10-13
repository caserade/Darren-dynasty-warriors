// Checks the built Bucky model (dist/3d/assets/bucky.glb, made by tools/bucky-model.mjs) keeps
// what the studio pass gave it (Claude update 10). Reads the file's JSON part only; no packages.
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const glb = fs.readFileSync(path.join(__dirname, '../dist/3d/assets/bucky.glb'));
assert.equal(glb.toString('utf8', 0, 4), 'glTF', 'not a .glb file');
const json = JSON.parse(glb.toString('utf8', 20, 20 + glb.readUInt32LE(12)));
const names = json.nodes.map((n) => n.name),
  node = (n) => json.nodes[names.indexOf(n)];
const triangles = (n) =>
  json.meshes[node(n).mesh].primitives.reduce((s, p) => s + json.accessors[p.indices].count / 3, 0);
// The mallet is in his left paw, as in the supplied model and his moves.
const MALLET_HAND = 'hand_L';
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
        json.skins.every((s) => s.joints.length === 21),
        'skins should have 21 joints'
      );
    },
  ],
  [
    'a real log mallet, not the old boxes',
    () => {
      for (const n of ['Mallet head', 'Mallet handle', 'Mallet band', 'Mallet band.001'])
        assert(!names.includes(n), n + ' (old box) is back');
      assert(triangles('Mallet wood') > 1500, 'the mallet wood is too plain');
      assert(triangles('Mallet iron') > 1000, 'the iron bands are too plain');
      const wood = json.materials.find((m) => m.name === 'Mallet wood');
      assert(wood?.pbrMetallicRoughness?.baseColorTexture, 'the mallet has lost its wood texture');
    },
  ],
  [
    'the mallet is in the mallet paw',
    () => {
      for (const n of ['Mallet wood', 'Mallet iron']) assert.equal(jointOf(n), MALLET_HAND, n);
    },
  ],
  [
    'trail and impact markers ride on the mallet paw (game.mjs needs them)',
    () => {
      for (const n of ['mallet_head', 'mallet_neck', 'mallet_crown']) {
        assert(names.includes(n), n + ' missing');
        assert(node(MALLET_HAND).children.includes(names.indexOf(n)), n + ' is not on the paw');
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
  [
    'no supplied animations left (every clip comes from clips.mjs)',
    () => assert(!json.animations?.length),
  ],
  ['the file stays small', () => assert(glb.length < 3 * 1048576, glb.length + ' bytes')],
];
for (const [name, fn] of checks) {
  fn();
  console.log('PASS', name);
}
console.log(checks.length + ' Bucky model checks passed.');
