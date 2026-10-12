const fs = require('fs'),
  vm = require('vm');
const noop = () => {};
const ctx = new Proxy(
  {
    createRadialGradient: () => ({ addColorStop: noop }),
    createLinearGradient: () => ({ addColorStop: noop }),
  },
  { get: (t, k) => (k in t ? t[k] : noop), set: (t, k, v) => ((t[k] = v), true) }
);
const elements = new Map();
const windowEvents = {},
  documentEvents = {};
const listen = (map) => (type, fn) => {
  (map[type] ??= []).push(fn);
};
function elem(id) {
  if (!elements.has(id))
    elements.set(id, {
      id,
      style: {},
      hidden: !['#sTitle'].includes(id),
      classList: { add: noop, remove: noop, toggle: noop },
      dataset: {},
      getContext: () => ctx,
      listeners: {},
      addEventListener(type, fn) {
        (this.listeners[type] ??= []).push(fn);
      },
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 108, height: 108 }),
      offsetWidth: 42,
      setAttribute: noop,
      append: noop,
      querySelectorAll: () => [],
      getClientRects: () => [{}],
      setPointerCapture: noop,
      focus: noop,
      click: noop,
    });
  return elements.get(id);
}
const store = new Map();
const c = {
  console,
  Math,
  Date,
  Set,
  Map,
  Uint8Array,
  Int32Array,
  JSON,
  Number,
  performance: { now: () => 0 },
  localStorage: { getItem: (k) => store.get(k) || null, setItem: (k, v) => store.set(k, v) },
  document: {
    querySelector: elem,
    querySelectorAll: (s) =>
      s === '.screen' ? ['#sTitle', '#sSelect', '#sPause', '#sEnd'].map(elem) : [],
    createElement: (t) => elem('created' + Math.random()),
    body: { classList: { add: noop, toggle: noop } },
    addEventListener: listen(documentEvents),
  },
  navigator: {},
  innerWidth: 1280,
  innerHeight: 800,
  matchMedia: () => ({ matches: false }),
  addEventListener: listen(windowEvents),
  setTimeout: () => 0,
  clearTimeout: noop,
  setInterval: noop,
};
c.window = c;
vm.createContext(c);
for (const f of [
  'shared-save.js',
  'controls.js',
  'game.js',
  'pixel-art.js',
  'assets/darren-isometric.js',
  'darren-art.js',
  'assets/storybook-scenery.js',
  'storybook.js',
  'isometric-world.js',
  'firewood.js',
])
  vm.runInContext(fs.readFileSync('dist/' + f, 'utf8'), c, { filename: f });
module.exports = { c, store, elements, elem, ctx, vm, windowEvents, documentEvents };
