import { describe, expect, test } from 'vitest';
import type { DashTemplate, WidgetRef } from '../types';
import {
  DEFAULT_TEMPLATE,
  addWidget,
  deleteTemplate,
  missingFrom,
  moveWidget,
  newTemplate,
  removeWidget,
  templatesOf,
} from './templates';

const keys = (refs: WidgetRef[]) => refs.map((r) => r.key);

const tpl = (over: Partial<DashTemplate> = {}): DashTemplate => ({
  id: 't1',
  name: 'Mine',
  upper: [{ key: 'net-pnl' }, { key: 'trade-win' }],
  lower: [{ key: 'score' }, { key: 'cum-pnl' }, { key: 'recent' }],
  ...over,
});

describe('the default template', () => {
  test('is Main, with the two lists of C5 in order', () => {
    expect(DEFAULT_TEMPLATE.id).toBe('main');
    expect(DEFAULT_TEMPLATE.name).toBe('Main');
    expect(keys(DEFAULT_TEMPLATE.upper)).toEqual([
      'net-pnl',
      'trade-win',
      'profit-factor',
      'day-win',
      'win-loss-ratio',
    ]);
    expect(keys(DEFAULT_TEMPLATE.lower)).toEqual([
      'score',
      'progress',
      'cum-pnl',
      'daily-pnl',
      'recent',
      'balance',
      'calendar-adv',
      'drawdown',
      'trade-time',
      'trade-duration',
    ]);
  });
});

describe('templatesOf', () => {
  test('no pref falls back to the default template', () => {
    expect(templatesOf({})).toEqual({
      inUse: DEFAULT_TEMPLATE,
      all: [DEFAULT_TEMPLATE],
    });
  });

  test('an empty list of templates falls back too', () => {
    const r = templatesOf({ dashboards: { inUse: 'x', templates: [] } });
    expect(r.inUse).toBe(DEFAULT_TEMPLATE);
    expect(r.all).toEqual([DEFAULT_TEMPLATE]);
  });

  test('the template in use is the one the pref names', () => {
    const a = tpl({ id: 'a', name: 'A' });
    const b = tpl({ id: 'b', name: 'B' });
    const r = templatesOf({ dashboards: { inUse: 'b', templates: [a, b] } });
    expect(r.inUse).toBe(b);
    expect(r.all).toEqual([a, b]);
  });

  test('a pref naming a missing template uses the first', () => {
    const a = tpl({ id: 'a' });
    const b = tpl({ id: 'b' });
    const r = templatesOf({ dashboards: { inUse: 'gone', templates: [a, b] } });
    expect(r.inUse).toBe(a);
  });

  test('skips nothing: unknown keys and every template stay', () => {
    const a = tpl({
      id: 'a',
      upper: [{ key: 'net-pnl' }, { key: 'from-the-future' }],
      lower: [{ key: 'another-new-one', settings: { time: 'exit' } }],
    });
    const r = templatesOf({ dashboards: { inUse: 'a', templates: [a] } });
    expect(keys(r.inUse.upper)).toEqual(['net-pnl', 'from-the-future']);
    expect(r.inUse.lower).toEqual([
      { key: 'another-new-one', settings: { time: 'exit' } },
    ]);
  });
});

describe('addWidget', () => {
  test('appends to the section and leaves the template alone', () => {
    const t = tpl();
    const next = addWidget(t, 'upper', { key: 'profit-factor' });
    expect(keys(next.upper)).toEqual(['net-pnl', 'trade-win', 'profit-factor']);
    expect(keys(t.upper)).toEqual(['net-pnl', 'trade-win']);
    expect(next.lower).toEqual(t.lower);
    const lower = addWidget(t, 'lower', { key: 'year' });
    expect(keys(lower.lower)).toEqual(['score', 'cum-pnl', 'recent', 'year']);
  });

  test('keeps the ref settings it is given', () => {
    const next = addWidget(tpl(), 'lower', {
      key: 'trade-time',
      settings: { time: 'exit' },
    });
    expect(next.lower.at(-1)).toEqual({
      key: 'trade-time',
      settings: { time: 'exit' },
    });
  });

  test('throws when the upper strip already holds five', () => {
    const full = tpl({
      upper: DEFAULT_TEMPLATE.upper.map((r) => ({ ...r })),
    });
    expect(full.upper).toHaveLength(5);
    expect(() => addWidget(full, 'upper', { key: 'expectancy' })).toThrow();
  });

  test('the fifth upper widget is allowed', () => {
    const four = tpl({
      upper: DEFAULT_TEMPLATE.upper.slice(0, 4).map((r) => ({ ...r })),
    });
    expect(addWidget(four, 'upper', { key: 'expectancy' }).upper).toHaveLength(
      5,
    );
  });

  test('the lower section has no limit', () => {
    let t = tpl({ lower: [] });
    for (const k of [
      'score',
      'cum-pnl',
      'recent',
      'year',
      'report',
      'balance',
    ]) {
      t = addWidget(t, 'lower', { key: k });
    }
    expect(t.lower).toHaveLength(6);
  });

  test('throws on a duplicate key, in either section', () => {
    expect(() => addWidget(tpl(), 'upper', { key: 'net-pnl' })).toThrow();
    expect(() => addWidget(tpl(), 'lower', { key: 'score' })).toThrow();
    expect(() => addWidget(tpl(), 'lower', { key: 'net-pnl' })).toThrow();
  });

  test('copies the settings it keeps, so the ref is not aliased', () => {
    const ref: WidgetRef = { key: 'report', settings: { metrics: ['net'] } };
    const next = addWidget(tpl(), 'lower', ref);
    ref.settings!.metrics!.push('trades');
    expect(next.lower.at(-1)?.settings?.metrics).toEqual(['net']);
  });
});

describe('removeWidget', () => {
  test('drops the widget at the index', () => {
    const t = tpl();
    const next = removeWidget(t, 'lower', 1);
    expect(keys(next.lower)).toEqual(['score', 'recent']);
    expect(keys(t.lower)).toEqual(['score', 'cum-pnl', 'recent']);
    expect(next.upper).toEqual(t.upper);
  });

  test('an index outside the list changes nothing', () => {
    const t = tpl();
    expect(removeWidget(t, 'upper', 2)).toEqual(t);
    expect(removeWidget(t, 'upper', -1)).toEqual(t);
  });

  test('removing a widget makes it available to the picker again', () => {
    const next = removeWidget(tpl(), 'upper', 0);
    expect(missingFrom(next, 'upper')).toContain('net-pnl');
  });
});

describe('moveWidget', () => {
  test('moves a widget earlier and later', () => {
    const t = tpl();
    expect(keys(moveWidget(t, 'lower', 2, 0).lower)).toEqual([
      'recent',
      'score',
      'cum-pnl',
    ]);
    expect(keys(moveWidget(t, 'lower', 0, 2).lower)).toEqual([
      'cum-pnl',
      'recent',
      'score',
    ]);
    expect(keys(t.lower)).toEqual(['score', 'cum-pnl', 'recent']);
  });

  test('moves round trip', () => {
    const t = DEFAULT_TEMPLATE;
    for (const section of ['upper', 'lower'] as const) {
      const n = t[section].length;
      for (let from = 0; from < n; from++) {
        for (let to = 0; to < n; to++) {
          const there = moveWidget(t, section, from, to);
          expect(there[section]).toHaveLength(n);
          expect(moveWidget(there, section, to, from)[section]).toEqual(
            t[section],
          );
        }
      }
    }
  });

  test('a move to the same place, or from outside, changes nothing', () => {
    const t = tpl();
    expect(moveWidget(t, 'lower', 1, 1)).toEqual(t);
    expect(moveWidget(t, 'lower', 5, 0)).toEqual(t);
    expect(moveWidget(t, 'lower', -1, 0)).toEqual(t);
  });

  test('a move past the end lands on the last place', () => {
    expect(keys(moveWidget(tpl(), 'lower', 0, 9).lower)).toEqual([
      'cum-pnl',
      'recent',
      'score',
    ]);
    expect(keys(moveWidget(tpl(), 'lower', 2, -4).lower)).toEqual([
      'recent',
      'score',
      'cum-pnl',
    ]);
  });

  test('keeps each widget with its settings', () => {
    const t = tpl({
      lower: [
        { key: 'trade-time', settings: { time: 'exit' } },
        { key: 'score' },
      ],
    });
    expect(moveWidget(t, 'lower', 0, 1).lower).toEqual([
      { key: 'score' },
      { key: 'trade-time', settings: { time: 'exit' } },
    ]);
  });
});

describe('newTemplate', () => {
  test('is a copy of the template in use under the new name and id', () => {
    const from = tpl({
      id: 'a',
      name: 'A',
      lower: [
        { key: 'trade-time', settings: { time: 'exit' } },
        { key: 'report', settings: { metrics: ['net', 'trades'] } },
      ],
    });
    const next = newTemplate(from, 'Swing', 'swing-1');
    expect(next.id).toBe('swing-1');
    expect(next.name).toBe('Swing');
    expect(next.upper).toEqual(from.upper);
    expect(next.lower).toEqual(from.lower);
  });

  test('shares nothing with the template it copies', () => {
    const from = tpl({
      lower: [{ key: 'report', settings: { metrics: ['net'] } }],
    });
    const next = newTemplate(from, 'Copy', 'c');
    next.upper.push({ key: 'x' });
    next.lower[0]!.settings!.metrics!.push('trades');
    expect(keys(from.upper)).toEqual(['net-pnl', 'trade-win']);
    expect(from.lower[0]?.settings?.metrics).toEqual(['net']);
  });

  test('copies the default template into a template of its own', () => {
    const next = newTemplate(DEFAULT_TEMPLATE, 'Second', 'second');
    expect(next).toEqual({
      ...DEFAULT_TEMPLATE,
      id: 'second',
      name: 'Second',
    });
    expect(next.upper).not.toBe(DEFAULT_TEMPLATE.upper);
  });
});

describe('deleteTemplate', () => {
  test('removes the template with the id', () => {
    const a = tpl({ id: 'a' });
    const b = tpl({ id: 'b' });
    expect(deleteTemplate([a, b], 'a')).toEqual([b]);
    expect(deleteTemplate([a, b], 'b')).toEqual([a]);
  });

  test('refuses the last one', () => {
    expect(() => deleteTemplate([tpl({ id: 'a' })], 'a')).toThrow();
  });

  test('an id nobody has changes nothing', () => {
    const a = tpl({ id: 'a' });
    const b = tpl({ id: 'b' });
    expect(deleteTemplate([a, b], 'zzz')).toEqual([a, b]);
    expect(deleteTemplate([a], 'zzz')).toEqual([a]);
  });
});

describe('missingFrom', () => {
  test('lists the section widgets not on the template, in catalogue order', () => {
    expect(missingFrom(tpl(), 'upper')).toEqual([
      'balance-pnl',
      'profit-factor',
      'day-win',
      'win-loss-ratio',
      'expectancy',
      'day-streak',
      'trade-streak',
      'streaks',
      'max-drawdown',
      'avg-drawdown',
    ]);
    expect(missingFrom(tpl(), 'lower')).toEqual([
      'win-avg',
      'trade-time',
      'trade-duration',
      'daily-pnl',
      'daily-cum',
      'calendar',
      'balance',
      'drawdown',
      'challenge',
      'calendar-mini',
      'calendar-adv',
      'progress',
      'report',
      'year',
    ]);
  });

  test('the default template leaves the rest of the catalogue', () => {
    expect(missingFrom(DEFAULT_TEMPLATE, 'upper')).toEqual([
      'balance-pnl',
      'expectancy',
      'day-streak',
      'trade-streak',
      'streaks',
      'max-drawdown',
      'avg-drawdown',
    ]);
    expect(missingFrom(DEFAULT_TEMPLATE, 'lower')).toEqual([
      'win-avg',
      'daily-cum',
      'calendar',
      'challenge',
      'calendar-mini',
      'report',
      'year',
    ]);
  });

  test('a template holding everything leaves nothing', () => {
    const all = tpl({
      upper: missingFrom(tpl({ upper: [], lower: [] }), 'upper').map((key) => ({
        key,
      })),
      lower: missingFrom(tpl({ upper: [], lower: [] }), 'lower').map((key) => ({
        key,
      })),
    });
    expect(missingFrom(all, 'upper')).toEqual([]);
    expect(missingFrom(all, 'lower')).toEqual([]);
  });

  test('unknown keys on the template take nothing from the list', () => {
    const t = tpl({ upper: [{ key: 'from-the-future' }], lower: [] });
    expect(missingFrom(t, 'upper')).toHaveLength(12);
    expect(missingFrom(t, 'lower')).toHaveLength(17);
  });
});
