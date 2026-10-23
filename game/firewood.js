'use strict';
/* Chapter two retains chapter one's terrain and saves. Character poses follow simulation clocks. */
const FIREWOOD_KEY = 'darren-firewood-v1';
const WOOD_HOME = { x: 420, y: 1260, label: 'Mom’s cottage' };
const BUCKY_MEETING = { x: 735, y: 1310, label: 'Meet Bucky' };
const WOOD_SITES = [
  { x: 1220, y: 1320, name: 'Bridge birch' },
  { x: 1450, y: 1550, name: 'Windfall grove' },
  { x: 1760, y: 1200, name: 'Pine trail' },
];
let bucky = null,
  firewoodSave = null;
try {
  const s = JSON.parse(localStorage.getItem(FIREWOOD_KEY));
  if (
    s?.version === 1 &&
    Array.isArray(s.collected) &&
    s.collected.length === 3 &&
    s.collected.every((v) => typeof v === 'boolean')
  )
    firewoodSave = s;
} catch (e) {}
function refreshFirewoodMenu() {
  $('#continueFirewood').hidden = !firewoodSave || firewoodSave.complete;
  $('#nextChapter').hidden = !(G?.complete && !G?.firewood);
}
const chapterNewGame = newGame;
newGame = function (mode) {
  bucky = null;
  chapterNewGame(mode);
  $('#endContinue').textContent = 'Continue from saved camp';
  refreshFirewoodMenu();
};
function safeStoryPosition(x, y, r = 16) {
  if (canOccupy(x, y, r)) return { x, y };
  for (let d = 24; d <= 192; d += 24)
    for (let k = 0; k < 16; k++) {
      const a = (k * TAU) / 16,
        q = { x: x + Math.cos(a) * d, y: y + Math.sin(a) * d };
      if (canOccupy(q.x, q.y, r) && Math.abs(groundHeight(q.x, q.y) - groundHeight(x, y)) < 26)
        return q;
    }
  return { x: P.x, y: P.y };
}
function storyFriend(kind, x, y) {
  return {
    ...safeStoryPosition(x, y, kind === 'bucky' ? 20 : 12),
    kind,
    t: 0,
    walkT: 0,
    dir: 0,
    moving: false,
    attack: null,
    cooldown: 0.4,
    shieldT: 0,
    workT: 0,
    carrying: false,
  };
}
function startFirewood(resume = false) {
  initAudio();
  const saved = resume && firewoodSave && !firewoodSave.complete ? firewoodSave : null;
  const carry = saved || {
    mode: G?.mode || checkpoint?.mode || 'adventure',
    weight: P?.weight ?? checkpoint?.weight ?? 0,
    cookies: P?.cookies ?? checkpoint?.cookies ?? 0,
    style: P?.weapon ?? checkpoint?.style ?? 'paws',
  };
  newGame(carry.mode === 'cozy' ? 'cozy' : 'adventure');
  enemies = [];
  pickups = [];
  spawnT = 1e9;
  P.weight = clamp(Math.floor(Number(carry.weight) || 0), 0, 3);
  P.cookies = Math.max(P.weight * 3, clamp(Math.floor(Number(carry.cookies) || 0), 0, 999));
  P.displayWeight = P.motionWeight = P.weight;
  P.weapon = carry.style === 'snow' ? 'snow' : 'paws';
  updateStyleLabels();
  G.firewood = {
    met: !!saved?.met,
    collected: saved ? saved.collected.slice() : [false, false, false],
    sites: WOOD_SITES.map((s) => ({ ...s, spawned: false, work: 0 })),
    complete: false,
  };
  G.friend = true;
  G.time = Math.max(0, Number(saved?.time) || 0);
  G.assistCd = 0;
  G.campsDone = [true, true, true];
  G.clues = 3;
  G.baronSpawned = false;
  P.x = WOOD_HOME.x;
  P.y = WOOD_HOME.y;
  ally = storyFriend('tormund', P.x + 60, P.y + 30);
  bucky = storyFriend(
    'bucky',
    G.firewood.met ? P.x + 90 : BUCKY_MEETING.x,
    G.firewood.met ? P.y + 85 : BUCKY_MEETING.y
  );
  bucky.carrying = G.firewood.collected.some(Boolean);
  ruffy = { x: P.x - 35, y: P.y + 45, t: 0, face: 1 };
  cam.x = P.x;
  cam.y = P.y;
  cam.z = groundHeight(P.x, P.y);
  state = 'play';
  paused = false;
  dialogOpen = false;
  dlgQ = [];
  dlgDone = null;
  show(null);
  $('#hud').hidden = false;
  $('#touch').hidden = !isTouch;
  $('#bossBox').hidden = true;
  $('#endContinue').hidden = true;
  $('#nextChapter').hidden = true;
  saveFirewood();
  updateHud();
  dialog(
    saved
      ? [
          ['Darren', 'Back to our firewood trip! Mom’s counting on us.'],
          ['Tormund', 'We kept the bundles we already gathered. Let’s follow the trail.'],
        ]
      : [
          [
            'Narrator',
            'With Ruffy safely home, the next snowday begins at Mom’s cottage. The wood basket beside the hearth is almost empty.',
          ],
          [
            'Mom',
            'Darren, could you bring back six bundles of dry firewood? Gather the fallen branches, sweetheart. Leave the living trees to grow.',
          ],
          ['Darren', 'Of course, Mom! Tormund, will you come with me?'],
          [
            'Tormund',
            'Gladly. I’ll watch the trail. Someone by the bridge looks as though he knows these woods.',
          ],
          [
            'Narrator',
            'Walk toward the golden marker to meet Bucky. Your friends fight alongside you automatically.',
          ],
        ]
  );
}
function saveFirewood() {
  if (!G?.firewood) return;
  const f = G.firewood;
  firewoodSave = {
    version: 1,
    mode: G.mode,
    met: f.met,
    collected: f.collected.slice(),
    complete: f.complete,
    time: G.time,
    weight: P.weight,
    cookies: P.cookies,
    style: P.weapon,
  };
  try {
    localStorage.setItem(FIREWOOD_KEY, JSON.stringify(firewoodSave));
    saveMessage = f.complete ? '✓ Firewood delivered' : '✓ Firewood trip saved';
  } catch (e) {
    saveMessage = 'Saving unavailable • keep this game open';
  }
  $('#saveNote').textContent = saveMessage;
  refreshFirewoodMenu();
}
const chapterSave = saveCheckpoint;
saveCheckpoint = function () {
  if (G?.firewood) {
    saveFirewood();
    return;
  }
  chapterSave();
};
const chapterAppearance = saveCampAppearance;
saveCampAppearance = function () {
  if (G?.firewood) {
    saveFirewood();
    return;
  }
  chapterAppearance();
};
const chapterWin = winGame;
winGame = function () {
  chapterWin();
  refreshFirewoodMenu();
};
const chapterLose = loseGame;
loseGame = function () {
  if (!G?.firewood) {
    chapterLose();
    return;
  }
  if (G.lost || state !== 'play') return;
  G.lost = true;
  clearControls();
  scheduled = [];
  dlgQ = [];
  dlgDone = null;
  dialogOpen = false;
  $('#dialog').hidden = true;
  later(0.8, () => {
    state = 'over';
    $('#hud').hidden = true;
    $('#touch').hidden = true;
    $('#endTitle').textContent = 'Warm paws. A fresh try.';
    $('#endText').textContent =
      'Tormund and Bucky bring Darren back to the cottage. Your gathered bundles are safe. Continue the firewood trip with full health.';
    fillStats();
    show('#sEnd');
    $('#endContinue').hidden = false;
    $('#endContinue').textContent = 'Continue firewood trip';
    $('#nextChapter').hidden = true;
  });
};
const chapterAgain = $('#again').onclick;
$('#again').onclick = () => (G?.firewood ? startFirewood(false) : chapterAgain());
$('#startFirewood').onclick = () => startFirewood(false);
$('#continueFirewood').onclick = () => startFirewood(true);
$('#nextChapter').onclick = () => startFirewood(false);
$('#endContinue').onclick = () => (G?.firewood ? startFirewood(true) : continueGame());
function firewoodTarget() {
  const f = G.firewood;
  if (!f || f.complete) return null;
  if (!f.met) return BUCKY_MEETING;
  const i = f.collected.findIndex((v) => !v);
  return i < 0 ? WOOD_HOME : { ...f.sites[i], label: f.sites[i].name };
}
const chapterTarget = objectiveTarget;
objectiveTarget = function () {
  return G?.firewood ? firewoodTarget() : chapterTarget();
};
function firewoodObjective() {
  const f = G.firewood,
    n = f.collected.filter(Boolean).length * 2;
  if (f.complete) return 'A warm home, thanks to good friends.';
  if (!f.met) return 'Meet Bucky by the bridge';
  if (n === 6) return 'Bring the 6 bundles home to Mom';
  const i = f.collected.findIndex((v) => !v),
    site = f.sites[i];
  if (site.work > 0)
    return `Bucky is bundling wood… ${Math.min(99, Math.floor((site.work / 2.4) * 100))}%`;
  if (site.spawned && enemies.some((e) => !e.dead && e.woodSite === i))
    return `Clear the trail for Bucky · ${n}/6 bundles`;
  return `Gather fallen wood · ${n}/6 bundles · ${site.name}`;
}
const chapterHud = updateHud;
updateHud = function () {
  chapterHud();
  if (!G?.firewood) return;
  const f = G.firewood;
  $('#objText').textContent = firewoodObjective();
  $('#cluePips').textContent = f.collected
    .map((v, i) => (v ? '✓ ' : '○ ') + WOOD_SITES[i].name)
    .join(' · ');
  $('#rosterText').textContent = f.met
    ? 'Tormund + Bucky · ready to help'
    : 'Tormund · meet Bucky at the bridge';
  $('#rosterDetails').textContent =
    'Tormund: sword strikes and a nearby shield guard. Bucky: wide wooden-mallet swings, wood gathering and carrying. Both defend Darren automatically. Stand near a cleared wood pile so Bucky can bundle it.';
};
function updateStoryCompanion(a, dt, kind) {
  a.kind = kind;
  a.t += dt;
  a.walkT ??= 0;
  a.dir ??= 0;
  a.cooldown = Math.max(0, (a.cooldown ?? 0) - dt);
  a.shieldT = Math.max(0, (a.shieldT || 0) - dt);
  a.moving = false;
  const mallet = kind === 'bucky',
    reach = mallet ? 125 : 110,
    impact = mallet ? 0.48 : 0.28,
    duration = mallet ? 0.95 : 0.68;
  if (a.attack) {
    const attack = a.attack;
    attack.t += dt;
    if (!attack.hit && attack.t >= impact) {
      attack.hit = true;
      const targets = mallet
        ? enemies.filter((e) => !e.dead && Math.hypot(e.x - a.x, e.y - a.y) <= reach + e.rad)
        : [attack.target];
      for (const e of targets) {
        if (
          !e ||
          e.dead ||
          Math.hypot(e.x - a.x, e.y - a.y) > reach + e.rad ||
          !groundCombatReach(a, e) ||
          !lineOfTerrain(a.x, a.y, e.x, e.y, groundHeight(a.x, a.y) + 45) ||
          Math.abs(angDiff(Math.atan2(e.y - a.y, e.x - a.x), a.dir)) > (mallet ? 1.8 : 1.2)
        )
          continue;
        hitEnemy(e, mallet ? 26 : 18, a.dir, mallet ? 9 : 4, mallet);
      }
      parts.push({
        x: a.x + Math.cos(a.dir) * 70,
        y: a.y + Math.sin(a.dir) * 70,
        kind: 'ring',
        color: mallet ? '#eac489' : '#b4e6ff',
        size: mallet ? 70 : 38,
        life: 0.23,
        max: 0.23,
      });
    }
    if (attack.t >= duration) {
      a.attack = null;
      a.cooldown = mallet ? 2.6 : 1.8;
    }
    return;
  }
  let target = nearestEnemy(260, a);
  if (target && Math.hypot(target.x - P.x, target.y - P.y) > 430) target = null;
  if (
    target &&
    a.cooldown <= 0 &&
    Math.hypot(target.x - a.x, target.y - a.y) <= reach + target.rad
  ) {
    a.dir = Math.atan2(target.y - a.y, target.x - a.x);
    a.attack = { t: 0, target, hit: false };
    return;
  }
  let goal = P,
    stop = mallet ? 115 : 80;
  if (target && a.cooldown <= 0) {
    goal = target;
    stop = reach * 0.75;
  }
  const f = G.firewood;
  if (mallet && f) {
    const i = f.collected.findIndex((v) => !v),
      site = f.sites[i];
    if (
      site &&
      Math.hypot(P.x - site.x, P.y - site.y) < 145 &&
      !enemies.some((e) => !e.dead && e.woodSite === i)
    ) {
      goal = site;
      stop = 65;
    }
  }
  const d = Math.hypot(goal.x - a.x, goal.y - a.y),
    ox = a.x,
    oy = a.y;
  if (d > stop) {
    const angle = navDirection(a, goal.x, goal.y),
      speed = Math.min(mallet ? 285 : 310, (d - stop) * 5 + 40);
    terrainMove(a, Math.cos(angle) * speed * dt, Math.sin(angle) * speed * dt, mallet ? 20 : 12);
    const moved = Math.hypot(a.x - ox, a.y - oy);
    a.moving = moved > 0.05;
    if (a.moving) {
      a.dir = Math.atan2(a.y - oy, a.x - ox);
      a.walkT += moved / 120;
    }
  }
  if (Math.hypot(a.x - P.x, a.y - P.y) > 950) {
    Object.assign(a, safeStoryPosition(P.x - 60, P.y + 65, mallet ? 20 : 12));
    a.attack = null;
  }
}
const chapterHurt = hurtPlayer;
hurtPlayer = function (dmg, ang) {
  if (
    ally &&
    !ally.attack &&
    !G?.lost &&
    Math.hypot(P.x - ally.x, P.y - ally.y) < 115 &&
    groundCombatReach(P, ally) &&
    lineOfTerrain(P.x, P.y, ally.x, ally.y, groundHeight(P.x, P.y) + 45) &&
    P.inv <= 0
  ) {
    ally.shieldT = 0.4;
    dmg *= 0.75;
  }
  chapterHurt(dmg, ang);
};
function updateFirewood(dt) {
  const f = G.firewood;
  if (!f || f.complete || G.lost || dialogOpen) return;
  if (ruffy) {
    ruffy.t += dt;
    const d = Math.hypot(P.x - ruffy.x, P.y - ruffy.y);
    if (d > 55) {
      const a = navDirection(ruffy, P.x, P.y);
      terrainMove(
        ruffy,
        Math.cos(a) * Math.min(290, d * 4) * dt,
        Math.sin(a) * Math.min(290, d * 4) * dt,
        7
      );
    }
  }
  if (!f.met) {
    if (Math.hypot(P.x - bucky.x, P.y - bucky.y) < 120 && groundCombatReach(P, bucky)) {
      f.met = true;
      saveFirewood();
      dialog([
        ['Darren', 'Hello! I’m Darren. Mom needs firewood before the next snowfall.'],
        [
          'Bucky',
          'I’m Bucky! These paws are great for carrying big bundles. Mind if a big blue Grarrl tags along?',
        ],
        ['Tormund', 'We would welcome the help. What is that wooden mallet for?'],
        [
          'Bucky',
          'Loosening frozen deadwood—and giving those pesky goons a good knockback! We only take wood already on the ground.',
        ],
        ['Darren', 'Then let’s bring some warmth home together!'],
        [
          'Narrator',
          'Follow the marker to each wood pile. Clear the nearby goons, then stay by the pile while Bucky bundles the wood.',
        ],
      ]);
    }
    return;
  }
  const i = f.collected.findIndex((v) => !v);
  if (i < 0) {
    bucky.carrying = true;
    ally.carrying = true;
    if (
      Math.hypot(P.x - WOOD_HOME.x, P.y - WOOD_HOME.y) < 100 &&
      Math.hypot(bucky.x - P.x, bucky.y - P.y) < 220
    ) {
      clearControls();
      dialog(
        [
          ['Mom', 'Six lovely bundles! Come in, all of you. The kettle is just beginning to sing.'],
          ['Darren', 'Bucky helped! He carried the biggest bundles, and Tormund kept us safe.'],
          ['Bucky', 'A warm hearth and new friends? That’s a very good day in my book.'],
          [
            'Tormund',
            'A fine quest need not end with a crown. Sometimes it ends with a cup of cocoa.',
          ],
          [
            'Narrator',
            'Ruffy curls up beside the hearth. Outside, the snow settles softly over three sets of footprints.',
          ],
        ],
        finishFirewood
      );
    }
    return;
  }
  const site = f.sites[i],
    d = Math.hypot(P.x - site.x, P.y - site.y);
  if (d < 320 && !site.spawned) {
    site.spawned = true;
    for (let k = 0; k < 3 + i; k++) {
      const q = safeStoryPosition(
        site.x + 80 + Math.cos((k * TAU) / (3 + i)) * 80,
        site.y + Math.sin((k * TAU) / (3 + i)) * 70
      );
      const e = makeEnemy(k % 3 === 2 ? 'bale' : 'gopher', q.x, q.y);
      e.woodSite = i;
      e.guard = { x: site.x, y: site.y };
      enemies.push(e);
    }
    banner(site.name, 'Clear the fallen-wood pile');
  }
  const blocked = enemies.some((e) => !e.dead && e.woodSite === i);
  const ready =
    site.spawned &&
    !blocked &&
    d < 135 &&
    Math.hypot(bucky.x - site.x, bucky.y - site.y) < 130 &&
    groundCombatReach(P, site);
  if (ready) {
    site.work += dt;
    bucky.workT = site.work;
    bucky.dir = Math.atan2(site.y - bucky.y, site.x - bucky.x);
    if (site.work >= 2.4) {
      f.collected[i] = true;
      bucky.workT = 0;
      bucky.carrying = true;
      P.hp = Math.min(P.max, P.hp + 12);
      saveFirewood();
      sfx.pickup();
      banner(
        (i + 1) * 2 + ' / 6 BUNDLES',
        i === 2 ? 'Bring the wood home to Mom' : 'Bucky ties the bundle tight'
      );
    }
  } else {
    site.work = 0;
    bucky.workT = 0;
  }
}
function finishFirewood() {
  const f = G.firewood;
  if (!f || f.complete) return;
  f.complete = true;
  G.complete = true;
  saveFirewood();
  state = 'over';
  $('#hud').hidden = true;
  $('#touch').hidden = true;
  $('#endTitle').textContent = 'A hearth full of warmth.';
  $('#endText').textContent =
    'Darren, Tormund and Bucky brought all six bundles home. Mom has firewood for the snowy evening, Ruffy has his warm spot, and Darren has a new friend.';
  fillStats();
  show('#sEnd');
  $('#endContinue').hidden = true;
  $('#nextChapter').hidden = true;
}
const chapterUpdate = update;
update = function (dt) {
  chapterUpdate(dt);
  if (state === 'play' && !paused && !dialogOpen && !G.lost) updateFirewood(dt);
};
const chapterMini = drawMini;
drawMini = function () {
  chapterMini();
  if (!G?.firewood) return;
  const w = mini.width,
    h = mini.height;
  mg.clearRect(0, 0, w, h);
  mg.fillStyle = '#e4eee5';
  mg.fillRect(0, 0, w, h);
  const at = (x, y) => ({
    x: 18 + ((x - 300) / 1580) * (w - 36),
    y: 20 + ((y - 1100) / 620) * (h - 42),
  });
  mg.strokeStyle = '#b1a177';
  mg.lineWidth = 3;
  mg.beginPath();
  [WOOD_HOME, BUCKY_MEETING, ...WOOD_SITES].forEach((q, i) => {
    const p = at(q.x, q.y);
    if (i) mg.lineTo(p.x, p.y);
    else mg.moveTo(p.x, p.y);
  });
  mg.stroke();
  for (const [i, s] of WOOD_SITES.entries()) {
    const p = at(s.x, s.y);
    mg.fillStyle = G.firewood.collected[i] ? '#80b38c' : '#9d6e40';
    circ(mg, p.x, p.y, 6);
  }
  for (const [a, color] of [
    [WOOD_HOME, '#dc9c38'],
    [P, '#df544a'],
    [bucky, '#3278ba'],
    [ally, '#cfad3d'],
  ]) {
    if (!a) continue;
    const p = at(a.x, a.y);
    mg.fillStyle = color;
    circ(mg, p.x, p.y, 4);
  }
  mg.fillStyle = '#344557';
  mg.font = 'bold 11px sans-serif';
  mg.fillText('FIREWOOD TRAIL · gold = home', 8, h - 8);
};
refreshFirewoodMenu();

/* Finite atlas frames; no textures are allocated while characters move or fight. */
function prepareStoryCast(scene) {
  for (const kind of ['tormund', 'bucky']) {
    const texture = scene.textures.get(kind + '-actions');
    if (!texture) continue;
    for (let i = 0; i < 16; i++)
      texture.add(String(i), 0, (i % 4) * 256, Math.floor(i / 4) * 256, 256, 256);
    texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
  }
  const props = scene.textures.get('firewood-props');
  if (props)
    for (let i = 0; i < 4; i++)
      props.add(String(i), 0, (i % 2) * 384, Math.floor(i / 2) * 384, 384, 384);
}
function companionPose(a) {
  if (G?.firewood?.complete) return 7;
  if (a.attack) {
    const hit = a.kind === 'bucky' ? 0.48 : 0.28;
    return a.attack.t < hit ? 3 : a.attack.t < hit + 0.14 ? 4 : 5;
  }
  if (a.workT > 0) {
    const phase = a.workT % 0.8;
    return phase < 0.35 ? 3 : phase < 0.5 ? 4 : 5;
  }
  if (a.carrying) return 6;
  return a.moving ? (Math.floor(a.walkT * 3) % 2 ? 1 : 2) : 0;
}
function drawStoryCompanion(scene, a, kind) {
  const p = groundProject(Math.cos(a.dir || 0), Math.sin(a.dir || 0)),
    back = p.y < -0.05,
    index = companionPose(a) + (back ? 8 : 0),
    scale = kind === 'bucky' ? 1.18 : 1.0;
  scene.actor(
    kind + '-shadow',
    a.x,
    a.y,
    { texture: 'shadow', frame: '__BASE', originX: 0.5, originY: 0.5 },
    { scaleX: kind === 'bucky' ? 1.9 : 1.3, alpha: 0.23, depth: -0.6 }
  );
  scene.actor(
    a,
    a.x,
    a.y,
    {
      texture: kind + '-actions',
      frame: String(index),
      originX: 0.5,
      originY: 224 / 256,
      pixelScale: 1,
    },
    {
      scale,
      flip: back ? p.x > 0 : p.x < 0,
      z: a.moving && !reduceMotion ? Math.abs(Math.sin(a.walkT * 9)) * 2 : 0,
    }
  );
  if (a.shieldT > 0)
    scene.groundMark(
      'tormund-guard',
      a.x,
      a.y,
      Array.from({ length: 24 }, (_, i) => [
        a.x + Math.cos((i / 24) * TAU) * 48,
        a.y + Math.sin((i / 24) * TAU) * 48,
        3,
      ]),
      0xafdfff,
      0.3
    );
}
function drawFirewoodObjects(scene) {
  const f = G?.firewood;
  if (!f) return;
  if (bucky) drawStoryCompanion(scene, bucky, 'bucky');
  for (const [i, s] of f.sites.entries()) {
    scene.actor(
      'wood-site-' + i,
      s.x,
      s.y,
      {
        texture: 'firewood-props',
        frame: f.collected[i] ? '3' : '1',
        originX: 0.5,
        originY: 330 / 384,
        pixelScale: 1,
      },
      { scale: 0.43, alpha: Math.hypot(P.x - s.x, P.y - s.y) < 105 ? 0.38 : 1 }
    );
  }
  if (f.complete)
    scene.actor(
      'home-bundles',
      WOOD_HOME.x - 45,
      WOOD_HOME.y - 55,
      { texture: 'firewood-props', frame: '2', originX: 0.5, originY: 330 / 384, pixelScale: 1 },
      { scale: 0.24, alpha: f.complete ? 1 : 0.45 }
    );
  const target = firewoodTarget();
  if (target) {
    const r = 28 + Math.sin(rt * 3) * 3;
    scene.groundMark(
      'wood-target',
      target.x,
      target.y,
      Array.from({ length: 32 }, (_, i) => [
        target.x + Math.cos((i / 32) * TAU) * r,
        target.y + Math.sin((i / 32) * TAU) * r,
        3,
      ]),
      0xf0c65b,
      0.38,
      0xc39332
    );
  }
}

const originalStoryProp = storybookPropFrame;
storybookPropFrame = function (scene, p, quarter) {
  if (G?.firewood && p.kind === 'cottage' && p.x === 330)
    return {
      texture: 'firewood-props',
      frame: '0',
      originX: 0.5,
      originY: 330 / 384,
      pixelScale: 0.82,
    };
  return originalStoryProp(scene, p, quarter);
};
