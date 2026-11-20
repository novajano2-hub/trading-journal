/**
 * A copy of `base` with `patch` applied. `undefined` clears a key only when it is
 * listed in `clearable` (an optional field); on any other key it means "unchanged".
 */
export function mergePatch<T extends object>(
  base: T,
  patch: object,
  clearable: readonly string[] = [],
): T {
  const next: Record<string, unknown> = {
    ...(base as Record<string, unknown>),
  };
  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined) next[key] = value;
    else if (clearable.includes(key)) delete next[key];
  }
  return next as T;
}
