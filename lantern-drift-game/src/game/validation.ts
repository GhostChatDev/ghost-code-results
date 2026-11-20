import type { Level, Point, Rect } from "./types";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const text = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;

function validPoint(value: unknown, label: string, level: Pick<Level, "width" | "height">, errors: string[]): value is Point {
  if (!isRecord(value) || !finite(value.x) || !finite(value.y)) {
    errors.push(`${label} needs finite x and y numbers.`);
    return false;
  }
  if (value.x < 0 || value.y < 0 || value.x >= level.width || value.y >= level.height) {
    errors.push(`${label} must be inside the level.`);
    return false;
  }
  return true;
}

function validRect(value: unknown, label: string, level: Pick<Level, "width" | "height">, errors: string[]): value is Rect {
  if (!validPoint(value, label, level, errors) || !isRecord(value) || !finite(value.w) || !finite(value.h)) {
    if (isRecord(value) && (!finite(value.w) || !finite(value.h))) errors.push(`${label} needs finite w and h numbers.`);
    return false;
  }
  if (value.w <= 0 || value.h <= 0 || value.x + value.w > level.width || value.y + value.h > level.height) {
    errors.push(`${label} must have a positive size and fit inside the level.`);
    return false;
  }
  return true;
}

/** Returns actionable errors. No untrusted object is cast to a playable level. */
export function validateLevel(value: unknown): string[] {
  if (!isRecord(value)) return ["The level must be a JSON object."];
  const errors: string[] = [];
  if (value.version !== 1) errors.push("The level version must be 1.");
  for (const key of ["id", "name", "subtitle"]) {
    if (!text(value[key])) errors.push(`${key} must be a non-empty string.`);
  }
  for (const key of ["order", "width", "height"]) {
    if (!Number.isInteger(value[key])) errors.push(`${key} must be an integer.`);
  }
  const width = Number(value.width);
  const height = Number(value.height);
  if (width < 16 || width > 160) errors.push("width must be between 16 and 160 tiles.");
  if (height < 10 || height > 24) errors.push("height must be between 10 and 24 tiles.");
  if (!Array.isArray(value.tiles) || value.tiles.length !== height || !value.tiles.every((row) => typeof row === "string" && row.length === width && /^[.#]+$/.test(row))) {
    errors.push(`tiles must contain exactly ${height} rows of ${width} characters, using only . and #.`);
    return errors;
  }
  const dimensions = { width, height };
  if (validPoint(value.spawn, "spawn", dimensions, errors)) {
    if (value.tiles[Math.floor(value.spawn.y)]?.[Math.floor(value.spawn.x)] === "#") errors.push("spawn cannot be inside a solid tile.");
  }
  validPoint(value.checkpoint, "checkpoint", dimensions, errors);
  validRect(value.exit, "exit", dimensions, errors);

  const arrays = ["candles", "fireflies", "winds", "platforms", "enemies"] as const;
  for (const key of arrays) if (!Array.isArray(value[key])) errors.push(`${key} must be an array.`);
  if (errors.some((error) => error.endsWith("must be an array."))) return errors;
  const candles = value.candles as unknown[];
  const fireflies = value.fireflies as unknown[];
  if (!candles.length) errors.push("Add at least one candle.");
  if (!fireflies.length) errors.push("Add at least one firefly.");
  candles.forEach((item, i) => {
    if (validPoint(item, `candles[${i}]`, dimensions, errors) && (!isRecord(item) || !text(item.id))) errors.push(`candles[${i}] needs an id.`);
  });
  fireflies.forEach((item, i) => {
    if (validPoint(item, `fireflies[${i}]`, dimensions, errors) && (!isRecord(item) || !text(item.id))) errors.push(`fireflies[${i}] needs an id.`);
  });
  (value.winds as unknown[]).forEach((item, i) => {
    if (validRect(item, `winds[${i}]`, dimensions, errors) && (!isRecord(item) || !text(item.id) || !finite(item.force) || Math.abs(item.force) > 20)) {
      errors.push(`winds[${i}] needs an id and force between -20 and 20.`);
    }
  });
  (value.platforms as unknown[]).forEach((item, i) => {
    const label = `platforms[${i}]`;
    if (!validRect(item, label, dimensions, errors) || !isRecord(item)) return;
    if (!text(item.id)) errors.push(`${label} needs an id.`);
    if (item.axis !== "horizontal" && item.axis !== "vertical") errors.push(`${label} has an invalid axis.`);
    for (const key of ["distance", "speed", "phase"]) {
      if (!finite(item[key])) errors.push(`${label} needs a finite ${key}.`);
    }
    if (finite(item.distance) && (item.distance < 0 || item.distance > 20)) errors.push(`${label} distance must be 0–20.`);
    if (finite(item.speed) && (item.speed <= 0 || item.speed > 8)) errors.push(`${label} speed must be above 0 and at most 8.`);
  });
  (value.enemies as unknown[]).forEach((item, i) => {
    const label = `enemies[${i}]`;
    if (!validPoint(item, label, dimensions, errors) || !isRecord(item)) return;
    if (!text(item.id)) errors.push(`${label} needs an id.`);
    if (item.type !== "moth" && item.type !== "gust") errors.push(`${label} must be a moth or gust.`);
    if (!finite(item.minX) || !finite(item.maxX) || item.minX < 0 || item.maxX > width || item.minX >= item.maxX) {
      errors.push(`${label} needs a patrol range with 0 ≤ minX < maxX ≤ width.`);
    }
  });

  const ids = new Set<string>();
  for (const key of arrays) {
    for (const item of value[key] as unknown[]) {
      if (!isRecord(item) || !text(item.id)) continue;
      if (ids.has(item.id)) errors.push(`Duplicate entity id: ${item.id}.`);
      ids.add(item.id);
    }
  }
  if (text(value.checkpoint) === false && isRecord(value.checkpoint) && finite(value.checkpoint.x) && finite(value.checkpoint.y)) {
    if (value.tiles[Math.floor(value.checkpoint.y)]?.[Math.floor(value.checkpoint.x)] === "#") errors.push("checkpoint cannot be inside a solid tile.");
  }
  return [...new Set(errors)];
}

export function parseLevel(source: string): { level: Level | null; errors: string[] } {
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch (error) {
    return { level: null, errors: [`Invalid JSON: ${error instanceof Error ? error.message : "could not parse file"}`] };
  }
  const errors = validateLevel(value);
  return errors.length ? { level: null, errors } : { level: value as Level, errors: [] };
}
