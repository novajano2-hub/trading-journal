import { isValidTimeZone } from '@/domain/time';
import type { UserPrefs } from '@/domain/types';
import { defaultPrefs, type PrefsRepo } from '../repository';
import type { LocalContext } from './context';
import { META } from './db';

/** Stores only the prefs the user set, so the rest keep following `defaultPrefs()` (e.g. the browser zone). */
export function localPrefs(ctx: LocalContext): PrefsRepo {
  return {
    async get() {
      const db = await ctx.db();
      return withDefaults((await db.meta.get(META.prefs))?.value);
    },

    async update(patch) {
      const changes = definedOnly(patch);
      validate(changes);
      const db = await ctx.db();
      let stored: Partial<UserPrefs> = {};
      await db.transaction('rw', db.meta, async () => {
        stored = {
          ...asPartial((await db.meta.get(META.prefs))?.value),
          ...changes,
        };
        await db.meta.put({ key: META.prefs, value: stored });
      });
      return withDefaults(stored);
    },
  };
}

function validate(p: Partial<UserPrefs>): void {
  if (p.timeZone !== undefined && !isValidTimeZone(p.timeZone))
    throw new RangeError(`Unknown time zone "${p.timeZone}"`);
  const range = p.breakevenRange;
  // Written as !(from <= to) so NaN bounds are refused too.
  if (range && !(range.from <= range.to))
    throw new RangeError(
      `Breakeven range must run low to high, got ${range.from} to ${range.to}`,
    );
}

const asPartial = (value: unknown): Partial<UserPrefs> =>
  typeof value === 'object' && value !== null
    ? (value as Partial<UserPrefs>)
    : {};

const withDefaults = (stored: unknown): UserPrefs => ({
  ...defaultPrefs(),
  ...asPartial(stored),
});

/** A key set to undefined means "unchanged", not "erase". */
function definedOnly(patch: Partial<UserPrefs>): Partial<UserPrefs> {
  return Object.fromEntries(
    Object.entries(patch).filter(([, v]) => v !== undefined),
  ) as Partial<UserPrefs>;
}
