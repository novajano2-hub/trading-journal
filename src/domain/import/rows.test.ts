import { describe, expect, test } from 'vitest';
import { parseCsv } from './csv';
import { guessMapping } from './mapping';
import { readRows } from './rows';

const ids = { importId: 'imp1', accountId: 'acc1' };
const read = (text: string) => {
  const p = parseCsv(text);
  return readRows(
    p,
    guessMapping(p, { sourceTimeZone: 'America/New_York' }),
    ids,
  );
};
const H = 'Time,Symbol,Side,Qty,Price,Commission\n';
const MT =
  'Ticket,Open Time,Type,Size,Item,Price,S / L,T / P,Close Time,Price,Commission,Taxes,Swap,Profit\n';

describe('readRows', () => {
  test('a fill row becomes an execution in UTC', () => {
    const r = read(H + '2026-11-16 09:41:00,ESZ5,Buy,2,6010.00,2.50\n');
    expect(r.issues).toEqual([]);
    expect(r.fills[0]!.execution).toEqual({
      id: 'imp1:r2',
      accountId: 'acc1',
      symbol: 'ESZ5',
      side: 'buy',
      qty: 2,
      price: 6010,
      time: '2026-11-16T14:41:00.000Z',
      fees: 0,
      commission: 250,
    });
  });
  test('rejects bad quantities, times, sides and numbers before the builder (E1)', () => {
    const r = read(
      H +
        [
          '2026-11-16 09:41,ESZ5,Buy,0,6010,0',
          '2026-11-16 09:41,ESZ5,Buy,-2,6010,0',
          'yesterday,ESZ5,Buy,1,6010,0',
          '2026-11-16 09:41,ESZ5,cancel,1,6010,0',
          '2026-11-16 09:41,,Buy,1,6010,0',
          '2026-11-16 09:41,ESZ5,Buy,1,6010,x',
        ].join('\n'),
    );
    expect(r.fills).toEqual([]);
    expect(r.issues.map((i) => [i.rowIndex, i.field, i.code])).toEqual([
      [2, 'qty', 'qty-invalid'],
      [3, 'qty', 'qty-invalid'],
      [4, 'time', 'time-unparseable'],
      [5, 'side', 'side-unrecognised'],
      [6, 'symbol', 'missing'],
      [7, 'commission', 'number-unparseable'],
    ]);
  });
  test('a negative quantity on a sell row is its size; fees are costs', () => {
    expect(
      read(H + '2026-11-16 09:41,ESZ5,Sell,-2,6010,(1.25)\n').fills[0]!
        .execution,
    ).toMatchObject({ side: 'sell', qty: 2, commission: 125 });
  });
  test('decimal commas in a semicolon export (Review Focus 3)', () => {
    expect(
      read('Time;Symbol;Side;Qty;Price\n16/11/2026 09:41;ESZ5;Buy;2;6010,25\n')
        .fills[0]!.execution.price,
    ).toBe(6010.25);
  });
  test('identical rows share a fingerprint; a different field changes it', () => {
    const r = read(
      H +
        '2026-11-16 09:41,ESZ5,Buy,1,6010,0\n2026-11-16 09:41,ESZ5,Buy,1,6010,0\n2026-11-16 09:41,ESZ5,Buy,2,6010,0\n',
    );
    expect(r.fills[0]!.fingerprint).toBe(r.fills[1]!.fingerprint);
    expect(r.fills[2]!.fingerprint).not.toBe(r.fills[0]!.fingerprint);
    expect(r.fills[0]!.fingerprint).toBe(
      'ESZ5|buy|1|6010|2026-11-16T14:41:00.000Z|',
    );
  });
  test('a MetaTrader row is an entry and an exit; a balance row is skipped', () => {
    const p = parseCsv(
      MT +
        '1,2026.11.16 10:00:00,sell,0.50,eurusd,1.05200,0,0,2026.11.16 11:30:00,1.05000,-3.50,0,0,100.00\n' +
        '2,2026.11.16 12:00:00,balance,,,,,,,,,,,1000.00\n',
    );
    const r = readRows(
      p,
      guessMapping(p, { sourceTimeZone: 'Europe/London' }),
      ids,
    );
    expect(r.trips[0]).toMatchObject({
      rowIndex: 2,
      filePnl: 10000,
      entry: {
        id: 'imp1:r2:entry',
        side: 'sell',
        qty: 0.5,
        price: 1.052,
        time: '2026-11-16T10:00:00.000Z',
        commission: 350,
      },
      exit: {
        id: 'imp1:r2:exit',
        side: 'buy',
        qty: 0.5,
        price: 1.05,
        time: '2026-11-16T11:30:00.000Z',
        commission: 0,
      },
    });
    expect(r.trips[0]!.fingerprint).toBe(
      'trip|EURUSD|sell|0.5|1.052|1.05|2026-11-16T10:00:00.000Z|2026-11-16T11:30:00.000Z',
    );
    expect(r.issues).toEqual([
      { rowIndex: 3, field: 'closeTime', code: 'missing', value: '' },
    ]);
  });
  test('a close before its open is rejected', () => {
    const p = parseCsv(
      MT +
        '1,2026.11.16 11:30:00,buy,1,eurusd,1.05000,0,0,2026.11.16 10:00:00,1.05200,0,0,0,50.00\n',
    );
    const r = readRows(
      p,
      guessMapping(p, { sourceTimeZone: 'Europe/London' }),
      ids,
    );
    expect(r.trips).toEqual([]);
    expect(r.issues).toEqual([
      {
        rowIndex: 2,
        field: 'closeTime',
        code: 'close-before-open',
        value: '2026.11.16 10:00:00',
      },
    ]);
  });
});

describe('the swap column of a closed-trades file', () => {
  const T =
    'Open Time,Close Time,Symbol,Side,Qty,Entry Price,Exit Price,Commission,Swap,P&L\n';
  const row = (swap: string) =>
    `2026-11-16 09:30,2026-11-16 09:45,ESZ5,Long,1,6000,6004,5.00,${swap},200.00\n`;
  const swapOf = (cell: string) => read(T + row(cell)).trips[0]!.swap;

  test('is read signed, as the file has it: a charge is negative', () => {
    expect(swapOf('-4.86')).toBe(-486);
    expect(swapOf('1.20')).toBe(120);
    // A bracketed amount is a negative one, in the file's own style.
    expect(swapOf('(4.86)')).toBe(-486);
  });
  test('a zero is a swap of 0; a blank cell is no swap', () => {
    expect(swapOf('0.00')).toBe(0);
    expect(read(T + row('')).trips[0]).not.toHaveProperty('swap');
  });
  test('a cell that is not a number rejects the row on the swap', () => {
    const r = read(T + row('abc'));
    expect(r.trips).toEqual([]);
    expect(r.issues).toEqual([
      { rowIndex: 2, field: 'swap', code: 'number-unparseable', value: 'abc' },
    ]);
  });
  test('a MetaTrader row carries the swap from its own column', () => {
    const p = parseCsv(
      MT +
        '1,2026.11.16 10:00:00,sell,0.50,eurusd,1.05200,0,0,2026.11.16 11:30:00,1.05000,-3.50,0,-4.86,100.00\n',
    );
    const r = readRows(
      p,
      guessMapping(p, { sourceTimeZone: 'Europe/London' }),
      ids,
    );
    expect(r.trips[0]).toMatchObject({ swap: -486, filePnl: 10000 });
  });
  test('the swap is not part of the row fingerprint', () => {
    expect(read(T + row('-4.86')).trips[0]!.fingerprint).toBe(
      read(T + row('')).trips[0]!.fingerprint,
    );
  });
  test('a fills file gives no swap, even with a column named Swap', () => {
    const r = read(
      'Time,Symbol,Side,Qty,Price,Swap\n2026-11-16 09:41,ESZ5,Buy,1,6010,-4.86\n',
    );
    expect(r.issues).toEqual([]);
    expect(r.fills[0]!.execution).not.toHaveProperty('swap');
    expect(r.trips).toEqual([]);
  });
});
