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

test('Templates inserts at the cursor, mid-document, and keeps the rest', async () => {
  const repo = await open(TODAY, {
    note: 'Keep this line',
  });
  const box = await editor();
  await within(box).findByText('Keep this line');
  // Two paragraphs, the cursor at the end of the first.
  const tiptap = (
    box as unknown as {
      editor: {
        commands: {
          setContent(doc: unknown): void;
          setTextSelection(pos: number): void;
        };
      };
    }
  ).editor;
  tiptap.commands.setContent({
    type: 'doc',
    content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'First line' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'Last line' }] },
    ],
  });
  tiptap.commands.setTextSelection(1 + 'First line'.length);
  await pick('Insert a template', 'Daily game plan');
  await within(box).findByText('What I will trade');
  const text = box.textContent ?? '';
  // Not appended: the template sits between the two lines.
  expect(text.indexOf('First line')).toBeLessThan(
    text.indexOf('What I will trade'),
  );
  expect(text.indexOf('What I will trade')).toBeLessThan(
    text.indexOf('Last line'),
  );
  await waitFor(
    async () => {
      const body = JSON.stringify((await dailyEntry(repo))?.body);
      expect(body).toContain('First line');
      expect(body).toContain('Last line');
      expect(body).toContain('What I will trade');
    },
    { timeout: 3000 },
  );
});

test('the Templates menu lists yours, then the built-in templates, then See more, Manage and Edit default', async () => {
  const repo = repository();
  await repo.templates.save(WS, {
    name: 'My day',
    kind: 'daily-review',
    body: para('Mine'),
    isDefault: false,
  });
  await open(TODAY, { repo });
  fireEvent.keyDown(
    await screen.findByRole('button', { name: 'Insert a template' }),
    {
      key: 'Enter',
    },
  );
  await screen.findByRole('menuitem', { name: 'Daily game plan' });
  // Built-in templates sit with Keel's three, not under "Your templates".
  const menu = screen.getByRole('menu');
  // A menu that is closing takes no pointer, so it cannot pull the keyboard back from the text.
  expect(menu.className).toContain('data-[state=closed]:pointer-events-none');
  expect(
    [...menu.querySelectorAll('[role="menuitem"]')].map((i) => i.textContent),
  ).toEqual([
    'My day',
    'Daily review',
    'Daily game plan',
    'All-in-one day',
    'Intraday check-in',
    'See more templates',
    'Manage templates',
    'Edit default',
  ]);
  const text = menu.textContent ?? '';
  expect(text.indexOf('Your templates')).toBeLessThan(text.indexOf('My day'));
  expect(text.indexOf('My day')).toBeLessThan(text.indexOf('Recommended'));
  expect(text.indexOf('Recommended')).toBeLessThan(
    text.indexOf('Daily review'),
  );
});

test('See more templates opens Manage templates', async () => {
  await open();
  fireEvent.keyDown(
    await screen.findByRole('button', { name: 'Insert a template' }),
    {
      key: 'Enter',
    },
  );
  fireEvent.click(
    await screen.findByRole('menuitem', { name: 'See more templates' }),
  );
  expect(await screen.findByRole('dialog', { name: 'Templates' })).toBeTruthy();
});

test('the template line names the template the note started from, even after the default changes', async () => {
  const repo = repository();
  await repo.journal.dailyNote(WS, TODAY);
  await repo.templates.setDefault(WS, 'template-daily-plan');
  await open(TODAY, { repo });
  const line = await screen.findByText(/^From the/);
  expect(line.textContent).toContain('Daily review');
  expect(line.textContent).not.toContain('Daily game plan');
});

test('a day with no note yet names the default it will start from', async () => {
  const repo = repository();
  await repo.templates.setDefault(WS, 'template-daily-plan');
  await open(TODAY, { repo });
  expect((await screen.findByText(/^From the/)).textContent).toContain(
    'Daily game plan',
  );
});

test('a note made before templates were recorded names none, and a kind with no default starts empty', async () => {
  // `open` saves the note straight to the journal, so it has no templateId.
  await open(TODAY, { note: 'Older note' });
  await within(await editor()).findByText('Older note');
  expect(screen.queryByText(/^From the/)).toBeNull();
  expect(screen.getByRole('button', { name: 'Change template' })).toBeTruthy();
  cleanup();

  const repo = repository();
  const review = (await repo.templates.list(WS)).find(
    (t) => t.id === 'template-daily-review',
  )!;
  await repo.templates.save(WS, { ...review, isDefault: false });
  await open(TODAY, { repo });
  await editor();
  expect(screen.queryByText(/^From the/)).toBeNull();
  expect((await editor()).textContent).toBe('');
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

test('the tip shows once, in the flow above the note, and Got it closes it', async () => {
  const repo = await open(TODAY, { seen: false });
  const tip = await screen.findByRole('note', { name: 'Tip' });
  expect(tip.textContent).toMatch(/default daily template/);
  // Beside the control or below it, never over it: in the flow, before the editor.
  expect(tip.className).not.toMatch(/absolute|fixed/);
  const change = screen.getByRole('button', { name: 'Change template' });
  const box = await editor();
  expect(
    change.compareDocumentPosition(tip) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  expect(
    tip.compareDocumentPosition(box) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  fireEvent.click(within(tip).getByRole('button', { name: 'Got it' }));
  await waitFor(() =>
    expect(screen.queryByRole('note', { name: 'Tip' })).toBeNull(),
  );
  await waitFor(async () =>
    expect((await repo.prefs.get()).seenTips).toContain('day-plan-templates'),
  );
  cleanup();
  await open(TODAY, { repo });
  await screen.findByRole('button', { name: 'Insert a template' });
  expect(screen.queryByRole('note', { name: 'Tip' })).toBeNull();
});

test('Escape closes the tip for good', async () => {
  const repo = await open(TODAY, { seen: false });
  await screen.findByRole('note', { name: 'Tip' });
  fireEvent.keyDown(document.body, { key: 'Escape' });
  await waitFor(() =>
    expect(screen.queryByRole('note', { name: 'Tip' })).toBeNull(),
  );
  await waitFor(async () =>
    expect((await repo.prefs.get()).seenTips).toContain('day-plan-templates'),
  );
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
