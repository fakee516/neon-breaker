/* NEON BREAKER - pure game rules (no DOM, no canvas).
   Works in the browser as window.NBCore and in Node for tests. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.NBCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var WORLD = { width: 960, height: 640 };
  var LAYOUT = { cols: 13, rows: 7, padX: 28, top: 118, gap: 6, height: 26, radius: 6 };
  var PLAY_TOP = 92;
  var PADDLE = { width: 132, height: 14, y: 594, speed: 1020, maxBounce: Math.PI / 3, wideScale: 1.55 };
  var BALL = { radius: 8, baseSpeed: 420, maxSpeed: 820 };

  var BRICK_COLORS = [
    '#3ef2ff', '#5b8cff', '#a06bff', '#ff5bd0',
    '#ff5b6e', '#ffb84d', '#8dff6b'
  ];

  var TYPES = { normal: 'normal', tough: 'tough', bomb: 'bomb' };

  var POWERUPS = [
    { id: 'multi', label: 'MULTI BALL', short: 'M', color: '#3ef2ff', weight: 22, duration: 0 },
    { id: 'wide', label: 'WIDE PADDLE', short: 'W', color: '#8dff6b', weight: 20, duration: 14 },
    { id: 'laser', label: 'LASER', short: 'L', color: '#ff5b6e', weight: 18, duration: 11 },
    { id: 'sticky', label: 'STICKY', short: 'S', color: '#ffb84d', weight: 14, duration: 13 },
    { id: 'slow', label: 'SLOW MOTION', short: 'T', color: '#a06bff', weight: 16, duration: 10 },
    { id: 'life', label: '+1 LIFE', short: '+', color: '#ff5bd0', weight: 5, duration: 0 }
  ];

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ----- level shapes ------------------------------------------------ */
  var PATTERNS = [
    { name: 'wall', mask: function () { return true; } },
    {
      name: 'checker',
      mask: function (r, c) { return (r + c) % 2 === 0; }
    },
    {
      name: 'diamond',
      mask: function (r, c) { return Math.abs(c - 6) + Math.abs(r - 3) <= 7; }
    },
    {
      name: 'wave',
      mask: function (r, c) {
        var h = Math.round(Math.abs(Math.sin((c + 1) * Math.PI / 7)) * 6);
        return r >= 6 - h;
      }
    },
    {
      name: 'castle',
      mask: function (r, c) {
        if (r === 0 || r === 6 || c === 0 || c === 12) return true;
        if ((r === 1 || r === 2 || r === 3 || r === 4) && (c === 3 || c === 9)) return true;
        return false;
      }
    },
    {
      name: 'arrow',
      mask: function (r, c) {
        return Math.abs(Math.abs(r - 3) - Math.abs(c - 6) / 2.2) < 0.6;
      }
    },
    {
      name: 'heart',
      mask: function (r, c) {
        var x = (c - 6) / 6.1;
        var y = (3.1 - r) / 3.1;
        var v = x * x + y * y - 1;
        return v * v * v - x * x * y * y * y <= 0;
      }
    },
    {
      name: 'rings',
      mask: function (r, c) {
        var d = Math.max(Math.abs(c - 6), Math.abs(r - 3));
        if (d === 1 || d === 3) return true;
        return d === 5 && (r === 3 || c === 6);
      }
    }
  ];

  function levelSpeed(level) {
    return Math.min(BALL.maxSpeed, Math.round(BALL.baseSpeed * (1 + (level - 1) * 0.032)));
  }

  function pickPowerup(rng) {
    var total = 0, i;
    for (i = 0; i < POWERUPS.length; i++) total += POWERUPS[i].weight;
    var roll = rng() * total;
    for (i = 0; i < POWERUPS.length; i++) {
      roll -= POWERUPS[i].weight;
      if (roll <= 0) return POWERUPS[i];
    }
    return POWERUPS[0];
  }

  function createLevel(level) {
    level = Math.max(1, level | 0);
    var seed = (0x9E3779B9 ^ Math.imul(level, 0x85EBCA6B)) >>> 0;
    var rng = mulberry32(seed);
    var pattern = PATTERNS[(level - 1) % PATTERNS.length];

    var cols = LAYOUT.cols;
    var rows = LAYOUT.rows;
    var gap = LAYOUT.gap;
    var brickW = (WORLD.width - LAYOUT.padX * 2 - gap * (cols - 1)) / cols;
    var brickH = LAYOUT.height;
    var toughChance = Math.min(0.30, 0.075 + level * 0.012);
    var bombChance = Math.min(0.13, 0.03 + level * 0.005);
    var toughHp = level >= 10 ? 3 : 2;

    var bricks = [];
    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        if (!pattern.mask(r, c)) continue;
        var type = TYPES.normal;
        var hp = 1;
        var roll = rng();
        if (roll < bombChance) {
          type = TYPES.bomb;
        } else if (roll < bombChance + toughChance) {
          type = TYPES.tough;
          hp = toughHp;
        }
        bricks.push({
          x: LAYOUT.padX + c * (brickW + gap),
          y: LAYOUT.top + r * (brickH + gap),
          w: brickW,
          h: brickH,
          row: r,
          col: c,
          type: type,
          hp: hp,
          maxHp: hp,
          color: BRICK_COLORS[r % BRICK_COLORS.length],
          alive: true,
          flash: 0
        });
      }
    }

    /* never ship an empty (or trivially tiny) board */
    if (bricks.length === 0) {
      for (var c2 = 0; c2 < cols; c2++) {
        bricks.push({
          x: LAYOUT.padX + c2 * (brickW + gap),
          y: LAYOUT.top + 3 * (brickH + gap),
          w: brickW, h: brickH, row: 3, col: c2,
          type: TYPES.normal, hp: 1, maxHp: 1,
          color: BRICK_COLORS[3], alive: true, flash: 0
        });
      }
    }

    return {
      level: level,
      pattern: pattern.name,
      bricks: bricks,
      total: bricks.length,
      brickW: brickW,
      brickH: brickH,
      speed: levelSpeed(level)
    };
  }

  /* ----- geometry ---------------------------------------------------- */
  var NO_HIT = Object.freeze({ hit: false, nx: 0, ny: 0, depth: 0 });

  function circleRect(cx, cy, radius, rect) {
    var rx = rect.x, ry = rect.y, rw = rect.w, rh = rect.h;
    var nx = cx < rx ? rx : (cx > rx + rw ? rx + rw : cx);
    var ny = cy < ry ? ry : (cy > ry + rh ? ry + rh : cy);
    var dx = cx - nx, dy = cy - ny;
    var d2 = dx * dx + dy * dy;
    if (d2 > radius * radius) return NO_HIT;

    if (d2 > 1e-9) {
      var d = Math.sqrt(d2);
      return { hit: true, nx: dx / d, ny: dy / d, depth: radius - d };
    }

    /* centre is inside the rect: eject through the closest face */
    var left = cx - rx;
    var right = rx + rw - cx;
    var top = cy - ry;
    var bottom = ry + rh - cy;
    var m = left, nX = -1, nY = 0;
    if (right < m) { m = right; nX = 1; nY = 0; }
    if (top < m) { m = top; nX = 0; nY = -1; }
    if (bottom < m) { m = bottom; nX = 0; nY = 1; }
    return { hit: true, nx: nX, ny: nY, depth: m + radius };
  }

  function reflect(vx, vy, nx, ny) {
    var dot = vx * nx + vy * ny;
    return [vx - 2 * dot * nx, vy - 2 * dot * ny];
  }

  /* ----- scoring ----------------------------------------------------- */
  function comboMultiplier(combo) {
    return clamp(1 + Math.floor(combo / 5), 1, 8);
  }

  function brickPoints(brick, multiplier) {
    var base = brick.maxHp * 10;
    if (brick.type === TYPES.bomb) base = 35;
    return Math.round(base * (multiplier || 1));
  }

  function levelBonus(level, lives) {
    return level * 50 + lives * 25;
  }

  return {
    WORLD: WORLD,
    LAYOUT: LAYOUT,
    PLAY_TOP: PLAY_TOP,
    PADDLE: PADDLE,
    BALL: BALL,
    BRICK_COLORS: BRICK_COLORS,
    TYPES: TYPES,
    POWERUPS: POWERUPS,
    PATTERNS: PATTERNS,
    clamp: clamp,
    mulberry32: mulberry32,
    levelSpeed: levelSpeed,
    pickPowerup: pickPowerup,
    createLevel: createLevel,
    circleRect: circleRect,
    reflect: reflect,
    comboMultiplier: comboMultiplier,
    brickPoints: brickPoints,
    levelBonus: levelBonus
  };
});
