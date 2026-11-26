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
  sameTemplate,
  setWidgetSettings,
  TemplateChangedError,
  templatesOf,
  withInUse,
  withNewTemplate,
  withSavedTemplate,
  withoutTemplate,
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

describe("setWidgetSettings (the scatter's Entry or Exit, saved on the template in use)", () => {
  const stored = {
    inUse: 't2',
    templates: [
      tpl({ id: 't1', name: 'Other', lower: [{ key: 'trade-time' }] }),
      tpl({
        id: 't2',
        name: 'Mine',
        lower: [
          { key: 'trade-time', settings: { time: 'entry' } },
          { key: 'report', settings: { metrics: ['net', 'win-rate'] } },
        ],
      }),
    ],
  };

  test('with no dashboards pref the default template is saved with the setting', () => {
    const next = setWidgetSettings({}, 'trade-time', { time: 'exit' });
    expect(next.inUse).toBe('main');
    expect(next.templates).toHaveLength(1);
    expect(next.templates[0]!.name).toBe('Main');
    const widget = next.templates[0]!.lower.find((r) => r.key === 'trade-time');
    expect(widget?.settings).toEqual({ time: 'exit' });
    // The rest of the default is as it was, and the constant is untouched.
    expect(keys(next.templates[0]!.lower)).toEqual(
      keys(DEFAULT_TEMPLATE.lower),
    );
    expect(
      DEFAULT_TEMPLATE.lower.find((r) => r.key === 'trade-time')?.settings,
    ).toBeUndefined();
  });

  test('only the template in use changes, and only the widget asked for', () => {
    const next = setWidgetSettings({ dashboards: stored }, 'trade-time', {
      time: 'exit',
    });
    expect(next.inUse).toBe('t2');
    expect(next.templates[0]).toBe(stored.templates[0]);
    const mine = next.templates[1]!;
    expect(mine.lower[0]).toEqual({
      key: 'trade-time',
      settings: { time: 'exit' },
    });
    expect(mine.lower[1]).toBe(stored.templates[1]!.lower[1]);
    expect(mine.upper).toBe(stored.templates[1]!.upper);
    // The stored pref is not written through.
    expect(stored.templates[1]!.lower[0]!.settings).toEqual({ time: 'entry' });
  });

  test('a patch merges into the settings the widget has', () => {
    const next = setWidgetSettings({ dashboards: stored }, 'report', {
      challengeId: 'c1',
    });
    expect(next.templates[1]!.lower[1]!.settings).toEqual({
      metrics: ['net', 'win-rate'],
      challengeId: 'c1',
    });
  });

  test('a setting patched to undefined is cleared, and a widget left with none has no settings at all', () => {
    const withChoice = {
      inUse: 't1',
      templates: [
        tpl({
          lower: [
            {
              key: 'challenge',
              settings: { challengeId: 'c1', time: 'exit' as const },
            },
            { key: 'report', settings: { challengeId: 'c2' } },
          ],
        }),
      ],
    };
    const next = setWidgetSettings({ dashboards: withChoice }, 'challenge', {
      challengeId: undefined,
    });
    const settings = next.templates[0]!.lower[0]!.settings!;
    expect(settings).toEqual({ time: 'exit' });
    expect('challengeId' in settings).toBe(false);
    const bare = setWidgetSettings({ dashboards: withChoice }, 'report', {
      challengeId: undefined,
    });
    expect('settings' in bare.templates[0]!.lower[1]!).toBe(false);
    expect(bare.templates[0]!.lower[1]).toEqual({ key: 'report' });
  });

  test('a widget not on the template in use changes nothing', () => {
    const next = setWidgetSettings({ dashboards: stored }, 'year', {
      time: 'exit',
    });
    expect(next).toEqual(stored);
  });
});

describe('sameTemplate', () => {
  test('is true for equal names, widgets and settings, whatever the order of a setting', () => {
    const a = tpl({
      lower: [{ key: 'report', settings: { metrics: ['net'], time: 'exit' } }],
    });
    const b = tpl({
      lower: [{ key: 'report', settings: { time: 'exit', metrics: ['net'] } }],
    });
    expect(sameTemplate(a, b)).toBe(true);
    expect(sameTemplate(a, a)).toBe(true);
  });

  test('is false for another id, name, widget, place or setting', () => {
    const a = tpl();
    expect(sameTemplate(a, tpl({ id: 'x' }))).toBe(false);
    expect(sameTemplate(a, tpl({ name: 'Other' }))).toBe(false);
    expect(sameTemplate(a, tpl({ upper: [{ key: 'net-pnl' }] }))).toBe(false);
    expect(
      sameTemplate(a, tpl({ lower: [{ key: 'cum-pnl' }, { key: 'score' }] })),
    ).toBe(false);
    expect(
      sameTemplate(
        tpl({ lower: [{ key: 'trade-time' }] }),
        tpl({ lower: [{ key: 'trade-time', settings: { time: 'exit' } }] }),
      ),
    ).toBe(false);
    // An empty settings object is no setting at all.
    expect(
      sameTemplate(
        tpl({ lower: [{ key: 'trade-time' }] }),
        tpl({ lower: [{ key: 'trade-time', settings: {} }] }),
      ),
    ).toBe(true);
  });
});

describe('withInUse (picking a template)', () => {
  const stored = {
    inUse: 'a',
    templates: [tpl({ id: 'a' }), tpl({ id: 'b', name: 'B' })],
  };

  test('points inUse at the template and keeps the list', () => {
    const next = withInUse({ dashboards: stored }, 'b');
    expect(next.inUse).toBe('b');
    expect(next.templates).toEqual(stored.templates);
  });

  test('a template nobody has leaves the one in use in use', () => {
    expect(withInUse({ dashboards: stored }, 'zzz').inUse).toBe('a');
  });

  test('with no pref the default is saved, in use', () => {
    expect(withInUse({}, 'main')).toEqual({
      inUse: 'main',
      templates: [DEFAULT_TEMPLATE],
    });
  });
});

describe('withSavedTemplate (Save template)', () => {
  const a = tpl({ id: 'a', name: 'A' });
  const b = tpl({ id: 'b', name: 'B' });
  const stored = { inUse: 'a', templates: [a, b] };

  test('replaces the template in its place, others untouched, and puts it in use', () => {
    const draft = { ...b, name: 'B2', lower: [{ key: 'score' }] };
    const next = withSavedTemplate({ dashboards: stored }, draft, b);
    expect(next.inUse).toBe('b');
    expect(next.templates).toEqual([a, draft]);
    expect(next.templates[0]).toBe(a);
  });

  test('the template in use stays in use when it is the one saved', () => {
    const draft = { ...a, lower: [] };
    expect(withSavedTemplate({ dashboards: stored }, draft, a).inUse).toBe('a');
  });

  test('refuses a template saved elsewhere since the edit began', () => {
    const changed = { ...b, lower: [{ key: 'drawdown' }] };
    const elsewhere = { inUse: 'a', templates: [a, changed] };
    expect(() =>
      withSavedTemplate({ dashboards: elsewhere }, { ...b, name: 'Mine' }, b),
    ).toThrow(TemplateChangedError);
  });

  test('refuses a template deleted elsewhere', () => {
    const gone = { inUse: 'a', templates: [a] };
    expect(() =>
      withSavedTemplate({ dashboards: gone }, { ...b, name: 'Mine' }, b),
    ).toThrow(TemplateChangedError);
  });

  test('overwrite replaces the one saved elsewhere, and puts one deleted elsewhere back', () => {
    const changed = { ...b, lower: [{ key: 'drawdown' }] };
    const draft = { ...b, name: 'Mine' };
    const over = withSavedTemplate(
      { dashboards: { inUse: 'a', templates: [a, changed] } },
      draft,
      b,
      { overwrite: true },
    );
    expect(over.templates).toEqual([a, draft]);
    const back = withSavedTemplate(
      { dashboards: { inUse: 'a', templates: [a] } },
      draft,
      b,
      { overwrite: true },
    );
    expect(back.templates).toEqual([a, draft]);
    expect(back.inUse).toBe('b');
  });

  test('with no pref the default is edited and saved whole', () => {
    const draft = removeWidget(DEFAULT_TEMPLATE, 'upper', 0);
    const next = withSavedTemplate({}, draft, DEFAULT_TEMPLATE);
    expect(next).toEqual({ inUse: 'main', templates: [draft] });
  });

  test('an unknown widget key stays on the saved template', () => {
    const odd = tpl({
      id: 'o',
      lower: [{ key: 'from-the-future' }, { key: 'score' }],
    });
    const draft = moveWidget(odd, 'lower', 1, 0);
    const next = withSavedTemplate(
      { dashboards: { inUse: 'o', templates: [odd] } },
      draft,
      odd,
    );
    expect(keys(next.templates[0]!.lower)).toEqual([
      'score',
      'from-the-future',
    ]);
  });
});

describe('withoutTemplate (Delete template)', () => {
  const a = tpl({ id: 'a', name: 'A' });
  const b = tpl({ id: 'b', name: 'B' });
  const c = tpl({ id: 'c', name: 'C' });

  test('deleting the one in use points inUse at the first one left', () => {
    const next = withoutTemplate(
      { dashboards: { inUse: 'b', templates: [a, b, c] } },
      'b',
    );
    expect(next).toEqual({ inUse: 'a', templates: [a, c] });
    const first = withoutTemplate(
      { dashboards: { inUse: 'a', templates: [a, b, c] } },
      'a',
    );
    expect(first).toEqual({ inUse: 'b', templates: [b, c] });
  });

  test('deleting another template leaves the one in use in use', () => {
    const next = withoutTemplate(
      { dashboards: { inUse: 'b', templates: [a, b, c] } },
      'c',
    );
    expect(next).toEqual({ inUse: 'b', templates: [a, b] });
  });

  test('the last template cannot go, saved or the default', () => {
    expect(() =>
      withoutTemplate({ dashboards: { inUse: 'a', templates: [a] } }, 'a'),
    ).toThrow();
    expect(() => withoutTemplate({}, 'main')).toThrow();
  });

  test('a template that is gone already changes nothing', () => {
    const stored = { inUse: 'a', templates: [a, b] };
    expect(withoutTemplate({ dashboards: stored }, 'zzz')).toEqual(stored);
  });
});

describe('withNewTemplate (New template)', () => {
  const a = tpl({
    id: 'a',
    name: 'A',
    lower: [
      { key: 'trade-time', settings: { time: 'exit' } },
      { key: 'report', settings: { metrics: ['net:line:running'] } },
    ],
  });
  const b = tpl({ id: 'b', name: 'B' });

  test('copies the template in use, settings included, adds it last and puts it in use', () => {
    const { dashboards, created } = withNewTemplate(
      { dashboards: { inUse: 'a', templates: [a, b] } },
      'Swing',
      () => 'swing',
    );
    expect(created.id).toBe('swing');
    expect(created.name).toBe('Swing');
    expect(created.upper).toEqual(a.upper);
    expect(created.lower).toEqual(a.lower);
    expect(dashboards.inUse).toBe('swing');
    expect(dashboards.templates).toEqual([a, b, created]);
    expect(created.lower[1]?.settings?.metrics).not.toBe(
      a.lower[1]?.settings?.metrics,
    );
  });

  test('keeps the id unique among the templates, asking again when it is taken', () => {
    const ids = ['a', 'b', 'a', 'fresh'];
    const { created } = withNewTemplate(
      { dashboards: { inUse: 'a', templates: [a, b] } },
      'Copy',
      () => ids.shift()!,
    );
    expect(created.id).toBe('fresh');
  });

  test('gives up on an id generator that only repeats itself', () => {
    expect(() =>
      withNewTemplate(
        { dashboards: { inUse: 'a', templates: [a] } },
        'Copy',
        () => 'a',
      ),
    ).toThrow();
  });

  test('with no pref it copies the default, which is saved beside it', () => {
    const { dashboards, created } = withNewTemplate({}, 'Second', () => 's');
    expect(dashboards.templates).toEqual([DEFAULT_TEMPLATE, created]);
    expect(dashboards.inUse).toBe('s');
    expect(created.upper).toEqual(DEFAULT_TEMPLATE.upper);
  });

  test('uses a real uuid when no generator is given', () => {
    const { created } = withNewTemplate({}, 'Second');
    expect(created.id).toMatch(/^[0-9a-f-]{36}$/);
  });
});
