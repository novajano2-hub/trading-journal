// No 'use client': plain rules for which breakdown columns show and how the address says so.

/** The columns of a breakdown table a reader can switch off, in table order. The name column always shows. */
export const REPORT_COLUMNS = [
  { id: 'trades', label: 'Trades' },
  { id: 'win-rate', label: 'Win rate' },
  { id: 'net', label: 'Net P&L' },
  { id: 'profit-factor', label: 'Profit factor' },
  { id: 'average', label: 'Average' },
  { id: 'avg-win', label: 'Average win' },
  { id: 'avg-loss', label: 'Average loss' },
  { id: 'largest-win', label: 'Largest win' },
  { id: 'largest-loss', label: 'Largest loss' },
  { id: 'avg-daily-volume', label: 'Average daily volume' },
] as const;

export type ReportColumnId = (typeof REPORT_COLUMNS)[number]['id'];

/** The address key for the choice: `?cols=trades,net`. */
export const COLUMNS_PARAM = 'cols';

const ALL: readonly ReportColumnId[] = REPORT_COLUMNS.map((c) => c.id);

/**
 * The columns the address asks for, in table order. No param, or none of its
 * ids known, means every column; ids that are not columns are dropped.
 */
export function parseColumns(param: string | null): ReportColumnId[] {
  if (param === null) return [...ALL];
  const asked = new Set(param.split(',').map((v) => v.trim()));
  const shown = ALL.filter((id) => asked.has(id));
  return shown.length === 0 ? [...ALL] : shown;
}

/** The address value for a choice; null when every column shows, so the address stays clean. */
export function formatColumns(shown: readonly ReportColumnId[]): string | null {
  const keep = ALL.filter((id) => shown.includes(id));
  return keep.length === ALL.length ? null : keep.join(',');
}

/** `shown` with `id` switched, in table order; the last column on stays on. */
export function toggleColumn(
  shown: readonly ReportColumnId[],
  id: ReportColumnId,
): ReportColumnId[] {
  const next = shown.includes(id)
    ? shown.filter((c) => c !== id)
    : ALL.filter((c) => c === id || shown.includes(c));
  return next.length === 0 ? [...shown] : next;
}
