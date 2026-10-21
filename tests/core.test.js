'use strict';

const assert = require('node:assert/strict');
const C = require('../js/core.js');

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('  ok  ' + name);
  } catch (err) {
    console.error('FAIL  ' + name);
    console.error('      ' + err.message);
    process.exitCode = 1;
  }
}

console.log('\nNEON BREAKER core rules\n');

test('rng is deterministic and stays in [0,1)', () => {
  const a = C.mulberry32(42);
  const b = C.mulberry32(42);
  for (let i = 0; i < 1000; i++) {
    const v = a();
    assert.equal(v, b());
    assert.ok(v >= 0 && v < 1, 'out of range: ' + v);
  }
});

test('levels are deterministic', () => {
  const a = C.createLevel(7);
  const b = C.createLevel(7);
  assert.deepEqual(a, b);
  assert.notDeepEqual(C.createLevel(8).bricks, a.bricks);
});

test('every level has bricks fully inside the playfield', () => {
  for (let level = 1; level <= 60; level++) {
    const data = C.createLevel(level);
    assert.ok(data.total >= 8, 'level ' + level + ' has only ' + data.total + ' bricks');
    for (const b of data.bricks) {
      assert.ok(b.x >= C.LAYOUT.padX - 1e-6, 'left overflow at level ' + level);
      assert.ok(b.x + b.w <= C.WORLD.width - C.LAYOUT.padX + 1e-6, 'right overflow at level ' + level);
      assert.ok(b.y >= C.LAYOUT.top - 1e-6, 'top overflow at level ' + level);
      assert.ok(b.y + b.h < C.PADDLE.y - 120, 'bricks reach too low at level ' + level);
      assert.ok(b.hp > 0 && b.hp <= 3);
      assert.ok(['normal', 'tough', 'bomb'].includes(b.type));
      assert.match(b.color, /^#[0-9a-f]{6}$/i);
      assert.equal(b.alive, true);
    }
  }
});

test('level 1 is a full 13x7 wall', () => {
  const data = C.createLevel(1);
  assert.equal(data.pattern, 'wall');
  assert.equal(data.total, 91);
  assert.equal(data.bricks.length, 91);
});

test('all eight shapes show up and cycle', () => {
  const names = [];
  for (let level = 1; level <= 8; level++) names.push(C.createLevel(level).pattern);
  assert.equal(new Set(names).size, C.PATTERNS.length);
  assert.equal(C.createLevel(9).pattern, C.createLevel(1).pattern);
});

test('ball speed rises with level and never exceeds the cap', () => {
  let prev = 0;
  for (let level = 1; level <= 50; level++) {
    const sp = C.levelSpeed(level);
    assert.ok(sp >= prev, 'speed dropped at level ' + level);
    assert.ok(sp <= C.BALL.maxSpeed, 'speed cap broken at level ' + level);
    prev = sp;
  }
  assert.ok(prev > C.BALL.baseSpeed * 1.5);
});

test('circle vs rect: miss, face hit, corner hit, inside ejection', () => {
  const rect = { x: 0, y: 0, w: 100, h: 20 };

  const miss = C.circleRect(50, 60, 5, rect);
  assert.equal(miss.hit, false);

  const face = C.circleRect(50, 23, 5, rect);
  assert.equal(face.hit, true);
  assert.ok(Math.abs(face.nx) < 1e-9 && Math.abs(face.ny - 1) < 1e-9);
  assert.ok(Math.abs(face.depth - 2) < 1e-9);

  const corner = C.circleRect(103, 22, 5, rect);
  assert.equal(corner.hit, true);
  assert.ok(corner.nx > 0.8 && corner.ny > 0.5);
  assert.ok(Math.abs(corner.depth - (5 - Math.sqrt(13))) < 1e-9);

  const inside = C.circleRect(50, 10, 5, rect);
  assert.equal(inside.hit, true);
  assert.equal(inside.ny, -1);
  assert.equal(inside.depth, 15);

  const touch = C.circleRect(0, -5, 5, rect);
  assert.equal(touch.hit, true);
  assert.ok(touch.depth < 1e-6);
});

test('reflect keeps speed and mirrors the normal component', () => {
  assert.deepEqual(C.reflect(3, 4, 0, -1), [3, -4]);
  assert.deepEqual(C.reflect(2, -5, 1, 0), [-2, -5]);
  const out = C.reflect(10, 0, Math.SQRT1_2, Math.SQRT1_2);
  assert.ok(Math.abs(Math.hypot(out[0], out[1]) - 10) < 1e-9);
});

test('combo multiplier ramps up and caps at 8', () => {
  assert.equal(C.comboMultiplier(0), 1);
  assert.equal(C.comboMultiplier(4), 1);
  assert.equal(C.comboMultiplier(5), 2);
  assert.equal(C.comboMultiplier(20), 5);
  assert.equal(C.comboMultiplier(9999), 8);
});

test('scoring rewards tougher bricks and bombs', () => {
  const normal = { type: 'normal', maxHp: 1 };
  const tough = { type: 'tough', maxHp: 3 };
  const bomb = { type: 'bomb', maxHp: 1 };
  assert.equal(C.brickPoints(normal, 1), 10);
  assert.equal(C.brickPoints(tough, 1), 30);
  assert.equal(C.brickPoints(bomb, 1), 35);
  assert.equal(C.brickPoints(normal, 4), 40);
  assert.ok(C.levelBonus(3, 2) > C.levelBonus(2, 2));
});

test('power-up table is weighted, valid and covers every effect', () => {
  const ids = C.POWERUPS.map(p => p.id);
  assert.deepEqual(ids.sort(), ['laser', 'life', 'multi', 'slow', 'sticky', 'wide'].sort());
  for (const p of C.POWERUPS) {
    assert.ok(p.weight > 0);
    assert.match(p.color, /^#[0-9a-f]{6}$/i);
    assert.ok(p.label.length > 0 && p.short.length === 1);
  }
  const first = C.pickPowerup(() => 0);
  const last = C.pickPowerup(() => 0.999999);
  assert.ok(ids.includes(C.pickPowerup(Math.random).id));
  assert.equal(first.id, 'multi');
  assert.equal(last.id, 'life');
});

test('paddle and ball constants are coherent', () => {
  assert.ok(C.PADDLE.y + C.PADDLE.height <= C.WORLD.height);
  assert.ok(C.PLAY_TOP < C.LAYOUT.top);
  assert.ok(C.PADDLE.width > C.BALL.radius * 4);
  assert.ok(C.PADDLE.wideScale > 1);
  assert.ok(C.BALL.baseSpeed < C.BALL.maxSpeed);
  assert.ok(C.LAYOUT.top + C.LAYOUT.rows * (C.LAYOUT.height + C.LAYOUT.gap) < C.PADDLE.y);
});

console.log('\n' + passed + ' checks passed' + (process.exitCode ? ' (with failures)' : '') + '\n');
