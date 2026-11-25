import { USERNAME } from '../onboarding';
import { isValidTimeZone } from '@/domain/time';
import type {
  Appearance,
  CalendarStat,
  DisplayUnit,
  UserPrefs,
} from '@/domain/types';
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
const APPEARANCES: readonly Appearance[] = ['system', 'light', 'dark'];
const CALENDAR_STATS: readonly CalendarStat[] = [
  'net',
  'trades',
  'winRate',
  'rating',
  'r',
  'fees',
  'ticks',
  'pips',
  'points',
];

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

    async saved() {
      const db = await ctx.db();
      return asPartial((await db.meta.get(META.prefs))?.value);
    },

    async unset(keys) {
      const db = await ctx.db();
      let stored: Partial<UserPrefs> = {};
      await db.transaction('rw', db.meta, async () => {
        stored = { ...asPartial((await db.meta.get(META.prefs))?.value) };
        for (const key of keys) delete stored[key];
        await db.meta.put({ key: META.prefs, value: stored });
      });
      return withDefaults(stored);
    },
  };
}

export function validate(p: Partial<UserPrefs>): void {
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
  if (
    p.weekStart !== undefined &&
    p.weekStart !== 'sunday' &&
    p.weekStart !== 'monday'
  )
    throw new RangeError(`Unknown week start "${String(p.weekStart)}"`);
  if (
    p.appearance !== undefined &&
    !APPEARANCES.includes(p.appearance as Appearance)
  )
    throw new RangeError(`Unknown appearance "${String(p.appearance)}"`);
  const hidden = p.overviewHidden;
  if (
    hidden !== undefined &&
    !(Array.isArray(hidden) && hidden.every((k) => typeof k === 'string'))
  )
    throw new RangeError('Hidden Overview figures must be a list of keys');
  const stats = p.calendarStats;
  if (
    stats &&
    (stats.length === 0 ||
      new Set(stats).size !== stats.length ||
      !stats.every((x) => CALENDAR_STATS.includes(x)))
  )
    throw new RangeError(
      `Calendar stats must be one or more of ${CALENDAR_STATS.join(', ')}, each once, got ${stats.join(', ')}`,
    );
  if (p.username !== undefined && !USERNAME.test(p.username))
    throw new RangeError(
      'A username is 3 to 30 letters, digits, dots or underscores',
    );
  const ob = p.onboarding;
  if (
    ob !== undefined &&
    !(
      typeof ob === 'object' &&
      ob !== null &&
      ob.status === 'done' &&
      typeof ob.at === 'string' &&
      new Date(ob.at).toISOString() === ob.at
    )
  )
    throw new RangeError(
      'Onboarding must be { status: "done", at: <ISO time> }',
    );
  for (const key of ['dayColumns', 'weekColumns', 'seenTips'] as const) {
    const list = p[key];
    if (
      list !== undefined &&
      !(Array.isArray(list) && list.every((k) => typeof k === 'string'))
    )
      throw new RangeError(`${key} must be a list of strings`);
  }
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

export const asPartial = (value: unknown): Partial<UserPrefs> =>
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
