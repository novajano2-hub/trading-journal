import { isValidTimeZone } from '@/domain/time';
import type { CalendarStat, DisplayUnit, UserPrefs } from '@/domain/types';
import { defaultPrefs, type PrefsRepo } from '../repository';
import type { LocalContext } from './context';
import type { KeelDb } from './db';
import { META } from './schema';

const DISPLAY_UNITS: readonly DisplayUnit[] = [
  'dollar',
  'percent',
  'privacy',
  'r',
  'ticks',
  'pips',
  'points',
];
const CALENDAR_STATS: readonly CalendarStat[] = [
  'net',
  'trades',
  'winRate',
  'r',
  'fees',
];
const MAX_CALENDAR_STATS = 3;

/** The prefs as stored, over the defaults. Works inside a transaction that includes `db.meta`. */
export async function readPrefs(db: KeelDb): Promise<UserPrefs> {
  return withDefaults((await db.meta.get(META.prefs))?.value);
}

/** Stores only the prefs the user set, so the rest keep following `defaultPrefs()` (e.g. the browser zone). */
export function localPrefs(ctx: LocalContext): PrefsRepo {
  return {
    async get() {
      return readPrefs(await ctx.db());
    },

    async update(patch) {
      const changes = definedOnly(patch);
      validate(changes);
      const db = await ctx.db();
      let stored: Partial<UserPrefs> = {};
      await db.transaction('rw', db.meta, async () => {
        const current = asPartial((await db.meta.get(META.prefs))?.value);
        stored = { ...current, ...changes };
        // Goals merge per workspace, so a stale caller can't clobber other workspaces' goals.
        if (changes.goals)
          stored.goals = { ...current.goals, ...changes.goals };
        validate({ goals: stored.goals });
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
  if (p.displayUnit !== undefined && !DISPLAY_UNITS.includes(p.displayUnit))
    throw new RangeError(`Unknown display unit "${p.displayUnit}"`);
  const stats = p.calendarStats;
  if (
    stats &&
    (stats.length === 0 ||
      stats.length > MAX_CALENDAR_STATS ||
      new Set(stats).size !== stats.length ||
      !stats.every((x) => CALENDAR_STATS.includes(x)))
  )
    throw new RangeError(
      `Calendar stats must be 1 to ${MAX_CALENDAR_STATS} of ${CALENDAR_STATS.join(', ')}, got ${stats.join(', ')}`,
    );
  for (const [id, g] of Object.entries(p.goals ?? {})) {
    if (typeof g !== 'object' || g === null)
      throw new RangeError(`Goals for workspace "${id}" must be an object`);
    for (const [field, cents] of Object.entries(g))
      if (cents !== undefined && !(Number.isSafeInteger(cents) && cents > 0))
        throw new RangeError(
          `Goal ${field} for workspace "${id}" must be a positive whole number of cents, got ${cents}`,
        );
  }
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
