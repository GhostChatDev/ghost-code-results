import test from 'node:test';
import assert from 'node:assert/strict';
import { astar, COLS, ROWS, GATE, KEEP, ROCKS, key, Game, TYPES, ENEMIES, wavePlan } from '../game-core.js';

function shortestDistance(start, end, blocked) {
  const queue = [[start, 0]];
  const seen = new Set([key(start)]);
  for (let i = 0; i < queue.length; i++) {
    const [p, distance] = queue[i];
    if (key(p) === key(end)) return distance;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const next = { x: p.x + dx, y: p.y + dy };
      const k = key(next);
      if (next.x < 0 || next.y < 0 || next.x >= COLS || next.y >= ROWS || blocked.has(k) || seen.has(k)) continue;
      seen.add(k);
      queue.push([next, distance + 1]);
    }
  }
  return null;
}

test('A* returns a shortest valid route around rocks and towers', () => {
  for (const blocked of [new Set(), new Set(ROCKS), new Set([...ROCKS, '1,4', '2,3', '8,4'])]) {
    const path = astar(GATE, KEEP, blocked);
    assert.ok(path);
    assert.deepEqual(path[0], GATE);
    assert.deepEqual(path.at(-1), KEEP);
    assert.equal(path.length - 1, shortestDistance(GATE, KEEP, blocked));
    path.forEach((p, i) => {
      assert.ok(!blocked.has(key(p)));
      if (i) assert.equal(Math.abs(path[i - 1].x - p.x) + Math.abs(path[i - 1].y - p.y), 1);
    });
  }
  assert.equal(astar(GATE, KEEP, new Set(['1,4', '0,3', '0,5'])), null);
  assert.equal(astar(GATE, KEEP, new Set([key(GATE)])), null);
});

test('placement cannot block every path and leaves gold and towers unchanged', () => {
  const game = new Game();
  game.gold = 1000;
  assert.equal(game.place(1, 4, 'spark').ok, true);
  assert.equal(game.place(0, 3, 'spark').ok, true);
  const gold = game.gold;
  const path = game.path.map(key);
  const result = game.place(0, 5, 'spark');
  assert.equal(result.ok, false);
  assert.match(result.error, /block every path/i);
  assert.equal(game.gold, gold);
  assert.equal(game.towers.length, 2);
  assert.deepEqual(game.path.map(key), path);
  assert.ok(game.sell(game.towers[0].id) > 0);
  assert.equal(game.place(0, 5, 'spark').ok, true);
  assert.equal(game.path.length - 1, shortestDistance(GATE, KEEP, game.blocked()));
});

test('upgrades cost gold, stop at two, and selling returns 70% of total spent', () => {
  for (const type of Object.keys(TYPES)) {
    const game = new Game();
    game.gold = 1000;
    const { tower } = game.place(2, 2, type);
    assert.ok(tower);
    assert.ok(game.upgrade(tower.id));
    assert.ok(game.upgrade(tower.id));
    assert.equal(game.upgrade(tower.id), false);
    const spent = TYPES[type].cost + TYPES[type].upgrades[0] + TYPES[type].upgrades[1];
    assert.equal(game.gold, 1000 - spent);
    assert.equal(game.sell(tower.id), Math.floor(spent * 0.7));
    assert.equal(game.gold, 1000 - spent + Math.floor(spent * 0.7));
  }
});

test('waves include all enemy types and only wave ten has a boss', () => {
  assert.throws(() => wavePlan(0), RangeError);
  assert.throws(() => wavePlan(11), RangeError);
  const seen = new Set();
  for (let wave = 1; wave <= 10; wave++) {
    const plan = wavePlan(wave);
    assert.equal(plan.length, 6 + wave * 2 + (wave === 10 ? 1 : 0));
    assert.equal(plan.filter(type => type === 'boss').length, wave === 10 ? 1 : 0);
    plan.forEach(type => seen.add(type));
  }
  assert.deepEqual([...seen].sort(), ['armored', 'boss', 'fast', 'normal']);
});

test('kills award gold once and completed waves award their bonus', () => {
  const game = new Game();
  assert.equal(game.lives, 20);
  assert.equal(game.startWave(), true);
  assert.equal(game.startWave(), false);
  assert.equal(game.wave, 1);
  assert.deepEqual(game.queue, wavePlan(1));
  const enemy = game.spawn('armored');
  const initial = game.gold;
  game.damage(enemy, enemy.hp + enemy.armor);
  assert.equal(game.gold, initial + ENEMIES.armored.gold);
  assert.equal(game.kills, 1);
  game.damage(enemy, 9999);
  assert.equal(game.gold, initial + ENEMIES.armored.gold);
  game.queue = [];
  game.update(1 / 60);
  assert.equal(game.state, 'ready');
  assert.equal(game.gold, initial + ENEMIES.armored.gold + 23);
});


test('clearing the tenth wave wins and awards the final bonus', () => {
  const game = new Game();
  game.wave = 9;
  assert.equal(game.startWave(), true);
  assert.ok(game.queue.includes('boss'));
  game.queue = [];
  const gold = game.gold;
  game.update(1 / 60);
  assert.equal(game.state, 'won');
  assert.equal(game.gold, gold + 50);
  assert.equal(game.startWave(), false);
});
