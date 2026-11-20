import { describe, expect, test } from 'vitest';
import { makeTrade } from './__fixtures__/trades';
import { closedInOrder, isClosed } from './trade-status';

describe('trade-status', () => {
  test('isClosed needs both status closed and a closedAt', () => {
    const noClose = makeTrade({ net: 1 });
    delete (noClose as { closedAt?: string }).closedAt;
    expect(isClosed(makeTrade({ net: 1 }))).toBe(true);
    expect(isClosed(makeTrade({ net: 1, status: 'open' }))).toBe(false);
    expect(isClosed(noClose)).toBe(false);
  });
  test('closedInOrder sorts by closedAt then serial', () => {
    const a = makeTrade({
      net: 1,
      serial: 2,
      closedAt: '2026-03-02T15:00:00Z',
    });
    const b = makeTrade({
      net: 1,
      serial: 1,
      closedAt: '2026-03-02T15:00:00Z',
    });
    const c = makeTrade({
      net: 1,
      serial: 3,
      closedAt: '2026-03-02T14:00:00Z',
    });
    expect(closedInOrder([a, b, c])).toEqual([c, b, a]);
  });
});
