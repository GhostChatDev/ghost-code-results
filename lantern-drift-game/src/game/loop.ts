import { MAX_FRAME, MAX_STEPS, STEP } from "./constants";
import { EMPTY_INPUT } from "./types";
import type { InputState } from "./types";
import type { Simulation } from "./simulation";

export class FixedStepDriver {
  private accumulator = 0;
  private lastTime: number | null = null;

  advance(nowMs: number, simulation: Simulation, input: InputState): number {
    if (this.lastTime === null) { this.lastTime = nowMs; return 0; }
    const frame = Math.min(MAX_FRAME, Math.max(0, (nowMs - this.lastTime) / 1000));
    this.lastTime = nowMs;
    this.accumulator += frame;
    let steps = 0;
    while (this.accumulator >= STEP && steps < MAX_STEPS) {
      simulation.step(STEP, { ...input, jumpPressed: steps === 0 && input.jumpPressed });
      this.accumulator -= STEP;
      steps += 1;
      if (simulation.status === "complete") { this.accumulator = 0; break; }
    }
    // Avoid an ever-growing backlog on devices that cannot sustain the simulation.
    if (steps === MAX_STEPS) this.accumulator = Math.min(this.accumulator, STEP);
    return steps;
  }

  reset(): void { this.lastTime = null; this.accumulator = 0; }
}

export const neutralInput = (): InputState => ({ ...EMPTY_INPUT });
