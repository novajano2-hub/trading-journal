import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, test, vi } from 'vitest';
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

// `planImport` as it was, with its calls recorded: the cancel tests ask what was planned.
vi.mock('@/domain/import/plan', async (original) => {
  const real = await original<typeof import('@/domain/import/plan')>();
  return { ...real, planImport: vi.fn(real.planImport) };
});

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

  describe('cancelling a request', () => {
    const one = () => input(H + '2026-11-16 09:41:00,ESZ5,Buy,1,6010\n');
    const two = () =>
      input(H + '2026-11-16 09:41:00,ESZ5,Buy,2,6010\n', ctx(), 'second');

    /** The import ids `planImport` has been asked for, here or in a fake worker. */
    const planned = () =>
      vi.mocked(planImport).mock.calls.map(([, , , meta]) => meta.importId);
    beforeEach(() => {
      vi.mocked(planImport).mockClear();
    });

    test('the request the worker is on is dropped and the worker ended, so a page that left stops it at once', async () => {
      const { plan, workers } = harness(true);
      const controller = new AbortController();
      const a = plan(one(), controller.signal).catch((e: unknown) => e);
      expect(workers[0]!.posted).toHaveLength(1);
      // A reply the worker had already sent can still reach the client after it is ended, as a
      // browser can deliver one: it is for no one, and it plans nothing on the main thread.
      const late = () =>
        workers[0]!.onmessage?.({
          data: { id: workers[0]!.posted[0]!.id, error: 'late' },
        } as MessageEvent<PlanReply>);
      controller.abort();
      expect(await a).toBe(controller.signal.reason);
      expect(workers[0]!.terminated).toBe(true);
      late();
      await new Promise((r) => setTimeout(r, 20));
      // The next request has a worker of its own, and the late reply does not reach it.
      const b = plan(two());
      expect(workers).toHaveLength(2);
      late();
      workers[1]!.release(workers[1]!.posted[0]!.id);
      await expect(b).resolves.toStrictEqual(main(two()));
      expect(planned()).not.toContain('imp1');
    });

    test('a request on the main thread is dropped before it is planned', async () => {
      const plan = withWorker(null);
      const controller = new AbortController();
      const a = plan(one(), controller.signal).catch((e: unknown) => e);
      controller.abort();
      expect(await a).toBe(controller.signal.reason);
      // Its turn comes and goes with no later request to replace it: still nothing is planned.
      await new Promise((r) => setTimeout(r, 20));
      expect(planned()).toEqual([]);
      // The client is not left stuck: the next request is planned.
      await expect(plan(two())).resolves.toStrictEqual(main(two()));
      expect(planned()).toEqual(['second', 'second']);
    });

    test('a request already cancelled is refused without waking a worker', async () => {
      const { plan, workers } = harness();
      const controller = new AbortController();
      controller.abort();
      await expect(plan(one(), controller.signal)).rejects.toBe(
        controller.signal.reason,
      );
      expect(workers).toHaveLength(0);
    });

    test('cancelling a request that was replaced, or that has its plan, touches nothing else', async () => {
      const { plan, workers } = harness(true);
      const first = new AbortController();
      const a = plan(one(), first.signal).catch((e: unknown) => e);
      const b = plan(two());
      expect(await a).toBeInstanceOf(StalePlanError);
      // The earlier one is gone already: the worker the later one is on stays.
      first.abort();
      expect(workers[1]!.terminated).toBe(false);
      workers[1]!.release(workers[1]!.posted[0]!.id);
      await expect(b).resolves.toStrictEqual(main(two()));

      const done = new AbortController();
      const { plan: again, workers: others } = harness();
      await again(one(), done.signal);
      done.abort();
      expect(others[0]!.terminated).toBe(false);
    });
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
