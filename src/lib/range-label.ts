import { format, parseISO } from 'date-fns';
import type { DatePreset, DateRange } from '@/data/filters';

export const PRESET_LABELS: Record<DatePreset, string> = {
  today: 'Today',
  'this-week': 'This week',
  'last-week': 'Last week',
  'this-month': 'This month',
  'last-month': 'Last month',
  'last-30-days': 'Last 30 days',
  'this-quarter': 'This quarter',
  ytd: 'Year to date',
};

type Resolved = { from?: string; to?: string };

const year = (iso: string) => iso.slice(0, 4);
const month = (iso: string) => iso.slice(0, 7);
const dayMonth = (iso: string) => format(parseISO(iso), 'd MMM');

function caption(r: Resolved, today: string, alwaysYear: boolean): string {
  const { from, to } = r;
  const withYear = (iso: string, text: string) =>
    alwaysYear || year(iso) !== year(today) ? `${text} ${year(iso)}` : text;
  if (from === undefined && to === undefined) return 'all time';
  if (to === undefined) return `since ${withYear(from!, dayMonth(from!))}`;
  if (from === undefined) return `to ${withYear(to, dayMonth(to))}`;
  if (from === to) return withYear(to, dayMonth(to));
  if (year(from) !== year(to))
    return `${dayMonth(from)} ${year(from)}-${dayMonth(to)} ${year(to)}`;
  if (month(from) === month(to))
    return withYear(
      to,
      `${format(parseISO(from), 'd')}-${format(parseISO(to), 'd MMM')}`,
    );
  return withYear(to, `${dayMonth(from)}-${dayMonth(to)}`);
}

/** The resolved range as a short phrase, e.g. "1-20 Nov"; the year appears when it isn't today's. */
export function rangeCaption(r: Resolved, today: string): string {
  return caption(r, today, false);
}

/** The date chip's label: a preset's name, "All time", or the custom range with its year. */
export function rangeChipLabel(range: DateRange, resolved: Resolved): string {
  if ('preset' in range) return PRESET_LABELS[range.preset];
  if (resolved.from === undefined && resolved.to === undefined)
    return 'All time';
  return caption(resolved, '', true);
}

const fullDay = (iso: string) => format(parseISO(iso), 'd MMM yyyy');

/** Two days as one phrase: "12 Jun to 24 Nov 2026", the year said once when it is shared. */
function between(from: string, to: string): string {
  if (from === to) return fullDay(to);
  return year(from) === year(to)
    ? `${dayMonth(from)} to ${fullDay(to)}`
    : `${fullDay(from)} to ${fullDay(to)}`;
}

/**
 * The range for a printed page, in full: a preset or "All time" by name with
 * the days it covers, a custom range as its dates. `span` is the first and last
 * day the report's trades fall on, which an open end reads from; with neither
 * end to name, the name stands alone.
 */
export function rangeInWords(
  range: DateRange,
  resolved: Resolved,
  span: Resolved,
): string {
  const from = resolved.from ?? span.from;
  const to = resolved.to ?? span.to;
  const days = from !== undefined && to !== undefined ? between(from, to) : '';
  if ('preset' in range)
    return days
      ? `${PRESET_LABELS[range.preset]} (${days})`
      : PRESET_LABELS[range.preset];
  const { from: a, to: b } = resolved;
  if (a !== undefined && b !== undefined) return between(a, b);
  const name =
    a !== undefined
      ? `Since ${fullDay(a)}`
      : b !== undefined
        ? `Up to ${fullDay(b)}`
        : 'All time';
  return days ? `${name} (${days})` : name;
}
