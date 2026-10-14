'use strict';
/* Phaser owns the loop, renderer, display list, textures, depth sorting, camera and controllers.
   Combat stays in world coordinates; only the rendering boundary projects it into isometric space. */
function viewportRenderScale(w, h) {
  return Math.max(1, w / (isTouch ? 1280 : 1920), h / (isTouch ? 800 : 1080));
}
let VIEW_PIXEL = viewportRenderScale(innerWidth, innerHeight);
class SnowdayScene extends Phaser.Scene {
  constructor() {
    super('Snowday');
    this.objects = new Map();
    this.atlases = [];
    this.legacyFrames = new Map();
    this.tick = 0;
    this.previewTick = 0;
  }
  preload() {
    this.load.image('darren-painted-source', DARREN_ART_DATA);
    this.load.image('storybook-source', STORYBOOK_ART_DATA);
    this.load.image('tormund-actions', 'assets/tormund-atlas.png');
    this.load.image('bucky-actions', 'assets/bucky-atlas.png');
    this.load.image('firewood-props', 'assets/firewood-atlas.png');
  }
  create() {
    prepareDarrenArtwork(this);
    prepareStorybook(this);
    prepareStoryCast(this);
    this.worldTexture = this.textures.createCanvas(
      'prairie',
      Math.ceil(W / VIEW_PIXEL),
      Math.ceil(H / VIEW_PIXEL)
    );
    this.fxTexture = this.textures.createCanvas(
      'snow-fx',
      Math.ceil(W / VIEW_PIXEL),
      Math.ceil(H / VIEW_PIXEL)
    );
    this.add.image(0, 0, 'prairie').setOrigin(0).setDepth(-20000);
    this.add.image(0, 0, 'snow-fx').setOrigin(0).setDepth(50000);
    this.shadow = this.textures.createCanvas('shadow', 44, 16);
    pxOval(this.shadow.context, 22, 8, 21, 6, '#627ca2');
    this.shadow.refresh();
    this.heroFrame({ state: 'idle', frame: 0, dir: 1, weight: 0, motion: 0 });
    this.footprints = [];
    this.depthWorld = new IsometricWorldRenderer(this);
    this.input.keyboard.enabled = true;
    this.input.gamepad.on('connected', () => {
      if (state === 'title')
        document.querySelector('.chapterTag').textContent = 'CONTROLLER READY · PRESS A TO START';
    });
    initPreferences();
    document.querySelector('#resetSize').onclick = () => {
      if (!P) return;
      P.weight = 0;
      P.cookies = 0;
      P.displayWeight = 0;
      P.motionWeight = 0;
      P.bellyMotion = P.bellyVelocity = 0;
      document.querySelector('#sizeText').textContent = SIZE_NAMES[0] + ' · 0/3 cookies';
      saveCampAppearance();
    };
    const onResize = () => {
      clearControls();
      resize();
      VIEW_PIXEL = viewportRenderScale(W, H);
      this.scale.resize(Math.ceil(W / VIEW_PIXEL), Math.ceil(H / VIEW_PIXEL));
      this.worldTexture.setSize(Math.ceil(W / VIEW_PIXEL), Math.ceil(H / VIEW_PIXEL));
      this.fxTexture.setSize(Math.ceil(W / VIEW_PIXEL), Math.ceil(H / VIEW_PIXEL));
    };
    window.addEventListener('resize', onResize);
    window.visualViewport?.addEventListener('resize', onResize);
    this.events.once('shutdown', () => {
      window.removeEventListener('resize', onResize);
      window.visualViewport?.removeEventListener('resize', onResize);
    });
    this.cameras.main.roundPixels = false;
    this.game.events.on(Phaser.Core.Events.BLUR, () => {
      if (state === 'play' && !paused) togglePause();
    });
    this.ready = true;
  }
  update(time, delta) {
    const dt = Math.min(0.04, delta / 1000);
    this.tick++;
    pollControllers(this, dt);
    const heldForImpact = state === 'play' && hitstop > 0;
    if (state === 'play' && !paused && !dialogOpen) {
      if (hitstop > 0) hitstop = Math.max(0, hitstop - dt);
      else {
        tickInputBuffer(dt);
        update(dt);
      }
    }
    const frozen = state === 'play' && (paused || dialogOpen || heldForImpact || hitstop > 0),
      visualDt = frozen ? 0 : dt;
    rt += visualDt;
    if (shake > 1 && !reduceMotion && !frozen) {
      this.cameras.main.shake(55, Math.min(0.005, shake * 0.0004), true);
      shake = Math.max(0, shake - dt * 60);
    } else shake = Math.max(0, shake - dt * 60);
    this.paintWorld(visualDt);
    this.syncGround(visualDt);
    this.syncObjects();
    this.paintFX(visualDt);
    if (state === 'play' && this.tick % 3 === 0) {
      updateHud();
      if (this.tick % 6 === 0) drawMini();
    }
    if (++this.previewTick % 6 === 0) {
      this.updatePreviews();
      this.updateWeightBook();
    }
  }
  transformWorld(c) {
    const cp = cameraPoint(),
      scale = (zoom * userZoom) / VIEW_PIXEL;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.imageSmoothingEnabled = true;
    c.translate(W / 2 / VIEW_PIXEL, cameraAnchorY() / VIEW_PIXEL);
    c.scale(scale, scale);
    c.translate(-cp.x, -cp.y);
  }
  paintWorld(dt) {
    const c = this.worldTexture.context;
    g = c;
    c.setTransform(1, 0, 0, 1, 0, 0);
    const sw = this.worldTexture.width,
      sh = this.worldTexture.height,
      sky = c.createLinearGradient(0, 0, 0, sh);
    sky.addColorStop(0, '#567c99');
    sky.addColorStop(0.65, '#9cbcbf');
    sky.addColorStop(1, '#c0d5c9');
    c.fillStyle = sky;
    c.fillRect(0, 0, sw, sh);
    for (let layer = 0; layer < 3; layer++) {
      c.beginPath();
      c.moveTo(0, sh);
      for (let x = 0; x <= sw + 24; x += 24) {
        const y =
          sh * (0.34 + layer * 0.17) +
          Math.sin(x * 0.016 + layer * 4) * 32 +
          Math.sin(x * 0.037 + layer) * 15;
        c.lineTo(x, y);
      }
      c.lineTo(sw, sh);
      c.closePath();
      c.fillStyle = ['#789caa', '#8eaeb5', '#adc5c2'][layer];
      c.fill();
    }
    const playing = state === 'play' || state === 'over';
    if (!playing) {
      cam.x = START.x + 180;
      cam.y = START.y;
    }
    this.transformWorld(c);
    c.setTransform(1, 0, 0, 1, 0, 0);
    this.worldTexture.refresh();
  }
  groundMark(id, x, y, points, color, alpha = 0.5, stroke = null) {
    let mark = this.objects.get(id);
    if (!mark) {
      mark = this.add.graphics();
      this.objects.set(id, mark);
    }
    mark.clear();
    const projected = points.map((p) => {
      const q = screenPoint(...p);
      return { x: q.x / VIEW_PIXEL, y: q.y / VIEW_PIXEL };
    });
    mark.fillStyle(color, alpha).fillPoints(projected, true);
    if (stroke !== null) mark.lineStyle(1, stroke, 0.85).strokePoints(projected, true);
    mark.setDepth(10000 + groundProject(x, y).y - 0.5);
    mark.seen = this.tick;
  }
  syncGround(dt) {
    if (state !== 'play' && state !== 'over') return;
    if (this.footprintRun !== gameRun) {
      this.footprints = [];
      this.footprintRun = gameRun;
      this.footprintAge = 0;
    }
    if (dt > 0 && P.moving && !paused && !dialogOpen) {
      this.footprintAge += dt;
      if (this.footprintAge >= 0.09) {
        this.footprintAge = 0;
        this.footprints.push({ x: P.x, y: P.y, life: 1.8 });
      }
    }
    this.footprints = this.footprints.filter((f) => (f.life -= dt) > 0).slice(-30);
    let i = 0;
    for (const f of this.footprints)
      this.groundMark(
        'step-' + i++,
        f.x,
        f.y,
        [
          [f.x - 4, f.y - 3, 1],
          [f.x + 4, f.y - 3, 1],
          [f.x + 4, f.y + 3, 1],
          [f.x - 4, f.y + 3, 1],
        ],
        0x557a8b,
        Math.min(0.3, f.life * 0.2)
      );
    const wedge = [
      [-0.27, 39],
      [0, 56],
      [0.27, 39],
    ].map(([d, r]) => [P.x + Math.cos(P.dir + d) * r, P.y + Math.sin(P.dir + d) * r, 2]);
    this.groundMark('facing', P.x, P.y, wedge, chargeHeld ? 0xf4bd64 : 0x87b4c5, 0.75);
    for (const [i, e] of enemies.entries()) {
      if (e.dead || !e.officer || e.state !== 'wind') continue;
      const progress = clamp(1 - e.st / MOVE_WIND[e.move], 0, 1),
        pts = [];
      if (e.move === 'charge') {
        const a = e.cdir,
          r = e.rad * 0.8;
        for (const [f, s] of [
          [0, -r],
          [480, -r],
          [480, r],
          [0, r],
        ])
          pts.push([
            e.x + Math.cos(a) * f - Math.sin(a) * s,
            e.y + Math.sin(a) * f + Math.cos(a) * s,
            3,
          ]);
      } else {
        const r = e.move === 'slam' ? (e.type === 'baron' ? 190 : 160) : e.rad + 85,
          arc = e.move === 'swipe' ? 2.4 : TAU;
        if (arc < TAU) pts.push([e.x, e.y, 3]);
        for (let j = 0; j <= 36; j++) {
          const a = e.cdir - arc / 2 + (j / 36) * arc;
          pts.push([e.x + Math.cos(a) * r, e.y + Math.sin(a) * r, 3]);
        }
      }
      this.groundMark('danger-' + i, e.x, e.y, pts, 0xeb5475, 0.22 + progress * 0.24, 0xd64e76);
    }
  }
  heroFrame(anim, key = 'darren-live') {
    const signature = [
      anim.state,
      anim.dir,
      anim.frame,
      Math.round((anim.attackTime ?? -1) * 60),
      Math.round(anim.weight * 32),
      Math.round((anim.motion || 0) * 8),
      wearScarf,
      softMotion,
      reduceMotion,
    ].join(':');
    const texture = this.textures.exists(key)
      ? this.textures.get(key)
      : this.textures.createCanvas(key, DARREN_LIVE_W, DARREN_LIVE_H);
    this.heroSignatures ??= new Map();
    if (this.heroSignatures.get(key) !== signature) {
      const c = texture.context;
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.clearRect(0, 0, DARREN_LIVE_W, DARREN_LIVE_H);
      c.save();
      c.translate(16, 16);
      c.scale(2, 2);
      paintDarren(
        c,
        anim.dir,
        anim.state,
        anim.frame,
        Math.round(anim.weight * 32) / 32,
        wearScarf,
        anim.motion || 0,
        anim.attackTime
      );
      c.restore();
      texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
      texture.refresh();
      this.heroSignatures.set(key, signature);
    }
    return {
      texture: key,
      frame: '__BASE',
      originX: 0.5,
      originY: DARREN_FOOT_Y / DARREN_LIVE_H,
      pixelScale: 1,
    };
  }
  legacyFrame(key, paint) {
    if (this.legacyFrames.has(key)) return this.legacyFrames.get(key);
    let atlas = this.atlases.at(-1);
    if (!atlas || atlas.count >= 64) {
      const name = 'cast-' + this.atlases.length;
      atlas = {
        name,
        texture: this.textures.createCanvas(name, 2048, 2048),
        count: 0,
        dirty: false,
      };
      this.atlases.push(atlas);
    }
    const tile = document.createElement('canvas');
    tile.width = tile.height = 256;
    const c = tile.getContext('2d');
    c.translate(128, 224);
    paint(c);
    c.setTransform(1, 0, 0, 1, 0, 0);
    const i = atlas.count++,
      x = (i % 8) * 256,
      y = Math.floor(i / 8) * 256;
    atlas.texture.context.drawImage(tile, x, y);
    atlas.texture.add(key, 0, x, y, 256, 256);
    atlas.dirty = true;
    const result = {
      texture: atlas.name,
      frame: key,
      originX: 0.5,
      originY: 224 / 256,
      pixelScale: 1,
    };
    this.legacyFrames.set(key, result);
    return result;
  }
  actor(id, x, y, frame, options = {}) {
    let sprite = this.objects.get(id);
    if (!sprite) {
      sprite = this.add.sprite(0, 0, frame.texture, frame.frame);
      this.objects.set(id, sprite);
    }
    sprite
      .setTexture(frame.texture, frame.frame)
      .setOrigin(frame.originX ?? 0.5, frame.originY ?? 66 / 72);
    const p = screenPoint(x, y, options.z || 0),
      screenScale = (zoom * userZoom * (frame.pixelScale ?? 2)) / VIEW_PIXEL; // Each frame declares its source pixel density.
    sprite.setPosition(Math.round(p.x / VIEW_PIXEL), Math.round(p.y / VIEW_PIXEL));
    sprite.setScale(
      screenScale * (options.scaleX ?? options.scale ?? 1),
      screenScale * (options.scaleY ?? options.scale ?? 1)
    );
    sprite.setDepth(10000 + groundProject(x, y).y + (options.depth || 0));
    sprite.setRotation(options.rotation || 0).setAlpha(options.alpha ?? 1);
    sprite.setVisible(p.x > -240 && p.x < W + 240 && p.y > -120 && p.y < H + 280);
    sprite.setFlipX(!!options.flip);
    if (options.flash) sprite.setTintFill(0xfff7dc);
    else sprite.clearTint();
    sprite.seen = this.tick;
    return sprite;
  }
  paintProp(c, prop) {
    const p = isoPoint(prop.x, prop.y);
    c.translate(-p.x, -p.y);
    if (prop.kind === 'tower') {
      isoBox(c, prop.x, prop.y, 90, 90, 142, '#a7bccb');
      for (const [dx, dy] of [
        [-32, -32],
        [32, -32],
        [32, 32],
        [-32, 32],
      ])
        isoBox(c, prop.x + dx, prop.y + dy, 24, 24, 22, '#91aabd', 142);
      const q = isoPoint(prop.x, prop.y, 95);
      c.fillStyle = '#42637c';
      c.fillRect(q.x - 7, q.y - 9, 14, 28);
    } else if (prop.kind === 'bale') {
      isoBox(c, prop.x, prop.y, 49, 41, 36, '#c8ab68');
      for (const z of [8, 17, 27])
        poly(
          c,
          [
            [prop.x - 24.5, prop.y - 20.5],
            [prop.x + 24.5, prop.y - 20.5],
            [prop.x + 24.5, prop.y + 20.5],
            [prop.x - 24.5, prop.y + 20.5],
          ].map((v) => isoPoint(...v, z)),
          null,
          '#9d885b'
        );
    } else if (prop.kind === 'tent') {
      isoBox(c, prop.x, prop.y, 78, 68, 14, '#7695a6');
      const a = isoPoint(prop.x - 43, prop.y - 32, 14),
        b = isoPoint(prop.x + 43, prop.y - 32, 14),
        cc = isoPoint(prop.x + 43, prop.y + 32, 14),
        d = isoPoint(prop.x - 43, prop.y + 32, 14),
        r1 = isoPoint(prop.x, prop.y - 32, 80),
        r2 = isoPoint(prop.x, prop.y + 32, 80);
      poly(c, [a, d, r2, r1], prop.color, '#536d7d');
      poly(c, [b, cc, r2, r1], '#f0f7f4', '#6f8b98');
      poly(c, [d, cc, r2], prop.color, '#536d7d');
    } else if (prop.kind === 'post' && prop.rail) {
      drawProp(c, { ...prop, x: p.x, y: p.y, rail: null }, rt);
      const end = isoPoint(prop.x + prop.rail.dx, prop.y + prop.rail.dy);
      c.strokeStyle = '#826446';
      c.lineWidth = 3;
      for (const z of [11, 22]) {
        c.beginPath();
        c.moveTo(p.x, p.y - z);
        c.lineTo(end.x, end.y - z);
        c.stroke();
      }
    } else drawProp(c, { ...prop, x: p.x, y: p.y }, Math.floor(rt * 4) / 4);
  }
  syncObjects() {
    const playing = state === 'play' || state === 'over',
      hero = playing ? P : { x: START.x + 180, y: START.y, dir: 0 },
      heroP = isoPoint(hero.x, hero.y);
    this.depthWorld.sync();
    if (playing) {
      for (const e of enemies) {
        const s = screenPoint(e.x, e.y);
        if (s.x < -180 || s.x > W + 180 || s.y < -70 || s.y > H + 230) continue;
        const phase = Math.floor(e.t * (e.moving ? 12 : 4)) % 8,
          pose = e.state === 'wind' ? 'wind' : e.state === 'rec' ? 'rec' : 'idle';
        const key = ['enemy', e.type, pose, e.moving ? 1 : 0, phase].join('-');
        const frame = this.legacyFrame(key, (c) =>
          drawEnemy(c, {
            ...e,
            x: 0,
            y: 0,
            face: 1,
            t: phase / (e.moving ? 12 : 4),
            dead: false,
            flash: 0,
            fly: null,
          })
        );
        this.actor(e, e.x, e.y, frame, {
          flip: isoFace(Math.atan2(P.y - e.y, P.x - e.x)) < 0,
          flash: e.flash > 0,
          z: e.dead ? e.fly.z : 0,
          rotation: e.dead ? e.fly.r : 0,
          alpha: e.dead ? clamp(1 - (e.fly.t - 0.4) / 0.4, 0, 1) : 1,
        });
      }
      for (const pk of pickups) {
        const key = 'pickup-' + pk.kind;
        const f = this.legacyFrame(key, (c) => {
          c.fillStyle = pk.kind === 'cookie' ? '#d7a561' : '#8dd9ea';
          circ(c, 0, -14, pk.kind === 'cookie' ? 11 : 8);
          c.strokeStyle = '#fff8df';
          c.lineWidth = 2;
          c.stroke();
          if (pk.kind === 'cookie') {
            c.fillStyle = '#795040';
            for (const [x, y] of [
              [-4, -18],
              [4, -12],
              [-3, -9],
            ])
              c.fillRect(x, y, 3, 3);
          } else drawStar(c, 0, -14, 6, '#fff7c5');
        });
        this.actor(pk, pk.x, pk.y, f, { z: Math.sin(pk.t * 5) * 4 });
      }
      if (ally) drawStoryCompanion(this, ally, 'tormund');
      drawFirewoodObjects(this);
      if (ruffy) {
        const phase = Math.floor(ruffy.t * 12) % 8,
          f = this.legacyFrame('ruffy-' + phase, (c) => drawRuffy(c, 0, 0, 1, phase / 12, 1.1));
        this.actor(ruffy, ruffy.x, ruffy.y, f, {
          flip: isoFace(Math.atan2(P.y - ruffy.y, P.x - ruffy.x)) < 0,
        });
      }
    }
    const anim = darrenAnimation(),
      frame = this.heroFrame(anim);
    this.actor(
      'hero-shadow',
      hero.x,
      hero.y,
      { texture: 'shadow', frame: '__BASE', originX: 0.5, originY: 0.5 },
      {
        alpha: 0.24,
        scaleX: 0.9 + anim.weight * 0.06,
        scaleY: 0.9 + anim.weight * 0.025,
        depth: -0.5,
      }
    );
    const sprite = this.actor('hero', hero.x, hero.y, frame, {
      scale: DARREN_WORLD_SCALE,
      alpha: playing && P.inv > 0 && !P.musou && Math.floor(P.t * 20) % 2 === 0 ? 0.5 : 1,
    });
    if (playing) {
      let i = 0;
      for (const tr of P.trail.slice(-8)) {
        const trailFrame = this.heroFrame(tr.anim || anim, 'darren-trail-' + i);
        this.actor('trail-' + i++, tr.x, tr.y, trailFrame, {
          scale: DARREN_WORLD_SCALE,
          alpha: tr.life * 0.6,
          depth: -1,
        });
      }
      const snowFrame = this.legacyFrame('snowball', (c) => {
        c.fillStyle = '#91bacd';
        circ(c, 0, -20, 20);
        c.fillStyle = '#edf9ff';
        circ(c, -1, -22, 17);
        c.fillStyle = '#fff';
        ell(c, -7, -29, 5, 4);
        c.fillStyle = '#c3e0eb';
        ell(c, 8, -13, 7, 3);
      });
      for (const ball of shots)
        this.actor(ball, ball.x, ball.y, snowFrame, {
          scale: ball.r / 20,
          z: ball.z - groundHeight(ball.x, ball.y) - ball.r,
        });
      if (P.roll) {
        const r = 24 + P.roll.age * 12 + P.weight * 2;
        const x = P.x + Math.cos(P.dir) * (r + 28),
          y = P.y + Math.sin(P.dir) * (r + 28);
        this.actor('roll-ball', x, y, snowFrame, { scale: r / 20 });
      }
      for (const p of projs) {
        const f = this.legacyFrame('projectile-' + p.kind, (c) => {
          c.fillStyle = p.kind === 'egg' ? '#fff1da' : '#724f91';
          ell(c, 0, -18, p.r, p.r * 1.2);
        });
        this.actor(p, p.x, p.y, f, { z: p.z - groundHeight(p.x, p.y) - 18 });
      }
    }
    for (const [key, object] of this.objects)
      if (object.seen !== this.tick) {
        object.destroy();
        this.objects.delete(key);
      }

    for (const atlas of this.atlases)
      if (atlas.dirty) {
        atlas.texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
        atlas.texture.refresh();
        atlas.dirty = false;
      }
  }
  paintFX(dt) {
    const c = this.fxTexture.context;
    g = c;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, this.fxTexture.width, this.fxTexture.height);
    const playing = state === 'play' || state === 'over';
    this.transformWorld(c);
    if (playing) {
      if (P.atk) {
        const a = P.atk,
          d = a.d,
          t = a.t / d.dur,
          active = a.t >= d.act[0] && a.t <= d.act[1];
        if (active) {
          const sweep = d.pose === 'tail',
            kick = d.pose === 'kick',
            r = sweep ? 107 : kick ? 76 : 58,
            arc = sweep ? 2.4 : 0.55,
            heading = P.dir + (sweep ? t * TAU : 0),
            pts = [];
          for (let i = 0; i <= 16; i++) {
            const angle = heading - arc / 2 + (arc * i) / 16;
            pts.push(
              isoPoint(
                P.x + Math.cos(angle) * r,
                P.y + Math.sin(angle) * r,
                sweep ? 14 : kick ? 26 : 47
              )
            );
          }
          c.lineWidth = sweep ? 6 : 4;
          c.strokeStyle = sweep ? '#ffdda9c9' : '#fff7dec7';
          c.beginPath();
          pts.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)));
          c.stroke();
        }
      }
      if (chargeHeld) {
        const q = isoPoint(P.x, P.y, 106);
        c.strokeStyle = chargeTime >= 0.8 ? '#e177a7' : '#68b3cd';
        c.lineWidth = 4;
        c.beginPath();
        c.arc(q.x, q.y, 12, -Math.PI / 2, -Math.PI / 2 + TAU * clamp(chargeTime / 0.8, 0, 1));
        c.stroke();
      }
      for (const p of parts) {
        const q = isoPoint(p.x, p.y, 12),
          a = clamp(p.life / (p.max || 1), 0, 1);
        c.globalAlpha = a;
        if (p.kind === 'ring') {
          const pts = [];
          for (let i = 0; i <= 48; i++) {
            const angle = (i / 48) * TAU;
            pts.push(
              isoPoint(
                p.x + Math.cos(angle) * p.size * (1.2 - a * 0.4),
                p.y + Math.sin(angle) * p.size * (1.2 - a * 0.4),
                4
              )
            );
          }
          poly(c, pts, null, p.color || '#fff');
        } else if (p.kind === 'star') drawStar(c, q.x, q.y, p.size, '#fff4c7');
        else if (p.kind === 'heart') {
          c.fillStyle = DOT;
          drawHeart(c, q.x, q.y, p.size);
        } else {
          c.fillStyle = p.color || '#fff';
          c.fillRect(q.x - p.size / 2, q.y - p.size / 2, p.size, p.size);
        }
      }
      c.globalAlpha = 1;
      for (const f of floaters) {
        const q = isoPoint(f.x, f.y, f.z || 30);
        c.globalAlpha = clamp(f.life * 2, 0, 1);
        c.font = `bold ${f.heavy ? 22 : 16}px monospace`;
        c.textAlign = 'center';
        c.lineWidth = 4;
        c.strokeStyle = '#263d55';
        c.strokeText(String(f.v), q.x, q.y);
        c.fillStyle = f.heal ? '#b5f4b5' : f.player ? '#ffb2ac' : '#fff6ce';
        c.fillText(String(f.v), q.x, q.y);
      }
      c.globalAlpha = 1;
      // Enemies keep a readable health line above their pixel silhouette.
      for (const e of enemies) {
        if (e.dead) continue;
        const p = isoPoint(e.x, e.y, e.rad * (e.officer ? 3.2 : 2.8) + 16);
        if (e.state === 'wind' && !e.officer) {
          c.fillStyle = '#f5ce67';
          c.font = 'bold 22px monospace';
          c.textAlign = 'center';
          c.fillText('!', p.x, p.y - 6);
        }
        if (e.hp === e.max && !e.officer) continue;
        if (e.officer && !e.active) continue;
        const w = e.officer ? 78 : 32;
        c.fillStyle = '#314860';
        c.fillRect(p.x - w / 2, p.y, w, 5);
        c.fillStyle = e.officer ? '#dc94ac' : '#7dc5bd';
        c.fillRect(p.x - w / 2 + 1, p.y + 1, (w - 2) * Math.max(0, e.hp / e.max), 3);
      }
    }
    c.setTransform(1 / VIEW_PIXEL, 0, 0, 1 / VIEW_PIXEL, 0, 0);
    c.fillStyle = '#ffffffa8';
    for (const f of flakes) {
      f.y += dt * 0.035 * f.z;
      if (f.y > 1) f.y = 0;
      const x = (((f.x * W + Math.sin(rt + f.ph) * 15) % W) + W) % W;
      c.fillRect(Math.round(x / 2) * 2, Math.round((f.y * H) / 2) * 2, 2, 2);
    }
    if (flashRed > 0) {
      c.fillStyle = `rgba(215,50,70,${flashRed * 0.5})`;
      c.fillRect(0, 0, W, H);
      flashRed = Math.max(0, flashRed - dt);
    }
    if (state === 'play') drawObjectiveArrow();
    c.setTransform(1, 0, 0, 1, 0, 0);
    this.fxTexture.refresh();
  }
  updateWeightBook(force = false) {
    paintWeightBook(this, force);
  }
  updatePreviews() {
    const a = darrenAnimation(),
      preview = document.createElement('canvas');
    preview.width = DARREN_FRAME_W * 2;
    preview.height = DARREN_FRAME_H * 2;
    const pcx = preview.getContext('2d');
    pcx.scale(2, 2);
    paintDarren(pcx, 1, 'idle', Math.floor(rt * 4) % 8, a.weight, wearScarf, 0);
    const tex = { canvas: preview },
      frame = { cutX: 0, cutY: 0 },
      fc = document.querySelector('#face').getContext('2d');
    fc.imageSmoothingEnabled = true;
    fc.fillStyle = '#6995af';
    fc.fillRect(0, 0, 108, 108);
    fc.drawImage(tex.canvas, frame.cutX + 48, frame.cutY + 32, 136, 172, 9, 0, 90, 114);
    if (!document.querySelector('#sTitle').hidden) {
      const pc = document.querySelector('#posterCv').getContext('2d');
      pc.imageSmoothingEnabled = true;
      pc.fillStyle = '#f1e3c2';
      pc.fillRect(0, 0, 400, 300);
      const f = this.legacyFrame('ruffy-preview-' + (Math.floor(rt * 8) % 8), (c) =>
        drawRuffy(c, 0, 0, 1, (Math.floor(rt * 8) % 8) / 8, 1)
      );
      const t = this.textures.get(f.texture),
        fr = t.get(f.frame);
      pc.drawImage(t.canvas, fr.cutX + 94, fr.cutY + 174, 68, 54, 55, 25, 290, 231);
      pc.strokeStyle = '#d0987e';
      pc.lineWidth = 4;
      pc.setLineDash([8, 8]);
      pc.strokeRect(12, 12, 376, 276);
      pc.setLineDash([]);
    }
    if (!document.querySelector('#sSelect').hidden) {
      for (const id of ['#pvScarf', '#pvPaws']) {
        const c = document.querySelector(id).getContext('2d');
        c.imageSmoothingEnabled = true;
        c.fillStyle = '#c4dfe8';
        c.fillRect(0, 0, 480, 300);
        c.fillStyle = '#e5f3f5';
        c.fillRect(0, 244, 480, 56);
        c.drawImage(
          tex.canvas,
          frame.cutX,
          frame.cutY,
          DARREN_FRAME_W * 2,
          DARREN_FRAME_H * 2,
          112,
          0,
          256,
          293
        );
      }
    }
  }
}
const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: Math.ceil(W / VIEW_PIXEL),
  height: Math.ceil(H / VIEW_PIXEL),
  backgroundColor: '#7294ad',
  pixelArt: false,
  roundPixels: false,
  antialias: true,
  render: {
    antialias: true,
    pixelArt: false,
    roundPixels: false,
    powerPreference: 'high-performance',
  },
  fps: { target: 60, smoothStep: false },
  input: { keyboard: true, gamepad: true },
  audio: { noAudio: true },
  scene: [SnowdayScene],
  banner: false,
  autoFocus: false,
  scale: { mode: Phaser.Scale.NONE, autoCenter: Phaser.Scale.NO_CENTER },
});
