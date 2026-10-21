/* NEON BREAKER - presentation, simulation and input. */
(function () {
  'use strict';

  var C = window.NBCore;
  var S = window.NBSound;
  var W = C.WORLD;
  var P = C.PADDLE;
  var B = C.BALL;
  var TAU = Math.PI * 2;
  var STEP = 1 / 120;
  var FONT = '"Segoe UI", "Trebuchet MS", system-ui, sans-serif';
  var NUM = '"Bahnschrift", "Consolas", "Segoe UI", monospace';
  var BEST_KEY = 'neonbreaker.best';

  var canvas = document.getElementById('game');
  var ctx = canvas.getContext('2d');
  var scale = 1;
  var isCoarse = window.matchMedia
    ? window.matchMedia('(hover: none), (pointer: coarse)').matches
    : ('ontouchstart' in window);

  var bgGrad = null;
  var vignette = null;

  var G = {
    state: 'menu',
    time: 0,
    level: 1,
    score: 0,
    best: loadBest(),
    lives: 3,
    combo: 0,
    comboMult: 1,
    comboPulse: 0,
    scorePulse: 0,
    bricksSmashed: 0,
    powerupsCollected: 0,
    newBest: false,
    levelData: null,
    bricks: [],
    totalBricks: 0,
    menuBricks: null,
    balls: [],
    drops: [],
    lasers: [],
    particles: [],
    floaters: [],
    paddle: {
      x: W.width / 2, y: P.y, w: P.width, targetW: P.width,
      h: P.height, vx: 0, targetX: W.width / 2
    },
    timers: { wide: 0, laser: 0, sticky: 0, slow: 0 },
    speed: C.levelSpeed(1),
    keyLeft: false,
    keyRight: false,
    mode: 'pointer',
    fireCooldown: 0,
    banner: 0,
    bannerText: '',
    bannerSub: '',
    clearTimer: 0,
    clearBonus: 0,
    overTimer: 0,
    shake: { t: 0, dur: 1, mag: 0 },
    flash: 0,
    flashColor: '#ff5b6e',
    toast: { text: '', t: 0, color: '#8dff6b' },
    stars: [],
    orbs: []
  };

  /* ------------------------------------------------------------------ */
  /* helpers                                                             */
  /* ------------------------------------------------------------------ */

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  function loadBest() {
    try { return parseInt(window.localStorage.getItem(BEST_KEY), 10) || 0; } catch (e) { return 0; }
  }

  function saveBest(v) {
    try { window.localStorage.setItem(BEST_KEY, String(v)); } catch (e) { /* ignore */ }
  }

  function pad(n, len) {
    var s = String(Math.max(0, Math.floor(n)));
    while (s.length < len) s = '0' + s;
    return s;
  }

  function hexA(hex, a) {
    var n = parseInt(hex.slice(1), 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  }

  function rr(x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(x, y, w, h, r);
      return;
    }
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function label(text, x, y, size, color, align, weight, spacing) {
    ctx.save();
    ctx.font = (weight || 600) + ' ' + size + 'px ' + FONT;
    ctx.fillStyle = color;
    ctx.textAlign = align || 'left';
    ctx.textBaseline = 'middle';
    if ('letterSpacing' in ctx) ctx.letterSpacing = (spacing || 0) + 'px';
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  function num(text, x, y, size, color, align, glow, blur) {
    ctx.save();
    ctx.font = '800 ' + size + 'px ' + NUM;
    ctx.fillStyle = color;
    ctx.textAlign = align || 'center';
    ctx.textBaseline = 'middle';
    if (glow) {
      ctx.shadowColor = glow;
      ctx.shadowBlur = blur == null ? 14 : blur;
    }
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  function starField() {
    var rng = C.mulberry32(20260118);
    G.stars = [];
    for (var i = 0; i < 120; i++) {
      G.stars.push({
        x: rng() * W.width,
        y: rng() * W.height,
        r: 0.5 + rng() * 1.5,
        a: 0.10 + rng() * 0.42,
        tw: rng() * TAU,
        sp: 2 + rng() * 7
      });
    }
    G.orbs = [
      { x: 170, y: 150, r: 290, c: '#1de5ff', ph: 0, ax: 50, ay: 30 },
      { x: 800, y: 500, r: 320, c: '#ff2fb3', ph: 1.9, ax: 44, ay: 40 },
      { x: 480, y: 330, r: 380, c: '#5b5bff', ph: 3.4, ax: 30, ay: 26 }
    ];
    G.menuBricks = C.createLevel(3).bricks;
  }

  /* ------------------------------------------------------------------ */
  /* geometry / positions                                                */
  /* ------------------------------------------------------------------ */

  function paddleBounds() {
    var half = G.paddle.w / 2;
    return { min: half + 8, max: W.width - half - 8 };
  }

  function currentSpeed() {
    return G.speed * (G.timers.slow > 0 ? 0.72 : 1);
  }

  function makeBall(x, y, angle) {
    var sp = currentSpeed();
    return {
      x: x, y: y,
      vx: Math.cos(angle) * sp,
      vy: Math.sin(angle) * sp,
      r: B.radius,
      stuck: false,
      stuckAt: 0,
      offset: 0,
      trail: []
    };
  }

  function spawnBall(stuck) {
    var p = G.paddle;
    G.balls.push({
      x: p.x, y: p.y - B.radius - 2,
      vx: 0, vy: 0, r: B.radius,
      stuck: !!stuck, stuckAt: G.time, offset: 0, trail: []
    });
  }

  function launchBalls() {
    var launched = false;
    var sp = currentSpeed();
    G.balls.forEach(function (b) {
      if (!b.stuck) return;
      var ang = -Math.PI / 2 + (Math.random() - 0.5) * 0.55;
      b.vx = Math.cos(ang) * sp;
      b.vy = Math.sin(ang) * sp;
      b.stuck = false;
      b.offset = 0;
      b.trail.length = 0;
      launched = true;
    });
    if (launched) S.play('paddle');
  }

  /* ------------------------------------------------------------------ */
  /* effects                                                             */
  /* ------------------------------------------------------------------ */

  function burst(x, y, color, count, power) {
    for (var i = 0; i < count; i++) {
      var a = Math.random() * TAU;
      var sp = (40 + Math.random() * 220) * (power || 1);
      var life = 0.25 + Math.random() * 0.55;
      G.particles.push({
        kind: 'spark',
        x: x, y: y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: life, max: life,
        size: 1.2 + Math.random() * 2.6,
        color: color,
        grav: 260,
        drag: 1.2
      });
    }
    while (G.particles.length > 720) G.particles.shift();
  }

  function ring(x, y, color, size) {
    G.particles.push({
      kind: 'ring', x: x, y: y, vx: 0, vy: 0,
      life: 0.42, max: 0.42, size: size,
      color: color, grav: 0, drag: 0
    });
  }

  function floater(x, y, text, color, size) {
    G.floaters.push({
      x: x, y: y, text: text, color: color,
      size: size || 15, life: 0.9, max: 0.9, vy: -52
    });
    while (G.floaters.length > 28) G.floaters.shift();
  }

  function shake(mag, dur) {
    G.shake.mag = Math.max(G.shake.mag, mag);
    G.shake.dur = Math.max(G.shake.dur, dur);
    G.shake.t = Math.max(G.shake.t, dur);
  }

  function flash(color, amount) {
    G.flashColor = color;
    G.flash = Math.max(G.flash, amount);
  }

  function toast(text, color) {
    G.toast.text = text;
    G.toast.color = color || '#8dff6b';
    G.toast.t = 1.5;
  }

  /* ------------------------------------------------------------------ */
  /* lifecycle                                                           */
  /* ------------------------------------------------------------------ */

  function startGame() {
    S.ensure();
    G.score = 0;
    G.lives = 3;
    G.combo = 0;
    G.comboMult = 1;
    G.comboPulse = 0;
    G.bricksSmashed = 0;
    G.powerupsCollected = 0;
    G.newBest = false;
    G.overTimer = 0;
    G.particles.length = 0;
    G.floaters.length = 0;
    G.drops.length = 0;
    G.lasers.length = 0;
    G.flash = 0;
    G.time = 0;
    S.play('start');
    loadLevel(1);
    G.state = 'playing';
    S.startMusic();
    updateTouchUi();
  }

  function loadLevel(level) {
    var data = C.createLevel(level);
    G.level = level;
    G.levelData = data;
    G.bricks = data.bricks;
    G.totalBricks = data.total;
    G.speed = data.speed;
    G.balls = [];
    G.drops = [];
    G.lasers = [];
    G.floaters = [];
    G.fireCooldown = 0;
    G.combo = 0;
    G.comboMult = 1;
    G.timers.wide = 0;
    G.timers.laser = 0;
    G.timers.sticky = 0;
    G.timers.slow = 0;
    G.paddle.w = P.width;
    G.paddle.targetW = P.width;
    G.paddle.x = W.width / 2;
    G.paddle.targetX = W.width / 2;
    G.paddle.vx = 0;
    G.mode = 'pointer';
    spawnBall(true);
    G.banner = 2.0;
    G.bannerText = 'LEVEL ' + level;
    G.bannerSub = data.pattern.toUpperCase();
  }

  function loseLife() {
    G.lives -= 1;
    G.combo = 0;
    G.comboMult = 1;
    G.comboPulse = 0;
    shake(13, 0.4);
    flash('#ff5b6e', 0.55);
    S.play('lose');
    if (G.lives <= 0) {
      endGame();
    } else {
      G.timers.sticky = 0;
      G.paddle.targetW = G.timers.wide > 0 ? P.width * P.wideScale : P.width;
      spawnBall(true);
      toast(G.lives + (G.lives === 1 ? ' LIFE LEFT' : ' LIVES LEFT'), '#ffb84d');
    }
  }

  function endGame() {
    G.state = 'gameover';
    G.overTimer = 0;
    G.newBest = G.score > G.best;
    if (G.newBest) {
      G.best = G.score;
      saveBest(G.best);
    }
    S.stopMusic();
    S.play('over');
    updateTouchUi();
  }

  function enterLevelClear() {
    G.state = 'levelclear';
    G.clearTimer = 2.3;
    G.clearBonus = C.levelBonus(G.level, G.lives);
    G.score += G.clearBonus;
    G.combo = 0;
    G.comboMult = 1;
    shake(7, 0.35);
    flash('#8dff6b', 0.35);
    S.play('clear');
  }

  function togglePause() {
    if (G.state === 'playing') {
      G.state = 'paused';
      S.play('click');
    } else if (G.state === 'paused') {
      G.state = 'playing';
      S.play('click');
    }
    updateTouchUi();
  }

  /* ------------------------------------------------------------------ */
  /* update: simulation                                                  */
  /* ------------------------------------------------------------------ */

  function update(dt) {
    G.banner = Math.max(0, G.banner - dt);
    updateFx(dt);
    if (G.state !== 'playing') return;

    updateTimers(dt);
    updatePaddle(dt);
    updateBalls(dt);
    updateDrops(dt);
    updateLasers(dt);

    if (G.state !== 'playing') return;
    if (!anyBricks()) enterLevelClear();
  }

  function updateTimers(dt) {
    var keys = ['wide', 'laser', 'sticky', 'slow'];
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      if (G.timers[k] <= 0) continue;
      G.timers[k] -= dt;
      if (G.timers[k] > 0) continue;
      G.timers[k] = 0;
      if (k === 'wide') {
        G.paddle.targetW = P.width;
      } else if (k === 'sticky') {
        launchBalls();
      }
    }
  }

  function updatePaddle(dt) {
    var p = G.paddle;
    p.w += (p.targetW - p.w) * Math.min(1, dt * 11);
    var b = paddleBounds();
    var prev = p.x;

    if (G.mode === 'keys') {
      var dir = (G.keyRight ? 1 : 0) - (G.keyLeft ? 1 : 0);
      p.x = clamp(p.x + dir * P.speed * dt, b.min, b.max);
      p.targetX = p.x;
      p.vx = (p.x - prev) / dt;
    } else {
      var target = clamp(p.targetX, b.min, b.max);
      p.x += (target - p.x) * Math.min(1, dt * 40);
      p.vx = (p.x - prev) / dt;
    }
    p.x = clamp(p.x, b.min, b.max);
  }

  function updateBalls(dt) {
    var p = G.paddle;
    var sp = currentSpeed();
    var i, b;

    for (i = G.balls.length - 1; i >= 0; i--) {
      b = G.balls[i];

      if (b.stuck) {
        b.x = clamp(p.x + b.offset, b.r + 8, W.width - b.r - 8);
        b.y = p.y - b.r - 2;
        b.vx = 0;
        b.vy = 0;
        continue;
      }

      var mag = Math.hypot(b.vx, b.vy);
      if (mag < 0.001) {
        b.vx = 0;
        b.vy = -sp;
      } else {
        b.vx = b.vx / mag * sp;
        b.vy = b.vy / mag * sp;
      }

      b.x += b.vx * dt;
      b.y += b.vy * dt;

      b.trail.push({ x: b.x, y: b.y });
      if (b.trail.length > 14) b.trail.shift();

      /* walls */
      if (b.x - b.r < 0) {
        b.x = b.r;
        b.vx = Math.abs(b.vx);
        S.play('wall');
      } else if (b.x + b.r > W.width) {
        b.x = W.width - b.r;
        b.vx = -Math.abs(b.vx);
        S.play('wall');
      }
      if (b.y - b.r < C.PLAY_TOP) {
        b.y = C.PLAY_TOP + b.r;
        b.vy = Math.abs(b.vy);
        S.play('wall');
      }

      if (b.y - b.r > W.height + 30) {
        G.balls.splice(i, 1);
        continue;
      }

      /* paddle */
      if (b.vy > 0 &&
          b.y + b.r >= p.y &&
          b.y - b.r <= p.y + p.h &&
          b.x + b.r >= p.x - p.w / 2 &&
          b.x - b.r <= p.x + p.w / 2) {
        b.y = p.y - b.r - 0.5;
        var rel = clamp((b.x - p.x) / (p.w / 2), -1, 1);
        var ang = rel * P.maxBounce;
        var vx = Math.sin(ang) + clamp(p.vx * 0.00022, -0.35, 0.35);
        var vy = -Math.abs(Math.cos(ang));
        var m2 = Math.hypot(vx, vy) || 1;
        b.vx = vx / m2 * sp;
        b.vy = vy / m2 * sp;

        G.combo = 0;
        G.comboMult = 1;
        G.comboPulse = 0;
        S.play('paddle');
        burst(b.x, p.y, '#3ef2ff', 5, 0.45);

        if (G.timers.sticky > 0) {
          b.stuck = true;
          b.stuckAt = G.time;
          b.offset = clamp(b.x - p.x, -p.w / 2 + 12, p.w / 2 - 12);
          b.trail.length = 0;
        }
      }

      /* bricks */
      for (var j = 0; j < G.bricks.length; j++) {
        var br = G.bricks[j];
        if (!br.alive) continue;
        var hit = C.circleRect(b.x, b.y, b.r, br);
        if (!hit.hit) continue;

        b.x += hit.nx * (hit.depth + 0.4);
        b.y += hit.ny * (hit.depth + 0.4);
        var dot = b.vx * hit.nx + b.vy * hit.ny;
        if (dot < 0) {
          var out = C.reflect(b.vx, b.vy, hit.nx, hit.ny);
          b.vx = out[0];
          b.vy = out[1];
        }
        hitBrick(br, 1, b.x, b.y);
        break;
      }

      /* never let the ball crawl along a perfectly flat path forever */
      var minVy = sp * 0.16;
      if (Math.abs(b.vy) < minVy) {
        b.vy = (b.vy >= 0 ? 1 : -1) * minVy;
        var m3 = Math.hypot(b.vx, b.vy) || 1;
        b.vx = b.vx / m3 * sp;
        b.vy = b.vy / m3 * sp;
      }
    }

    if (G.balls.length === 0 && G.state === 'playing') loseLife();
  }

  function hitBrick(brick, damage, px, py) {
    if (!brick.alive) return false;
    brick.hp -= damage;
    brick.flash = 0.12;

    if (brick.hp > 0) {
      S.play('tough');
      burst(px, py, brick.color, 4, 0.5);
      return false;
    }

    brick.alive = false;
    brick.flash = 0;
    G.bricksSmashed += 1;
    G.combo += 1;
    G.comboPulse = 1;
    G.comboMult = C.comboMultiplier(G.combo);

    var pts = C.brickPoints(brick, G.comboMult);
    G.score += pts;
    G.scorePulse = 1;

    var cx = brick.x + brick.w / 2;
    var cy = brick.y + brick.h / 2;
    floater(cx, cy, '+' + pts, brick.type === 'bomb' ? '#ffb84d' : '#dffbff', 14);
    burst(cx, cy, brick.color, 14, 1);
    S.play('brick');

    if (brick.type === 'bomb') explode(cx, cy);

    if (Math.random() < 0.155) spawnDrop(cx, cy);

    return true;
  }

  function explode(x, y) {
    shake(11, 0.35);
    flash('#ffb84d', 0.5);
    ring(x, y, '#ffb84d', 140);
    burst(x, y, '#ffb84d', 34, 1.6);
    S.play('explode');

    for (var i = 0; i < G.bricks.length; i++) {
      var br = G.bricks[i];
      if (!br.alive) continue;
      var cx = br.x + br.w / 2;
      var cy = br.y + br.h / 2;
      if (Math.hypot(cx - x, cy - y) <= 124) {
        hitBrick(br, 4, cx, cy);
      }
    }
  }

  function spawnDrop(x, y) {
    var def = C.pickPowerup(Math.random);
    G.drops.push({
      x: x, y: y, r: 15, vy: 135,
      def: def, t: Math.random() * TAU
    });
    if (G.drops.length > 10) G.drops.shift();
  }

  function updateDrops(dt) {
    var p = G.paddle;
    for (var i = G.drops.length - 1; i >= 0; i--) {
      var d = G.drops[i];
      d.y += d.vy * dt;
      d.t += dt * 3;

      if (d.y > W.height + 30) {
        G.drops.splice(i, 1);
        continue;
      }

      if (d.y + d.r >= p.y && d.y - d.r <= p.y + p.h &&
          Math.abs(d.x - p.x) <= p.w / 2 + d.r * 0.7) {
        G.drops.splice(i, 1);
        collectDrop(d);
      }
    }
  }

  function collectDrop(drop) {
    var def = drop.def;
    G.powerupsCollected += 1;

    switch (def.id) {
      case 'multi': {
        var source = G.balls.filter(function (b) { return !b.stuck; });
        if (source.length === 0) {
          launchBalls();
          source = G.balls.filter(function (b) { return !b.stuck; });
        }
        var copies = [];
        source.slice(0, 4).forEach(function (b) {
          var ang = Math.atan2(b.vy, b.vx);
          copies.push(makeBall(b.x, b.y, ang + 0.45));
          copies.push(makeBall(b.x, b.y, ang - 0.45));
        });
        G.balls = G.balls.concat(copies).slice(0, 9);
        break;
      }
      case 'wide':
        G.timers.wide = def.duration;
        G.paddle.targetW = P.width * P.wideScale;
        break;
      case 'laser':
        G.timers.laser = def.duration;
        G.fireCooldown = 0;
        break;
      case 'sticky':
        G.timers.sticky = def.duration;
        break;
      case 'slow':
        G.timers.slow = def.duration;
        break;
      case 'life':
        G.lives = Math.min(5, G.lives + 1);
        S.play('life');
        break;
      default:
        break;
    }

    floater(G.paddle.x, G.paddle.y - 42, def.label, def.color, 18);
    ring(G.paddle.x, G.paddle.y, def.color, 80);
    S.play('power');
  }

  function updateLasers(dt) {
    var p = G.paddle;

    if (G.timers.laser > 0) {
      G.fireCooldown -= dt;
      if (G.fireCooldown <= 0) {
        G.fireCooldown = 0.26;
        G.lasers.push({ x: p.x - p.w / 2 + 13, y: p.y - 6, vy: -980 });
        G.lasers.push({ x: p.x + p.w / 2 - 13, y: p.y - 6, vy: -980 });
        S.play('laser');
      }
    }

    for (var i = G.lasers.length - 1; i >= 0; i--) {
      var l = G.lasers[i];
      l.y += l.vy * dt;

      if (l.y < C.PLAY_TOP) {
        G.lasers.splice(i, 1);
        continue;
      }

      var hit = false;
      for (var j = 0; j < G.bricks.length; j++) {
        var br = G.bricks[j];
        if (!br.alive) continue;
        if (l.x > br.x && l.x < br.x + br.w &&
            l.y - 8 < br.y + br.h && l.y + 8 > br.y) {
          hitBrick(br, 1, l.x, l.y);
          hit = true;
          break;
        }
      }
      if (hit) {
        G.lasers.splice(i, 1);
        burst(l.x, l.y, '#ff5b6e', 5, 0.7);
      }
    }
  }

  function updateFx(dt) {
    var i, p;

    for (i = G.particles.length - 1; i >= 0; i--) {
      p = G.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        G.particles.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += p.grav * dt;
      if (p.drag) {
        p.vx -= p.vx * p.drag * dt;
        p.vy -= p.vy * p.drag * dt;
      }
    }

    for (i = G.floaters.length - 1; i >= 0; i--) {
      var f = G.floaters[i];
      f.life -= dt;
      f.y += f.vy * dt;
      if (f.life <= 0) G.floaters.splice(i, 1);
    }

    if (G.shake.t > 0) {
      G.shake.t -= dt;
      if (G.shake.t <= 0) {
        G.shake.t = 0;
        G.shake.mag = 0;
      }
    }
    if (G.flash > 0) G.flash = Math.max(0, G.flash - dt * 2.6);
    if (G.toast.t > 0) G.toast.t = Math.max(0, G.toast.t - dt);
    if (G.comboPulse > 0) G.comboPulse = Math.max(0, G.comboPulse - dt * 4);
    if (G.scorePulse > 0) G.scorePulse = Math.max(0, G.scorePulse - dt * 4);

    for (i = 0; i < G.bricks.length; i++) {
      if (G.bricks[i].flash > 0) G.bricks[i].flash = Math.max(0, G.bricks[i].flash - dt);
    }
  }

  function anyBricks() {
    for (var i = 0; i < G.bricks.length; i++) if (G.bricks[i].alive) return true;
    return false;
  }

  /* ------------------------------------------------------------------ */
  /* render                                                              */
  /* ------------------------------------------------------------------ */

  function initGradients() {
    bgGrad = ctx.createLinearGradient(0, 0, 0, W.height);
    bgGrad.addColorStop(0, '#060912');
    bgGrad.addColorStop(0.55, '#070b18');
    bgGrad.addColorStop(1, '#0b1024');

    vignette = ctx.createRadialGradient(W.width / 2, W.height * 0.46, 190, W.width / 2, W.height * 0.5, 640);
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(1, 'rgba(0,0,0,0.55)');
  }

  function drawBackground(t) {
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, W.width, W.height);

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (var i = 0; i < G.orbs.length; i++) {
      var o = G.orbs[i];
      var ox = o.x + Math.sin(t * 0.11 + o.ph) * o.ax;
      var oy = o.y + Math.cos(t * 0.09 + o.ph) * o.ay;
      var g = ctx.createRadialGradient(ox, oy, 0, ox, oy, o.r);
      g.addColorStop(0, hexA(o.c, 0.085));
      g.addColorStop(0.55, hexA(o.c, 0.03));
      g.addColorStop(1, hexA(o.c, 0));
      ctx.fillStyle = g;
      ctx.fillRect(ox - o.r, oy - o.r, o.r * 2, o.r * 2);
    }
    ctx.restore();

    ctx.strokeStyle = 'rgba(90,160,255,0.05)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (var x = 0; x <= W.width; x += 48) {
      ctx.moveTo(x + 0.5, 0);
      ctx.lineTo(x + 0.5, W.height);
    }
    for (var y = 0; y <= W.height; y += 48) {
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(W.width, y + 0.5);
    }
    ctx.stroke();

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (var s = 0; s < G.stars.length; s++) {
      var st = G.stars[s];
      var yy = (st.y + t * st.sp) % W.height;
      var alpha = st.a * (0.6 + 0.4 * Math.sin(t * 1.4 + st.tw));
      ctx.fillStyle = 'rgba(190,225,255,' + alpha.toFixed(3) + ')';
      ctx.beginPath();
      ctx.arc(st.x, yy, st.r, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawVignette() {
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, W.width, W.height);
  }

  function drawBrick(br) {
    if (!br.alive) return;
    var tough = br.type === 'tough';
    var bomb = br.type === 'bomb';
    var col = tough ? '#a9b8dd' : (bomb ? '#ff5b6e' : br.color);
    var pulse = bomb ? 0.5 + 0.5 * Math.sin(G.time * 6 + br.col) : 0;
    var x = br.x, y = br.y, w = br.w, h = br.h;

    rr(x, y, w, h, 5);
    ctx.fillStyle = hexA(col, br.flash > 0 ? 0.5 : (tough ? 0.15 : 0.12));
    ctx.fill();

    ctx.fillStyle = hexA(col, 0.24 + pulse * 0.28);
    ctx.fillRect(x + 5, y + 4, w - 10, 2.5);

    ctx.strokeStyle = br.flash > 0 ? '#ffffff' : hexA(col, 0.82);
    ctx.lineWidth = br.flash > 0 ? 2 : 1.3;
    rr(x + 0.7, y + 0.7, w - 1.4, h - 1.4, 5);
    ctx.stroke();

    if (tough) {
      for (var i = 0; i < br.maxHp; i++) {
        ctx.beginPath();
        ctx.arc(x + 9 + i * 8, y + h - 7, 2.2, 0, TAU);
        ctx.fillStyle = i < br.hp ? '#dff3ff' : 'rgba(220,240,255,0.2)';
        ctx.fill();
      }
    } else if (bomb) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = hexA('#ffb84d', 0.35 + pulse * 0.45);
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(x + w / 2, y + h / 2, 5 + pulse * 4, 0, TAU);
      ctx.stroke();
      ctx.fillStyle = hexA('#ffe3a8', 0.55 + pulse * 0.4);
      ctx.beginPath();
      ctx.arc(x + w / 2, y + h / 2, 2.6, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
  }

  function drawBricks() {
    for (var i = 0; i < G.bricks.length; i++) drawBrick(G.bricks[i]);
  }

  function drawBall(b) {
    var i, a;
    for (i = 0; i < b.trail.length; i++) {
      a = (i + 1) / b.trail.length;
      ctx.globalAlpha = a * 0.20;
      ctx.fillStyle = '#5ef4ff';
      ctx.beginPath();
      ctx.arc(b.trail[i].x, b.trail[i].y, b.r * a * 0.85, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    var glow = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r * 3.4);
    glow.addColorStop(0, 'rgba(120,248,255,0.55)');
    glow.addColorStop(1, 'rgba(62,242,255,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r * 3.4, 0, TAU);
    ctx.fill();
    ctx.restore();

    var core = ctx.createRadialGradient(b.x - b.r * 0.35, b.y - b.r * 0.35, 0.5, b.x, b.y, b.r);
    core.addColorStop(0, '#ffffff');
    core.addColorStop(0.55, '#d6fdff');
    core.addColorStop(1, '#3ef2ff');
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, TAU);
    ctx.fill();
  }

  function drawBalls() {
    for (var i = 0; i < G.balls.length; i++) drawBall(G.balls[i]);
  }

  function drawPaddle() {
    var p = G.paddle;
    var x = p.x - p.w / 2;
    var y = p.y;

    ctx.save();
    ctx.shadowColor = '#3ef2ff';
    ctx.shadowBlur = 20;
    var g = ctx.createLinearGradient(x, 0, x + p.w, 0);
    g.addColorStop(0, '#5cf7ff');
    g.addColorStop(0.5, '#63b8ff');
    g.addColorStop(1, '#b06bff');
    rr(x, y, p.w, p.h, 7);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.restore();

    rr(x + 2, y + 2, p.w - 4, 3, 2);
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fill();

    if (G.timers.laser > 0) {
      ctx.save();
      ctx.shadowColor = '#ff5b6e';
      ctx.shadowBlur = 12;
      ctx.fillStyle = '#ff8b9b';
      ctx.fillRect(x + 8, y - 4, 5, 8);
      ctx.fillRect(x + p.w - 13, y - 4, 5, 8);
      ctx.restore();
    }

    if (G.timers.sticky > 0) {
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = 'rgba(255,184,77,0.85)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x + 7, y - 1);
      ctx.lineTo(x + p.w - 7, y - 1);
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawDrops() {
    for (var i = 0; i < G.drops.length; i++) {
      var d = G.drops[i];
      var col = d.def.color;
      var bob = Math.sin(d.t) * 2;
      ctx.save();
      ctx.translate(d.x, d.y + bob);
      ctx.rotate(Math.sin(d.t * 0.6) * 0.14);
      ctx.shadowColor = col;
      ctx.shadowBlur = 18;
      rr(-15, -15, 30, 30, 9);
      ctx.fillStyle = hexA(col, 0.18);
      ctx.fill();
      ctx.strokeStyle = hexA(col, 0.95);
      ctx.lineWidth = 1.6;
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.font = '800 14px ' + NUM;
      ctx.fillStyle = col;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(d.def.short, 0, 1);
      ctx.restore();
    }
  }

  function drawLasers() {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (var i = 0; i < G.lasers.length; i++) {
      var l = G.lasers[i];
      var g = ctx.createLinearGradient(l.x, l.y - 16, l.x, l.y + 16);
      g.addColorStop(0, 'rgba(255,91,110,0)');
      g.addColorStop(0.5, 'rgba(255,180,190,0.95)');
      g.addColorStop(1, 'rgba(255,91,110,0.1)');
      ctx.fillStyle = g;
      ctx.fillRect(l.x - 1.7, l.y - 16, 3.4, 32);
    }
    ctx.restore();
  }

  function drawParticles() {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (var i = 0; i < G.particles.length; i++) {
      var p = G.particles[i];
      var a = Math.max(0, p.life / p.max);
      if (p.kind === 'ring') {
        var r = 6 + p.size * (1 - a);
        ctx.strokeStyle = hexA(p.color, a * 0.6);
        ctx.lineWidth = 1 + a * 2.5;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, TAU);
        ctx.stroke();
      } else {
        ctx.fillStyle = hexA(p.color, a);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * a + 0.4, 0, TAU);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  function drawFloaters() {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (var i = 0; i < G.floaters.length; i++) {
      var f = G.floaters[i];
      var a = Math.min(1, (f.life / f.max) * 2.2);
      ctx.globalAlpha = a;
      ctx.font = '800 ' + f.size + 'px ' + NUM;
      ctx.fillStyle = f.color;
      ctx.shadowColor = f.color;
      ctx.shadowBlur = 10;
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.restore();
  }

  function drawHud() {
    var g = ctx.createLinearGradient(0, 0, 0, 112);
    g.addColorStop(0, 'rgba(5,9,18,0.94)');
    g.addColorStop(0.65, 'rgba(5,9,18,0.62)');
    g.addColorStop(1, 'rgba(5,9,18,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W.width, 112);

    label('SCORE', 26, 24, 10, '#7fa2c4', 'left', 700, 3.5);
    var pulse = 1 + G.scorePulse * 0.03;
    ctx.save();
    ctx.translate(24, 48);
    ctx.scale(pulse, pulse);
    num(pad(G.score, 7), 0, 0, 29, '#ecfeff', 'left', '#3ef2ff', 13);
    ctx.restore();

    var shownBest = Math.max(G.best, G.score);
    label('BEST ' + pad(shownBest, 7), 26, 70, 10, '#6f90b3', 'left', 600, 2);

    label('LEVEL', W.width / 2, 22, 10, '#7fa2c4', 'center', 700, 4);
    num(String(G.level), W.width / 2, 47, 30, '#ecfeff', 'center', '#a06bff', 14);
    label((G.levelData ? G.levelData.pattern.toUpperCase() : ''), W.width / 2, 70, 9, '#46628a', 'center', 600, 3);

    label('LIVES', W.width - 26, 22, 10, '#7fa2c4', 'right', 700, 3.5);
    for (var i = 0; i < Math.max(3, G.lives); i++) {
      var cx = W.width - 26 - i * 21;
      var cy = 46;
      ctx.save();
      if (i < G.lives) {
        ctx.shadowColor = '#ff5bd0';
        ctx.shadowBlur = 12;
        ctx.fillStyle = '#ff8fdc';
      } else {
        ctx.strokeStyle = 'rgba(255,255,255,0.18)';
        ctx.fillStyle = 'transparent';
      }
      ctx.beginPath();
      ctx.moveTo(cx, cy - 7);
      ctx.lineTo(cx + 6, cy);
      ctx.lineTo(cx, cy + 7);
      ctx.lineTo(cx - 6, cy);
      ctx.closePath();
      if (i < G.lives) ctx.fill();
      else {
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }
      ctx.restore();
    }

    var alive = 0;
    for (var b = 0; b < G.bricks.length; b++) if (G.bricks[b].alive) alive++;
    var ratio = G.totalBricks ? 1 - alive / G.totalBricks : 0;
    ctx.fillStyle = 'rgba(255,255,255,0.055)';
    ctx.fillRect(0, C.PLAY_TOP - 2, W.width, 3);
    if (ratio > 0) {
      var pg = ctx.createLinearGradient(0, 0, W.width, 0);
      pg.addColorStop(0, '#3ef2ff');
      pg.addColorStop(1, '#ff5bd0');
      ctx.fillStyle = pg;
      ctx.fillRect(0, C.PLAY_TOP - 2, W.width * clamp(ratio, 0, 1), 3);
    }

    /* active power-up chips */
    var chips = [];
    var defs = { wide: 'W', laser: 'L', sticky: 'S', slow: 'T' };
    var colors = { wide: '#8dff6b', laser: '#ff5b6e', sticky: '#ffb84d', slow: '#a06bff' };
    ['wide', 'laser', 'sticky', 'slow'].forEach(function (k) {
      if (G.timers[k] > 0) chips.push(k);
    });
    if (chips.length) {
      var chipW = 84, gap = 8;
      var startX = W.width / 2 - (chips.length * chipW + (chips.length - 1) * gap) / 2;
      chips.forEach(function (k, idx) {
        var x = startX + idx * (chipW + gap);
        var y = W.height - 25;
        var frac = G.timers[k] / clampDuration(k);
        rr(x, y, chipW, 19, 9.5);
        ctx.fillStyle = 'rgba(4,8,16,0.6)';
        ctx.fill();
        ctx.strokeStyle = hexA(colors[k], 0.55);
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.fillStyle = hexA(colors[k], 0.9);
        ctx.fillRect(x + 6, y + 17, (chipW - 12) * clamp(frac, 0, 1), 1.4);
        label(defs[k] + ' ' + Math.ceil(G.timers[k]) + 's', x + 8, y + 9, 9.5, colors[k], 'left', 700, 1);
      });
    }

    /* combo badge */
    if (G.comboMult > 1) {
      var cc = G.comboMult >= 8 ? '#ff5b6e' : (G.comboMult >= 5 ? '#ffb84d' : '#8dff6b');
      ctx.save();
      ctx.translate(W.width / 2, 545);
      var scl = 1 + G.comboPulse * 0.18;
      ctx.scale(scl, scl);
      num('x' + G.comboMult, 0, 0, 30, cc, 'center', cc, 16);
      label('COMBO', 0, 20, 8, hexA(cc, 0.9), 'center', 700, 4);
      ctx.restore();
    }
  }

  function clampDuration(k) {
    for (var i = 0; i < C.POWERUPS.length; i++) {
      if (C.POWERUPS[i].id === k) return C.POWERUPS[i].duration || 1;
    }
    return 1;
  }

  function drawServeHint() {
    if (G.state !== 'playing') return;
    var waiting = false;
    for (var i = 0; i < G.balls.length; i++) {
      if (G.balls[i].stuck && G.time - G.balls[i].stuckAt > 0.9) { waiting = true; break; }
    }
    if (!waiting) return;
    var a = 0.55 + 0.35 * Math.sin(G.time * 3.2);
    ctx.save();
    ctx.globalAlpha = a;
    label(isCoarse ? 'TAP TO SERVE' : 'PRESS SPACE TO SERVE', W.width / 2, G.paddle.y - 40, 11, '#8fb7d9', 'center', 700, 3.5);
    ctx.restore();
  }

  function drawBanner() {
    if (G.banner <= 0) return;
    var t = G.banner;
    var alpha = Math.min(1, Math.min((2.0 - t) * 5, t * 2.2));
    if (alpha <= 0) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    var y = 360 - (1 - Math.min(1, t / 2)) * 10;
    label(G.bannerText, W.width / 2, y, 34, '#eaffff', 'center', 800, 10);
    label(G.bannerSub, W.width / 2, y + 30, 11, '#7fb1d1', 'center', 600, 6);
    ctx.restore();
  }

  function drawToast() {
    if (G.toast.t <= 0) return;
    var a = Math.min(1, G.toast.t * 2);
    ctx.save();
    ctx.globalAlpha = a;
    label(G.toast.text, W.width / 2, 122, 11, G.toast.color, 'center', 700, 4);
    ctx.restore();
  }

  function drawFlash() {
    if (G.flash <= 0) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = G.flash * 0.45;
    ctx.fillStyle = G.flashColor;
    ctx.fillRect(0, 0, W.width, W.height);
    ctx.restore();
  }

  function drawDanger() {
    if (G.lives !== 1 || G.state === 'menu') return;
    var a = 0.05 + 0.045 * Math.sin(G.time * 4.2);
    var g = ctx.createRadialGradient(W.width / 2, W.height / 2, W.height * 0.30, W.width / 2, W.height / 2, W.height * 0.78);
    g.addColorStop(0, 'rgba(255,40,80,0)');
    g.addColorStop(1, 'rgba(255,40,80,' + a.toFixed(3) + ')');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W.width, W.height);
  }

  /* ---------- menu / overlays ---------------------------------------- */

  function drawMenu(t) {
    ctx.save();
    ctx.globalAlpha = 0.16;
    for (var i = 0; i < G.menuBricks.length; i++) drawBrick(G.menuBricks[i]);
    ctx.restore();

    var veil = ctx.createLinearGradient(0, 0, 0, W.height);
    veil.addColorStop(0, 'rgba(3,6,14,0.58)');
    veil.addColorStop(0.5, 'rgba(3,6,14,0.80)');
    veil.addColorStop(1, 'rgba(3,6,14,0.94)');
    ctx.fillStyle = veil;
    ctx.fillRect(0, 0, W.width, W.height);

    var pulse = 0.5 + 0.5 * Math.sin(t * 2.2);

    ctx.save();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = '900 68px ' + FONT;
    if ('letterSpacing' in ctx) ctx.letterSpacing = '5px';
    var a = 'NEON ';
    var b = 'BREAKER';
    var aw = ctx.measureText(a).width;
    var bw = ctx.measureText(b).width;
    var startX = W.width / 2 - (aw + bw) / 2 - 2;
    ctx.shadowColor = '#3ef2ff';
    ctx.shadowBlur = 34;
    ctx.fillStyle = '#eafeff';
    ctx.fillText(a, startX, 226);
    ctx.shadowColor = '#ff5bd0';
    ctx.fillStyle = '#ffeaf9';
    ctx.fillText(b, startX + aw, 226);
    ctx.restore();

    label('NEON-SOAKED ARCADE BREAKOUT', W.width / 2, 286, 14, '#8fb7d9', 'center', 600, 5);

    ctx.strokeStyle = 'rgba(62,242,255,' + (0.18 + pulse * 0.18) + ')';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(150, 316);
    ctx.lineTo(W.width - 150, 316);
    ctx.stroke();

    ctx.save();
    var pw = 340, ph = 52;
    ctx.shadowColor = '#3ef2ff';
    ctx.shadowBlur = 18 + pulse * 18;
    rr(W.width / 2 - pw / 2, 394, pw, ph, ph / 2);
    ctx.fillStyle = 'rgba(62,242,255,0.07)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(120,250,255,' + (0.45 + pulse * 0.4) + ')';
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.restore();
    label(isCoarse ? 'TAP TO START' : 'CLICK OR PRESS SPACE', W.width / 2, 420, 14, '#e6fdff', 'center', 700, 3.5);

    label('BEST  ' + pad(G.best, 7), W.width / 2, 476, 12, '#6f90b3', 'center', 600, 3);

    var rows = isCoarse ? [
      'DRAG TO MOVE  ·  TAP TO SERVE',
      'PAUSE / MUTE WITH THE BUTTONS BELOW',
      'CHAIN SMASHES TO RAISE YOUR MULTIPLIER'
    ] : [
      'MOVE  MOUSE  ·  A / D  ·  ARROWS',
      'SERVE  SPACE  ·  PAUSE  P / ESC  ·  MUTE  M',
      'CHAIN SMASHES TO RAISE YOUR MULTIPLIER'
    ];
    for (var r = 0; r < rows.length; r++) {
      label(rows[r], W.width / 2, 522 + r * 25, 11, r === 2 ? '#5e7f9f' : '#7fa2c4', 'center', 600, 2.5);
    }

    label('V1.0  ·  8 LEVEL SHAPES  ·  INFINITE RUNS', W.width / 2, W.height - 26, 9, '#3d5878', 'center', 600, 3);
    if (!isCoarse) label('SOUND ' + (S.isMuted() ? 'OFF' : 'ON'), W.width - 26, W.height - 26, 9, '#3d5878', 'right', 600, 2);
  }

  function panel(x, y, w, h, color) {
    rr(x, y, w, h, 16);
    ctx.fillStyle = 'rgba(5,10,20,0.82)';
    ctx.fill();
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = 28;
    ctx.strokeStyle = hexA(color, 0.55);
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.restore();
  }

  function drawPause() {
    ctx.fillStyle = 'rgba(3,6,14,0.66)';
    ctx.fillRect(0, 0, W.width, W.height);
    panel(W.width / 2 - 230, 232, 460, 190, '#3ef2ff');
    label('PAUSED', W.width / 2, 292, 38, '#eafeff', 'center', 800, 8);
    label(isCoarse ? 'TAP TO RESUME' : 'P / ESC  TO RESUME', W.width / 2, 348, 12, '#7fa2c4', 'center', 600, 3);
    label(isCoarse ? 'PAUSE / MUTE BUTTONS BELOW' : 'M  MUTE  ·  SOUND ' + (S.isMuted() ? 'OFF' : 'ON'), W.width / 2, 378, 10, '#4f6d8c', 'center', 600, 2.5);
    if (!isCoarse) label('CLICK TO RESUME', W.width / 2, 403, 9, '#3d5878', 'center', 600, 2.5);
  }

  function drawLevelClear() {
    var a = Math.min(1, (2.3 - G.clearTimer) * 4);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.fillStyle = 'rgba(3,6,14,0.34)';
    ctx.fillRect(0, 0, W.width, W.height);
    panel(W.width / 2 - 250, 262, 500, 170, '#8dff6b');
    label('LEVEL ' + G.level + ' CLEAR', W.width / 2, 308, 30, '#eaffee', 'center', 800, 7);
    label('CLEAR BONUS  +' + G.clearBonus, W.width / 2, 352, 14, '#8dff6b', 'center', 700, 2.5);
    label('NEXT LEVEL  ' + (G.level + 1), W.width / 2, 384, 10, '#6f90b3', 'center', 600, 3);
    var w = 300 * clamp(1 - G.clearTimer / 2.3, 0, 1);
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(W.width / 2 - 150, 405, 300, 3);
    ctx.fillStyle = '#8dff6b';
    ctx.fillRect(W.width / 2 - 150, 405, w, 3);
    ctx.restore();
  }

  function drawGameOver() {
    var a = Math.min(1, 0.45 + G.overTimer * 1.2);
    ctx.fillStyle = 'rgba(3,6,14,' + (0.5 * a + 0.15) + ')';
    ctx.fillRect(0, 0, W.width, W.height);

    panel(W.width / 2 - 280, 178, 560, 322, '#ff5b6e');
    label('GAME OVER', W.width / 2, 226, 40, '#ffdfe4', 'center', 800, 9);

    label('SCORE', W.width / 2, 274, 10, '#5d7fa6', 'center', 700, 3.5);
    num(pad(G.score, 7), W.width / 2, 306, 38, '#ecfeff', 'center', '#ff5b6e', 18);

    if (G.newBest) {
      var p = 0.65 + 0.35 * Math.sin(G.time * 5);
      ctx.save();
      ctx.globalAlpha = p;
      label('NEW BEST', W.width / 2, 342, 12, '#ffb84d', 'center', 800, 4);
      ctx.restore();
    } else {
      label('BEST  ' + pad(G.best, 7), W.width / 2, 342, 11, '#5d7fa6', 'center', 600, 2.5);
    }

    label('LEVEL ' + G.level + '   ·   ' + G.bricksSmashed + ' BRICKS   ·   ' + G.powerupsCollected + ' POWER-UPS',
      W.width / 2, 378, 10, '#6f90b3', 'center', 600, 2);

    if (G.overTimer > 0.55) {
      var q = 0.6 + 0.4 * Math.sin(G.time * 3.4);
      ctx.save();
      ctx.globalAlpha = q;
      label(isCoarse ? 'TAP TO PLAY AGAIN' : 'CLICK OR PRESS SPACE TO PLAY AGAIN', W.width / 2, 428, 12, '#dffbff', 'center', 700, 2.5);
      ctx.restore();
    }
    if (!isCoarse) label('R  RESTART  ·  M  MUTE', W.width / 2, 460, 9, '#3d5878', 'center', 600, 2.5);
  }

  /* ------------------------------------------------------------------ */
  /* frame                                                               */
  /* ------------------------------------------------------------------ */

  function render() {
    var t = G.time;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.clearRect(0, 0, W.width, W.height);
    drawBackground(t);

    if (G.state === 'menu') {
      drawMenu(t);
      return;
    }

    var ox = 0, oy = 0;
    if (G.shake.t > 0 && G.state !== 'paused') {
      var k = G.shake.t / G.shake.dur;
      ox = (Math.random() * 2 - 1) * G.shake.mag * k;
      oy = (Math.random() * 2 - 1) * G.shake.mag * k;
    }

    ctx.save();
    ctx.translate(ox, oy);
    drawBricks();
    drawDrops();
    drawLasers();
    drawParticles();
    drawPaddle();
    drawBalls();
    drawFloaters();
    drawVignette();
    ctx.restore();

    drawDanger();
    drawFlash();
    drawHud();
    drawBanner();
    drawServeHint();
    drawToast();

    if (G.state === 'paused') drawPause();
    else if (G.state === 'levelclear') drawLevelClear();
    else if (G.state === 'gameover') drawGameOver();
  }

  var last = 0;
  var acc = 0;
  var raf = 0;

  function frame(now) {
    raf = window.requestAnimationFrame(frame);
    if (!last) last = now;
    var dt = (now - last) / 1000;
    last = now;
    if (dt > 0.1) dt = 0.1;
    if (dt < 0) dt = 0;
    if (G.state !== 'paused') G.time += dt;

    if (G.state === 'playing') {
      acc += dt;
      var guard = 0;
      while (acc >= STEP && G.state === 'playing' && guard++ < 300) {
        update(STEP);
        acc -= STEP;
      }
      if (G.state !== 'playing') acc = 0;
    } else if (G.state === 'levelclear') {
      acc = 0;
      G.banner = Math.max(0, G.banner - dt);
      updateFx(dt);
      G.clearTimer -= dt;
      if (G.clearTimer <= 0) {
        loadLevel(G.level + 1);
        G.state = 'playing';
      }
    } else if (G.state === 'gameover') {
      acc = 0;
      G.overTimer += dt;
      updateFx(dt);
    } else if (G.state === 'menu') {
      acc = 0;
      updateFx(dt);
    }

    render();
  }

  /* ------------------------------------------------------------------ */
  /* input                                                               */
  /* ------------------------------------------------------------------ */

  function pointerWorldX(e) {
    var rect = canvas.getBoundingClientRect();
    if (!rect.width) return W.width / 2;
    return (e.clientX - rect.left) / rect.width * W.width;
  }

  function pointerDown(e) {
    if (e.button !== undefined && e.button !== 0) return;
    S.ensure();
    var x = pointerWorldX(e);
    G.mode = 'pointer';
    G.paddle.targetX = clamp(x, 0, W.width);

    if (G.state === 'menu') {
      startGame();
    } else if (G.state === 'gameover') {
      if (G.overTimer > 0.45) startGame();
    } else if (G.state === 'paused') {
      togglePause();
    } else if (G.state === 'playing') {
      launchBalls();
    }
  }

  function pointerMove(e) {
    var x = pointerWorldX(e);
    G.mode = 'pointer';
    G.paddle.targetX = clamp(x, 0, W.width);
  }

  function onKeyDown(e) {
    var k = e.key;
    var lower = k.length === 1 ? k.toLowerCase() : k;

    if (k === ' ' || k === 'ArrowLeft' || k === 'ArrowRight' || k === 'ArrowUp' || k === 'ArrowDown') {
      e.preventDefault();
    }

    S.ensure();

    if (lower === 'm') {
      var muted = S.toggleMute();
      toast(muted ? 'SOUND OFF' : 'SOUND ON', muted ? '#ff8b9b' : '#8dff6b');
      updateTouchUi();
      return;
    }

    if (lower === 'p' || k === 'Escape') {
      if (G.state === 'playing' || G.state === 'paused') togglePause();
      e.preventDefault();
      return;
    }

    if (lower === 'r' && G.state === 'gameover') {
      startGame();
      return;
    }

    if (k === ' ' || k === 'Enter') {
      if (G.state === 'menu') startGame();
      else if (G.state === 'gameover' && G.overTimer > 0.45) startGame();
      else if (G.state === 'paused') togglePause();
      else if (G.state === 'playing') launchBalls();
      return;
    }

    if (lower === 'a' || k === 'ArrowLeft') {
      G.keyLeft = true;
      G.mode = 'keys';
    } else if (lower === 'd' || k === 'ArrowRight') {
      G.keyRight = true;
      G.mode = 'keys';
    }
  }

  function onKeyUp(e) {
    var k = e.key;
    var lower = k.length === 1 ? k.toLowerCase() : k;
    if (lower === 'a' || k === 'ArrowLeft') G.keyLeft = false;
    if (lower === 'd' || k === 'ArrowRight') G.keyRight = false;
  }

  function resize() {
    var rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    scale = canvas.width / W.width;
  }

  var btnPause = null;
  var btnMute = null;

  function updateTouchUi() {
    if (!btnPause || !btnMute) return;
    var muted = S.isMuted();
    btnMute.classList.toggle('is-off', muted);
    btnMute.setAttribute('aria-pressed', muted ? 'true' : 'false');
    btnPause.setAttribute('aria-label', G.state === 'paused' ? 'Resume game' : 'Pause game');
    btnPause.textContent = G.state === 'paused' ? '>' : 'II';
  }

  /* ------------------------------------------------------------------ */
  /* boot                                                                */
  /* ------------------------------------------------------------------ */

  function boot() {
    canvas.addEventListener('pointerdown', pointerDown);
    canvas.addEventListener('pointermove', pointerMove);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('resize', resize);
    window.addEventListener('blur', function () {
      G.keyLeft = false;
      G.keyRight = false;
      if (G.state === 'playing') { G.state = 'paused'; updateTouchUi(); }
    });
    document.addEventListener('visibilitychange', function () {
      if (document.hidden && G.state === 'playing') { G.state = 'paused'; updateTouchUi(); }
    });
    window.addEventListener('beforeunload', function () {
      if (G.score > G.best && G.state !== 'menu') {
        G.best = G.score;
        saveBest(G.best);
      }
    });
    canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });

    btnPause = document.getElementById('btnPause');
    btnMute = document.getElementById('btnMute');
    if (btnPause) {
      btnPause.addEventListener('click', function (e) {
        e.preventDefault();
        S.ensure();
        togglePause();
      });
    }
    if (btnMute) {
      btnMute.addEventListener('click', function (e) {
        e.preventDefault();
        S.ensure();
        var muted = S.toggleMute();
        toast(muted ? 'SOUND OFF' : 'SOUND ON', muted ? '#ff8b9b' : '#8dff6b');
        updateTouchUi();
      });
    }
    updateTouchUi();

    starField();
    resize();
    initGradients();

    /* menu bricks reuse the same drawing helpers but need no simulation */
    window.NBDebug = {
      G: G,
      start: startGame,
      launch: launchBalls,
      state: function () { return G.state; }
    };

    raf = window.requestAnimationFrame(frame);
  }

  if (document.readyState === 'complete' || document.readyState === 'interactive') boot();
  else document.addEventListener('DOMContentLoaded', boot);
})();
