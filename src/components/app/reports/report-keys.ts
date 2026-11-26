// Plain module (no 'use client'): the route reads it on the server.

/** Overview is `/app/reports` itself; every other report is `/app/reports/<key>`. */
export type ReportKey =
  | 'performance'
  | 'day-time'
  | 'symbols'
  | 'risk'
  | 'strategies'
  | 'tags'
  | 'patterns'
  | 'options'
  | 'wins-losses'
  | 'compare'
  | 'calendar';

export const REPORT_KEYS: readonly ReportKey[] = [
  'performance',
  'day-time',
  'symbols',
  'risk',
  'strategies',
  'tags',
  'patterns',
  'options',
  'wins-losses',
  'compare',
  'calendar',
];

export function isReportKey(key: string): key is ReportKey {
  return (REPORT_KEYS as readonly string[]).includes(key);
}

/** The Reports menu: the breakdowns, in TradeZella's order. */
export const REPORT_MENU: readonly { key: ReportKey; label: string }[] = [
  { key: 'day-time', label: 'Day & time' },
  { key: 'symbols', label: 'Symbols' },
  { key: 'risk', label: 'Risk' },
  { key: 'strategies', label: 'Strategies' },
  { key: 'tags', label: 'Tags' },
  { key: 'patterns', label: 'Patterns' },
  { key: 'options', label: 'Options' },
  { key: 'wins-losses', label: 'Wins vs losses' },
];

export const REPORT_LABELS: Record<ReportKey | 'overview', string> = {
  overview: 'Overview',
  performance: 'Performance',
  'day-time': 'Day & time',
  symbols: 'Symbols',
  risk: 'Risk',
  strategies: 'Strategies',
  tags: 'Tags',
  patterns: 'Patterns',
  options: 'Options',
  'wins-losses': 'Wins vs losses',
  compare: 'Compare',
  calendar: 'Calendar',
};

/** The tab a report belongs to: the menu's reports share "Reports". */
export type ReportTab =
  'overview' | 'performance' | 'reports' | 'compare' | 'calendar';

export function tabOf(key: ReportKey | 'overview'): ReportTab {
  if (
    key === 'overview' ||
    key === 'performance' ||
    key === 'compare' ||
    key === 'calendar'
  )
    return key;
  return 'reports';
}
