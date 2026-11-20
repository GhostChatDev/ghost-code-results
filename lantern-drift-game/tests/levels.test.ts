import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseLevel } from "../src/game/validation";

describe("handmade campaign", () => {
  for (let number = 1; number <= 5; number++) {
    it(`ships valid level ${number} with a checkpoint, pickups and exit`, () => {
      const file = `public/levels/${String(number).padStart(2, "0")}.json`;
      const result = parseLevel(readFileSync(file, "utf8"));
      expect(result.errors).toEqual([]);
      expect(result.level?.order).toBe(number);
      expect(result.level?.checkpoint).toBeDefined();
      expect(result.level?.fireflies.length).toBeGreaterThan(0);
      expect(result.level?.candles.length).toBeGreaterThan(0);
      expect(result.level?.exit).toBeDefined();
    });
  }
});
