'use strict';
// New painted sprite poses, with the same gameplay-facing animation contract.
// Five authored views become eight facings through symmetric left/right views.
const DARREN_VIEW_ROWS = [0, 1, 2, 1, 0, 3, 4, 3];
const DARREN_MIRROR = [false, false, false, true, true, true, false, false];
let darrenSourceImage = null;
const darrenPoseCache = new Map();
function prepareDarrenArtwork(scene) {
  if (scene.textures.exists('darren-painted-source'))
    darrenSourceImage = scene.textures.get('darren-painted-source').getSourceImage();
  darrenPoseCache.clear();
}
function darrenPoseColumn(state, frame) {
  if (state === 'walk') return [0, 1, 1, 0, 0, 2, 2, 0][frame];
  if (state === 'punch') return [0, 4, 4, 3, 3, 3, 4, 0][frame];
  if (state === 'cross') return [0, 3, 3, 4, 4, 4, 3, 0][frame];
  if (state === 'kick') return [0, 0, 1, 5, 5, 5, 1, 0][frame];
  if (state === 'throw') return [7, 7, 3, 6][frame];
  if (state === 'roll') return 6;
  if (state === 'charge') return frame > 0 ? 6 : 0;
  if (state === 'special') return [0, 7, 7, 3, 7, 7, 3, 0][frame];
  if (state === 'dodge') return frame < 2 ? 1 : 2;
  return 0;
}
function darrenTailTurn(t) {
  if (t <= 0) return 0;
  if (t < 0.2) return -0.045 * Math.sin(((t / 0.2) * Math.PI) / 2);
  if (t > 0.8) return 1;
  const p = (t - 0.2) / 0.6;
  return -0.045 + 1.045 * (p * p * (3 - 2 * p));
}
function darrenPaintedPose(row, col, weight) {
  const key = [row, col, weight].join('-');
  if (darrenPoseCache.has(key)) return darrenPoseCache.get(key);
  const canvas = document.createElement('canvas');
  canvas.width = DARREN_FRAME_W * 2;
  canvas.height = DARREN_FRAME_H * 2;
  const c = canvas.getContext('2d');
  c.imageSmoothingEnabled = true;
  c.scale(2, 2);
  const sx = col * DARREN_FRAME_W * 2,
    sy = row * DARREN_FRAME_H * 2;
  // Localized waist deformation leaves head size, wings, hands and ground anchor stable.
  for (let y = 0; y < DARREN_FRAME_H; y++) {
    const bell = Math.max(0, 1 - Math.pow((y - 91) / 20, 2)),
      grow = weight * 4.1 * bell * bell;
    if (grow < 0.02) {
      c.drawImage(
        darrenSourceImage,
        sx,
        sy + y * 2,
        DARREN_FRAME_W * 2,
        2,
        0,
        y,
        DARREN_FRAME_W,
        1
      );
      continue;
    }
    const center = row === 0 ? 57 : 56,
      left = center - 15,
      right = center + 15,
      outerL = center - 34,
      outerR = center + 34;
    const src = [0, outerL, left, right, outerR, DARREN_FRAME_W],
      dst = [0, outerL, left - grow, right + grow, outerR, DARREN_FRAME_W];
    for (let i = 0; i < 5; i++)
      c.drawImage(
        darrenSourceImage,
        sx + src[i] * 2,
        sy + y * 2,
        (src[i + 1] - src[i]) * 2,
        2,
        dst[i],
        y,
        dst[i + 1] - dst[i] + 0.25,
        1
      );
  }
  darrenPoseCache.set(key, canvas);
  // A bounded CPU cache complements the small, per-action GPU atlases.
  if (darrenPoseCache.size > 96) darrenPoseCache.delete(darrenPoseCache.keys().next().value);
  return canvas;
}
function paintDarrenScarf(c, row, state, phase, weight, behind) {
  const back = row >= 3,
    side = row === 0,
    moving = state === 'walk' || state === 'roll' || meleeAnimation(state),
    soft = softMotion && !reduceMotion;
  const x = [61, 58, 56, 58, 56][row],
    y = [83, 85, 86, 82, 83][row];
  const sway = soft ? Math.sin(phase - 1) * (moving ? 3.8 : 1.1) * (1 + weight * 0.1) : 0;
  const tailX = x - (side ? 30 : 28) - (moving ? 3 : 0),
    tailY = y + 7 + sway;
  const stroke = '#854d43',
    gold = '#f7cc55',
    light = '#ffec9a',
    shade = '#d29240',
    pink = '#e56c9d';
  if (behind) {
    if (back) return;
    pxPoly(
      c,
      [
        [x - 4, y - 2],
        [x - 16, y + 1],
        [tailX + 3, tailY - 4],
        [tailX - 5, tailY - 1],
        [tailX - 3, tailY + 8],
        [tailX + 7, tailY + 6],
        [x - 12, y + 11],
        [x, y + 5],
      ],
      stroke
    );
    pxPoly(
      c,
      [
        [x - 5, y],
        [x - 16, y + 3],
        [tailX + 3, tailY - 2],
        [tailX - 3, tailY],
        [tailX - 1, tailY + 6],
        [tailX + 7, tailY + 4],
        [x - 12, y + 9],
        [x - 1, y + 4],
      ],
      gold
    );
    pxLine(c, tailX - 1, tailY, tailX + 8, tailY + 1, light, 2);
    pxOval(c, tailX + 3, tailY + 3, 3, 2, pink);
    pxOval(c, x - 15, y + 5, 3, 2, pink);
    // Second loose end creates the broad polka-dot scarf silhouette from the approved art.
    pxPoly(
      c,
      [
        [x - 8, y + 3],
        [x - 13, y + 3],
        [tailX + 5, tailY + 14],
        [tailX + 1, tailY + 15],
        [tailX + 3, tailY + 20],
        [tailX + 10, tailY + 18],
        [x - 9, y + 8],
      ],
      shade
    );
    pxPoly(
      c,
      [
        [x - 10, y + 4],
        [x - 12, y + 5],
        [tailX + 6, tailY + 15],
        [tailX + 3, tailY + 16],
        [tailX + 4, tailY + 18],
        [tailX + 8, tailY + 16],
        [x - 10, y + 7],
      ],
      gold
    );
    pxOval(c, tailX + 7, tailY + 13, 2, 2, pink);
    return;
  }
  // Narrow neck wrap follows the rotated neck; the muzzle remains clear.
  const width = side ? 10 : back ? 11 : 14;
  pxOval(c, x, y, width, 5, stroke);
  pxOval(c, x, y - 1, width - 1, 4, gold);
  pxLine(c, x - width + 3, y - 3, x + width - 3, y - 3, light, 1);
  pxLine(c, x - width + 3, y + 3, x + width - 3, y + 3, shade, 1);
  for (let dx = -width + 4; dx < width - 2; dx += 8) pxOval(c, x + dx, y, 2, 2, pink);
  const knotX = x + (back ? -7 : side ? -7 : -10),
    endX = knotX + (back ? -12 : -5) + sway,
    endY = y + (back ? 20 : 15) + weight;
  pxPoly(
    c,
    [
      [knotX - 3, y + 1],
      [knotX + 4, y + 1],
      [endX + 4, endY - 2],
      [endX, endY + 1],
      [endX - 4, endY - 2],
    ],
    stroke
  );
  pxPoly(
    c,
    [
      [knotX - 2, y + 2],
      [knotX + 2, y + 2],
      [endX + 2, endY - 3],
      [endX, endY - 1],
      [endX - 2, endY - 3],
    ],
    gold
  );
  pxLine(c, knotX - 1, y + 3, endX - 1, endY - 4, light, 1);
  for (const t of [0.25, 0.65])
    pxRect(c, knotX + (endX - knotX) * t - 1, y + 3 + (endY - y - 5) * t, 2, 2, pink);
  pxOval(c, knotX, y + 3, 3, 3, shade);
  pxOval(c, knotX - 1, y + 2, 2, 2, gold);
}
function paintDarren(
  c,
  dir,
  state,
  frame,
  weight = 0,
  scarf = true,
  motion = 0,
  attackTime = null
) {
  if (!darrenSourceImage) {
    c.save();
    c.translate(7, 13);
    c.scale(1.5, 1.5);
    paintDarrenFallback(c, dir, state, frame, weight, scarf);
    c.restore();
    return;
  }
  const extension = meleeAnimation(state) ? darrenStrikeExtension(state, attackTime, frame) : 0;
  let col = darrenPoseColumn(state, frame);
  if (['punch', 'cross', 'kick'].includes(state)) {
    const contact = state === 'punch' ? 3 : state === 'cross' ? 4 : 5;
    col =
      extension > 0.65
        ? contact
        : extension > 0.1
          ? state === 'kick'
            ? 1
            : state === 'punch'
              ? 4
              : 3
          : 0;
  }
  const row = DARREN_VIEW_ROWS[dir],
    pose = darrenPaintedPose(row, col, weight),
    phase = (frame / DARREN_STATES[state]) * TAU;
  const rollLegs =
    state === 'roll' ? darrenPaintedPose(row, [0, 1, 1, 0, 0, 2, 2, 0][frame], weight) : null;
  const moving = state === 'walk' || state === 'roll',
    soft = softMotion && !reduceMotion,
    melee = meleeAnimation(state),
    impulse = melee ? extension : 0;
  const step = moving ? Math.sin(phase) : 0,
    breath = soft && state === 'idle' ? Math.sin(phase) * 0.5 : 0;
  const bob = moving
    ? -Math.abs(step) * 1.4
    : state === 'special'
      ? -Math.sin((frame / 7) * Math.PI) * 4
      : 0;
  const shift = melee ? impulse * 1.5 : state === 'dodge' ? Math.sin((frame / 3) * Math.PI) * 3 : 0;
  c.save();
  c.imageSmoothingEnabled = true;
  if (DARREN_MIRROR[dir]) {
    c.translate(DARREN_FRAME_W, 0);
    c.scale(-1, 1);
  }
  c.translate(shift, bob);
  // Anticipation is anchored to the feet, never a scale change in head size.
  if (state === 'dodge') {
    c.translate(56, 116);
    c.transform(1, 0, row === 2 || row === 4 ? 0 : 0.13, 0.91, 0, 0);
    c.translate(-56, -116);
  } else if (state === 'hurt') {
    c.translate(56, 116);
    c.rotate(frame ? -0.025 : 0.045);
    c.translate(-56, -116);
  }
  if (scarf) paintDarrenScarf(c, row, state, phase, weight, true);
  // Coarse strips keep this cached motion inexpensive on phone/tablet canvas backends.
  for (let y = 0; y < DARREN_FRAME_H; y += 8) {
    const belly = Math.max(0, 1 - Math.pow((y + 4 - 91) / 20, 2));
    const wobble = soft
      ? Math.sin(phase - 1.4) * (weight * 0.45) * (moving || melee ? 1 : 0.25) * belly +
        motion * belly
      : 0;
    c.drawImage(
      rollLegs && y >= 104 ? rollLegs : pose,
      0,
      y * 2,
      DARREN_FRAME_W * 2,
      16,
      wobble,
      y + breath * belly,
      DARREN_FRAME_W,
      8
    );
  }
  if (scarf) {
    paintDarrenScarf(c, row, state, phase, weight, false);
    // Forward forearms pass in front of the accessory in authored contact poses.
    if ([3, 4, 6, 7].includes(col) && row < 3) {
      const handX = row === 2 ? 68 : 78,
        handY = row === 0 ? 65 : 77;
      c.drawImage(pose, handX * 2, handY * 2, (112 - handX) * 2, 40, handX, handY, 112 - handX, 20);
    }
  }
  if (state === 'charge') {
    const x = row === 2 ? 56 : row >= 3 ? 72 : 87,
      y = row === 0 ? 77 : 89,
      r = 4 + frame;
    pxOval(c, x, y, r + 1, r + 1, '#5488aa');
    pxOval(c, x, y - 1, r, r, '#e7f4f5');
    pxOval(c, x - 2, y - 3, Math.max(1, r - 3), 2, '#ffffff');
  }
  c.restore();
}
