import type {
  DashTemplate,
  UserPrefs,
  WidgetKey,
  WidgetRef,
  WidgetSettings,
} from '../types';
import { WIDGETS, type WidgetSection } from './widgets';

/** The upper strip holds at most five widgets (spec 5.1). */
const UPPER_LIMIT = 5;

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
