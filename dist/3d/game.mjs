import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { World, Game, CAST, KITS, BELLY, MOVE_WIND, clamp } from './sim.mjs';
import { buildRig, Animator } from './anim.mjs';
import { buildClips } from './clips.mjs';

const $ = (id) => document.getElementById(id),
  canvas = $('view'),
  keys = new Set(),
  SAVE = 'snowday-3d-v1',
  // Settings and progress shared with the pixel game (../shared-save.js); null if it failed to load.
  shared = window.SnowdayShared ?? null;
let game,
  world,
  renderer,
  scene,
  camera,
  terrain,
  sun,
  ready = false,
  started = false,
  last = 0,
  accumulator = 0;
let cameraYaw = 0,
  cameraPitch = 0.38,
  cameraDistance = 8.5,
  toastTime = 0,
  dialogOpen = false,
  padPrevious = [],
  padPresent = false;
const heroes = [],
  rings = [],
  projectiles = [],
  cookies = [],
  posts = [],
  joystick = { x: 0, z: 0, id: null },
  cameraDrag = { id: null, x: 0, y: 0 };
if (shared?.sound() === false) $('sound').checked = false;
let audioContext,
  sound = $('sound').checked;
function tone(f = 330, d = 0.12, g = 0.035) {
  if (!sound || !audioContext || audioContext.state !== 'running') return;
  const o = audioContext.createOscillator(),
    v = audioContext.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(f, audioContext.currentTime);
  o.frequency.exponentialRampToValueAtTime(f * 0.55, audioContext.currentTime + d);
  v.gain.setValueAtTime(g, audioContext.currentTime);
  v.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + d);
  o.connect(v).connect(audioContext.destination);
  o.start();
  o.stop(audioContext.currentTime + d);
}
function unlockAudio() {
  try {
    audioContext ??= new (window.AudioContext || window.webkitAudioContext)();
    audioContext.resume().catch(() => {});
  } catch {
    sound = false;
  }
}
function toast(message) {
  $('toast').textContent = message;
  $('toast').classList.add('visible');
  toastTime = 3.5;
}
function save() {
  try {
    localStorage.setItem(SAVE, JSON.stringify(game.save()));
  } catch {
    toast('Progress cannot be saved in this browser session.');
  }
}
function clearInput() {
  keys.clear();
  pendingSwitch = null;
  joystick.x = joystick.z = 0;
  joystick.id = null;
  chargePointer = null;
  $('stick').firstElementChild.style.transform = '';
  cameraDrag.id = null;
  game?.cancelCharge();
}
function pause() {
  if (!ready || defeatOpen) return;
  clearInput();
  game.setPause(true);
  $('menu').hidden = false;
  $('play').textContent = 'Continue adventure';
  $('return-home').hidden = false;
  updateChapterButton();
  $('menu-copy').textContent =
    game.quest.chapter === 'firewood'
      ? 'Clear the trail, gather six bundles and carry them home to Mom.'
      : 'Follow the golden marker, beat the camp bosses, and bring Ruffy home.';
  $('mode').value = game.mode;
  save();
}
function resume() {
  if (!ready || defeatOpen) return;
  unlockAudio();
  clearInput();
  game.setPause(false);
  $('menu').hidden = true;
  $('hud').hidden = false;
  started = true;
  canvas.focus();
}
function closeDialogue() {
  dialogOpen = false;
  $('dialogue').hidden = true;
  clearInput();
  game.setPause(false);
}
$('play').onclick = resume;
$('pause').onclick = pause;
$('return-home').onclick = () => {
  game.home();
  resume();
  toast('Back at the cottage. Your quest progress is saved.');
};
// Firewood for Mom opens once Ruffy is home in this game or in the pixel game.
// Starting it early leaves the rescue unfinished, so the button then offers the way back.
function rescueDoneElsewhere() {
  return !!shared?.story().pixel.rescued;
}
function updateChapterButton() {
  const q = game.quest,
    back = q.chapter === 'firewood' && !q.home;
  $('firewood').textContent = back ? 'Back to Ruffy’s rescue' : 'Firewood for Mom';
  $('firewood').disabled = !(back || q.home || rescueDoneElsewhere());
}
$('firewood').onclick = () => {
  const q = game.quest;
  if (q.chapter === 'firewood' && !q.home) {
    game.chapter('rescue');
    resume();
    toast('Back to Ruffy’s rescue · follow the golden marker.');
    return;
  }
  if (!q.home && !rescueDoneElsewhere()) return;
  game.chapter('firewood');
  resume();
  toast('Firewood for Mom · follow the golden marker.');
};
$('dialogue-close').onclick = closeDialogue;
$('sound').onchange = () => {
  sound = $('sound').checked;
  shared?.setSound(sound);
  unlockAudio();
};
$('quality').onchange = () => setQuality();
$('fullscreen').onclick = () => {
  const p = document.fullscreenElement
    ? document.exitFullscreen()
    : document.documentElement.requestFullscreen?.();
  p?.catch(() => toast('Full screen is unavailable here.'));
};
document.querySelectorAll('[data-cast]').forEach(
  (b) =>
    (b.onclick = () => {
      if (!game.paused) requestSwitch(Number(b.dataset.cast));
    })
);
window.addEventListener('blur', () => {
  if (started && !game.paused && !dialogOpen) pause();
  else clearInput();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && started && !game.paused) pause();
});
const gameKeys = [
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'KeyJ',
  'KeyK',
  'Space',
  'ShiftLeft',
  'ShiftRight',
  'KeyE',
  'KeyL',
  'KeyQ',
  'KeyZ',
  'KeyX',
  'KeyC',
  'Digit1',
  'Digit2',
  'Digit3',
  'Escape',
];
window.addEventListener('keydown', (e) => {
  if (!ready) return;
  if (gameKeys.includes(e.code) && e.target.tagName !== 'SELECT') e.preventDefault();
  if (e.repeat) return;
  if (defeatOpen) {
    if (e.code === 'Enter' && e.target.tagName !== 'BUTTON') retry();
    return;
  }
  if (e.code === 'Escape') {
    if (cancelBind()) return;
    if (dialogOpen) closeDialogue();
    else if (game.paused) resume();
    else pause();
    return;
  }
  if (e.code === 'Enter' && game.paused) {
    if (dialogOpen) closeDialogue();
    else resume();
    return;
  }
  if (game.paused) return;
  keys.add(e.code);
  if (e.code === 'KeyJ') game.attack();
  if (e.code === 'KeyK') game.chargeStart();
  if (e.code === 'Space') game.jump();
  if (e.code.startsWith('Shift')) game.dodge();
  if (e.code === 'KeyE') game.interact();
  if (e.code === 'KeyL') game.special();
  if (e.code === 'KeyQ') swapStyle();
  if (e.code === 'KeyC') cameraYaw = game.player.yaw + Math.PI;
  if (e.code.startsWith('Digit')) requestSwitch(Number(e.code.slice(-1)) - 1);
});
window.addEventListener('keyup', (e) => {
  keys.delete(e.code);
  if (e.code === 'KeyK') game?.chargeRelease();
});
function touchMode() {
  document.body.classList.add('touch-device');
}
if (matchMedia('(pointer: coarse)').matches) touchMode();
const stick = $('stick');
stick.onpointerdown = (e) => {
  if (game?.paused || joystick.id !== null) return;
  touchMode();
  joystick.id = e.pointerId;
  stick.setPointerCapture(e.pointerId);
  moveStick(e);
};
function moveStick(e) {
  if (e.pointerId !== joystick.id) return;
  const r = stick.getBoundingClientRect(),
    x = e.clientX - r.left - r.width / 2,
    z = e.clientY - r.top - r.height / 2,
    n = Math.max(r.width * 0.34, Math.hypot(x, z));
  joystick.x = x / n;
  joystick.z = z / n;
  stick.firstElementChild.style.transform = `translate(${joystick.x * 34}px,${joystick.z * 34}px)`;
}
stick.onpointermove = moveStick;
stick.onpointerup =
  stick.onpointercancel =
  stick.onlostpointercapture =
    (e) => {
      if (joystick.id === e.pointerId) {
        joystick.id = null;
        joystick.x = joystick.z = 0;
        stick.firstElementChild.style.transform = '';
      }
    };
for (const [id, method] of [
  ['special', 'special'],
  ['style', 'switchStyle'],
  ['attack', 'attack'],
  ['jump', 'jump'],
  ['dodge', 'dodge'],
  ['interact', 'interact'],
])
  $('touch-' + id).onpointerdown = (e) => {
    e.preventDefault();
    if (!game?.paused) game[method]();
  };
let chargePointer = null;
const chargeButton = $('touch-charge');
chargeButton.onpointerdown = (e) => {
  e.preventDefault();
  if (chargePointer !== null || game?.paused) return;
  chargePointer = e.pointerId;
  chargeButton.setPointerCapture(e.pointerId);
  game.chargeStart();
};
chargeButton.onpointerup = (e) => {
  if (e.pointerId === chargePointer) {
    chargePointer = null;
    game.chargeRelease();
  }
};
chargeButton.onpointercancel = chargeButton.onlostpointercapture = (e) => {
  if (e.pointerId === chargePointer) {
    chargePointer = null;
    game.cancelCharge();
  }
};
canvas.onpointerdown = (e) => {
  if (game?.paused || cameraDrag.id !== null) return;
  if (e.pointerType === 'touch') touchMode();
  cameraDrag.id = e.pointerId;
  cameraDrag.x = e.clientX;
  cameraDrag.y = e.clientY;
  canvas.setPointerCapture(e.pointerId);
};
canvas.onpointermove = (e) => {
  if (e.pointerId !== cameraDrag.id) return;
  cameraYaw -= (e.clientX - cameraDrag.x) * 0.005;
  cameraPitch = clamp(cameraPitch + (e.clientY - cameraDrag.y) * 0.004, 0.12, 1.05);
  cameraDrag.x = e.clientX;
  cameraDrag.y = e.clientY;
};
canvas.onpointerup =
  canvas.onpointercancel =
  canvas.onlostpointercapture =
    (e) => {
      if (e.pointerId === cameraDrag.id) cameraDrag.id = null;
    };
canvas.oncontextmenu = (e) => e.preventDefault();
canvas.onwheel = (e) => {
  e.preventDefault();
  cameraDistance = clamp(cameraDistance + e.deltaY * 0.008, 4.5, 13);
};
const PAD_SAVE = 'snowday-3d-controls-v1',
  PAD_DEFAULTS = {
    jump: 0,
    dodge: 1,
    combo: 2,
    charge: 3,
    switch: 4,
    interact: 5,
    style: 6,
    special: 7,
    pause: 9,
  },
  PAD_LABELS = {
    combo: 'Combo',
    charge: 'Hold charge',
    jump: 'Jump',
    dodge: 'Dodge',
    interact: 'Talk / gather',
    switch: 'Next hero',
    special: 'Special',
    style: 'Paws / Scarf',
    pause: 'Pause',
  };
let padBindings = { ...PAD_DEFAULTS },
  awaitBind = null,
  pendingSwitch = null;
try {
  const saved = JSON.parse(localStorage.getItem(PAD_SAVE) || 'null');
  if (
    saved &&
    typeof saved === 'object' &&
    Object.entries(saved).every(
      ([k, v]) => k in PAD_DEFAULTS && Number.isInteger(v) && v >= 0 && v < 32
    )
  )
    padBindings = { ...PAD_DEFAULTS, ...saved };
} catch {}
// Combo, dodge and pause buttons chosen in either game carry over.
const SHARED_BUTTON_NAMES = { attack: 'combo', dodge: 'dodge', pause: 'pause' };
shared?.applyButtons(padBindings, SHARED_BUTTON_NAMES);
function rememberSharedButtons(...actions) {
  const choices = {};
  for (const [name, own] of Object.entries(SHARED_BUTTON_NAMES))
    if (actions.includes(own)) choices[name] = padBindings[own];
  shared?.rememberButtons(choices);
}
function buttonName(i) {
  return (
    [
      'A / ×',
      'B / ○',
      'X / □',
      'Y / △',
      'LB / L1',
      'RB / R1',
      'LT / L2',
      'RT / R2',
      'View / Share',
      'Start / Options',
      'L stick press',
      'R stick press',
      'D-pad ↑',
      'D-pad ↓',
      'D-pad ←',
      'D-pad →',
      'Home',
    ][i] || 'Button ' + i
  );
}
function padStatus(text) {
  $('pad-status').textContent = text;
}
function showBindings() {
  for (const b of document.querySelectorAll('[data-bind]')) {
    const k = b.dataset.bind;
    b.querySelector('b').textContent = buttonName(padBindings[k]);
    b.classList.toggle('waiting', awaitBind === k);
  }
  const n = (k) => buttonName(padBindings[k]).split(' / ')[0];
  $('pad-help').textContent =
    `Controller: ${n('combo')} combo · hold ${n('charge')} charge · ${n('jump')} jump · ${n('dodge')} dodge · ${n('interact')} interact · ${n('special')} special · ${n('style')} Darren's style · ${n('switch')} next hero`;
}
function saveBindings() {
  try {
    localStorage.setItem(PAD_SAVE, JSON.stringify(padBindings));
  } catch {}
  showBindings();
}
function bindTo(index) {
  const action = awaitBind;
  awaitBind = null;
  const other = Object.keys(padBindings).find((k) => k !== action && padBindings[k] === index);
  if (other) padBindings[other] = padBindings[action];
  padBindings[action] = index;
  saveBindings();
  rememberSharedButtons(action, other);
  padStatus(
    `${PAD_LABELS[action]} is now ${buttonName(index)}.` +
      (other ? ` ${PAD_LABELS[other]} moved to ${buttonName(padBindings[other])}.` : '')
  );
}
function cancelBind() {
  if (awaitBind === null) return false;
  awaitBind = null;
  showBindings();
  padStatus('Change cancelled.');
  return true;
}
document.querySelectorAll('[data-bind]').forEach(
  (b) =>
    (b.onclick = () => {
      awaitBind = b.dataset.bind;
      showBindings();
      padStatus(
        `Press the controller button you want for ${PAD_LABELS[awaitBind]}. Start / Options or Escape cancels.`
      );
    })
);
$('pad-reset').onclick = () => {
  awaitBind = null;
  padBindings = { ...PAD_DEFAULTS };
  saveBindings();
  shared?.forgetButtons();
  padStatus('Standard controller buttons restored.');
};
function swapStyle() {
  if (game.selected !== 0) toast('Only Darren swaps styles: Bare Paws or the Polka Scarf.');
  else game.switchStyle();
}
function requestSwitch(i) {
  if (game.actors[i]?.down) {
    toast(`${CAST[i]} is resting. A cookie or a cleared camp gets them back up.`);
    pendingSwitch = null;
    return;
  }
  if (game.switchTo(i)) pendingSwitch = null;
  else if (i !== game.selected) pendingSwitch = i;
}
function menuFocus(step) {
  const items = [
    ...document.querySelectorAll(
      defeatOpen
        ? '#defeat button'
        : dialogOpen
          ? '#dialogue button'
          : '#menu button:not([disabled]),#menu summary,#menu select,#menu input,#menu a'
    ),
  ].filter((e) => e.offsetParent !== null);
  if (!items.length) return;
  const i = items.indexOf(document.activeElement);
  items[(i + step + items.length) % items.length].focus();
}
function padInput(dt) {
  const pad = Array.from(navigator.getGamepads?.() || []).find((p) => p?.connected);
  if (!pad) {
    if (padPresent && !game.paused) pause();
    if (padPresent && awaitBind !== null) cancelBind();
    padPresent = false;
    padPrevious = [];
    return { x: 0, z: 0 };
  }
  if (!padPresent) padStatus(`${pad.id.replace(/\s*\(.*$/, '') || 'Controller'} connected.`);
  padPresent = true;
  const pressed = pad.buttons.map((b) => b.pressed),
    edge = (i) => pressed[i] && !padPrevious[i],
    B = padBindings,
    dead = (v) => (Math.abs(v) < 0.18 ? 0 : ((Math.abs(v) - 0.18) / 0.82) * Math.sign(v));
  if (awaitBind !== null) {
    const index = pressed.findIndex((p, i) => p && !padPrevious[i]);
    if (index === 9) cancelBind();
    else if (index >= 0) bindTo(index);
    padPrevious = pressed;
    return { x: 0, z: 0 };
  }
  if (defeatOpen) {
    if (edge(12)) menuFocus(-1);
    if (edge(13)) menuFocus(1);
    if (edge(0) || edge(9)) {
      const f = document.activeElement;
      if ($('defeat').contains(f)) f.click();
      else retry();
    }
  } else if (edge(9) || (B.pause !== 9 && edge(B.pause))) {
    if (dialogOpen) closeDialogue();
    else if (game.paused) resume();
    else pause();
  } else if (game.paused) {
    if (edge(12)) menuFocus(-1);
    if (edge(13)) menuFocus(1);
    if (edge(0)) {
      const f = document.activeElement;
      if (dialogOpen) closeDialogue();
      else if (f && f !== canvas && $('menu').contains(f)) {
        if (f.tagName === 'SELECT') {
          f.selectedIndex = (f.selectedIndex + 1) % f.options.length;
          f.dispatchEvent(new Event('change'));
        } else f.click();
      } else resume();
    }
    if (edge(1) && !dialogOpen) resume();
  } else {
    if (edge(B.combo)) game.attack();
    if (edge(B.charge)) game.chargeStart();
    if (!pressed[B.charge] && padPrevious[B.charge]) game.chargeRelease();
    if (edge(B.jump)) game.jump();
    if (edge(B.dodge)) game.dodge();
    if (edge(B.interact)) game.interact();
    if (edge(B.special)) game.special();
    if (edge(B.style)) swapStyle();
    if (edge(B.switch)) {
      const from = pendingSwitch ?? game.selected,
        next = [1, 2].map((k) => (from + k) % 3).find((i) => !game.actors[i].down);
      if (next !== undefined) requestSwitch(next);
    }
    cameraYaw -= dead(pad.axes[2] || 0) * dt * 2;
    cameraPitch = clamp(cameraPitch + dead(pad.axes[3] || 0) * dt, 0.12, 1.05);
  }
  padPrevious = pressed;
  return { x: dead(pad.axes[0] || 0), z: dead(pad.axes[1] || 0) };
}

function mesh(geo, color, parent = scene) {
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 0.82 }));
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}
function sphere(parent, color, x, y, z, sx, sy = sx, sz = sx) {
  const m = mesh(new THREE.SphereGeometry(1, 12, 8), color, parent);
  m.position.set(x, y, z);
  m.scale.set(sx, sy, sz);
  return m;
}
let ruffy,
  marker,
  selectedRing,
  mapBackground,
  mapCtx,
  shadowMeshes = [];
function createDetails() {
  for (const t of game.targets) {
    const group = new THREE.Group();
    scene.add(group);
    group.position.set(t.x, t.y, t.z);
    const pole = mesh(new THREE.CylinderGeometry(0.15, 0.2, 1.6, 8), 0x735033, group);
    pole.position.y = 0.8;
    const target = mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.12, 20), 0xefcc87, group);
    target.rotation.x = Math.PI / 2;
    target.position.set(0, 1.25, 0.06);
    const bull = mesh(new THREE.TorusGeometry(0.28, 0.045, 6, 20), 0xae5546, group);
    bull.position.set(0, 1.25, 0.13);
    posts.push({ group, target });
  }
  for (const p of game.cookieSpots) {
    const m = mesh(new THREE.CylinderGeometry(0.23, 0.23, 0.09, 12), 0xbb752b);
    m.position.set(p.x, world.height(p.x, p.z) + 0.4, p.z);
    cookies.push(m);
  }
  for (const p of world.data.WOOD_SITES) {
    const group = new THREE.Group();
    scene.add(group);
    group.position.set(p.x * 0.04, world.height(p.x * 0.04, p.y * 0.04), p.y * 0.04);
    for (let i = 0; i < 4; i++) {
      const log = mesh(new THREE.CylinderGeometry(0.1, 0.12, 1.1, 8), 0x805636, group);
      log.rotation.z = Math.PI / 2;
      log.rotation.y = i * 0.27;
      log.position.set(0, 0.12 + i * 0.14, 0);
    }
  }
  ruffy = new THREE.Group();
  scene.add(ruffy);
  sphere(ruffy, 0xd9e5f3, 0, 0.42, 0, 0.28, 0.28, 0.43);
  sphere(ruffy, 0xf0f2ed, 0, 0.68, 0.35, 0.27);
  sphere(ruffy, 0x4e7294, -0.23, 0.61, 0.3, 0.1, 0.23, 0.12);
  sphere(ruffy, 0x4e7294, 0.23, 0.61, 0.3, 0.1, 0.23, 0.12);
  sphere(ruffy, 0x26333e, 0, 0.65, 0.58, 0.06);
  for (const x of [-0.17, 0.17]) {
    sphere(ruffy, 0x25313a, x * 0.6, 0.75, 0.57, 0.035);
    for (const z of [-0.22, 0.25]) sphere(ruffy, 0xceddeb, x, 0.17, z, 0.1, 0.17, 0.1);
  }
  sphere(ruffy, 0xceddeb, 0, 0.61, -0.42, 0.1, 0.22, 0.12);
  const collar = mesh(new THREE.TorusGeometry(0.2, 0.035, 6, 16), 0xbc4b43, ruffy);
  collar.rotation.x = Math.PI / 2;
  collar.position.set(0, 0.55, 0.25);
  ruffy.position.set(129.6, world.height(129.6, 53.2), 53.2);
  marker = mesh(new THREE.OctahedronGeometry(0.32), 0xffdc78);
  marker.material.emissive.setHex(0x79602a);
  selectedRing = new THREE.Mesh(
    new THREE.RingGeometry(0.65, 0.72, 48),
    new THREE.MeshBasicMaterial({
      color: 0xffdf8a,
      transparent: true,
      opacity: 0.7,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
  );
  selectedRing.rotation.x = -Math.PI / 2;
  scene.add(selectedRing);
  mapCtx = $('minimap').getContext('2d');
  mapBackground = document.createElement('canvas');
  mapBackground.width = 220;
  mapBackground.height = 164;
  const ctx = mapBackground.getContext('2d');
  ctx.fillStyle = '#a5b9b6';
  ctx.fillRect(0, 0, 220, 164);
  for (const p of world.data.samples) {
    ctx.fillStyle =
      p[3] === 2 ? '#548391' : p[2] > 200 ? '#d8ddc9' : p[2] > 80 ? '#b9cdc5' : '#94b3b0';
    ctx.fillRect((p[0] / 3600) * 220, (p[1] / 2600) * 164, 2, 2);
  }
  for (const p of world.props) {
    ctx.fillStyle = '#577768';
    ctx.beginPath();
    ctx.arc((p.x / world.w) * 220, (p.z / world.d) * 164, 1.7, 0, Math.PI * 2);
    ctx.fill();
  }
}
function ring(e) {
  const m = new THREE.Mesh(
    new THREE.RingGeometry(0.85, 1, 40),
    new THREE.MeshBasicMaterial({
      color: e.color ?? (e.type === 'hit' ? 0xffffff : KITS[e.actor ?? game.selected].color),
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
  );
  m.rotation.x = -Math.PI / 2;
  m.position.set(e.x, e.y + 0.07, e.z);
  scene.add(m);
  rings.push({ m, life: 0.55, max: 0.55, r: e.r || 1.2 });
}
function events() {
  for (const e of game.events.splice(0)) {
    if (e.type === 'save') save();
    if (e.type === 'swing') {
      ring(e);
      tone(e.strong ? 100 : 220, 0.2);
    }
    if (e.type === 'hit') {
      ring(e);
      tone(660, 0.08);
    }
    if (e.type === 'snowburst') ring(e);
    if (e.type === 'throw') tone(380, 0.2);
    if (e.type === 'hitstop') hitstop = Math.max(hitstop, e.t);
    if (e.type === 'special') {
      banner(e.name, 'SPECIAL');
      tone(196, 0.5, 0.06);
      shake = Math.max(shake, 0.25);
    }
    if (e.type === 'style') {
      toast(`Darren: ${e.name}`);
      tone(520, 0.15);
    }
    if (e.type === 'cookie') {
      tone(880, 0.18);
      toast(
        `Snowday cookie! +${e.heal} health · ${game.cookies} cookie${game.cookies === 1 ? '' : 's'}`
      );
      const a = game.player;
      floater(a.x, a.y + 2, a.z, '+' + e.heal, 'heal');
    }
    if (e.type === 'hit' && e.damage)
      floater(e.x, e.y + 0.3, e.z, String(e.damage), e.power > 1 ? 'heavy' : '');
    if (e.type === 'hurt') {
      if (heroes[e.actor]) heroes[e.actor].hurt = e.angle ?? null;
      tone(140, 0.22, 0.06);
      hurtFlash();
      shake = 0.3;
      floater(e.x, e.y + 0.4, e.z, '-' + e.damage, 'ouch');
    }
    if (e.type === 'slam') {
      ring({ ...e, color: 0xffffff });
      tone(70, 0.35, 0.07);
      shake = Math.max(shake, 0.2);
    }
    if (e.type === 'tell') tone(240, 0.1, 0.03);
    if (e.type === 'ko') tone(e.boss ? 120 : 520, 0.12, 0.03);
    if (e.type === 'orb') {
      tone(990, 0.14);
      toast('Energy +30');
    }
    if (e.type === 'banner' || e.type === 'belly') {
      banner(e.title, e.text);
      tone(660, 0.3);
    }
    if (e.type === 'down') toast(`${e.name} needs a rest. ${e.next} steps in!`);
    if (e.type === 'bossDown') {
      banner(e.title, e.text);
      tone(523, 0.5, 0.05);
    }
    if (e.type === 'boss') {
      banner(e.name.toUpperCase(), e.final ? 'FINAL BATTLE' : 'BOSS BATTLE');
      tone(98, 0.6, 0.06);
      dialogOpen = true;
      clearInput();
      game.setPause(true);
      $('dialogue-copy').textContent = e.text;
      $('dialogue').hidden = false;
      $('dialogue-close').focus();
    }
    if (e.type === 'defeat') showDefeat();
    if (e.type === 'dialogue') {
      dialogOpen = true;
      clearInput();
      game.setPause(true);
      $('dialogue-copy').textContent = e.text;
      $('dialogue').hidden = false;
      $('dialogue-close').focus();
    }
  }
}
// ---- Enemies, bosses, pickups and boss warnings (Claude update 2). Built from simple shapes, like the practice posts. ----
const GEO = {
  sphere: new THREE.SphereGeometry(1, 14, 10),
  half: new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2),
  cone: new THREE.ConeGeometry(1, 1, 8),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 16),
  box: new THREE.BoxGeometry(1, 1, 1),
  torus: new THREE.TorusGeometry(1, 0.08, 6, 24),
  ico: new THREE.IcosahedronGeometry(1, 1),
  bar: new THREE.PlaneGeometry(1, 1),
};
function part(parent, geo, color, x = 0, y = 0, z = 0, sx = 1, sy = sx, sz = sx) {
  const m = mesh(GEO[geo], color, parent);
  m.position.set(x, y, z);
  m.scale.set(sx, sy, sz);
  return m;
}
function eyes(parent, y, z, spread, size = 0.07) {
  for (const s of [-1, 1]) {
    part(parent, 'sphere', 0xffffff, s * spread, y, z, size * 1.5);
    part(parent, 'sphere', 0x1d2329, s * spread, y, z + size * 0.9, size * 0.8);
  }
}
const FOE_ART = {
  gopher(b) {
    part(b, 'sphere', 0xa8743f, 0, 0.5, 0, 0.42, 0.5, 0.4);
    part(b, 'sphere', 0xe0c08f, 0, 0.45, 0.22, 0.3, 0.36, 0.2);
    part(b, 'sphere', 0xa8743f, 0, 1, 0.08, 0.3);
    for (const s of [-1, 1]) {
      part(b, 'sphere', 0x7d5430, s * 0.2, 1.24, 0, 0.09);
      part(b, 'sphere', 0x7d5430, s * 0.2, 0.1, 0.12, 0.12, 0.08, 0.16);
    }
    eyes(b, 1.07, 0.3, 0.11, 0.05);
    part(b, 'sphere', 0xd77a7a, 0, 0.98, 0.37, 0.06);
    part(b, 'box', 0xffffff, 0, 0.86, 0.36, 0.1, 0.08, 0.03);
  },
  crow(b, o) {
    b.position.y = 0.6;
    part(b, 'sphere', 0x2c2f3d, 0, 0.4, 0, 0.3, 0.28, 0.45);
    part(b, 'sphere', 0x2c2f3d, 0, 0.65, 0.35, 0.2);
    const beak = part(b, 'cone', 0xf0a63a, 0, 0.62, 0.6, 0.07, 0.22, 0.07);
    beak.rotation.x = Math.PI / 2;
    eyes(b, 0.72, 0.5, 0.09, 0.04);
    part(b, 'box', 0x23252f, 0, 0.42, -0.5, 0.25, 0.04, 0.3);
    o.wings = [-1, 1].map((s) => {
      const w = new THREE.Group();
      b.add(w);
      w.position.set(s * 0.25, 0.48, 0);
      part(w, 'box', 0x23252f, s * 0.32, 0, 0, 0.6, 0.04, 0.32);
      return w;
    });
  },
  bale(b) {
    part(b, 'cyl', 0xd8b45a, 0, 0.55, 0, 0.6, 1.1, 0.6);
    for (const y of [0.3, 0.8]) {
      const t = part(b, 'torus', 0x9c6b2f, 0, y, 0, 0.61);
      t.rotation.x = Math.PI / 2;
    }
    for (let i = 0; i < 5; i++) {
      const c = part(
        b,
        'cone',
        0xe9cf7f,
        Math.sin(i * 1.3) * 0.3,
        1.18,
        Math.cos(i * 1.3) * 0.3,
        0.08,
        0.25,
        0.08
      );
      c.rotation.z = Math.sin(i) * 0.4;
    }
    eyes(b, 0.62, 0.57, 0.17, 0.08);
    part(b, 'box', 0x5a3a1a, -0.17, 0.78, 0.6, 0.18, 0.04, 0.03).rotation.z = -0.4;
    part(b, 'box', 0x5a3a1a, 0.17, 0.78, 0.6, 0.18, 0.04, 0.03).rotation.z = 0.4;
  },
  spud(b) {
    part(b, 'sphere', 0xc49a5e, 0, 1.3, 0, 1.05, 1.3, 0.95);
    for (let i = 0; i < 7; i++)
      part(
        b,
        'sphere',
        0x8e6a3d,
        Math.sin(i * 2.4) * 0.75,
        0.8 + i * 0.18,
        Math.cos(i * 2.4) * 0.65,
        0.09
      );
    part(b, 'half', 0x5f7a3c, 0, 2.3, 0, 0.85, 0.6, 0.85);
    const brim = part(b, 'cyl', 0x4f6832, 0, 2.3, 0.1, 0.95, 0.06, 0.95);
    brim.rotation.x = 0.08;
    eyes(b, 1.8, 0.82, 0.28, 0.12);
    for (const s of [-1, 1]) {
      part(b, 'sphere', 0x4b3320, s * 0.2, 1.5, 0.9, 0.24, 0.08, 0.1);
      part(b, 'sphere', 0xc49a5e, s * 1.05, 1.1, 0.1, 0.22, 0.32, 0.22);
      part(b, 'sphere', 0x7d5430, s * 0.45, 0.08, 0.15, 0.3, 0.12, 0.42);
    }
  },
  weed(b, o) {
    const ball = new THREE.Group();
    b.add(ball);
    ball.position.y = 1.35;
    o.spin = ball;
    for (let k = 0; k < 2; k++) {
      const w = mesh(GEO.ico, 0xc9a35a, ball);
      w.material.wireframe = true;
      w.scale.setScalar(1.3 - k * 0.18);
      w.rotation.set(k * 0.7, k * 1.1, 0);
    }
    const core = mesh(GEO.sphere, 0x9d7b3f, ball);
    core.scale.setScalar(0.85);
    core.material.transparent = true;
    core.material.opacity = 0.55;
    part(b, 'cyl', 0xd96a8a, 0, 2.85, 0, 0.42, 0.45, 0.42);
    part(b, 'cyl', 0xd96a8a, 0, 2.64, 0, 0.75, 0.05, 0.75);
    part(b, 'sphere', 0xffe08a, 0.38, 2.8, 0.2, 0.12);
    eyes(b, 1.65, 1.15, 0.3, 0.12);
  },
  cluck(b) {
    part(b, 'sphere', 0xf3efe6, 0, 1.2, 0, 1.05, 1, 1.25);
    part(b, 'sphere', 0xf3efe6, 0, 2.25, 0.55, 0.6);
    for (let i = 0; i < 3; i++)
      part(b, 'sphere', 0xd8392b, 0, 2.85 + Math.sin(i) * 0.05, 0.3 + i * 0.25, 0.17);
    const beak = part(b, 'cone', 0xf2b630, 0, 2.2, 1.2, 0.16, 0.4, 0.16);
    beak.rotation.x = Math.PI / 2;
    part(b, 'sphere', 0xd8392b, 0, 1.9, 1.05, 0.12, 0.2, 0.1);
    eyes(b, 2.4, 1.05, 0.24, 0.09);
    part(b, 'cyl', 0x4e6a3a, 0, 2.82, 0.5, 0.45, 0.22, 0.45);
    part(b, 'box', 0x3f5a2e, 0, 2.75, 0.95, 0.55, 0.05, 0.35);
    for (const s of [-1, 1]) {
      part(b, 'sphere', 0xe4ddd0, s * 1, 1.25, -0.1, 0.25, 0.55, 0.75);
      part(b, 'cyl', 0xe39a2a, s * 0.4, 0.2, 0, 0.07, 0.5, 0.07);
    }
    for (let i = 0; i < 3; i++) {
      const f = part(b, 'sphere', 0xe8e2d6, (i - 1) * 0.25, 1.8, -1.15, 0.15, 0.45, 0.15);
      f.rotation.x = -0.5;
    }
  },
  baron(b, o) {
    part(b, 'sphere', 0x24401f, 0, 2.1, 0, 1.4);
    for (let i = 0; i < 11; i++) {
      const a = (i / 11) * Math.PI * 2;
      part(
        b,
        'sphere',
        i % 2 ? 0x2f5a2a : 0x3e6b33,
        Math.cos(a) * 1.2,
        2.2 + Math.sin(a) * 1.2,
        Math.sin(a * 2) * 0.4,
        0.85 + (i % 3) * 0.12
      );
    }
    for (let i = 0; i < 22; i++) {
      const a = i * 2.4,
        y = 1 + (((i * 7) % 11) / 11) * 2.6,
        r = 1.55,
        t = part(b, 'cone', 0x6d4a2b, Math.sin(a) * r, y, Math.cos(a) * r, 0.12, 0.5, 0.12);
      t.lookAt(Math.sin(a) * 9, y, Math.cos(a) * 9);
      t.rotateX(Math.PI / 2);
    }
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2,
        c = part(b, 'cone', 0x5b3c22, Math.sin(a) * 0.6, 3.6, Math.cos(a) * 0.6, 0.12, 0.55, 0.12);
      c.rotation.z = Math.sin(a) * 0.3;
    }
    o.glow = [-1, 1].map((s) => {
      const e = part(b, 'sphere', 0xc86bff, s * 0.45, 2.6, 1.3, 0.16);
      e.material.emissive.setHex(0x8a2fd0);
      return e;
    });
    for (const s of [-1, 1]) part(b, 'sphere', 0x2b4a24, s * 0.8, 0.35, 0, 0.45, 0.35, 0.6);
  },
};
const foeViews = new Map(),
  pickupViews = new Map(),
  thornPool = [],
  eggPool = [],
  tells = new Map();
function foeView(e) {
  const root = new THREE.Group(),
    body = new THREE.Group();
  root.add(body);
  scene.add(root);
  const o = { root, body, mats: [] };
  FOE_ART[e.type](body, o);
  body.traverse((m) => {
    if (m.isMesh) {
      o.mats.push(m.material);
      m.castShadow = $('quality').value === 'high';
    }
  });
  if (!e.boss) {
    o.bar = new THREE.Group();
    root.add(o.bar);
    o.bar.position.y = e.type === 'crow' ? 1.75 : e.type === 'bale' ? 1.65 : 1.55;
    const bg = new THREE.Mesh(
      GEO.bar,
      new THREE.MeshBasicMaterial({
        color: 0x10202c,
        transparent: true,
        opacity: 0.75,
        depthWrite: false,
      })
    );
    bg.scale.set(0.9, 0.12, 1);
    o.bar.add(bg);
    o.fill = new THREE.Mesh(
      GEO.bar,
      new THREE.MeshBasicMaterial({ color: 0xef6a5d, depthWrite: false })
    );
    o.fill.position.z = 0.01;
    o.fill.scale.set(0.86, 0.08, 1);
    o.bar.add(o.fill);
    o.bar.visible = false;
  }
  foeViews.set(e.id, o);
  return o;
}
function dropView(o) {
  scene.remove(o.root);
  for (const m of o.mats) m.dispose();
  if (o.bar)
    o.bar.traverse((m) => {
      if (m.isMesh) m.material.dispose();
    });
}
function tellView(e) {
  const color = 0xeb5475,
    group = new THREE.Group(),
    mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.25,
      side: THREE.DoubleSide,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
    });
  let geo;
  if (e.move === 'charge') {
    geo = new THREE.PlaneGeometry(e.r * 1.6, 19);
    const m = new THREE.Mesh(geo, mat);
    m.rotation.x = -Math.PI / 2;
    m.position.z = 9.5;
    group.add(m);
  } else if (e.move === 'swipe') {
    const arc = 2.4;
    geo = new THREE.CircleGeometry(e.r + 3.4, 32, -Math.PI / 2 - arc / 2, arc);
    const m = new THREE.Mesh(geo, mat);
    m.rotation.x = -Math.PI / 2;
    group.add(m);
  } else {
    const r = e.move === 'slam' ? game.slamRadius(e) : e.r + 1.5;
    geo =
      e.move === 'slam' ? new THREE.CircleGeometry(r, 48) : new THREE.RingGeometry(r - 0.4, r, 48);
    const m = new THREE.Mesh(geo, mat);
    m.rotation.x = -Math.PI / 2;
    group.add(m);
  }
  if (e.move === 'slam' || e.move === 'thorns') {
    const r = e.move === 'slam' ? game.slamRadius(e) : e.r + 1.5,
      edge = new THREE.Mesh(
        new THREE.RingGeometry(1, 1.06, 48),
        new THREE.MeshBasicMaterial({
          color: 0xd64e76,
          transparent: true,
          opacity: 0.8,
          side: THREE.DoubleSide,
          depthWrite: false,
        })
      );
    edge.scale.setScalar(r);
    edge.rotation.x = -Math.PI / 2;
    group.add(edge);
  }
  scene.add(group);
  return { group, mat, geo, move: e.move };
}
function removeTell(id) {
  const t = tells.get(id);
  if (!t) return;
  scene.remove(t.group);
  t.group.traverse((m) => {
    if (m.isMesh) {
      m.geometry !== GEO.bar && m.geometry.dispose();
      m.material.dispose();
    }
  });
  tells.delete(id);
}
function updateFoes(dt) {
  const seen = new Set();
  for (const e of game.enemies) {
    seen.add(e.id);
    const o = foeViews.get(e.id) || foeView(e);
    o.root.position.set(e.x, e.y, e.z);
    o.root.rotation.y = e.yaw;
    const t = e.t;
    let sy = 1,
      tilt = 0;
    if (e.dead) {
      const k = e.fly.t;
      o.body.rotation.x = k * e.fly.spin * 0.4;
      o.body.rotation.z = k * e.fly.spin * 0.25;
      o.root.scale.setScalar(Math.max(0.01, 1 - Math.max(0, k - (e.boss ? 1 : 0.5)) / 0.4));
    } else {
      if (e.moving)
        o.body.position.y = Math.abs(Math.sin(t * (e.boss ? 6 : 11))) * (e.boss ? 0.12 : 0.08);
      if (e.state === 'wind') {
        sy = 0.9 + Math.sin(t * 30) * 0.03;
        tilt = -0.15;
      } else if (e.state === 'rec') tilt = 0.12;
      else if (e.state === 'hurt') tilt = 0.2;
      o.body.scale.set(1 / Math.sqrt(sy), sy, 1 / Math.sqrt(sy));
      o.body.rotation.x = tilt;
    }
    if (o.wings) o.wings.forEach((w, i) => (w.rotation.z = (i ? -1 : 1) * Math.sin(t * 14) * 0.6));
    if (o.spin) o.spin.rotation.x += dt * (e.state === 'charge' ? 14 : e.moving ? 5 : 1);
    if (o.glow) for (const g of o.glow) g.material.emissiveIntensity = e.state === 'wind' ? 2.5 : 1;
    const f = e.flash > 0 ? 0.7 : e.boss && e.state === 'wind' ? 0.25 + 0.2 * Math.sin(t * 25) : 0;
    for (const m of o.mats)
      if (m.emissive && !(o.glow && o.glow.some((g) => g.material === m)))
        e.flash > 0 ? m.emissive.setRGB(f, f, f) : m.emissive.setRGB(f, 0, f * 0.2);
    if (o.bar) {
      o.bar.visible = !e.dead && e.hp < e.max;
      o.fill.scale.x = 0.86 * Math.max(0, e.hp / e.max);
      o.fill.position.x = -0.43 * (1 - Math.max(0, e.hp / e.max));
      o.bar.quaternion.copy(camera.quaternion);
      o.bar.quaternion.premultiply(o.root.quaternion.clone().invert());
    }
    if (e.boss && e.state === 'wind' && !e.dead) {
      let tv = tells.get(e.id);
      if (tv && tv.move !== e.move) {
        removeTell(e.id);
        tv = null;
      }
      if (!tv) {
        tv = tellView(e);
        tells.set(e.id, tv);
      }
      tv.group.position.set(e.x, e.y + 0.08, e.z);
      tv.group.rotation.y = e.cdir;
      tv.mat.opacity = 0.18 + 0.32 * clamp(1 - e.st / MOVE_WIND[e.move], 0, 1);
    } else removeTell(e.id);
  }
  for (const [id, o] of foeViews)
    if (!seen.has(id)) {
      dropView(o);
      foeViews.delete(id);
      removeTell(id);
    }
  for (const [id] of tells) if (!seen.has(id)) removeTell(id);
  const shots = game.foeShots;
  let ti = 0,
    ei = 0;
  for (const s of shots) {
    const pool = s.kind === 'egg' ? eggPool : thornPool,
      i = s.kind === 'egg' ? ei++ : ti++;
    if (!pool[i]) {
      const m =
        s.kind === 'egg'
          ? part(scene, 'sphere', 0xfff6df, 0, 0, 0, 0.22, 0.3, 0.22)
          : part(scene, 'cone', 0x3f6b2f, 0, 0, 0, 0.14, 0.55, 0.14);
      pool.push(m);
    }
    const m = pool[i];
    m.visible = true;
    m.position.set(s.x, s.y, s.z);
    if (s.kind === 'egg') m.rotation.y += dt * 8;
    else {
      m.rotation.set(Math.PI / 2, 0, 0);
      m.rotation.y = 0;
      m.lookAt(s.x + s.vx, s.y, s.z + s.vz);
      m.rotateX(Math.PI / 2);
    }
  }
  for (let i = ti; i < thornPool.length; i++) thornPool[i].visible = false;
  for (let i = ei; i < eggPool.length; i++) eggPool[i].visible = false;
  const live = new Set();
  for (const p of game.pickups) {
    live.add(p.id);
    let m = pickupViews.get(p.id);
    if (!m) {
      m =
        p.kind === 'cookie'
          ? part(scene, 'cyl', 0xbb752b, 0, 0, 0, 0.23, 0.09, 0.23)
          : part(scene, 'sphere', 0x8be3ff, 0, 0, 0, 0.18);
      if (p.kind === 'orb') m.material.emissive.setHex(0x2a7fa0);
      pickupViews.set(p.id, m);
    }
    m.position.set(p.x, world.height(p.x, p.z) + 0.45 + Math.sin(game.time * 3 + p.id) * 0.08, p.z);
    m.rotation.z = p.kind === 'cookie' ? game.time * 2 : 0;
    m.rotation.y = game.time;
  }
  for (const [id, m] of pickupViews)
    if (!live.has(id)) {
      scene.remove(m);
      m.material.dispose();
      pickupViews.delete(id);
    }
}
const floaters = [];
const projected = new THREE.Vector3();
function floater(x, y, z, text, kind = '') {
  const el = document.createElement('div');
  el.className = 'float ' + kind;
  el.textContent = text;
  $('floaters').append(el);
  floaters.push({ el, x, y, z, life: 0.9 });
  if (floaters.length > 24) {
    const f = floaters.shift();
    f.el.remove();
  }
}
function updateFloaters(dt) {
  for (let i = floaters.length - 1; i >= 0; i--) {
    const f = floaters[i];
    f.life -= dt;
    f.y += dt * 1.1;
    projected.set(f.x, f.y, f.z).project(camera);
    const off = projected.z > 1 || f.life <= 0;
    if (f.life <= 0) {
      f.el.remove();
      floaters.splice(i, 1);
      continue;
    }
    f.el.style.display = off ? 'none' : '';
    f.el.style.left = (projected.x * 0.5 + 0.5) * innerWidth + 'px';
    f.el.style.top = (-projected.y * 0.5 + 0.5) * innerHeight + 'px';
    f.el.style.opacity = Math.min(1, f.life * 2.5);
  }
}
let bannerTime = 0,
  hitstop = 0,
  shake = 0,
  defeatOpen = false;
function banner(title, text = '') {
  const b = $('banner');
  b.querySelector('strong').textContent = title;
  b.querySelector('span').textContent = text;
  b.classList.add('show');
  bannerTime = 2.6;
}
function hurtFlash() {
  const h = $('hurtflash');
  h.classList.add('on');
  requestAnimationFrame(() => requestAnimationFrame(() => h.classList.remove('on')));
}
function showDefeat() {
  defeatOpen = true;
  clearInput();
  game.setPause(true);
  $('defeat').hidden = false;
  $('retry').focus();
  save();
}
function retry(fn = 'retry') {
  defeatOpen = false;
  $('defeat').hidden = true;
  game[fn]();
  clearInput();
  game.setPause(false);
  canvas.focus();
  toast(
    fn === 'home'
      ? 'Back at the cottage. Everyone is rested.'
      : 'Everyone is rested. Ruffy is counting on you!'
  );
}
$('retry').onclick = () => retry('retry');
$('defeat-home').onclick = () => retry('home');
$('mode').onchange = () => {
  game.setMode($('mode').value);
  shared?.setMode(game.mode);
  save();
};
const aim = new THREE.Vector3(),
  desired = new THREE.Vector3(),
  ray = new THREE.Raycaster();
let cameraInitialized = false;
function updateCamera(dt) {
  const a = game.player;
  aim.set(a.x, a.y + 1.25, a.z);
  desired
    .set(
      Math.sin(cameraYaw) * Math.cos(cameraPitch),
      Math.sin(cameraPitch),
      Math.cos(cameraYaw) * Math.cos(cameraPitch)
    )
    .multiplyScalar(cameraDistance);
  ray.set(aim, desired.clone().normalize());
  ray.far = cameraDistance;
  const hit = ray.intersectObjects(shadowMeshes, false)[0];
  if (hit) desired.setLength(Math.max(1.2, hit.distance - 0.35));
  desired.add(aim);
  desired.y = Math.max(desired.y, world.height(desired.x, desired.z) + 0.6);
  if (!cameraInitialized) {
    camera.position.copy(desired);
    cameraInitialized = true;
  } else camera.position.lerp(desired, 1 - Math.exp(-dt * 12));
  camera.lookAt(aim);
  if (shake > 0 && !game.paused) {
    shake = Math.max(0, shake - dt);
    camera.position.x += (Math.random() - 0.5) * shake * 0.5;
    camera.position.y += (Math.random() - 0.5) * shake * 0.5;
  }
  sun.position.set(a.x + 12, a.y + 20, a.z + 10);
  sun.target.position.set(a.x, a.y, a.z);
  sun.target.updateMatrixWorld();
}
function setQuality() {
  if (!renderer) return;
  const high = $('quality').value === 'high';
  renderer.setPixelRatio(Math.min(devicePixelRatio, high ? 1.5 : 1));
  renderer.shadowMap.enabled = high;
  for (const hero of heroes)
    hero.root.traverse((o) => {
      if (o.isMesh && o.material) o.material.needsUpdate = true;
    });
  resize();
}
function resize() {
  if (!renderer) return;
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
// How each hero moves (Claude update 6): natural walk/run speeds of the authored cycles, springy
// tail bones, and Darren's wings.
const HERO_MOTION = [
  {
    loco: { walk: 1.7, run: 5.8 },
    chains: [['tail1', 'tail2', 'tail3', 'tail4', 'tail5']],
    wings: ['wingL', 'wingR'],
  },
  { loco: { walk: 1.6, run: 5.5 }, chains: [['tail1', 'tail2', 'tail3']] },
  { loco: { walk: 1.4, run: 5.1 }, chains: [['tail1', 'tail2', 'tail3']] },
];
let actionSerial = 0;
const actionKeys = new WeakMap();
// Picks the clip a hero should be showing from what the simulation says they are doing.
function heroPose(a, i, h) {
  const an = h.animator,
    d = {
      speed: a.action || a.charging ? 0 : a.speed,
      vx: a.vx ?? 0,
      vz: a.vz ?? 0,
      air: a.air,
      vy: a.vy,
      yaw: a.yaw,
      x: a.x,
      y: a.y,
      z: a.z,
      hurt: h.hurt,
      look: lookTarget(a),
    };
  if (a.down)
    return { ...d, key: 'down', clip: an.has('Down') ? 'Down' : 'Idle', loop: true, blend: 0.3 };
  const act =
    a.action ||
    (a.assist
      ? { name: a.animation, time: a.assist.time, duration: 0.65, assist: a.assist }
      : null);
  if (act) {
    const id = act.assist || act;
    if (!actionKeys.has(id)) actionKeys.set(id, 'act' + actionSerial++);
    let clip = act.anim || act.name;
    if (clip === 'Jump' && an.has('JumpUp')) clip = 'JumpUp';
    if (!an.has(clip)) clip = /^(Hurt|Knock|GetUp)/.test(clip) ? 'Idle' : 'Attack1';
    const c = an.clips[clip],
      time = c && act.duration ? (act.time / act.duration) * c.duration : act.time;
    return {
      ...d,
      key: actionKeys.get(id),
      clip,
      time,
      blend: act.blend ?? 0.07,
      snapYaw: true,
      noLook: act.name === 'Dodge',
    };
  }
  if (a.charging)
    return { ...d, key: 'charge', clip: 'Charge', loop: true, blend: 0.12, still: true };
  if (a.air > 0.02) {
    if (an.has('Fall')) {
      const up = a.vy > 1.2;
      return {
        ...d,
        key: up ? 'jumpup' : 'fall',
        clip: up ? 'JumpUp' : 'Fall',
        loop: !up,
        blend: up ? 0.06 : 0.22,
      };
    }
    return { ...d, key: 'jump', clip: 'Jump', blend: 0.1 };
  }
  if (an.landT < 0.3 && an.has('Land') && a.speed < 2.5)
    return { ...d, key: 'land', clip: 'Land', time: an.landT, blend: 0.05 };
  return { ...d, key: 'loco', clip: 'Idle', blend: an.current === 'land' ? 0.2 : 0.18 };
}
// The heroes glance at the boss they're fighting, or the nearest enemy, or the quest marker when close.
function lookTarget(a) {
  const boss = game.engaged;
  if (boss && !boss.dead && Math.hypot(boss.x - a.x, boss.z - a.z) < 20)
    return { x: boss.x, y: boss.y + 1.2, z: boss.z };
  let best = null,
    bd = 9;
  for (const e of game.enemies) {
    if (e.dead) continue;
    const d = Math.hypot(e.x - a.x, e.z - a.z);
    if (d < bd) {
      bd = d;
      best = e;
    }
  }
  if (best) return { x: best.x, y: best.y, z: best.z };
  const o = game.objective();
  if (Math.hypot(o.x - a.x, o.z - a.z) < 6)
    return { x: o.x, y: world.height(o.x, o.z) + 0.5, z: o.z };
  return null;
}
function updateScene(dt) {
  for (let i = 0; i < 3; i++) {
    const a = game.actors[i],
      h = heroes[i],
      an = h.animator;
    an.update(game.paused ? 0 : dt, heroPose(a, i, h));
    h.hurt = null;
    h.root.position.set(a.x, a.y + 0.01, a.z);
    h.root.rotation.y = an.yaw;
    const belly = i === 0 ? game.belly : 0,
      sq = an.squashY;
    h.root.scale.set(
      (h.base.x * (1 + 0.05 * belly)) / Math.sqrt(sq),
      h.base.y * sq,
      (h.base.z * (1 + 0.07 * belly)) / Math.sqrt(sq)
    );
  }
  updateFoes(dt);
  updateFloaters(dt);
  const a = game.player,
    o = game.objective();
  marker.position.set(o.x, world.height(o.x, o.z) + 2.4 + Math.sin(game.time * 2) * 0.15, o.z);
  marker.rotation.y = game.time;
  selectedRing.position.set(a.x, world.height(a.x, a.z) + 0.06, a.z);
  selectedRing.material.color.setHex(game.kit.color);
  cookies.forEach((m, i) => {
    m.visible = !game.cookieSpots[i].taken;
    m.rotation.z = game.time;
    m.position.y =
      world.height(m.position.x, m.position.z) + 0.45 + Math.sin(game.time * 2 + i) * 0.08;
  });
  posts.forEach((p, i) =>
    p.target.material.emissive.setHex(
      game.time - game.targets[i].last < 0.18 && game.targets[i].hits ? 0xaa6633 : 0
    )
  );
  while (projectiles.length < game.shots.length)
    projectiles.push(mesh(new THREE.SphereGeometry(1, 12, 8), 0xf3fbff));
  projectiles.forEach((m, i) => {
    const s = game.shots[i];
    m.visible = !!s;
    if (s) {
      m.position.set(s.x, s.y, s.z);
      m.scale.setScalar(s.r);
    }
  });
  if (game.quest.rescued && !game.quest.home && !game.paused) {
    const dx = a.x - ruffy.position.x,
      dz = a.z - ruffy.position.z,
      d = Math.hypot(dx, dz);
    if (d > 3) {
      const pet = { x: ruffy.position.x, z: ruffy.position.z, y: ruffy.position.y, air: 0 };
      const angle = world.direction(pet, a, game.navField || world.field(a.x, a.z));
      world.move(pet, Math.sin(angle) * Math.min(6, d) * dt, Math.cos(angle) * Math.min(6, d) * dt);
      ruffy.position.set(pet.x, world.height(pet.x, pet.z), pet.z);
      ruffy.rotation.y = angle;
    }
  }
  if (game.quest.home) ruffy.position.set(17.8, world.height(17.8, 50.4), 50.4);
  for (let i = rings.length - 1; i >= 0; i--) {
    const r = rings[i];
    if (!game.paused) r.life -= dt;
    r.m.scale.setScalar(r.r * (1 - r.life / r.max) + 0.1);
    r.m.material.opacity = Math.max(0, r.life / r.max);
    if (r.life <= 0) {
      scene.remove(r.m);
      r.m.geometry.dispose();
      r.m.material.dispose();
      rings.splice(i, 1);
    }
  }
  updateCamera(dt);
}
function hud() {
  const a = game.player,
    o = game.objective(),
    distance = Math.hypot(a.x - o.x, a.z - o.z);
  $('objective').textContent = o.label;
  $('distance').textContent = `${Math.round(distance)} m · Cookies ${game.cookies}`;
  $('health').style.width = (a.hp / a.max) * 100 + '%';
  $('health').classList.toggle('low', a.hp < 30);
  $('hpnum').textContent = `${Math.ceil(a.hp)} / ${a.max}`;
  $('belly').textContent =
    game.selected === 0
      ? BELLY[game.belly] +
        ' · ' +
        (game.belly < 3 ? `${game.cookies % 3}/3 cookies` : 'finisher +12 · snowball +15')
      : '';
  const boss = game.engaged;
  $('bossbox').hidden = !boss;
  if (boss || toastTime > 0) {
    const q = $('quest').getBoundingClientRect().bottom;
    if (boss) $('bossbox').style.top = q + 8 + 'px';
    $('toast').style.top = (boss ? $('bossbox').getBoundingClientRect().bottom : q) + 10 + 'px';
  }
  if (boss) {
    $('bossname').textContent = boss.name;
    $('bossbar').style.width = Math.max(0, (boss.hp / boss.max) * 100) + '%';
    $('bosshint').textContent =
      boss.state === 'wind'
        ? '⚠ Dodge the marked attack!'
        : boss.state === 'rec'
          ? 'Opening! Strike or throw a packed snowball.'
          : 'Keep moving and watch for warnings';
  }
  $('kocount').textContent = game.ko;
  $('combo').textContent = game.combo > 1 ? `${game.combo} hit combo` : '';
  $('name').textContent = a.name;
  $('kit').textContent = game.kit.charge;
  $('energy').style.width = a.energy + '%';
  $('musou').style.width = (a.mus || 0) + '%';
  $('musou').parentElement.classList.toggle('full', (a.mus || 0) >= 100);
  $('style').hidden = game.selected !== 0;
  $('style').textContent = game.selected === 0 ? game.moveset().name : '';
  $('style-key').hidden = $('touch-style').hidden = game.selected !== 0;
  $('touch-special').classList.toggle('ready', (a.mus || 0) >= 100);
  $('chargebox').hidden = !a.charging;
  $('chargebar').style.width = (a.charge / 1.2) * 100 + '%';
  $('chargelabel').textContent =
    a.charge >= 1.2 ? 'Ready · release to attack' : 'Hold to gather power';
  $('interaction').hidden = !game.canInteract() || !!a.action;
  $('hits').textContent = game.stats.hits;
  $('practice').hidden = Math.hypot(a.x - 23, a.z - 52) > 14;
  document.querySelectorAll('[data-cast]').forEach((b, i) => {
    const h = game.actors[i];
    b.querySelector('.hp b').style.width = (h.hp / h.max) * 100 + '%';
    b.classList.toggle('down', h.down);
    b.classList.toggle('active', i === game.selected);
    b.setAttribute('aria-pressed', String(i === game.selected));
  });
  mapCtx.drawImage(mapBackground, 0, 0);
  function dot(x, z, color, r) {
    mapCtx.fillStyle = color;
    mapCtx.beginPath();
    mapCtx.arc((x / world.w) * 220, (z / world.d) * 164, r, 0, Math.PI * 2);
    mapCtx.fill();
  }
  for (const e of game.enemies)
    if (!e.dead) dot(e.x, e.z, e.boss ? '#b0244f' : '#e0605a', e.boss ? 4.5 : 1.8);
  dot(o.x, o.z, '#ffe071', 4);
  game.actors.forEach((p, i) =>
    dot(
      p.x,
      p.z,
      i === game.selected ? '#fff' : `#${KITS[i].color.toString(16)}`,
      i === game.selected ? 4 : 2.5
    )
  );
  mapCtx.fillStyle = '#153445';
  mapCtx.font = '10px system-ui';
  mapCtx.fillText('N ↑', 6, 13);
}
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - last) / 1000 || 0.016, 0.1);
  last = now;
  if (!ready) return;
  const pad = padInput(dt);
  if (pendingSwitch !== null && !game.paused && game.switchTo(pendingSwitch)) pendingSwitch = null;
  if (keys.has('KeyZ')) cameraYaw += dt * 1.8;
  if (keys.has('KeyX')) cameraYaw -= dt * 1.8;
  let x =
      joystick.x +
      pad.x +
      (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) -
      (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0),
    z =
      joystick.z +
      pad.z +
      (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) -
      (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0);
  const input = {
    x: x * Math.cos(cameraYaw) + z * Math.sin(cameraYaw),
    z: z * Math.cos(cameraYaw) - x * Math.sin(cameraYaw),
  };
  // Hit-stop: a heavy hit freezes the action for a few hundredths of a second so it lands with weight.
  if (hitstop > 0) {
    hitstop -= dt;
    accumulator += dt * 0.08;
  } else accumulator += dt;
  while (accumulator >= 1 / 60) {
    game.update(1 / 60, input);
    accumulator -= 1 / 60;
  }
  events();
  updateScene(dt);
  hud();
  if (toastTime > 0) {
    toastTime -= dt;
    if (toastTime <= 0) $('toast').classList.remove('visible');
  }
  if (bannerTime > 0) {
    bannerTime -= dt;
    if (bannerTime <= 0) $('banner').classList.remove('show');
  }
  renderer.render(scene, camera);
}
async function boot() {
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xb9d4e0);
    scene.fog = new THREE.Fog(0xb9d4e0, 38, 135);
    camera = new THREE.PerspectiveCamera(52, innerWidth / innerHeight, 0.1, 220);
    scene.add(new THREE.HemisphereLight(0xe9f7ff, 0x747b66, 2.4));
    sun = new THREE.DirectionalLight(0xffe6bd, 3.2);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = sun.shadow.camera.bottom = -20;
    sun.shadow.camera.right = sun.shadow.camera.top = 20;
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = 65;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.03;
    scene.add(sun, sun.target);
    const loader = new GLTFLoader(),
      [data, land, ...cast] = await Promise.all([
        fetch('./world.json').then((r) => {
          if (!r.ok) throw Error('Terrain data could not load.');
          return r.json();
        }),
        loader.loadAsync('./assets/terrain.glb'),
        ...CAST.map((n) => loader.loadAsync(`./assets/${n.toLowerCase()}.glb`)),
      ]);
    world = new World(data);
    let saved = null;
    try {
      saved = JSON.parse(localStorage.getItem(SAVE) || 'null');
    } catch {}
    game = new Game(world, saved);
    // A brand-new 3D adventure starts in the mode picked last in either game.
    if (!saved && shared?.mode()) game.mode = shared.mode();
    world.prepareNav();
    terrain = land.scene;
    terrain.traverse((o) => {
      if (o.isMesh) {
        o.receiveShadow = true;
        o.castShadow = true;
        shadowMeshes.push(o);
      }
    });
    scene.add(terrain);
    for (let i = 0; i < 3; i++) {
      const g = cast[i],
        root = g.scene;
      root.traverse((o) => {
        if (o.isMesh) {
          o.castShadow = o.receiveShadow = true;
          o.frustumCulled = false;
          if (o.material?.map)
            o.material.map.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
        }
      });
      scene.add(root);
      // Authored clips (clips.mjs) replace the supplied ones of the same name; anything not yet
      // authored keeps the supplied clip.
      const rig = buildRig(root, CAST[i]),
        authored = buildClips(rig),
        names = new Set(authored.map((c) => c.name)),
        all = [...authored, ...g.animations.filter((c) => !names.has(c.name))];
      for (const name of [
        'Idle',
        'Run',
        'Dodge',
        'Charge',
        'ChargeAttack',
        'Interact',
        'Celebrate',
      ])
        if (!all.some((c) => c.name === name)) throw Error(`${CAST[i]} is missing ${name}.`);
      const animator = new Animator(root, rig, all, HERO_MOTION[i]);
      heroes.push({
        root,
        animator,
        actions: animator.actions,
        rig,
        base: root.scale.clone(),
        hurt: null,
      });
    }
    createDetails();
    setQuality();
    showBindings();
    $('mode').value = game.mode;
    const note = shared?.describe(shared.story().pixel, 'pixel game') || '';
    $('other-game').textContent = note;
    $('other-game').hidden = !note;
    ready = true;
    $('play').disabled = false;
    $('play').textContent = saved ? 'Continue adventure' : 'Enter the valley';
    updateChapterButton();
    requestAnimationFrame(frame);
    if (new URLSearchParams(location.search).has('test'))
      window.snowdayTest = {
        game,
        world,
        heroes,
        renderer,
        scene,
        camera,
        pause,
        resume,
        retry,
        foeViews,
        padBindings: () => ({ ...padBindings }),
        // Deterministic stepping for screenshots: runs the simulation and the animation at a fixed
        // frame rate (the browser's own frame loop keeps running too).
        advance: (seconds, input = { x: 0, z: 0 }, fps = 30) => {
          for (let t = 0; t < seconds - 1e-6; t += 1 / fps) {
            for (let k = 0; k < 60 / fps; k++) game.update(1 / 60, input);
            events();
            updateScene(1 / fps);
          }
          hud();
          renderer.render(scene, camera);
        },
        setView: (yaw, pitch = 0.3, distance = 8.5) => {
          cameraYaw = yaw;
          cameraPitch = pitch;
          cameraDistance = distance;
          cameraInitialized = false;
        },
        ready: true,
      };
  } catch (error) {
    console.error(error);
    $('error').hidden = false;
    $('error').textContent = `The valley could not open: ${error.message}. Reload to try again.`;
    $('play').textContent = 'Unable to start';
  }
}
boot();
