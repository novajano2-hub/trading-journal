import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { parseCsv } from '@/domain/import/csv';
import { guessMapping } from '@/domain/import/mapping';
import { planImport, type ImportContext } from '@/domain/import/plan';
import { makeTrade } from '@/domain/__fixtures__/trades';
import {
  createPlanClient,
  StalePlanError,
  type WorkerLike,
} from './plan-client';
import {
  answer,
  SLICE,
  type PlanInput,
  type PlanReply,
  type PlanRequest,
} from './plan-protocol';

const H = 'Date/Time,Symbol,Buy/Sell,Quantity,Price\n';
const T =
  'Open Time,Close Time,Symbol,Side,Qty,Entry Price,Exit Price,Commission,P&L\n';
const NOW = '2026-11-21T00:00:00.000Z';

const ctx = (o: Partial<ImportContext> = {}): ImportContext => ({
  workspaceId: 'mine',
  accountId: 'acc1',
  accountCurrency: 'USD',
  nextSerial: 1,
  openTrades: [],
  fingerprints: [],
  overrides: {},
  importRevision: 0,
  ...o,
});

function input(
  text: string,
  c: ImportContext = ctx(),
  importId = 'imp1',
): PlanInput {
  const parsed = parseCsv(text);
  return {
    parsed,
    mapping: guessMapping(parsed, { sourceTimeZone: 'America/New_York' }),
    ctx: c,
    meta: { importId, fileName: 'f.csv', now: NOW },
  };
}

const main = ({ parsed, mapping, ctx: c, meta }: PlanInput) =>
  planImport(parsed, mapping, c, meta);

/**
 * A stand-in for the browser's worker: it clones what it is sent and what it
 * sends back (as a real one does, so a value that cannot be cloned fails here
 * too) and answers with the real worker's own code. `hold` keeps the answers
 * until the test lets them go, in any order.
 */
class FakeWorker implements WorkerLike {
  onmessage: ((e: MessageEvent<PlanReply>) => void) | null = null;
  onerror: ((e: ErrorEvent) => void) | null = null;
  onmessageerror: ((e: MessageEvent) => void) | null = null;
  posted: PlanRequest[] = [];
  held: PlanRequest[] = [];
  terminated = false;
  deliveries = 0;

  constructor(private readonly hold = false) {}

  postMessage(message: PlanRequest) {
    const request = structuredClone(message);
    this.posted.push(request);
    if (this.hold) this.held.push(request);
    else this.respond(request);
  }

  /** Lets the answer to a held request go. */
  release(id: number) {
    const at = this.held.findIndex((r) => r.id === id);
    this.respond(this.held.splice(at, 1)[0]!);
  }

  private respond(request: PlanRequest) {
    for (const reply of answer(request)) {
      const data = structuredClone(reply);
      setTimeout(() => {
        if (this.terminated) return;
        this.deliveries += 1;
        this.onmessage?.({ data } as MessageEvent<PlanReply>);
      }, 0);
    }
  }

  terminate() {
    this.terminated = true;
  }
}

/** A client whose workers are these fakes, a new one each time it asks for one, as a browser gives. */
function harness(hold = false) {
  const workers: FakeWorker[] = [];
  const plan = createPlanClient(() => {
    const w = new FakeWorker(hold);
    workers.push(w);
    return w;
  });
  return { plan, workers };
}

/** A client that is given this one worker, whatever happens to it. */
const withWorker = (worker: WorkerLike | null) =>
  createPlanClient(() => worker);

describe('planInWorker', () => {
  const fixtures: Record<string, () => PlanInput> = {
    'the e2e fills file': () =>
      input(readFileSync('e2e/fixtures/fills.csv', 'utf8')),
    'the landing sample': () =>
      input(readFileSync('e2e/fixtures/sample-fills.csv', 'utf8')),
    'closed trades, one with a P&L to check': () =>
      input(
        T +
          [
            '2026-11-16 09:30:00,2026-11-16 09:45:00,ESZ5,Long,1,6000,6004,5.00,200.00',
            '2026-11-16 09:30:00,2026-11-16 09:45:00,ESZ5,Long,1,6000,6004,5.00,200.02',
            '2026-11-16 09:30:00,2026-11-16 09:45:00,EURGBP,Long,1,0.8700,0.8710,0,125.00',
          ].join('\n'),
      ),
    'an open trade the file closes': () => {
      const first = main(input(H + '2026-11-16 09:41:00,ESZ5,Buy,2,6010\n'));
      const open = {
        ...first.trades[0]!,
        serial: 7,
        tagIds: ['t1'],
        ruleChecks: [{ ruleId: 'r1', followed: true }],
        plannedStop: 6000,
        initialRisk: 100000,
      };
      return input(
        H +
          '2026-11-16 09:30:00,ESZ5,Buy,1,6000\n2026-11-16 09:41:00,ESZ5,Buy,2,6010\n2026-11-17 10:00:00,ESZ5,Sell,3,6012\n',
        ctx({
          nextSerial: 9,
          openTrades: [open],
          fingerprints: first.fingerprints,
        }),
        'imp2',
      );
    },
    'a blocked plan and its point values': () =>
      input(
        H + '2026-11-16 09:41:00,XYZZ5,Buy,1,100\n',
        ctx({ overrides: { ES: { pointValue: 50, tickSize: 0.25 } } }),
      ),
  };

  for (const [name, make] of Object.entries(fixtures))
    test(`the worker and the main thread plan ${name} alike`, async () => {
      const request = make();
      const { plan, workers } = harness();
      const viaWorker = await plan(request);
      const viaMain = await withWorker(null)(request);
      expect(workers[0]!.posted).toHaveLength(1);
      expect(viaWorker).toStrictEqual(main(request));
      expect(viaMain).toStrictEqual(main(request));
    });

  test('a plan longer than a slice comes through the worker in pieces and joins up whole', async () => {
    const rows = Array.from({ length: SLICE + 500 }, (_, i) => {
      const day = new Date(
        Date.UTC(2026, 0, 5 + Math.floor(i / 20), 14, i % 20),
      );
      const at = day.toISOString().slice(0, 19).replace('T', ' ');
      return `${at},ESZ6,${i % 2 ? 'Sell' : 'Buy'},1,${6000 + (i % 7)}`;
    });
    const request = input(H + rows.join('\n'));
    const whole = main(request);
    expect(whole.fingerprints.length).toBeGreaterThan(SLICE);
    const { plan, workers } = harness();
    expect(await plan(request)).toStrictEqual(whole);
    // The lists went in slices, so no one message is a long task to open.
    expect(workers[0]!.deliveries).toBeGreaterThan(2);
  });

  test('a plan with a file P&L per trade slices that too', async () => {
    const rows = Array.from(
      { length: SLICE + 10 },
      (_, i) =>
        `2026-10-01 09:${String(i % 60).padStart(2, '0')}:00,2026-10-01 10:00:00,ESZ5,Long,1,6000,6004,5.00,${i % 3 === 0 ? '200.00' : '195.00'}`,
    );
    const request = input(T + rows.join('\n'));
    const whole = main(request);
    expect(Object.keys(whole.filePnl).length).toBeGreaterThan(SLICE);
    expect(await harness().plan(request)).toStrictEqual(whole);
  });

  test('an answer to an earlier request that arrives after a later one is asked for is dropped', async () => {
    // A worker that cannot be stopped, so it answers both, the later one first.
    const worker = new FakeWorker(true);
    worker.terminate = () => undefined;
    const plan = withWorker(worker);
    const first = input(H + '2026-11-16 09:41:00,ESZ5,Buy,1,6010\n');
    const second = input(
      H + '2026-11-16 09:41:00,ESZ5,Buy,2,6010\n',
      ctx(),
      'second',
    );
    const a = plan(first).catch((e: unknown) => e);
    const b = plan(second);
    // The earlier one is stale the moment a later one is asked for.
    expect(await a).toBeInstanceOf(StalePlanError);
    worker.release(worker.posted[1]!.id);
    worker.release(worker.posted[0]!.id);
    expect(await b).toStrictEqual(main(second));
  });

  test('a request still being worked on is stopped when a later one is asked for, so the later one is not queued behind it', async () => {
    const { plan, workers } = harness(true);
    const first = input(H + '2026-11-16 09:41:00,ESZ5,Buy,1,6010\n');
    const second = input(H + '2026-11-16 09:41:00,ESZ5,Buy,2,6010\n');
    const a = plan(first).catch((e: unknown) => e);
    const b = plan(second);
    expect(await a).toBeInstanceOf(StalePlanError);
    expect(workers).toHaveLength(2);
    expect(workers[0]!.terminated).toBe(true);
    expect(workers[1]!.posted).toHaveLength(1);
    workers[1]!.release(workers[1]!.posted[0]!.id);
    await expect(b).resolves.toStrictEqual(main(second));
  });

  test('a worker with nothing in flight is kept for the next request', async () => {
    const { plan, workers } = harness();
    await plan(input(H + '2026-11-16 09:41:00,ESZ5,Buy,1,6010\n'));
    await plan(input(H + '2026-11-16 09:41:00,ESZ5,Buy,2,6010\n'));
    expect(workers).toHaveLength(1);
    expect(workers[0]!.posted).toHaveLength(2);
    expect(workers[0]!.terminated).toBe(false);
  });

  test('without a Worker the main thread plans, and the latest request still wins', async () => {
    const plan = withWorker(null);
    const first = input(H + '2026-11-16 09:41:00,ESZ5,Buy,1,6010\n');
    const second = input(
      H +
        '2026-11-16 09:41:00,ESZ5,Buy,1,6010\n2026-11-16 09:50:00,ESZ5,Sell,1,6011\n',
    );
    const a = plan(first).catch((e: unknown) => e);
    const b = plan(second);
    expect(await a).toBeInstanceOf(StalePlanError);
    await expect(b).resolves.toStrictEqual(main(second));
  });

  describe('when the worker fails', () => {
    const request = () =>
      input(readFileSync('e2e/fixtures/fills.csv', 'utf8'), ctx(), 'x');

    test('a script error falls back to the main thread, once and for good', async () => {
      const broken = new FakeWorker(true);
      let spawned = 0;
      const plan = createPlanClient(() => {
        spawned += 1;
        return broken;
      });
      const first = plan(request());
      broken.onerror?.({ message: 'boom' } as ErrorEvent);
      await expect(first).resolves.toStrictEqual(main(request()));
      expect(broken.terminated).toBe(true);
      // Later requests do not try a worker again.
      await expect(plan(request())).resolves.toStrictEqual(main(request()));
      expect(spawned).toBe(1);
      expect(broken.posted).toHaveLength(1);
    });

    test('a worker that cannot be made falls back to the main thread', async () => {
      const plan = createPlanClient(() => {
        throw new Error('blocked');
      });
      await expect(plan(request())).resolves.toStrictEqual(main(request()));
    });

    test('an input the worker cannot be sent falls back to the main thread', async () => {
      const worker = new FakeWorker();
      worker.postMessage = () => {
        throw new DOMException('cannot clone', 'DataCloneError');
      };
      await expect(withWorker(worker)(request())).resolves.toStrictEqual(
        main(request()),
      );
    });

    test('an answer the page cannot read falls back too', async () => {
      const worker = new FakeWorker(true);
      const plan = withWorker(worker);
      const p = plan(request());
      worker.onmessageerror?.({} as MessageEvent);
      await expect(p).resolves.toStrictEqual(main(request()));
    });

    test('a plan that fails in the worker is tried once on the main thread, which then gives the import its error', async () => {
      const bad = request();
      // A mapping pointing at a column the file does not have makes no sense to the plan.
      (bad.mapping as { columns: unknown }).columns = null;
      const { plan, workers } = harness();
      await expect(plan(bad)).rejects.toThrow();
      expect(workers[0]!.posted).toHaveLength(1);
      // The worker was not at fault: a good request after it still goes there.
      await expect(plan(request())).resolves.toStrictEqual(main(request()));
      expect(workers[0]!.posted).toHaveLength(2);
    });

    test("a failure of the worker's own plan is tried on the main thread, which can make it", async () => {
      const { plan, workers } = harness(true);
      const p = plan(request());
      const worker = workers[0]!;
      worker.onmessage?.({
        data: { id: worker.posted[0]!.id, error: 'out of memory' },
      } as MessageEvent<PlanReply>);
      await expect(p).resolves.toStrictEqual(main(request()));
    });
  });

  test('what is sent to the worker clones: the context and the file hold no functions', () => {
    const request = input(
      H + '2026-11-16 09:41:00,ESZ5,Buy,1,6010\n',
      ctx({
        openTrades: [makeTrade({ net: 100 })],
        fingerprints: ['a', 'b'],
        overrides: { XYZ: { pointValue: 5, tickSize: 0.5 } },
      }),
    );
    expect(structuredClone(request)).toStrictEqual(request);
  });
});
