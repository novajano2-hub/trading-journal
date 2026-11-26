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

/**
 * One line for each widget, under its name in the add-a-widget picker (C6),
 * in the words of comp 02. No amounts and no TradeZella wording.
 */
export const WIDGET_BLURBS: Record<WidgetKey, string> = {
  // Upper
  'net-pnl': 'Net P&L of the closed trades in the range, with their count.',
  'balance-pnl': "The balance at the range's end, with the range's net P&L.",
  'trade-win':
    'The share of closed trades that won, with won, breakeven and lost.',
  'profit-factor': 'Gross profit against gross loss, as one ratio.',
  'day-win':
    'The share of days that closed green, with green, flat and red days.',
  'win-loss-ratio':
    'The average win against the average loss, with both amounts.',
  expectancy: 'What an average closed trade has made.',
  'day-streak': 'The current run of winning or losing days.',
  'trade-streak': 'The current run of winning or losing trades.',
  streaks: 'Both current runs, in days and in trades.',
  'max-drawdown':
    'The deepest fall from a peak, in money and percent, with its date.',
  'avg-drawdown':
    'The average fall from a peak; the current one with no range set.',
  // Lower
  score: 'Six parts of your trading on a radar, and one score out of 100.',
  'cum-pnl': 'Net P&L added up day by day.',
  'win-avg':
    'The three, running through the day, by the time each trade closed.',
  'trade-time':
    "Each trade's result against the time of day it opened or closed.",
  'trade-duration': "Each trade's result against how long it was held.",
  'daily-pnl': "Each day's net P&L as a bar.",
  'daily-cum': "Each day's net P&L as a bar, with the running total as a line.",
  recent: 'Your latest trades, and the positions still open.',
  calendar: 'The month, each day tinted by its net.',
  balance: 'Your balance over time, with deposits and withdrawals.',
  drawdown: 'How far each day sits below the peak.',
  challenge: "One prop challenge's progress against its rules.",
  'calendar-mini': 'A small month; a day opens its Day view.',
  'calendar-adv': 'The month with stats on each day and a total for each week.',
  progress: 'The rules you met today, and how each trading day went.',
  report: 'A chart of up to three Performance metrics.',
  year: 'The year, month by month; a month opens Calendar.',
};
