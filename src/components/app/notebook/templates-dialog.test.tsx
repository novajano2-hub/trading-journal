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
import type { TemplateDraft } from '@/data/repository';
import { renderApp } from '../__fixtures__/render-app';
import { TemplatesDialog } from './templates-dialog';

vi.mock('next/navigation', () => import('../__fixtures__/navigation'));
MotionGlobalConfig.skipAnimations = true;

afterEach(cleanup);

const WS = 'sample';
const custom = {
  type: 'doc',
  content: [
    { type: 'paragraph', content: [{ type: 'text', text: 'My own day' }] },
  ],
};

const group = (name: string) => screen.getByRole('group', { name });

/** A template of your own is saved first, so the dialog finds it when it loads. */
async function open(draft: Partial<TemplateDraft> = {}) {
  const repo = createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: async () => fixtureSample(),
  });
  const made = await repo.templates.save(WS, {
    name: 'My day',
    kind: 'daily-review',
    body: custom,
    isDefault: false,
    ...draft,
  });
  renderApp(<TemplatesDialog open onOpenChange={() => {}} />, {
    repository: repo,
  });
  return { repo, made };
}

test('lists the templates by kind, with Delete only on the ones you made', async () => {
  await open();
  const daily = await screen.findByRole('group', { name: 'Daily review' });
  await within(daily).findByText('My day');
  expect(group('Pre-market plan')).toBeTruthy();
  expect(group('Weekly recap')).toBeTruthy();
  const builtIn = within(daily).getByRole('listitem', { name: 'Daily review' });
  expect(within(builtIn).queryByRole('button', { name: /^Delete/ })).toBeNull();
  const mine = within(daily).getByRole('listitem', { name: 'My day' });
  expect(
    within(mine).getByRole('button', { name: 'Delete My day' }),
  ).toBeTruthy();
  // The built-in is the default for now.
  expect(within(builtIn).getByText('Default')).toBeTruthy();
});

test('Set as default on a new daily template makes the next daily note start from it', async () => {
  const { repo, made } = await open();
  const daily = await screen.findByRole('group', { name: 'Daily review' });
  const mine = await within(daily).findByRole('listitem', { name: 'My day' });
  fireEvent.click(
    within(mine).getByRole('button', { name: 'Set My day as default' }),
  );
  await waitFor(async () =>
    expect(
      (await repo.templates.list(WS)).find((t) => t.id === made.id)?.isDefault,
    ).toBe(true),
  );
  const note = await repo.journal.dailyNote(WS, '2026-11-20');
  expect(note.body).toEqual(custom);
  // It is the default now, so the button is gone.
  await waitFor(() =>
    expect(
      within(mine).queryByRole('button', { name: 'Set My day as default' }),
    ).toBeNull(),
  );
});

test('built-in templates have no Delete, and deleting the default falls back to the built-in', async () => {
  const { repo, made } = await open({ isDefault: true });
  const daily = await screen.findByRole('group', { name: 'Daily review' });
  const mine = await within(daily).findByRole('listitem', { name: 'My day' });
  fireEvent.click(within(mine).getByRole('button', { name: 'Delete My day' }));
  const confirm = await screen.findByRole('dialog', {
    name: 'Delete the template My day?',
  });
  fireEvent.click(
    within(confirm).getByRole('button', { name: 'Delete template' }),
  );
  await waitFor(async () =>
    expect((await repo.templates.list(WS)).some((t) => t.id === made.id)).toBe(
      false,
    ),
  );
  const builtIn = (await repo.templates.list(WS)).find(
    (t) => t.kind === 'daily-review' && t.isDefault,
  )!;
  expect(builtIn).toMatchObject({ builtIn: true, name: 'Daily review' });
});

test('Edit renames a template through its name field', async () => {
  const { repo } = await open();
  const daily = await screen.findByRole('group', { name: 'Daily review' });
  const mine = await within(daily).findByRole('listitem', { name: 'My day' });
  fireEvent.click(within(mine).getByRole('button', { name: 'Edit My day' }));
  const name = await screen.findByRole('textbox', { name: 'Template name' });
  fireEvent.change(name, { target: { value: 'Wednesday day' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save template' }));
  await waitFor(async () =>
    expect((await repo.templates.list(WS)).map((t) => t.name)).toContain(
      'Wednesday day',
    ),
  );
});
