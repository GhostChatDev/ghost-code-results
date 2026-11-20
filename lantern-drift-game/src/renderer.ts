import { TILE_SIZE, clamp } from "./game/constants";
import type { Enemy, MovingPlatform, Snapshot } from "./game/simulation";
import type { Level, Rect } from "./game/types";

interface Camera { x: number; y: number; scale: number }
const TAU = Math.PI * 2;
const hash = (n: number) => { const x = Math.sin(n * 127.1) * 43758.5453; return x - Math.floor(x); };

/** Procedural paper-cut artwork. No textures, sprites or image downloads. */
export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private camera: Camera = { x: 0, y: 0, scale: TILE_SIZE };
  private width = 0;
  private height = 0;
  private time = 0;

  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("Canvas 2D is unavailable in this browser.");
    this.ctx = ctx;
    this.resize();
  }

  resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.width = Math.max(1, rect.width);
    this.height = Math.max(1, rect.height);
    this.canvas.width = Math.round(this.width * dpr);
    this.canvas.height = Math.round(this.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  render(level: Level, state: Snapshot, reducedMotion: boolean): void {
    const ctx = this.ctx;
    this.time = reducedMotion ? 0 : state.elapsed;
    const targetScale = this.width < 600 ? 39 : Math.min(58, this.width / 21);
    this.camera.scale = targetScale;
    const viewW = this.width / targetScale;
    const viewH = this.height / targetScale;
    const targetX = clamp(state.player.x + state.player.w / 2 - viewW * 0.38, 0, Math.max(0, level.width - viewW));
    const targetY = clamp(state.player.y - viewH * 0.48, 0, Math.max(0, level.height - viewH));
    this.camera.x = reducedMotion ? targetX : this.camera.x + (targetX - this.camera.x) * 0.1;
    this.camera.y = reducedMotion ? targetY : this.camera.y + (targetY - this.camera.y) * 0.1;

    this.sky(level.order);
    this.city(level, reducedMotion);
    ctx.save();
    ctx.scale(targetScale, targetScale);
    ctx.translate(-this.camera.x, -this.camera.y);
    this.winds(level);
    this.tiles(level);
    for (const p of state.platforms) this.platform(p);
    this.checkpoint(level, state.checkpointReached);
    this.exit(level.exit);
    for (const candle of level.candles) this.candle(candle.x, candle.y);
    for (const fly of level.fireflies) {
      if (!state.collected.has(fly.id)) this.firefly(fly.x, fly.y, Number(fly.id.replace(/\D/g, "")) || 1);
    }
    for (const enemy of state.enemies) this.enemy(enemy);
    this.lantern(state);
    ctx.restore();
    if (state.status === "respawning") {
      ctx.fillStyle = "rgba(9,13,31,.58)";
      ctx.fillRect(0, 0, this.width, this.height);
      ctx.fillStyle = "#f6f0df";
      ctx.font = "22px Georgia";
      ctx.textAlign = "center";
      ctx.fillText("A spark remains…", this.width / 2, this.height / 2);
    }
  }

  private sky(order: number): void {
    const ctx = this.ctx;
    const gradient = ctx.createLinearGradient(0, 0, 0, this.height);
    gradient.addColorStop(0, ["#090d21", "#0a1028", "#100d25", "#071626", "#130c22"][order - 1] ?? "#090d21");
    gradient.addColorStop(1, "#26314c");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, this.width, this.height);
    for (let i = 0; i < 65; i++) {
      const x = hash(i) * this.width;
      const y = hash(i + 90) * this.height * 0.63;
      const alpha = 0.2 + hash(i + 180) * 0.65;
      ctx.fillStyle = `rgba(246,240,223,${alpha})`;
      ctx.fillRect(x, y, i % 7 === 0 ? 1.7 : 1, i % 7 === 0 ? 1.7 : 1);
    }
    const mx = this.width * 0.78, my = this.height * 0.2;
    ctx.fillStyle = "rgba(255,231,179,.07)";
    ctx.beginPath(); ctx.arc(mx, my, 58, 0, TAU); ctx.fill();
    ctx.fillStyle = "#f8e8c3";
    ctx.beginPath(); ctx.arc(mx, my, 23, 0, TAU); ctx.fill();
    ctx.fillStyle = "#151a30";
    ctx.beginPath(); ctx.arc(mx - 9, my - 7, 21, 0, TAU); ctx.fill();
  }

  private city(level: Level, reducedMotion: boolean): void {
    const ctx = this.ctx;
    for (let layer = 0; layer < 3; layer++) {
      const parallax = reducedMotion ? 0 : this.camera.x * (0.05 + layer * 0.1);
      const base = this.height * (0.64 + layer * 0.13);
      const color = ["#19223a", "#121a30", "#0c1226"][layer];
      ctx.fillStyle = color;
      for (let i = -1; i < Math.ceil(this.width / 90) + 2; i++) {
        const world = i + Math.floor(parallax / 90);
        const x = i * 90 - (parallax % 90);
        const w = 55 + hash(world + layer * 77) * 55;
        const h = 45 + hash(world + 9 + layer * 51) * this.height * 0.26;
        ctx.fillRect(x, base - h, w, this.height - base + h);
        if (layer === 2) {
          ctx.fillStyle = "rgba(255,198,109,.16)";
          for (let wy = base - h + 18; wy < base - 8; wy += 25) {
            for (let wx = x + 12; wx < x + w - 8; wx += 23) {
              if (hash(wx * 3 + wy + level.order) > 0.54) ctx.fillRect(wx, wy, 5, 9);
            }
          }
          ctx.fillStyle = color;
        }
      }
    }
  }

  private winds(level: Level): void {
    const ctx = this.ctx;
    for (const zone of level.winds) {
      ctx.fillStyle = "rgba(139,217,221,.035)";
      ctx.fillRect(zone.x, zone.y, zone.w, zone.h);
      ctx.strokeStyle = "rgba(139,217,221,.23)";
      ctx.lineWidth = 0.035;
      for (let i = 0; i < Math.floor(zone.w / 2); i++) {
        const direction = Math.sign(zone.force);
        const x = zone.x + ((i * 2.7 + this.time * Math.abs(zone.force) * 0.22) % zone.w);
        const y = zone.y + 0.7 + hash(i + zone.x) * Math.max(0.3, zone.h - 1.4);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.bezierCurveTo(x + direction * 0.4, y - 0.16, x + direction * 0.65, y + 0.16, x + direction * 1.1, y);
        ctx.stroke();
      }
    }
  }

  private tiles(level: Level): void {
    const ctx = this.ctx;
    const startX = Math.max(0, Math.floor(this.camera.x) - 1);
    const endX = Math.min(level.width, Math.ceil(this.camera.x + this.width / this.camera.scale) + 1);
    for (let y = 0; y < level.height; y++) {
      for (let x = startX; x < endX; x++) {
        if (level.tiles[y]?.[x] !== "#") continue;
        ctx.fillStyle = "#11182c";
        ctx.fillRect(x, y, 1.02, 1.02);
        if (level.tiles[y - 1]?.[x] !== "#") {
          ctx.fillStyle = "#35405a";
          ctx.fillRect(x, y, 1, 0.1);
          ctx.fillStyle = "#8a7890";
          ctx.fillRect(x + 0.08, y - 0.035, 0.84, 0.035);
        }
        ctx.strokeStyle = "rgba(88,103,137,.12)";
        ctx.lineWidth = 0.018;
        ctx.strokeRect(x + 0.06, y + 0.14, 0.88, 0.75);
      }
    }
  }

  private platform(p: MovingPlatform): void {
    const ctx = this.ctx;
    ctx.fillStyle = "#39445c";
    ctx.fillRect(p.x, p.y, p.w, 0.13);
    ctx.fillStyle = "#171e34";
    ctx.fillRect(p.x + 0.06, p.y + 0.13, p.w - 0.12, p.h - 0.13);
    ctx.strokeStyle = "#9a856f";
    ctx.lineWidth = 0.035;
    for (let x = p.x + 0.2; x < p.x + p.w; x += 0.45) {
      ctx.beginPath(); ctx.moveTo(x, p.y + 0.16); ctx.lineTo(x - 0.15, p.y + p.h); ctx.stroke();
    }
    ctx.fillStyle = "#8bd9dd";
    ctx.fillRect(p.x + 0.12, p.y + 0.035, 0.12, 0.035);
    ctx.fillRect(p.x + p.w - 0.24, p.y + 0.035, 0.12, 0.035);
  }

  private candle(x: number, y: number): void {
    const ctx = this.ctx;
    this.glow(x, y - 0.35, 0.75, "255,198,109", 0.14);
    ctx.fillStyle = "#e5d5b6";
    ctx.fillRect(x - 0.12, y - 0.35, 0.24, 0.35);
    ctx.fillStyle = "#8a7890";
    ctx.fillRect(x - 0.17, y - 0.045, 0.34, 0.045);
    ctx.fillStyle = "#ffc66d";
    ctx.beginPath();
    ctx.ellipse(x, y - 0.46 + Math.sin(this.time * 6 + x) * 0.025, 0.065, 0.16, 0, 0, TAU);
    ctx.fill();
  }

  private firefly(x: number, y: number, seed: number): void {
    const ctx = this.ctx;
    const fx = x + Math.sin(this.time * 2 + seed) * 0.12;
    const fy = y + Math.cos(this.time * 2.6 + seed) * 0.14;
    this.glow(fx, fy, 0.38, "216,237,145", 0.3);
    ctx.fillStyle = "#edfac0";
    ctx.beginPath(); ctx.arc(fx, fy, 0.055, 0, TAU); ctx.fill();
    ctx.strokeStyle = "rgba(216,237,145,.45)";
    ctx.lineWidth = 0.02;
    ctx.beginPath(); ctx.moveTo(fx - 0.11, fy - 0.07); ctx.lineTo(fx - 0.02, fy); ctx.lineTo(fx + 0.1, fy - 0.08); ctx.stroke();
  }

  private checkpoint(level: Level, reached: boolean): void {
    const ctx = this.ctx, p = level.checkpoint;
    ctx.strokeStyle = reached ? "#ffc66d" : "#6e7892";
    ctx.lineWidth = 0.055;
    ctx.beginPath(); ctx.moveTo(p.x, p.y + 1); ctx.lineTo(p.x, p.y - 1.4); ctx.stroke();
    ctx.fillStyle = reached ? "#ffc66d" : "#526078";
    ctx.beginPath(); ctx.moveTo(p.x, p.y - 1.35); ctx.quadraticCurveTo(p.x + 0.8, p.y - 1.1, p.x + 0.72, p.y - 0.65); ctx.lineTo(p.x, p.y - 0.8); ctx.fill();
    if (reached) this.glow(p.x + 0.25, p.y - 1, 0.8, "255,198,109", 0.12);
  }

  private exit(exit: Rect): void {
    const ctx = this.ctx;
    const x = exit.x + exit.w / 2, y = exit.y + exit.h / 2;
    this.glow(x, y, 1.65, "255,198,109", 0.2);
    ctx.strokeStyle = "#e6b971";
    ctx.lineWidth = 0.06;
    ctx.beginPath(); ctx.moveTo(x, exit.y - 0.5); ctx.lineTo(x, exit.y + 0.25); ctx.stroke();
    ctx.fillStyle = "#bc744f";
    ctx.beginPath();
    ctx.moveTo(x - 0.42, y - 0.55); ctx.quadraticCurveTo(x, y - 0.82, x + 0.42, y - 0.55);
    ctx.lineTo(x + 0.32, y + 0.53); ctx.quadraticCurveTo(x, y + 0.7, x - 0.32, y + 0.53); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#ffdda0";
    ctx.fillRect(x - 0.29, y - 0.42, 0.58, 0.75);
    ctx.strokeStyle = "rgba(122,72,55,.5)";
    ctx.lineWidth = 0.025;
    for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(x + i * 0.18, y - 0.45); ctx.lineTo(x + i * 0.15, y + 0.4); ctx.stroke(); }
  }

  private enemy(enemy: Enemy): void {
    const ctx = this.ctx;
    const x = enemy.x + enemy.w / 2, y = enemy.y + enemy.h / 2;
    if (enemy.type === "moth") {
      const flap = 0.2 + Math.abs(Math.sin(this.time * 12 + enemy.x)) * 0.3;
      ctx.fillStyle = "rgba(194,181,204,.8)";
      ctx.beginPath(); ctx.ellipse(x - 0.23, y, 0.28, flap, -0.6, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.ellipse(x + 0.23, y, 0.28, flap, 0.6, 0, TAU); ctx.fill();
      ctx.fillStyle = "#493d58";
      ctx.beginPath(); ctx.ellipse(x, y, 0.1, 0.3, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = "#d8ed91"; ctx.lineWidth = 0.025;
      ctx.beginPath(); ctx.moveTo(x - 0.03, y - 0.24); ctx.quadraticCurveTo(x - 0.15, y - 0.5, x - 0.24, y - 0.42); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x + 0.03, y - 0.24); ctx.quadraticCurveTo(x + 0.15, y - 0.5, x + 0.24, y - 0.42); ctx.stroke();
    } else {
      this.glow(x, y, 0.9, "139,217,221", 0.1);
      ctx.strokeStyle = "rgba(139,217,221,.8)";
      ctx.lineWidth = 0.065;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.arc(x, y, 0.17 + i * 0.14, this.time * (i % 2 ? -1 : 1) + i, this.time * (i % 2 ? -1 : 1) + i + Math.PI * 1.45);
        ctx.stroke();
      }
      ctx.fillStyle = "#d4fbf4";
      ctx.beginPath(); ctx.arc(x - 0.11, y - 0.06, 0.045, 0, TAU); ctx.arc(x + 0.11, y - 0.06, 0.045, 0, TAU); ctx.fill();
    }
  }

  private lantern(state: Snapshot): void {
    const ctx = this.ctx, p = state.player;
    if (state.invulnerable > 0 && Math.floor(state.invulnerable * 12) % 2 === 0) return;
    const x = p.x + p.w / 2, y = p.y + p.h / 2;
    const lean = clamp(p.vx * 0.022, -0.22, 0.22);
    this.glow(x, y, 1.25 + state.flame * 0.8, "255,183,91", 0.12 + state.flame * 0.13);
    ctx.save(); ctx.translate(x, y); ctx.rotate(lean);
    ctx.strokeStyle = "#ad7653"; ctx.lineWidth = 0.035;
    ctx.beginPath(); ctx.moveTo(-0.17, -p.h / 2); ctx.quadraticCurveTo(0, -p.h / 2 - 0.3, 0.17, -p.h / 2); ctx.stroke();
    const gradient = ctx.createLinearGradient(0, -0.4, 0, 0.4);
    gradient.addColorStop(0, "#ffdfa0"); gradient.addColorStop(0.6, "#ffc16c"); gradient.addColorStop(1, "#d67d4b");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.moveTo(-p.w * 0.38, -p.h * 0.38);
    ctx.quadraticCurveTo(-p.w * 0.65, 0, -p.w * 0.36, p.h * 0.38);
    ctx.quadraticCurveTo(0, p.h * 0.52, p.w * 0.36, p.h * 0.38);
    ctx.quadraticCurveTo(p.w * 0.65, 0, p.w * 0.38, -p.h * 0.38);
    ctx.quadraticCurveTo(0, -p.h * 0.5, -p.w * 0.38, -p.h * 0.38); ctx.fill();
    ctx.strokeStyle = "rgba(139,78,51,.4)"; ctx.lineWidth = 0.018;
    for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(i * 0.15, -0.32); ctx.quadraticCurveTo(i * 0.21, 0, i * 0.13, 0.32); ctx.stroke(); }
    ctx.fillStyle = "#5d4350";
    ctx.fillRect(-0.19, -0.37, 0.38, 0.065); ctx.fillRect(-0.17, 0.32, 0.34, 0.055);
    ctx.fillStyle = "#633b35";
    ctx.beginPath(); ctx.arc(-0.09, -0.04, 0.025, 0, TAU); ctx.arc(0.09, -0.04, 0.025, 0, TAU); ctx.fill();
    if (state.floating) {
      ctx.strokeStyle = "rgba(255,225,169,.55)"; ctx.lineWidth = 0.025;
      ctx.beginPath(); ctx.moveTo(-0.12, 0.47); ctx.quadraticCurveTo(-0.25, 0.67, -0.1, 0.79); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0.1, 0.46); ctx.quadraticCurveTo(0.24, 0.61, 0.14, 0.72); ctx.stroke();
    }
    ctx.restore();
  }

  private glow(x: number, y: number, radius: number, color: string, alpha: number): void {
    const gradient = this.ctx.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, `rgba(${color},${alpha})`);
    gradient.addColorStop(1, `rgba(${color},0)`);
    this.ctx.fillStyle = gradient;
    this.ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }
}
