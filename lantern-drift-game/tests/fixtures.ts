import type { Level } from "../src/game/types";

export function testLevel(): Level {
  return {
    version: 1, id: "test-roof", order: 1, name: "Test Roof", subtitle: "A test fixture",
    width: 20, height: 12,
    tiles: Array.from({ length: 12 }, (_, y) => y >= 10 ? "#".repeat(20) : ".".repeat(20)),
    spawn: { x: 2, y: 9.14 }, checkpoint: { x: 10, y: 8.6 }, exit: { x: 18, y: 8, w: 1, h: 2 },
    candles: [{ id: "candle", x: 4, y: 10 }], fireflies: [{ id: "fly", x: 6, y: 9 }],
    winds: [], platforms: [], enemies: [],
  };
}
