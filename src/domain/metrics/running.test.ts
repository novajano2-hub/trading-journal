import { describe, expect, test } from 'vitest';
import { makeTrade } from '../__fixtures__/trades';
import { runningByExit } from './running';

const at = (d: string, h = 15) => `2026-03-${d}T${h}:00:00Z`;

describe('runningByExit', () => {
  test('the running total at the close of each exit day, oldest first', () => {
    const trades = [
      makeTrade({
        id: 'c',
        openedAt: at('04', 14),
        closedAt: at('04'),
        net: 500,
      }),
      makeTrade({
        id: 'a',
        openedAt: at('02', 14),
        closedAt: at('02'),
        net: 1000,
      }),
      makeTrade({
        id: 'b',
        openedAt: at('02', 16),
        closedAt: at('02', 17),
        net: -400,
      }),
    ];
    expect(runningByExit(trades, (t) => t.net, 'UTC')).toEqual([600, 1100]);
  });

  test('reads the value the caller chooses, so a unit can drive it', () => {
    const trades = [
      makeTrade({ id: 'a', closedAt: at('02'), net: 1000 }),
      makeTrade({ id: 'b', closedAt: at('03'), net: 2000 }),
    ];
    expect(runningByExit(trades, () => 2.5, 'UTC')).toEqual([2.5, 5]);
  });

  test('open trades are left out, and nothing gives an empty line', () => {
    const open = makeTrade({ id: 'o', status: 'open', net: 900 });
    expect(runningByExit([open], (t) => t.net, 'UTC')).toEqual([]);
    expect(runningByExit([], (t) => t.net, 'UTC')).toEqual([]);
  });

  test('the day is the trader local date of the exit', () => {
    const t = makeTrade({
      id: 'a',
      closedAt: '2026-03-03T02:00:00Z',
      net: 100,
    });
    const u = makeTrade({
      id: 'b',
      closedAt: '2026-03-02T23:00:00Z',
      net: 100,
    });
    // In New York both exits fall on 2 March: one point.
    expect(runningByExit([t, u], (x) => x.net, 'America/New_York')).toEqual([
      200,
    ]);
  });
});
