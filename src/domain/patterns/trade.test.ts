import { describe, expect, test } from 'vitest';
import { DAY, MIN, SEC, at, mk, run, tradeHit } from './__fixtures__/builders';

// Every look-back test reads the trade at day 100, 14:00 UTC; its history sits
// a few days before, inside the 60 days.
const X = at(100);

describe('held-longer', () => {
  // Four wins held 10, 20, 30 and 40 minutes: 75% of them closed within 30.
  const wins = () =>
    [10, 20, 30, 40].map((m, i) =>
      mk({ open: at(95 + i), hold: m * MIN, net: 100 }),
    );

  test('flags a win held longer than 75% of the past 60 days of wins', () => {
    const x = mk({ open: X, hold: 31 * MIN, net: 100 });
    const r = run([...wins(), x]);
    expect(tradeHit(r, x, 'held-longer')).toEqual({
      id: 'held-longer',
      tradeId: x.id,
      figures: { holdMs: 31 * MIN, limitMs: 30 * MIN, sample: 4, win: 1 },
    });
  });

  test('a win held exactly as long as the 75th percentile is not longer', () => {
    const x = mk({ open: X, hold: 30 * MIN, net: 100 });
    expect(tradeHit(run([...wins(), x]), x, 'held-longer')).toBeUndefined();
  });

  test('a loss is read against losses only', () => {
    // Losses held 1 to 4 minutes (75% within 3); wins held far longer.
    const history = [
      ...[1, 2, 3, 4].map((m, i) =>
        mk({ open: at(90 + i), hold: m * MIN, net: -100 }),
      ),
      ...[60, 70, 80, 90].map((m, i) =>
        mk({ open: at(94 + i), hold: m * MIN, net: 100 }),
      ),
    ];
    const x = mk({ open: X, hold: 5 * MIN, net: -100 });
    expect(tradeHit(run([...history, x]), x, 'held-longer')).toMatchObject({
      figures: { holdMs: 5 * MIN, limitMs: 3 * MIN, sample: 4, win: 0 },
    });
  });

  test('a win is not read against losses', () => {
    const history = [
      ...[1, 2, 3, 4].map((m, i) =>
        mk({ open: at(90 + i), hold: m * MIN, net: -100 }),
      ),
      ...[60, 70, 80, 90].map((m, i) =>
        mk({ open: at(94 + i), hold: m * MIN, net: 100 }),
      ),
    ];
    const x = mk({ open: X, hold: 50 * MIN, net: 100 });
    expect(tradeHit(run([...history, x]), x, 'held-longer')).toBeUndefined();
  });

  test('an empty look-back flags nothing', () => {
    const x = mk({ open: X, hold: 90 * MIN, net: 100 });
    expect(tradeHit(run([x]), x, 'held-longer')).toBeUndefined();
  });

  test('the look-back is the 60 days before the entry, its first instant included', () => {
    const edge = X - 60 * DAY;
    const y = mk({ open: edge - 10 * MIN, hold: 10 * MIN, net: 100 });
    const x = mk({ open: X, hold: 20 * MIN, net: 100 });
    expect(tradeHit(run([y, x]), x, 'held-longer')).toBeDefined();
    const older = mk({ open: edge - 10 * MIN - 1, hold: 10 * MIN, net: 100 });
    expect(tradeHit(run([older, x]), x, 'held-longer')).toBeUndefined();
  });

  test('a trade that exited at the very instant of the entry is not in the look-back', () => {
    const y = mk({ open: X - 10 * MIN, hold: 10 * MIN, net: 100 });
    const x = mk({ open: X, hold: 20 * MIN, net: 100 });
    expect(tradeHit(run([y, x]), x, 'held-longer')).toBeUndefined();
  });

  test('a trade still open at the entry is not in the look-back', () => {
    const y = mk({ open: at(99), hold: 5 * DAY, net: 100 });
    const x = mk({ open: X, hold: 20 * MIN, net: 100 });
    expect(tradeHit(run([y, x]), x, 'held-longer')).toBeUndefined();
  });

  test('an open trade is skipped, and so is an open trade in the history', () => {
    const open = mk({ open: at(99), status: 'open' });
    const x = mk({ open: X, status: 'open' });
    const win = mk({ open: at(98), hold: 10 * MIN, net: 100 });
    const r = run([open, win, x]);
    expect(tradeHit(r, x, 'held-longer')).toBeUndefined();
    const y = mk({ open: at(100, 15), hold: 20 * MIN, net: 100 });
    // The open trade is not a hold of zero: the lone win is the whole sample.
    expect(tradeHit(run([open, win, y]), y, 'held-longer')).toMatchObject({
      figures: { sample: 1, limitMs: 10 * MIN },
    });
  });
});

describe('long-loss-hold', () => {
  // Four losses held 10 to 40 minutes, losing 50, 100, 150 and 200: the
  // median hold is 20 minutes and the average loss 125.
  const losses = () =>
    [10, 20, 30, 40].map((m, i) =>
      mk({ open: at(95 + i), hold: m * MIN, net: -(i + 1) * 50 }),
    );

  test('flags a loss held longer than half the past 60 days of losses and larger than their average', () => {
    const x = mk({ open: X, hold: 21 * MIN, net: -126 });
    expect(tradeHit(run([...losses(), x]), x, 'long-loss-hold')).toEqual({
      id: 'long-loss-hold',
      tradeId: x.id,
      figures: {
        holdMs: 21 * MIN,
        limitMs: 20 * MIN,
        loss: 126,
        avgLoss: 125,
        sample: 4,
      },
    });
  });

  test('a loss held exactly as long as the median is not longer', () => {
    const x = mk({ open: X, hold: 20 * MIN, net: -500 });
    expect(
      tradeHit(run([...losses(), x]), x, 'long-loss-hold'),
    ).toBeUndefined();
  });

  test('a loss equal to the average is not larger', () => {
    const x = mk({ open: X, hold: 21 * MIN, net: -125 });
    expect(
      tradeHit(run([...losses(), x]), x, 'long-loss-hold'),
    ).toBeUndefined();
  });

  test('a win is never flagged', () => {
    const x = mk({ open: X, hold: 60 * MIN, net: 500 });
    expect(
      tradeHit(run([...losses(), x]), x, 'long-loss-hold'),
    ).toBeUndefined();
  });

  test('an empty look-back of losses flags nothing', () => {
    const wins = [10, 20].map((m, i) =>
      mk({ open: at(95 + i), hold: m * MIN, net: 100 }),
    );
    const x = mk({ open: X, hold: 60 * MIN, net: -500 });
    expect(tradeHit(run([...wins, x]), x, 'long-loss-hold')).toBeUndefined();
    expect(tradeHit(run([x]), x, 'long-loss-hold')).toBeUndefined();
  });

  test('losses older than 60 days are not counted', () => {
    const old = losses().map((t) => ({
      ...t,
      openedAt: new Date(Date.parse(t.openedAt) - 70 * DAY).toISOString(),
      closedAt: new Date(Date.parse(t.closedAt!) - 70 * DAY).toISOString(),
    }));
    const x = mk({ open: X, hold: 21 * MIN, net: -126 });
    expect(tradeHit(run([...old, x]), x, 'long-loss-hold')).toBeUndefined();
  });
});

describe('loss-after-loss', () => {
  const lossAt = (open: number, hold = 10 * MIN) =>
    mk({ open, hold, net: -100 });
  const y = () => lossAt(at(100, 14, 0)); // exits 14:10:00

  test('flags a loss entered within 30 seconds of a losing trade exit', () => {
    const prior = y();
    const x = mk({ open: at(100, 14, 10, 30), net: -80 });
    expect(tradeHit(run([prior, x]), x, 'loss-after-loss')).toEqual({
      id: 'loss-after-loss',
      tradeId: x.id,
      figures: { gapMs: 30 * SEC, priorLoss: 100 },
    });
  });

  test('31 seconds is too long', () => {
    const x = mk({ open: at(100, 14, 10, 31), net: -80 });
    expect(tradeHit(run([y(), x]), x, 'loss-after-loss')).toBeUndefined();
  });

  test('an entry at the instant of the exit counts', () => {
    const x = mk({ open: at(100, 14, 10, 0), net: -80 });
    expect(tradeHit(run([y(), x]), x, 'loss-after-loss')).toMatchObject({
      figures: { gapMs: 0 },
    });
  });

  test('an entry before the exit is not after it', () => {
    const x = mk({ open: at(100, 14, 9, 50), net: -80 });
    expect(tradeHit(run([y(), x]), x, 'loss-after-loss')).toBeUndefined();
  });

  test('the trade itself must be a loss', () => {
    const x = mk({ open: at(100, 14, 10, 10), net: 80 });
    expect(tradeHit(run([y(), x]), x, 'loss-after-loss')).toBeUndefined();
  });

  test('the trade before must be a loss', () => {
    const win = mk({ open: at(100, 14, 0), hold: 10 * MIN, net: 100 });
    const x = mk({ open: at(100, 14, 10, 10), net: -80 });
    expect(tradeHit(run([win, x]), x, 'loss-after-loss')).toBeUndefined();
  });

  test('a win exiting in between does not hide the loss before it', () => {
    const win = mk({ open: at(100, 14, 9), hold: 60 * SEC + 5 * SEC, net: 50 });
    const x = mk({ open: at(100, 14, 10, 20), net: -80 });
    // The loss exits 14:10:00 (20 s before), the win 14:10:05.
    expect(tradeHit(run([y(), win, x]), x, 'loss-after-loss')).toMatchObject({
      figures: { gapMs: 20 * SEC },
    });
  });

  test('the nearest loss exit sets the gap', () => {
    const first = lossAt(at(100, 13, 50), 10 * MIN); // exits 14:00:00
    const x = mk({ open: at(100, 14, 10, 20), net: -80 });
    expect(tradeHit(run([first, y(), x]), x, 'loss-after-loss')).toMatchObject({
      figures: { gapMs: 20 * SEC },
    });
  });

  test('a loss still open is no exit', () => {
    const open = mk({ open: at(100, 14, 0), status: 'open', net: -100 });
    const x = mk({ open: at(100, 14, 10, 10), net: -80 });
    expect(tradeHit(run([open, x]), x, 'loss-after-loss')).toBeUndefined();
  });

  test('a loss in another account counts', () => {
    const other = mk({
      open: at(100, 14, 0),
      hold: 10 * MIN,
      net: -100,
      extra: { accountId: 'a2' },
    });
    const x = mk({ open: at(100, 14, 10, 10), net: -80 });
    expect(tradeHit(run([other, x]), x, 'loss-after-loss')).toBeDefined();
  });

  test('an empty look-back flags nothing', () => {
    const x = mk({ open: X, net: -80 });
    expect(tradeHit(run([x]), x, 'loss-after-loss')).toBeUndefined();
  });

  test('a trade is never its own prior loss', () => {
    const x = mk({ open: X, hold: 0, net: -80 });
    expect(tradeHit(run([x]), x, 'loss-after-loss')).toBeUndefined();
  });
});

describe('added-to-position', () => {
  test('flags two or more entries', () => {
    const two = mk({ open: X, volume: 2, entries: 2, exits: 1 });
    const three = mk({ open: X, volume: 3, entries: 3, exits: 1 });
    const r = run([two, three]);
    expect(tradeHit(r, two, 'added-to-position')).toEqual({
      id: 'added-to-position',
      tradeId: two.id,
      figures: { entries: 2, volume: 2 },
    });
    expect(tradeHit(r, three, 'added-to-position')).toMatchObject({
      figures: { entries: 3, volume: 3 },
    });
  });

  test('one entry is not adding', () => {
    const one = mk({ open: X, volume: 2, entries: 1, exits: 2 });
    expect(tradeHit(run([one]), one, 'added-to-position')).toBeUndefined();
  });

  test('exits do not count, on a long or a short', () => {
    const long = mk({ open: X, entries: 1, exits: 3 });
    const short = mk({
      open: X,
      direction: 'short',
      volume: 2,
      entries: 1,
      exits: 2,
    });
    const r = run([long, short]);
    expect(tradeHit(r, long, 'added-to-position')).toBeUndefined();
    expect(tradeHit(r, short, 'added-to-position')).toBeUndefined();
  });

  test('a short counts its sells as entries', () => {
    const short = mk({
      open: X,
      direction: 'short',
      volume: 2,
      entries: 2,
      exits: 1,
    });
    expect(tradeHit(run([short]), short, 'added-to-position')).toMatchObject({
      figures: { entries: 2 },
    });
  });

  test('an open trade counts', () => {
    const open = mk({ open: X, status: 'open', volume: 2, entries: 2 });
    expect(tradeHit(run([open]), open, 'added-to-position')).toBeDefined();
  });

  test('a trade without fills has no entries to count', () => {
    const bare = mk({ open: X });
    expect(tradeHit(run([bare]), bare, 'added-to-position')).toBeUndefined();
  });
});

describe('exited-in-parts', () => {
  test('flags two or more exits, with the average exit, the gross P&L and the tick to read the price by', () => {
    const t = mk({
      open: X,
      volume: 2,
      entries: 1,
      exits: 2,
      net: 1050,
      extra: { avgExit: 4512.25, gross: 1150, fees: 100 },
    });
    expect(tradeHit(run([t]), t, 'exited-in-parts')).toEqual({
      id: 'exited-in-parts',
      tradeId: t.id,
      figures: { exits: 2, avgExit: 4512.25, gross: 1150, tick: 0.25 },
    });
  });

  test('a losing trade carries its gross loss, signed', () => {
    const t = mk({
      open: X,
      volume: 3,
      entries: 1,
      exits: 3,
      net: -2400,
      extra: { avgExit: 4490.5, gross: -2300, fees: 100 },
    });
    expect(tradeHit(run([t]), t, 'exited-in-parts')?.figures).toMatchObject({
      exits: 3,
      avgExit: 4490.5,
      gross: -2300,
    });
  });

  test('one exit is not parts', () => {
    const t = mk({ open: X, volume: 2, entries: 2, exits: 1 });
    expect(tradeHit(run([t]), t, 'exited-in-parts')).toBeUndefined();
  });

  test('entries do not count', () => {
    const t = mk({ open: X, volume: 3, entries: 3, exits: 1 });
    expect(tradeHit(run([t]), t, 'exited-in-parts')).toBeUndefined();
  });

  test('a trade still open has not closed in parts', () => {
    const t = mk({ open: X, status: 'open', volume: 3, entries: 1, exits: 2 });
    expect(tradeHit(run([t]), t, 'exited-in-parts')).toBeUndefined();
  });

  test('a trade without fills has no exits to count', () => {
    const bare = mk({ open: X });
    expect(tradeHit(run([bare]), bare, 'exited-in-parts')).toBeUndefined();
  });
});

describe('large-size', () => {
  // Four trades of 1, 2, 3 and 4 contracts: 75% of them were 3 or fewer.
  const sizes = () =>
    [1, 2, 3, 4].map((v, i) => mk({ open: at(95 + i), volume: v }));

  test('flags a volume above 75% of the trades of the past 60 days', () => {
    const x = mk({ open: X, volume: 3.5 });
    expect(tradeHit(run([...sizes(), x]), x, 'large-size')).toEqual({
      id: 'large-size',
      tradeId: x.id,
      figures: { volume: 3.5, limit: 3, sample: 4 },
    });
  });

  test('a volume at the 75th percentile is not above it', () => {
    const x = mk({ open: X, volume: 3 });
    expect(tradeHit(run([...sizes(), x]), x, 'large-size')).toBeUndefined();
  });

  test('reads the volume from the entry fills, as everywhere else', () => {
    // 3 + 2 bought, the 5 sold out: a volume of 5 whatever maxPosition says.
    const x = mk({ open: X, volume: 5, entries: 2, exits: 1 });
    x.maxPosition = 1;
    expect(tradeHit(run([...sizes(), x]), x, 'large-size')).toMatchObject({
      figures: { volume: 5 },
    });
  });

  test('an open trade is flagged', () => {
    const x = mk({ open: X, status: 'open', volume: 10 });
    expect(tradeHit(run([...sizes(), x]), x, 'large-size')).toBeDefined();
  });

  test('open trades are in the sample', () => {
    // Three 5-lot trades and two open 20-lot trades: 75% are 20 or fewer...
    const history = [
      ...[5, 5, 5].map((v, i) => mk({ open: at(90 + i), volume: v })),
      ...[20, 20].map((v, i) =>
        mk({ open: at(94 + i), volume: v, status: 'open' }),
      ),
    ];
    const x = mk({ open: X, volume: 7 });
    expect(tradeHit(run([...history, x]), x, 'large-size')).toBeUndefined();
    // ...where without them 7 is above all three.
    expect(
      tradeHit(run([...history.slice(0, 3), x]), x, 'large-size'),
    ).toBeDefined();
  });

  test('an empty look-back flags nothing', () => {
    const x = mk({ open: X, volume: 100 });
    expect(tradeHit(run([x]), x, 'large-size')).toBeUndefined();
  });

  test('the look-back is the 60 days before the entry, its first instant included', () => {
    const x = mk({ open: X, volume: 2 });
    const edge = mk({ open: X - 60 * DAY, volume: 1 });
    expect(tradeHit(run([edge, x]), x, 'large-size')).toBeDefined();
    const older = mk({ open: X - 60 * DAY - 1, volume: 1 });
    expect(tradeHit(run([older, x]), x, 'large-size')).toBeUndefined();
  });

  test('a trade entered at the same instant is not before it', () => {
    const a = mk({ open: X, volume: 1 });
    const b = mk({ open: X, volume: 2 });
    const r = run([a, b]);
    expect(tradeHit(r, a, 'large-size')).toBeUndefined();
    expect(tradeHit(r, b, 'large-size')).toBeUndefined();
  });
});
