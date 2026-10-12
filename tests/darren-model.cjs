// Checks the built Darren model (dist/3d/assets/darren.glb, made by tools/darren-model.mjs) keeps
// what the studio pass gave it (Claude update 8). Reads the file's JSON part only; no packages.
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const glb = fs.readFileSync(path.join(__dirname, '../dist/3d/assets/darren.glb'));
assert.equal(glb.toString('utf8', 0, 4), 'glTF', 'not a .glb file');
const json = JSON.parse(glb.toString('utf8', 20, 20 + glb.readUInt32LE(12)));
const names = json.nodes.map((n) => n.name),
  node = (n) => json.nodes[names.indexOf(n)];
const checks = [
  [
    'every joint the game poses is there, plus knees',
    () => {
      for (const n of [
        'root',
        'hips',
        'spine',
        'head',
        'arm_L',
        'hand_L',
        'arm_R',
        'hand_R',
        'leg_L',
        'shin_L',
        'foot_L',
        'leg_R',
        'shin_R',
        'foot_R',
        'wing_L',
        'wingtip_L',
        'wing_R',
        'wingtip_R',
        'tail_1',
        'tail_5',
      ])
        assert(names.includes(n), n + ' missing');
      assert(
        json.skins.every((s) => s.joints.length === 23),
        'skins should have 23 joints'
      );
    },
  ],
  [
    'elbows: the hand bones sit half way down the arm',
    () => {
      assert(Math.abs(node('hand_L').translation[1] - 0.225) < 0.01);
      assert(Math.abs(node('hand_R').translation[1] - 0.225) < 0.01);
    },
  ],
  [
    'knees sit between leg and foot',
    () => {
      assert(node('leg_L').children.includes(names.indexOf('shin_L')));
      assert(node('shin_L').children.includes(names.indexOf('foot_L')));
    },
  ],
  [
    'one horn, the knitted scarf and its two loose ends (the game hides the ends by name)',
    () => {
      for (const n of [
        'Darren horn',
        'Polka scarf collar',
        'Polka scarf knot',
        'Scarf tail',
        'Scarf tail.001',
      ])
        assert(names.includes(n), n + ' missing');
      assert(!names.some((n) => /^Scarf polka dot/.test(n)), 'old scarf balls are back');
    },
  ],
  [
    'glossy body and baked soft shadowing',
    () => {
      const body = json.materials.find((m) => /tripo/.test(m.name));
      assert(body.extensions?.KHR_materials_clearcoat?.clearcoatFactor > 0);
      assert(body.pbrMetallicRoughness.roughnessFactor < 0.6);
      const mesh =
        json.meshes[
          node('Darren_Game')?.mesh ?? json.nodes.find((n) => n.name === 'Darren_Game').mesh
        ];
      assert('COLOR_0' in mesh.primitives[0].attributes);
    },
  ],
  [
    'no supplied animations left (every clip comes from clips.mjs)',
    () => {
      assert(!json.animations?.length);
    },
  ],
  ['the file stays small', () => assert(glb.length < 1.2 * 1048576, glb.length + ' bytes')],
];
for (const [name, fn] of checks) {
  fn();
  console.log('PASS', name);
}
console.log(checks.length + ' Darren model checks passed.');
