const assert = require('assert');
const { c, vm, elem } = require('./support.cjs');
const run = (s) => vm.runInContext(s, c);
let native = [],
  fallback = [];
c.navigator.getGamepads = () => native;
c.Event = function (type) {
  this.type = type;
};
const pad = {
  id: 'Standard test pad',
  index: 0,
  connected: true,
  mapping: 'standard',
  buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })),
  axes: [0, 0, 0, 0],
};
c.scene = { input: { gamepad: { getAll: () => fallback } } };
function tick() {
  run('pollControllers(scene,.1)');
}
function button(i, v) {
  pad.buttons[i] = { pressed: v, value: v ? 1 : 0 };
  tick();
}
function tap(i) {
  button(i, true);
  button(i, false);
}
run('initAudio=()=>{}');
native = [pad];
tick();
let clicks = 0;
const start = {
  hidden: false,
  disabled: false,
  getClientRects: () => [{}],
  focus() {
    c.document.activeElement = this;
  },
  click() {
    clicks++;
  },
};
elem('#sTitle').querySelectorAll = () => [start];
tap(0);
assert.equal(clicks, 1, 'title confirmation');
run("show(null);state='play';paused=false;dialogOpen=true");
tap(9);
assert(run('paused'), 'Start pauses dialogue');
tap(9);
assert(!run('paused'), 'Start resumes despite dialogue');
run('dialogOpen=false');
pad.axes[0] = 0.8;
tick();
assert(run('padMove.x') > 0.5, 'native numeric axes');
pad.axes[0] = 0;
button(6, true);
button(12, true);
assert.equal(run('padMove.y'), 0, 'zoom does not walk');
button(12, false);
button(6, false);
let attacks = 0,
  releases = 0;
c.testAttack = () => attacks++;
c.testRelease = () => releases++;
run('pressAttack=testAttack;releaseAttack=testRelease');
tap(7);
assert.equal(attacks, 1);
assert.equal(releases, 1);
const book = elem('#weightBook');
book.open = true;
let scroll = 0;
book.scrollBy = ({ top }) => (scroll += top);
book.close = () => (book.open = false);
pad.axes[3] = 0.8;
tick();
assert(scroll > 0);
pad.axes[3] = 0;
tap(1);
assert(!book.open, 'B closes sketchbook');
run("state='play';paused=false;show(null)");
native = [];
tick();
assert(run('paused'), 'disconnect pauses');
native = [pad];
pad.buttons[9] = { pressed: true, value: 1 };
tick();
assert(run('paused'), 'held reconnect button cannot resume');
button(9, false);
tap(9);
assert(!run('paused'));
native = [];
fallback = [
  {
    ...pad,
    axes: [
      { getValue: () => 0.8 },
      { getValue: () => 0 },
      { getValue: () => 0 },
      { getValue: () => 0 },
    ],
  },
];
tick();
assert(run('padMove.x') > 0.5, 'Phaser fallback axes');
run("show('#sPause');paused=true");
const slider = {
  ...start,
  type: 'range',
  value: '55',
  min: '0',
  max: '100',
  step: '1',
  dispatchEvent() {},
};
elem('#sPause').querySelectorAll = () => [slider];
c.document.activeElement = slider;
fallback = [];
native = [pad];
pad.axes = [0.8, 0, 0, 0];
tick();
assert.equal(Number(slider.value), 60, 'stick adjusts volume');
console.log(
  'Controller routing passed: native/Phaser, menus, dialogue pause, trigger, zoom, gallery, reconnect and slider.'
);
