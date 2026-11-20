import { describe, expect, it } from "vitest";
import { ProgressStore, SAVE_KEY, loadProgress } from "../src/game/progress";
import type { StorageLike } from "../src/game/progress";

class MemoryStorage implements StorageLike {
  values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

describe("saved progress", () => {
  it("saves unlocks, best times, fireflies and settings, then reloads", () => {
    const storage = new MemoryStorage();
    const store = new ProgressStore(storage);
    expect(store.complete("first", 1, 42.5, ["a", "b"])).toBe(true);
    expect(store.complete("first", 1, 51, ["c"])).toBe(false);
    store.settings(false, true);
    expect(storage.getItem(SAVE_KEY)).not.toBeNull();
    const restored = new ProgressStore(storage);
    expect(restored.data.unlocked).toBe(2);
    expect(restored.data.bestTimes.first).toBe(42.5);
    expect(restored.data.fireflies.first).toEqual(["a", "b", "c"]);
    expect(restored.data.sound).toBe(false);
    expect(restored.data.reducedMotion).toBe(true);
  });
  it("recovers from corrupt storage without crashing", () => {
    const storage = new MemoryStorage();
    storage.setItem(SAVE_KEY, "not JSON");
    expect(loadProgress(storage).unlocked).toBe(1);
  });
});
