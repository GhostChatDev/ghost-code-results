import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
const html = await readFile('index.html');
const server = createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/html' }); res.end(html);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const executablePath = process.env.CHROME_BIN || ['/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome', '/opt/google/chrome/chrome'].find(existsSync);
const browser = await chromium.launch(executablePath ? { executablePath } : {});
const errors = [];
await mkdir('artifacts', { recursive: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('pageerror', e => errors.push(e.message));
const url = `http://127.0.0.1:${server.address().port}`;
const state = () => page.evaluate(() => ({ mode, x: p.x, y: p.y, time: elapsed, index, gears }));
try {
  await page.goto(url); await page.locator('#actions button').first().waitFor();
  await page.screenshot({ path: 'artifacts/title.png' });
  await page.getByRole('button', { name: 'Choose a world' }).click();
  assert.equal(await page.locator('.level-list button:disabled').count(), 2);
  await page.locator('.level-list button').first().click();
  await page.waitForFunction(() => elapsed > .1);
  const start = await state();
  await page.keyboard.down('KeyD');
  await page.waitForFunction(x => p.x > x + 45, start.x);
  await page.keyboard.up('KeyD');
  await page.waitForFunction(() => !!p.ground);
  // Space must still jump after a menu button was clicked and retains focus.
  const groundY = (await state()).y;
  await page.keyboard.down('Space');
  await page.waitForFunction(y => p.y < y - 25, groundY);
  await page.keyboard.up('Space');
  await page.locator('#pause').click();
  assert.equal((await state()).mode, 'paused');
  const frozen = (await state()).time;
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  assert.equal((await state()).time, frozen);
  await page.getByRole('button', { name: 'Resume', exact: true }).last().click();
  await page.waitForFunction(t => elapsed > t, frozen);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Restart level', exact: true }).click();
  assert.ok((await state()).time < .2);
  await page.locator('#mute').click(); assert.equal(await page.locator('#mute').innerText(), 'Sound: on');
  await page.locator('#mute').click(); assert.equal(await page.locator('#mute').innerText(), 'Sound: off');
  // Deterministic fixtures exercise the actual game's step, not replacement logic.
  const mechanics = await page.evaluate(() => {
    const results = [];
    for (let i = 0; i < 3; i++) {
      load(i); clearInput();
      const c = coins[0]; p.x = c.x - 10; p.y = c.y - 20; step();
      const collected = gears === 1 && c.taken;
      p.x = level.checkpoint[0]; p.y = level.checkpoint[1]; p.vx = 0; p.vy = 0; step();
      const checkpointWorks = flagged;
      p.y = level.h + 200; step();
      const respawnWorks = p.x === checkpoint[0] && p.y === checkpoint[1];
      const s = movers[0]; p = player(s.x + 20, s.y - 36); p.ground = s;
      const relative = p.x - s.x; let carried = true;
      for (let n = 0; n < 30; n++) { step(); if (Math.abs(p.x - s.x - relative) > .1 || Math.abs(p.y + p.h - s.y) > .1) carried = false; }
      p.x = level.door[0] + 10; p.y = level.door[1]; p.vx = 0; p.vy = 0; step();
      results.push({ collected, checkpointWorks, respawnWorks, carried, completed: mode === 'complete', saved: Number.isFinite(saved.best[i]) });
    }
    return results;
  });
  for (const [i, result] of mechanics.entries()) for (const [key, value] of Object.entries(result)) assert.ok(value, `level ${i + 1}: ${key}`);
  await page.getByRole('button', { name: 'Play again', exact: true }).click();
  await page.locator('#levels').click();
  assert.equal(await page.locator('.level-list button:disabled').count(), 0);
  await page.locator('.level-list button').nth(2).click();
  assert.equal((await state()).index, 2);
  await page.reload();
  await page.getByRole('button', { name: 'Choose a world' }).click();
  assert.equal(await page.locator('.level-list button:disabled').count(), 0);
  assert.equal(await page.evaluate(() => Object.values(saved.best).filter(Number.isFinite).length), 3);
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await page.locator('#restart').click();
  await page.screenshot({ path: 'artifacts/desktop.png' });
  const pixels = await page.evaluate(() => {
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const colors = new Set(); for (let i = 0; i < data.length; i += 400) colors.add(`${data[i]},${data[i+1]},${data[i+2]}`);
    return colors.size;
  });
  assert.ok(pixels > 10, 'canvas must contain visible artwork');
  for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no sideways overflow');
    const b = page.locator('[data-control="right"]'); await b.waitFor({ state: 'visible' });
    const box = await b.boundingBox(); const before = (await state()).x;
    await page.mouse.move(box.x + 20, box.y + 20); await page.mouse.down();
    await page.waitForFunction(x => p.x > x + 15, before); await page.mouse.up();
    await page.locator('#restart').click(); await page.waitForFunction(() => !!p.ground);
    const jump = await page.locator('[data-control="jump"]').boundingBox(); const y = (await state()).y;
    await page.mouse.move(jump.x + 20, jump.y + 20); await page.mouse.down();
    await page.waitForFunction(y => p.y < y - 15, y); await page.mouse.up();
    const left = await page.locator('[data-control="left"]').boundingBox(); const x = (await state()).x;
    await page.mouse.move(left.x + 20, left.y + 20); await page.mouse.down();
    await page.waitForFunction(x => p.x < x - 10, x); await page.mouse.up();
    await page.screenshot({ path: `artifacts/phone-${viewport.width}.png` });
  }
  assert.deepEqual(errors, []); console.log('PASS: keyboard, touch, menus, all level fixtures, moving platforms, saved bests, canvas and phone layouts');
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
