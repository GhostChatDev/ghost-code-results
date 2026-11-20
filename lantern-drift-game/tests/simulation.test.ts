import { describe, expect, it } from "vitest";
import { PLAYER, STEP } from "../src/game/constants";
import { Simulation } from "../src/game/simulation";
import type { InputState } from "../src/game/types";
import { testLevel } from "./fixtures";

const input = (jump = false): InputState => ({ left: false, right: false, jump, jumpPressed: jump });

describe("flame and checkpoints", () => {
  it("shrinks only while floating and refills on a candle", () => {
    const game = new Simulation(testLevel());
    game.grounded = false;
    game.player.vy = 1;
    const before = game.flame;
    game.step(STEP, { left: false, right: false, jump: true, jumpPressed: false });
    expect(game.flame).toBeLessThan(before);
    expect(game.flame).toBeCloseTo(before - PLAYER.flameDrain * STEP);
    game.player = { x: 4, y: 9.14, w: PLAYER.width, h: PLAYER.height, vx: 0, vy: 0 };
    game.grounded = true;
    game.flame = 0.5;
    const drained = game.flame;
    game.step(STEP, { left: false, right: false, jump: false, jumpPressed: false });
    expect(game.flame).toBeCloseTo(drained + PLAYER.candleRefill * STEP);
  });

  it("restarts at the last checkpoint and keeps collected fireflies", () => {
    const game = new Simulation(testLevel());
    game.collected.add("fly");
    game.checkpointReached = true;
    game.respawnPoint = { ...game.level.checkpoint };
    game.player.y = 20;
    game.step(STEP, { left: false, right: false, jump: false, jumpPressed: false });
    expect(game.status).toBe("respawning");
    for (let i = 0; i < 110; i++) game.step(STEP, input());
    expect(game.status).toBe("playing");
    expect(game.player.x).toBe(game.level.checkpoint.x);
    expect(game.flame).toBe(1);
    expect(game.collected.has("fly")).toBe(true);
  });

  it("does not float when the flame is empty", () => {
    const game = new Simulation(testLevel());
    game.grounded = false;
    game.flame = 0.001;
    game.player.vy = 2;
    game.step(0.02, input(true));
    expect(game.flame).toBe(0);
    expect(game.floating).toBe(false);
  });
});
