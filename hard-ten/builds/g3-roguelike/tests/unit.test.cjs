const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync('index.html', 'utf8');
const source = html.match(/<script id="rules">([\s\S]*?)<\/script>/)[1];
const rules = vm.runInNewContext(source + '\nRules');
const { generate, damage, W, H, lineOfSight, pathStep } = rules;
const json = value => JSON.stringify(value);

test('250 seeded worlds × five floors: every walkable tile is connected and stairs reachable', () => {
  for (let seed = 0; seed < 250; seed++) {
    for (let floor = 1; floor <= 5; floor++) {
      const map = generate('world-' + seed, floor);
      const { tiles, start, stairs } = map;
      assert.ok(map.rooms.length >= 2);
      const queue = [start], reached = new Set([`${start.x},${start.y}`]);
      for (let i = 0; i < queue.length; i++) {
        const { x, y } = queue[i];
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, ny = y + dy, key = `${nx},${ny}`;
          if (tiles[ny]?.[nx] === 1 && !reached.has(key)) {
            reached.add(key); queue.push({ x: nx, y: ny });
          }
        }
      }
      assert.equal(reached.size, tiles.flat().filter(t => t === 1).length, `Disconnected: ${seed}/${floor}`);
      assert.ok(reached.has(`${stairs.x},${stairs.y}`));
      assert.notDeepEqual(json(start), json(stairs));
      assert.equal(tiles.length, H);
      assert.ok(tiles.every(row => row.length === W));
      const occupied = new Set();
      for (const entity of [...map.monsters, ...map.items]) {
        const key = `${entity.x},${entity.y}`;
        assert.ok(reached.has(key));
        assert.ok(!occupied.has(key), `Overlapping entity ${seed}/${floor}/${key}`);
        assert.notEqual(key, `${start.x},${start.y}`);
        occupied.add(key);
      }
      assert.equal(map.monsters.filter(m => m.type === 4).length, floor === 5 ? 1 : 0);
      assert.equal(new Set(map.monsters.filter(m => m.type < 4).map(m => m.type)).size, 4);
    }
  }
});

test('same seed and floor produce identical full layouts, monsters and loot', () => {
  for (const seed of ['', 'CINDER-7', 'a long seed', '🔥', '0123456789']) {
    for (let floor = 1; floor <= 5; floor++) {
      assert.equal(json(generate(seed, floor)), json(generate(seed, floor)));
    }
  }
  assert.notEqual(json(generate('A', 1)), json(generate('B', 1)));
  assert.notEqual(json(generate('A', 1)), json(generate('A', 2)));
});

test('generation calls do not share mutable tiles or actors', () => {
  const first = generate('isolation', 1), expected = json(first);
  first.tiles[1][1] = 99;
  first.monsters[0].hp = 0;
  assert.equal(json(generate('isolation', 1)), expected);
});

test('combat subtracts defense with minimum one damage and integer results', () => {
  assert.equal(damage(6, 2), 4);
  assert.equal(damage(8, 3), 5);
  assert.equal(damage(6, 0), 6);
  assert.equal(damage(2, 8), 1);
  assert.equal(damage(0, 0), 1);
  assert.equal(damage(7.9, 2.9), 5);
  assert.equal(damage(6, -2), 6);
  for (let atk = 0; atk < 30; atk++) for (let def = 0; def < 30; def++) {
    assert.equal(damage(atk, def), Math.max(1, atk - def));
  }
});

test('line of sight sees the first wall but not through it', () => {
  const tiles = Array.from({ length: H }, () => Array(W).fill(1));
  tiles[3][4] = 0;
  assert.equal(lineOfSight(tiles, 2, 3, 4, 3), true);
  assert.equal(lineOfSight(tiles, 2, 3, 6, 3), false);
  assert.equal(lineOfSight(tiles, 2, 3, 2, 3), true);
  assert.equal(lineOfSight(tiles, 2, 3, 2, 6), true);
});

test('pathfinding takes cardinal steps and respects blocked tiles', () => {
  const tiles = Array.from({ length: H }, () => Array(W).fill(0));
  for (let x = 1; x <= 5; x++) tiles[2][x] = 1;
  assert.equal(json(pathStep(tiles, { x: 1, y: 2 }, { x: 5, y: 2 })), '{"x":2,"y":2}');
  assert.equal(pathStep(tiles, { x: 1, y: 2 }, { x: 5, y: 2 }, x => x === 3), null);
});
