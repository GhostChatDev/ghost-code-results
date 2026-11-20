import { FLAME, PLAYER, approach, clamp } from "./constants";
import { moveBody, overlaps } from "./physics";
import type { Body, EnemyDef, EnemyKind, GameEvent, InputState, Level, PlatformDef, Rect } from "./types";

export interface MovingPlatform extends Rect {
  id: string;
  definition: PlatformDef;
  previousX: number;
  previousY: number;
}

export interface Enemy extends Body {
  id: string;
  type: EnemyKind;
  definition: EnemyDef;
}

export interface Snapshot {
  player: Body;
  platforms: MovingPlatform[];
  enemies: Enemy[];
  flame: number;
  floating: boolean;
  grounded: boolean;
  wind: number;
  collected: ReadonlySet<string>;
  checkpointReached: boolean;
  respawnPoint: { x: number; y: number };
  elapsed: number;
  deaths: number;
  status: "playing" | "respawning" | "complete";
  invulnerable: number;
}

const platformAt = (p: PlatformDef, time: number): { x: number; y: number } => {
  const travel = (Math.sin(time * p.speed + p.phase) + 1) * 0.5 * p.distance;
  return { x: p.x + (p.axis === "horizontal" ? travel : 0), y: p.y + (p.axis === "vertical" ? travel : 0) };
};

/** All gameplay runs in tile units and advances only by the caller's fixed dt. */
export class Simulation {
  player: Body;
  platforms: MovingPlatform[];
  enemies: Enemy[];
  flame: number = FLAME.max;
  floating = false;
  grounded = false;
  wind = 0;
  collected = new Set<string>();
  checkpointReached = false;
  respawnPoint: { x: number; y: number };
  elapsed = 0;
  deaths = 0;
  status: Snapshot["status"] = "playing";
  invulnerable = 0;
  events: GameEvent[] = [];
  private standingPlatform: string | null = null;
  private coyote = 0;
  private jumpBuffer = 0;
  private respawnTimer = 0;
  private candleSound = 0;
  private gustSound = 0;

  constructor(readonly level: Level) {
    this.respawnPoint = { ...level.spawn };
    this.player = { ...level.spawn, w: PLAYER.width, h: PLAYER.height, vx: 0, vy: 0 };
    this.platforms = level.platforms.map((definition) => {
      const at = platformAt(definition, 0);
      return { ...definition, ...at, previousX: at.x, previousY: at.y, definition };
    });
    this.enemies = level.enemies.map((definition) => ({
      ...definition, w: definition.type === "moth" ? 0.76 : 0.9,
      h: definition.type === "moth" ? 0.56 : 0.9, vx: 0, vy: 0, definition,
    }));
  }

  snapshot(): Snapshot {
    return {
      player: { ...this.player }, platforms: this.platforms, enemies: this.enemies,
      flame: this.flame, floating: this.floating, grounded: this.grounded, wind: this.wind,
      collected: this.collected, checkpointReached: this.checkpointReached,
      respawnPoint: { ...this.respawnPoint }, elapsed: this.elapsed, deaths: this.deaths,
      status: this.status, invulnerable: this.invulnerable,
    };
  }

  step(dt: number, input: InputState): void {
    if (this.status === "complete") return;
    this.elapsed += dt;
    this.invulnerable = Math.max(0, this.invulnerable - dt);
    this.candleSound = Math.max(0, this.candleSound - dt);
    this.gustSound = Math.max(0, this.gustSound - dt);
    if (this.status === "respawning") {
      this.respawnTimer -= dt;
      if (this.respawnTimer <= 0) this.respawn();
      return;
    }
    this.jumpBuffer = input.jumpPressed ? 0.12 : Math.max(0, this.jumpBuffer - dt);
    this.coyote = this.grounded ? 0.1 : Math.max(0, this.coyote - dt);
    if (this.jumpBuffer > 0 && this.coyote > 0) {
      this.player.vy = -PLAYER.jumpSpeed;
      this.grounded = false;
      this.standingPlatform = null;
      this.coyote = 0;
      this.jumpBuffer = 0;
      this.events.push("jump");
    }

    this.movePlatforms(dt);
    const direction = Number(input.right) - Number(input.left);
    const acceleration = this.grounded ? PLAYER.acceleration : PLAYER.airAcceleration;
    if (direction) this.player.vx = approach(this.player.vx, direction * PLAYER.runSpeed, acceleration * dt);
    else this.player.vx = approach(this.player.vx, 0, PLAYER.drag * dt);

    this.wind = 0;
    for (const zone of this.level.winds) if (overlaps(this.player, zone)) this.wind += zone.force;
    this.player.vx = clamp(this.player.vx + this.wind * dt, -13, 13);
    this.floating = !this.grounded && input.jump && this.player.vy > -4 && this.flame > 0;
    if (this.floating) this.flame = Math.max(0, this.flame - PLAYER.flameDrain * dt);
    const gravity = this.floating ? PLAYER.floatGravity : PLAYER.gravity;
    const maxFall = this.floating ? PLAYER.maxFloatFall : PLAYER.maxFall;
    this.player.vy = Math.min(maxFall, this.player.vy + gravity * dt);

    this.updateEnemies(dt);
    const result = moveBody(this.level, this.player, this.player.vx * dt, this.player.vy * dt, this.platforms);
    this.player = result.body;
    if (result.hitY === 1 && !this.grounded) this.events.push("land");
    this.grounded = result.hitY === 1;
    this.standingPlatform = result.platformId;
    this.collectAndInteract(dt);
    if (this.player.y > this.level.height + 1 || this.flame <= 0) this.extinguish();
  }

  private movePlatforms(dt: number): void {
    for (const p of this.platforms) {
      p.previousX = p.x;
      p.previousY = p.y;
      const next = platformAt(p.definition, this.elapsed);
      const dx = next.x - p.x;
      const dy = next.y - p.y;
      p.x = next.x;
      p.y = next.y;
      if (this.standingPlatform === p.id && (dx !== 0 || dy !== 0)) {
        this.player = moveBody(this.level, this.player, dx, dy).body;
      }
    }
    void dt;
  }

  private updateEnemies(dt: number): void {
    for (const enemy of this.enemies) {
      const d = enemy.definition;
      const span = d.maxX - d.minX;
      const oldX = enemy.x;
      if (enemy.type === "moth") {
        enemy.x = d.minX + (Math.sin(this.elapsed * 1.7 + d.y) + 1) * 0.5 * span;
        enemy.y = d.y + Math.sin(this.elapsed * 3 + d.x) * 0.24;
      } else {
        const near = Math.abs(this.player.x - d.x) < 5;
        const target = near ? clamp(this.player.x, d.minX, d.maxX) : d.x + Math.sin(this.elapsed) * Math.min(1, span / 2);
        enemy.x = approach(enemy.x, target, dt * 1.5);
        enemy.y = d.y + Math.sin(this.elapsed * 2.2 + d.x) * 0.35;
        const distance = Math.hypot(this.player.x - enemy.x, this.player.y - enemy.y);
        if (distance < 3.5 && distance > 0.1) {
          this.player.vx += ((this.player.x - enemy.x) / distance) * dt * 13;
          if (this.gustSound <= 0) { this.events.push("gust"); this.gustSound = 1.4; }
        }
      }
      enemy.vx = (enemy.x - oldX) / dt;
      if (overlaps(this.player, enemy)) this.hurt(enemy.x + enemy.w / 2);
    }
  }

  private hurt(sourceX: number): void {
    if (this.invulnerable > 0 || this.status !== "playing") return;
    this.flame = Math.max(0, this.flame - 0.24);
    this.player.vx = this.player.x < sourceX ? -7 : 7;
    this.player.vy = -5;
    this.invulnerable = FLAME.respawnInvulnerability;
    this.events.push("hurt");
  }

  private collectAndInteract(dt: number): void {
    for (const fly of this.level.fireflies) {
      if (!this.collected.has(fly.id) && overlaps(this.player, { x: fly.x - 0.25, y: fly.y - 0.25, w: 0.5, h: 0.5 })) {
        this.collected.add(fly.id);
        this.events.push("firefly");
      }
    }
    for (const candle of this.level.candles) {
      if (overlaps(this.player, { x: candle.x - 0.45, y: candle.y - 0.8, w: 0.9, h: 1.2 })) {
        this.flame = Math.min(FLAME.max, this.flame + PLAYER.candleRefill * dt);
        if (this.candleSound <= 0) { this.events.push("candle"); this.candleSound = 0.5; }
      }
    }
    if (!this.checkpointReached && overlaps(this.player, { ...this.level.checkpoint, w: 0.8, h: 1.4 })) {
      this.checkpointReached = true;
      this.respawnPoint = { ...this.level.checkpoint };
      this.events.push("checkpoint");
    }
    if (overlaps(this.player, this.level.exit)) {
      this.status = "complete";
      this.events.push("complete");
    }
  }

  private extinguish(): void {
    if (this.status !== "playing") return;
    this.status = "respawning";
    this.respawnTimer = 0.85;
    this.deaths += 1;
    this.floating = false;
    this.events.push("extinguish");
  }

  private respawn(): void {
    this.player = { ...this.respawnPoint, w: PLAYER.width, h: PLAYER.height, vx: 0, vy: 0 };
    this.flame = FLAME.max;
    this.invulnerable = FLAME.respawnInvulnerability;
    this.status = "playing";
    this.grounded = false;
    this.standingPlatform = null;
  }
}
