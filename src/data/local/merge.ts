/** A copy of `base` with `patch` applied; a key present with `undefined` removes the field. */
export function mergePatch<T extends object>(base: T, patch: object): T {
  const next: Record<string, unknown> = {
    ...(base as Record<string, unknown>),
  };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) delete next[key];
    else next[key] = value;
  }
  return next as T;
}
