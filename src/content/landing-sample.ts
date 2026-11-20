import type { Cents, Execution, Side } from '@/domain/types';

/** Every number on the landing page derives from these fills. */
export const SAMPLE_START: Cents = 5_000_000;

const EST_OFFSET_HOURS = 5; // 16-20 Nov 2026 is EST (UTC-5)

/** US Eastern (EST) wall-clock time to a UTC ISO string. */
function est(date: string, hhmm: string): string {
  const [y = 0, m = 0, d = 0] = date.split('-').map(Number);
  const [h = 0, min = 0] = hhmm.split(':').map(Number);
  return new Date(
    Date.UTC(y, m - 1, d, h + EST_OFFSET_HOURS, min),
  ).toISOString();
}

type Fill = [
  n: number,
  side: Side,
  symbol: string,
  qty: number,
  price: number,
  date: string,
  time: string,
  commission: Cents,
];

const FILLS: readonly Fill[] = [
  [1, 'buy', 'ESZ5', 2, 6010.0, '2026-11-16', '09:41', 250],
  [1, 'sell', 'ESZ5', 2, 6014.5, '2026-11-16', '10:02', 250],
  [2, 'sell', 'NQZ5', 1, 21050.0, '2026-11-16', '10:30', 250],
  [2, 'buy', 'NQZ5', 1, 21062.25, '2026-11-16', '10:48', 250],
  [3, 'buy', 'ESZ5', 1, 6020.25, '2026-11-17', '09:35', 250],
  [3, 'sell', 'ESZ5', 1, 6026.75, '2026-11-17', '09:58', 250],
  [4, 'buy', 'MESZ5', 3, 6030.0, '2026-11-17', '11:10', 75],
  [4, 'sell', 'MESZ5', 3, 6027.5, '2026-11-17', '11:25', 75],
  [5, 'sell', 'ESZ5', 2, 6005.0, '2026-11-18', '09:45', 250],
  [5, 'buy', 'ESZ5', 2, 5998.25, '2026-11-18', '10:20', 250],
  [6, 'buy', 'NQZ5', 1, 21100.0, '2026-11-19', '09:50', 250],
  [6, 'sell', 'NQZ5', 1, 21086.5, '2026-11-19', '10:05', 250],
  [7, 'buy', 'ESZ5', 2, 6040.0, '2026-11-19', '13:00', 250],
  [7, 'sell', 'ESZ5', 2, 6040.0, '2026-11-19', '13:30', 250],
  [8, 'buy', 'ESZ5', 1, 6050.5, '2026-11-20', '10:15', 250],
  [8, 'sell', 'ESZ5', 1, 6058.0, '2026-11-20', '10:40', 250],
];

export const SAMPLE_EXECUTIONS: readonly Execution[] = FILLS.map(
  ([n, side, symbol, qty, price, date, time, commission], i) => ({
    id: `sample-${n}-${i}`,
    accountId: 'sample',
    symbol,
    side,
    qty,
    price,
    time: est(date, time),
    fees: 0,
    commission,
  }),
);
