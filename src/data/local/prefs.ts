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
/** K48. */
const USERNAME = /^[A-Za-z0-9._]{3,30}$/;
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
  validateDashboards(p.dashboards);
  if (
    p.sidebar !== undefined &&
    p.sidebar !== 'expanded' &&
    p.sidebar !== 'collapsed'
  )
    throw new RangeError(`Unknown sidebar state "${String(p.sidebar)}"`);
  if (
    p.propLayout !== undefined &&
    p.propLayout !== 'grid' &&
    p.propLayout !== 'list'
  )
    throw new RangeError(`Unknown prop layout "${String(p.propLayout)}"`);
  validatePropStart(p.propStart);
  for (const key of ['dayColumns', 'weekColumns', 'seenTips'] as const) {
    const list = p[key];
    if (
      list !== undefined &&
      !(Array.isArray(list) && list.every((k) => typeof k === 'string'))
    )
      throw new RangeError(`${key} must be a list of strings`);
  }
}

function validateDashboards(d: UserPrefs['dashboards']): void {
  if (d === undefined) return;
  const ok =
    typeof d === 'object' &&
    d !== null &&
    Array.isArray(d.templates) &&
    d.templates.length > 0 &&
    d.templates.every(
      (t) =>
        typeof t === 'object' &&
        t !== null &&
        typeof t.id === 'string' &&
        typeof t.name === 'string' &&
        t.name.length >= 1 &&
        t.name.length <= 40 &&
        Array.isArray(t.upper) &&
        t.upper.length <= 5 &&
        Array.isArray(t.lower),
    ) &&
    d.templates.some((t) => t.id === d.inUse);
  if (!ok)
    throw new RangeError(
      'Dashboards need one or more templates, each named 1 to 40 characters with at most 5 upper widgets, and inUse naming one',
    );
}

function validatePropStart(v: UserPrefs['propStart']): void {
  if (v === undefined) return;
  const ok =
    typeof v === 'object' &&
    v !== null &&
    Object.values(v).every(
      (e) =>
        typeof e === 'object' &&
        e !== null &&
        e.done === true &&
        (e.answer === undefined ||
          e.answer === 'own' ||
          e.answer === 'prop' ||
          e.answer === 'both'),
    );
  if (!ok)
    throw new RangeError(
      'propStart must map workspaces to { answer?: own | prop | both, done: true }',
    );
}

const asPartial = (value: unknown): Partial<UserPrefs> =>
  typeof value === 'object' && value !== null
    ? (value as Partial<UserPrefs>)
    : {};

/** A `goals` key left by an older version is ignored on read, and stays in storage. */
const withDefaults = (stored: unknown): UserPrefs => {
  const kept: Partial<UserPrefs> & { goals?: unknown } = {
    ...asPartial(stored),
  };
  delete kept.goals;
  return { ...defaultPrefs(), ...kept };
};

/** A key set to undefined means "unchanged", not "erase". */
function definedOnly(patch: Partial<UserPrefs>): Partial<UserPrefs> {
  return Object.fromEntries(
    Object.entries(patch).filter(([, v]) => v !== undefined),
  ) as Partial<UserPrefs>;
}
