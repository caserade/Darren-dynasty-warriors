'use strict';
// Native Canvas stand-in for Phaser display/texture APIs. This is not a browser/WebGL test.
async function main() {
  const fs = require('fs'),
    assert = require('assert');
  const { createCanvas, loadImage } = require('@napi-rs/canvas');
  const { c, vm, elem } = require('../tests/support.cjs');
  const html = fs.readFileSync('dist/index.html', 'utf8'),
    scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1].split('?')[0]);
  for (const file of scripts) assert(fs.existsSync('dist/' + file), 'HTML asset exists: ' + file);
  for (const [before, after] of [
    ['pixel-art.js', 'assets/darren-isometric.js'],
    ['assets/darren-isometric.js', 'darren-art.js'],
    ['darren-art.js', 'phaser-scene.js'],
    ['assets/storybook-scenery.js', 'storybook.js'],
    ['storybook.js', 'isometric-world.js'],
  ])
    assert(
      scripts.includes(before) && scripts.indexOf(before) < scripts.indexOf(after),
      'HTML script order: ' + before + ' before ' + after
    );
  const no = () => {};
  const textures = new Map(),
    display = [];
  function texture(key, w, h) {
    const canvas = createCanvas(w, h),
      t = {
        canvas,
        context: canvas.getContext('2d'),
        width: w,
        height: h,
        frames: new Map(),
        getSourceImage() {
          return this.image || this.canvas;
        },
        refresh() {
          return this;
        },
        setFilter() {
          return this;
        },
        add(k, src, x, y, w, h) {
          this.frames.set(k, { cutX: x, cutY: y, cutWidth: w, cutHeight: h });
          return this;
        },
        get(k) {
          return this.frames.get(k || '__BASE');
        },
        setSize(w, h) {
          canvas.width = this.width = w;
          canvas.height = this.height = h;
          this.frames.set('__BASE', { cutX: 0, cutY: 0, cutWidth: w, cutHeight: h });
          return this;
        },
      };
    t.setSize(w, h);
    textures.set(key, t);
    return t;
  }
  function object(type, x = 0, y = 0, key = null, frame = '__BASE') {
    const o = {
      type,
      x,
      y,
      key,
      frame,
      ox: 0.5,
      oy: 0.5,
      sx: 1,
      sy: 1,
      alpha: 1,
      visible: true,
      depth: 0,
      rotation: 0,
      polys: [],
      setTexture(k, f) {
        this.key = k;
        this.frame = f;
        return this;
      },
      setOrigin(x, y = x) {
        this.ox = x;
        this.oy = y;
        return this;
      },
      setPosition(x, y) {
        this.x = x;
        this.y = y;
        return this;
      },
      setScale(x, y = x) {
        this.sx = x;
        this.sy = y;
        return this;
      },
      setDepth(n) {
        this.depth = n;
        return this;
      },
      setRotation(n) {
        this.rotation = n;
        return this;
      },
      setAlpha(n) {
        this.alpha = n;
        return this;
      },
      setVisible(n) {
        this.visible = n;
        return this;
      },
      setFlipX(n) {
        this.flip = n;
        return this;
      },
      setTintFill() {
        return this;
      },
      clearTint() {
        return this;
      },
      destroy() {
        this.dead = true;
      },
      clear() {
        this.polys = [];
        return this;
      },
      fillStyle(color, alpha) {
        this.color = color;
        this.fillAlpha = alpha;
        return this;
      },
      lineStyle(w, color, alpha) {
        this.line = { w, color, alpha };
        return this;
      },
      fillPoints(points) {
        this.polys.push({ points, color: this.color, alpha: this.fillAlpha });
        return this;
      },
      strokePoints(points) {
        this.polys.push({ points, line: this.line });
        return this;
      },
    };
    display.push(o);
    return o;
  }
  c.document.createElement = (tag) =>
    tag === 'canvas' ? createCanvas(1, 1) : elem('created-' + tag);
  for (const id of [
    '#face',
    '#posterCv',
    '#pvScarf',
    '#pvPaws',
    '#mini',
    '#weightPreview0',
    '#weightPreview1',
    '#weightPreview2',
    '#weightPreview3',
  ]) {
    const canvas = createCanvas(id.startsWith('#weightPreview') ? 288 : 480, 320);
    elem(id).width = canvas.width;
    elem(id).height = canvas.height;
    elem(id).getContext = () => canvas.getContext('2d');
  }
  const painted = texture('darren-painted-source', 896, 640);
  painted.image = await loadImage(vm.runInContext('DARREN_ART_DATA', c));
  const scenery = texture('storybook-source', 1774, 887);
  scenery.image = await loadImage(vm.runInContext('STORYBOOK_ART_DATA', c));
  for (const kind of ['tormund', 'bucky', 'firewood']) {
    const image = await loadImage('dist/assets/' + kind + '-atlas.png'),
      key = kind === 'firewood' ? 'firewood-props' : kind + '-actions',
      t = texture(key, image.width, image.height);
    t.context.drawImage(image, 0, 0);
  }
  c.Phaser = {
    Scene: class {
      constructor() {
        this.textures = {
          exists: (k) => textures.has(k),
          get: (k) => textures.get(k),
          createCanvas: texture,
          remove: (k) => textures.delete(k),
          getTextureKeys: () => [...textures.keys()],
        };
        this.add = {
          image: (x, y, k) => object('sprite', x, y, k),
          sprite: (x, y, k, f) => object('sprite', x, y, k, f),
          graphics: () => object('graphics'),
        };
        this.input = { keyboard: {}, gamepad: { on: no, getAll: () => [] } };
        this.scale = { resize: no };
        this.events = { once: no };
        this.cameras = { main: { shake: no } };
        this.game = { events: { on: no } };
      }
    },
    Textures: { FilterMode: { NEAREST: 0, LINEAR: 1 } },
    Core: { Events: { BLUR: 'blur' } },
    AUTO: 0,
    Scale: { NONE: 0, NO_CENTER: 0 },
    Game: class {
      constructor(config) {
        const scene = new config.scene[0]();
        this.scene = { scenes: [scene] };
        scene.create();
        c.scene = scene;
      }
    },
  };
  vm.runInContext(fs.readFileSync('dist/phaser-scene.js', 'utf8'), c, {
    filename: 'phaser-scene.js',
  });
  const run = (s) => vm.runInContext(s, c),
    scene = c.scene;
  function render(path) {
    const canvas = createCanvas(1280, 800),
      g = canvas.getContext('2d');
    g.imageSmoothingEnabled = true;
    for (const o of [...display].sort((a, b) => a.depth - b.depth)) {
      if (o.dead || !o.visible) continue;
      g.save();
      g.globalAlpha = o.alpha;
      g.translate(o.x, o.y);
      g.rotate(o.rotation);
      g.scale(o.sx * (o.flip ? -1 : 1), o.sy);
      if (o.type === 'graphics') {
        for (const p of o.polys) {
          g.beginPath();
          p.points.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
          g.closePath();
          if (p.line) {
            g.strokeStyle = '#' + p.line.color.toString(16).padStart(6, '0');
            g.lineWidth = p.line.w;
            g.stroke();
          } else {
            g.globalAlpha = p.alpha;
            g.fillStyle = '#' + p.color.toString(16).padStart(6, '0');
            g.fill();
          }
        }
      } else {
        const t = textures.get(o.key),
          f = t?.get(o.frame);
        assert(t && f, 'texture/frame ' + o.key + ' ' + o.frame);
        g.drawImage(
          t.canvas,
          f.cutX,
          f.cutY,
          f.cutWidth,
          f.cutHeight,
          -o.ox * f.cutWidth,
          -o.oy * f.cutHeight,
          f.cutWidth,
          f.cutHeight
        );
      }
      g.restore();
    }
    const out = createCanvas(1280, 800),
      ctx = out.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(canvas, 0, 0, 1280, 800);
    fs.writeFileSync(path, out.toBuffer('image/png'));
  }
  run("newGame();state='play';paused=false;dialogOpen=false;show(null);spawnT=999;P.cookies=2");
  scene.update(0, 16);
  render(require('path').join(require('os').tmpdir(), 'snowday-motion-start.png'));
  run('gainCookie()');
  for (let i = 0; i < 45; i++) scene.update(i * 16, 16);
  assert(run('P.displayWeight>0&&P.displayWeight<1'));
  render(require('path').join(require('os').tmpdir(), 'snowday-motion-growing.png'));
  for (let i = 0; i < 200; i++) scene.update(i * 16, 16);
  assert.equal(run('P.displayWeight'), 1);
  for (let q = 0; q < 4; q++) {
    run('viewQuarter=' + q);
    scene.update(0, 16);
  }
  run('P.weight=3;P.displayWeight=3;P.weapon="paws";startAtk(2);P.atk.t=.18');
  scene.update(0, 0);
  render(require('path').join(require('os').tmpdir(), 'snowday-motion-kick.png'));
  const main = textures.get('darren-live');
  assert.equal(main.width, 256);
  assert.equal(main.height, 288);
  assert(![...textures.keys()].some((k) => /^darren-[0-9]/.test(k)), 'no weight atlas rebuilt');
  // All authored states, directions, sizes and scarf variants stay within the padded live frame.
  let frames = 0;
  for (const scarf of [false, true]) {
    run('wearScarf=' + scarf);
    for (let weight = 0; weight <= 3; weight++)
      for (const [state, count] of Object.entries(run('DARREN_STATES')))
        for (let dir = 0; dir < 8; dir++)
          for (let frame = 0; frame < count; frame++) {
            scene.heroFrame({ state, dir, frame, weight, motion: 0 });
            const d = main.context.getImageData(0, 0, 256, 288).data;
            for (let x = 0; x < 256; x++) {
              assert.equal(
                d[x * 4 + 3],
                0,
                `top ${state}/${dir}/${frame}/${weight}/${scarf} x${x}`
              );
              assert.equal(
                d[(287 * 256 + x) * 4 + 3],
                0,
                `bottom ${state}/${dir}/${frame}/${weight}/${scarf} x${x}`
              );
            }
            for (let y = 0; y < 288; y++) {
              assert.equal(
                d[y * 256 * 4 + 3],
                0,
                `left ${state}/${dir}/${frame}/${weight}/${scarf} y${y}`
              );
              assert.equal(
                d[(y * 256 + 255) * 4 + 3],
                0,
                `right ${state}/${dir}/${frame}/${weight}/${scarf} y${y}`
              );
            }
            frames++;
          }
  }
  // Render reuse keeps the hero texture bounded across repeated weight and preference changes.
  assert(
    [...textures.keys()].filter((k) => k === 'darren-live' || k.startsWith('darren-trail-'))
      .length <= 9
  );
  assert.equal(scene.worldTexture.width, 1280, 'Full-width renderer');
  assert(textures.has('storybook-cottage-270-268-false'), 'Painted scenery consumed');
  const beforeBook = run('JSON.stringify([P,G,checkpoint])');
  scene.updateWeightBook(true);
  assert.equal(
    run('JSON.stringify([P,G,checkpoint])'),
    beforeBook,
    'Size gallery cannot change gameplay or saves'
  );
  const sheet = createCanvas(1152, 376),
    sg = sheet.getContext('2d');
  sg.fillStyle = '#fff7e7';
  sg.fillRect(0, 0, 1152, 376);
  for (let i = 0; i < 4; i++) {
    sg.drawImage(elem('#weightPreview' + i).getContext('2d').canvas, i * 288, 0);
    sg.fillStyle = '#344557';
    sg.font = 'bold 19px serif';
    sg.textAlign = 'center';
    sg.fillText(i + ' · ' + run('SIZE_NAMES[' + i + ']'), i * 288 + 144, 347);
  }
  // The committed preview is only replaced on request (--update-previews), so running the
  // checks on a fresh clone does not leave a changed file behind.
  const previewDir = process.argv.includes('--update-previews')
    ? 'previews'
    : require('os').tmpdir();
  fs.mkdirSync(previewDir, { recursive: true });
  fs.writeFileSync(
    require('path').join(previewDir, 'Darren-Storybook-Weight-Levels.png'),
    sheet.toBuffer('image/png')
  );
  run(
    'initAudio=()=>{};startFirewood(false);while(dialogOpen)nextLine();G.firewood.met=true;bucky.x=P.x+130;bucky.y=P.y+30;ally.x=P.x-65;ally.y=P.y+30'
  );
  scene.update(0, 16);
  render(require('path').join(require('os').tmpdir(), 'snowday-firewood-start.png'));
  for (const kind of ['tormund', 'bucky'])
    for (let i = 0; i < 16; i++) {
      const t = textures.get(kind + '-actions'),
        f = t.get(String(i));
      assert(f, 'companion frame ' + kind + '/' + i);
      const data = t.context.getImageData(f.cutX, f.cutY, 256, 256).data;
      let visible = 0;
      for (let p = 3; p < data.length; p += 4) if (data[p]) visible++;
      assert(visible > 500, 'nonempty pose');
      for (let x = 0; x < 256; x++) {
        assert.equal(data[x * 4 + 3], 0);
        assert.equal(data[(255 * 256 + x) * 4 + 3], 0);
      }
    }
  for (let q = 0; q < 4; q++) {
    run('viewQuarter=' + q);
    scene.update(0, 16);
    assert(scene.objects.has(run('bucky')), 'Bucky rendered');
    assert(scene.objects.has(run('ally')), 'Tormund rendered');
  }
  run(
    'viewQuarter=0;P.x=1220;P.y=1320;cam.x=P.x;cam.y=P.y;cam.z=groundHeight(P.x,P.y);bucky.x=P.x+90;bucky.y=P.y+20;ally.x=P.x-55;ally.y=P.y+15;bucky.attack={t:.5,hit:true};bucky.dir=Math.PI;ally.attack={t:.3,hit:true};ally.dir=0'
  );
  scene.update(0, 0);
  render(require('path').join(require('os').tmpdir(), 'snowday-firewood-combat.png'));
  console.log(
    'PASS 32 painted companion poses, four camera orientations and chapter scene renders'
  );
  console.log(
    'PASS scene API assembly, four cameras, dynamic growth, padded bounds for ' +
      frames +
      ' poses, texture budget and native renders'
  );

  run(
    "newGame();state='play';paused=false;dialogOpen=false;show(null);enemies=[];P.dashCd=.09;hitstop=.06;pressDash()"
  );
  for (let i = 0; i < 13; i++) scene.update(0, 1000 / 60);
  assert(run('P.dashCd>.6'), 'buffer survives impact freeze');
  console.log('PASS action buffer and last impact frame freeze');
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
