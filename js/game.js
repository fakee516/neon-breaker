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

  var SPRITE_SCALE = 2;
  var MAX_PIXELS = 3000000;
  var BRICK_W = (W.width - C.LAYOUT.padX * 2 - C.LAYOUT.gap * (C.LAYOUT.cols - 1)) / C.LAYOUT.cols;
  var BRICK_H = C.LAYOUT.height;
  var ACCENTS = ['#3ef2ff', '#8dff6b', '#c06bff', '#5b8cff', '#ffb84d', '#ff5bd0', '#ff6b8a', '#4df0c0'];

  var menuTitle = null;
  var sprites = {
    bricks: {},
    particles: {},
    drops: {},
    paddle: null,
    ballCore: null,
    ballGlow: null,
    trail: null,
    laser: null,
    veil: null
  };

  var G = {
    state: 'menu',
    time: 0,
    level: 1,
    score: 0,
    scoreDisplay: 0,
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
    aliveBricks: 0,
    menuBricks: null,
    balls: [],
    drops: [],
    lasers: [],
    particles: [],
    floaters: [],
    debris: [],
    paddle: {
      x: W.width / 2, y: P.y, w: P.width, targetW: P.width,
      h: P.height, vx: 0, targetX: W.width / 2, squash: 0
    },
    timers: { wide: 0, laser: 0, sticky: 0, slow: 0 },
    speed: C.levelSpeed(1),
    accent: ACCENTS[0],
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
    stars: []
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

  function cutRect(x, y, w, h, c) {
    ctx.beginPath();
    ctx.moveTo(x + c, y);
    ctx.lineTo(x + w - c, y);
    ctx.lineTo(x + w, y + c);
    ctx.lineTo(x + w, y + h - c);
    ctx.lineTo(x + w - c, y + h);
    ctx.lineTo(x + c, y + h);
    ctx.lineTo(x, y + h - c);
    ctx.lineTo(x, y + c);
    ctx.closePath();
  }

  function glassPanel(x, y, w, h, color, opt) {
    opt = opt || {};
    var cut = opt.cut || 10;
    cutRect(x, y, w, h, cut);
    ctx.fillStyle = opt.fill || 'rgba(4,9,18,0.64)';
    ctx.fill();
    ctx.strokeStyle = hexA(color, opt.alpha == null ? 0.24 : opt.alpha);
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + cut, y + 0.5);
    ctx.lineTo(x + w - cut, y + 0.5);
    ctx.strokeStyle = hexA(color, 0.46);
    ctx.stroke();
    if (opt.tab) {
      ctx.fillStyle = hexA(color, 0.9);
      ctx.fillRect(x + 12, y + h - 1.5, opt.tab, 1.5);
    }
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
    for (var i = 0; i < 90; i++) {
      G.stars.push({
        x: rng() * W.width,
        y: rng() * W.height,
        r: 0.5 + rng() * 1.5,
        a: 0.10 + rng() * 0.42,
        tw: rng() * TAU,
        sp: 2 + rng() * 7
      });
      var st = G.stars[G.stars.length - 1];
      st.b = st.a > 0.36 ? 2 : (st.a > 0.22 ? 1 : 0);
    }
    G.menuBricks = C.createLevel(3).bricks;
  }

  /* ------------------------------------------------------------------ */
  /* sprites & cached layers                                             */
  /* ------------------------------------------------------------------ */

  function rrOn(g, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    g.beginPath();
    if (g.roundRect) {
      g.roundRect(x, y, w, h, r);
      return;
    }
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  function makeSprite(w, h, pad, draw) {
    var cv = document.createElement('canvas');
    cv.width = Math.ceil((w + pad * 2) * SPRITE_SCALE);
    cv.height = Math.ceil((h + pad * 2) * SPRITE_SCALE);
    var g = cv.getContext('2d');
    g.scale(SPRITE_SCALE, SPRITE_SCALE);
    g.translate(pad, pad);
    draw(g, w, h);
    return { canvas: cv, pad: pad, w: w, h: h };
  }

  function drawSprite(spr, x, y, w, h) {
    if (!spr) return;
    w = w == null ? spr.w : w;
    h = h == null ? spr.h : h;
    ctx.drawImage(spr.canvas, x - spr.pad, y - spr.pad, w + spr.pad * 2, h + spr.pad * 2);
  }

  function buildBrickSprite(color, type, maxHp, hp) {
    var pad = 10;
    return makeSprite(BRICK_W, BRICK_H, pad, function (g, w, h) {
      var tough = type === 'tough';
      var bomb = type === 'bomb';
      var col = tough ? '#a9b8dd' : (bomb ? '#ff5b6e' : color);
      var r = 5;

      g.save();
      g.shadowColor = col;
      g.shadowBlur = tough ? 7 : 11;
      g.strokeStyle = hexA(col, 0.9);
      g.lineWidth = 1.25;
      rrOn(g, 0.7, 0.7, w - 1.4, h - 1.4, r);
      g.stroke();
      g.restore();

      var grad = g.createLinearGradient(0, 0, 0, h);
      if (tough) {
        grad.addColorStop(0, 'rgba(70,88,122,0.92)');
        grad.addColorStop(0.48, 'rgba(33,44,64,0.96)');
        grad.addColorStop(1, 'rgba(12,18,30,0.99)');
      } else if (bomb) {
        grad.addColorStop(0, 'rgba(96,20,38,0.95)');
        grad.addColorStop(0.55, 'rgba(42,10,22,0.97)');
        grad.addColorStop(1, 'rgba(16,5,10,0.99)');
      } else {
        grad.addColorStop(0, hexA(col, 0.32));
        grad.addColorStop(0.45, hexA(col, 0.13));
        grad.addColorStop(1, 'rgba(4,8,16,0.82)');
      }
      rrOn(g, 1.2, 1.2, w - 2.4, h - 2.4, 4.6);
      g.fillStyle = grad;
      g.fill();

      var gloss = g.createLinearGradient(0, 2, 0, h * 0.58);
      gloss.addColorStop(0, hexA(tough ? '#e4f1ff' : col, 0.5));
      gloss.addColorStop(0.5, hexA(tough ? '#e4f1ff' : col, 0.16));
      gloss.addColorStop(1, 'rgba(255,255,255,0)');
      rrOn(g, 3, 3, w - 6, h * 0.55, 4);
      g.fillStyle = gloss;
      g.fill();

      rrOn(g, 4, 4, w - 8, h - 8, 3.4);
      g.strokeStyle = hexA(tough ? '#d7e7ff' : col, 0.18);
      g.lineWidth = 1;
      g.stroke();

      g.save();
      g.beginPath();
      g.rect(2, 2, w - 4, h - 4);
      g.clip();
      g.fillStyle = 'rgba(255,255,255,0.065)';
      g.beginPath();
      g.moveTo(w * 0.16, 0);
      g.lineTo(w * 0.34, 0);
      g.lineTo(w * 0.04, h);
      g.lineTo(w * -0.14, h);
      g.closePath();
      g.fill();
      g.restore();

      if (tough) {
        g.strokeStyle = 'rgba(222,238,255,0.10)';
        g.lineWidth = 0.8;
        for (var i = 0; i < 3; i++) {
          g.beginPath();
          g.moveTo(6, 7 + i * 5);
          g.lineTo(w - 6, 7 + i * 5);
          g.stroke();
        }
        for (var p = 0; p < maxHp; p++) {
          g.beginPath();
          g.arc(9 + p * 8, h - 7, 2.1, 0, TAU);
          g.fillStyle = p < hp ? '#e8f6ff' : 'rgba(220,240,255,0.18)';
          g.fill();
        }
        if (hp < maxHp) {
          g.strokeStyle = 'rgba(3,7,12,0.85)';
          g.lineWidth = 1.7;
          g.beginPath();
          g.moveTo(w * 0.56, 4);
          g.lineTo(w * 0.50, 10);
          g.lineTo(w * 0.58, 14);
          g.lineTo(w * 0.52, 22);
          g.stroke();
          g.strokeStyle = 'rgba(235,248,255,0.4)';
          g.lineWidth = 0.7;
          g.stroke();
        }
      } else if (bomb) {
        g.save();
        g.globalCompositeOperation = 'lighter';
        g.strokeStyle = 'rgba(255,184,77,0.4)';
        g.lineWidth = 1.2;
        g.beginPath();
        g.arc(w / 2, h / 2, 6.4, 0, TAU);
        g.stroke();
        var cg = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, 7.5);
        cg.addColorStop(0, 'rgba(255,246,220,0.95)');
        cg.addColorStop(0.45, 'rgba(255,184,77,0.8)');
        cg.addColorStop(1, 'rgba(255,91,110,0)');
        g.fillStyle = cg;
        g.beginPath();
        g.arc(w / 2, h / 2, 7.5, 0, TAU);
        g.fill();
        g.restore();
      }
    });
  }

  function brickSpriteFor(br) {
    var key;
    if (br.type === 'tough') key = 'tough-' + br.maxHp + '-' + br.hp;
    else if (br.type === 'bomb') key = 'bomb';
    else key = 'normal-' + (br.row % C.BRICK_COLORS.length);
    return sprites.bricks[key] || sprites.bricks['normal-0'];
  }

  function buildBrickSprites() {
    var i;
    for (i = 0; i < C.BRICK_COLORS.length; i++) {
      sprites.bricks['normal-' + i] = buildBrickSprite(C.BRICK_COLORS[i], 'normal', 1, 1);
    }
    var combos = [[2, 2], [2, 1], [3, 3], [3, 2], [3, 1]];
    for (i = 0; i < combos.length; i++) {
      sprites.bricks['tough-' + combos[i][0] + '-' + combos[i][1]] =
        buildBrickSprite('#a9b8dd', 'tough', combos[i][0], combos[i][1]);
    }
    sprites.bricks.bomb = buildBrickSprite('#ff5b6e', 'bomb', 1, 1);
  }

  function particleSprite(color) {
    var spr = sprites.particles[color];
    if (spr) return spr;
    var size = 32;
    var cv = document.createElement('canvas');
    cv.width = cv.height = size;
    var g = cv.getContext('2d');
    var grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.22, color);
    grad.addColorStop(0.55, hexA(color, 0.45));
    grad.addColorStop(1, hexA(color, 0));
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
    sprites.particles[color] = cv;
    return cv;
  }

  function makeGlowSprite(color, size, strength) {
    var cv = document.createElement('canvas');
    cv.width = cv.height = size;
    var g = cv.getContext('2d');
    var grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grad.addColorStop(0, 'rgba(255,255,255,' + strength + ')');
    grad.addColorStop(0.2, hexA(color, strength * 0.85));
    grad.addColorStop(0.55, hexA(color, strength * 0.28));
    grad.addColorStop(1, hexA(color, 0));
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
    return cv;
  }

  function buildBallSprites() {
    sprites.ballGlow = makeGlowSprite('#3ef2ff', 64, 0.75);
    var size = 28;
    var cv = document.createElement('canvas');
    cv.width = cv.height = size;
    var g = cv.getContext('2d');
    var grad = g.createRadialGradient(size * 0.42, size * 0.4, 0.5, size / 2, size / 2, size / 2);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.5, '#dcfdff');
    grad.addColorStop(0.82, '#6ef6ff');
    grad.addColorStop(1, '#1bc6d8');
    g.fillStyle = grad;
    g.beginPath();
    g.arc(size / 2, size / 2, size / 2 - 1, 0, TAU);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.9)';
    g.beginPath();
    g.arc(size * 0.38, size * 0.32, 1.8, 0, TAU);
    g.fill();
    sprites.ballCore = cv;
    sprites.trail = makeGlowSprite('#3ef2ff', 32, 0.4);
  }

  function buildPaddleSprite() {
    var w = P.width * P.wideScale;
    var h = P.height;
    sprites.paddle = makeSprite(w, h, 18, function (g, pw, ph) {
      g.save();
      g.shadowColor = '#3ef2ff';
      g.shadowBlur = 18;
      rrOn(g, 0.8, 0.8, pw - 1.6, ph - 1.6, 7);
      g.strokeStyle = 'rgba(130,250,255,0.9)';
      g.lineWidth = 1.5;
      g.stroke();
      g.restore();

      var grad = g.createLinearGradient(0, 0, pw, 0);
      grad.addColorStop(0, '#5cf7ff');
      grad.addColorStop(0.38, '#79c8ff');
      grad.addColorStop(0.72, '#a06bff');
      grad.addColorStop(1, '#ff5bd0');
      rrOn(g, 1, 1, pw - 2, ph - 2, 6);
      g.fillStyle = grad;
      g.fill();

      var glass = g.createLinearGradient(0, 0, 0, ph);
      glass.addColorStop(0, 'rgba(255,255,255,0.5)');
      glass.addColorStop(0.4, 'rgba(255,255,255,0.08)');
      glass.addColorStop(1, 'rgba(0,0,0,0.28)');
      rrOn(g, 2.5, 2.5, pw - 5, ph - 5, 5);
      g.fillStyle = glass;
      g.fill();

      g.fillStyle = 'rgba(4,10,22,0.5)';
      g.fillRect(pw * 0.24, ph * 0.52, pw * 0.52, 1.6);
      g.fillStyle = 'rgba(255,255,255,0.75)';
      for (var i = 1; i < 6; i++) {
        g.fillRect(pw * (0.25 + i * 0.083), ph * 0.52, 1.2, 1.6);
      }
      g.fillStyle = 'rgba(255,255,255,0.5)';
      g.fillRect(pw * 0.1, ph * 0.24, pw * 0.8, 1);
    });
  }

  function buildDropSprites() {
    for (var i = 0; i < C.POWERUPS.length; i++) {
      var def = C.POWERUPS[i];
      sprites.drops[def.id] = makeSprite(34, 34, 13, (function (d) {
        return function (g, w, h) {
          g.save();
          g.shadowColor = d.color;
          g.shadowBlur = 15;
          rrOn(g, 3, 3, w - 6, h - 6, 9);
          g.fillStyle = 'rgba(5,10,20,0.86)';
          g.fill();
          g.strokeStyle = hexA(d.color, 0.95);
          g.lineWidth = 1.5;
          g.stroke();
          g.restore();
          g.strokeStyle = hexA(d.color, 0.32);
          g.lineWidth = 1;
          rrOn(g, 7, 7, w - 14, h - 14, 6);
          g.stroke();
          g.font = '800 15px ' + NUM;
          g.fillStyle = d.color;
          g.textAlign = 'center';
          g.textBaseline = 'middle';
          g.shadowColor = d.color;
          g.shadowBlur = 8;
          g.fillText(d.short, w / 2, h / 2 + 1);
        };
      })(def));
    }
  }

  function buildLaserSprite() {
    var cv = document.createElement('canvas');
    cv.width = 20;
    cv.height = 52;
    var g = cv.getContext('2d');
    var grad = g.createLinearGradient(0, 0, 0, 52);
    grad.addColorStop(0, 'rgba(255,91,110,0)');
    grad.addColorStop(0.35, 'rgba(255,120,140,0.55)');
    grad.addColorStop(0.58, 'rgba(255,235,240,0.98)');
    grad.addColorStop(0.8, 'rgba(255,91,110,0.75)');
    grad.addColorStop(1, 'rgba(255,91,110,0)');
    g.fillStyle = grad;
    g.fillRect(7.5, 0, 5, 52);
    var glow = g.createLinearGradient(0, 0, 20, 0);
    glow.addColorStop(0, 'rgba(255,91,110,0)');
    glow.addColorStop(0.5, 'rgba(255,91,110,0.22)');
    glow.addColorStop(1, 'rgba(255,91,110,0)');
    g.fillStyle = glow;
    g.fillRect(0, 4, 20, 44);
    sprites.laser = cv;
  }

  function buildMenuArt() {
    var vc = document.createElement('canvas');
    vc.width = W.width;
    vc.height = W.height;
    var vg = vc.getContext('2d');
    var veil = vg.createLinearGradient(0, 0, 0, W.height);
    veil.addColorStop(0, 'rgba(3,6,14,0.62)');
    veil.addColorStop(0.52, 'rgba(3,6,14,0.80)');
    veil.addColorStop(1, 'rgba(3,6,14,0.94)');
    vg.fillStyle = veil;
    vg.fillRect(0, 0, W.width, W.height);
    var lift = vg.createRadialGradient(W.width / 2, 250, 20, W.width / 2, 250, 460);
    lift.addColorStop(0, 'rgba(62,242,255,0.08)');
    lift.addColorStop(0.6, 'rgba(62,242,255,0.02)');
    lift.addColorStop(1, 'rgba(62,242,255,0)');
    vg.fillStyle = lift;
    vg.fillRect(0, 0, W.width, W.height);

    vg.globalAlpha = 0.14;
    for (var i = 0; i < G.menuBricks.length; i++) {
      var br = G.menuBricks[i];
      var spr = brickSpriteFor(br);
      vg.drawImage(spr.canvas, br.x - spr.pad, br.y - spr.pad, br.w + spr.pad * 2, br.h + spr.pad * 2);
    }
    vg.globalAlpha = 1;
    sprites.veil = vc;

    var tw = 760;
    var th = 160;
    var k = 2;
    var tc = document.createElement('canvas');
    tc.width = tw * k;
    tc.height = th * k;
    var tg = tc.getContext('2d');
    tg.scale(k, k);
    tg.textAlign = 'left';
    tg.textBaseline = 'middle';
    tg.font = '900 64px ' + FONT;
    if ('letterSpacing' in tg) tg.letterSpacing = '4px';
    var a = 'NEON ';
    var b = 'BREAKER';
    var aw = tg.measureText(a).width;
    var bw = tg.measureText(b).width;
    var totalW = aw + bw;
    var sx = (tw - totalW) / 2;
    var ty = 80;

    tg.shadowColor = '#3ef2ff';
    tg.shadowBlur = 30;
    tg.fillStyle = 'rgba(20,70,90,0.38)';
    tg.fillText(a, sx, ty);
    tg.shadowColor = '#ff5bd0';
    tg.fillStyle = 'rgba(80,20,60,0.38)';
    tg.fillText(b, sx + aw, ty);

    tg.shadowBlur = 0;
    var tg2 = tg.createLinearGradient(sx, 0, sx + totalW, 0);
    tg2.addColorStop(0, '#6ef6ff');
    tg2.addColorStop(0.36, '#eaffff');
    tg2.addColorStop(0.62, '#ffffff');
    tg2.addColorStop(1, '#ff8ee3');
    tg.fillStyle = tg2;
    tg.fillText(a, sx, ty);
    tg.fillText(b, sx + aw, ty);

    sprites.title = { canvas: tc, w: tw, h: th };
    menuTitle = {
      aw: aw, bw: bw, totalW: totalW, startX: W.width / 2 - totalW / 2, y: 222
    };
  }

  function buildGraphics() {
    buildBrickSprites();
    buildBallSprites();
    buildPaddleSprite();
    buildDropSprites();
    buildLaserSprite();
    buildMenuArt();
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
    while (G.particles.length > 420) G.particles.shift();
  }

  function spawnDebris(brick) {
    for (var i = 0; i < 6; i++) {
      var a = Math.random() * TAU;
      var sp = 40 + Math.random() * 160;
      var life = 0.4 + Math.random() * 0.45;
      G.debris.push({
        x: brick.x + Math.random() * brick.w,
        y: brick.y + Math.random() * brick.h,
        w: 3 + Math.random() * 7,
        h: 2 + Math.random() * 4,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 40,
        rot: Math.random() * TAU,
        vr: (Math.random() - 0.5) * 11,
        color: brick.type === 'tough' ? '#b9c9e8' : (brick.type === 'bomb' ? '#ff9d5c' : brick.color),
        life: life,
        max: life
      });
    }
    while (G.debris.length > 160) G.debris.shift();
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

  function applyAccent() {
    var frame = document.getElementById('frame');
    if (!frame) return;
    frame.style.setProperty('--accent', G.accent);
    frame.style.setProperty('--accent-soft', hexA(G.accent, 0.12));
    G.progressGrad = ctx.createLinearGradient(18, 0, W.width - 18, 0);
    G.progressGrad.addColorStop(0, G.accent);
    G.progressGrad.addColorStop(0.55, '#9fe6ff');
    G.progressGrad.addColorStop(1, '#ff5bd0');
  }

  function syncDanger() {
    var frame = document.getElementById('frame');
    if (!frame) return;
    frame.classList.toggle('is-danger', G.state !== 'menu' && G.lives === 1);
  }

  function startGame() {
    S.ensure();
    G.score = 0;
    G.scoreDisplay = 0;
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
    G.debris.length = 0;
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
    G.aliveBricks = data.total;
    G.speed = data.speed;
    G.accent = ACCENTS[(level - 1) % ACCENTS.length];
    applyAccent();
    syncDanger();
    G.balls = [];
    G.drops = [];
    G.lasers = [];
    G.floaters = [];
    G.debris.length = 0;
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
    G.paddle.squash = 0;
    G.mode = 'pointer';
    spawnBall(true);
    G.banner = 2.0;
    G.bannerText = 'LEVEL ' + level;
    G.bannerSub = data.pattern.toUpperCase();
  }

  function loseLife() {
    G.lives -= 1;
    syncDanger();
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
    syncDanger();
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
    flash(G.accent, 0.35);
    ring(W.width / 2, 368, G.accent, 250);
    burst(W.width / 2, 368, G.accent, 24, 1.1);
    S.play('clear');
  }

  function togglePause() {
    if (G.state === 'playing') {
      G.state = 'paused';
      pauseDrawn = false;
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
    if (G.aliveBricks <= 0) enterLevelClear();
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
    var trailMax = G.balls.length > 3 ? 8 : 14;
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
      if (b.trail.length > trailMax) b.trail.shift();

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
        G.paddle.squash = 1;
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
    G.aliveBricks -= 1;
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
    burst(cx, cy, brick.color, 11, 1);
    spawnDebris(brick);
    S.play('brick');

    if (brick.type === 'bomb') explode(cx, cy);

    if (Math.random() < 0.155) spawnDrop(cx, cy);

    return true;
  }

  function explode(x, y) {
    shake(11, 0.35);
    flash('#ffb84d', 0.5);
    ring(x, y, '#ffb84d', 140);
    burst(x, y, '#ffb84d', 22, 1.6);
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
        syncDanger();
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

    for (i = G.debris.length - 1; i >= 0; i--) {
      var d = G.debris[i];
      d.life -= dt;
      if (d.life <= 0) {
        G.debris.splice(i, 1);
        continue;
      }
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.vy += 420 * dt;
      d.vx *= 1 - 1.4 * dt;
      d.rot += d.vr * dt;
    }

    if (G.paddle.squash > 0) G.paddle.squash = Math.max(0, G.paddle.squash - dt * 5.5);
    var sd = G.score - G.scoreDisplay;
    if (Math.abs(sd) < 1) G.scoreDisplay = G.score;
    else G.scoreDisplay += sd * Math.min(1, dt * 13);

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

  /* ------------------------------------------------------------------ */
  /* render                                                              */
  /* ------------------------------------------------------------------ */

  function drawBackground(t) {
    var alphas = [0.15, 0.24, 0.4];
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (var b = 0; b < 3; b++) {
      ctx.beginPath();
      for (var s = 0; s < G.stars.length; s++) {
        var st = G.stars[s];
        if (st.b !== b) continue;
        var yy = (st.y + t * st.sp) % W.height;
        ctx.moveTo(st.x + st.r, yy);
        ctx.arc(st.x, yy, st.r, 0, TAU);
      }
      ctx.fillStyle = 'rgba(185,224,255,' + alphas[b] + ')';
      ctx.fill();
    }
    for (var s2 = 3; s2 < G.stars.length; s2 += 11) {
      var tw = G.stars[s2];
      var ty = (tw.y + t * tw.sp) % W.height;
      var a2 = 0.28 + 0.3 * Math.sin(t * 1.9 + tw.tw);
      if (a2 <= 0) continue;
      ctx.globalAlpha = a2;
      ctx.drawImage(sprites.trail, tw.x - 3.5, ty - 3.5, 7, 7);
    }
    ctx.restore();
  }

  function drawBrick(br) {
    if (!br.alive) return;
    drawSprite(brickSpriteFor(br), br.x, br.y, br.w, br.h);

    if (br.flash > 0) {
      var a = clamp(br.flash / 0.12, 0, 1);
      rr(br.x, br.y, br.w, br.h, 5);
      ctx.fillStyle = 'rgba(255,255,255,' + (a * 0.3) + ')';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,' + (a * 0.85) + ')';
      ctx.lineWidth = 1.4;
      rr(br.x + 0.7, br.y + 0.7, br.w - 1.4, br.h - 1.4, 5);
      ctx.stroke();
    }

    if (br.type === 'bomb') {
      var pulse = 0.5 + 0.5 * Math.sin(G.time * 6 + br.col);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = 'rgba(255,184,77,' + (0.14 + pulse * 0.26) + ')';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(br.x + br.w / 2, br.y + br.h / 2, 8 + pulse * 3, 0, TAU);
      ctx.stroke();
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
      var ts = b.r * 2.2 * a + 5;
      ctx.globalAlpha = a * 0.24;
      ctx.drawImage(sprites.trail, b.trail[i].x - ts / 2, b.trail[i].y - ts / 2, ts, ts);
    }
    ctx.globalAlpha = 1;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(sprites.ballGlow, b.x - 26, b.y - 26, 52, 52);
    ctx.restore();

    var core = b.r * 2.15;
    ctx.drawImage(sprites.ballCore, b.x - core / 2, b.y - core / 2, core, core);
  }

  function drawBalls() {
    for (var i = 0; i < G.balls.length; i++) drawBall(G.balls[i]);
  }

  function drawPaddle() {
    var p = G.paddle;
    var sq = p.squash || 0;
    var x = p.x - p.w / 2;
    var y = p.y;

    ctx.save();
    ctx.translate(p.x, p.y + p.h / 2);
    ctx.scale(1 + sq * 0.05, 1 - sq * 0.26);
    drawSprite(sprites.paddle, -p.w / 2, -p.h / 2, p.w, p.h);
    ctx.restore();

    var ex = x + (0.5 + 0.5 * Math.sin(G.time * 2.6)) * p.w;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.45;
    ctx.drawImage(sprites.trail, ex - 8, p.y + p.h / 2 - 8, 16, 16);
    ctx.restore();

    if (G.timers.laser > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.45;
      ctx.drawImage(particleSprite('#ff5b6e'), x + 4, y - 8, 16, 16);
      ctx.drawImage(particleSprite('#ff5b6e'), x + p.w - 20, y - 8, 16, 16);
      ctx.globalAlpha = 1;
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
      var bob = Math.sin(d.t) * 2;
      ctx.save();
      ctx.translate(d.x, d.y + bob);
      ctx.rotate(Math.sin(d.t * 0.6) * 0.14);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.35 + 0.15 * Math.sin(d.t * 2);
      ctx.drawImage(particleSprite(d.def.color), -25, -25, 50, 50);
      ctx.restore();
      drawSprite(sprites.drops[d.def.id], -17, -17, 34, 34);
      ctx.restore();
    }
  }

  function drawLasers() {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (var i = 0; i < G.lasers.length; i++) {
      var l = G.lasers[i];
      ctx.drawImage(sprites.laser, l.x - 10, l.y - 26, 20, 52);
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
        var s = p.size * 8 * (0.55 + a * 0.45);
        ctx.globalAlpha = a;
        ctx.drawImage(particleSprite(p.color), p.x - s / 2, p.y - s / 2, s, s);
      }
    }
    ctx.restore();
  }

  function drawDebris() {
    if (!G.debris.length) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (var i = 0; i < G.debris.length; i++) {
      var d = G.debris[i];
      var a = clamp(d.life / d.max, 0, 1);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.translate(d.x, d.y);
      ctx.rotate(d.rot);
      ctx.fillStyle = d.color;
      ctx.fillRect(-d.w / 2, -d.h / 2, d.w, d.h);
      ctx.fillStyle = 'rgba(255,255,255,' + (a * 0.5) + ')';
      ctx.fillRect(-d.w / 2, -d.h / 2, d.w, 1);
      ctx.restore();
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
    var top = 12;
    var ph = 60;
    var padX = 18;
    var wScore = 266;
    var wLevel = 214;
    var wLives = 266;
    var xLevel = W.width / 2 - wLevel / 2;
    var xLives = W.width - padX - wLives;
    var accent = G.accent;

    glassPanel(padX, top, wScore, ph, accent, { tab: 54 });
    glassPanel(xLevel, top, wLevel, ph, accent, { tab: 36 });
    glassPanel(xLives, top, wLives, ph, accent, { tab: 54 });

    label('SCORE', padX + 16, top + 18, 9, '#7fa2c4', 'left', 700, 2.4);
    var pulse = 1 + G.scorePulse * 0.025;
    var scoreStr = pad(Math.floor(G.scoreDisplay), 7);
    var scoreSize = scoreStr.length > 9 ? 20 : 26;
    ctx.save();
    ctx.translate(padX + 14, top + 38);
    ctx.scale(pulse, pulse);
    num(scoreStr, 0, 0, scoreSize, '#ecfeff', 'left', accent, 10);
    ctx.restore();

    ctx.fillStyle = 'rgba(140,190,240,0.10)';
    ctx.fillRect(padX + 176, top + 15, 1, ph - 30);
    label('BEST', padX + wScore - 15, top + 18, 8, '#557392', 'right', 700, 2);
    var bestStr = pad(Math.max(G.best, Math.floor(G.scoreDisplay)), 7);
    label(bestStr, padX + wScore - 15, top + 32, bestStr.length > 8 ? 9 : 10.5, '#9fc2df', 'right', 700, 1.2);

    label('LEVEL', W.width / 2, top + 18, 9, '#7fa2c4', 'center', 700, 2.6);
    num(String(G.level), W.width / 2, top + 37, 25, '#f2feff', 'center', accent, 10);
    label(G.levelData ? G.levelData.pattern.toUpperCase() : '', W.width / 2, top + 52, 7.5, '#5c7fa4', 'center', 600, 2.2);

    label('POWER-UPS', xLives + 16, top + 18, 8, '#7fa2c4', 'left', 700, 2.2);
    num(String(G.powerupsCollected), xLives + 16, top + 36, 18, '#cfe9ff', 'left', accent, 7);
    label('COLLECTED', xLives + 16, top + 51, 7, '#4d6b8c', 'left', 600, 2);

    ctx.fillStyle = 'rgba(140,190,240,0.10)';
    ctx.fillRect(xLives + 118, top + 15, 1, ph - 30);

    label('LIVES', xLives + wLives - 15, top + 18, 9, '#7fa2c4', 'right', 700, 2.4);
    for (var i = 0; i < 5; i++) {
      var cx = xLives + wLives - 15 - i * 19;
      var cy = top + 40;
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(cx, cy - 6.5);
      ctx.lineTo(cx + 5.5, cy);
      ctx.lineTo(cx, cy + 6.5);
      ctx.lineTo(cx - 5.5, cy);
      ctx.closePath();
      if (i < G.lives) {
        ctx.shadowColor = '#ff5bd0';
        ctx.shadowBlur = 11;
        ctx.fillStyle = '#ff9fe2';
        ctx.fill();
      } else {
        ctx.strokeStyle = 'rgba(255,255,255,0.16)';
        ctx.lineWidth = 1.1;
        ctx.stroke();
      }
      ctx.restore();
    }

    var barY = top + ph + 8;
    var x0 = padX;
    var x1 = W.width - padX;
    ctx.fillStyle = 'rgba(255,255,255,0.055)';
    ctx.fillRect(x0, barY, x1 - x0, 2);
    var ratio = G.totalBricks ? 1 - G.aliveBricks / G.totalBricks : 0;
    if (ratio > 0) {
      ctx.fillStyle = G.progressGrad || accent;
      ctx.fillRect(x0, barY, (x1 - x0) * clamp(ratio, 0, 1), 2);
      if (ratio < 1) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.8;
        ctx.drawImage(particleSprite(accent), x0 + (x1 - x0) * ratio - 4.5, barY - 3.5, 9, 9);
        ctx.restore();
      }
    }
    ctx.fillStyle = 'rgba(255,255,255,0.11)';
    for (var q = 1; q < 4; q++) ctx.fillRect(x0 + (x1 - x0) * q / 4, barY, 1, 2);

    var names = { wide: 'WIDE', laser: 'LASER', sticky: 'STICKY', slow: 'SLOW' };
    var letters = { wide: 'W', laser: 'L', sticky: 'S', slow: 'T' };
    var cols = { wide: '#8dff6b', laser: '#ff5b6e', sticky: '#ffb84d', slow: '#a06bff' };
    var active = [];
    ['wide', 'laser', 'sticky', 'slow'].forEach(function (k) {
      if (G.timers[k] > 0) active.push(k);
    });
    if (active.length) {
      var chipW = 102;
      var gap = 7;
      var startX = W.width / 2 - (active.length * chipW + (active.length - 1) * gap) / 2;
      var cy2 = W.height - 30;
      active.forEach(function (k, idx) {
        var x = startX + idx * (chipW + gap);
        var col = cols[k];
        var frac = clamp(G.timers[k] / clampDuration(k), 0, 1);
        glassPanel(x, cy2, chipW, 22, col, { fill: 'rgba(4,9,18,0.72)', alpha: 0.5, cut: 5 });
        ctx.fillStyle = hexA(col, 0.16);
        cutRect(x + 6, cy2 + 5, 12, 12, 3);
        ctx.fill();
        label(letters[k], x + 12, cy2 + 11, 8, col, 'center', 800, 0);
        label(names[k], x + 23, cy2 + 11, 8.5, col, 'left', 700, 1);
        label(Math.ceil(G.timers[k]) + 's', x + chipW - 7, cy2 + 11, 8, hexA(col, 0.85), 'right', 600, 0.5);
        ctx.fillStyle = hexA(col, 0.85);
        ctx.fillRect(x + 6, cy2 + 19.5, (chipW - 12) * frac, 1.2);
      });
    }

    if (G.comboMult > 1) {
      var cc = G.comboMult >= 8 ? '#ff5b6e' : (G.comboMult >= 5 ? '#ffb84d' : '#8dff6b');
      var cw = 118;
      var ch = 40;
      var cy3 = 520;
      ctx.save();
      ctx.translate(W.width / 2, cy3 + ch / 2);
      var scl = 1 + G.comboPulse * 0.14;
      ctx.scale(scl, scl);
      glassPanel(-cw / 2, -ch / 2, cw, ch, cc, { fill: 'rgba(4,9,18,0.62)', alpha: 0.55, cut: 8, tab: 26 });
      num('x' + G.comboMult, -21, -5, 23, cc, 'center', cc, 12);
      label('COMBO', 23, -8, 7, hexA(cc, 0.9), 'center', 700, 2);
      var pips = G.combo % 5;
      if (pips === 0 && G.combo > 0) pips = 5;
      for (var pi = 0; pi < 5; pi++) {
        ctx.fillStyle = pi < pips ? cc : 'rgba(255,255,255,0.14)';
        ctx.fillRect(9 + pi * 6.4, 7, 4.6, 2);
      }
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
    var a = 0.6 + 0.3 * Math.sin(G.time * 3.2);
    var y = G.paddle.y - 42;
    ctx.save();
    ctx.globalAlpha = a;
    glassPanel(W.width / 2 - 82, y - 12, 164, 24, G.accent, { fill: 'rgba(4,9,18,0.6)', alpha: 0.38, cut: 7 });
    label(isCoarse ? 'TAP TO SERVE' : 'PRESS SPACE TO SERVE', W.width / 2, y, 10, '#c9f4ff', 'center', 700, 2.2);
    ctx.restore();
  }

  function drawBanner() {
    if (G.banner <= 0) return;
    var t = G.banner;
    var alpha = Math.min(1, Math.min((2.0 - t) * 5, t * 2.2));
    if (alpha <= 0) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    var y0 = 306;
    glassPanel(W.width / 2 - 260, y0, 520, 96, G.accent, { fill: 'rgba(4,9,18,0.52)', alpha: 0.45, cut: 14, tab: 90 });
    label('GET READY', W.width / 2, y0 + 16, 7.5, hexA(G.accent, 0.85), 'center', 700, 3);
    label(G.bannerText, W.width / 2, y0 + 42, 30, '#f2feff', 'center', 800, 8);
    label(G.bannerSub, W.width / 2, y0 + 70, 9, '#7fb1d1', 'center', 600, 4);
    ctx.strokeStyle = hexA(G.accent, 0.32);
    ctx.beginPath();
    ctx.moveTo(W.width / 2 - 150, y0 + 84);
    ctx.lineTo(W.width / 2 + 150, y0 + 84);
    ctx.stroke();
    ctx.restore();
  }

  function drawToast() {
    if (G.toast.t <= 0) return;
    var a = Math.min(1, G.toast.t * 2);
    ctx.save();
    ctx.globalAlpha = a;
    glassPanel(W.width / 2 - 88, 106, 176, 23, G.toast.color, { fill: 'rgba(4,9,18,0.62)', alpha: 0.38, cut: 6 });
    label(G.toast.text, W.width / 2, 117, 9.5, G.toast.color, 'center', 700, 2.4);
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

  /* ---------- menu / overlays ---------------------------------------- */

  function drawMenu(t) {
    if (sprites.veil) {
      ctx.drawImage(sprites.veil, 0, 0);
    } else {
      ctx.fillStyle = 'rgba(3,6,14,0.82)';
      ctx.fillRect(0, 0, W.width, W.height);
    }

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (var m = 0; m < 20; m++) {
      var mx = ((m * 97 + Math.sin(t * 0.33 + m * 1.7) * 34) % W.width + W.width) % W.width;
      var my = W.height - ((t * (10 + (m % 4) * 3) + m * 61) % (W.height + 60));
      var ma = 0.06 + 0.12 * (0.5 + 0.5 * Math.sin(t * 1.2 + m));
      ctx.globalAlpha = ma;
      ctx.drawImage(particleSprite(m % 3 === 0 ? '#ff5bd0' : '#3ef2ff'), mx - 7, my - 7, 14, 14);
    }
    ctx.restore();

    var pulse = 0.5 + 0.5 * Math.sin(t * 2.2);
    var accent = G.accent;

    if (sprites.title) {
      ctx.drawImage(sprites.title.canvas, W.width / 2 - sprites.title.w / 2, 142, sprites.title.w, sprites.title.h);
    }
    if (menuTitle) {
      ctx.save();
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.font = '900 64px ' + FONT;
      if ('letterSpacing' in ctx) ctx.letterSpacing = '4px';
      var shine = (t * 0.22) % 1.6 - 0.3;
      var sg = ctx.createLinearGradient(
        menuTitle.startX + menuTitle.totalW * (shine - 0.1), 0,
        menuTitle.startX + menuTitle.totalW * (shine + 0.1), 0
      );
      sg.addColorStop(0, 'rgba(255,255,255,0)');
      sg.addColorStop(0.5, 'rgba(255,255,255,0.55)');
      sg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = sg;
      ctx.fillText('NEON ', menuTitle.startX, menuTitle.y);
      ctx.fillText('BREAKER', menuTitle.startX + menuTitle.aw, menuTitle.y);
      ctx.restore();
    }

    var lineW = 430;
    var lineG = ctx.createLinearGradient(W.width / 2 - lineW / 2, 0, W.width / 2 + lineW / 2, 0);
    lineG.addColorStop(0, 'rgba(62,242,255,0)');
    lineG.addColorStop(0.35, hexA(accent, 0.42));
    lineG.addColorStop(0.5, 'rgba(235,255,255,0.8)');
    lineG.addColorStop(0.65, hexA(accent, 0.42));
    lineG.addColorStop(1, 'rgba(62,242,255,0)');
    ctx.strokeStyle = lineG;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(W.width / 2 - lineW / 2, 258);
    ctx.lineTo(W.width / 2 + lineW / 2, 258);
    ctx.stroke();

    ctx.save();
    ctx.translate(W.width / 2, 258);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = accent;
    ctx.shadowColor = accent;
    ctx.shadowBlur = 10;
    ctx.fillRect(-2.2, -2.2, 4.4, 4.4);
    ctx.restore();

    label('NEON-SOAKED ARCADE BREAKOUT', W.width / 2, 288, 12, '#8fb7d9', 'center', 600, 4);

    var chips = [
      ['8 SHAPES', 104],
      ['6 POWER-UPS', 116],
      ['ENDLESS RUNS', 122]
    ];
    var gap = 8;
    var chipW = 0;
    for (var c = 0; c < chips.length; c++) chipW += chips[c][1] + (c ? gap : 0);
    var chipX = W.width / 2 - chipW / 2;
    for (var c2 = 0; c2 < chips.length; c2++) {
      var cw = chips[c2][1];
      glassPanel(chipX, 310, cw, 24, accent, { cut: 6, fill: 'rgba(4,9,18,0.38)', alpha: 0.16 });
      ctx.fillStyle = hexA(accent, 0.8);
      ctx.fillRect(chipX + 10, 320.5, 3, 3);
      label(chips[c2][0], chipX + cw / 2 + 3, 322, 7.5, '#86a9c9', 'center', 600, 1.4);
      chipX += cw + gap;
    }

    var bw2 = 356;
    var bh2 = 56;
    var bx = W.width / 2 - bw2 / 2;
    var by = 380;
    glassPanel(bx, by, bw2, bh2, accent, { fill: 'rgba(5,12,24,0.62)', alpha: 0.55 + pulse * 0.18, cut: 14 });

    ctx.save();
    cutRect(bx, by, bw2, bh2, 14);
    ctx.clip();
    var sweep = bx + ((t * 110) % (bw2 + 200)) - 100;
    var sw = ctx.createLinearGradient(sweep, 0, sweep + 80, 0);
    sw.addColorStop(0, 'rgba(255,255,255,0)');
    sw.addColorStop(0.5, 'rgba(255,255,255,0.10)');
    sw.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = sw;
    ctx.fillRect(sweep, by, 80, bh2);
    ctx.restore();

    label(isCoarse ? 'TAP TO START' : 'CLICK OR PRESS SPACE', W.width / 2 - 6, by + bh2 / 2, 13, '#e6fdff', 'center', 700, 3);
    ctx.strokeStyle = hexA(accent, 0.85);
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(bx + bw2 - 34, by + bh2 / 2 - 4);
    ctx.lineTo(bx + bw2 - 29, by + bh2 / 2);
    ctx.lineTo(bx + bw2 - 34, by + bh2 / 2 + 4);
    ctx.stroke();

    label('PERSONAL BEST', W.width / 2, 464, 8, '#5d7fa6', 'center', 700, 3);
    num(pad(G.best, 7), W.width / 2, 484, 18, '#d8f6ff', 'center', accent, 8);

    var rows = isCoarse ? [
      'DRAG TO MOVE  ·  TAP TO SERVE',
      'PAUSE AND MUTE WITH THE BUTTONS BELOW',
      'CHAIN SMASHES TO RAISE YOUR MULTIPLIER'
    ] : [
      'MOVE  MOUSE / A D / ARROWS    ·    SERVE  SPACE    ·    PAUSE  P',
      'POWER-UPS DROP FROM SMASHED BRICKS',
      'CHAIN SMASHES TO RAISE YOUR MULTIPLIER'
    ];
    for (var r = 0; r < rows.length; r++) {
      label(rows[r], W.width / 2, 522 + r * 23, 9, r === 2 ? '#4f6d8c' : '#6f93b5', 'center', 600, 1.6);
    }

    label('V1.1.0  ·  CANVAS + WEB AUDIO', W.width / 2, W.height - 22, 8, '#3d5878', 'center', 600, 2.2);
    if (!isCoarse) label('SOUND ' + (S.isMuted() ? 'OFF' : 'ON'), W.width - 24, W.height - 22, 8, '#3d5878', 'right', 600, 1.8);
  }

  function drawBrackets(x, y, w, h, color, size) {
    size = size || 16;
    var inset = 8;
    ctx.strokeStyle = hexA(color, 0.65);
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(x + inset, y + inset + size);
    ctx.lineTo(x + inset, y + inset);
    ctx.lineTo(x + inset + size, y + inset);
    ctx.moveTo(x + w - inset - size, y + inset);
    ctx.lineTo(x + w - inset, y + inset);
    ctx.lineTo(x + w - inset, y + inset + size);
    ctx.moveTo(x + w - inset, y + h - inset - size);
    ctx.lineTo(x + w - inset, y + h - inset);
    ctx.lineTo(x + w - inset - size, y + h - inset);
    ctx.moveTo(x + inset + size, y + h - inset);
    ctx.lineTo(x + inset, y + h - inset);
    ctx.lineTo(x + inset, y + h - inset - size);
    ctx.stroke();
  }

  function panel(x, y, w, h, color) {
    glassPanel(x, y, w, h, color, { fill: 'rgba(5,10,20,0.88)', alpha: 0.5, cut: 18, tab: 64 });
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = 26;
    cutRect(x, y, w, h, 18);
    ctx.strokeStyle = hexA(color, 0.34);
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
    drawBrackets(x, y, w, h, color, 14);
  }

  function drawPause() {
    ctx.fillStyle = 'rgba(3,6,14,0.70)';
    ctx.fillRect(0, 0, W.width, W.height);
    var x = W.width / 2 - 230;
    var y = 214;
    panel(x, y, 460, 212, '#3ef2ff');

    ctx.save();
    ctx.shadowColor = '#3ef2ff';
    ctx.shadowBlur = 18;
    ctx.fillStyle = '#d9fbff';
    rr(W.width / 2 - 11, y + 26, 7, 26, 2);
    ctx.fill();
    rr(W.width / 2 + 4, y + 26, 7, 26, 2);
    ctx.fill();
    ctx.restore();

    label('PAUSED', W.width / 2, y + 84, 34, '#eafeff', 'center', 800, 6);
    label('TAKE A BREATH', W.width / 2, y + 112, 8, '#5f83a8', 'center', 600, 3);

    ctx.strokeStyle = 'rgba(62,242,255,0.18)';
    ctx.beginPath();
    ctx.moveTo(x + 70, y + 132);
    ctx.lineTo(x + 390, y + 132);
    ctx.stroke();

    label(isCoarse ? 'TAP TO RESUME' : 'P / ESC  TO RESUME', W.width / 2, y + 154, 11, '#9fc8e8', 'center', 600, 2.4);
    label(isCoarse ? 'PAUSE / MUTE BUTTONS BELOW' : 'M  MUTE  ·  SOUND ' + (S.isMuted() ? 'OFF' : 'ON'), W.width / 2, y + 182, 9, '#4f6d8c', 'center', 600, 2);
  }

  function drawLevelClear() {
    var a = Math.min(1, (2.3 - G.clearTimer) * 4);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.fillStyle = 'rgba(3,6,14,0.38)';
    ctx.fillRect(0, 0, W.width, W.height);

    ctx.save();
    ctx.translate(W.width / 2, 352);
    ctx.rotate(G.time * 0.08);
    ctx.globalCompositeOperation = 'lighter';
    for (var r = 0; r < 14; r++) {
      ctx.rotate(TAU / 14);
      ctx.fillStyle = hexA(G.accent, 0.028);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-22, 360);
      ctx.lineTo(22, 360);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    var x = W.width / 2 - 250;
    var y = 258;
    panel(x, y, 500, 190, G.accent);
    label('LEVEL ' + G.level + ' CLEAR', W.width / 2, y + 44, 29, '#eaffee', 'center', 800, 5);
    label('AREA SECURED', W.width / 2, y + 70, 8, hexA(G.accent, 0.7), 'center', 700, 3);
    num('+' + G.clearBonus, W.width / 2, y + 104, 24, G.accent, 'center', G.accent, 12);
    label('CLEAR BONUS', W.width / 2, y + 124, 7, '#5f83a8', 'center', 600, 2.4);
    label('NEXT LEVEL  ' + (G.level + 1), W.width / 2, y + 152, 9, '#6f90b3', 'center', 600, 2.6);

    var w = 300 * clamp(1 - G.clearTimer / 2.3, 0, 1);
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(W.width / 2 - 150, y + 172, 300, 3);
    ctx.fillStyle = G.accent;
    ctx.fillRect(W.width / 2 - 150, y + 172, w, 3);
    ctx.restore();
  }

  function drawGameOver() {
    var a = Math.min(1, 0.5 + G.overTimer * 1.2);
    ctx.fillStyle = 'rgba(3,6,14,' + (0.52 * a + 0.14) + ')';
    ctx.fillRect(0, 0, W.width, W.height);

    var x = W.width / 2 - 280;
    var y = 160;
    panel(x, y, 560, 350, '#ff5b6e');

    var jit = Math.sin(G.time * 27) > 0.86 ? (Math.random() * 5 - 2.5) : 0;
    label('GAME OVER', W.width / 2 - 2 + jit, y + 58, 38, 'rgba(255,59,92,0.55)', 'center', 800, 6);
    label('GAME OVER', W.width / 2 + 2 - jit, y + 58, 38, 'rgba(62,242,255,0.32)', 'center', 800, 6);
    label('GAME OVER', W.width / 2, y + 58, 38, '#ffe4e9', 'center', 800, 6);

    label('FINAL SCORE', W.width / 2, y + 104, 8, '#6f90b3', 'center', 700, 3);
    var finalStr = pad(G.score, 7);
    num(finalStr, W.width / 2, y + 136, finalStr.length > 9 ? 28 : 38, '#ecfeff', 'center', '#ff5b6e', 17);

    if (G.newBest) {
      var p = 0.65 + 0.35 * Math.sin(G.time * 5);
      ctx.save();
      ctx.globalAlpha = p;
      label('NEW PERSONAL BEST', W.width / 2, y + 166, 10, '#ffb84d', 'center', 800, 3);
      ctx.restore();
    } else {
      label('BEST  ' + pad(Math.max(G.best, G.score), 7), W.width / 2, y + 166, 10, '#5d7fa6', 'center', 600, 2.2);
    }

    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(x + 80, y + 196, 400, 1);
    var stats = [
      ['LEVEL', String(G.level), 320],
      ['BRICKS', String(G.bricksSmashed), 480],
      ['POWER-UPS', String(G.powerupsCollected), 640]
    ];
    for (var s = 0; s < stats.length; s++) {
      label(stats[s][0], stats[s][2], y + 218, 7.5, '#5d7fa6', 'center', 700, 2);
      num(stats[s][1], stats[s][2], y + 240, 18, '#cfe9ff', 'center', null, 0);
    }

    if (G.overTimer > 0.55) {
      var q = 0.65 + 0.35 * Math.sin(G.time * 3.4);
      ctx.save();
      ctx.globalAlpha = q;
      label(isCoarse ? 'TAP TO PLAY AGAIN' : 'CLICK OR PRESS SPACE TO PLAY AGAIN', W.width / 2, y + 284, 11, '#dffbff', 'center', 700, 2.4);
      ctx.restore();
    }
    if (!isCoarse) label('R  RESTART  ·  M  MUTE', W.width / 2, y + 310, 8, '#3d5878', 'center', 600, 2.2);
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
    drawDebris();
    drawDrops();
    drawLasers();
    drawParticles();
    drawPaddle();
    drawBalls();
    drawFloaters();
    ctx.restore();

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
  var pauseDrawn = false;

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

    if (!(G.state === 'paused' && pauseDrawn)) {
      render();
      if (G.state === 'paused') pauseDrawn = true;
    }
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
      pauseDrawn = false;
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
    pauseDrawn = false;
    var rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    var budget = Math.sqrt(MAX_PIXELS / (rect.width * rect.height));
    dpr = Math.max(1, Math.min(dpr, budget));
    var cw = Math.round(rect.width * dpr);
    var ch = Math.round(rect.height * dpr);
    if (canvas.width !== cw || canvas.height !== ch) {
      canvas.width = cw;
      canvas.height = ch;
    }
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
      if (G.state === 'playing') { G.state = 'paused'; pauseDrawn = false; updateTouchUi(); }
    });
    document.addEventListener('visibilitychange', function () {
      if (document.hidden && G.state === 'playing') { G.state = 'paused'; pauseDrawn = false; updateTouchUi(); }
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
        pauseDrawn = false;
        updateTouchUi();
      });
    }
    updateTouchUi();

    starField();
    buildGraphics();
    resize();

    /* menu bricks reuse the same drawing helpers but need no simulation */
    window.NBDebug = {
      G: G,
      start: startGame,
      launch: launchBalls,
      loadLevel: loadLevel,
      state: function () { return G.state; }
    };

    raf = window.requestAnimationFrame(frame);
  }

  if (document.readyState === 'complete' || document.readyState === 'interactive') boot();
  else document.addEventListener('DOMContentLoaded', boot);
})();
