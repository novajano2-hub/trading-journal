// @vitest-environment happy-dom
import { cleanup, screen, waitFor } from '@testing-library/react';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { MotionGlobalConfig } from 'motion/react';
import { afterEach, expect, test, vi } from 'vitest';
import { fixtureSample } from '@/data/__fixtures__/sample';
import { createLocalRepository } from '@/data/local/local-repository';
import { SAMPLE_WORKSPACE } from '@/data/workspaces';
import { renderApp } from '../__fixtures__/render-app';
import { DayView } from './day-view';

vi.mock('next/navigation', () => import('../__fixtures__/navigation'));
// The scores take their time (trades, accounts and flows, then the whole
// history); here they never arrive. A closed day must not need them.
vi.mock('@/data/query/derived', async (original) => ({
  ...(await original<typeof import('@/data/query/derived')>()),
  useDayScores: () => ({ data: undefined }),
}));

MotionGlobalConfig.skipAnimations = true;
afterEach(cleanup);

test("a closed day's plan page is read-only before the scores load", async () => {
  const WS = SAMPLE_WORKSPACE.id;
  const repo = createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: async () => fixtureSample(),
  });
  await repo.prefs.update({ seenTips: ['day-plan-templates'] });
  const tracker = await repo.tracker.get(WS);
  await repo.days.finish(WS, '2026-11-18', {
    version: tracker.versions[0]!,
    inputs: {},
    ticks: {},
  });
  renderApp(<DayView date="2026-11-18" mode="plan" />, {
    repository: repo,
    url: '/app/day/2026-11-18/plan',
  });
  const note = await screen.findByRole('textbox', { name: 'Daily note' });
  await waitFor(() =>
    expect(note.getAttribute('contenteditable')).toBe('false'),
  );
  expect(screen.getByText('Locked')).toBeTruthy();
  expect(screen.queryByText(/Drop chart screenshots/)).toBeNull();
});
