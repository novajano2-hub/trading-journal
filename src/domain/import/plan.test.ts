import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { parseCsv } from './csv';
import { guessMapping, type MappingOptions } from './mapping';
import { planImport, type ImportContext } from './plan';
import { mergeTrades, splitTrade } from '../grouping';
import { resolveInstrument } from '../instruments';
import { withFeeRule } from '../rules/fee-rules';
import type { BuildOptions } from '../trade-builder';
import type { FeeRule, Trade } from '../types';

const csv = readFileSync('e2e/fixtures/sample-fills.csv', 'utf8');
const H = 'Date/Time,Symbol,Buy/Sell,Quantity,Price\n';
const ctx = (o: Partial<ImportContext> = {}): ImportContext => ({
  workspaceId: 'mine',
  accountId: 'acc1',
  accountCurrency: 'USD',
  nextSerial: 1,
  openTrades: [],
  fingerprints: [],
  overrides: {},
  importRevision: 0,
  ...o,
});
const plan = (
  text: string,
  c = ctx(),
  m: Partial<MappingOptions> = {},
  importId = 'imp1',
  now = '2026-11-21T00:00:00.000Z',
) => {
  const p = parseCsv(text);
  return planImport(
    p,
    { ...guessMapping(p, { sourceTimeZone: 'America/New_York' }), ...m },
    c,
    { importId, fileName: 'f.csv', now },
  );
};

describe('planImport', () => {
  test('the landing sample plans eight trades worth +$1,272.50', () => {
    const p = plan(csv);
    expect(p.blocked).toBeNull();
    expect(p.trades.map((t) => t.serial)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(p.trades.reduce((s, t) => s + t.net, 0)).toBe(127250);
    expect(
      p.trades.every((t) => t.importId === 'imp1' && t.workspaceId === 'mine'),
    ).toBe(true);
    expect(p).toMatchObject({
      rowCount: 16,
      issues: [],
      duplicateRows: [],
      flags: [],
      replacedTrades: [],
    });
    expect(p.fingerprints).toHaveLength(16);
  });

  test('the plan carries the import identity', () =>
    expect(plan(csv)).toMatchObject({
      importId: 'imp1',
      workspaceId: 'mine',
      accountId: 'acc1',
      fileName: 'f.csv',
      createdAt: '2026-11-21T00:00:00.000Z',
      mapping: { kind: 'fills' },
    }));

  test('the plan carries the revision of the context it was made from', () =>
    expect(plan(csv, ctx({ importRevision: 3 })).importRevision).toBe(3));

  test('serials continue the workspace', () =>
    expect(plan(csv, ctx({ nextSerial: 41 })).trades[0]!.serial).toBe(41));

  test('re-importing the same file adds nothing (Review Focus 1)', () => {
    const again = plan(csv, ctx({ fingerprints: plan(csv).fingerprints }));
    expect(again).toMatchObject({ trades: [], blocked: 'nothing-new' });
    expect(again.duplicateRows).toHaveLength(16);
  });

  test('identical fills in one file both import; only already-imported copies are skipped (Review Focus 1)', () => {
    const twin =
      H +
      '2026-11-16 09:41:00,ESZ5,Buy,1,6010\n2026-11-16 09:41:00,ESZ5,Buy,1,6010\n2026-11-16 09:50:00,ESZ5,Sell,2,6012\n';
    const first = plan(twin);
    expect(first.trades[0]!.executions).toHaveLength(3);
    expect(
      plan(twin, ctx({ fingerprints: [first.fingerprints[0]!] })).duplicateRows,
    ).toEqual([2]);
  });

  test('an open manual trade is never merged into an import', () => {
    const manual: Trade = {
      ...plan(H + '2026-11-16 09:41:00,AAPL,Buy,10,190\n').trades[0]!,
      id: 'manual-1',
      serial: 4,
      source: 'manual',
      importId: undefined,
    };
    const p = plan(
      H + '2026-11-17 10:00:00,AAPL,Sell,10,195\n',
      ctx({ nextSerial: 5, openTrades: [manual] }),
    );
    expect(p.replacedTrades).toEqual([]);
    expect(p.trades.map((t) => t.id)).not.toContain('manual-1');
    expect(p.trades.every((t) => t.source !== 'manual')).toBe(true);
    expect(p.trades.map((t) => t.serial)).toEqual([5]);
  });

  test('an open trade grouped by hand is never rebuilt by an import', () => {
    // A closed round trip and a position left open, joined into one trade by hand:
    // rebuilding it from its fills would cut it at the flat point again.
    const [closed, open] = plan(
      H +
        '2026-11-16 09:41:00,AAPL,Buy,10,190\n2026-11-16 09:50:00,AAPL,Sell,10,191\n2026-11-16 10:41:00,AAPL,Buy,5,192\n',
    ).trades as [Trade, Trade];
    const grouped: Trade = {
      ...open,
      executions: [...closed.executions, ...open.executions],
      grouping: 'manual',
    };
    const p = plan(
      H + '2026-11-17 10:00:00,AAPL,Sell,5,195\n',
      ctx({ nextSerial: 5, openTrades: [grouped] }),
    );
    expect(p.replacedTrades).toEqual([]);
    expect(p.trades).toHaveLength(1);
    expect(p.trades[0]).toMatchObject({ serial: 5, direction: 'short' });
    expect(p.trades[0]!.executions).toHaveLength(1);
    // Without the mark the same trade is taken in, as before.
    const rebuilt = plan(
      H + '2026-11-17 10:00:00,AAPL,Sell,5,195\n',
      ctx({
        nextSerial: 5,
        openTrades: [{ ...grouped, grouping: undefined }],
      }),
    );
    expect(rebuilt.replacedTrades).toHaveLength(1);
  });

  test('a position closed by a later import is one trade keeping id, serial and tags (Review Focus 2)', () => {
    const open: Trade = {
      ...plan(H + '2026-11-16 09:41:00,ESZ5,Buy,2,6010\n').trades[0]!,
      serial: 7,
      tagIds: ['t1'],
      strategyIds: ['s1', 's2'],
      rating: 4,
      reviewed: true,
      ruleChecks: [{ ruleId: 'r1', followed: true }],
      noteId: 'n1',
      plannedStop: 6000,
      plannedTarget: 6030,
      initialRisk: 100000, // riskFromStop of 2 @ 6010 to 6000
    };
    const p = plan(
      H + '2026-11-17 10:00:00,ESZ5,Sell,2,6015\n',
      ctx({ nextSerial: 9, openTrades: [open] }),
      {},
      'imp2',
    );
    expect(p.replacedTrades).toEqual([open]);
    expect(p.trades).toEqual([
      expect.objectContaining({
        id: open.id,
        serial: 7,
        tagIds: ['t1'],
        strategyIds: ['s1', 's2'],
        rating: 4,
        reviewed: true,
        ruleChecks: [{ ruleId: 'r1', followed: true }],
        noteId: 'n1',
        plannedStop: 6000,
        plannedTarget: 6030,
        initialRisk: 100000,
        status: 'closed',
        gross: 50000,
        importId: 'imp2',
      }),
    ]);
    // Copies, not references shared with the stored trade.
    expect(p.trades[0]!.tagIds).not.toBe(open.tagIds);
    expect(p.trades[0]!.ruleChecks[0]).not.toBe(open.ruleChecks[0]);
  });

  describe('an overlapping export that adds an earlier fill (ruling 1)', () => {
    const first = plan(H + '2026-11-16 09:41:00,ESZ5,Buy,2,6010\n');
    const open = { ...first.trades[0]!, serial: 7, tagIds: ['t1'] };
    const later = (rows: string, stored: Trade = open) =>
      plan(
        H + rows,
        ctx({
          nextSerial: 9,
          openTrades: [stored],
          fingerprints: first.fingerprints,
        }),
        {},
        'imp2',
      );

    test('keeps the old trade id, serial and tags', () => {
      const p = later(
        '2026-11-16 09:30:00,ESZ5,Buy,1,6000\n2026-11-16 09:41:00,ESZ5,Buy,2,6010\n2026-11-16 10:00:00,ESZ5,Sell,3,6012\n',
      );
      expect(p.duplicateRows).toEqual([3]);
      expect(p.replacedTrades).toEqual([open]);
      expect(p.trades).toEqual([
        expect.objectContaining({
          id: open.id,
          serial: 7,
          tagIds: ['t1'],
          status: 'closed',
          gross: 80000,
          importId: 'imp2',
        }),
      ]);
      expect(p.trades[0]!.executions.map((e) => e.id)).toEqual([
        'imp2:r2',
        'imp1:r2',
        'imp2:r4',
      ]);
    });

    test('an earlier fill that reverses through the old first fill leaves the identity on the position it opened', () => {
      const p = later(
        '2026-11-16 09:30:00,ESZ5,Sell,1,6000\n2026-11-16 09:41:00,ESZ5,Buy,2,6010\n2026-11-16 10:00:00,ESZ5,Sell,1,6012\n',
      );
      expect(
        p.trades.map((t) => [
          t.serial,
          t.id === open.id,
          t.direction,
          t.tagIds,
        ]),
      ).toEqual([
        [7, true, 'long', ['t1']],
        [9, false, 'short', []],
      ]);
    });

    test('chained overlapping exports never give two trades one id', () => {
      // imp2 adds buy 1 @ 09:30: still one open trade, carrying the imp1 id.
      const imp2 = later(
        '2026-11-16 09:30:00,ESZ5,Buy,1,6000\n2026-11-16 09:41:00,ESZ5,Buy,2,6010\n',
      );
      const stored = imp2.trades[0]!;
      expect(stored).toMatchObject({ id: open.id, serial: 7, status: 'open' });
      // imp3 adds sell 1 @ 09:35: 09:30-09:35 closes, 09:41 stays open.
      const p = plan(
        H +
          '2026-11-16 09:30:00,ESZ5,Buy,1,6000\n2026-11-16 09:35:00,ESZ5,Sell,1,6005\n2026-11-16 09:41:00,ESZ5,Buy,2,6010\n',
        ctx({
          nextSerial: 9,
          openTrades: [stored],
          fingerprints: [...first.fingerprints, ...imp2.fingerprints],
        }),
        {},
        'imp3',
      );
      const ids = p.trades.map((t) => t.id);
      expect(new Set(ids).size).toBe(ids.length);
      // The id names imp1:r2, so the identity stays with the trade holding it.
      expect(
        p.trades.map((t) => [
          t.id === open.id,
          t.serial,
          t.status,
          t.gross,
          t.tagIds,
          t.executions.map((e) => e.id),
        ]),
      ).toEqual([
        [true, 7, 'open', 0, ['t1'], ['imp1:r2']],
        [false, 9, 'closed', 25000, [], ['imp2:r2', 'imp3:r3']],
      ]);
    });

    test('a merge that flips the direction keeps identity and journaling, not the plan', () => {
      const journaled: Trade = {
        ...open,
        strategyIds: ['s1'],
        rating: 4,
        ruleChecks: [{ ruleId: 'r1', followed: false }],
        noteId: 'n1',
        plannedStop: 6000,
        plannedTarget: 6030,
        initialRisk: 100000,
      };
      // An earlier sell 2 @ 09:30 makes the stored buy the short's exit.
      const p = later(
        '2026-11-16 09:30:00,ESZ5,Sell,2,6020\n2026-11-16 09:41:00,ESZ5,Buy,2,6010\n',
        journaled,
      );
      expect(p.trades).toHaveLength(1);
      const t = p.trades[0]!;
      expect(t).toMatchObject({
        id: open.id,
        serial: 7,
        tagIds: ['t1'],
        strategyIds: ['s1'],
        rating: 4,
        ruleChecks: [{ ruleId: 'r1', followed: false }],
        noteId: 'n1',
        direction: 'short',
        status: 'closed',
        gross: 100000,
      });
      expect(t).not.toHaveProperty('plannedStop');
      expect(t).not.toHaveProperty('plannedTarget');
      expect(t).not.toHaveProperty('initialRisk');
    });

    test('a merge that flips the direction raises one direction-flipped flag; one that keeps it raises none (E32)', () => {
      const flipped = later(
        '2026-11-16 09:30:00,ESZ5,Sell,2,6020\n2026-11-16 09:41:00,ESZ5,Buy,2,6010\n',
      );
      expect(
        flipped.flags.filter((f) => f.code === 'direction-flipped'),
      ).toEqual([
        {
          tradeId: open.id,
          code: 'direction-flipped',
          was: 'long',
          now: 'short',
        },
      ]);
      const kept = later(
        '2026-11-16 09:30:00,ESZ5,Buy,1,6000\n2026-11-16 09:41:00,ESZ5,Buy,2,6010\n',
      );
      expect(kept.flags).toEqual([]);
    });
  });

  test('a merge keeps a user-entered risk and recomputes one derived from the stop (ruling 2)', () => {
    const stored = plan(H + '2026-11-16 09:41:00,ESZ5,Buy,2,6010\n').trades[0]!;
    const merge = (o: Partial<Trade>) =>
      plan(
        H +
          '2026-11-16 09:50:00,ESZ5,Buy,1,6013\n2026-11-16 10:00:00,ESZ5,Sell,3,6020\n',
        ctx({ openTrades: [{ ...stored, plannedStop: 6000, ...o }] }),
        {},
        'imp2',
      ).trades[0]!;
    expect(merge({ initialRisk: 75000 })).toMatchObject({
      plannedStop: 6000,
      initialRisk: 75000,
    });
    // 100000 is riskFromStop at the old 2 @ 6010; the merged 3 @ 6011 is 165000.
    expect(merge({ initialRisk: 100000 })).toMatchObject({
      plannedStop: 6000,
      initialRisk: 165000,
    });
    // A stop without a risk stays without one.
    const noRisk = merge({});
    expect(noRisk.plannedStop).toBe(6000);
    expect(noRisk).not.toHaveProperty('initialRisk');
  });

  describe('levels on a stored open trade (B14)', () => {
    const stored = plan(H + '2026-11-16 09:41:00,ESZ5,Buy,2,6010\n').trades[0]!;
    const stops = { unit: 'price' as const, levels: [{ value: 6000, qty: 2 }] };
    const targets = {
      unit: 'price' as const,
      levels: [{ value: 6030, qty: 2 }],
    };
    // 10 points on 2 contracts at $50 a point.
    const withLevels: Trade = {
      ...stored,
      stops,
      targets,
      initialRisk: 100000,
    };
    const merge = (open: Trade, rows: string) =>
      plan(H + rows, ctx({ openTrades: [open] }), {}, 'imp2').trades[0]!;
    // Another contract at 6013 makes the average 6011, 11 points from the stop.
    const scaled =
      '2026-11-16 09:50:00,ESZ5,Buy,1,6013\n2026-11-16 10:00:00,ESZ5,Sell,3,6020\n';

    test('a rebuilt open trade keeps its levels and recomputes its risk', () => {
      const t = merge(withLevels, scaled);
      expect(t.avgEntry).toBe(6011);
      expect(t.stops).toEqual(stops);
      expect(t.targets).toEqual(targets);
      // Copies, not references shared with the stored trade.
      expect(t.stops).not.toBe(stops);
      expect(t.stops!.levels[0]).not.toBe(stops.levels[0]);
      // The levels keep their own quantities; only the entry moved: 11 x 2 x 50.
      expect(t.initialRisk).toBe(110000);
      expect(t).not.toHaveProperty('plannedStop');
      expect(t).not.toHaveProperty('plannedTarget');
    });

    test('a rebuilt trade with targets and no stop has no risk', () => {
      const targetsOnly: Trade = { ...stored, targets };
      const t = merge(targetsOnly, scaled);
      expect(t.targets).toEqual(targets);
      expect(t).not.toHaveProperty('stops');
      expect(t).not.toHaveProperty('initialRisk');
    });

    test('a merge that flips the direction drops the levels and their risk', () => {
      const t = merge(
        withLevels,
        '2026-11-16 09:30:00,ESZ5,Sell,2,6020\n2026-11-16 09:41:00,ESZ5,Buy,2,6010\n',
      );
      expect(t.direction).toBe('short');
      expect(t).not.toHaveProperty('stops');
      expect(t).not.toHaveProperty('targets');
      expect(t).not.toHaveProperty('initialRisk');
    });

    test('a trade saved before levels keeps its single stop, and its risk follows the position', () => {
      const old: Trade = {
        ...stored,
        plannedStop: 6000,
        plannedTarget: 6030,
        initialRisk: 100000,
      };
      const t = merge(old, scaled);
      expect(t).toMatchObject({
        plannedStop: 6000,
        plannedTarget: 6030,
        // 11 points on the merged 3 contracts, as before levels.
        initialRisk: 165000,
      });
      expect(t).not.toHaveProperty('stops');
      expect(t).not.toHaveProperty('targets');
    });
  });

  test('slash, case and space variants of one symbol are one position (E6)', () => {
    const p = plan(
      H +
        '2026-11-16 09:41:00,/ESZ5,Buy,1,6010\n2026-11-16 09:45:00, esz5 ,Buy,1,6011\n2026-11-16 09:50:00,ESZ5,Sell,2,6012\n',
    );
    expect(p.trades).toHaveLength(1);
    expect(p.trades[0]!.instrument.root).toBe('ES');
  });

  test('an unknown root blocks until its point value is entered', () => {
    const corn =
      H +
      '2026-11-16 09:41:00,ZCZ5,Buy,1,450\n2026-11-16 10:41:00,ZCZ5,Sell,1,451\n';
    expect(plan(corn)).toMatchObject({
      blocked: 'unresolved-symbols',
      unresolvedKeys: ['ZC'],
    });
    const ok = plan(corn, ctx(), {
      overrides: {
        ZC: { pointValue: 50, tickSize: 0.25, assetClass: 'future' },
      },
    });
    expect(ok.blocked).toBeNull();
    expect(ok.trades[0]!.gross).toBe(5000);
  });

  test('remembered point values from earlier imports apply; the mapping wins on conflicts (ruling 3)', () => {
    const corn =
      H +
      '2026-11-16 09:41:00,ZCZ5,Buy,1,450\n2026-11-16 10:41:00,ZCZ5,Sell,1,451\n';
    const ZC = {
      pointValue: 50,
      tickSize: 0.25,
      assetClass: 'future' as const,
    };
    const remembered = plan(corn, ctx({ overrides: { ZC } }));
    expect(remembered.blocked).toBeNull();
    expect(remembered.trades[0]!.gross).toBe(5000);
    const stale = ctx({ overrides: { ZC: { ...ZC, pointValue: 1 } } });
    expect(plan(corn, stale, { overrides: { ZC } }).trades[0]!.gross).toBe(
      5000,
    );
  });

  test('a cross without the account currency is flagged; USDJPY converts (E3)', () => {
    const p = plan(
      H +
        '2026-11-16 03:00:00,EURGBP,Buy,1,0.8700\n2026-11-16 04:00:00,EURGBP,Sell,1,0.8710\n',
    );
    expect(p.flags).toEqual([
      {
        tradeId: p.trades[0]!.id,
        code: 'unconverted-currency',
        currency: 'GBP',
      },
    ]);
    const jpy = plan(
      H +
        '2026-11-16 03:00:00,USDJPY,Buy,1,150.00\n2026-11-16 04:00:00,USDJPY,Sell,1,150.10\n',
    );
    expect(jpy.flags).toEqual([]);
    expect(jpy.trades[0]!.pnlCurrency).toBe('USD');
  });

  test('closed-trade P&L matches gross or net, is flagged otherwise, and carries crosses', () => {
    const T =
      'Open Time,Close Time,Symbol,Side,Qty,Entry Price,Exit Price,Commission,P&L\n';
    const row = (
      pnl: string,
      sym = 'ESZ5',
      e = '6000',
      x = '6004',
      c = '5.00',
    ) =>
      `2026-11-16 09:30:00,2026-11-16 09:45:00,${sym},Long,1,${e},${x},${c},${pnl}`;
    const p = plan(
      T +
        [
          row('200.00'),
          row('195.00'),
          row('200.02'),
          row('125.00', 'EURGBP', '0.8700', '0.8710', '0'),
        ].join('\n'),
    );
    expect(p.flags).toEqual([
      {
        tradeId: p.trades[2]!.id,
        code: 'pnl-mismatch',
        file: 20002,
        keel: 20000,
      },
    ]);
    expect(p.trades[3]).toMatchObject({
      pnlCurrency: 'USD',
      gross: 12500,
      net: 12500,
    });
    // Every trade the file gave a P&L for keeps that figure, matching or not.
    expect(p.filePnl).toEqual({
      [p.trades[0]!.id]: 20000,
      [p.trades[1]!.id]: 19500,
      [p.trades[2]!.id]: 20002,
      [p.trades[3]!.id]: 12500,
    });
  });

  test('an option left open by an earlier import settles on the next import (E2)', () => {
    const opt = plan(
      H + '2026-11-18 10:00:00,AAPL  261120C00150000,Buy,1,1.50\n',
      ctx(),
      {},
      'imp0',
      '2026-11-19T00:00:00.000Z',
    ).trades[0]!; // still open
    const p = plan(csv, ctx({ openTrades: [opt] }));
    expect(p.replacedTrades).toEqual([opt]);
    expect(p.trades.find((t) => t.id === opt.id)).toMatchObject({
      status: 'closed',
      avgExit: 0,
    });
    expect(p.flags).toContainEqual({
      tradeId: opt.id,
      code: 'expired-worthless',
      expiry: '2026-11-20',
    });
  });

  test('closed-trade rows already imported are skipped (Review Focus 1)', () => {
    const T = 'Open Time,Close Time,Symbol,Side,Qty,Entry Price,Exit Price\n';
    const a = '2026-11-16 09:30:00,2026-11-16 09:45:00,ESZ5,Long,1,6000,6004';
    const b = '2026-11-17 09:30:00,2026-11-17 09:45:00,ESZ5,Short,1,6010,6002';
    const first = plan(T + a);
    const p = plan(
      T + a + '\n' + b,
      ctx({ nextSerial: 2, fingerprints: first.fingerprints }),
      {},
      'imp2',
    );
    expect(p.duplicateRows).toEqual([2]);
    expect(p.fingerprints).toHaveLength(1);
    expect(p.trades).toEqual([
      expect.objectContaining({ serial: 2, direction: 'short', gross: 40000 }),
    ]);
    expect(plan(T + a, ctx({ fingerprints: first.fingerprints })).blocked).toBe(
      'nothing-new',
    );
  });

  test('trades sharing an open time take serials in file order', () => {
    const T = 'Open Time,Close Time,Symbol,Side,Qty,Entry Price,Exit Price\n';
    const rows = Array.from(
      { length: 10 },
      (_, i) =>
        `2026-11-16 09:30:00,2026-11-16 09:45:00,ESZ5,Long,1,6000,${6001 + i}`,
    );
    const p = plan(T + rows.join('\n'));
    expect(p.trades.map((t) => [t.serial, t.executions[0]!.id])).toEqual(
      rows.map((_, i) => [i + 1, `imp1:r${i + 2}:entry`]),
    );
  });

  test('a blocked plan writes, replaces and flags nothing', () => {
    const opt = plan(
      H + '2026-11-18 10:00:00,AAPL  261120C00150000,Buy,1,1.50\n',
      ctx(),
      {},
      'imp0',
      '2026-11-19T00:00:00.000Z',
    ).trades[0]!; // open, and expired by the next import
    const es = H + '2026-11-16 09:41:00,ESZ5,Buy,2,6010\n';
    const empty = { trades: [], replacedTrades: [], flags: [] };
    expect(
      plan(es, ctx({ openTrades: [opt], fingerprints: plan(es).fingerprints })),
    ).toMatchObject({ blocked: 'nothing-new', ...empty });
    expect(
      plan(
        es + '2026-11-16 09:41:00,ZCZ5,Buy,1,450\n',
        ctx({ openTrades: [opt] }),
      ),
    ).toMatchObject({ blocked: 'unresolved-symbols', ...empty });
    expect(
      plan(H + 'x,ESZ5,Buy,0,1\n', ctx({ openTrades: [opt] })),
    ).toMatchObject({ blocked: 'no-rows', ...empty });
  });

  test('nothing valid to import', () =>
    expect(plan(H + 'x,ESZ5,Buy,0,1\n').blocked).toBe('no-rows'));
});

describe('swap in a closed-trades import', () => {
  const T =
    'Open Time,Close Time,Symbol,Side,Qty,Entry Price,Exit Price,Commission,Swap,P&L\n';
  /** Long one ES: gross +$530.00 on 6000 to 6010.60, with $14.00 of commission. */
  const row = (
    swap: string,
    pnl = '530.00',
    o: {
      sym?: string;
      entry?: string;
      exit?: string;
      comm?: string;
      at?: string;
    } = {},
  ) =>
    `2026-11-16 ${o.at ?? '09:30'}:00,2026-11-16 ${o.at ?? '09:30'}:30,${o.sym ?? 'ESZ5'},Long,1,${o.entry ?? '6000'},${o.exit ?? '6010.60'},${o.comm ?? '14.00'},${swap},${pnl}`;

  test('swap enters net, not gross', () => {
    const p = plan(T + row('-4.86'));
    expect(p.trades[0]).toMatchObject({
      gross: 53000,
      fees: 1400,
      swap: -486,
      net: 51114,
    });
    // The file's P&L is the gross, so there is nothing to flag.
    expect(p.flags).toEqual([]);
  });

  test('a swap credit adds to the net', () => {
    expect(plan(T + row('1.20')).trades[0]).toMatchObject({
      gross: 53000,
      swap: 120,
      net: 51720,
    });
  });

  test('a file P&L is checked against the gross and against the net with swap', () => {
    const p = plan(
      T +
        [
          row('-4.86', '530.00'),
          row('-4.86', '511.14'),
          row('-4.86', '516.00'),
        ].join('\n'),
    );
    // 516.00 is gross less fees but the net also carries the swap: only that one is flagged.
    expect(p.flags).toEqual([
      {
        tradeId: p.trades[2]!.id,
        code: 'pnl-mismatch',
        file: 51600,
        keel: 53000,
      },
    ]);
    // Every trade keeps the figure the file gave.
    expect(p.filePnl).toEqual({
      [p.trades[0]!.id]: 53000,
      [p.trades[1]!.id]: 51114,
      [p.trades[2]!.id]: 51600,
    });
  });

  test('a pair without the account currency takes the file P&L as gross and still carries the swap', () => {
    const p = plan(
      T +
        row('-2.00', '125.00', {
          sym: 'EURGBP',
          entry: '0.8700',
          exit: '0.8710',
          comm: '0',
        }),
    );
    expect(p.trades[0]).toMatchObject({
      pnlCurrency: 'USD',
      gross: 12500,
      fees: 0,
      swap: -200,
      net: 12300,
    });
    expect(p.filePnl).toEqual({ [p.trades[0]!.id]: 12500 });
  });

  test('a file without a swap column moves nothing', () => {
    const p = plan(
      'Open Time,Close Time,Symbol,Side,Qty,Entry Price,Exit Price,Commission,P&L\n' +
        '2026-11-16 09:30:00,2026-11-16 09:30:30,ESZ5,Long,1,6000,6010.60,14.00,530.00',
    );
    expect(p.trades[0]).toMatchObject({ gross: 53000, net: 51600 });
    expect(p.trades[0]).not.toHaveProperty('swap');
  });

  test('a blank swap cell is no swap; a 0 is a swap of 0', () => {
    const p = plan(T + [row('', '530.00'), row('0.00', '530.00')].join('\n'));
    expect(p.trades[0]).not.toHaveProperty('swap');
    expect(p.trades[1]).toMatchObject({ swap: 0, net: 51600 });
  });

  test('a fills import has no swap', () => {
    const p = plan(
      'Date/Time,Symbol,Buy/Sell,Quantity,Price,Commission,Swap\n' +
        '2026-11-16 09:30:00,ESZ5,Buy,1,6000,7.00,-4.86\n' +
        '2026-11-16 09:30:30,ESZ5,Sell,1,6010.60,7.00,-4.86\n',
    );
    expect(p.trades).toHaveLength(1);
    expect(p.trades[0]).not.toHaveProperty('swap');
    expect(p.trades[0]).toMatchObject({ gross: 53000, fees: 1400, net: 51600 });
  });

  test('the same file again adds nothing: the swap is not in the row fingerprint', () => {
    const first = plan(T + row('-4.86'));
    const again = plan(
      T + row('-4.86'),
      ctx({ fingerprints: first.fingerprints }),
    );
    expect(again.blocked).toBe('nothing-new');
  });

  describe('R3: swap survives a merge, a split and a fill-cost edit', () => {
    const opts: BuildOptions = {
      workspaceId: 'mine',
      startSerial: 1,
      resolve: (s) => resolveInstrument(s),
      accountCurrency: () => 'USD',
    };
    // A wins 530.00 and pays -4.86 of swap; B loses 250.00 and earns 1.20.
    const rows = [
      row('-4.86', '530.00', { at: '09:30' }),
      row('1.20', '-250.00', { at: '10:00', entry: '6020', exit: '6015' }),
    ].join('\n');
    const [a, b] = plan(T + rows).trades as [Trade, Trade];
    const picked = new Set([...a.executions, ...b.executions].map((e) => e.id));

    test('imported with their own swaps', () => {
      expect([a.swap, b.swap]).toEqual([-486, 120]);
      expect([a.net, b.net]).toEqual([51114, -26280]);
    });

    test('a merge adds the swaps and keeps gross apart', () => {
      const { kept } = mergeTrades([a, b], picked, opts);
      expect(kept).toMatchObject({
        gross: 28000,
        fees: 2800,
        swap: -366,
        net: 24834,
      });
    });

    test('a split keeps the swap on the original', () => {
      const { kept } = mergeTrades([a, b], picked, opts);
      const moved = new Set(b.executions.map((e) => e.id));
      const { original, created } = splitTrade(kept, moved, {
        ...opts,
        serial: 9,
        id: 'split',
      });
      expect(original).toMatchObject({ gross: 53000, swap: -366, net: 51234 });
      expect(created).not.toHaveProperty('swap');
    });

    test('a fill-cost edit moves fees and net by the change and leaves the swap', () => {
      const rule: FeeRule = {
        id: 'f1',
        workspaceId: 'mine',
        accountId: 'acc1',
        assetClass: 'future',
        symbols: [],
        mode: 'per-execution',
        applyOn: 'all',
        commission: 200,
        fee: 0,
        createdAt: '2026-01-01T00:00:00.000Z',
      };
      const out = withFeeRule(a, rule, {
        override: true,
        accountCurrency: 'USD',
      })!;
      // Two fills at $2.00 each replace the $14.00 the file gave.
      expect(out).toMatchObject({
        gross: 53000,
        fees: 400,
        swap: -486,
        net: 52114,
      });
    });
  });
});

describe("planImport and the account's cost method", () => {
  // Two lots in, one out: the open part's realized P&L is the method's.
  const OPEN =
    H +
    '2026-11-16 09:41:00,ESZ5,Buy,1,6000\n2026-11-16 09:42:00,ESZ5,Buy,1,6010\n2026-11-16 09:43:00,ESZ5,Sell,1,6020\n';

  test("the context's method builds the trades and is stamped on them; unset reads FIFO", () => {
    const grossOf = (c: ImportContext) => plan(OPEN, c).trades[0]!;
    expect(grossOf(ctx())).toMatchObject({ gross: 100000 });
    expect(grossOf(ctx())).not.toHaveProperty('costMethod');
    expect(grossOf(ctx({ costMethod: 'fifo' }))).toMatchObject({
      gross: 100000,
    });
    expect(grossOf(ctx({ costMethod: 'lifo' }))).toMatchObject({
      gross: 50000,
      costMethod: 'lifo',
    });
    expect(grossOf(ctx({ costMethod: 'average' }))).toMatchObject({
      gross: 75000,
      costMethod: 'average',
    });
  });
});
