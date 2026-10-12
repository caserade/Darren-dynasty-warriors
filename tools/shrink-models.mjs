// Shrink the 3D game's .glb models in place without changing how they look or animate.
// PNG normal and metal/roughness maps become high-quality JPEGs (full 2048 size, no colour
// subsampling), and vertex data is stored in smaller number types (KHR_mesh_quantization,
// which Three.js reads with no extra decoder). Colour JPEGs, animations and names are kept.
// One-time setup outside the game folder's tests:
//   npm i --no-save @gltf-transform/core@4 @gltf-transform/extensions@4 @gltf-transform/functions@4 sharp
// Run: node tools/shrink-models.mjs  (git history keeps the original models)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, quantize } from '@gltf-transform/functions';
import sharp from 'sharp';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../dist/3d/assets');
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

for (const name of ['terrain', 'darren', 'tormund', 'bucky']) {
  const file = path.join(dir, name + '.glb'),
    before = fs.statSync(file).size,
    doc = await io.read(file);
  for (const texture of doc.getRoot().listTextures()) {
    if (texture.getMimeType() !== 'image/png') continue;
    const jpeg = await sharp(texture.getImage())
      .removeAlpha()
      .jpeg({ quality: 90, chromaSubsampling: '4:4:4', mozjpeg: true })
      .toBuffer();
    texture.setImage(jpeg).setMimeType('image/jpeg');
    if (texture.getURI()) texture.setURI(texture.getURI().replace(/\.png$/i, '.jpg'));
  }
  await doc.transform(dedup(), prune(), quantize());
  await io.write(file, doc);
  const after = fs.statSync(file).size;
  console.log(`${name}.glb ${(before / 1048576).toFixed(2)} MB -> ${(after / 1048576).toFixed(2)} MB`);
}
