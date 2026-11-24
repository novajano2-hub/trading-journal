import { describe, expect, test } from 'vitest';
import { makeTrade } from '@/domain/__fixtures__/trades';
import { defaultMetricContext } from '@/domain/metrics/context';
import { statusOf } from './trade-rows';

const ctx = defaultMetricContext('UTC');

describe('statusOf', () => {
  test('a closed trade reads Win, Loss or Breakeven by the breakeven range', () => {
    expect(statusOf(makeTrade({ net: 5000, gross: 5000 }), ctx)).toBe('Win');
    expect(statusOf(makeTrade({ net: -5000, gross: -5000 }), ctx)).toBe('Loss');
    expect(statusOf(makeTrade({ net: 0, gross: 0 }), ctx)).toBe('Breakeven');
    const wide = {
      ...ctx,
      breakevenRange: { unit: 'amount' as const, from: -1000, to: 1000 },
    };
    expect(statusOf(makeTrade({ net: 800, gross: 800 }), wide)).toBe(
      'Breakeven',
    );
  });

  test('an open trade reads Open', () => {
    expect(statusOf(makeTrade({ status: 'open', net: 0 }), ctx)).toBe('Open');
  });
});
