import { onTestFinished, vi } from 'vitest';
import { planImport } from '@/domain/import/plan';
import { planInWorker } from '../plan-client';
import type { PlanInput } from '../plan-protocol';

/** A plan that was asked for, and waits for the test to let it go or fail it. */
export interface HeldPlan {
  input: PlanInput;
  resolve: () => void;
  reject: (reason: Error) => void;
}

/**
 * Takes the plan client over for one test: every plan asked for is kept in the
 * returned list, in order, until the test resolves it (with the real plan for
 * its input) or rejects it. The test file mocks `@/lib/import/plan-client`
 * with `planInWorker` as a `vi.fn` around the real one; the hold ends with the
 * test.
 */
export function holdPlans(): HeldPlan[] {
  const held: HeldPlan[] = [];
  vi.mocked(planInWorker).mockImplementation(
    (input) =>
      new Promise((resolve, reject) => {
        held.push({
          input,
          resolve: () =>
            resolve(
              planImport(input.parsed, input.mapping, input.ctx, input.meta),
            ),
          reject,
        });
      }),
  );
  onTestFinished(() => void vi.mocked(planInWorker).mockReset());
  return held;
}
