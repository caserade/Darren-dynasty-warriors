// The 3D game's front end (Claude update 13): title screen, main menu, story select, hero
// select, options, battle briefing and the results screen, in the style of a musou game.
// The valley keeps rendering behind every page; game.mjs moves the camera to frame the heroes.
import {
  BATTLES,
  CHAPTERS,
  HERO_INFO,
  battleSite,
  battleWon,
  clock,
  continueBattle,
  mergeRecord,
  rank,
  replaySave,
  storyStatus,
} from './story.mjs';
import { MOVESETS, movesetKey } from './moves.mjs';

const RECORDS = 'snowday-3d-records-v1';
const $ = (id) => document.getElementById(id);
function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on')) el[k] = v;
    else if (v === true) el.setAttribute(k, '');
    else if (v !== false && v != null) el.setAttribute(k, v);
  }
  for (const kid of kids.flat())
    if (kid != null && kid !== false) el.append(kid.nodeType ? kid : String(kid));
  return el;
}
function readJson(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || 'null');
  } catch {
    return null;
  }
}

export function createFront(api) {
  const root = $('front'),
    help = $('fx-help'),
    pages = {};
  let page = null,
    ready = false,
    run = null,
    flow = { mode: 'story', battle: 0, hero: 0, style: 'paws' },
    heroFrom = 'main',
    eraseArmed = false,
    held = {},
    stickTime = 0,
    stickHeld = false,
    pulse = 0;
  const records = () => readJson(RECORDS) || {};
  const touch = () => document.body.classList.contains('touch-device');
  $('fx-back').onclick = () => back();
  const pixelRescued = () => !!api.shared?.story().pixel.rescued;
  const status = () => storyStatus(api.readSave(), pixelRescued());

  // ---- Page building ----
  for (const el of root.querySelectorAll('.fx-page')) pages[el.id.slice(3)] = el;
  function items() {
    return [...(page ? pages[page].querySelectorAll('.fx-item') : [])].filter(
      (e) => e.offsetParent !== null
    );
  }
  function focusItem(el) {
    if (!el) return;
    el.focus({ preventScroll: false });
  }
  function show(name, focus = 0) {
    if (page && pages[page]) pages[page].hidden = true;
    page = name;
    shownAt = performance.now();
    root.hidden = false;
    root.dataset.page = name;
    builders[name]?.();
    pages[name].hidden = false;
    pages[name].classList.remove('fx-in');
    void pages[name].offsetWidth;
    pages[name].classList.add('fx-in');
    const list = items();
    focusItem(
      typeof focus === 'number'
        ? list[Math.min(focus, list.length - 1)]
        : pages[name].querySelector(focus) || list[0]
    );
    help.innerHTML = touch() ? '' : HELP[name] || HELP.default;
    $('fx-back').hidden = name === 'title' || name === 'results';
    updNotice();
    camera();
  }
  const HELP = {
    title: '<b>Enter</b> / <b>A</b> / click to start',
    heroes:
      '<b>←→</b> choose · <b>↑↓</b> settings · <b>Enter</b> / <b>A</b> confirm · <b>Esc</b> / <b>B</b> back',
    options: '<b>↑↓</b> choose · <b>←→</b> / <b>Enter</b> change · <b>Esc</b> / <b>B</b> back',
    results: '<b>↑↓</b> choose · <b>Enter</b> / <b>A</b> confirm',
    default: '<b>↑↓</b> choose · <b>Enter</b> / <b>A</b> confirm · <b>Esc</b> / <b>B</b> back',
  };
  function camera() {
    if (page === 'heroes') api.showcase({ hero: flow.hero });
    else if (page === 'brief') api.showcase({ hero: flow.hero, near: true });
    else api.showcase({ party: true, wide: page === 'title' });
  }
  // Pointing at an item highlights it, but only for a real move of the mouse: a page that just
  // opened under a still cursor must not pick whatever landed beneath it.
  let shownAt = 0;
  function hover(b, e) {
    if (e.pointerType !== 'mouse' || performance.now() - shownAt < 250) return;
    if (!e.movementX && !e.movementY) return;
    if (document.activeElement !== b) b.focus({ preventScroll: true });
  }
  function item(label, props = {}, ...rest) {
    const b = h(
      'button',
      { ...props, class: 'fx-item ' + (props.class || ''), type: 'button' },
      label,
      ...rest
    );
    b.onpointermove = (e) => hover(b, e);
    return b;
  }

  // ---- Updates (Windows app only, Claude update 14) ----
  // The app checks GitHub when it starts and every hour; window.snowdayDesktop (preload.cjs)
  // passes its status here. The notice on the title screen and main menu says when a new game
  // or a new app is out; the Update page downloads it and the app restarts on the title screen.
  const desk = window.snowdayDesktop?.updates || null;
  let upd = null,
    updState = '',
    welcome = '';
  const MB = (b) =>
    (b < 1048576
      ? Math.max(0.1, b / 1048576).toFixed(1)
      : (b / 1048576).toFixed(b < 10485760 ? 1 : 0)) + ' MB';
  function when(build) {
    if (!build || build < 1e9) return 'the version that came with the app';
    return new Date(build * 1000).toLocaleString(undefined, {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  }
  const updWanted = () =>
    !!upd && (['available', 'ready', 'needs-app'].includes(upd.state) || !!upd.app);
  function updLine() {
    if (!upd) return '';
    if (upd.state === 'available') return 'New version ready to install';
    if (upd.state === 'downloading') return 'Downloading… ' + Math.round(upd.progress * 100) + '%';
    if (upd.state === 'ready') return 'Downloaded · restart to play it';
    if (upd.state === 'needs-app' || upd.app) return 'A new version of the app is out';
    if (upd.state === 'current') return 'Your game is up to date';
    if (upd.state === 'checking') return 'Checking…';
    return '';
  }
  function updNotice() {
    const note = $('fx-upd-note');
    const onMenu = page === 'title' || page === 'main';
    let text = '';
    if (welcome) text = welcome;
    else if (upd?.state === 'available')
      text = 'New update available · open Update in the main menu';
    else if (upd?.state === 'ready') text = 'Update downloaded · open Update to restart with it';
    else if (upd?.state === 'needs-app' || upd?.app)
      text = 'A new version of the app is out · see Update';
    note.hidden = !desk || !onMenu || !text;
    note.textContent = text;
    note.classList.toggle('fx-upd-done', !!welcome);
  }
  $('fx-upd-note').onclick = () => {
    if (welcome) {
      welcome = '';
      return updNotice();
    }
    if (page === 'title') enterMain();
    if (page === 'main') show('update', '[data-act="install"]');
  };
  function renderUpdate(fresh) {
    const s = upd || { state: 'checking', game: {}, progress: 0 };
    const head = $('fx-upd-head'),
      text = $('fx-upd-text'),
      bar = $('fx-upd-bar'),
      box = $('fx-upd-actions');
    const o = s.offer;
    const heads = {
      checking: ['Checking for updates…', 'Looking on GitHub for a newer version of the game.'],
      current: [
        'Your game is up to date',
        'You have the newest version. The app checks again every hour, and this screen tells you when something new is out.',
      ],
      available: [
        'A new update is ready',
        o
          ? `${o.notes || 'Fixes and improvements'}. Download size ${MB(o.downloadBytes)}. Your saves and settings are kept, and the game restarts on the title screen.`
          : '',
      ],
      downloading: [
        'Downloading the update…',
        'Only the files that changed are downloaded. Please keep the app open.',
      ],
      ready: [
        'Update downloaded',
        'The game restarts on the title screen to use the new version. Your saves are kept.',
      ],
      'needs-app': [
        'A new app is needed',
        'The newest game needs the new version of the app. Get the new app, extract it to a new folder and run it. Your saves carry over.',
      ],
      offline: [
        'Could not check for updates',
        s.message || 'Check the internet connection and try again.',
      ],
      error: [
        'The update did not finish',
        s.message || 'Your current game was kept. Try again in a few minutes.',
      ],
      off: ['Updates are off', s.message || 'This copy does not check for updates.'],
      idle: ['Checking for updates…', ''],
    };
    const [title, body] = heads[s.state] || heads.idle;
    head.textContent = title;
    text.textContent = body;
    bar.hidden = s.state !== 'downloading' && s.state !== 'ready';
    bar.firstElementChild.style.width =
      Math.round((s.state === 'ready' ? 1 : s.progress) * 100) + '%';
    $('fx-upd-have').textContent =
      when(s.game?.build) +
      (s.game?.notes ? ' · ' + s.game.notes : '') +
      (s.appVersion ? ` · app ${s.appVersion}` : '');
    const newText = o
      ? when(o.build) + (o.notes ? ' · ' + o.notes : '')
      : s.app
        ? `New app ${s.app.version}`
        : '';
    $('fx-upd-new').textContent = newText;
    $('fx-upd-new').hidden = $('fx-upd-new-label').hidden = !newText;
    // Buttons are rebuilt only when the state changes, so progress never steals focus.
    if (!fresh && s.state === updState && !(s.app && !box.querySelector('[data-act="app"]')))
      return;
    updState = s.state;
    const had = document.activeElement?.dataset?.act;
    const acts = [];
    const act = (id, label, fn, cls = '') => {
      const b = item(label, { 'data-act': id, class: cls });
      b.onclick = fn;
      acts.push(b);
    };
    if (s.state === 'available')
      act(
        'install',
        'Update now',
        () => {
          api.tone(523, 0.2, 0.05);
          desk.install();
        },
        'fx-go'
      );
    if (s.app || s.state === 'needs-app')
      act(
        'app',
        `Get the new app${s.app ? ' (' + s.app.version + ')' : ''}`,
        () => desk.getApp(),
        s.state === 'available' ? '' : 'fx-go'
      );
    if (['current', 'offline', 'error', 'needs-app'].includes(s.state))
      act('check', 'Check again', () => desk.check());
    if (s.state === 'ready') act('restart', 'Restart now', () => location.reload(), 'fx-go');
    if (s.state !== 'downloading') act('back', 'Back', () => show('main', '[data-go="update"]'));
    box.replaceChildren(...acts);
    if (page === 'update') focusItem(box.querySelector(`[data-act="${had}"]`) || acts[0]);
  }
  function updateChanged() {
    if (page === 'update') renderUpdate(false);
    if (page === 'main') {
      const b = pages.main.querySelector('[data-go="update"]');
      if (b) {
        b.querySelector('.fx-upd-sub').textContent = updLine();
        b.classList.toggle('fx-upd-new', updWanted());
      }
    }
    updNotice();
  }
  if (desk) {
    desk.onStatus((s) => {
      upd = s;
      updateChanged();
    });
    desk.status().then((s) => {
      upd = upd || s;
      if (s.justUpdated) {
        welcome = 'Updated to the newest version' + (s.game?.notes ? ' · ' + s.game.notes : '');
        desk.seen();
        setTimeout(() => {
          welcome = '';
          updNotice();
        }, 12000);
      }
      updateChanged();
    });
  }

  const builders = {
    main() {
      const box = $('fx-main-list'),
        save = api.readSave(),
        s = status(),
        next = continueBattle(save, pixelRescued()),
        anyCleared = s.includes('cleared'),
        note = $('fx-main-note');
      box.replaceChildren();
      const add = (id, label, tip, fn, extra = '') => {
        const b = item(label, { 'data-go': id, class: extra });
        b.onclick = fn;
        b.onfocus = () => (note.textContent = tip);
        box.append(b);
        return b;
      };
      if (save?.quest && next >= 0)
        add(
          'continue',
          h('span', {}, 'Continue', h('small', { text: BATTLES[next].name })),
          `Pick up the story at the ${BATTLES[next].name}.`,
          () => pickBattle('story', next)
        );
      add(
        'story',
        'Story Mode',
        'Follow Darren, Tormund and Bucky through the valley, battle by battle.',
        () => {
          flow.mode = 'story';
          show('story', Math.max(0, continueBattle(api.readSave(), pixelRescued())));
        }
      );
      add(
        'free',
        'Free Mode',
        anyCleared
          ? 'Replay any battle you have cleared, with any hero. Your story stays exactly as it is.'
          : 'Clear a story battle first. Then you can replay it here with any hero.',
        () => {
          if (!anyCleared) return nope();
          flow.mode = 'free';
          show('story', Math.max(0, status().indexOf('cleared')));
        },
        anyCleared ? '' : 'fx-locked'
      );
      add(
        'heroes',
        'Heroes',
        'Meet the three friends: their weapons, fighting styles and special attacks.',
        () => {
          heroFrom = 'main';
          show('heroes', flow.hero);
        }
      );
      add('options', 'Options', 'Sound, difficulty, picture detail and controller buttons.', () =>
        show('options')
      );
      // Only the Windows app can update itself; the browser versions show no Update item.
      if (desk)
        add(
          'update',
          h('span', {}, 'Update', h('small', { class: 'fx-upd-sub', text: updLine() })),
          'Check for a newer version of the game and install it. Your saves are kept.',
          () => show('update', '[data-act="install"]'),
          updWanted() ? 'fx-upd-new' : ''
        );
      add(
        'pixel',
        'Pixel Adventure',
        'The original storybook game. Saves and settings are shared between the two.',
        () => api.openPixel()
      );
      const other = api.shared?.describe(api.shared.story().pixel, 'pixel game') || '';
      $('fx-main-other').textContent = other;
    },
    story() {
      const s = status(),
        recs = records(),
        list = $('fx-story-list'),
        free = flow.mode === 'free';
      $('fx-story-kind').textContent = free ? 'FREE MODE' : 'STORY MODE';
      list.replaceChildren();
      for (const ch of CHAPTERS) {
        list.append(h('li', { class: 'fx-chapter' }, h('small', { text: ch.number }), ch.title));
        BATTLES.forEach((b, i) => {
          if (b.chapter !== ch.id) return;
          const st = s[i],
            locked = free ? st !== 'cleared' : st === 'locked',
            r = recs[b.id],
            chip = locked
              ? 'Locked'
              : st === 'cleared'
                ? free
                  ? 'Replay'
                  : 'Cleared'
                : st === 'next'
                  ? 'Next'
                  : 'Open';
          const el = item(
            [
              h('span', { class: 'fx-num', text: String(i + 1).padStart(2, '0') }),
              h('span', { class: 'fx-name', text: locked && !free ? '? ? ?' : b.name }),
              r?.rank ? h('span', { class: 'fx-rank r' + r.rank, text: r.rank }) : null,
              h('span', { class: 'fx-chip ' + (locked ? 'locked' : st), text: chip }),
            ],
            { class: 'fx-battle' + (locked ? ' fx-locked' : '') }
          );
          el.onfocus = () => brief(i, locked);
          // A cleared story battle replays like Free Mode, so the story itself never goes backwards.
          el.onclick = () =>
            locked ? nope() : pickBattle(st === 'cleared' ? 'free' : flow.mode, i);
          list.append(h('li', {}, el));
        });
      }
    },
    heroes() {
      const row = $('fx-hero-row'),
        select = heroFrom === 'story';
      $('fx-hero-kind').textContent = select ? 'CHOOSE YOUR HERO' : 'HEROES';
      $('fx-hero-battle').textContent = select ? BATTLES[flow.battle].name : 'The three friends';
      row.replaceChildren();
      HERO_INFO.forEach((info, i) => {
        const el = item(
          [
            h('i', { class: ['red', 'gold', 'blue'][i] }),
            h('b', { text: info.name }),
            h('small', { text: info.title }),
          ],
          { class: 'fx-hero', 'data-hero': i }
        );
        el.onfocus = () => {
          flow.hero = i;
          heroInfo();
          camera();
        };
        el.onclick = () => {
          flow.hero = i;
          if (select) show('brief');
        };
        row.append(el);
      });
      const opts = $('fx-hero-opts');
      opts.replaceChildren();
      if (select) {
        opts.append(
          toggle(
            'Darren’s style',
            () => (flow.style === 'scarf' ? 'Polka Scarf' : 'Bare Paws'),
            () => {
              flow.style = flow.style === 'scarf' ? 'paws' : 'scarf';
              api.previewStyle(flow.style);
              heroInfo();
            }
          ),
          toggle(
            'Difficulty',
            () => (api.mode() === 'cozy' ? 'Cozy' : 'Adventure'),
            () => api.setMode(api.mode() === 'cozy' ? 'adventure' : 'cozy')
          )
        );
        const go = item('Begin battle', { class: 'fx-go' });
        go.onclick = () => show('brief');
        opts.append(go);
      }
      heroInfo();
    },
    options() {
      const box = $('fx-options-list');
      box.replaceChildren(
        toggle(
          'Sound',
          () => (api.sound() ? 'On' : 'Off'),
          () => api.setSound(!api.sound())
        ),
        toggle(
          'Difficulty',
          () => (api.mode() === 'cozy' ? 'Cozy · softer hits' : 'Adventure'),
          () => api.setMode(api.mode() === 'cozy' ? 'adventure' : 'cozy')
        ),
        toggle(
          'Picture detail',
          () => (api.quality() === 'high' ? 'High' : 'Low'),
          () => api.setQuality(api.quality() === 'high' ? 'low' : 'high')
        )
      );
      const pad = $('pad-settings');
      pad.querySelector('summary').classList.add('fx-item');
      box.append(pad);
      eraseArmed = false;
      const erase = item('Start the story over', { class: 'fx-danger' });
      erase.onclick = () => {
        if (!eraseArmed) {
          eraseArmed = true;
          erase.textContent = 'Press again to erase 3D story progress';
          return;
        }
        api.eraseStory();
        eraseArmed = false;
        erase.textContent = 'Story erased · a fresh adventure awaits';
      };
      erase.onblur = () => {
        if (eraseArmed) {
          eraseArmed = false;
          erase.textContent = 'Start the story over';
        }
      };
      const back = item('Back');
      back.onclick = () => show('main', '[data-go="options"]');
      box.append(erase, back);
    },
    update() {
      renderUpdate(true);
      // Opening the page always asks again, unless a check or download is already running.
      if (!upd || !['checking', 'downloading', 'ready', 'available'].includes(upd.state))
        desk.check();
    },
    brief() {
      const b = BATTLES[flow.battle],
        info = HERO_INFO[flow.hero],
        free = flow.mode === 'free';
      $('fx-brief-kind').textContent = free
        ? 'FREE MODE · STORY PROGRESS IS NOT CHANGED'
        : CHAPTERS.find((c) => c.id === b.chapter).title.toUpperCase();
      $('fx-brief-name').textContent = b.name;
      $('fx-brief-text').textContent = b.brief;
      $('fx-brief-goals').replaceChildren(...b.goals.map((g) => h('li', { text: g })));
      $('fx-brief-foe').textContent = b.foe;
      $('fx-brief-hero').textContent =
        info.name +
        (flow.hero === 0
          ? ` · ${flow.style === 'scarf' ? 'Polka Scarf' : 'Bare Paws'}`
          : ` · ${info.weapon}`);
      $('fx-brief-mode').textContent = api.mode() === 'cozy' ? 'Cozy' : 'Adventure';
      const go = $('fx-begin');
      go.onclick = begin;
      go.onpointermove = (e) => hover(go, e);
    },
    results() {},
  };
  function toggle(label, value, change) {
    const v = h('b', { text: value() }),
      el = item([h('span', { text: label }), h('span', { class: 'fx-val' }, '◂ ', v, ' ▸')], {
        class: 'fx-toggle',
      });
    el.onclick = () => {
      change();
      v.textContent = value();
      api.tone(620, 0.06);
    };
    el.dataset.toggle = '1';
    return el;
  }
  function nope() {
    api.tone(150, 0.12, 0.04);
    const f = document.activeElement;
    if (f && root.contains(f)) {
      f.classList.remove('fx-shake');
      void f.offsetWidth;
      f.classList.add('fx-shake');
    }
  }

  // ---- Story select details ----
  function brief(i, locked) {
    flow.battle = i;
    const b = BATTLES[i],
      r = records()[b.id],
      free = flow.mode === 'free';
    $('fx-sel-name').textContent = locked && !free ? 'Locked battle' : b.name;
    $('fx-sel-place').textContent =
      locked && !free ? 'Clear the battles before it to open this one.' : b.place;
    $('fx-sel-text').textContent = locked
      ? free
        ? 'Clear this battle in Story Mode to replay it here.'
        : ''
      : b.brief;
    $('fx-sel-foe').textContent = locked && !free ? '? ? ?' : b.foe;
    $('fx-sel-goals').replaceChildren(
      ...(locked && !free ? [] : b.goals.map((g) => h('li', { text: g })))
    );
    $('fx-sel-record').textContent = r
      ? `Best rank ${r.rank} · ${clock(r.time)} · ${r.ko} K.O. · ${r.combo} hit combo`
      : 'No record yet';
    drawMap();
  }
  function drawMap() {
    const c = $('fx-map'),
      ctx = c.getContext('2d'),
      data = api.worldData(),
      bg = api.mapBackground(),
      w = c.width,
      ht = c.height,
      sx = w / (data.WORLD.w * 0.04),
      sz = ht / (data.WORLD.h * 0.04);
    if (bg) ctx.drawImage(bg, 0, 0, w, ht);
    ctx.fillStyle = '#0b1d2a55';
    ctx.fillRect(0, 0, w, ht);
    const s = status(),
      spots = BATTLES.map((b) => battleSite(b, data));
    // The route, in story order, from the cottage.
    ctx.setLineDash([6, 6]);
    ctx.strokeStyle = '#f3d27a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(16.8 * sx, 51 * sz);
    spots.slice(0, 4).forEach((p) => ctx.lineTo(p.x * sx, p.z * sz));
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#fff4d6';
    ctx.font = 'bold 12px system-ui';
    ctx.fillText('⌂ Home', 16.8 * sx - 10, 51 * sz + 20);
    spots.forEach((p, i) => {
      const sel = i === flow.battle,
        st = s[i];
      if (sel) {
        ctx.strokeStyle = `rgba(255,214,110,${0.4 + 0.4 * Math.sin(pulse * 4)})`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(p.x * sx, p.z * sz, 15 + 3 * Math.sin(pulse * 4), 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.fillStyle = st === 'cleared' ? '#4f8a5b' : st === 'locked' ? '#55606a' : '#c23b33';
      ctx.strokeStyle = sel ? '#ffe9a8' : '#10202c';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x * sx, p.z * sz, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 11px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText(String(i + 1), p.x * sx, p.z * sz + 4);
      ctx.textAlign = 'start';
    });
  }

  // ---- Hero select details ----
  function heroInfo() {
    const i = flow.hero,
      info = HERO_INFO[i],
      set = MOVESETS[movesetKey(i, i === 0 ? flow.style : 'paws')];
    $('fx-hi-name').textContent = info.name;
    $('fx-hi-title').textContent = info.title;
    $('fx-hi-about').textContent = info.about;
    $('fx-hi-weapon').textContent = i === 0 ? set.name : info.weapon;
    $('fx-hi-special').textContent = set.special?.name
      ? set.special.name.toLowerCase().replace(/(^|[\s-])\w/g, (m) => m.toUpperCase())
      : info.special;
    const stars = $('fx-hi-stars');
    stars.replaceChildren(
      ...Object.entries({ Power: 'power', Speed: 'speed', Reach: 'reach', Guard: 'guard' }).map(
        ([label, k]) => {
          let n = info.stars[k];
          if (i === 0 && k === 'reach' && flow.style === 'scarf') n = 5;
          if (i === 0 && k === 'power' && flow.style === 'scarf') n = 2;
          return h(
            'li',
            {},
            h('span', { text: label }),
            h('b', { 'aria-label': `${n} of 5`, text: '★'.repeat(n) + '☆'.repeat(5 - n) })
          );
        }
      )
    );
    $('fx-hero-opts')
      .querySelectorAll('.fx-toggle')
      .forEach((t, k) => (t.hidden = k === 0 && i !== 0));
    document
      .querySelectorAll('#fx-hero-row .fx-hero')
      .forEach((b, k) => b.classList.toggle('picked', k === i));
  }

  // ---- Flow ----
  function pickBattle(mode, i) {
    flow.mode = mode;
    flow.battle = i;
    flow.hero = api.selectedHero();
    flow.style = api.style();
    heroFrom = 'story';
    show('heroes', flow.hero);
  }
  function begin() {
    const b = BATTLES[flow.battle],
      free = flow.mode === 'free';
    api.tone(196, 0.5, 0.06);
    run = api.startBattle({
      index: flow.battle,
      free,
      hero: flow.hero,
      style: flow.style,
      save: free
        ? replaySave(flow.battle, api.readSave(), {
            hero: flow.hero,
            style: flow.style,
            mode: api.mode(),
          })
        : null,
    });
    run.battle = b;
    // In the story, the Bramble Hollow battle runs until Ruffy is home; a replay ends at the rescue.
    run.until = b.id === 'baron' && !free ? (q) => q.home : (q) => battleWon(b, q);
    run.combo = 0;
    run.hurt = 0;
    close();
    api.play();
    api.banner(b.name.replace(/^Battle of /, '').toUpperCase(), 'BATTLE START · ' + b.goals[0]);
  }
  function finish() {
    const b = run.battle,
      g = api.game(),
      r = {
        time: g.time - run.t0,
        ko: g.ko - run.ko0,
        combo: run.combo,
        hurt: Math.round(run.hurt),
      },
      letter = rank(b, r),
      all = records(),
      old = all[b.id],
      next = mergeRecord(old, r, letter);
    all[b.id] = next;
    try {
      localStorage.setItem(RECORDS, JSON.stringify(all));
    } catch {}
    const free = run.free;
    api.halt();
    const chapterEnd = !free && BATTLES[BATTLES.indexOf(b) + 1]?.chapter !== b.chapter;
    $('fx-res-kind').textContent = chapterEnd ? 'CHAPTER CLEAR' : 'VICTORY';
    $('fx-res-name').textContent = b.name;
    const newBest = (k, low) => old && (low ? r[k] < old[k] : r[k] > old[k]);
    $('fx-res-stats').replaceChildren(
      ...[
        ['Battle time', clock(r.time), newBest('time', true)],
        ['K.O. count', r.ko, newBest('ko')],
        ['Longest combo', `${r.combo} hits`, newBest('combo')],
        ['Health lost', r.hurt, false],
      ].map(([label, val, best], k) =>
        h(
          'li',
          { style: `--d:${0.15 + k * 0.18}s` },
          h('span', { text: label }),
          h('b', { text: val }),
          best ? h('em', { text: 'New record' }) : null
        )
      )
    );
    const stamp = $('fx-res-rank');
    stamp.textContent = letter;
    stamp.className = 'fx-stamp r' + letter;
    const acts = $('fx-res-actions');
    acts.replaceChildren();
    const i = BATTLES.indexOf(b),
      s = status(),
      upNext = !free ? continueBattle(api.readSave(), pixelRescued()) : -1;
    if (!free && upNext >= 0 && s[upNext] !== 'cleared') {
      const n = item(['Next battle', h('small', { text: BATTLES[upNext].name })]);
      n.onclick = () => pickBattle('story', upNext);
      acts.append(n);
    }
    if (free) {
      const again = item('Play again');
      again.onclick = () => show('brief');
      acts.append(again);
    }
    const sel = item(free ? 'Free Mode select' : 'Story select');
    sel.onclick = () => {
      api.leaveBattle();
      show(
        'story',
        free ? Math.max(0, i) : Math.max(0, continueBattle(api.readSave(), pixelRescued()))
      );
    };
    const title = item('Title screen');
    title.onclick = () => {
      api.leaveBattle();
      show('title');
    };
    acts.append(sel, title);
    run = null;
    api.tone(523, 0.6, 0.05);
    show('results');
  }

  // ---- Input ----
  function move(step, horizontal) {
    const list = items();
    if (!list.length) return;
    const f = document.activeElement;
    // Left/right on a setting changes it (each has two choices).
    if (horizontal && f?.dataset.toggle) return f.click();
    let to;
    if (page === 'heroes') {
      // Left/right moves between the hero cards; up/down between the cards and the settings.
      const cards = list.filter((e) => e.classList.contains('fx-hero')),
        rest = list.filter((e) => !cards.includes(e)),
        k = rest.indexOf(f);
      if (cards.includes(f)) {
        if (horizontal) to = cards[(cards.indexOf(f) + step + cards.length) % cards.length];
        else if (step > 0) to = rest[0];
      } else if (!horizontal)
        to = k + step < 0 ? cards[flow.hero] : rest[Math.min(rest.length - 1, k + step)];
    } else {
      const i = list.indexOf(f);
      to = list[(i + step + list.length) % list.length] || list[0];
    }
    if (to && to !== f) {
      api.tone(880, 0.03, 0.02);
      focusItem(to);
    }
  }
  function confirm() {
    if (page === 'title') return enterMain();
    const f = document.activeElement;
    if (f && root.contains(f)) {
      if (f.tagName === 'SUMMARY') f.parentElement.open = !f.parentElement.open;
      else f.click();
    } else items()[0]?.click();
  }
  function back() {
    api.tone(330, 0.06, 0.025);
    if (page === 'main') show('title');
    else if (page === 'story') show('main', `[data-go="${flow.mode}"]`);
    else if (page === 'heroes')
      heroFrom === 'story' ? show('story', flow.battle) : show('main', '[data-go="heroes"]');
    else if (page === 'options') show('main', '[data-go="options"]');
    else if (page === 'update') {
      if (upd?.state === 'downloading') return nope();
      show('main', '[data-go="update"]');
    } else if (page === 'brief') show('heroes', flow.hero);
  }
  function enterMain() {
    if (!ready) return;
    api.unlock();
    api.tone(392, 0.25, 0.05);
    show('main');
  }
  const KEYS = {
    ArrowUp: () => move(-1, false),
    KeyW: () => move(-1, false),
    ArrowDown: () => move(1, false),
    KeyS: () => move(1, false),
    ArrowLeft: () => move(-1, true),
    KeyA: () => move(-1, true),
    ArrowRight: () => move(1, true),
    KeyD: () => move(1, true),
    Enter: confirm,
    Space: confirm,
    KeyJ: confirm,
    Escape: back,
    Backspace: back,
    KeyK: back,
  };
  function key(e) {
    if (e.target.tagName === 'SELECT') return;
    if (page === 'title' && !e.repeat && !['Tab', 'F11', 'F12'].includes(e.code)) {
      e.preventDefault();
      return enterMain();
    }
    const fn = KEYS[e.code];
    if (!fn) return;
    // Enter/Space on a focused button click it by themselves; avoid double presses.
    if ((e.code === 'Enter' || e.code === 'Space') && document.activeElement?.tagName === 'BUTTON')
      return;
    e.preventDefault();
    fn();
  }
  function pad(pressed, axes, dt) {
    const edge = (i) => pressed[i] && !held[i];
    const x = axes[0] || 0,
      y = axes[1] || 0;
    if (page === 'title') {
      if (pressed.some((p, i) => p && !held[i])) enterMain();
    } else {
      if (edge(12)) move(-1, false);
      if (edge(13)) move(1, false);
      if (edge(14)) move(-1, true);
      if (edge(15)) move(1, true);
      if (edge(0) || edge(9)) confirm();
      if (edge(1)) back();
      // Left stick: one step per push, repeating while held.
      if (Math.abs(x) > 0.6 || Math.abs(y) > 0.6) {
        stickTime -= dt;
        if (stickTime <= 0) {
          if (Math.abs(y) >= Math.abs(x)) move(Math.sign(y), false);
          else move(Math.sign(x), true);
          // The first push repeats after a pause, then faster while held.
          stickTime = stickHeld ? 0.2 : 0.4;
          stickHeld = true;
        }
      } else {
        stickTime = 0;
        stickHeld = false;
      }
    }
    held = pressed.slice();
  }
  // The very first pad read on a page ignores buttons already down (the press that opened it).
  function padReset(pressed) {
    held = pressed.slice();
  }

  // ---- Battle tracking ----
  function tick(dt) {
    pulse += dt;
    if (page === 'story' && !root.hidden) drawMap();
    if (!run) return;
    const g = api.game();
    run.combo = Math.max(run.combo, g.combo);
    if (!g.paused && run.until(g.quest)) finish();
  }
  function event(e) {
    if (run && e.type === 'hurt' && e.damage) run.hurt += e.damage;
  }
  function close() {
    if (page && pages[page]) pages[page].hidden = true;
    page = null;
    root.hidden = true;
    api.showcase(null);
  }

  return {
    get open() {
      return !root.hidden;
    },
    get page() {
      return page;
    },
    get replaying() {
      return api.isReplay();
    },
    get run() {
      return run;
    },
    setReady() {
      ready = true;
      const b = $('fx-start');
      b.disabled = false;
      b.textContent = 'Press Start';
      b.onclick = enterMain;
    },
    show,
    close,
    key,
    pad,
    padReset,
    tick,
    event,
    // Pause menu: leave the battle for the story select or the title screen.
    leave(to) {
      const free = api.isReplay();
      run = null;
      api.leaveBattle();
      if (to !== 'story') return show('title');
      flow.mode = free ? 'free' : 'story';
      show(
        'story',
        free ? flow.battle : Math.max(0, continueBattle(api.readSave(), pixelRescued()))
      );
    },
    // For tests: the battle the story continues with.
    nextBattle: () => continueBattle(api.readSave(), pixelRescued()),
  };
}
