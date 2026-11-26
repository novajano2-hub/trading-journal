import { describe, expect, test } from 'vitest';
import {
  MIN,
  SEC,
  at,
  chain,
  dateOf,
  dayHit,
  iso,
  mk,
  onDay,
  run,
} from './__fixtures__/builders';

// Every look-back test reads the day 100; its history sits a few days before,
// inside the 60 days.
const D = 100;

/** `k` winning trades on test day `n`: a green day of `k` trades. */
const greenDay = (n: number, k: number) => onDay(n, Array(k).fill(100));
/** `k` losing trades on test day `n`: a red day of `k` trades. */
const redDay = (n: number, k: number) => onDay(n, Array(k).fill(-100));

describe('losses-outweighed', () => {
  test('flags a red day with a win rate of 50% and losses twice the wins', () => {
    const r = run(onDay(D, [100, 100, -250, -250]));
    expect(dayHit(r, D, 'losses-outweighed')).toEqual({
      id: 'losses-outweighed',
      date: dateOf(D),
      figures: { winRate: 0.5, avgWin: 100, avgLoss: 250, net: -300 },
    });
  });

  test('an average loss of exactly twice the average win counts', () => {
    const r = run(onDay(D, [100, 100, -200, -200]));
    expect(dayHit(r, D, 'losses-outweighed')).toBeDefined();
  });

  test('an average loss just under twice the average win does not', () => {
    const r = run(onDay(D, [100, 100, -199, -199]));
    expect(dayHit(r, D, 'losses-outweighed')).toBeUndefined();
  });

  test('a win rate under 50% does not', () => {
    const r = run(onDay(D, [100, 100, -250, -250, -250]));
    expect(dayHit(r, D, 'losses-outweighed')).toBeUndefined();
  });

  test('a green day does not, however large its one loss', () => {
    const r = run(onDay(D, [100, 100, 100, 100, -210]));
    expect(dayHit(r, D, 'losses-outweighed')).toBeUndefined();
  });

  test('a day with no loss has no average loss', () => {
    const r = run(onDay(D, [100, 100]));
    expect(dayHit(r, D, 'losses-outweighed')).toBeUndefined();
  });
});

/** One trade per `symbol:side` item, each losing or winning `net`, in the order given. */
const flips = (net: number, ...items: string[]) =>
  items.map((item) => {
    const [symbol, side] = item.split(':') as [string, 'long' | 'short'];
    return { symbol, direction: side, net };
  });

describe('switched-sides-red', () => {
  const sides = (...d: ('long' | 'short')[]) =>
    d.map((direction) => ({ direction, net: -100 }));

  test('flags a red day with three changes of side', () => {
    const r = run(onDay(D, sides('long', 'short', 'long', 'short')));
    expect(dayHit(r, D, 'switched-sides-red')).toEqual({
      id: 'switched-sides-red',
      date: dateOf(D),
      figures: { changes: 3, trades: 4, net: -400 },
    });
    expect(dayHit(r, D, 'switched-sides-green')).toBeUndefined();
  });

  test('two changes are not enough', () => {
    const r = run(onDay(D, sides('long', 'short', 'long')));
    expect(dayHit(r, D, 'switched-sides-red')).toBeUndefined();
  });

  test('counts the changes within one symbol, whatever else is traded between them', () => {
    // ES flips three times with other symbols' trades in between.
    const r = run(
      onDay(
        D,
        flips(
          -100,
          'ESZ5:long',
          'NQZ5:long',
          'ESZ5:short',
          'NQZ5:short',
          'ESZ5:long',
          'CLZ5:long',
          'ESZ5:short',
        ),
      ),
    );
    expect(dayHit(r, D, 'switched-sides-red')).toMatchObject({
      figures: { changes: 3, trades: 4, net: -700 },
    });
  });

  test('says how many trades the symbol had, those after its last change included', () => {
    const r = run(
      onDay(
        D,
        flips(
          -100,
          'ESZ5:long',
          'ESZ5:short',
          'ESZ5:long',
          'ESZ5:short',
          'ESZ5:short',
          'NQZ5:long',
        ),
      ),
    );
    expect(dayHit(r, D, 'switched-sides-red')).toMatchObject({
      figures: { changes: 3, trades: 5 },
    });
  });

  test('the same flips spread over three symbols are not a switch', () => {
    // Long, short, long, short is three changes across the day, but no symbol changes twice.
    const r = run(
      onDay(
        D,
        flips(-100, 'ESZ5:long', 'NQZ5:short', 'CLZ5:long', 'ESZ5:short'),
      ),
    );
    expect(dayHit(r, D, 'switched-sides-red')).toBeUndefined();
  });

  test('two symbols each flipping twice are not a switch: the symbol with the most counts', () => {
    const r = run(
      onDay(
        D,
        flips(
          -100,
          'ESZ5:long',
          'NQZ5:short',
          'ESZ5:short',
          'NQZ5:long',
          'ESZ5:long',
          'NQZ5:short',
        ),
      ),
    );
    expect(dayHit(r, D, 'switched-sides-red')).toBeUndefined();
  });

  test('one symbol with three changes and another with one is a switch of three', () => {
    const r = run(
      onDay(
        D,
        flips(
          -100,
          'ESZ5:long',
          'NQZ5:long',
          'ESZ5:short',
          'NQZ5:short',
          'ESZ5:long',
          'ESZ5:short',
        ),
      ),
    );
    expect(dayHit(r, D, 'switched-sides-red')).toMatchObject({
      figures: { changes: 3, trades: 4 },
    });
  });

  test('trades in a row on one side are not changes', () => {
    const r = run(onDay(D, sides('long', 'long', 'short', 'short', 'short')));
    expect(dayHit(r, D, 'switched-sides-red')).toBeUndefined();
  });

  test('reads the sides in the order of entry, not of the list', () => {
    const trades = onDay(D, sides('long', 'short', 'long', 'short'));
    expect(
      dayHit(run([...trades].reverse()), D, 'switched-sides-red'),
    ).toBeDefined();
  });

  test('a day that is not red does not', () => {
    const flat = onDay(
      D,
      [0, 0, 0, 0].map(
        (net, i) => ({ net, direction: i % 2 ? 'short' : 'long' }) as const,
      ),
    );
    const r = run(flat);
    expect(dayHit(r, D, 'switched-sides-red')).toBeUndefined();
    expect(dayHit(r, D, 'switched-sides-green')).toBeUndefined();
  });
});

describe('switched-sides-green', () => {
  const sides = (...d: ('long' | 'short')[]) =>
    d.map((direction) => ({ direction, net: 100 }));

  test('flags a green day with three changes of side', () => {
    const r = run(onDay(D, sides('short', 'long', 'short', 'long')));
    expect(dayHit(r, D, 'switched-sides-green')).toEqual({
      id: 'switched-sides-green',
      date: dateOf(D),
      figures: { changes: 3, trades: 4, net: 400 },
    });
    expect(dayHit(r, D, 'switched-sides-red')).toBeUndefined();
  });

  test('two changes are not enough', () => {
    const r = run(onDay(D, sides('short', 'long', 'short')));
    expect(dayHit(r, D, 'switched-sides-green')).toBeUndefined();
  });

  test('counts the changes within one symbol, whatever else is traded between them', () => {
    const r = run(
      onDay(
        D,
        flips(
          100,
          'NQZ5:short',
          'ESZ5:long',
          'NQZ5:long',
          'ESZ5:short',
          'NQZ5:short',
          'NQZ5:long',
        ),
      ),
    );
    expect(dayHit(r, D, 'switched-sides-green')).toMatchObject({
      figures: { changes: 3, trades: 4, net: 600 },
    });
    expect(dayHit(r, D, 'switched-sides-red')).toBeUndefined();
  });

  test('the same flips spread over three symbols are not a switch', () => {
    const r = run(
      onDay(
        D,
        flips(100, 'ESZ5:short', 'NQZ5:long', 'CLZ5:short', 'ESZ5:long'),
      ),
    );
    expect(dayHit(r, D, 'switched-sides-green')).toBeUndefined();
  });

  test('two symbols each flipping twice are not a switch', () => {
    const r = run(
      onDay(
        D,
        flips(
          100,
          'ESZ5:long',
          'NQZ5:short',
          'ESZ5:short',
          'NQZ5:long',
          'ESZ5:long',
          'NQZ5:short',
        ),
      ),
    );
    expect(dayHit(r, D, 'switched-sides-green')).toBeUndefined();
  });

  test('a red day does not', () => {
    const r = run(
      onDay(D, [
        { direction: 'long', net: -100 },
        { direction: 'short', net: -100 },
        { direction: 'long', net: -100 },
        { direction: 'short', net: 100 },
      ]),
    );
    expect(dayHit(r, D, 'switched-sides-green')).toBeUndefined();
  });
});

describe('one-strong-trade', () => {
  const one = (net: number, risk?: number) =>
    onDay(D, [{ net, ...(risk !== undefined ? { risk } : {}) }]);

  test('flags a lone win of 3R or more', () => {
    expect(dayHit(run(one(300, 100)), D, 'one-strong-trade')).toEqual({
      id: 'one-strong-trade',
      date: dateOf(D),
      figures: { r: 3, net: 300 },
    });
    expect(dayHit(run(one(450, 100)), D, 'one-strong-trade')).toMatchObject({
      figures: { r: 4.5 },
    });
  });

  test('2.99R is not enough', () => {
    expect(dayHit(run(one(299, 100)), D, 'one-strong-trade')).toBeUndefined();
  });

  test('a trade without a risk has no R', () => {
    expect(dayHit(run(one(900)), D, 'one-strong-trade')).toBeUndefined();
  });

  test('a loss is not strong', () => {
    expect(dayHit(run(one(-300, 100)), D, 'one-strong-trade')).toBeUndefined();
  });

  test('a second trade ends it', () => {
    const r = run(onDay(D, [{ net: 300, risk: 100 }, { net: 1 }]));
    expect(dayHit(r, D, 'one-strong-trade')).toBeUndefined();
  });

  test('a trade still open is not a win', () => {
    const open = onDay(D, [{ net: 300, risk: 100, status: 'open' }]);
    expect(dayHit(run(open), D, 'one-strong-trade')).toBeUndefined();
  });

  test('a breakeven is not a win, however its R reads', () => {
    const r = run(one(300, 100), {
      breakevenRange: { unit: 'amount', from: -500, to: 500 },
    });
    expect(dayHit(r, D, 'one-strong-trade')).toBeUndefined();
  });
});

describe('low-return', () => {
  // Two green days in the look-back, 1,000 and 1,200: half the average is 550.
  const history = () => [...onDay(95, [1000]), ...onDay(96, [1200])];

  test('flags three trades, green, below half the average green day', () => {
    const r = run([...history(), ...onDay(D, [200, 200, 149])]);
    expect(dayHit(r, D, 'low-return')).toEqual({
      id: 'low-return',
      date: dateOf(D),
      figures: { net: 549, avgGreenNet: 1100, trades: 3, greenDays: 2 },
    });
  });

  test('exactly half is not below it', () => {
    const r = run([...history(), ...onDay(D, [200, 200, 150])]);
    expect(dayHit(r, D, 'low-return')).toBeUndefined();
  });

  test('two trades are not enough', () => {
    const r = run([...history(), ...onDay(D, [200, 100])]);
    expect(dayHit(r, D, 'low-return')).toBeUndefined();
  });

  test('a red day does not', () => {
    const r = run([...history(), ...onDay(D, [-200, -200, 149])]);
    expect(dayHit(r, D, 'low-return')).toBeUndefined();
  });

  test('red days in the look-back are not green days', () => {
    const r = run([...redDay(95, 2), ...onDay(D, [20, 20, 20])]);
    expect(dayHit(r, D, 'low-return')).toBeUndefined();
  });

  test('an empty look-back flags nothing', () => {
    expect(
      dayHit(run(onDay(D, [20, 20, 20])), D, 'low-return'),
    ).toBeUndefined();
  });

  test('the look-back is the 60 days before the day, its first day included', () => {
    const today = onDay(D, [20, 20, 20]);
    expect(
      dayHit(run([...onDay(D - 60, [1000]), ...today]), D, 'low-return'),
    ).toBeDefined();
    expect(
      dayHit(run([...onDay(D - 61, [1000]), ...today]), D, 'low-return'),
    ).toBeUndefined();
    // The day itself is not in its own look-back.
    expect(dayHit(run(today), D, 'low-return')).toBeUndefined();
  });
});

describe('sized-up-after-wins', () => {
  // The look-back holds two losses of 100: the average loss is 100.
  const history = () => onDay(98, [-100, -100]);
  const streak = (loss: number, lossVolume = 2) => [
    { net: 100, volume: 1 },
    { net: 100, volume: 1 },
    { net: 100, volume: 1 },
    { net: loss, volume: lossVolume },
  ];

  test('flags a larger loss, in a larger size, after three wins in a row', () => {
    const r = run([...history(), ...onDay(D, streak(-101))]);
    expect(dayHit(r, D, 'sized-up-after-wins')).toEqual({
      id: 'sized-up-after-wins',
      date: dateOf(D),
      figures: { streak: 3, size: 2, previousSize: 1, loss: 101, avgLoss: 100 },
    });
  });

  test('a loss equal to the average loss is not larger', () => {
    const r = run([...history(), ...onDay(D, streak(-100))]);
    expect(dayHit(r, D, 'sized-up-after-wins')).toBeUndefined();
  });

  test('the same size is not sized up', () => {
    const r = run([...history(), ...onDay(D, streak(-500, 1))]);
    expect(dayHit(r, D, 'sized-up-after-wins')).toBeUndefined();
  });

  test('two wins in a row are not enough', () => {
    const r = run([
      ...history(),
      ...onDay(D, [
        { net: -100, volume: 1 },
        { net: 100, volume: 1 },
        { net: 100, volume: 1 },
        { net: -500, volume: 2 },
      ]),
    ]);
    expect(dayHit(r, D, 'sized-up-after-wins')).toBeUndefined();
  });

  test('a longer streak counts, and says how long', () => {
    const r = run([
      ...history(),
      ...onDay(D, [{ net: 100, volume: 1 }, ...streak(-500)]),
    ]);
    expect(dayHit(r, D, 'sized-up-after-wins')).toMatchObject({
      figures: { streak: 4 },
    });
  });

  test('only a loss is flagged, however large the win in a larger size', () => {
    const r = run([
      ...history(),
      ...onDay(D, [
        { net: 100, volume: 1 },
        { net: 100, volume: 1 },
        { net: 100, volume: 1 },
        { net: 500, volume: 2 },
      ]),
    ]);
    expect(dayHit(r, D, 'sized-up-after-wins')).toBeUndefined();
  });

  test('a breakeven breaks the streak', () => {
    const r = run([
      ...history(),
      ...onDay(D, [
        { net: 100, volume: 1 },
        { net: 100, volume: 1 },
        { net: 0, volume: 1 },
        { net: -500, volume: 2 },
      ]),
    ]);
    expect(dayHit(r, D, 'sized-up-after-wins')).toBeUndefined();
  });

  test('the streak is read in the order of entry', () => {
    const trades = onDay(D, streak(-500));
    const r = run([...history(), ...[...trades].reverse()]);
    expect(dayHit(r, D, 'sized-up-after-wins')).toBeDefined();
  });

  test('an empty look-back has no average loss', () => {
    const r = run(onDay(D, streak(-5000)));
    expect(dayHit(r, D, 'sized-up-after-wins')).toBeUndefined();
  });

  test('the day own losses are not in its look-back', () => {
    // Without the history the only loss would be the day's own.
    const r = run([...onDay(D - 61, [-100, -100]), ...onDay(D, streak(-500))]);
    expect(dayHit(r, D, 'sized-up-after-wins')).toBeUndefined();
  });
});

describe('more-trades', () => {
  const threes = () => [95, 96, 97].flatMap((n) => greenDay(n, 3));
  const fours = () => [95, 96, 97].flatMap((n) => greenDay(n, 4));

  test('flags a count a third over the 60-day daily average', () => {
    const r = run([...threes(), ...greenDay(D, 4)]);
    expect(dayHit(r, D, 'more-trades')).toEqual({
      id: 'more-trades',
      date: dateOf(D),
      figures: { trades: 4, average: 3, days: 3 },
    });
  });

  test('the average count itself is not more', () => {
    const r = run([...greenDay(95, 1), ...greenDay(D, 1)]);
    expect(dayHit(r, D, 'more-trades')).toBeUndefined();
  });

  test('a count just under a third over does not', () => {
    // An average of 4: 5 trades are 25% over, 6 are 50% over.
    expect(
      dayHit(run([...fours(), ...greenDay(D, 5)]), D, 'more-trades'),
    ).toBeUndefined();
    expect(
      dayHit(run([...fours(), ...greenDay(D, 6)]), D, 'more-trades'),
    ).toBeDefined();
  });

  test('the average is over the days traded, whatever the day result', () => {
    const history = [...greenDay(95, 2), ...redDay(96, 4)]; // average 3
    expect(
      dayHit(run([...history, ...greenDay(D, 4)]), D, 'more-trades'),
    ).toBeDefined();
    expect(
      dayHit(run([...history, ...greenDay(D, 3)]), D, 'more-trades'),
    ).toBeUndefined();
  });

  test('an empty look-back flags nothing', () => {
    expect(dayHit(run(greenDay(D, 50)), D, 'more-trades')).toBeUndefined();
  });

  test('the look-back is the 60 days before the day, its first day included', () => {
    const today = greenDay(D, 2);
    expect(
      dayHit(run([...greenDay(D - 60, 1), ...today]), D, 'more-trades'),
    ).toBeDefined();
    expect(
      dayHit(run([...greenDay(D - 61, 1), ...today]), D, 'more-trades'),
    ).toBeUndefined();
  });

  test('a trade still open counts toward the day', () => {
    const today = [...greenDay(D, 3), mk({ open: at(D, 18), status: 'open' })];
    expect(
      dayHit(run([...threes(), ...today]), D, 'more-trades'),
    ).toBeDefined();
  });
});

describe('waited-then-won', () => {
  const session = { start: iso(at(D, 13, 0)) };
  const sessions = new Map([[dateOf(D), session]]);
  const first = (h: number, m: number, s: number, net = 100) => [
    mk({ open: at(D, h, m, s), net }),
  ];

  test('flags a green day that began 90 minutes after the session start', () => {
    const r = run(first(14, 30, 0), { sessions });
    expect(dayHit(r, D, 'waited-then-won')).toEqual({
      id: 'waited-then-won',
      date: dateOf(D),
      figures: { waitMinutes: 90, net: 100 },
    });
  });

  test('a wait a second short does not', () => {
    const r = run(first(14, 29, 59), { sessions });
    expect(dayHit(r, D, 'waited-then-won')).toBeUndefined();
  });

  test('the wait runs to the first entry of the day', () => {
    const r = run([...first(14, 31, 0), ...first(13, 10, 0)], { sessions });
    expect(dayHit(r, D, 'waited-then-won')).toBeUndefined();
  });

  test('a day that is not green does not', () => {
    expect(
      dayHit(run(first(15, 0, 0, -100), { sessions }), D, 'waited-then-won'),
    ).toBeUndefined();
  });

  test('a day without a session does not', () => {
    expect(dayHit(run(first(16, 0, 0)), D, 'waited-then-won')).toBeUndefined();
    const elsewhere = new Map([[dateOf(D - 1), session]]);
    expect(
      dayHit(
        run(first(16, 0, 0), { sessions: elsewhere }),
        D,
        'waited-then-won',
      ),
    ).toBeUndefined();
  });

  test('reads the session start only, whether or not it has ended', () => {
    const done = new Map([
      [dateOf(D), { start: session.start, end: iso(at(D, 20)) }],
    ]);
    expect(
      dayHit(run(first(14, 30, 0), { sessions: done }), D, 'waited-then-won'),
    ).toBeDefined();
  });
});

describe('quick-reentries', () => {
  // A loss exiting 14:10:00, then trades entered soon after each exit.
  const loss = () => mk({ open: at(D, 14, 0), hold: 10 * MIN, net: -100 });
  const quick = (open: number, net = -100, hold = 90 * SEC) =>
    mk({ open, hold, net });

  test('flags two trades entered within a minute of a loss exit, both lost', () => {
    const trades = [
      loss(),
      quick(at(D, 14, 10, 30)), // 30 s after the loss; exits 14:12:00
      quick(at(D, 14, 12, 50)), // 50 s after that loss
    ];
    expect(dayHit(run(trades), D, 'quick-reentries')).toEqual({
      id: 'quick-reentries',
      date: dateOf(D),
      figures: { trades: 2, loss: 200 },
    });
  });

  test('one is not a cycle', () => {
    const r = run([loss(), quick(at(D, 14, 10, 30))]);
    expect(dayHit(r, D, 'quick-reentries')).toBeUndefined();
  });

  test('exactly a minute counts, a second more does not', () => {
    const base = () => [loss(), quick(at(D, 14, 10, 30))];
    expect(
      dayHit(run([...base(), quick(at(D, 14, 13, 0))]), D, 'quick-reentries'),
    ).toBeDefined();
    expect(
      dayHit(run([...base(), quick(at(D, 14, 13, 1))]), D, 'quick-reentries'),
    ).toBeUndefined();
  });

  test('a re-entry that won does not count', () => {
    const r = run([
      loss(),
      quick(at(D, 14, 10, 30)),
      quick(at(D, 14, 12, 50), 100),
    ]);
    expect(dayHit(r, D, 'quick-reentries')).toBeUndefined();
  });

  test('a lone loss has no exit before it', () => {
    expect(
      dayHit(run([quick(at(D, 14, 0, 0))]), D, 'quick-reentries'),
    ).toBeUndefined();
  });
});

describe('rushed-red-day', () => {
  /** `n` trades each held `hold`, entered `gap` after the exit before. */
  const rush = (n: number, hold: number, gap: number, net = -100) =>
    chain(
      D,
      Array.from({ length: n }, () => ({ hold, gap, net })),
    );

  test('flags a red day of five trades, a median hold under 5 minutes and a median gap under 2', () => {
    const r = run(rush(5, 2 * MIN, 1 * MIN));
    expect(dayHit(r, D, 'rushed-red-day')).toEqual({
      id: 'rushed-red-day',
      date: dateOf(D),
      figures: {
        trades: 5,
        medianHoldMs: 2 * MIN,
        medianGapMs: 1 * MIN,
        net: -500,
      },
    });
  });

  test('four trades are not enough', () => {
    expect(
      dayHit(run(rush(4, 2 * MIN, MIN)), D, 'rushed-red-day'),
    ).toBeUndefined();
  });

  test('a median hold of 5 minutes is not under 5', () => {
    expect(
      dayHit(run(rush(5, 5 * MIN, MIN)), D, 'rushed-red-day'),
    ).toBeUndefined();
    expect(
      dayHit(run(rush(5, 5 * MIN - SEC, MIN)), D, 'rushed-red-day'),
    ).toBeDefined();
  });

  test('a median gap of 2 minutes is not under 2', () => {
    expect(
      dayHit(run(rush(5, MIN, 2 * MIN)), D, 'rushed-red-day'),
    ).toBeUndefined();
    expect(
      dayHit(run(rush(5, MIN, 2 * MIN - SEC)), D, 'rushed-red-day'),
    ).toBeDefined();
  });

  test('the median of an even count is the mean of the middle two', () => {
    // Holds 1, 1, 1, 9, 9, 9 minutes: a median of 5, not the lower middle 1.
    const holds = [1, 1, 1, 9, 9, 9].map((m) => ({
      hold: m * MIN,
      gap: MIN,
      net: -100,
    }));
    expect(dayHit(run(chain(D, holds)), D, 'rushed-red-day')).toBeUndefined();
  });

  test('a day that is not red does not', () => {
    expect(
      dayHit(run(rush(5, 2 * MIN, MIN, 100)), D, 'rushed-red-day'),
    ).toBeUndefined();
  });

  test('trades that overlap have a gap of zero, not a negative one', () => {
    // Five trades entered 1 minute apart and held 10: each opens before the last exits.
    const overlapping = Array.from({ length: 5 }, (_, i) =>
      mk({ open: at(D) + i * MIN, hold: 10 * MIN, net: -100 }),
    );
    // Median hold 10 minutes: not under 5, so it stays unflagged either way.
    expect(dayHit(run(overlapping), D, 'rushed-red-day')).toBeUndefined();
    const quickOverlap = Array.from({ length: 5 }, (_, i) =>
      mk({ open: at(D) + i * MIN, hold: 4 * MIN, net: -100 }),
    );
    // Holds of 4 minutes, entered a minute apart: gaps read 0.
    expect(dayHit(run(quickOverlap), D, 'rushed-red-day')).toMatchObject({
      figures: { medianGapMs: 0 },
    });
  });
});

describe('busier-than-green', () => {
  // Two green days of two trades; a red day of ten that must not count.
  const history = () => [
    ...greenDay(95, 2),
    ...greenDay(96, 2),
    ...redDay(97, 10),
  ];

  test('flags at least twice the average count of green days', () => {
    const r = run([...history(), ...greenDay(D, 4)]);
    expect(dayHit(r, D, 'busier-than-green')).toEqual({
      id: 'busier-than-green',
      date: dateOf(D),
      figures: { trades: 4, average: 2, greenDays: 2 },
    });
  });

  test('a count under twice the average does not', () => {
    expect(
      dayHit(run([...history(), ...greenDay(D, 3)]), D, 'busier-than-green'),
    ).toBeUndefined();
  });

  test('a red day can be the busy one', () => {
    expect(
      dayHit(run([...history(), ...redDay(D, 5)]), D, 'busier-than-green'),
    ).toBeDefined();
  });

  test('no green day in the look-back, no average', () => {
    expect(
      dayHit(
        run([...redDay(95, 1), ...greenDay(D, 9)]),
        D,
        'busier-than-green',
      ),
    ).toBeUndefined();
    expect(dayHit(run(greenDay(D, 9)), D, 'busier-than-green')).toBeUndefined();
  });

  test('the look-back is the 60 days before the day, its first day included', () => {
    expect(
      dayHit(
        run([...greenDay(D - 60, 1), ...greenDay(D, 2)]),
        D,
        'busier-than-green',
      ),
    ).toBeDefined();
    expect(
      dayHit(
        run([...greenDay(D - 61, 1), ...greenDay(D, 2)]),
        D,
        'busier-than-green',
      ),
    ).toBeUndefined();
  });
});
