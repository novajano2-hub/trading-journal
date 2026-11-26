import type {
  DashTemplate,
  UserPrefs,
  WidgetKey,
  WidgetRef,
  WidgetSettings,
} from '../types';
import { WIDGETS, type WidgetSection } from './widgets';

/** The upper strip holds at most five widgets (spec 5.1). */
export const UPPER_LIMIT = 5;

/**
 * The template a browser with no `dashboards` pref reads (C5): TradeZella's
 * default set of widgets, in the order of Keel's comp 01.
 */
export const DEFAULT_TEMPLATE: DashTemplate = {
  id: 'main',
  name: 'Main',
  upper: [
    { key: 'net-pnl' },
    { key: 'trade-win' },
    { key: 'profit-factor' },
    { key: 'day-win' },
    { key: 'win-loss-ratio' },
  ],
  lower: [
    { key: 'score' },
    { key: 'progress' },
    { key: 'cum-pnl' },
    { key: 'daily-pnl' },
    { key: 'recent' },
    { key: 'balance' },
    { key: 'calendar-adv' },
    { key: 'drawdown' },
    { key: 'trade-time' },
    { key: 'trade-duration' },
  ],
};

/** A ref and its settings, sharing nothing with the original. */
function copyRef(ref: WidgetRef): WidgetRef {
  if (!ref.settings) return { key: ref.key };
  const { metrics, ...rest } = ref.settings;
  const settings: WidgetSettings = { ...rest };
  if (metrics) settings.metrics = [...metrics];
  return { key: ref.key, settings };
}

/** The same template with one section replaced; the other keeps its refs as they are. */
function withSection(
  t: DashTemplate,
  section: WidgetSection,
  refs: WidgetRef[],
): DashTemplate {
  return { ...t, [section]: refs };
}

/**
 * The widget with `patch` merged into its settings. A setting patched to
 * undefined is cleared, and a widget left with none carries no `settings`.
 */
function withSettings(ref: WidgetRef, patch: WidgetSettings): WidgetRef {
  const settings: WidgetSettings = { ...copyRef(ref).settings, ...patch };
  for (const k of Object.keys(settings) as (keyof WidgetSettings)[])
    if (settings[k] === undefined) delete settings[k];
  return Object.keys(settings).length === 0
    ? { key: ref.key }
    : { key: ref.key, settings };
}

/**
 * The templates the user has and the one in use. No pref, or no templates in
 * it, reads the default; a pref naming a template that is gone reads the first.
 * Nothing is skipped: a key this build does not know stays on its template.
 */
export function templatesOf(prefs: Pick<UserPrefs, 'dashboards'>): {
  inUse: DashTemplate;
  all: DashTemplate[];
} {
  const d = prefs.dashboards;
  const first = d?.templates[0];
  if (!d || !first) return { inUse: DEFAULT_TEMPLATE, all: [DEFAULT_TEMPLATE] };
  return {
    inUse: d.templates.find((t) => t.id === d.inUse) ?? first,
    all: d.templates,
  };
}

/**
 * Adds a widget at the end of a section. A widget appears once per template
 * (C6), and the upper strip holds five: both throw, so the UI offers neither.
 */
export function addWidget(
  t: DashTemplate,
  section: WidgetSection,
  ref: WidgetRef,
): DashTemplate {
  if (section === 'upper' && t.upper.length >= UPPER_LIMIT) {
    throw new Error(`The upper strip holds at most ${UPPER_LIMIT} widgets`);
  }
  if ([...t.upper, ...t.lower].some((r) => r.key === ref.key)) {
    throw new Error(`The template already has the widget "${ref.key}"`);
  }
  return withSection(t, section, [...t[section], copyRef(ref)]);
}

/** Drops the widget at `index`; an index outside the section changes nothing. */
export function removeWidget(
  t: DashTemplate,
  section: WidgetSection,
  index: number,
): DashTemplate {
  if (!Number.isInteger(index) || index < 0 || index >= t[section].length) {
    return t;
  }
  return withSection(
    t,
    section,
    t[section].filter((_, i) => i !== index),
  );
}

/**
 * Moves the widget at `from` to the place `to`, the others closing up around
 * it. `to` is held to the section's ends; a `from` outside it changes nothing.
 */
export function moveWidget(
  t: DashTemplate,
  section: WidgetSection,
  from: number,
  to: number,
): DashTemplate {
  const refs = t[section];
  if (!Number.isInteger(from) || from < 0 || from >= refs.length) return t;
  const target = Math.min(Math.max(Math.trunc(to), 0), refs.length - 1);
  if (target === from) return t;
  const next = [...refs];
  const [moved] = next.splice(from, 1);
  if (!moved) return t;
  next.splice(target, 0, moved);
  return withSection(t, section, next);
}

/**
 * A new template starts as a copy of the one in use (C2), widgets and their
 * settings included. The caller picks `id` and keeps it unique among the user's
 * templates.
 */
export function newTemplate(
  from: DashTemplate,
  name: string,
  id: string,
): DashTemplate {
  return {
    id,
    name,
    upper: from.upper.map(copyRef),
    lower: from.lower.map(copyRef),
  };
}

/** The templates without `id`. The last one cannot go (C2): that throws. */
export function deleteTemplate(
  all: DashTemplate[],
  id: string,
): DashTemplate[] {
  const rest = all.filter((t) => t.id !== id);
  if (rest.length === 0) {
    throw new Error('The last template cannot be deleted');
  }
  return rest;
}

/** The picker's list: the section's widgets not yet on the template, in catalogue order. */
export function missingFrom(
  t: DashTemplate,
  section: WidgetSection,
): WidgetKey[] {
  const used = new Set([...t.upper, ...t.lower].map((r) => r.key));
  return (Object.keys(WIDGETS) as WidgetKey[]).filter(
    (k) => WIDGETS[k].section === section && !used.has(k),
  );
}

/**
 * The `dashboards` pref after a widget's settings change, on the template in
 * use: the patch merges into the settings the widget has there. With no pref
 * the default template is saved whole, with the change in it. A widget the
 * template in use does not hold changes nothing, and neither does any other
 * template. Nothing passed in is written through.
 */
export function setWidgetSettings(
  prefs: Pick<UserPrefs, 'dashboards'>,
  key: WidgetKey,
  patch: WidgetSettings,
): NonNullable<UserPrefs['dashboards']> {
  const { inUse, all } = templatesOf(prefs);
  // A section without the widget is the same list, so it is not rewritten.
  const merged = (refs: WidgetRef[]): WidgetRef[] =>
    refs.some((r) => r.key === key)
      ? refs.map((r) => (r.key === key ? withSettings(r, patch) : r))
      : refs;
  const next: DashTemplate = {
    ...inUse,
    upper: merged(inUse.upper),
    lower: merged(inUse.lower),
  };
  return {
    inUse: inUse.id,
    templates: all.map((t) => (t === inUse ? next : t)),
  };
}

type Dashboards = NonNullable<UserPrefs['dashboards']>;

/**
 * A widget's settings as one string for comparing: the settings that are set,
 * in key order, so the order they were written in does not matter and a key
 * only a newer build knows still counts.
 */
function settingsKey(ref: WidgetRef): string {
  const s: Record<string, unknown> = { ...ref.settings };
  return JSON.stringify(
    Object.keys(s)
      .filter((k) => s[k] !== undefined)
      .sort()
      .map((k) => [k, s[k]]),
  );
}

/** Whether two templates hold the same name, widgets, places and settings. */
export function sameTemplate(a: DashTemplate, b: DashTemplate): boolean {
  const same = (x: WidgetRef[], y: WidgetRef[]) =>
    x.length === y.length &&
    x.every(
      (r, i) => r.key === y[i]?.key && settingsKey(r) === settingsKey(y[i]!),
    );
  return (
    a.id === b.id &&
    a.name === b.name &&
    same(a.upper, b.upper) &&
    same(a.lower, b.lower)
  );
}

/**
 * The `dashboards` pref when `id` is picked. A template that is gone leaves
 * the one in use as it was; with no pref the default is saved, in use.
 */
export function withInUse(
  prefs: Pick<UserPrefs, 'dashboards'>,
  id: string,
): Dashboards {
  const { inUse, all } = templatesOf(prefs);
  return {
    inUse: all.some((t) => t.id === id) ? id : inUse.id,
    templates: all,
  };
}

/**
 * Thrown by `withSavedTemplate` when the stored template is no longer the one
 * the edit began from (C70): it was saved or deleted somewhere else.
 */
export class TemplateChangedError extends Error {
  constructor() {
    super('The template was changed somewhere else since the edit began');
    this.name = 'TemplateChangedError';
  }
}

/**
 * The `dashboards` pref after saving `draft`, which began as `base`: the
 * template takes its place in the list (at the end, if it is gone), and is
 * put in use. If the stored template is no longer `base` that throws
 * `TemplateChangedError`, unless `overwrite` says to replace it anyway. With no
 * pref the default is what is edited, and is saved whole.
 */
export function withSavedTemplate(
  prefs: Pick<UserPrefs, 'dashboards'>,
  draft: DashTemplate,
  base: DashTemplate,
  opts: { overwrite?: boolean } = {},
): Dashboards {
  const { all } = templatesOf(prefs);
  const stored = all.find((t) => t.id === draft.id);
  if (!opts.overwrite && !(stored && sameTemplate(stored, base)))
    throw new TemplateChangedError();
  return {
    inUse: draft.id,
    templates: stored
      ? all.map((t) => (t === stored ? draft : t))
      : [...all, draft],
  };
}

/**
 * The `dashboards` pref after Delete template. When the template in use goes,
 * the first one left takes its place; the last template cannot go (that
 * throws). A template that is gone already changes nothing.
 */
export function withoutTemplate(
  prefs: Pick<UserPrefs, 'dashboards'>,
  id: string,
): Dashboards {
  const { inUse, all } = templatesOf(prefs);
  if (!all.some((t) => t.id === id)) return { inUse: inUse.id, templates: all };
  const rest = deleteTemplate(all, id);
  return {
    inUse: inUse.id === id ? rest[0]!.id : inUse.id,
    templates: rest,
  };
}

/**
 * The `dashboards` pref after New template (C2): a copy of the template in
 * use under `name`, last in the list and in use. Its id comes from `makeId`,
 * asked again while it is one the user already has.
 */
export function withNewTemplate(
  prefs: Pick<UserPrefs, 'dashboards'>,
  name: string,
  makeId: () => string = () => crypto.randomUUID(),
): { dashboards: Dashboards; created: DashTemplate } {
  const { inUse, all } = templatesOf(prefs);
  let id = makeId();
  for (let tries = 0; all.some((t) => t.id === id); tries++) {
    if (tries >= 50) throw new Error('No unused template id to give');
    id = makeId();
  }
  const created = newTemplate(inUse, name, id);
  return {
    dashboards: { inUse: id, templates: [...all, created] },
    created,
  };
}
