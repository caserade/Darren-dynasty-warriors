// Slice the supplied generated game sheet into fixed, foot-aligned sprite cells.
// This packaging step removes disconnected transparent gutter speckles, not character details.
const fs = require('node:fs');
const path = require('node:path');
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const ROOT = path.resolve(__dirname, '..');
const FW = 224,
  FH = 256;
async function main() {
  const image = await loadImage(path.join(ROOT, 'art-source/darren-storybook-source.png'));
  const atlas = createCanvas(FW * 8, FH * 5),
    out = atlas.getContext('2d');
  out.imageSmoothingEnabled = true;
  const manifest = {
    version: 5,
    approvedDesign: 'darren-storybook-pass',
    frameWidth: FW,
    frameHeight: FH,
    foot: [112, 232],
    rows: ['E', 'SE', 'S', 'NE', 'N'],
    poses: ['idle', 'step-left', 'step-right', 'jab', 'cross', 'kick', 'push', 'throw'],
    cells: [],
  };
  const cells = [];
  for (let row = 0; row < 5; row++)
    for (let col = 0; col < 8; col++) {
      const x0 = Math.round((col * image.width) / 8),
        y0 = Math.round((row * image.height) / 5),
        w = Math.round(((col + 1) * image.width) / 8) - x0,
        h = Math.round(((row + 1) * image.height) / 5) - y0;
      const cell = createCanvas(w, h),
        c = cell.getContext('2d');
      c.drawImage(image, x0, y0, w, h, 0, 0, w, h);
      const pixels = c.getImageData(0, 0, w, h),
        d = pixels.data,
        seen = new Uint8Array(w * h);
      let largest = [];
      for (let i = 0; i < w * h; i++) {
        if (seen[i] || d[i * 4 + 3] < 128) continue;
        let component = [i];
        seen[i] = 1;
        for (let q = 0; q < component.length; q++) {
          const p = component[q],
            x = p % w,
            y = Math.floor(p / w);
          for (let dy = -1; dy <= 1; dy++)
            for (let dx = -1; dx <= 1; dx++) {
              if (!dx && !dy) continue;
              const xx = x + dx,
                yy = y + dy,
                n = yy * w + xx;
              if (xx < 0 || xx >= w || yy < 0 || yy >= h || seen[n] || d[n * 4 + 3] < 128) continue;
              seen[n] = 1;
              component.push(n);
            }
        }
        if (component.length > largest.length) largest = component;
      }
      if (largest.length < 2000) throw Error(`Missing sprite ${row}/${col}`);
      const keep = new Uint8Array(w * h);
      let minX = w,
        minY = h,
        maxX = 0,
        maxY = 0;
      for (const i of largest) {
        keep[i] = 1;
        const x = i % w,
          y = Math.floor(i / w);
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
      for (let i = 0; i < w * h; i++) d[i * 4 + 3] = keep[i] ? 255 : 0;
      c.putImageData(pixels, 0, 0);
      const rootX = minX + (maxX - minX) * [0.6, 0.53, 0.5, 0.6, 0.5][row],
        rootY = maxY - (row === 4 ? (maxY - minY) * 0.07 : 0);
      cells.push({ row, col, cell, w, h, minX, minY, maxX, maxY, rootX, rootY });
    }
  // One global scale preserves head size across all actions; only roots are aligned.
  const heights = cells
      .filter((c) => c.col === 0)
      .map((c) => c.maxY - c.minY)
      .sort((a, b) => a - b),
    scale = 192 / heights[2];
  manifest.sourceScale = scale;
  for (const p of cells) {
    const dx = FW / 2 - p.rootX * scale,
      dy = 232 - p.rootY * scale;
    out.save();
    out.beginPath();
    out.rect(p.col * FW, p.row * FH, FW, FH);
    out.clip();
    out.drawImage(p.cell, p.col * FW + dx, p.row * FH + dy, p.w * scale, p.h * scale);
    out.restore();
    manifest.cells.push({
      row: p.row,
      col: p.col,
      sourceBounds: [p.minX, p.minY, p.maxX, p.maxY],
      root: [p.rootX, p.rootY],
    });
  }
  const png = atlas.toBuffer('image/png');
  fs.writeFileSync(path.join(ROOT, 'dist/assets/darren-isometric.png'), png);
  fs.writeFileSync(
    path.join(ROOT, 'dist/assets/darren-isometric.js'),
    `'use strict';\n// Embedded locally so the downloadable game also works without a server.\nconst DARREN_ART_DATA='data:image/png;base64,${png.toString('base64')}';\nconst DARREN_ART_MANIFEST=${JSON.stringify(manifest)};\n`
  );
  fs.writeFileSync(
    path.join(ROOT, 'art-source/darren-art-manifest.json'),
    JSON.stringify(manifest, null, 2) + '\n'
  );
  console.log(
    JSON.stringify({
      frames: manifest.cells.length,
      atlas: [atlas.width, atlas.height],
      pngBytes: png.length,
    })
  );
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
