import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { parseCsv } from './csv';
import { guessMapping, type MappingOptions } from './mapping';
import { planImport, type ImportContext } from './plan';

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

  test('a position closed by a later import is one trade keeping id, serial and tags (Review Focus 2)', () => {
    const open = {
      ...plan(H + '2026-11-16 09:41:00,ESZ5,Buy,2,6010\n').trades[0]!,
      serial: 7,
      tagIds: ['t1'],
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
        status: 'closed',
        gross: 50000,
        importId: 'imp2',
      }),
    ]);
  });

  describe('an overlapping export that adds an earlier fill (ruling 1)', () => {
    const first = plan(H + '2026-11-16 09:41:00,ESZ5,Buy,2,6010\n');
    const open = { ...first.trades[0]!, serial: 7, tagIds: ['t1'] };
    const later = (rows: string) =>
      plan(
        H + rows,
        ctx({
          nextSerial: 9,
          openTrades: [open],
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
  });

  test('a merge keeps a user-entered risk and recomputes one derived from the stop (ruling 2)', () => {
    const stored = plan(H + '2026-11-16 09:41:00,ESZ5,Buy,2,6010\n').trades[0]!;
    const merge = (initialRisk: number) =>
      plan(
        H +
          '2026-11-16 09:50:00,ESZ5,Buy,1,6013\n2026-11-16 10:00:00,ESZ5,Sell,3,6020\n',
        ctx({ openTrades: [{ ...stored, plannedStop: 6000, initialRisk }] }),
        {},
        'imp2',
      ).trades[0]!;
    expect(merge(75000)).toMatchObject({
      plannedStop: 6000,
      initialRisk: 75000,
    });
    // 100000 is riskFromStop at the old 2 @ 6010; the merged 3 @ 6011 is 165000.
    expect(merge(100000)).toMatchObject({
      plannedStop: 6000,
      initialRisk: 165000,
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

  test('nothing valid to import', () =>
    expect(plan(H + 'x,ESZ5,Buy,0,1\n').blocked).toBe('no-rows'));
});
