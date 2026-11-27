import { describe, expect, test } from 'vitest';
import { makeTrade } from '../__fixtures__/trades';
import { defaultMetricContext } from './context';
import { throughDay } from './through-day';

const ctx = defaultMetricContext('America/New_York');

// 2026-03-03 is winter time in New York (UTC-5): 14:31Z is 09:31 ET.
const at = (id: string, closedAt: string, net: number, serial = 1) =>
  makeTrade({ id, net, serial, closedAt, openedAt: '2026-03-03T13:00:00Z' });

describe('throughDay (C14)', () => {
  test('orders the closed trades by the time of day they closed, whatever the day', () => {
    const late = at('late', '2026-03-03T15:05:00Z', 200); // 10:05
    const early = at('early', '2026-03-05T14:31:00Z', 300); // 09:31, two days on
    const mid = at('mid', '2026-03-04T14:45:00Z', -100); // 09:45
    const points = throughDay([late, early, mid], ctx);
    expect(points.map((p) => p.tradeId)).toEqual(['early', 'mid', 'late']);
    expect(points.map((p) => p.minute)).toEqual([571, 585, 605]);
  });

  test('the win rate, average win and average loss are read after each trade', () => {
    const points = throughDay(
      [
        at('a', '2026-03-03T14:31:00Z', 300),
        at('b', '2026-03-04T14:45:00Z', -100),
        at('c', '2026-03-05T15:05:00Z', 200),
        at('d', '2026-03-06T15:30:00Z', -300),
      ],
      ctx,
    );
    expect(points.map((p) => p.winRate)).toEqual([1, 1 / 2, 2 / 3, 1 / 2]);
    expect(points.map((p) => p.avgWin)).toEqual([300, 300, 250, 250]);
    // The average loss is a loss: negative.
    expect(points.map((p) => p.avgLoss)).toEqual([null, -100, -100, -200]);
    expect(points.map((p) => p.trades)).toEqual([1, 2, 3, 4]);
  });

  test('a breakeven trade is a point of its own but changes no rate or average', () => {
    const points = throughDay(
      [
        at('a', '2026-03-03T14:31:00Z', 300),
        at('flat', '2026-03-04T14:45:00Z', 0),
        at('b', '2026-03-05T15:05:00Z', -100),
      ],
      ctx,
    );
    expect(points.map((p) => p.winRate)).toEqual([1, 1, 1 / 2]);
    expect(points[1]).toMatchObject({ avgWin: 300, avgLoss: null, trades: 2 });
  });

  test('nothing decided yet leaves the rate and the averages empty', () => {
    const [p] = throughDay([at('flat', '2026-03-03T14:31:00Z', 0)], ctx);
    expect(p).toMatchObject({ winRate: null, avgWin: null, avgLoss: null });
  });

  test('trades closing in the same minute keep the order they closed in', () => {
    const first = at('first', '2026-03-03T14:31:05Z', 100, 1);
    const second = at('second', '2026-03-03T14:31:40Z', -100, 2);
    expect(throughDay([second, first], ctx).map((p) => p.tradeId)).toEqual([
      'first',
      'second',
    ]);
  });

  test('the gross basis classifies and averages on gross P&L', () => {
    const t = makeTrade({
      id: 'g',
      net: -50,
      fees: 100,
      closedAt: '2026-03-03T14:31:00Z',
    });
    const [net] = throughDay([t], ctx);
    const [gross] = throughDay([t], { ...ctx, pnlBasis: 'gross' });
    expect(net).toMatchObject({ winRate: 0, avgLoss: -50 });
    expect(gross).toMatchObject({ winRate: 1, avgWin: 50 });
  });

  test('a narrowing unit reads the averages in it, ticks here', () => {
    // ES ticks are 0.25: two points up is 8 ticks; two down is 8 against.
    const win = makeTrade({
      id: 'w',
      net: 100,
      avgExit: 4502,
      closedAt: '2026-03-03T14:31:00Z',
    });
    const loss = makeTrade({
      id: 'l',
      net: -100,
      avgExit: 4498,
      closedAt: '2026-03-03T14:45:00Z',
    });
    const points = throughDay([win, loss], { ...ctx, unit: 'ticks' });
    expect(points[1]).toMatchObject({ winRate: 1 / 2, avgWin: 8, avgLoss: -8 });
  });

  test('open trades are left out, and the caller list is not reordered', () => {
    const open = makeTrade({ id: 'open', net: 0, status: 'open' });
    const a = at('a', '2026-03-03T16:00:00Z', 1);
    const b = at('b', '2026-03-03T15:00:00Z', 1);
    const list = [open, a, b];
    expect(throughDay(list, ctx).map((p) => p.tradeId)).toEqual(['b', 'a']);
    expect(list.map((t) => t.id)).toEqual(['open', 'a', 'b']);
    expect(throughDay([], ctx)).toEqual([]);
  });
});
