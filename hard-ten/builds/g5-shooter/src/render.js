// Drawing: arena, entities, HUD, touch sticks. Reads state only.
import { game, HUE } from './game.js';
import { input, STICK_RADIUS } from './input.js';
import { TOTAL_WAVES } from './waves.js';

export const view = { scale: 1, ox: 0, oy: 0, dpr: 1, cssW: 0, cssH: 0 };

export function resize(canvas) {
  const w = window.innerWidth, h = window.innerHeight;
  view.dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(w * view.dpr); canvas.height = Math.round(h * view.dpr);
  canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
  view.cssW = w; view.cssH = h;
  // short side of the screen is 600 world units; the arena is stretched to the long side
  const short = Math.min(w, h);
  view.scale = short / 600;
  game.W = Math.round(w / view.scale); game.H = Math.round(h / view.scale);
  view.ox = 0; view.oy = 0;
}

export function screenToWorld(sx, sy, out) {
  out.x = sx / view.scale; out.y = sy / view.scale;
}

const HUE_PICK = { heal: 120, rapid: 50, spread: 190 };
const LABEL = { heal: '+', rapid: 'R', spread: 'S' };

function drawGrid(g) {
  g.strokeStyle = 'rgba(120,90,255,0.08)'; g.lineWidth = 1;
  g.beginPath();
  for (let x = 0; x <= game.W; x += 50) { g.moveTo(x, 0); g.lineTo(x, game.H); }
  for (let y = 0; y <= game.H; y += 50) { g.moveTo(0, y); g.lineTo(game.W, y); }
  g.stroke();
  g.strokeStyle = 'rgba(255,80,200,0.35)'; g.lineWidth = 3;
  g.strokeRect(1.5, 1.5, game.W - 3, game.H - 3);
}

function drawEnemy(g, e) {
  const col = e.flash > 0 ? '#fff' : `hsl(${HUE[e.kind]},90%,60%)`;
  g.fillStyle = col; g.strokeStyle = col; g.lineWidth = 2;
  g.save(); g.translate(e.x, e.y); g.rotate(e.facing);
  g.beginPath();
  if (e.kind === 'chaser' || e.kind === 'minion') {
    g.moveTo(e.r, 0); g.lineTo(-e.r, e.r * 0.8); g.lineTo(-e.r * 0.5, 0); g.lineTo(-e.r, -e.r * 0.8); g.closePath(); g.fill();
  } else if (e.kind === 'shooter') {
    g.rect(-e.r * 0.8, -e.r * 0.8, e.r * 1.6, e.r * 1.6); g.stroke();
    g.fillRect(0, -3, e.r + 4, 6);
  } else if (e.kind === 'splitter') {
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 + game.time; g.lineTo(Math.cos(a) * e.r, Math.sin(a) * e.r); }
    g.closePath(); g.stroke();
    g.beginPath(); g.arc(0, 0, e.r * 0.4, 0, Math.PI * 2); g.fill();
  } else if (e.kind === 'shielded') {
    g.arc(0, 0, e.r * 0.7, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.lineWidth = 5; g.strokeStyle = '#bfe4ff';
    g.arc(0, 0, e.r + 4, -Math.PI / 3, Math.PI / 3); g.stroke();
  } else {
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + e.spin; const rr = i % 2 ? e.r * 0.65 : e.r;
      g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    g.closePath(); g.globalAlpha = 0.85; g.fill(); g.globalAlpha = 1;
  }
  g.restore();
  if (e.hp < e.maxHp && e.kind !== 'boss') {
    g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(e.x - e.r, e.y - e.r - 7, e.r * 2, 3);
    g.fillStyle = '#fff'; g.fillRect(e.x - e.r, e.y - e.r - 7, (e.r * 2 * e.hp) / e.maxHp, 3);
  }
}

function drawWorld(g) {
  const p = game.player;
  const pk = game.pickups.items;
  for (let i = 0; i < pk.length; i++) {
    const k = pk[i]; if (!k.alive) continue;
    if (k.life < 3 && ((k.life * 8) | 0) % 2) continue;
    const bob = Math.sin(k.t * 5) * 2;
    g.fillStyle = `hsl(${HUE_PICK[k.type]},90%,55%)`;
    g.beginPath(); g.arc(k.x, k.y + bob, 10, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#0b0618'; g.font = 'bold 13px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(LABEL[k.type], k.x, k.y + bob + 1);
  }
  const en = game.enemies.items;
  for (let i = 0; i < en.length; i++) if (en[i].alive) drawEnemy(g, en[i]);
  if (game.state !== 'over' && !(p.invuln > 0 && ((p.invuln * 12) | 0) % 2)) {
    g.save(); g.translate(p.x, p.y); g.rotate(p.aim);
    g.fillStyle = '#7ff9ff'; g.beginPath();
    g.moveTo(p.r + 5, 0); g.lineTo(-p.r, p.r); g.lineTo(-p.r * 0.4, 0); g.lineTo(-p.r, -p.r); g.closePath(); g.fill();
    g.restore();
  }
  const bl = game.bullets.items;
  g.fillStyle = '#ff6b9a'; g.beginPath();
  for (let i = 0; i < bl.length; i++) { const b = bl[i]; if (b.alive && b.enemy) { g.moveTo(b.x + b.r, b.y); g.arc(b.x, b.y, b.r, 0, Math.PI * 2); } }
  g.fill();
  g.strokeStyle = '#eaffff'; g.lineWidth = 3; g.lineCap = 'round'; g.beginPath();
  for (let i = 0; i < bl.length; i++) { const b = bl[i]; if (b.alive && !b.enemy) { g.moveTo(b.x - b.vx * 0.012, b.y - b.vy * 0.012); g.lineTo(b.x, b.y); } }
  g.stroke();
  const pa = game.particles.items;
  for (let i = 0; i < pa.length; i++) {
    const q = pa[i]; if (!q.alive) continue;
    g.globalAlpha = q.life / q.max; g.fillStyle = `hsl(${q.hue},95%,65%)`;
    g.fillRect(q.x - q.size / 2, q.y - q.size / 2, q.size, q.size);
  }
  g.globalAlpha = 1;
}

function drawHud(g) {
  const p = game.player;
  const W = view.cssW;
  g.textBaseline = 'top'; g.textAlign = 'left';
  g.fillStyle = 'rgba(255,255,255,0.15)'; g.fillRect(12, 12, 160, 10);
  g.fillStyle = p.hp > 30 ? '#6dff9b' : '#ff5470'; g.fillRect(12, 12, (160 * p.hp) / p.maxHp, 10);
  g.fillStyle = '#e8e0ff'; g.font = '600 14px system-ui, sans-serif';
  g.fillText(`WAVE ${Math.max(1, game.wave)}/${TOTAL_WAVES}`, 12, 28);
  let fx = 12;
  if (p.rapid > 0) { g.fillStyle = '#ffd34d'; g.fillText(`RAPID ${p.rapid.toFixed(0)}`, fx, 46); fx += 80; }
  if (p.spread > 0) { g.fillStyle = '#4de1ff'; g.fillText(`SPREAD ${p.spread.toFixed(0)}`, fx, 46); }
  g.textAlign = 'right'; g.fillStyle = '#fff'; g.font = '700 20px system-ui, sans-serif';
  g.fillText(String(game.score), W - 64, 12);
  g.font = '600 13px system-ui, sans-serif'; g.fillStyle = game.mult > 1 ? '#ff7ad9' : '#9d93c0';
  g.fillText(`x${game.mult.toFixed(1)}   HI ${game.highScore}`, W - 64, 36);
  // boss bar
  const en = game.enemies.items;
  for (let i = 0; i < en.length; i++) {
    const e = en[i];
    if (!e.alive || e.kind !== 'boss') continue;
    const bw = Math.min(420, W - 40), bx = (W - bw) / 2, by = view.cssH - 24;
    g.fillStyle = 'rgba(255,255,255,0.15)'; g.fillRect(bx, by, bw, 8);
    g.fillStyle = '#ff3b5c'; g.fillRect(bx, by, (bw * e.hp) / e.maxHp, 8);
  }
  if (game.bannerTimer > 0) {
    g.globalAlpha = Math.min(1, game.bannerTimer);
    g.textAlign = 'center'; g.fillStyle = '#fff'; g.font = '800 34px system-ui, sans-serif';
    g.fillText(game.banner, W / 2, view.cssH * 0.3);
    g.globalAlpha = 1;
  }
}

function drawStick(g, s, label) {
  if (s.id === -1) return;
  g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 2;
  g.beginPath(); g.arc(s.ox, s.oy, STICK_RADIUS, 0, Math.PI * 2); g.stroke();
  g.fillStyle = label === 'aim' ? 'rgba(255,120,200,0.55)' : 'rgba(120,250,255,0.5)';
  g.beginPath(); g.arc(s.x, s.y, 26, 0, Math.PI * 2); g.fill();
}

function drawStickHints(g) {
  if (!input.touchMode || game.state !== 'playing') return;
  g.fillStyle = 'rgba(255,255,255,0.18)'; g.font = '600 12px system-ui, sans-serif'; g.textAlign = 'center';
  g.textBaseline = 'bottom';
  if (input.left.id === -1) g.fillText('MOVE', view.cssW * 0.25, view.cssH - 40);
  if (input.right.id === -1) g.fillText('AIM + FIRE', view.cssW * 0.75, view.cssH - 40);
}

export function draw(g) {
  const s = view.scale * view.dpr;
  g.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
  g.fillStyle = '#0b0618'; g.fillRect(0, 0, view.cssW, view.cssH);
  let sx = 0, sy = 0, rot = 0;
  if (!game.reducedMotion && game.trauma > 0) {
    // shake grows with trauma squared; smooth pseudo-noise from sines (no allocation)
    const k = game.trauma * game.trauma, t = game.time * 40;
    sx = 14 * k * Math.sin(t * 1.3 + 0.5) * Math.cos(t * 0.7);
    sy = 14 * k * Math.sin(t * 1.1 + 2.1) * Math.cos(t * 0.9 + 1);
    rot = 0.03 * k * Math.sin(t * 0.8 + 4);
  }
  g.setTransform(s, 0, 0, s, 0, 0);
  g.translate(game.W / 2 + sx, game.H / 2 + sy); g.rotate(rot); g.translate(-game.W / 2, -game.H / 2);
  drawGrid(g);
  drawWorld(g);
  g.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
  if (game.state !== 'menu') drawHud(g);
  drawStick(g, input.left, 'move');
  drawStick(g, input.right, 'aim');
  drawStickHints(g);
}
