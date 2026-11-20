import { describe, expect, it } from "vitest";
import { moveBody } from "../src/game/physics";
import type { Level } from "../src/game/types";

const level = {
  width: 12, height: 12,
  tiles: Array.from({ length: 12 }, (_, y) => y === 10 ? "############" : "............"),
} as Level;
const body = { x: 4, y: 0, w: 0.58, h: 0.86, vx: 0, vy: 100 };

describe("swept tile collision", () => {
  it("never falls through a one-tile floor, even in one huge step", () => {
    const hit = moveBody(level, body, 0, 40);
    expect(hit.body.y + hit.body.h).toBeCloseTo(10);
    expect(hit.hitY).toBe(1);
    expect(hit.body.vy).toBe(0);
  });
  it("stops at a wall instead of tunnelling sideways", () => {
    const wall = { ...level, tiles: level.tiles.map((row, y) => y === 5 ? ".......#...." : row) };
    const hit = moveBody(wall, { ...body, y: 4.2 }, 20, 0);
    expect(hit.body.x + hit.body.w).toBeCloseTo(7);
    expect(hit.hitX).toBe(1);
  });
});
