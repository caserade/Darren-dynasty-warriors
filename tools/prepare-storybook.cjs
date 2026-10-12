const fs = require('node:fs'),
  path = require('node:path');
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const root = path.resolve(__dirname, '..');
async function main() {
  const file = path.join(root, 'art-source/storybook-scenery.png'),
    png = fs.readFileSync(file),
    im = await loadImage(file),
    canvas = createCanvas(im.width, im.height),
    c = canvas.getContext('2d');
  c.drawImage(im, 0, 0);
  const pixels = c.getImageData(0, 0, im.width, im.height),
    d = pixels.data,
    cells = [];
  for (let row = 0; row < 2; row++)
    for (let col = 0; col < 4; col++) {
      const x0 = Math.round((col * im.width) / 4),
        x1 = Math.round(((col + 1) * im.width) / 4),
        y0 = Math.round((row * im.height) / 2),
        y1 = Math.round(((row + 1) * im.height) / 2),
        w = x1 - x0,
        h = y1 - y0;
      const seen = new Uint8Array(w * h);
      let largest = [];
      for (let i = 0; i < w * h; i++) {
        if (seen[i] || d[((y0 + Math.floor(i / w)) * im.width + x0 + (i % w)) * 4 + 3] < 48)
          continue;
        const component = [i];
        seen[i] = 1;
        for (let q = 0; q < component.length; q++) {
          const n = component[q],
            x = n % w,
            y = Math.floor(n / w);
          for (let dy = -1; dy <= 1; dy++)
            for (let dx = -1; dx <= 1; dx++) {
              const xx = x + dx,
                yy = y + dy,
                j = yy * w + xx;
              if (
                xx < 0 ||
                xx >= w ||
                yy < 0 ||
                yy >= h ||
                seen[j] ||
                d[((y0 + yy) * im.width + x0 + xx) * 4 + 3] < 48
              )
                continue;
              seen[j] = 1;
              component.push(j);
            }
        }
        if (component.length > largest.length) largest = component;
      }
      const keep = new Uint8Array(w * h);
      let minX = x1,
        minY = y1,
        maxX = x0,
        maxY = y0;
      for (const i of largest) {
        keep[i] = 1;
        const x = x0 + (i % w),
          y = y0 + Math.floor(i / w);
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
      for (let i = 0; i < w * h; i++)
        if (!keep[i]) d[((y0 + Math.floor(i / w)) * im.width + x0 + (i % w)) * 4 + 3] = 0;
      cells.push([minX, minY, maxX - minX + 1, maxY - minY + 1]);
    }
  c.putImageData(pixels, 0, 0);
  fs.writeFileSync(
    path.join(root, 'dist/assets/storybook-scenery.js'),
    "'use strict';\nconst STORYBOOK_ART_DATA='data:image/png;base64," +
      canvas.toBuffer('image/png').toString('base64') +
      "';\nconst STORYBOOK_CELLS=" +
      JSON.stringify(cells) +
      ';\n'
  );
  console.log('Packed 8 painted scenery assets');
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
