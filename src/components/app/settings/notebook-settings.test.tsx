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
import type { NoteType } from '@/domain/types';
import { loadNoteProseCss } from '../__fixtures__/note-prose-css';
import { renderApp } from '../__fixtures__/render-app';
import { NotebookSettings } from './notebook-settings';

vi.mock('next/navigation', () => import('../__fixtures__/navigation'));
MotionGlobalConfig.skipAnimations = true;

let unloadCss: () => void;
beforeEach(() => {
  unloadCss = loadNoteProseCss();
});
afterEach(() => {
  cleanup();
  unloadCss();
});

function repo() {
  return createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: async () => fixtureSample(),
  });
}
type Repo = ReturnType<typeof repo>;

const CUSTOM: NoteType = {
  h1: 32,
  h2: 26,
  h3: 22,
  body: 16,
  strikeChecked: false,
};

const show = (r: Repo) =>
  renderApp(<NotebookSettings />, {
    repository: r,
    url: '/app/settings/notebook',
  });

const select = (name: string) =>
  screen.findByLabelText(name) as Promise<HTMLSelectElement>;
const choose = (el: HTMLSelectElement, px: number) =>
  fireEvent.change(el, { target: { value: String(px) } });
const preview = () => screen.getByRole('group', { name: 'Preview' });
const sizeOf = (el: HTMLElement) => getComputedStyle(el).fontSize;
/** The ticked item's words: where the cross-out is drawn. */
const tickedWords = () =>
  within(preview()).getByText('Mark the overnight high and low');
const crossedOut = (el: HTMLElement) =>
  getComputedStyle(el).textDecoration.includes('line-through');

test('four labelled selects start at 28, 24, 20 and 14 px, each from 10 to 40', async () => {
  show(repo());
  for (const [name, px] of [
    ['Heading 1', 28],
    ['Heading 2', 24],
    ['Heading 3', 20],
    ['Body', 14],
  ] as const) {
    const el = await select(name);
    expect(el.value).toBe(String(px));
    const labels = [...el.options].map((o) => o.textContent);
    expect(labels).toHaveLength(31);
    expect(labels[0]).toBe('10 px');
    expect(labels.at(-1)).toBe('40 px');
    expect([...el.options].map((o) => o.value)).toEqual(
      Array.from({ length: 31 }, (_, i) => String(10 + i)),
    );
  }
  expect(screen.getByText('Each size runs from 10 to 40 px.')).toBeTruthy();
});

test('the box that crosses out ticked checklist items is on by default', async () => {
  show(repo());
  const box = (await screen.findByRole('checkbox', {
    name: 'Cross out ticked checklist items',
  })) as HTMLInputElement;
  expect(box.checked).toBe(true);
});

test('Keel says "Reset to default" and "Cross out", not the other product\'s words', async () => {
  show(repo());
  await screen.findByRole('button', { name: 'Reset to default' });
  expect(screen.queryByText(/reset to defaults/i)).toBeNull();
  expect(screen.queryByText(/strike through/i)).toBeNull();
});

test('Save is disabled until a change', async () => {
  show(repo());
  const save = (await screen.findByRole('button', {
    name: 'Save',
  })) as HTMLButtonElement;
  expect(save.disabled).toBe(true);

  // A size, then back again: nothing differs from what is saved.
  const h1 = await select('Heading 1');
  choose(h1, 30);
  expect(save.disabled).toBe(false);
  choose(h1, 28);
  expect(save.disabled).toBe(true);

  // The box counts too.
  const box = screen.getByRole('checkbox', {
    name: 'Cross out ticked checklist items',
  });
  fireEvent.click(box);
  expect(save.disabled).toBe(false);
  fireEvent.click(box);
  expect(save.disabled).toBe(true);
});

test('the preview follows the selects', async () => {
  show(repo());
  await select('Heading 1');
  const box = screen.getByRole('checkbox', {
    name: 'Cross out ticked checklist items',
  });
  const words = (t: string) => within(preview()).getByText(t);

  // At the defaults: 28, 24, 20 and 14 px, the ticked item crossed out.
  expect(sizeOf(words('Pre-market plan'))).toBe('28px');
  expect(sizeOf(words('Levels'))).toBe('24px');
  expect(sizeOf(words('ES Dec 26'))).toBe('20px');
  expect(sizeOf(words('Set size for the open').closest('.note-prose')!)).toBe(
    '14px',
  );
  expect(crossedOut(tickedWords())).toBe(true);

  choose(await select('Heading 1'), 36);
  choose(await select('Heading 2'), 30);
  choose(await select('Heading 3'), 16);
  choose(await select('Body'), 18);
  expect(sizeOf(words('Pre-market plan'))).toBe('36px');
  expect(sizeOf(words('Levels'))).toBe('30px');
  expect(sizeOf(words('ES Dec 26'))).toBe('16px');
  expect(sizeOf(words('Set size for the open').closest('.note-prose')!)).toBe(
    '18px',
  );

  // The box takes the line through the ticked item, and puts it back.
  fireEvent.click(box);
  expect(crossedOut(tickedWords())).toBe(false);
  fireEvent.click(box);
  expect(crossedOut(tickedWords())).toBe(true);
});

test('the preview is marked as a preview and has nothing to tab to', async () => {
  show(repo());
  await select('Heading 1');
  const panel = preview();
  expect(panel.getAttribute('aria-label')).toBe('Preview');
  // A drawing of a note, not a note: no field, link or button in it can take the focus.
  const focusable = panel.querySelectorAll(
    'a[href], button, textarea, select, [tabindex]:not([tabindex="-1"]), input:not([disabled])',
  );
  expect(focusable).toHaveLength(0);
  // Its words are for the eye; a screen reader is told the sizes instead.
  expect(panel.textContent).toMatch(/Heading 1 at 28 px/);
});

test('a saved setting opens in the selects, the box and the preview', async () => {
  const r = repo();
  await r.prefs.update({ noteType: CUSTOM });
  show(r);
  await waitFor(async () =>
    expect(((await select('Heading 1')) as HTMLSelectElement).value).toBe('32'),
  );
  expect((await select('Heading 2')).value).toBe('26');
  expect((await select('Heading 3')).value).toBe('22');
  expect((await select('Body')).value).toBe('16');
  expect(
    (
      screen.getByRole('checkbox', {
        name: 'Cross out ticked checklist items',
      }) as HTMLInputElement
    ).checked,
  ).toBe(false);
  expect(sizeOf(within(preview()).getByText('Pre-market plan'))).toBe('32px');
  expect(crossedOut(tickedWords())).toBe(false);
  // Nothing has changed yet.
  expect(
    (screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
});

test('Save keeps the sizes and the box, then waits for the next change', async () => {
  const r = repo();
  show(r);
  choose(await select('Heading 1'), 30);
  choose(await select('Body'), 16);
  fireEvent.click(
    screen.getByRole('checkbox', { name: 'Cross out ticked checklist items' }),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(async () =>
    expect((await r.prefs.get()).noteType).toEqual({
      h1: 30,
      h2: 24,
      h3: 20,
      body: 16,
      strikeChecked: false,
    }),
  );
  await waitFor(() =>
    expect(
      (screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true),
  );
  // What was chosen stays on screen, and the person is told it is kept.
  expect((await select('Heading 1')).value).toBe('30');
  expect(
    (await screen.findByRole('status', { name: 'Save status' })).textContent,
  ).toBe('Saved');
  // The next change starts the cycle again, and clears the word.
  choose(await select('Heading 2'), 25);
  expect(
    (screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement)
      .disabled,
  ).toBe(false);
  expect(screen.getByRole('status', { name: 'Save status' }).textContent).toBe(
    '',
  );
});

test('a save that fails says so and keeps the edit', async () => {
  const r = repo();
  vi.spyOn(r.prefs, 'update').mockRejectedValue(new Error('disk full'));
  show(r);
  choose(await select('Heading 1'), 30);
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect(
    (await screen.findByRole('status', { name: 'Save status' })).textContent,
  ).toBe("Couldn't save that. Try again.");
  expect((await select('Heading 1')).value).toBe('30');
  expect(
    (screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement)
      .disabled,
  ).toBe(false);
});

test('Reset to default clears the pref', async () => {
  const r = repo();
  await r.prefs.update({ noteType: CUSTOM });
  show(r);
  await waitFor(async () =>
    expect((await select('Heading 1')).value).toBe('32'),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Reset to default' }));
  // The stored setting is gone, not rewritten as the default values, and the page says so.
  await waitFor(async () =>
    expect((await r.prefs.saved()).noteType).toBeUndefined(),
  );
  expect(
    (await screen.findByRole('status', { name: 'Save status' })).textContent,
  ).toBe('Back to the defaults');
  expect((await r.prefs.get()).noteType).toBeUndefined();
  // And the page reads the defaults again.
  await waitFor(async () =>
    expect((await select('Heading 1')).value).toBe('28'),
  );
  expect((await select('Heading 2')).value).toBe('24');
  expect((await select('Heading 3')).value).toBe('20');
  expect((await select('Body')).value).toBe('14');
  expect(
    (
      screen.getByRole('checkbox', {
        name: 'Cross out ticked checklist items',
      }) as HTMLInputElement
    ).checked,
  ).toBe(true);
  expect(sizeOf(within(preview()).getByText('Pre-market plan'))).toBe('28px');
  expect(
    (screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
});

test('Reset to default also drops a change that was not saved', async () => {
  const r = repo();
  show(r);
  choose(await select('Heading 2'), 31);
  fireEvent.click(
    screen.getByRole('checkbox', { name: 'Cross out ticked checklist items' }),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Reset to default' }));
  await waitFor(async () =>
    expect((await select('Heading 2')).value).toBe('24'),
  );
  expect(
    (
      screen.getByRole('checkbox', {
        name: 'Cross out ticked checklist items',
      }) as HTMLInputElement
    ).checked,
  ).toBe(true);
  expect(
    (screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  expect((await r.prefs.saved()).noteType).toBeUndefined();
});

test('a reset that fails says so', async () => {
  const r = repo();
  await r.prefs.update({ noteType: CUSTOM });
  vi.spyOn(r.prefs, 'unset').mockRejectedValue(new Error('disk full'));
  show(r);
  await waitFor(async () =>
    expect((await select('Heading 1')).value).toBe('32'),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Reset to default' }));
  expect(
    (await screen.findByRole('status', { name: 'Save status' })).textContent,
  ).toBe("Couldn't save that. Try again.");
});
