import { describe, expect, it } from "vitest";
import { parseLevel, validateLevel } from "../src/game/validation";
import { testLevel } from "./fixtures";

describe("level JSON", () => {
  it("loads and validates a well-formed level", () => {
    const result = parseLevel(JSON.stringify(testLevel()));
    expect(result.errors).toEqual([]);
    expect(result.level?.name).toBe("Test Roof");
  });
  it("returns useful errors for bad JSON instead of throwing", () => {
    const result = parseLevel("{not-json");
    expect(result.level).toBeNull();
    expect(result.errors[0]).toMatch(/^Invalid JSON:/);
  });
  it("rejects wrong rows, unknown tiles and bad entities", () => {
    const bad = { ...testLevel(), tiles: ["xxx"], enemies: [{ id: "bad", type: "dragon", x: 2, y: 2, minX: 9, maxX: 2 }] };
    const errors = validateLevel(bad);
    expect(errors.some((error) => error.includes("tiles"))).toBe(true);
    expect(errors).not.toHaveLength(0);
  });
  it("rejects duplicate ids", () => {
    const bad = { ...testLevel(), fireflies: [{ id: "candle", x: 2, y: 2 }] };
    expect(validateLevel(bad).join(" ")).toContain("Duplicate entity id");
  });
});
