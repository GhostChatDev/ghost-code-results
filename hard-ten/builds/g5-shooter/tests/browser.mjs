// Browser smoke test: serves the folder, opens the game in Chromium,
// starts it, plays a little with keys, mouse and touch, and checks for errors.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { chromium } from 'playwright';

const root = process.cwd();
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css' };
const server = createServer(async (req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0]);
  const path = normalize(join(root, url === '/' ? 'index.html' : url));
  if (!path.startsWith(root)) { res.writeHead(403); res.end(); return; }
  try {
    const data = await readFile(path);
    res.writeHead(200, { 'content-type': types[extname(path)] || 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404); res.end('not found');
  }
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;

const failures = [];
const fail = (m) => { failures.push(m); console.log('FAIL: ' + m); };

// Use Playwright's Chromium if it was installed; otherwise fall back to a
// Chrome/Chromium already on the machine (some CI hosts block the download).
async function launchBrowser() {
  const errors = [];
  try { return await chromium.launch(); } catch (e) { errors.push(e.message.split('\n')[0]); }
  const paths = [process.env.CHROME_PATH, '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium', '/usr/bin/chromium-browser', '/snap/bin/chromium',
    '/opt/google/chrome/chrome'].filter(Boolean);
  const { existsSync } = await import('node:fs');
  for (const p of paths) {
    if (!existsSync(p)) continue;
    try { return await chromium.launch({ executablePath: p }); } catch (e) { errors.push(`${p}: ${e.message.split('\n')[0]}`); }
  }
  for (const channel of ['chrome', 'msedge']) {
    try { return await chromium.launch({ channel }); } catch (e) { errors.push(`${channel}: ${e.message.split('\n')[0]}`); }
  }
  console.log('FAIL: no Chromium could be launched:\n' + errors.join('\n'));
  process.exit(1);
}
const browser = await launchBrowser();
async function run(name, contextOpts, play) {
  const ctx = await browser.newContext(contextOpts);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => fail(`${name}: uncaught error: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') fail(`${name}: console error: ${m.text()}`); });
  page.on('response', (r) => { if (r.status() >= 400) console.log(`  (${name}: ${r.status()} for ${r.url()})`); });
  await page.goto(`http://localhost:${port}/`);
  await page.locator('canvas#game').waitFor();
  const meta = await page.locator('meta[name="viewport"]').count();
  if (!meta) fail(`${name}: no viewport meta tag`);
  await play(page);
  const frames1 = await page.evaluate(() => window.__bloom && window.__bloom.frames);
  await page.waitForTimeout(500);
  const frames2 = await page.evaluate(() => window.__bloom && window.__bloom.frames);
  if (!(frames2 > frames1)) fail(`${name}: frames are not running (${frames1} -> ${frames2})`);
  const state = await page.evaluate(() => window.__bloom && window.__bloom.state);
  if (state !== 'playing') fail(`${name}: expected state playing, got ${state}`);
  const blank = await page.evaluate(() => {
    const c = document.getElementById('game');
    const g = c.getContext('2d');
    const d = g.getImageData(0, 0, c.width, c.height).data;
    const r0 = d[0], g0 = d[1], b0 = d[2];
    for (let i = 0; i < d.length; i += 4 * 97) {
      if (d[i] !== r0 || d[i + 1] !== g0 || d[i + 2] !== b0) return false;
    }
    return true;
  });
  if (blank) fail(`${name}: canvas is blank`);
  const sideways = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  if (sideways) fail(`${name}: page scrolls sideways`);
  await ctx.close();
}

await run('desktop', { viewport: { width: 1280, height: 800 } }, async (page) => {
  await page.locator('#startBtn').click();
  await page.mouse.move(900, 300);
  await page.mouse.down();
  for (const k of ['w', 'a', 's', 'd']) {
    await page.keyboard.down(k);
    await page.waitForTimeout(150);
    await page.keyboard.up(k);
  }
  await page.mouse.up();
  // 500-bullet stress run through the pools
  const stress = await page.evaluate(() => window.__bloom.stress(500));
  if (stress < 500) fail(`desktop: pool held only ${stress} bullets`);
  await page.waitForTimeout(400);
  // Reduced motion: shake (trauma) and hit-stop must stay at 0; off again, they work.
  const rm = await page.evaluate(async () => {
    const m = await import('/src/game.js');
    m.setReducedMotion(true); m.addTrauma(1); m.hitStop(0.5);
    const off = { trauma: m.game.trauma, stop: m.game.hitStop };
    m.setReducedMotion(false); m.addTrauma(0.5);
    const on = m.game.trauma;
    return { off, on, mult: m.game.mult, hp: m.game.player.hp, score: m.game.score };
  });
  if (rm.off.trauma !== 0 || rm.off.stop !== 0) fail(`desktop: reduced motion left trauma ${rm.off.trauma} / hit-stop ${rm.off.stop}`);
  if (!(rm.on > 0)) fail('desktop: trauma does not rise with reduced motion off');
  if (!(rm.mult >= 1) || !(rm.hp > 0) || typeof rm.score !== 'number') fail(`desktop: bad score/multiplier/health ${JSON.stringify(rm)}`);
  await page.keyboard.press('p');
  const paused = await page.evaluate(() => window.__bloom.state);
  if (paused !== 'paused') fail(`desktop: P did not pause (state ${paused})`);
  await page.keyboard.press('p');
});

// Review fixes: full stick deflection past the rim; a death on the last wave is never a win.
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  page.on('pageerror', (e) => fail(`review: uncaught error: ${e.message}`));
  await page.goto(`http://localhost:${port}/`);
  await page.locator('canvas#game').waitFor();
  await page.locator('#startBtn').click();
  const r = await page.evaluate(async () => {
    const inp = await import('/src/input.js');
    const s = { x: 200, y: 0, ox: 0, oy: 0 };
    inp.stickVector(s, 'move');
    const stick = Math.hypot(inp.input.moveX, inp.input.moveY);
    const m = await import('/src/game.js');
    const sim = await import('/src/sim.js');
    const g = m.game;
    g.state = 'playing'; g.wave = 20; g.queueIndex = g.queue.length;
    g.enemies.releaseAll(); g.player.hp = 0;
    sim.updateWaves(0.01);
    return { stick, state: g.state };
  });
  if (Math.abs(r.stick - 1) > 0.01) fail(`review: stick dragged past the rim gives speed ${r.stick}, expected 1`);
  if (r.state === 'won') fail('review: dying on wave 20 while the last enemy dies shows a win');
  await ctx.close();
}

// High score survives a reload (saved in localStorage).
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`http://localhost:${port}/`);
  await page.locator('canvas#game').waitFor();
  await page.evaluate(() => localStorage.setItem('staticBloom.highScore', '4321'));
  await page.reload();
  await page.locator('canvas#game').waitFor();
  const hi = await page.evaluate(async () => (await import('/src/game.js')).game.highScore);
  if (hi !== 4321) fail(`reload: high score not kept (got ${hi})`);
  await ctx.close();
}

await run('phone', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }, async (page) => {
  await page.locator('#startBtn').tap();
  const cdp = await page.context().newCDPSession(page);
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts });
  await touch('touchStart', [{ x: 80, y: 700, id: 1 }, { x: 310, y: 700, id: 2 }]);
  await touch('touchMove', [{ x: 120, y: 660, id: 1 }, { x: 350, y: 660, id: 2 }]);
  await page.waitForTimeout(400);
  await touch('touchEnd', []);
});

await browser.close();
server.close();
if (failures.length) {
  console.log(`${failures.length} failure(s)`);
  process.exit(1);
}
console.log('Browser smoke test passed');
