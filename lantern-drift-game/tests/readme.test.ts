import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseLevel } from "../src/game/validation";

describe("README level-authoring example", () => {
  it("is valid level JSON that the game can load", () => {
    const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");
    const example = readme.match(/```json\n([\s\S]*?)\n```/);
    expect(example, "README contains a JSON example").not.toBeNull();

    const result = parseLevel(example![1]);
    expect(result.errors).toEqual([]);
    expect(result.level).not.toBeNull();
    const level = result.level!;
    expect(level).toMatchObject({
      version: 1,
      id: "starlit-spire",
      order: 6,
      width: 36,
      height: 12,
    });
    expect(level.tiles).toHaveLength(12);
    expect(level.platforms).toHaveLength(1);
    expect(level.enemies.map((enemy) => enemy.type)).toEqual(["moth", "gust"]);
  });
});
