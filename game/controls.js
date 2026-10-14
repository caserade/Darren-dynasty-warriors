'use strict';
// Shared intent layer. Scene polls controllers; keyboard and touch feed the same actions.
let inputMode = 'keyboard',
  actionBuffer = null,
  activePad = null,
  hadPad = false,
  rumbleAt = 0,
  menuAxis = 0,
  awaitBind = null,
  menuRepeat = 0,
  padContext = null;
let wearScarf = true,
  softMotion = true,
  growthEnabled = true;
const DEFAULT_BINDINGS = {
  throw: 2,
  roll: 1,
  dodge: 0,
  special: 3,
  left: 4,
  right: 5,
  pause: 9,
  style: 8,
};
let padBindings = { ...DEFAULT_BINDINGS };
// Shared button name -> this game's action name.
const SHARED_BUTTON_NAMES = { attack: 'throw', dodge: 'dodge', pause: 'pause' };
function rememberSharedButtons(...actions) {
  if (typeof SnowdayShared === 'undefined') return;
  const choices = {};
  for (const [shared, own] of Object.entries(SHARED_BUTTON_NAMES))
    if (actions.includes(own)) choices[shared] = padBindings[own];
  SnowdayShared.rememberButtons(choices);
}
try {
  const saved = JSON.parse(localStorage.getItem('darren-controls-v1'));
  if (
    saved &&
    Object.keys(saved).every(
      (k) => k in DEFAULT_BINDINGS && Number.isInteger(saved[k]) && saved[k] >= 0 && saved[k] < 32
    )
  )
    padBindings = { ...DEFAULT_BINDINGS, ...saved };
  // Attack, dodge and pause buttons chosen in either game carry over (see shared-save.js).
  if (typeof SnowdayShared !== 'undefined')
    SnowdayShared.applyButtons(padBindings, SHARED_BUTTON_NAMES);
  const looks = JSON.parse(localStorage.getItem('darren-look-v1'));
  if (looks) {
    wearScarf = looks.scarf !== false;
    softMotion = looks.softMotion !== false;
    growthEnabled = looks.growth !== false;
  }
} catch (e) {}
const padMove = { x: 0, y: 0 },
  padAim = { x: 0, y: 0 };
const previousPadButtons = new Map();
const SIZE_NAMES = ['Little adventurer', 'Cozy belly', 'Round & ready', 'Snowball sturdy'];

function bufferAction(kind) {
  actionBuffer = { kind, left: 0.15, released: false };
}
function tickInputBuffer(dt) {
  if (!actionBuffer) return;
  const b = actionBuffer;
  if (b.left <= 0 || !canAct()) {
    actionBuffer = null;
    return;
  }
  const ready =
    b.kind === 'attack' ? P.shotCd <= 0 : b.kind === 'dash' ? P.dashCd <= 0 : P.rollCd <= 0;
  if (!ready) {
    b.left -= dt;
    if (b.left <= 0) actionBuffer = null;
    return;
  }
  actionBuffer = null;
  if (b.kind === 'attack') {
    pressAttack();
    if (b.released) releaseAttack();
  } else if (b.kind === 'dash') pressDash();
  else pressRoll();
}
function gainCookie() {
  if (!growthEnabled) return;
  const old = P.weight;
  P.cookies++;
  P.weight = Math.min(3, Math.floor(P.cookies / 3));
  saveCampAppearance();
  if (P.weight > old) {
    banner(
      SIZE_NAMES[P.weight].toUpperCase(),
      'A cozy belly · stronger kick, sweep & roll · same quick feet'
    );
    padRumble(0.2, 100);
  }
}
function screenVector(x, y) {
  const u = x / (2 * ISO_X) + y / (2 * ISO_Y),
    v = y / (2 * ISO_Y) - x / (2 * ISO_X),
    a = (-viewQuarter * Math.PI) / 2;
  return { x: u * Math.cos(a) - v * Math.sin(a), y: u * Math.sin(a) + v * Math.cos(a) };
}
function deadzone(x, y) {
  const n = Math.hypot(x, y);
  if (n < 0.18) return { x: 0, y: 0 };
  const m = Math.min(1, (n - 0.18) / 0.82);
  return { x: (x / n) * m, y: (y / n) * m };
}
function visibleScreen() {
  return [...document.querySelectorAll('.screen')].find((e) => !e.hidden);
}
function menuButtons() {
  const book = document.querySelector('#weightBook');
  const el = book?.open ? book : visibleScreen();
  return el
    ? [...el.querySelectorAll('button,input[type=checkbox],input[type=range],summary')].filter(
        (b) => !b.hidden && !b.disabled && b.getClientRects().length
      )
    : [];
}
function menuStep(delta) {
  const btns = menuButtons();
  if (!btns.length) return;
  const i = btns.indexOf(document.activeElement);
  btns[i < 0 ? (delta > 0 ? 0 : btns.length - 1) : (i + delta + btns.length) % btns.length].focus({
    preventScroll: false,
  });
}
function menuAccept() {
  const btns = menuButtons();
  if (!btns.length) return;
  const b = btns.includes(document.activeElement) ? document.activeElement : btns[0];
  b.click();
}
function handleMenuKey(e) {
  if (awaitBind && e.code === 'Escape') {
    awaitBind = null;
    e.preventDefault();
    setControllerStatus('Binding cancelled.');
    return true;
  }
  if (dialogOpen) return false;
  if (!visibleScreen()) return false;
  if (e.code === 'Escape' && paused) {
    e.preventDefault();
    togglePause();
    return true;
  }
  if (e.code === 'Enter' || e.code === 'Space') {
    e.preventDefault();
    if (!e.repeat) menuAccept();
    return true;
  }
  if (['ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft'].includes(e.code)) {
    e.preventDefault();
    if (!e.repeat) menuStep(e.code === 'ArrowUp' || e.code === 'ArrowLeft' ? -1 : 1);
    return true;
  }
  return false;
}
function updateControlLabels() {
  const gamepad = inputMode === 'gamepad';
  document.body.classList.toggle('usingGamepad', gamepad);
  document.querySelector('#quickHelp').textContent =
    inputMode === 'touch'
      ? 'Left thumb moves · hold COMBO to attack · Paws ⇄ Snow changes style · hold SNOW and release to throw · camera controls above'
      : gamepad
        ? 'L stick move · ' + buttonName(padBindings.style) + ' style · LB/RB camera · Start pause'
        : 'WASD / arrows move · F combat style · B/N camera · Q/E zoom · P pause';
  const paws = typeof P !== 'undefined' && P?.weapon === 'paws';
  document.querySelector('#aThrow small').textContent =
    (gamepad ? buttonName(padBindings.throw) + ' / RT' : 'J / Z') +
    (paws ? ' · tap / hold' : ' · hold to charge');
}
// Read the browser API directly, with Phaser as a fallback. Both axis shapes work.
function connectedControllers(scene) {
  let pads = [];
  try {
    pads = Array.from(navigator.getGamepads?.() || []).filter((p) => p && p.connected);
  } catch (e) {}
  return pads.length ? pads : (scene.input.gamepad?.getAll() || []).filter((p) => p.connected);
}
function menuBack() {
  const book = document.querySelector('#weightBook');
  if (book?.open) {
    book.close();
    return;
  }
  const details = document.activeElement?.closest?.('details');
  if (details?.open) {
    details.open = false;
    details.querySelector('summary')?.focus();
    return;
  }
  if (paused) {
    togglePause();
    return;
  }
  if (visibleScreen()?.id === 'sSelect') show('#sTitle');
}
function pollControllers(scene, dt) {
  const pads = connectedControllers(scene);
  const pad =
    pads.find((p) => p.index === activePad?.index && p.id === activePad?.id) ||
    pads.find((p) => (p.mapping || p.pad?.mapping) === 'standard') ||
    pads[0];
  if (!pad) {
    padMove.x = padMove.y = padAim.x = padAim.y = 0;
    if (hadPad) {
      hadPad = false;
      activePad = null;
      awaitBind = null;
      padContext = null;
      menuAxis = 0;
      inputMode = isTouch ? 'touch' : 'keyboard';
      updateControlLabels();
      previousPadButtons.clear();
      clearControls();
      setControllerStatus('Controller disconnected. Reconnect or use touch controls.');
      if (state === 'play' && !paused) {
        togglePause();
        banner('CONTROLLER DISCONNECTED', 'Reconnect, or continue with touch controls.');
      }
    }
    return;
  }
  const changed = !hadPad || activePad?.index !== pad.index || activePad?.id !== pad.id;
  const buttons = Array.from(pad.buttons, (b) =>
    typeof b === 'number' ? b > 0.4 : b.pressed || b.value > 0.4
  );
  if (changed) {
    clearControls();
    previousPadButtons.set(pad.index, buttons);
    setControllerStatus('Connected: ' + pad.id + ' · A / × select · B / ○ back · Start pause');
    updateBindingLabels();
    padContext = null;
    menuAxis = 0;
  }
  hadPad = true;
  activePad = pad;
  if (document.hidden) {
    clearControls();
    previousPadButtons.set(pad.index, buttons);
    return;
  }
  const previous = previousPadButtons.get(pad.index) || [],
    down = (i) => buttons[i] && !previous[i],
    up = (i) => !buttons[i] && previous[i];
  const finish = () => previousPadButtons.set(pad.index, buttons);
  const val = (i) => (typeof pad.axes[i] === 'number' ? pad.axes[i] : pad.axes[i]?.getValue() || 0);
  const left = deadzone(val(0), val(1)),
    right = deadzone(val(2), val(3));
  if (
    buttons.some((v, i) => v && !previous[i]) ||
    Math.hypot(left.x, left.y) > 0.1 ||
    Math.hypot(right.x, right.y) > 0.1
  ) {
    if (inputMode !== 'gamepad') {
      inputMode = 'gamepad';
      updateControlLabels();
    }
    if (buttons.some((v, i) => v && !previous[i])) initAudio();
  }
  const book = document.querySelector('#weightBook'),
    screen = visibleScreen(),
    context = book?.open ? book : screen || (dialogOpen ? 'dialogue' : 'play');
  if (context !== padContext) {
    clearControls();
    padContext = context;
    menuAxis = 0;
    menuRepeat = 0;
  }
  if (awaitBind) {
    if (down(9)) {
      awaitBind = null;
      setControllerStatus('Binding cancelled.');
    } else {
      const index = buttons.findIndex((v, i) => v && !previous[i]);
      if (index >= 0) {
        const action = awaitBind;
        awaitBind = null;
        const other = Object.keys(padBindings).find(
          (k) => k !== action && padBindings[k] === index
        );
        if (other) padBindings[other] = padBindings[action];
        padBindings[action] = index;
        saveBindings();
        rememberSharedButtons(action, other);
        setControllerStatus('Bound ' + action + ' to ' + buttonName(index));
      }
    }
    finish();
    return;
  }
  padMove.x = padMove.y = padAim.x = padAim.y = 0;
  if (book?.open || screen) {
    const btns = menuButtons();
    if (inputMode === 'gamepad' && btns.length && !btns.includes(document.activeElement))
      btns[0].focus();
    const x =
      (buttons[15] ? 1 : 0) - (buttons[14] ? 1 : 0) ||
      (Math.abs(left.x) > 0.6 ? Math.sign(left.x) : 0);
    const y =
      (buttons[13] ? 1 : 0) - (buttons[12] ? 1 : 0) ||
      (Math.abs(left.y) > 0.6 ? Math.sign(left.y) : 0);
    const axis = y ? y * 2 : x;
    menuRepeat -= dt;
    const step = axis && (axis !== menuAxis || menuRepeat <= 0);
    if (step) menuRepeat = axis !== menuAxis ? 0.36 : 0.12;
    menuAxis = axis;
    if (step) {
      const focused = document.activeElement;
      if (!y && focused?.type === 'range') {
        const n = Number(focused.step) || 1;
        focused.value = clamp(
          Number(focused.value) + x * Math.max(n, 5),
          Number(focused.min || 0),
          Number(focused.max || 100)
        );
        focused.dispatchEvent(new Event('input', { bubbles: true }));
      } else menuStep(y || x);
    }
    // Right stick scrolls artwork and long menus without changing selection.
    if (Math.abs(right.y) > 0.1)
      (book?.open ? book : screen).scrollBy?.({ top: right.y * dt * 650, behavior: 'instant' });
    if (down(1)) menuBack();
    else if (down(9)) {
      if (book?.open) book.close();
      else if (paused) togglePause();
    } else if (down(0)) menuAccept();
  } else if (state === 'play') {
    if (down(9) || down(padBindings.pause)) togglePause();
    else if (dialogOpen) {
      if (down(0) || down(2)) nextLine();
    } else if (!paused) {
      const zoom = buttons[6] && !Object.keys(padBindings).some((k) => padBindings[k] === 6);
      padMove.x = left.x + (zoom ? 0 : (buttons[15] ? 1 : 0) - (buttons[14] ? 1 : 0));
      padMove.y = left.y + (zoom ? 0 : (buttons[13] ? 1 : 0) - (buttons[12] ? 1 : 0));
      padAim.x = right.x;
      padAim.y = right.y;
      const useTrigger = !Object.keys(padBindings).some(
        (k) => k !== 'throw' && padBindings[k] === 7
      );
      if (down(padBindings.style)) switchStyle();
      if (down(padBindings.dodge)) pressDash();
      if (down(padBindings.roll)) pressRoll();
      if (down(padBindings.special)) pressMusou();
      if ((down(padBindings.throw) || (useTrigger && down(7))) && !chargeHeld) pressAttack();
      if (
        (up(padBindings.throw) || (useTrigger && up(7))) &&
        !buttons[padBindings.throw] &&
        (!useTrigger || !buttons[7])
      )
        releaseAttack();
      if (down(padBindings.left)) turnView(-1);
      if (down(padBindings.right)) turnView(1);
      if (zoom && buttons[12]) userZoom = clamp(userZoom + dt, 0.75, 1.6);
      if (zoom && buttons[13]) userZoom = clamp(userZoom - dt, 0.75, 1.6);
    }
  }
  finish();
}
function padRumble(strength, ms) {
  if (inputMode !== 'gamepad' || !activePad || reduceMotion || performance.now() - rumbleAt < 65)
    return;
  rumbleAt = performance.now();
  try {
    const actuator = navigator.getGamepads?.()[activePad.index]?.vibrationActuator;
    actuator
      ?.playEffect('dual-rumble', {
        duration: ms,
        weakMagnitude: strength,
        strongMagnitude: strength * 0.45,
      })
      .catch(() => {});
  } catch (e) {}
}
function snowStep() {
  if (!AC || muted || P.stepT > 0) return;
  noiseHit(AC.currentTime, 0.045, 1600, 0.035, 'highpass');
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
      'View',
      'Start / Options',
      'L stick',
      'R stick',
      'D-pad ↑',
      'D-pad ↓',
      'D-pad ←',
      'D-pad →',
      'Home',
    ][i] || 'Button ' + i
  );
}
function setControllerStatus(text) {
  const el = document.querySelector('#controllerStatus');
  if (el) el.textContent = text;
  const title = document.querySelector('#titleControllerStatus');
  if (title) title.textContent = text;
}
function updateBindingLabels() {
  for (const b of document.querySelectorAll('[data-bind]'))
    b.textContent = b.dataset.bind + ' · ' + buttonName(padBindings[b.dataset.bind]);
}
function saveBindings() {
  try {
    localStorage.setItem('darren-controls-v1', JSON.stringify(padBindings));
  } catch (e) {}
  updateBindingLabels();
  updateControlLabels();
}
function saveLook() {
  try {
    localStorage.setItem(
      'darren-look-v1',
      JSON.stringify({ scarf: wearScarf, softMotion, growth: growthEnabled })
    );
  } catch (e) {}
}
function initPreferences() {
  const growth = document.querySelector('#growthEnabled'),
    scarf = document.querySelector('#wearScarf'),
    soft = document.querySelector('#softMotion');
  growth.checked = growthEnabled;
  scarf.checked = wearScarf;
  soft.checked = softMotion;
  growth.onchange = (e) => {
    growthEnabled = e.target.checked;
    saveLook();
  };
  scarf.onchange = (e) => {
    wearScarf = e.target.checked;
    saveLook();
  };
  soft.onchange = (e) => {
    softMotion = e.target.checked;
    saveLook();
  };
  for (const b of document.querySelectorAll('[data-bind]'))
    b.onclick = () => {
      awaitBind = b.dataset.bind;
      setControllerStatus(
        'Press a controller button for ' +
          awaitBind +
          '. Start / Options or Escape cancels. Start stays available for Pause.'
      );
    };
  document.querySelector('#resetBindings').onclick = () => {
    awaitBind = null;
    padBindings = { ...DEFAULT_BINDINGS };
    saveBindings();
    if (typeof SnowdayShared !== 'undefined') SnowdayShared.forgetButtons();
    setControllerStatus('Standard controls restored.');
  };
  document.addEventListener('keydown', (e) => {
    if (e.code === 'Escape' && awaitBind) {
      awaitBind = null;
      setControllerStatus('Binding cancelled.');
    }
  });
  document.addEventListener(
    'pointerdown',
    (e) => {
      if (e.pointerType === 'touch') {
        isTouch = true;
        document.body.classList.add('touch');
        if (state === 'play') document.querySelector('#touch').hidden = false;
        if (inputMode !== 'touch') {
          inputMode = 'touch';
          updateControlLabels();
        }
      }
    },
    { passive: true }
  );
  updateBindingLabels();
  setControllerStatus(
    navigator.getGamepads
      ? 'Pair your controller in device Bluetooth settings or connect by USB, then press any button.'
      : 'This browser does not expose controllers. Touch and keyboard still work.'
  );
}
