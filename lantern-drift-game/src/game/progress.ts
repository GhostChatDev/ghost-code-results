export const SAVE_KEY = "lantern-drift.progress.v1";
export const LEVEL_COUNT = 5;

export interface Progress {
  version: 1;
  unlocked: number;
  bestTimes: Record<string, number>;
  fireflies: Record<string, string[]>;
  sound: boolean;
  reducedMotion: boolean;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const defaultProgress = (): Progress => ({
  version: 1, unlocked: 1, bestTimes: {}, fireflies: {}, sound: true, reducedMotion: false,
});

const safeTimes = (value: unknown): Record<string, number> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, number] =>
    typeof entry[1] === "number" && Number.isFinite(entry[1]) && entry[1] >= 0));
};

const safeFlies = (value: unknown): Record<string, string[]> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  const result: Record<string, string[]> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (Array.isArray(entry)) result[key] = [...new Set(entry.filter((id): id is string => typeof id === "string"))];
  }
  return result;
};

export function loadProgress(storage: StorageLike | null): Progress {
  if (!storage) return defaultProgress();
  try {
    const raw = storage.getItem(SAVE_KEY);
    if (!raw) return defaultProgress();
    const data = JSON.parse(raw) as Partial<Progress>;
    if (data.version !== 1) return defaultProgress();
    return {
      version: 1,
      unlocked: Math.max(1, Math.min(LEVEL_COUNT, Math.floor(Number(data.unlocked) || 1))),
      bestTimes: safeTimes(data.bestTimes),
      fireflies: safeFlies(data.fireflies),
      sound: typeof data.sound === "boolean" ? data.sound : true,
      reducedMotion: typeof data.reducedMotion === "boolean" ? data.reducedMotion : false,
    };
  } catch {
    return defaultProgress();
  }
}

export class ProgressStore {
  data: Progress;
  constructor(private storage: StorageLike | null) {
    this.data = loadProgress(storage);
  }

  save(): void {
    try { this.storage?.setItem(SAVE_KEY, JSON.stringify(this.data)); } catch { /* Private mode can deny storage. */ }
  }

  complete(levelId: string, order: number, seconds: number, fireflyIds: string[]): boolean {
    const previous = this.data.bestTimes[levelId];
    const isBest = previous === undefined || seconds < previous;
    if (isBest) this.data.bestTimes[levelId] = seconds;
    this.data.fireflies[levelId] = [...new Set([...(this.data.fireflies[levelId] ?? []), ...fireflyIds])];
    this.data.unlocked = Math.max(this.data.unlocked, Math.min(LEVEL_COUNT, order + 1));
    this.save();
    return isBest;
  }

  settings(sound: boolean, reducedMotion: boolean): void {
    this.data.sound = sound;
    this.data.reducedMotion = reducedMotion;
    this.save();
  }
}

export const formatTime = (seconds: number): string => {
  const whole = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(whole / 60);
  const secs = whole % 60;
  const hundredths = Math.floor((seconds % 1) * 100);
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}.${String(hundredths).padStart(2, "0")}`;
};
