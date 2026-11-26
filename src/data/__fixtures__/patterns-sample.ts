import { makeTrade } from '@/domain/__fixtures__/trades';
import type { SampleWorkspace } from '../seed/generate';
import { fixtureSample } from './sample';

/**
 * Test-only: `fixtureSample` with its trades replaced by three: one opened in
 * two entries in each account (`p-1` in the active `acc-a`, `p-old` in the
 * archived `acc-b`: the pattern Added to the position needs no look-back) and
 * a plain one, `p-plain`, on the 10th.
 */
export function patternSample(): SampleWorkspace {
  const fx = fixtureSample();
  const ws = fx.trades[0]!.workspaceId;
  const scaled = (
    id: string,
    serial: number,
    accountId: string,
    day: string,
  ) => {
    const fill = (fid: string, side: 'buy' | 'sell', time: string) => ({
      id: `${id}-${fid}`,
      accountId,
      symbol: 'ESZ5',
      side,
      qty: 1,
      price: 4500,
      time,
      fees: 0,
      commission: 0,
    });
    return makeTrade({
      id,
      serial,
      workspaceId: ws,
      accountId,
      net: 5_000,
      openedAt: `${day}T15:00:00Z`,
      closedAt: `${day}T15:30:00Z`,
      executions: [
        fill('e1', 'buy', `${day}T15:00:00Z`),
        fill('e2', 'buy', `${day}T15:05:00Z`),
        fill('e3', 'sell', `${day}T15:30:00Z`),
      ],
      maxPosition: 2,
    });
  };
  const plain = makeTrade({
    id: 'p-plain',
    serial: 3,
    workspaceId: ws,
    accountId: 'acc-a',
    net: 1_000,
    openedAt: '2026-11-10T15:00:00Z',
    closedAt: '2026-11-10T15:10:00Z',
  });
  return {
    ...fx,
    trades: [
      scaled('p-1', 1, 'acc-a', '2026-11-09'),
      scaled('p-old', 2, 'acc-b', '2026-11-05'),
      plain,
    ],
  };
}
