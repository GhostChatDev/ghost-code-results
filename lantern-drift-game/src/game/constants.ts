export const STEP = 1 / 120;
export const MAX_FRAME = 0.25;
export const MAX_STEPS = 30;
export const TILE_SIZE = 48;

export const PLAYER = {
  width: 0.58,
  height: 0.86,
  gravity: 28,
  floatGravity: 4.2,
  jumpSpeed: 10.8,
  runSpeed: 6.2,
  acceleration: 42,
  airAcceleration: 25,
  drag: 34,
  maxFall: 18,
  maxFloatFall: 2.15,
  flameDrain: 0.145,
  candleRefill: 0.9,
} as const;

export const FLAME = { max: 1, respawnInvulnerability: 1.2 } as const;
export const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));
export const approach = (value: number, target: number, amount: number) =>
  value < target ? Math.min(value + amount, target) : Math.max(value - amount, target);
