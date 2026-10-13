// Story select data and rules for the 3D game's front end (Claude update 13).
// Pure functions over the game's own save (snowday-3d-v1), so nothing here changes the save
// format: a battle's status is read from the quest flags the game already keeps.
import { BOSSES, CAMP_BOSSES } from './sim.mjs';

const S = 0.04;
export const CHAPTERS = [
  {
    id: 'rescue',
    title: 'Ruffy’s Rescue',
    number: 'Chapter One',
    blurb: 'Ruffy has wandered off across the Snowbell Valley. Three camps stand in the way.',
  },
  {
    id: 'firewood',
    title: 'Firewood for Mom',
    number: 'Chapter Two',
    blurb: 'Ruffy is home and the hearth is cold. Clear the trails and gather six dry bundles.',
  },
];

// One entry per battle, in story order. `site` is the map spot in metres; `par` is the time
// (seconds) and K.O. count a strong run reaches, used only for the rank on the results screen.
export const BATTLES = [
  {
    id: 'spud',
    chapter: 'rescue',
    name: 'Battle of Spud Barricade',
    place: 'Spud Barricade',
    foe: BOSSES.spud.name,
    goals: [`Defeat ${BOSSES.spud.name}`, 'Find Ruffy’s bell at the barricade'],
    brief:
      'Gophers and crows guard the potato barricade on the high north road. Their sergeant demands a toll nobody can pay.',
    par: { time: 240, ko: 20 },
  },
  {
    id: 'weed',
    chapter: 'rescue',
    name: 'Battle of Windswept Ring',
    place: 'Windswept Ring',
    foe: BOSSES.weed.name,
    goals: [`Defeat ${BOSSES.weed.name}`, 'Find Ruffy’s chewed toy in the ring'],
    brief:
      'Down in the southern prairie the wind never stops. Madame Tumbleweed rolls at anyone who comes near.',
    par: { time: 300, ko: 25 },
  },
  {
    id: 'cluck',
    chapter: 'rescue',
    name: 'Battle of Coop Command',
    place: 'Coop Command',
    foe: BOSSES.cluck.name,
    goals: [`Defeat ${BOSSES.cluck.name}`, 'Follow the paw prints out of the coop'],
    brief:
      'Colonel Cluck’s eastern fort is the best guarded camp in the valley. Watch the sky for his egg barrage.',
    par: { time: 300, ko: 30 },
  },
  {
    id: 'baron',
    chapter: 'rescue',
    name: 'Battle of Bramble Hollow',
    place: 'Bramble Hollow',
    foe: BOSSES.baron.name,
    goals: [`Defeat ${BOSSES.baron.name}`, 'Find Ruffy beside Bramble Keep'],
    brief:
      'The trail ends in a thorny hollow far to the east. The Bramble Baron says finders keepers. He is wrong.',
    par: { time: 360, ko: 30 },
  },
  {
    id: 'wood',
    chapter: 'firewood',
    name: 'Firewood for Mom',
    place: 'Bridge birch, Windfall grove, Pine trail',
    foe: 'Trail raiders',
    goals: ['Clear the raiders from three wood sites', 'Carry six bundles home to Mom'],
    brief:
      'Fallen wood lies at the bridge birch, the windfall grove and the pine trail, and each spot has unwelcome guests.',
    par: { time: 420, ko: 12 },
  },
];

// Where each battle sits on the valley map (metres), for the story select map.
export function battleSite(battle, world) {
  const i = CAMP_BOSSES.indexOf(battle.id);
  if (i >= 0) return { x: world.CAMPS[i].x * S, z: world.CAMPS[i].y * S };
  if (battle.id === 'baron') return { x: world.HOLLOW.x * S, z: world.HOLLOW.y * S };
  const w = world.WOOD_SITES;
  return {
    x: (w.reduce((s, p) => s + p.x, 0) / w.length) * S,
    z: (w.reduce((s, p) => s + p.y, 0) / w.length) * S,
  };
}

function questOf(save) {
  const q = save && save.version === 1 && save.quest;
  return q && Array.isArray(q.clues) ? q : null;
}
// Is a battle finished in this story save?
export function cleared(battle, save) {
  const q = questOf(save);
  if (!q) return false;
  const i = CAMP_BOSSES.indexOf(battle.id);
  if (i >= 0) return q.clues[i] === true;
  if (battle.id === 'baron') return q.rescued === true;
  return q.delivered === true;
}
// Ruffy is home (in this game, or in the pixel game when `pixelRescued`), so chapter two opens.
export function rescueDone(save, pixelRescued = false) {
  const q = questOf(save);
  return !!pixelRescued || !!(q && q.home === true);
}
// Status of every battle: 'cleared', 'next' (the one the story continues with), 'open'
// (playable but not next, only chapter two while the rescue is unfinished) or 'locked'.
export function storyStatus(save, pixelRescued = false) {
  let next = null;
  const out = BATTLES.map((b) => {
    if (cleared(b, save)) return 'cleared';
    const chapterOpen = b.chapter === 'rescue' || rescueDone(save, pixelRescued);
    if (!chapterOpen) return 'locked';
    if (b.chapter === 'firewood') return 'open';
    if (next === null) return (next = 'next');
    return 'locked';
  });
  // Chapter two is the next battle once the whole rescue is done (and Ruffy is home).
  const wood = BATTLES.length - 1;
  if (out[wood] === 'open' && out.slice(0, wood).every((s) => s === 'cleared')) out[wood] = 'next';
  // After the Baron falls, the rescue still needs Ruffy brought home: that walk belongs to the
  // Bramble Hollow battle, so it stays the one to continue.
  const q = questOf(save);
  if (q && q.rescued && !q.home && out[wood] !== 'cleared') out[3] = 'next';
  return out;
}
// The battle "Continue" picks: the story's next battle, else chapter two if it is open.
export function continueBattle(save, pixelRescued = false) {
  const s = storyStatus(save, pixelRescued);
  const i = s.indexOf('next');
  return i >= 0 ? i : s.indexOf('open');
}

// A save for replaying a cleared battle without touching the story save. It starts the world
// just before that battle: earlier camps cleared, later ones untouched.
export function replaySave(index, story, choice = {}) {
  const base = story && story.version === 1 ? story : {},
    wood = BATTLES[index].chapter === 'firewood',
    before = (i) => wood || i < index;
  return {
    version: 1,
    quest: {
      chapter: wood ? 'firewood' : 'rescue',
      clues: [0, 1, 2].map(before),
      rescued: wood,
      home: wood,
      wood: [false, false, false],
      delivered: false,
    },
    cookies: Number(base.cookies) || 0,
    taken: Array.isArray(base.taken) ? base.taken.slice() : [],
    selected: choice.hero ?? 0,
    stats: { attacks: 0, charged: 0, hits: 0, distance: 0 },
    mode: choice.mode ?? base.mode ?? 'adventure',
    style: choice.style ?? base.style ?? 'paws',
    bosses: [0, 1, 2, 3].map(before),
    ko: 0,
    bestCombo: 0,
    lastCamp: wood ? 2 : index - 1,
  };
}

// Is the battle won in the running game? (quest flags as kept by sim.mjs)
export function battleWon(battle, quest) {
  const i = CAMP_BOSSES.indexOf(battle.id);
  if (i >= 0) return quest.clues[i];
  if (battle.id === 'baron') return quest.rescued;
  return quest.delivered;
}

// Rank for the results screen: up to two points each for speed, K.O.s and health kept, plus
// one for a long combo. S needs 6 of 7.
export function rank(battle, r) {
  const par = battle.par;
  let pts = 0;
  pts += r.time <= par.time ? 2 : r.time <= par.time * 1.6 ? 1 : 0;
  pts += r.ko >= par.ko ? 2 : r.ko >= par.ko / 2 ? 1 : 0;
  pts += r.hurt <= 60 ? 2 : r.hurt <= 180 ? 1 : 0;
  pts += r.combo >= 25 ? 1 : 0;
  return pts >= 6 ? 'S' : pts >= 4 ? 'A' : pts >= 2 ? 'B' : 'C';
}
const ORDER = 'CBAS';
// Best results per battle, kept in their own record (snowday-3d-records-v1).
export function mergeRecord(old, r, letter) {
  const o = old && typeof old === 'object' ? old : {};
  const better = (a, b, low) => (typeof a !== 'number' ? b : low ? Math.min(a, b) : Math.max(a, b));
  return {
    time: better(o.time, r.time, true),
    ko: better(o.ko, r.ko),
    combo: better(o.combo, r.combo),
    rank: ORDER.indexOf(o.rank) >= ORDER.indexOf(letter) ? o.rank : letter,
  };
}
export function clock(seconds) {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// The three heroes as the hero select shows them. Stars run 1-5.
export const HERO_INFO = [
  {
    name: 'Darren',
    title: 'The red Shoyru',
    weapon: 'Bare Paws or the Polka Scarf',
    special: 'Scarf-Star Blizzard · Polka Cyclone',
    about:
      'Quick and bouncy. Fights with paws, tail and wings, or swaps to his polka-dot scarf for long, flowing reach. Every three cookies make him hit harder.',
    stars: { power: 3, speed: 5, reach: 3, guard: 2 },
  },
  {
    name: 'Tormund',
    title: 'The golden Lupe knight',
    weapon: 'Sword and shield',
    special: 'Golden Crescent',
    about:
      'Steady and brave. Dodge while standing still to raise his shield: a parry stops the blow and strikes back.',
    stars: { power: 4, speed: 4, reach: 4, guard: 5 },
  },
  {
    name: 'Bucky',
    title: 'The chubby blue Grarrl',
    weapon: 'Log mallet',
    special: 'Timber Avalanche',
    about:
      'Slow and mighty. Heavy swings shrug off small hits, and his ground smashes send a snow wave rolling out.',
    stars: { power: 5, speed: 2, reach: 4, guard: 4 },
  },
];
