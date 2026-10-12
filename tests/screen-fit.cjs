const assert = require('assert'),
  fs = require('fs');
const { c, vm, elem } = require('./support.cjs');
const run = (s) => vm.runInContext(s, c);
c.matchMedia = () => ({ matches: true });
for (const [w, h] of [
  [360, 740],
  [393, 852],
  [852, 393],
  [915, 412],
  [320, 568],
  [1280, 800],
]) {
  c.innerWidth = w;
  c.innerHeight = h;
  run('resize()');
  const a = run('cameraAnchorY()');
  assert(a > h * 0.4 && a < h * 0.55);
  assert(run('zoom') >= 0.42 && run('zoom') <= 1.05);
}
c.visualViewport = { width: 393, height: 700, scale: 1, addEventListener() {} };
run('resize()');
assert.equal(run('H'), 700);
c.visualViewport.scale = 2;
run('resize()');
assert.equal(run('W'), 1280, 'pinch zoom is not treated as a device resize');
const full = elem('#testFullscreen');
const old = c.document.querySelectorAll;
c.document.querySelectorAll = (s) =>
  s === '.fullscreenButton' ? [full] : s === '.fullscreenStatus' ? [elem('#testStatus')] : old(s);
c.document.documentElement = {};
vm.runInContext(fs.readFileSync('dist/phone.js', 'utf8'), c);
(async () => {
  await full.onclick();
  assert(
    elem('#testStatus').textContent.includes('unavailable'),
    'unsupported browser gets guidance'
  );
  let requests = 0;
  c.document.documentElement.requestFullscreen = async () => {
    requests++;
    c.document.fullscreenElement = {};
  };
  await full.onclick();
  assert.equal(requests, 1);
  assert.equal(full.textContent, 'Exit full screen');
  c.document.exitFullscreen = async () => {
    c.document.fullscreenElement = null;
  };
  await full.onclick();
  assert.equal(full.textContent, 'Full screen');
  run('userZoom=1.6;fitPhoneScreen()');
  assert.equal(run('userZoom'), 1);
  console.log(
    'PASS phone viewport sizes, camera anchor, pinch guard, fullscreen fallback, entry/exit and fit reset'
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
