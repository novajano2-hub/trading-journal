import { describe, expect, test, vi } from 'vitest';
import { rulesSetup, DAY, M } from '../__fixtures__/rules';
import { freezeDay, scoreHistory, type RoutineEnv } from '../routine';
import type { Trade } from '@/domain/types';
import {
  ArchivedAccountError,
  NotFoundError,
  type ManualTradeInput,
} from '../repository';

/** A closed long ES: in 1 at 6000 with a $3.50 commission and a $1.20 fee, out 1 at 6001 with a $3.50 commission. */
async function setup() {
  const kit = await rulesSetup();
  const trade = await kit.manual(kit.acc.id, [
    ['buy', 1, 6000, '14:30', { commission: 350, fees: 120 }],
    ['sell', 1, 6001, '14:40', { commission: 350 }],
  ]);
  return { ...kit, trade };
}

const costs = (t: { executions: { commission: number; fees: number }[] }) =>
  t.executions.map((e) => [e.commission, e.fees]);

describe('setFillCosts', () => {
  test("editing a fill's costs recomputes the trade", async () => {
    const { repo, trade, db } = await setup();
    const exit = trade.executions[1]!;
    const out = await repo.trades.setFillCosts(M, trade.id, exit.id, {
      commission: 500,
      fees: 243,
    });
    // The fill went from $3.50 to $7.43: $3.93 more.
    expect(costs(out)).toEqual([
      [350, 120],
      [500, 243],
    ]);
    expect(out.fees).toBe(trade.fees + 393);
    expect(out.net).toBe(trade.net - 393);
    expect(out.gross).toBe(trade.gross);
    expect(out.fees).toBe(1213);
    // What is stored is what came back, and the other fill and the rest of the trade are as they were.
    expect(await db.trades.get([M, trade.id])).toEqual(out);
    expect({
      ...out,
      executions: trade.executions,
      fees: trade.fees,
      net: trade.net,
    }).toEqual(trade);
  });

  test('a cost taken off gives net back, and an empty fill gives it all back', async () => {
    const { repo, trade } = await setup();
    const out = await repo.trades.setFillCosts(
      M,
      trade.id,
      trade.executions[0]!.id,
      { commission: 0, fees: 0 },
    );
    expect(out.fees).toBe(trade.fees - 470);
    expect(out.net).toBe(trade.net + 470);
  });

  test('it moves fees and net by the change, so a trade a closed-trades file made keeps its P&L, currency, excursions and swap', async () => {
    const { repo, trade, db } = await setup();
    // A closed-trades import: the file's P&L is the gross, in its currency, with excursions and a swap.
    const filed = {
      ...trade,
      gross: 12345,
      net: 12345 - trade.fees - 325,
      swap: -325,
      pnlCurrency: 'GBP',
      mae: -400,
      mfe: 900,
    };
    await db.trades.put(filed);
    const out = await repo.trades.setFillCosts(
      M,
      trade.id,
      trade.executions[0]!.id,
      { commission: 0, fees: 0 },
    );
    expect(out.gross).toBe(12345);
    expect(out.pnlCurrency).toBe('GBP');
    expect(out.swap).toBe(-325);
    expect(out.mae).toBe(-400);
    expect(out.mfe).toBe(900);
    expect(out.fees).toBe(filed.fees - 470);
    expect(out.net).toBe(filed.net + 470);
  });

  test('it logs one history row', async () => {
    const { repo, trade, rows, rowCount } = await setup();
    const before = await rowCount();
    await repo.trades.setFillCosts(M, trade.id, trade.executions[1]!.id, {
      commission: 500,
      fees: 243,
    });
    expect(await rowCount()).toBe(before + 1);
    expect(await rows('trade')).toEqual([
      expect.objectContaining({ action: 'created' }),
      {
        type: 'trade',
        action: 'edited',
        source: 'you',
        entityId: trade.id,
        label: 'ESZ5 2026-11-19',
        field: 'fees',
        // Raw cents, formatted when read: $8.20 to $12.13.
        oldValue: 820,
        newValue: 1213,
      },
    ]);
  });

  test('nothing is written or logged when the costs are what the fill has', async () => {
    const { repo, trade, rowCount, db } = await setup();
    const before = await rowCount();
    const revision = await db.meta.toArray();
    const out = await repo.trades.setFillCosts(
      M,
      trade.id,
      trade.executions[0]!.id,
      { commission: 350, fees: 120 },
    );
    expect(out).toEqual(trade);
    expect(await rowCount()).toBe(before);
    expect(await db.meta.toArray()).toEqual(revision);
  });

  test('moving a cost from the commission to the fee changes the fill and leaves the trade and the log alone', async () => {
    const { repo, trade, rowCount } = await setup();
    const before = await rowCount();
    const out = await repo.trades.setFillCosts(
      M,
      trade.id,
      trade.executions[1]!.id,
      { commission: 0, fees: 350 },
    );
    expect(costs(out)[1]).toEqual([0, 350]);
    expect(out.fees).toBe(trade.fees);
    expect(out.net).toBe(trade.net);
    expect(await rowCount()).toBe(before);
  });

  test('it moves the import state, since a pending plan carries the open trades it would overwrite', async () => {
    const { repo, acc, trade } = await setup();
    const revision = async () =>
      (await repo.imports.context(M, acc.id)).importRevision;
    const before = await revision();
    await repo.trades.setFillCosts(M, trade.id, trade.executions[1]!.id, {
      commission: 1,
      fees: 0,
    });
    expect(await revision()).toBe(before + 1);
  });

  test('it refuses an archived account and writes nothing', async () => {
    const { repo, acc, trade, rowCount } = await setup();
    await repo.accounts.update(M, acc.id, { status: 'archived' });
    const before = await rowCount();
    await expect(
      repo.trades.setFillCosts(M, trade.id, trade.executions[1]!.id, {
        commission: 1,
        fees: 0,
      }),
    ).rejects.toBeInstanceOf(ArchivedAccountError);
    expect(await repo.trades.get(M, trade.id)).toEqual(trade);
    expect(await rowCount()).toBe(before);
  });

  test('a missing trade or fill is NotFoundError', async () => {
    const { repo, trade } = await setup();
    await expect(
      repo.trades.setFillCosts(M, 'nope', 'x', { commission: 1, fees: 1 }),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      repo.trades.setFillCosts(M, trade.id, 'nope', {
        commission: 1,
        fees: 1,
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  test('a negative fee, a credit, lowers the fees and raises the net, in one row of raw negative cents', async () => {
    const { repo, trade, rows, rowCount } = await setup();
    const before = await rowCount();
    // The exit's $3.50 becomes a $5.00 credit: $8.50 less.
    const out = await repo.trades.setFillCosts(
      M,
      trade.id,
      trade.executions[1]!.id,
      { commission: 0, fees: -500 },
    );
    expect(costs(out)[1]).toEqual([0, -500]);
    expect(out.fees).toBe(trade.fees - 850);
    expect(out.net).toBe(trade.net + 850);
    expect(out.gross).toBe(trade.gross);
    expect(out.fees).toBe(-30);
    expect(await repo.trades.get(M, trade.id)).toEqual(out);
    expect(await rowCount()).toBe(before + 1);
    expect((await rows('trade')).at(-1)).toMatchObject({
      field: 'fees',
      source: 'you',
      oldValue: 820,
      newValue: -30,
    });
    // A negative commission is as good, and a credit can be taken back.
    const second = await repo.trades.setFillCosts(
      M,
      trade.id,
      trade.executions[0]!.id,
      { commission: -200, fees: 0 },
    );
    expect(second.fees).toBe(-30 - 470 - 200);
    const back = await repo.trades.setFillCosts(
      M,
      trade.id,
      trade.executions[1]!.id,
      { commission: 350, fees: 0 },
    );
    expect(back.fees).toBe(second.fees + 850);
  });

  test('costs that are not whole cents are refused, writing nothing', async () => {
    const { repo, trade, rowCount } = await setup();
    const before = await rowCount();
    for (const bad of [
      { commission: 1.5, fees: 0 },
      { commission: 0, fees: -0.5 },
      { commission: Number.NaN, fees: 0 },
      { commission: 0, fees: Number.POSITIVE_INFINITY },
      { commission: 2 ** 60, fees: 0 },
    ])
      await expect(
        repo.trades.setFillCosts(M, trade.id, trade.executions[0]!.id, bad),
      ).rejects.toBeInstanceOf(RangeError);
    expect(await repo.trades.get(M, trade.id)).toEqual(trade);
    expect(await rowCount()).toBe(before);
  });

  test('a row that cannot be written takes the costs back with it', async () => {
    const { repo, trade } = await setup();
    const spy = vi.spyOn(crypto, 'randomUUID').mockImplementation(() => {
      throw new Error('no id');
    });
    try {
      await expect(
        repo.trades.setFillCosts(M, trade.id, trade.executions[1]!.id, {
          commission: 999,
          fees: 0,
        }),
      ).rejects.toThrow('no id');
    } finally {
      spy.mockRestore();
    }
    expect(await repo.trades.get(M, trade.id)).toEqual(trade);
  });

  test('a trade of another workspace is not found', async () => {
    const { repo, trade } = await setup();
    await expect(
      repo.trades.setFillCosts('sample', trade.id, trade.executions[0]!.id, {
        commission: 1,
        fees: 1,
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('a manual trade with a credit', () => {
  /** The fills of `trade` as the form sends them back: their costs as stored. */
  const asInput = (accountId: string, t: Trade): ManualTradeInput => ({
    accountId,
    instrument: t.instrument,
    fills: t.executions.map((e) => ({
      time: e.time,
      side: e.side,
      qty: e.qty,
      price: e.price,
      commission: e.commission,
      fees: e.fees,
    })),
  });

  test('a manual trade can be made with a credit, and its figures follow', async () => {
    const { repo, acc, manual } = await rulesSetup();
    const made = await manual(acc.id, [
      ['buy', 1, 6000, '14:30', { commission: 350, fees: -500 }],
      ['sell', 1, 6001, '14:40'],
    ]);
    expect(made.fees).toBe(-150);
    expect(made.net).toBe(made.gross + 150);
    expect(await repo.trades.get(M, made.id)).toEqual(made);
  });

  test('replaceManual keeps a credit and recomputes from it, and a credit set on the trade page survives an edit of the fills', async () => {
    const { repo, acc, manual, rows } = await rulesSetup();
    const made = await manual(acc.id, [
      ['buy', 1, 6000, '14:30', { commission: 350 }],
      ['sell', 1, 6001, '14:40', { commission: 350 }],
    ]);
    // A credit entered on the trade page ...
    const credited = await repo.trades.setFillCosts(
      M,
      made.id,
      made.executions[1]!.id,
      { commission: 0, fees: -500 },
    );
    expect(credited.fees).toBe(350 - 500);
    // ... is what the form offers back, and saving the form with a changed price keeps it.
    const form = asInput(acc.id, credited);
    form.fills[1] = { ...form.fills[1]!, price: 6002 };
    const rebuilt = await repo.trades.replaceManual(M, made.id, form);
    expect(rebuilt.executions.map((e) => [e.commission, e.fees])).toEqual([
      [350, 0],
      [0, -500],
    ]);
    expect(rebuilt.fees).toBe(-150);
    expect(rebuilt.net).toBe(rebuilt.gross + 150);
    expect(rebuilt.net).toBe(made.gross + 5000 + 150);
    expect(await repo.trades.get(M, made.id)).toEqual(rebuilt);
    // The change is logged as the person's own edit of the fills.
    expect((await rows('trade')).at(-1)).toMatchObject({
      source: 'you',
      entityId: made.id,
    });
    // And a form that types a new credit replaces it.
    const again = asInput(acc.id, rebuilt);
    again.fills[0] = { ...again.fills[0]!, commission: -200 };
    const twice = await repo.trades.replaceManual(M, made.id, again);
    expect(twice.fees).toBe(-200 - 500);
    expect(twice.net).toBe(twice.gross + 700);
  });
});

describe('a finished day', () => {
  const env: RoutineEnv = {
    timeZone: 'America/New_York',
    baseCurrency: 'USD',
    now: '2026-11-19T21:00:00.000Z',
    today: DAY,
  };

  test('it is allowed on a finished day and leaves the frozen score', async () => {
    const { repo, db, acc, manual, rows } = await rulesSetup();
    // A loss of $75, inside the built-in cap of $100 per trade.
    const loss = await manual(acc.id, [
      ['buy', 1, 6000, '14:30'],
      ['sell', 1, 5998.5, '14:40'],
    ]);
    const tracker = await repo.tracker.get(M);
    await repo.days.finish(
      M,
      DAY,
      freezeDay(
        DAY,
        tracker,
        undefined,
        await repo.trades.list(M),
        await repo.accounts.list(M),
        [],
        env,
      ),
    );
    /** The day as the routine scores it from what is stored, finished or as if it were not. */
    const score = async (unfinished = false) =>
      scoreHistory(
        tracker,
        unfinished ? [{ id: DAY, workspaceId: M }] : await repo.days.list(M),
        await repo.trades.list(M),
        await repo.accounts.list(M),
        await repo.cashFlows.list(M),
        env,
      ).scoreOn(DAY);
    const frozen = await score();
    const unfinished = await score(true);
    const dayRow = await db.days.get([M, DAY]);
    expect(frozen.finished).toBe(true);

    // $40 of commission on the exit takes the loss to $115, over the cap.
    const out = await repo.trades.setFillCosts(
      M,
      loss.id,
      loss.executions[1]!.id,
      { commission: 4000, fees: 0 },
    );
    expect(out.net).toBe(loss.net - 4000);

    // The write went through; the frozen day reads its lock and nothing was written to the day.
    expect(await score()).toEqual(frozen);
    expect(await db.days.get([M, DAY])).toEqual(dayRow);
    // One row, for the trade.
    expect(await rows('trade')).toHaveLength(2);
    // The same trade on a day not yet finished does move the score, so the check can fail.
    expect((await score(true)).rules).not.toEqual(unfinished.rules);
  });
});
