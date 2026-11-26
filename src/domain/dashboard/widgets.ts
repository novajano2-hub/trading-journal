import type { MetricId } from '@/content/metric-definitions';
import type { WidgetKey } from '../types';

export type WidgetSection = 'upper' | 'lower';

/**
 * The catalogue: twelve upper and seventeen lower widgets, in the order the
 * picker lists them. `size` is the width in the lower section (C4): the advanced
 * and the yearly calendar are two thirds wide, the rest one third. `metric` is
 * the definition the widget's info tip reads.
 */
export const WIDGETS: Record<
  WidgetKey,
  { section: WidgetSection; size: 'third' | 'wide'; metric: MetricId }
> = {
  // Upper
  'net-pnl': { section: 'upper', size: 'third', metric: 'pnl' },
  'balance-pnl': { section: 'upper', size: 'third', metric: 'balance-and-pnl' },
  'trade-win': { section: 'upper', size: 'third', metric: 'win-rate' },
  'profit-factor': { section: 'upper', size: 'third', metric: 'profit-factor' },
  'day-win': { section: 'upper', size: 'third', metric: 'daily-win-rate' },
  'win-loss-ratio': { section: 'upper', size: 'third', metric: 'avg-win-loss' },
  expectancy: { section: 'upper', size: 'third', metric: 'expectancy' },
  'day-streak': {
    section: 'upper',
    size: 'third',
    metric: 'current-day-streak',
  },
  'trade-streak': {
    section: 'upper',
    size: 'third',
    metric: 'current-trade-streak',
  },
  streaks: { section: 'upper', size: 'third', metric: 'current-streaks' },
  'max-drawdown': { section: 'upper', size: 'third', metric: 'max-drawdown' },
  'avg-drawdown': {
    section: 'upper',
    size: 'third',
    metric: 'avg-drawdown-card',
  },
  // Lower
  score: { section: 'lower', size: 'third', metric: 'sharpe' },
  'cum-pnl': { section: 'lower', size: 'third', metric: 'cumulative-pnl' },
  'win-avg': { section: 'lower', size: 'third', metric: 'avg-win-loss' },
  'trade-time': { section: 'lower', size: 'third', metric: 'pnl' },
  'trade-duration': { section: 'lower', size: 'third', metric: 'hold-time' },
  'daily-pnl': { section: 'lower', size: 'third', metric: 'pnl' },
  'daily-cum': { section: 'lower', size: 'third', metric: 'cumulative-pnl' },
  recent: { section: 'lower', size: 'third', metric: 'trades' },
  calendar: { section: 'lower', size: 'third', metric: 'pnl' },
  balance: { section: 'lower', size: 'third', metric: 'account-balance' },
  drawdown: { section: 'lower', size: 'third', metric: 'daily-drawdown' },
  challenge: { section: 'lower', size: 'third', metric: 'prop-profit' },
  'calendar-mini': { section: 'lower', size: 'third', metric: 'trading-days' },
  'calendar-adv': { section: 'lower', size: 'wide', metric: 'pnl' },
  progress: { section: 'lower', size: 'third', metric: 'tracker-card' },
  report: { section: 'lower', size: 'third', metric: 'pnl' },
  year: { section: 'lower', size: 'wide', metric: 'pnl' },
};

/** A key the catalogue knows; a template read from storage may hold others. */
export function isWidgetKey(k: string): k is WidgetKey {
  return Object.prototype.hasOwnProperty.call(WIDGETS, k);
}
