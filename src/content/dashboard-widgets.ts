import type { WidgetKey } from '@/domain/types';

/**
 * What each dashboard widget is called, as Keel's own copy has it: on its
 * card, on its bar in edit mode and in the add-a-widget picker. Where a
 * widget's card carries something else in its header (a calendar's month, a
 * challenge's name), this is still the catalogue's name for it.
 */
export const WIDGET_TITLES: Record<WidgetKey, string> = {
  // Upper
  'net-pnl': 'Net P&L',
  'balance-pnl': 'Account balance and P&L',
  'trade-win': 'Trade win rate',
  'profit-factor': 'Profit factor',
  'day-win': 'Day win rate',
  'win-loss-ratio': 'Average win to loss',
  expectancy: 'Trade expectancy',
  'day-streak': 'Winning day streak',
  'trade-streak': 'Winning trade streak',
  streaks: 'Streaks',
  'max-drawdown': 'Max drawdown',
  'avg-drawdown': 'Average drawdown',
  // Lower
  score: 'Edge score',
  'cum-pnl': 'Cumulative net P&L',
  'win-avg': 'Win rate, average win and average loss',
  'trade-time': 'Trade time performance',
  'trade-duration': 'Trade duration performance',
  'daily-pnl': 'Net daily P&L',
  'daily-cum': 'Daily and cumulative net P&L',
  recent: 'Recent trades',
  calendar: 'Calendar',
  balance: 'Account balance',
  drawdown: 'Drawdown',
  challenge: 'Challenge',
  'calendar-mini': 'Mini calendar',
  'calendar-adv': 'Calendar, with stats',
  progress: 'Progress tracker',
  report: 'Report',
  year: 'Year calendar',
};
