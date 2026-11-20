import type { Level } from "./types";
import { parseLevel } from "./validation";

export const LEVEL_PATHS = [1, 2, 3, 4, 5].map((n) => `levels/${String(n).padStart(2, "0")}.json`);

export async function loadLevel(path: string): Promise<Level> {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Could not load ${path} (${response.status}).`);
  const result = parseLevel(await response.text());
  if (!result.level) throw new Error(result.errors.join("\n"));
  return result.level;
}

export async function loadLevels(onError?: (message: string) => void): Promise<Level[]> {
  const results = await Promise.all(LEVEL_PATHS.map(async (path) => {
    try { return await loadLevel(path); }
    catch (error) {
      onError?.(error instanceof Error ? error.message : String(error));
      return null;
    }
  }));
  return results.filter((level): level is Level => level !== null).sort((a, b) => a.order - b.order);
}
