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
import { afterEach, expect, test, vi } from 'vitest';
import { fixtureSample } from '@/data/__fixtures__/sample';
import { createLocalRepository } from '@/data/local/local-repository';
import type { Repository } from '@/data/repository';
import { SAMPLE_WORKSPACE } from '@/data/workspaces';
import { renderApp } from '../__fixtures__/render-app';
import { DayView } from './day-view';

vi.mock('next/navigation', () => import('../__fixtures__/navigation'));

MotionGlobalConfig.skipAnimations = true;

afterEach(cleanup);

const WS = SAMPLE_WORKSPACE.id;
// The fixture sample's routine today is 2026-11-19 (a Thursday).
const TODAY = '2026-11-19';

const para = (text: string) => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
});

function repository(): Repository {
  return createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: async () => fixtureSample(),
  });
}

/** Plan mode for `date`, over a repository that can be prepared first. */
async function open(
  date = TODAY,
  opts: { repo?: Repository; note?: string; seen?: boolean } = {},
) {
  const repo = opts.repo ?? repository();
  if (opts.seen !== false)
    await repo.prefs.update({ seenTips: ['day-plan-templates'] });
  if (opts.note !== undefined)
    await repo.journal.save(WS, {
      kind: 'daily-review',
      date,
      title: 'Daily review',
      body: para(opts.note),
      linkedTradeIds: [],
      tags: [],
    });
  renderApp(<DayView date={date} mode="plan" />, {
    repository: repo,
    url: `/app/day/${date}/plan`,
  });
  return repo;
}

const editor = () => screen.findByRole('textbox', { name: 'Daily note' });
const dailyEntry = async (repo: Repository) =>
  (await repo.journal.list(WS)).find(
    (e) => e.kind === 'daily-review' && e.date === TODAY,
  );

async function pick(trigger: string, item: string) {
  fireEvent.keyDown(await screen.findByRole('button', { name: trigger }), {
    key: 'Enter',
  });
  fireEvent.click(await screen.findByRole('menuitem', { name: item }));
}

test('Templates inserts at the cursor and keeps the rest', async () => {
  const repo = await open(TODAY, { note: 'Keep this line' });
  const box = await editor();
  await within(box).findByText('Keep this line');
  await pick('Templates', 'Daily game plan');
  await within(box).findByText('What I will trade');
  expect(within(box).getByText('Keep this line')).toBeTruthy();
  await waitFor(
    async () => {
      const body = JSON.stringify((await dailyEntry(repo))?.body);
      expect(body).toContain('Keep this line');
      expect(body).toContain('What I will trade');
    },
    { timeout: 3000 },
  );
});

test('the Templates menu lists your daily templates, the three Keel ones, then Manage and Edit default', async () => {
  await open();
  fireEvent.keyDown(await screen.findByRole('button', { name: 'Templates' }), {
    key: 'Enter',
  });
  await screen.findByRole('menuitem', { name: 'Daily game plan' });
  expect(screen.getAllByRole('menuitem').map((i) => i.textContent)).toEqual([
    'Daily review',
    'Daily game plan',
    'All-in-one day',
    'Intraday check-in',
    'Manage templates',
    'Edit default',
  ]);
});

test('Change template asks first when the note has text, then replaces it and records the template', async () => {
  const repo = await open(TODAY, { note: 'I wrote this myself' });
  const box = await editor();
  await within(box).findByText('I wrote this myself');
  await pick('Change template', 'Intraday check-in');
  const ask = await screen.findByRole('dialog', {
    name: /Replace the note/,
  });
  // Nothing changed yet.
  expect(within(box).getByText('I wrote this myself')).toBeTruthy();
  fireEvent.click(within(ask).getByRole('button', { name: 'Replace note' }));
  await within(box).findByText('How I feel right now');
  expect(within(box).queryByText('I wrote this myself')).toBeNull();
  await waitFor(
    async () => {
      const entry = await dailyEntry(repo);
      expect(entry?.templateId).toBe('template-daily-checkin');
      expect(JSON.stringify(entry?.body)).not.toContain('I wrote this');
    },
    { timeout: 3000 },
  );
  expect(await screen.findByText(/From the/)).toBeTruthy();
  expect(screen.getByText('Intraday check-in')).toBeTruthy();
});

test('Change template replaces a note you have not written in without asking', async () => {
  await open();
  const box = await editor();
  await within(box).findByText('Watchlist');
  await pick('Change template', 'Daily game plan');
  await within(box).findByText('What I will trade');
  expect(screen.queryByRole('dialog', { name: /Replace the note/ })).toBeNull();
});

test('the tip shows once', async () => {
  const repo = await open(TODAY, { seen: false });
  const tip = await screen.findByRole('note', { name: 'Tip' });
  expect(tip.textContent).toMatch(/default daily template/);
  fireEvent.click(within(tip).getByRole('button', { name: 'Got it' }));
  await waitFor(() =>
    expect(screen.queryByRole('note', { name: 'Tip' })).toBeNull(),
  );
  await waitFor(async () =>
    expect((await repo.prefs.get()).seenTips).toContain('day-plan-templates'),
  );
  cleanup();
  await open(TODAY, { repo });
  await screen.findByRole('button', { name: 'Templates' });
  expect(screen.queryByRole('note', { name: 'Tip' })).toBeNull();
});

test('the rules card shows the rule names and a Progress tracker link', async () => {
  await open();
  const card = await screen.findByRole('region', { name: "Today's rules" });
  expect(
    within(card)
      .getByRole('link', { name: /Progress tracker/ })
      .getAttribute('href'),
  ).toBe('/app/progress');
  expect(within(card).getByText('Every trade has a strategy')).toBeTruthy();
  // Names only: no "x of y" values.
  expect(card.textContent).not.toMatch(/\d+ of \d+/);
});

test('the rules card says when the tracker started on a date before it', async () => {
  await open('2026-10-28');
  expect(
    await screen.findByText(
      'Not tracked yet. The tracker started on Mon 2 Nov.',
    ),
  ).toBeTruthy();
});

test('a weekend says it is not a trading day, and a future date has no rules card', async () => {
  await open('2026-11-14');
  expect(await screen.findByText('Not a trading day.')).toBeTruthy();
  cleanup();
  await open('2026-11-25');
  await editor();
  expect(screen.queryByRole('region', { name: /rules/i })).toBeNull();
});
