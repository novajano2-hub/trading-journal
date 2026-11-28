import { describe, expect, test } from 'vitest';
import { dayOfTrade } from '@/data/day-log';
import { PATTERNS, type PatternId } from './defs';
import {
  DAY,
  HOUR,
  MIN,
  SEC,
  at,
  dateOf,
  dayHit,
  mk,
  onDay,
  run,
  tradeHit,
} from './__fixtures__/builders';

const X = at(100);

describe('the pattern list', () => {
  test('holds the 17 patterns, 6 by trade and 11 by day, each with a name and a tone', () => {
    expect(PATTERNS).toHaveLength(17);
    expect(PATTERNS.filter((p) => p.level === 'trade')).toHaveLength(6);
    expect(PATTERNS.filter((p) => p.level === 'day')).toHaveLength(11);
    expect(new Set(PATTERNS.map((p) => p.id)).size).toBe(17);
    for (const p of PATTERNS) {
      expect(p.name.length).toBeGreaterThan(0);
      expect(['helps', 'hurts', 'neutral']).toContain(p.tone);
    }
  });

  test('gives each pattern its name and tone', () => {
    const by = Object.fromEntries(PATTERNS.map((p) => [p.id, p]));
    const expected: Record<PatternId, [string, string]> = {
      'held-longer': ['Held longer than usual', 'neutral'],
      'long-loss-hold': ['Long hold on a loss', 'hurts'],
      'loss-after-loss': ['Loss after a loss', 'hurts'],
      'added-to-position': ['Added to the position', 'neutral'],
      'exited-in-parts': ['Exited in parts', 'neutral'],
      'large-size': ['Large size', 'neutral'],
      'losses-outweighed': ['Losses outweighed wins', 'hurts'],
      'switched-sides-red': ['Switched sides, red', 'hurts'],
      'switched-sides-green': ['Switched sides, green', 'hurts'],
      'one-strong-trade': ['One strong trade', 'helps'],
      'low-return': ['Low return for the effort', 'hurts'],
      'sized-up-after-wins': ['Sized up after wins', 'hurts'],
      'more-trades': ['More trades than usual', 'hurts'],
      'waited-then-won': ['Waited, then won', 'helps'],
      'quick-reentries': ['Quick re-entries after a loss', 'hurts'],
      'rushed-red-day': ['Rushed red day', 'hurts'],
      'busier-than-green': ['Busier than a green day', 'neutral'],
    };
    for (const [id, [name, tone]] of Object.entries(expected))
      expect(by[id]).toMatchObject({ name, tone });
  });

  test('uses only Keel words: no dashes, no borrowed names', () => {
    for (const p of PATTERNS) {
      expect(p.name).not.toMatch(/[–—]/);
      expect(`${p.id} ${p.name}`).not.toMatch(/zella|insight/i);
    }
  });
});

describe('a later trade never changes an earlier result', () => {
  const earlier = () => [
    ...onDay(90, [100, -100, 100]),
    ...onDay(92, [
      { net: 100, volume: 1 },
      { net: 100, volume: 1 },
      { net: 100, volume: 1 },
      { net: -400, volume: 3 },
    ]),
    ...onDay(95, [-100, -100, -100, -100, -100], 2 * MIN),
    mk({ open: at(96), hold: 3 * HOUR, net: -900, volume: 4 }),
    mk({
      open: at(97),
      hold: 20 * MIN,
      net: 300,
      volume: 2,
      entries: 2,
      exits: 2,
    }),
  ];
  const later = () => [
    ...onDay(100, Array(40).fill(-500), 30 * SEC),
    mk({ open: at(101), hold: 90 * DAY, net: -9999, volume: 500 }),
    mk({ open: at(102), status: 'open', volume: 900 }),
  ];

  test('appending trades leaves the hits of the first ones as they were', () => {
    const first = earlier();
    const before = run(first);
    const after = run([...first, ...later()]);
    for (const t of first)
      expect(after.byTrade.get(t.id)).toEqual(before.byTrade.get(t.id));
    for (const [date, hits] of before.byDay)
      expect(after.byDay.get(date)).toEqual(hits);
    expect(before.byTrade.size).toBeGreaterThan(0);
    expect(before.byDay.size).toBeGreaterThan(0);
  });

  test('the order the trades are listed in changes nothing', () => {
    const all = [...earlier(), ...later()];
    const a = run(all);
    const b = run([...all].reverse());
    expect(b.byTrade).toEqual(a.byTrade);
    expect(b.byDay).toEqual(a.byDay);
  });
});

describe('breakevens are neither wins nor losses', () => {
  const range = { unit: 'amount', from: -50, to: 50 } as const;

  test('a breakeven is flagged by no outcome pattern and sits in no outcome sample', () => {
    // Wins held 10, 20, 30, 40 minutes, then a breakeven held longer than all.
    const wins = [10, 20, 30, 40].map((m, i) =>
      mk({ open: at(95 + i), hold: m * MIN, net: 100 }),
    );
    const even = mk({ open: X, hold: 3 * HOUR, net: 20 });
    const r = run([...wins, even], { breakevenRange: range });
    for (const id of [
      'held-longer',
      'long-loss-hold',
      'loss-after-loss',
    ] as const)
      expect(tradeHit(r, even, id)).toBeUndefined();

    // And a long win after it reads the four wins alone, not the breakeven.
    const win = mk({ open: at(101), hold: 31 * MIN, net: 100 });
    expect(
      tradeHit(
        run([...wins, even, win], { breakevenRange: range }),
        win,
        'held-longer',
      ),
    ).toMatchObject({
      figures: { sample: 4, limitMs: 30 * MIN },
    });
  });

  test('a breakeven exit is no loss to follow', () => {
    const even = mk({ open: at(100, 14, 0), hold: 10 * MIN, net: -20 });
    const x = mk({ open: at(100, 14, 10, 10), net: -100 });
    expect(
      tradeHit(run([even, x], { breakevenRange: range }), x, 'loss-after-loss'),
    ).toBeUndefined();
    // Without the range the same trade is a loss and the pattern fires.
    expect(tradeHit(run([even, x]), x, 'loss-after-loss')).toBeDefined();
  });

  test('a breakeven is no loss in the average loss of a long hold', () => {
    const losses = [10, 20, 30, 40].map((m, i) =>
      mk({ open: at(95 + i), hold: m * MIN, net: -(i + 1) * 100 }),
    ); // average loss 250
    const even = mk({ open: at(99), hold: 5 * MIN, net: -40 });
    const x = mk({ open: X, hold: 21 * MIN, net: -260 });
    const r = run([...losses, even, x], { breakevenRange: range });
    expect(tradeHit(r, x, 'long-loss-hold')).toMatchObject({
      figures: { sample: 4, avgLoss: 250, limitMs: 20 * MIN },
    });
  });

  test('breakevens are not the wins of a day', () => {
    const r = run(onDay(100, [100, -250, 0, 0]));
    expect(dayHit(r, 100, 'losses-outweighed')).toMatchObject({
      figures: { winRate: 0.5 },
    });
  });

  test('breakevens are not the losses of a re-entry cycle', () => {
    const trades = [
      mk({ open: at(100, 14, 0), hold: 10 * MIN, net: -100 }),
      mk({ open: at(100, 14, 10, 30), hold: 90 * SEC, net: -100 }),
      mk({ open: at(100, 14, 12, 40), hold: 90 * SEC, net: -20 }),
    ];
    // The last trade is a breakeven: one re-entry that lost, not two.
    expect(
      dayHit(run(trades, { breakevenRange: range }), 100, 'quick-reentries'),
    ).toBeUndefined();
  });
});

describe('open trades', () => {
  test('are skipped by outcome patterns and counted by added-to-position and large-size', () => {
    const history = [1, 2, 3, 4].map((v, i) =>
      mk({ open: at(95 + i), volume: v }),
    );
    const open = mk({
      open: X,
      status: 'open',
      net: -100,
      volume: 8,
      entries: 2,
    });
    const r = run([...history, open]);
    expect(r.byTrade.get(open.id)?.map((h) => h.id)).toEqual([
      'added-to-position',
      'large-size',
    ]);
  });

  test('an open trade on a day counts toward its trade count but never its result', () => {
    // One strong win and an open trade: two trades, so not "one trade".
    const day = [
      mk({ open: at(100), net: 300, risk: 100 }),
      mk({ open: at(100, 15), status: 'open' }),
    ];
    expect(dayHit(run(day), 100, 'one-strong-trade')).toBeUndefined();
    // Alone, an open trade has no result to be red or green.
    const alone = [mk({ open: at(100), status: 'open', net: -100 })];
    expect(run(alone).byDay.size).toBe(0);
  });
});

describe('the hits of one trade or day', () => {
  test('come in the order of the pattern list', () => {
    const history = [10, 20, 30, 40].map((m, i) =>
      mk({ open: at(95 + i), hold: m * MIN, volume: i + 1, net: 100 }),
    );
    const x = mk({
      open: X,
      hold: 3 * HOUR,
      volume: 9,
      entries: 2,
      exits: 2,
      net: 100,
    });
    const ids = run([...history, x])
      .byTrade.get(x.id)!
      .map((h) => h.id);
    expect(ids).toEqual([
      'held-longer',
      'added-to-position',
      'exited-in-parts',
      'large-size',
    ]);
    const order = PATTERNS.map((p) => p.id);
    expect(ids).toEqual(
      [...ids].sort((a, b) => order.indexOf(a) - order.indexOf(b)),
    );
  });

  test('a trade or day with no hit is absent from the result', () => {
    const t = mk({ open: X });
    const r = run([t]);
    expect(r.byTrade.has(t.id)).toBe(false);
    expect(r.byDay.has(dateOf(100))).toBe(false);
  });

  test('every hit names its trade or its date', () => {
    const r = run([
      ...onDay(95, [100, 100]),
      ...onDay(100, [-100, -100, -100, -100], 2 * MIN),
    ]);
    for (const [id, hits] of r.byTrade)
      for (const h of hits) expect(h.tradeId).toBe(id);
    for (const [date, hits] of r.byDay)
      for (const h of hits) expect(h.date).toBe(date);
  });
});

describe('the day of a trade', () => {
  const NY = 'America/New_York';
  // Three days of one trade each, so a day of three trades stands out.
  const history = () =>
    [20, 21, 22].map((d) => mk({ open: Date.parse(`2026-02-${d}T15:00:00Z`) }));

  test('is its close date in the profile zone, as the trade log reads it', () => {
    // 22:00 New York on the 2nd to 01:00 on the 3rd: it belongs to the 3rd.
    const overnight = mk({
      open: Date.parse('2026-03-03T03:00:00Z'),
      hold: 3 * HOUR,
    });
    const a = mk({ open: Date.parse('2026-03-03T15:00:00Z') });
    const b = mk({ open: Date.parse('2026-03-03T16:00:00Z') });
    for (const t of [overnight, a, b])
      expect(dayOfTrade(t, NY)).toBe('2026-03-03');
    const r = run([...history(), overnight, a, b], { timeZone: NY });
    expect(r.byDay.get('2026-03-03')?.map((h) => h.id)).toContain(
      'more-trades',
    );
    expect(r.byDay.has('2026-03-02')).toBe(false);
  });

  test('is its open date while the trade is open', () => {
    const open = [15, 16, 17].map((h) =>
      mk({ open: Date.parse(`2026-03-04T${h}:00:00Z`), status: 'open' }),
    );
    for (const t of open) expect(dayOfTrade(t, NY)).toBe('2026-03-04');
    const r = run([...history(), ...open], { timeZone: NY });
    expect(r.byDay.get('2026-03-04')?.map((h) => h.id)).toContain(
      'more-trades',
    );
  });
});

describe('the P&L basis', () => {
  test('reads win and loss on the net by default and on the gross when asked', () => {
    // A loss of 100 net on 50 gross: fees of 150.
    const prior = mk({
      open: at(100, 14, 0),
      hold: 10 * MIN,
      net: -100,
      extra: { fees: 150, gross: 50 },
    });
    const x = mk({
      open: at(100, 14, 10, 10),
      net: -100,
      extra: { gross: -100 },
    });
    expect(tradeHit(run([prior, x]), x, 'loss-after-loss')).toBeDefined();
    expect(
      tradeHit(run([prior, x], { pnlBasis: 'gross' }), x, 'loss-after-loss'),
    ).toBeUndefined();
  });
});
