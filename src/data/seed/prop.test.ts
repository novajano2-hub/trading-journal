import { describe, expect, test } from 'vitest';
import type { Challenge } from '@/domain/types';
import { addPropFinances, reasonOf } from './prop';
import { createRandom } from './random';

describe('reasonOf', () => {
  test("a max drawdown breach reads 'max-drawdown'; every other rule reads 'other' (Keel's call)", () => {
    expect(reasonOf('max-drawdown')).toBe('max-drawdown');
    // No C-row maps these rules onto the trader's list: they are 'other'.
    for (const rule of ['daily-loss', 'period-ended', 'consistency'] as const)
      expect(reasonOf(rule), rule).toBe('other');
  });
});

describe('addPropFinances: the breached challenge resets', () => {
  const challenge = (
    name: string,
    over: Partial<Challenge> = {},
  ): Challenge => ({
    id: `c-${name}`,
    workspaceId: 'sample',
    name,
    firm: 'Sample prop firm',
    steps: 1,
    phases: [
      { step: 'step-1', startDate: '2026-10-01' },
      { step: 'funded', startDate: '2026-10-20' },
    ],
    phase: 'evaluation',
    status: 'active',
    evaluationFee: 10_000,
    activationFee: 5_000,
    ...over,
  });

  /** The breach day `after` days past the start, and the reset dates a stream draws, oldest first. */
  function resetsAfter(
    after: number,
    stream: number,
  ): { breachedOn: string; dates: string[] } {
    const born = Date.parse('2026-10-01T00:00:00Z');
    const breachedOn = new Date(born + after * 86_400_000)
      .toISOString()
      .slice(0, 10);
    const { propTxns } = addPropFinances({
      endDate: '2026-12-31',
      trades: [],
      strategyRng: createRandom(stream),
      txnRng: createRandom(stream + 1),
      challenges: [
        challenge('Forex 100K'),
        challenge('Futures 50K', { phase: 'funded' }),
        challenge('Futures 100K', { status: 'breached', breachedOn }),
      ],
    });
    return {
      breachedOn,
      dates: propTxns
        .filter((t) => t.category === 'reset-fee')
        .map((t) => t.date)
        .sort(),
    };
  }

  test('no reset falls after the day the challenge breached', () => {
    // A breach inside the reset window (born + 6 to 26 days) is the case the cap serves.
    for (const after of [3, 10, 16, 22])
      for (let stream = 1; stream <= 40; stream++) {
        const { breachedOn, dates } = resetsAfter(after, stream);
        expect(dates).toHaveLength(2);
        for (const d of dates)
          expect(d <= breachedOn, `${after} days, stream ${stream}: ${d}`).toBe(
            true,
          );
      }
  });

  test('a breach later than the reset window leaves the dates as drawn', () => {
    for (let stream = 1; stream <= 20; stream++) {
      const [first, second] = resetsAfter(42, stream).dates;
      // born + 6..12, then 7..14 more: always inside 42 days.
      expect(first! > '2026-10-01').toBe(true);
      expect(second! > first!).toBe(true);
      expect(second! <= '2026-11-12').toBe(true);
    }
  });
});
