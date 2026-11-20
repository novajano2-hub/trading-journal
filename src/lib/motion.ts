// Adapted from HorizonX engine/tokens.ts, commercial licence.
// Shared motion tokens. Use with `motion/react` in client leaves only.

export const EASING_POINTS = {
  out: [0.2, 0.8, 0.2, 1],
  in: [0.4, 0, 1, 1],
  inOut: [0.65, 0, 0.35, 1],
  /** Long settle for a selection moving between options (Beacon Tabs). */
  glide: [0.23, 1, 0.32, 1],
} as const satisfies Record<string, readonly [number, number, number, number]>;

/** Elements arriving: 240 ms, decelerating. */
export const enter = {
  duration: 0.24,
  ease: [...EASING_POINTS.out],
} as const;

/** Elements leaving: 160 ms, accelerating. */
export const exit = {
  duration: 0.16,
  ease: [...EASING_POINTS.in],
} as const;

/** A selection gliding to its new place: 320 ms, long settle. */
export const glide = {
  duration: 0.32,
  ease: [...EASING_POINTS.glide],
} as const;

/** Press feedback timings, seconds. */
export const press = { down: 0.18, up: 0.12, scale: 0.97 } as const;
