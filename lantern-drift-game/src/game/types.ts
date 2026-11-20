export interface Point { x: number; y: number }
export interface Rect extends Point { w: number; h: number }
export interface Body extends Rect { vx: number; vy: number }

export interface Candle extends Point { id: string }
export interface Firefly extends Point { id: string }

export interface WindZone extends Rect {
  id: string;
  force: number;
}

export interface PlatformDef extends Rect {
  id: string;
  axis: "horizontal" | "vertical";
  distance: number;
  speed: number;
  phase: number;
}

export type EnemyKind = "moth" | "gust";
export interface EnemyDef extends Point {
  id: string;
  type: EnemyKind;
  minX: number;
  maxX: number;
}

export interface Level {
  version: 1;
  id: string;
  order: number;
  name: string;
  subtitle: string;
  width: number;
  height: number;
  tiles: string[];
  spawn: Point;
  checkpoint: Point;
  exit: Rect;
  candles: Candle[];
  fireflies: Firefly[];
  winds: WindZone[];
  platforms: PlatformDef[];
  enemies: EnemyDef[];
}

export interface InputState {
  left: boolean;
  right: boolean;
  jump: boolean;
  jumpPressed: boolean;
}

export type GameEvent =
  | "jump" | "land" | "firefly" | "candle" | "checkpoint"
  | "hurt" | "extinguish" | "complete" | "gust";

export const EMPTY_INPUT: Readonly<InputState> = {
  left: false, right: false, jump: false, jumpPressed: false,
};
