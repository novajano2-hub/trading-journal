// @vitest-environment happy-dom
import {
  cleanup,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { MotionGlobalConfig } from 'motion/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { fixtureSample } from '@/data/__fixtures__/sample';
import { createLocalRepository } from '@/data/local/local-repository';
import { SHOT_MAX_BYTES, type Repository } from '@/data/repository';
import { SAMPLE_WORKSPACE } from '@/data/workspaces';
import { renderApp } from '../__fixtures__/render-app';
import { DayView } from './day-view';

vi.mock('next/navigation', () => import('../__fixtures__/navigation'));

MotionGlobalConfig.skipAnimations = true;

const WS = SAMPLE_WORKSPACE.id;
const TODAY = '2026-11-19';

let made = 0;
beforeEach(() => {
  made = 0;
  URL.createObjectURL = vi.fn(() => `blob:shot-${(made += 1)}`);
  URL.revokeObjectURL = vi.fn();
});
afterEach(cleanup);

async function open(shots = 0) {
  const repo: Repository = createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: async () => fixtureSample(),
  });
  await repo.prefs.update({ seenTips: ['day-plan-templates'] });
  for (let i = 0; i < shots; i += 1)
    await repo.dayShots.add(WS, TODAY, {
      bytes: new Uint8Array([137, 80, 78, 71, i]).buffer,
      type: 'image/png',
      name: `chart-${i + 1}.png`,
    });
  renderApp(<DayView date={TODAY} mode="plan" />, {
    repository: repo,
    url: `/app/day/${TODAY}/plan`,
  });
  return repo;
}

const card = () => screen.findByRole('region', { name: 'Screenshots' });
const input = async () =>
  (await card()).querySelector('input[type="file"]') as HTMLInputElement;

test('a GIF and a file over 10 MB are refused with a message', async () => {
  const repo = await open();
  const files = await input();
  fireEvent.change(files, {
    target: {
      files: [new File([new Uint8Array(8)], 'move.gif', { type: 'image/gif' })],
    },
  });
  expect(await screen.findByText(/move\.gif isn.t a PNG or JPEG/)).toBeTruthy();
  const big = new File([new Uint8Array(SHOT_MAX_BYTES + 1)], 'huge.png', {
    type: 'image/png',
  });
  fireEvent.change(files, { target: { files: [big] } });
  expect(await screen.findByText(/huge\.png is over 10 MB/)).toBeTruthy();
  expect(await repo.dayShots.list(WS, TODAY)).toHaveLength(0);
});

test('a PNG is kept and shows as a thumbnail', async () => {
  const repo = await open();
  fireEvent.change(await input(), {
    target: {
      files: [
        new File([new Uint8Array([1, 2, 3])], 'ok.png', { type: 'image/png' }),
      ],
    },
  });
  expect(
    await screen.findByRole('button', { name: 'Open screenshot 1 of 1' }),
  ).toBeTruthy();
  expect(await repo.dayShots.list(WS, TODAY)).toHaveLength(1);
});

test('thumbnails revoke their object URLs on unmount', async () => {
  await open(2);
  await screen.findByRole('button', { name: 'Open screenshot 2 of 2' });
  await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalledTimes(2));
  const urls = vi
    .mocked(URL.createObjectURL)
    .mock.results.map((r) => r.value as string);
  expect(URL.revokeObjectURL).not.toHaveBeenCalled();
  cleanup();
  for (const url of urls) expect(URL.revokeObjectURL).toHaveBeenCalledWith(url);
});

test('delete asks first', async () => {
  const repo = await open(2);
  fireEvent.click(
    await screen.findByRole('button', { name: 'Open screenshot 1 of 2' }),
  );
  const viewer = await screen.findByRole('dialog', {
    name: 'Screenshot 1 of 2',
  });
  fireEvent.click(within(viewer).getByRole('button', { name: 'Delete' }));
  const ask = await screen.findByRole('dialog', {
    name: 'Delete this screenshot?',
  });
  expect(await repo.dayShots.list(WS, TODAY)).toHaveLength(2);
  fireEvent.click(
    within(ask).getByRole('button', { name: 'Delete screenshot' }),
  );
  await waitFor(async () =>
    expect(await repo.dayShots.list(WS, TODAY)).toHaveLength(1),
  );
});

test('the viewer pages previous and next', async () => {
  await open(3);
  fireEvent.click(
    await screen.findByRole('button', { name: 'Open screenshot 1 of 3' }),
  );
  const viewer = await screen.findByRole('dialog', {
    name: 'Screenshot 1 of 3',
  });
  const prev = within(viewer).getByRole('button', { name: 'Previous' });
  expect((prev as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(within(viewer).getByRole('button', { name: 'Next' }));
  await screen.findByRole('dialog', { name: 'Screenshot 2 of 3' });
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  await screen.findByRole('dialog', { name: 'Screenshot 3 of 3' });
  expect(
    (screen.getByRole('button', { name: 'Next' }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
  await screen.findByRole('dialog', { name: 'Screenshot 2 of 3' });
});

async function closeDay(repo: Repository, date: string) {
  const tracker = await repo.tracker.get(WS);
  await repo.days.finish(WS, date, {
    version: tracker.versions[0]!,
    inputs: {},
    ticks: {},
  });
}

test("a closed day's plan page keeps its shots with no drop zone and no Delete", async () => {
  const repo = createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: async () => fixtureSample(),
  });
  await repo.prefs.update({ seenTips: ['day-plan-templates'] });
  await repo.dayShots.add(WS, '2026-11-18', {
    bytes: new Uint8Array([137, 80, 78, 71]).buffer,
    type: 'image/png',
    name: 'kept.png',
  });
  await closeDay(repo, '2026-11-18');
  renderApp(<DayView date="2026-11-18" mode="plan" />, {
    repository: repo,
    url: '/app/day/2026-11-18/plan',
  });
  const thumb = await screen.findByRole('button', {
    name: 'Open screenshot 1 of 1',
  });
  expect(screen.queryByText(/Drop chart screenshots/)).toBeNull();
  expect(screen.queryByRole('button', { name: 'Choose files' })).toBeNull();
  expect((await card()).querySelector('input[type="file"]')).toBeNull();
  fireEvent.click(thumb);
  const viewer = await screen.findByRole('dialog', {
    name: 'Screenshot 1 of 1',
  });
  expect(within(viewer).queryByRole('button', { name: 'Delete' })).toBeNull();
});

test('the card shows no image count', async () => {
  await open(2);
  await screen.findByRole('button', { name: 'Open screenshot 2 of 2' });
  expect(screen.queryByText(/\d images?/)).toBeNull();
});

test('two refusals with the same file name are both listed', async () => {
  await open();
  const files = await input();
  const gif = () =>
    new File([new Uint8Array(8)], 'move.gif', { type: 'image/gif' });
  fireEvent.change(files, { target: { files: [gif(), gif()] } });
  await screen.findAllByText(/move\.gif isn.t a PNG or JPEG/);
  expect(screen.getAllByText(/move\.gif isn.t a PNG or JPEG/)).toHaveLength(2);
});

test('the drop zone stays lit while the pointer crosses its children', async () => {
  await open();
  const zone = (await input()).parentElement!;
  const lit = () => zone.className.includes('border-accent');
  fireEvent.dragEnter(zone);
  expect(lit()).toBe(true);
  // Entering a child leaves the zone first, then enters it again.
  const child = zone.querySelector('b')!;
  fireEvent.dragEnter(child);
  fireEvent.dragLeave(zone);
  expect(lit()).toBe(true);
  fireEvent.dragLeave(child);
  expect(lit()).toBe(false);
});

test("a refused delete says Couldn't save, and the last delete returns focus to the drop zone", async () => {
  const repo = await open(1);
  const remove = repo.dayShots.remove.bind(repo.dayShots);
  repo.dayShots.remove = async () => {
    throw new Error('refused');
  };
  fireEvent.click(
    await screen.findByRole('button', { name: 'Open screenshot 1 of 1' }),
  );
  fireEvent.click(
    within(
      await screen.findByRole('dialog', { name: 'Screenshot 1 of 1' }),
    ).getByRole('button', { name: 'Delete' }),
  );
  const ask = await screen.findByRole('dialog', {
    name: 'Delete this screenshot?',
  });
  fireEvent.click(
    within(ask).getByRole('button', { name: 'Delete screenshot' }),
  );
  expect(await within(ask).findByText(/Couldn.t save/)).toBeTruthy();
  repo.dayShots.remove = remove;
  fireEvent.click(
    within(ask).getByRole('button', { name: 'Delete screenshot' }),
  );
  await waitFor(async () =>
    expect(await repo.dayShots.list(WS, TODAY)).toHaveLength(0),
  );
  const zone = (await input()).parentElement!;
  await waitFor(() => expect(document.activeElement).toBe(zone));
});
