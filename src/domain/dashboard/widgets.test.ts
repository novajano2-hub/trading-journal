import { describe, expect, test } from 'vitest';
import { METRIC_IDS } from '@/content/metric-definitions';
import type { WidgetKey } from '../types';
import { WIDGETS, isWidgetKey } from './widgets';

const UPPER: WidgetKey[] = [
  'net-pnl',
  'balance-pnl',
  'trade-win',
  'profit-factor',
  'day-win',
  'win-loss-ratio',
  'expectancy',
  'day-streak',
  'trade-streak',
  'streaks',
  'max-drawdown',
  'avg-drawdown',
];
const LOWER: WidgetKey[] = [
  'score',
  'cum-pnl',
  'win-avg',
  'trade-time',
  'trade-duration',
  'daily-pnl',
  'daily-cum',
  'recent',
  'calendar',
  'balance',
  'drawdown',
  'challenge',
  'calendar-mini',
  'calendar-adv',
  'progress',
  'report',
  'year',
];

describe('the widget catalogue', () => {
  test('twelve upper and seventeen lower widgets, in catalogue order', () => {
    const keys = Object.keys(WIDGETS);
    expect(
      keys.filter((k) => WIDGETS[k as WidgetKey].section === 'upper'),
    ).toEqual(UPPER);
    expect(
      keys.filter((k) => WIDGETS[k as WidgetKey].section === 'lower'),
    ).toEqual(LOWER);
    expect(keys).toHaveLength(29);
  });

  test('only the advanced and the yearly calendar are wide', () => {
    const wide = (Object.keys(WIDGETS) as WidgetKey[]).filter(
      (k) => WIDGETS[k].size === 'wide',
    );
    expect(wide).toEqual(['calendar-adv', 'year']);
  });

  test('every upper widget is one third', () => {
    for (const k of UPPER) expect(WIDGETS[k].size).toBe('third');
  });

  test('every widget names a metric the tips know', () => {
    for (const k of Object.keys(WIDGETS) as WidgetKey[]) {
      expect(METRIC_IDS).toContain(WIDGETS[k].metric);
    }
  });

  test('the figures the widgets show have tips that describe them, not the longest-run ones', () => {
    expect(WIDGETS['net-pnl'].metric).toBe('pnl');
    expect(WIDGETS['balance-pnl'].metric).toBe('balance-and-pnl');
    expect(WIDGETS['day-streak'].metric).toBe('current-day-streak');
    expect(WIDGETS['trade-streak'].metric).toBe('current-trade-streak');
    expect(WIDGETS.streaks.metric).toBe('current-streaks');
    expect(WIDGETS['avg-drawdown'].metric).toBe('avg-drawdown-card');
  });

  test('the chart widgets read tips that describe the chart, not a figure it resembles', () => {
    expect(WIDGETS.score.metric).toBe('edge-score');
    expect(WIDGETS['win-avg'].metric).toBe('win-avg-through-day');
    expect(WIDGETS['daily-pnl'].metric).toBe('daily-net-pnl');
    expect(WIDGETS['daily-cum'].metric).toBe('daily-and-cumulative');
    expect(WIDGETS.balance.metric).toBe('balance-chart');
    expect(WIDGETS['trade-time'].metric).toBe('trade-time-scatter');
    expect(WIDGETS['trade-duration'].metric).toBe('trade-duration-scatter');
    // These two already had a tip for what they draw.
    expect(WIDGETS['cum-pnl'].metric).toBe('cumulative-pnl');
    expect(WIDGETS.drawdown.metric).toBe('daily-drawdown');
  });

  test('isWidgetKey tells known keys from unknown ones', () => {
    expect(isWidgetKey('score')).toBe(true);
    expect(isWidgetKey('year')).toBe(true);
    expect(isWidgetKey('from-the-future')).toBe(false);
    expect(isWidgetKey('')).toBe(false);
    expect(isWidgetKey('toString')).toBe(false);
    expect(isWidgetKey('constructor')).toBe(false);
  });
});
