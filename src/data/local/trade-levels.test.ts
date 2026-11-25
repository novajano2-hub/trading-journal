import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { expect, test } from 'vitest';
import { resolveInstrument } from '@/domain/instruments';
import { fixtureSample } from '../__fixtures__/sample';
import type { ManualTradeInput } from '../repository';
import { createLocalRepository } from './local-repository';

const S = 'sample';

function setup() {
  const repo = createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: async () => fixtureSample(),
  });
  return repo;
}

/** Two ES contracts bought at 5000 and sold at 5010, in an active account. */
const input = (over: Partial<ManualTradeInput> = {}): ManualTradeInput => ({
  accountId: 'acc-a',
  instrument: resolveInstrument('ESZ6')!,
  fills: [
    {
      time: '2026-11-19T14:30:00.000Z',
      side: 'buy',
      qty: 2,
      price: 5000,
      commission: 0,
      fees: 0,
    },
    {
      time: '2026-11-19T15:00:00.000Z',
      side: 'sell',
      qty: 2,
      price: 5010,
      commission: 0,
      fees: 0,
    },
  ],
  ...over,
});

test('a stop saved through the repository rewrites the stored risk, and clearing it removes it', async () => {
  const repo = setup();
  const made = await repo.trades.createManual(
    S,
    input({ plannedStop: 4990, plannedTarget: 5030 }),
  );
  // One level each, saved as levels; 10 points on 2 contracts at $50.
  expect(made.stops?.levels).toEqual([{ value: 4990, qty: 2 }]);
  expect(made.initialRisk).toBe(100000);

  const two = await repo.trades.update(S, made.id, {
    stops: {
      unit: 'price',
      levels: [
        { value: 4990, qty: 1 },
        { value: 4980, qty: 1 },
      ],
    },
  });
  expect(two.initialRisk).toBe(150000);
  expect((await repo.trades.get(S, made.id))?.initialRisk).toBe(150000);

  const cleared = await repo.trades.update(S, made.id, { stops: undefined });
  expect(cleared).not.toHaveProperty('stops');
  expect(cleared).not.toHaveProperty('initialRisk');
  // The target stays, with nothing to compare it to.
  expect(cleared.targets?.levels).toEqual([{ value: 5030, qty: 2 }]);
});

test('updateMany saves levels on several trades, each with its own risk', async () => {
  const repo = setup();
  const a = await repo.trades.createManual(S, input());
  const b = await repo.trades.createManual(
    S,
    input({
      fills: [
        {
          time: '2026-11-19T14:30:00.000Z',
          side: 'buy',
          qty: 1,
          price: 5000,
          commission: 0,
          fees: 0,
        },
      ],
    }),
  );
  const stops = {
    unit: 'price' as const,
    levels: [{ value: 4990, qty: 1 }],
  };
  const done = await repo.trades.updateMany(S, [a.id, b.id], { stops });
  // The same stop, but one contract is 10 points at $50 for either.
  expect(done.map((t) => t.initialRisk)).toEqual([50000, 50000]);
});

test('rebuilding a manual trade keeps levels the form cannot show, and the risk follows them', async () => {
  const repo = setup();
  const made = await repo.trades.createManual(S, input({ plannedStop: 4990 }));
  const stops = {
    unit: 'price' as const,
    levels: [
      { value: 4990, qty: 1 },
      { value: 4980, qty: 1 },
    ],
  };
  await repo.trades.update(S, made.id, { stops });
  // The form showed an empty stop box and sends no stop.
  const rebuilt = await repo.trades.replaceManual(S, made.id, input());
  expect(rebuilt.stops).toEqual(stops);
  expect(rebuilt.initialRisk).toBe(150000);
  expect(await repo.trades.get(S, made.id)).toEqual(rebuilt);
});
