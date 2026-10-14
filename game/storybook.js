'use strict';
let storybookImage = null;
// Painted, screen-facing scenery keeps the existing collision footprints and depth sorting.
const STORYBOOK_PROPS = {
  pine3d: [0, 175, 280],
  cottage: [1, 270, 268],
  lantern: [2, 74, 155],
  tent3d: [3, 215, 164],
  keep: [4, 300, 330],
  supply: [5, 94, 96],
  flag3d: [6, 97, 158],
  rock3d: [7, 106, 72],
};
function prepareStorybook(scene) {
  if (scene.textures.exists('storybook-source'))
    storybookImage = scene.textures.get('storybook-source').getSourceImage();
  for (const button of document.querySelectorAll('.openWeightBook'))
    button.onclick = () => {
      if (state === 'play' && !paused) togglePause();
      scene.bookPadDown = true;
      scene.updateWeightBook(true);
      document.querySelector('#weightBook').showModal();
    };
  const book = document.querySelector('#weightBook');
  window.addEventListener(
    'keydown',
    (e) => {
      if (book.open) e.stopImmediatePropagation();
    },
    true
  );
  document.querySelector('#closeWeightBook').onclick = () =>
    document.querySelector('#weightBook').close();
}
function storybookPropFrame(scene, p, quarter) {
  const spec = STORYBOOK_PROPS[p.kind];
  if (!storybookImage || !spec) return null;
  const scale = p.kind === 'cottage' ? (p.variant ? 0.86 : 1) : Math.round((p.s || 1) * 4) / 4,
    w = Math.ceil(spec[1] * scale),
    h = Math.ceil(spec[2] * scale),
    mirror = quarter % 2 === 1;
  const key = ['storybook', p.kind, w, h, mirror].join('-');
  if (scene.textures.exists(key)) return scene.textures.get(key).worldFrame;
  const t = scene.textures.createCanvas(key, w + 8, h + 8),
    c = t.context;
  c.imageSmoothingEnabled = true;
  if (mirror) {
    c.translate(w + 8, 0);
    c.scale(-1, 1);
  }
  c.drawImage(storybookImage, ...STORYBOOK_CELLS[spec[0]], 4, 4, w, h);
  t.refresh();
  t.setFilter(Phaser.Textures.FilterMode.LINEAR);
  return (t.worldFrame = {
    texture: key,
    frame: '__BASE',
    originX: 0.5,
    originY: (h + 2) / (h + 8),
    pixelScale: 1,
  });
}
function paintWeightBook(scene, force = false) {
  if (!force && !document.querySelector('#weightBook').open) return;
  for (let stage = 0; stage < 4; stage++) {
    const canvas = document.querySelector('#weightPreview' + stage),
      c = canvas.getContext('2d');
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, canvas.width, canvas.height);
    c.fillStyle = '#779caa30';
    c.beginPath();
    c.ellipse(144, 294, 66 + stage * 8, 15, 0, 0, TAU);
    c.fill();
    c.save();
    c.translate(10, 14);
    c.scale(2.4, 2.4);
    paintDarren(c, 2, 'idle', Math.floor(rt * 4) % 8, stage, wearScarf, 0);
    c.restore();
  }
}
