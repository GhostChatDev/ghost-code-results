const { chromium } = require('@playwright/test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { spawn } = require('node:child_process');

(async () => {
  const server = spawn('python3', ['-m', 'http.server', '8080'], { stdio: 'ignore' });
  const executablePath = [process.env.CHROME_PATH, chromium.executablePath(), '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome', '/opt/google/chrome/chrome'].find(path => path && fs.existsSync(path));
  const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
  try {
    let ready = false;
    for (let i = 0; i < 60; i++) {
      try { if ((await fetch('http://localhost:8080')).ok) { ready = true; break; } } catch {}
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.ok(ready, 'Local server starts');
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('http://localhost:8080');
    await page.locator('#begin').click();
    assert.equal(await page.evaluate(() => mode), 'playing');
    await page.locator('#sound').click();
    assert.equal(await page.locator('#sound').textContent(), 'Sound: on');
    await page.locator('#sound').click();
    const start = await page.evaluate(() => ({ ...state.player }));
    // The spear is guaranteed one tile east of the starting point.
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.evaluate(() => state.player.x), start.x + 1);
    assert.equal(await page.evaluate(() => state.spear), true);
    await page.locator('#spear').click();
    assert.equal(await page.evaluate(() => state.weapon), 'spear');
    await page.locator('#blade').click();
    assert.equal(await page.evaluate(() => state.weapon), 'blade');
    await page.evaluate(() => { state.player.hp = 10; update(); });
    await page.locator('#potion').click();
    assert.equal(await page.evaluate(() => state.player.hp), 26);
    assert.equal(await page.evaluate(() => state.potions), 1);
    await page.locator('#pause').click();
    const pausedTurns = await page.evaluate(() => state.turns);
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.evaluate(() => state.turns), pausedTurns);
    await page.locator('#begin').click();
    assert.equal(await page.evaluate(() => mode), 'playing');
    await page.keyboard.press('Escape');
    await page.locator('#pause').click();
    assert.equal(await page.evaluate(() => mode), 'playing');
    // Check visibility memory and monster pursuit in a controlled open room.
    const fog = await page.evaluate(() => {
      state.map.monsters = [];
      state.map.tiles = Array.from({ length: H }, (_, y) => Array.from({ length: W }, (_, x) => x > 0 && y > 0 && x < W - 1 && y < H - 1 ? 1 : 0));
      Object.assign(state.player, { x: 3, y: 3 }); update();
      Object.assign(state.player, { x: 30, y: 20 }); update();
      return seen.has('3,3') && !visible.has('3,3');
    });
    assert.ok(fog, 'Explored tiles persist after leaving field of view');
    await page.evaluate(() => {
      state.map.monsters = [{ name: 'Test husk', x: 26, y: 20, hp: 10, atk: 5, def: 1, type: 2, glyph: 'h', color: '#fff', alert: false }];
    });
    await page.keyboard.press('Space');
    assert.equal(await page.evaluate(() => state.map.monsters[0].x), 27);
    await page.evaluate(() => {
      state.map.monsters[0].x = state.player.x - 1;
      state.map.monsters[0].hp = 1;
    });
    const kills = await page.evaluate(() => state.kills);
    await page.keyboard.press('ArrowLeft');
    assert.equal(await page.evaluate(() => state.kills), kills + 1);
    // Real descend handlers, not direct floor increments.
    for (let floor = 1; floor < 5; floor++) {
      await page.evaluate(() => { Object.assign(state.player, state.map.stairs); update(); });
      if (floor % 2) await page.keyboard.press('e');
      else await page.locator('#stairs').click();
      assert.equal(await page.evaluate(() => state.floor), floor + 1);
    }
    assert.equal(await page.evaluate(() => state.map.monsters.some(m => m.type === 4)), true);
    await page.evaluate(() => {
      const boss = state.map.monsters.find(m => m.type === 4);
      const p = state.player;
      state.map.tiles[p.y][p.x + 1] = 1;
      Object.assign(boss, { x: p.x + 1, y: p.y, hp: 1 });
      state.map.monsters = [boss]; update();
    });
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.evaluate(() => mode), 'ended');
    assert.match(await page.locator('#summary').textContent(), /Floor 5 \/ 5/);
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('ashen-best')).win), true);
    await page.reload();
    assert.match(await page.locator('#best').textContent(), /Crown reclaimed/);
    assert.equal(await page.evaluate(() => state), null, 'No run resurrection after reload');
    await page.locator('#begin').click();
    await page.evaluate(() => {
      const p = state.player; p.hp = 1;
      state.map.monsters = [{ name: 'Executioner', x: p.x + 1, y: p.y, hp: 20, atk: 100, def: 0, type: 0, glyph: 'r', color: '#fff', alert: true }];
    });
    await page.keyboard.press('Space');
    assert.equal(await page.evaluate(() => mode), 'ended');
    assert.match(await page.locator('#overline').textContent(), /Permanent death/);
    const deadTurns = await page.evaluate(() => state.turns);
    await page.keyboard.press('w');
    assert.equal(await page.evaluate(() => state.turns), deadTurns);
    await page.locator('#begin').click();
    assert.equal(await page.evaluate(() => state.floor), 1);
    assert.equal(await page.evaluate(() => state.player.hp), 28);
    fs.mkdirSync('screenshots', { recursive: true });
    await page.screenshot({ path: 'screenshots/desktop.png', fullPage: true });
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.screenshot({ path: 'screenshots/tablet.png', fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'No phone horizontal overflow');
    await page.locator('[data-dir="1,0"]').click();
    assert.equal(await page.evaluate(() => state.spear), true);
    const rect = await page.locator('#map').boundingBox();
    const player = await page.evaluate(() => ({ ...state.player }));
    await page.mouse.click(rect.x + (player.x - 1 + .5) * rect.width / 39, rect.y + (player.y + .5) * rect.height / 27);
    assert.equal(await page.evaluate(() => state.player.x), player.x - 1, 'Tap-to-move takes one step');
    for (const selector of ['[data-dir="0,-1"]', '[data-dir="-1,0"]', '[data-dir="0,1"]', '#wait', '#descend']) {
      await page.locator(selector).click();
    }
    await page.screenshot({ path: 'screenshots/phone.png', fullPage: true });
    assert.deepEqual(errors, [], 'No uncaught browser errors');
    console.log('PASS: start, keys, weapons, potions, pause, fog, pursuit, combat, five floors, boss, death, restart, persistence, phone controls and tap-to-move');
  } finally {
    await browser.close(); server.kill();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
