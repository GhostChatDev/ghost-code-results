const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync('index.html', 'utf8');
const source = html.match(/<script id="physics">([\s\S]*?)<\/script>/)[1];
const context = vm.createContext({});
vm.runInContext(source, context);
const { DT, resolve, player, tick, jumpReady, overlap } = context.MossPhysics;
const idle = { axis: 0, held: false, pressed: false };
const floor = { x: -100, y: 100, w: 500, h: 8 };

test('swept vertical collision catches a thin floor at extreme falling speed', () => {
  for (const speed of [600, 1200, 6000, 60000]) {
    const p = player(20, 20); p.vy = speed;
    const hit = resolve(p, [floor], DT);
    if (20 + 36 + speed * DT >= 100) {
      assert.equal(p.y, 64); assert.equal(p.vy, 0); assert.equal(hit.ground, floor);
    } else assert.ok(p.y + p.h < 100);
  }
});
test('chooses the first floor crossed regardless of data order', () => {
  const p = player(20, -100); p.vy = 60000;
  resolve(p, [{ ...floor, y: 300 }, floor, { ...floor, y: 200 }], DT);
  assert.equal(p.y, 64);
});
test('fast upward movement stops at the underside, not through the ceiling', () => {
  const p = player(20, 200); p.vy = -30000;
  resolve(p, [floor], DT); assert.equal(p.y, 108); assert.equal(p.vy, 0);
});
test('fast horizontal movement stops at walls in either direction', () => {
  const wall = { x: 100, y: 0, w: 10, h: 300 };
  const p = player(0, 30); p.vx = 30000;
  assert.equal(resolve(p, [wall], DT).wall, 1); assert.equal(p.x, 74);
  p.x = 200; p.vx = -30000;
  assert.equal(resolve(p, [wall], DT).wall, -1); assert.equal(p.x, 110);
});
test('falling beside a platform does not create a false landing', () => {
  const p = player(450, 0); p.vy = 10000;
  assert.equal(resolve(p, [floor], DT).ground, null); assert.ok(p.y > 100);
});
test('standing remains stable over 600 physics steps', () => {
  const p = player(20, 64);
  for (let i = 0; i < 600; i++) tick(p, idle, [floor]);
  assert.equal(p.y, 64); assert.equal(p.ground, floor);
});
test('coyote time includes 100ms but rejects later and future timestamps', () => {
  assert.equal(jumpReady(1.1, 1, 1.1), true);
  assert.equal(jumpReady(1.10001, 1, 1.10001), false);
  assert.equal(jumpReady(1, 1.1, 1), false);
});
test('jump buffer includes 100ms but rejects later and future input', () => {
  assert.equal(jumpReady(1.1, 1.1, 1), true);
  assert.equal(jumpReady(1.10001, 1.10001, 1), false);
  assert.equal(jumpReady(1, 1, 1.1), false);
});
test('actual coyote jump works at six steps and not seven', () => {
  for (const frames of [6, 7]) {
    const p = player(20, 0); p.lastGround = 0;
    for (let i = 1; i <= frames; i++) {
      const jumped = tick(p, { axis: 0, held: true, pressed: i === frames }, []);
      if (i === frames) assert.equal(jumped, frames === 6);
    }
  }
});
test('buffered input launches after landing and is consumed once', () => {
  const p = player(20, 58); p.vy = 200;
  assert.equal(tick(p, { ...idle, held: true, pressed: true }, [floor]), false);
  assert.equal(tick(p, { ...idle, held: true }, [floor]), false);
  assert.equal(p.ground, floor);
  assert.equal(tick(p, { ...idle, held: true }, [floor]), true);
  assert.ok(p.vy < 0); assert.equal(p.queued, -Infinity);
  assert.equal(tick(p, { ...idle, held: true }, [floor]), false);
});
test('expired buffered jump does not fire on landing', () => {
  const p = player(20, -100); p.queued = 0;
  for (let i = 0; i < 80; i++) assert.equal(tick(p, idle, [floor]), false);
  assert.equal(p.ground, floor);
});
test('holding jump produces a taller arc than tapping', () => {
  function apex(hold) {
    const p = player(20, 64); p.ground = floor; let top = p.y;
    for (let i = 0; i < 50; i++) {
      tick(p, { axis: 0, held: hold || i === 0, pressed: i === 0 }, [floor]);
      top = Math.min(top, p.y);
    }
    return top;
  }
  assert.ok(apex(true) < apex(false) - 50);
});
test('wall contact limits descent and wall jump pushes away', () => {
  const wall = { x: 100, y: 0, w: 20, h: 1000 };
  const p = player(74, 100); p.wall = 1; p.vy = 500;
  tick(p, { axis: 1, held: false, pressed: false }, [wall]);
  assert.ok(p.vy <= 100); assert.equal(p.wall, 1);
  assert.equal(tick(p, { axis: 1, held: true, pressed: true }, [wall]), true);
  assert.ok(p.vx < 0 && p.vy < 0); assert.ok(p.x < 74);
});
test('touching edges are not overlapping hazards', () => {
  assert.equal(overlap({ x: 0, y: 0, w: 10, h: 10 }, { x: 10, y: 0, w: 10, h: 10 }), false);
});
