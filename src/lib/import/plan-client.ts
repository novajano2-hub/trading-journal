import { planImport, type ImportPlan } from '@/domain/import/plan';
import {
  PlanAssembler,
  type PlanInput,
  type PlanReply,
  type PlanRequest,
} from './plan-protocol';

/** The part of a `Worker` the client uses, so a test can stand one in. */
export interface WorkerLike {
  postMessage(message: PlanRequest): void;
  terminate(): void;
  onmessage: ((e: MessageEvent<PlanReply>) => void) | null;
  onerror: ((e: ErrorEvent) => void) | null;
  onmessageerror: ((e: MessageEvent) => void) | null;
}

/** An earlier request that a later one replaced before its plan came back. */
export class StalePlanError extends Error {
  constructor() {
    super('A newer plan was asked for');
    this.name = 'StalePlanError';
  }
}

interface Waiting {
  request: PlanRequest;
  assembler: PlanAssembler;
  resolve: (plan: ImportPlan) => void;
  reject: (reason: unknown) => void;
}

/**
 * Makes plans in a worker so a large file never holds the page's thread.
 * `spawn` makes the worker (`null`, or throwing, where there is none).
 *
 * - The latest request wins: an earlier one that has not come back is
 *   rejected with `StalePlanError` at once and its answer is ignored. A
 *   request the worker is still on is stopped (the worker is ended and made
 *   again on the next request), so the latest is not queued behind it.
 * - Where there is no worker, or once one has failed (it cannot be made or
 *   sent to, it errors, or its answer cannot be read), the plan is made on the
 *   main thread, for that request and the ones after it. A plan that fails
 *   inside a working worker is tried once on the main thread, which then
 *   either makes it or gives the import's error.
 */
export function createPlanClient(
  spawn: () => WorkerLike | null,
): (input: PlanInput) => Promise<ImportPlan> {
  let worker: WorkerLike | null = null;
  let broken = false;
  let latest = 0;
  const waiting = new Map<number, Waiting>();

  /** On the main thread, in a task of its own so the page can paint what it is waiting for first. */
  function here(request: PlanRequest): Promise<ImportPlan> {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        if (request.id !== latest) return reject(new StalePlanError());
        try {
          const { parsed, mapping, ctx, meta } = request;
          resolve(planImport(parsed, mapping, ctx, meta));
        } catch (e) {
          reject(e);
        }
      }, 0);
    });
  }

  function stop(): void {
    worker?.terminate();
    worker = null;
  }

  /** The worker failed: every request it held goes to the main thread, and the worker is not used again. */
  function fail(): void {
    broken = true;
    stop();
    const held = [...waiting.values()];
    waiting.clear();
    for (const w of held) here(w.request).then(w.resolve, w.reject);
  }

  function reached(from: WorkerLike, reply: PlanReply): void {
    if (from !== worker) return;
    const w = waiting.get(reply.id);
    // No one waits for it: it is an answer to an earlier request.
    if (!w) return;
    if ('list' in reply) w.assembler.add(reply.list, reply.items);
    else {
      waiting.delete(reply.id);
      if ('plan' in reply) w.resolve(w.assembler.finish(reply.plan));
      // Once on the main thread; if that fails too, the import's error stands.
      else here(w.request).then(w.resolve, w.reject);
    }
  }

  function spawned(): WorkerLike | null {
    if (worker) return worker;
    try {
      worker = spawn();
    } catch {
      worker = null;
    }
    if (!worker) {
      broken = true;
      return null;
    }
    const made = worker;
    made.onmessage = (e) => reached(made, e.data);
    made.onerror = () => made === worker && fail();
    made.onmessageerror = () => made === worker && fail();
    return made;
  }

  return (input) => {
    const request: PlanRequest = { id: ++latest, ...input };
    if (waiting.size > 0) {
      // Earlier requests are dropped; the worker is on one of them.
      for (const w of waiting.values()) w.reject(new StalePlanError());
      waiting.clear();
      stop();
    }
    const target = broken ? null : spawned();
    if (!target) return here(request);
    return new Promise<ImportPlan>((resolve, reject) => {
      waiting.set(request.id, {
        request,
        assembler: new PlanAssembler(),
        resolve,
        reject,
      });
      try {
        target.postMessage(request);
      } catch {
        // It cannot be sent to (a value that does not clone): the main thread takes this one.
        fail();
      }
    });
  };
}

/** The worker that makes the import's plans: a module worker, the pure `planImport` behind a message. */
function spawnPlanWorker(): WorkerLike | null {
  if (typeof Worker === 'undefined') return null;
  return new Worker(new URL('./plan.worker.ts', import.meta.url), {
    type: 'module',
  }) as WorkerLike;
}

/**
 * The plan for an import, made in a worker (or on the main thread where there
 * is none). Rejects with `StalePlanError` when a later request replaces it.
 */
export const planInWorker = createPlanClient(spawnPlanWorker);
