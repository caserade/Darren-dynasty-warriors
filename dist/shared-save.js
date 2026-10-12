'use strict';
/*
 * Settings and story progress shared by the pixel game (/) and the 3D game (/3d/).
 *
 * Both games are served from the same local address, so they share one browser storage.
 * Each game keeps its own save exactly as before (darren-snowday-v3, darren-firewood-v1,
 * snowday-3d-v1, darren-controls-v1, snowday-3d-controls-v1). This file adds one small
 * record, snowday-shared-v1, for the things that mean the same in both games:
 *
 *   sound    true / false            last sound choice in either game
 *   mode     'adventure' / 'cozy'     last difficulty picked in either game
 *   buttons  { attack, dodge, pause } controller buttons the player chose on purpose
 *
 * Story progress is never copied. It is read straight from each game's own save, so older
 * saves count immediately and nothing can get out of step.
 */
var SnowdayShared = (function () {
  const KEY = 'snowday-shared-v1';
  const COMMON = ['attack', 'dodge', 'pause'];

  function readJson(key) {
    try {
      return JSON.parse(localStorage.getItem(key) || 'null');
    } catch (e) {
      return null;
    }
  }
  function load() {
    const s = readJson(KEY);
    return s && typeof s === 'object' && s.version === 1 ? s : { version: 1 };
  }
  function store(s) {
    try {
      localStorage.setItem(KEY, JSON.stringify(s));
    } catch (e) {}
  }

  function sound() {
    const s = load().sound;
    return typeof s === 'boolean' ? s : null;
  }
  function setSound(on) {
    const s = load();
    s.sound = !!on;
    store(s);
  }
  function mode() {
    const m = load().mode;
    return m === 'cozy' || m === 'adventure' ? m : null;
  }
  function setMode(m) {
    const s = load();
    s.mode = m === 'cozy' ? 'cozy' : 'adventure';
    store(s);
  }

  function validButton(v) {
    return Number.isInteger(v) && v >= 0 && v < 32;
  }
  function buttons() {
    const b = load().buttons,
      out = {};
    if (b && typeof b === 'object') for (const k of COMMON) if (validButton(b[k])) out[k] = b[k];
    return out;
  }
  // Record buttons the player just chose. `choices` uses the shared names (attack, dodge, pause).
  function rememberButtons(choices) {
    const s = load(),
      b = buttons();
    for (const k of COMMON) if (validButton(choices[k])) b[k] = choices[k];
    s.buttons = b;
    store(s);
  }
  function forgetButtons() {
    const s = load();
    delete s.buttons;
    store(s);
  }
  /*
   * Apply the shared buttons to one game's bindings. `names` maps shared names to that
   * game's own action names, for example { attack: 'combo', dodge: 'dodge', pause: 'pause' }.
   * A button already used by another action swaps with it, the same way remapping does.
   */
  function applyButtons(bindings, names) {
    const shared = buttons();
    for (const k of COMMON) {
      const action = names[k];
      if (!(k in shared) || !(action in bindings) || bindings[action] === shared[k]) continue;
      const other = Object.keys(bindings).find((a) => a !== action && bindings[a] === shared[k]);
      if (other) bindings[other] = bindings[action];
      bindings[action] = shared[k];
    }
    return bindings;
  }

  // What each game has finished, read from its own save.
  function story() {
    const pixel = readJson('darren-snowday-v3'),
      wood = readJson('darren-firewood-v1'),
      three = readJson('snowday-3d-v1'),
      q = three && three.version === 1 && three.quest ? three.quest : null;
    const count = (list) => (Array.isArray(list) ? list.filter((v) => v === true).length : 0);
    return {
      pixel: {
        camps: pixel && Array.isArray(pixel.camps) ? count(pixel.camps) : 0,
        rescued: !!(pixel && pixel.version === 3 && pixel.complete === true),
        wood: wood && wood.version === 1 ? count(wood.collected) : 0,
        delivered: !!(wood && wood.version === 1 && wood.complete === true),
      },
      threeD: {
        camps: q ? count(q.clues) : 0,
        rescued: !!(q && q.home === true),
        wood: q ? count(q.wood) : 0,
        delivered: !!(q && q.delivered === true),
      },
    };
  }
  // One short line about the other game, or '' when it has not been played.
  function describe(p, gameName) {
    if (p.delivered) return `In the ${gameName}: Ruffy is home and Mom has her firewood.`;
    if (p.rescued)
      return (
        `In the ${gameName}: Ruffy is home` +
        (p.wood ? `, ${p.wood} of 3 wood piles gathered.` : '.')
      );
    if (p.camps) return `In the ${gameName}: ${p.camps} of 3 camps cleared.`;
    return '';
  }

  return {
    sound,
    setSound,
    mode,
    setMode,
    buttons,
    rememberButtons,
    forgetButtons,
    applyButtons,
    story,
    describe,
  };
})();
