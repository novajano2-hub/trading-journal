// @vitest-environment happy-dom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { MotionGlobalConfig } from 'motion/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { fixtureSample } from '@/data/__fixtures__/sample';
import { createLocalRepository } from '@/data/local/local-repository';
import { useUpdatePrefs } from '@/data/query/hooks';
import type { NoteType } from '@/domain/types';
import { fakeIntersectionObserver } from '../__fixtures__/intersection';
import { loadNoteProseCss } from '../__fixtures__/note-prose-css';
import { renderApp } from '../__fixtures__/render-app';
import { NoteEditor, NotePreview } from './note-editor';
import { NoteMenu } from './note-menu';

vi.mock('next/navigation', () => import('../__fixtures__/navigation'));
MotionGlobalConfig.skipAnimations = true;

let unloadCss: () => void;
beforeEach(() => {
  unloadCss = loadNoteProseCss();
  fakeIntersectionObserver({ auto: true });
});
afterEach(() => {
  cleanup();
  unloadCss();
  vi.restoreAllMocks();
});

const CUSTOM: NoteType = {
  h1: 32,
  h2: 26,
  h3: 22,
  body: 16,
  strikeChecked: false,
};

const text = (t: string) => ({ type: 'text', text: t });
const para = (t: string) => ({ type: 'paragraph', content: [text(t)] });
const heading = (level: number, t: string) => ({
  type: 'heading',
  attrs: { level },
  content: [text(t)],
});
const item = (t: string, checked: boolean) => ({
  type: 'taskItem',
  attrs: { checked },
  content: [para(t)],
});
const BODY = {
  type: 'doc',
  content: [
    heading(1, 'Pre-market plan'),
    heading(2, 'Levels'),
    heading(3, 'ES Dec 26'),
    para('Overnight range 6,598.50 to 6,611.75.'),
    {
      type: 'taskList',
      content: [
        item('Mark the overnight high and low', true),
        item('Set size for the open', false),
      ],
    },
  ],
};

function repo() {
  return createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: async () => fixtureSample(),
  });
}
type Repo = ReturnType<typeof repo>;

async function withPrefs(noteType?: NoteType): Promise<Repo> {
  const r = repo();
  if (noteType) await r.prefs.update({ noteType });
  return r;
}

const sizeOf = (el: Element) => getComputedStyle(el).fontSize;
const word = (t: string) => screen.findByText(t);
/** The paragraph of a task item's words: where the cross-out is drawn. */
const blockOf = (t: string) => word(t);
const crossedOut = (el: Element) =>
  getComputedStyle(el).textDecoration.includes('line-through');

test('an editor applies the sizes and the strike-through', async () => {
  const r = await withPrefs(CUSTOM);
  renderApp(
    <NoteEditor value={BODY} onChange={() => {}} label="Trade note" />,
    {
      repository: r,
    },
  );
  // The saved sizes reach every level of the text, once the prefs have loaded.
  await waitFor(async () =>
    expect(sizeOf(await word('Pre-market plan'))).toBe('32px'),
  );
  expect(sizeOf(await word('Levels'))).toBe('26px');
  expect(sizeOf(await word('ES Dec 26'))).toBe('22px');
  const prose = (await word('Overnight range 6,598.50 to 6,611.75.'))
    .parentElement!;
  expect(sizeOf(prose)).toBe('16px');
  // Strike-through is off: the ticked item is not crossed out.
  expect(crossedOut(await blockOf('Mark the overnight high and low'))).toBe(
    false,
  );
});

test('with nothing saved, an editor reads 28, 24, 20 and 14 px and crosses out ticked items', async () => {
  renderApp(
    <NoteEditor value={BODY} onChange={() => {}} label="Trade note" />,
    {
      repository: await withPrefs(),
    },
  );
  expect(sizeOf(await word('Pre-market plan'))).toBe('28px');
  expect(sizeOf(await word('Levels'))).toBe('24px');
  expect(sizeOf(await word('ES Dec 26'))).toBe('20px');
  expect(
    sizeOf(
      (await word('Overnight range 6,598.50 to 6,611.75.')).parentElement!,
    ),
  ).toBe('14px');
  expect(crossedOut(await blockOf('Mark the overnight high and low'))).toBe(
    true,
  );
  // An item that is not ticked is never crossed out.
  expect(crossedOut(await blockOf('Set size for the open'))).toBe(false);
});

test('an editor with no app data behind it keeps the defaults', async () => {
  render(<NoteEditor value={BODY} onChange={() => {}} label="Trade note" />);
  expect(sizeOf(await word('Pre-market plan'))).toBe('28px');
  expect(crossedOut(await blockOf('Mark the overnight high and low'))).toBe(
    true,
  );
});

test('the sizes are set on the editor as custom properties, where the prose styles read them', async () => {
  renderApp(
    <NoteEditor value={BODY} onChange={() => {}} label="Trade note" />,
    {
      repository: await withPrefs(CUSTOM),
    },
  );
  const box = () =>
    screen
      .getByRole('textbox', { name: 'Trade note' })
      .closest<HTMLElement>('[style*="--note-h1"]');
  await waitFor(() =>
    expect(box()?.style.getPropertyValue('--note-h1')).toBe('32px'),
  );
  const style = box()!.style;
  expect(style.getPropertyValue('--note-h2')).toBe('26px');
  expect(style.getPropertyValue('--note-h3')).toBe('22px');
  expect(style.getPropertyValue('--note-body')).toBe('16px');
  expect(style.getPropertyValue('--note-checked-decoration')).toBe('none');
});

test('a setting saved while an editor is open reaches it', async () => {
  const r = await withPrefs();
  function Harness() {
    const update = useUpdatePrefs();
    return (
      <>
        <button onClick={() => update.mutate({ noteType: CUSTOM })}>
          Apply
        </button>
        <NoteEditor value={BODY} onChange={() => {}} label="Trade note" />
      </>
    );
  }
  renderApp(<Harness />, { repository: r });
  expect(sizeOf(await word('Pre-market plan'))).toBe('28px');
  fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
  await waitFor(async () =>
    expect(sizeOf(await word('Pre-market plan'))).toBe('32px'),
  );
  expect(crossedOut(await blockOf('Mark the overnight high and low'))).toBe(
    false,
  );
});

test('a read view, such as a version preview, takes the sizes too', async () => {
  renderApp(<NotePreview body={BODY} label="Version preview" />, {
    repository: await withPrefs(CUSTOM),
  });
  await waitFor(async () =>
    expect(sizeOf(await word('Pre-market plan'))).toBe('32px'),
  );
  expect(crossedOut(await blockOf('Mark the overnight high and low'))).toBe(
    false,
  );
});

test('the print layout takes the sizes too', async () => {
  window.print = vi.fn();
  URL.createObjectURL = vi.fn(() => 'blob:note');
  URL.revokeObjectURL = vi.fn();
  renderApp(
    <NoteMenu read={() => ({ title: 'Plan', tags: [], body: BODY })} />,
    { repository: await withPrefs(CUSTOM) },
  );
  fireEvent.keyDown(
    await screen.findByRole('button', { name: 'Export or import' }),
    { key: 'Enter' },
  );
  const menu = await screen.findByRole('menu');
  fireEvent.click(
    within(menu).getByRole('menuitem', { name: 'Export as PDF' }),
  );
  const layout = await waitFor(() => {
    const el = document.getElementById('print-note');
    expect(el).not.toBeNull();
    return el!;
  });
  await waitFor(() =>
    expect(sizeOf(within(layout).getByText('Pre-market plan'))).toBe('32px'),
  );
  expect(
    crossedOut(within(layout).getByText('Mark the overnight high and low')),
  ).toBe(false);
  act(() => {
    window.dispatchEvent(new Event('afterprint'));
  });
});

test('a toggle heading takes the size of its level', async () => {
  const toggle = (level: number, t: string) => ({
    type: 'details',
    attrs: { toggle: level, open: true },
    content: [
      { type: 'detailsSummary', content: [text(t)] },
      { type: 'detailsContent', content: [para('inside')] },
    ],
  });
  renderApp(
    <NoteEditor
      value={{
        type: 'doc',
        content: [
          toggle(1, 'Toggle one'),
          toggle(2, 'Toggle two'),
          toggle(3, 'Toggle three'),
          toggle(0, 'Toggle plain'),
        ],
      }}
      onChange={() => {}}
      label="Trade note"
    />,
    { repository: await withPrefs(CUSTOM) },
  );
  await waitFor(async () =>
    expect(sizeOf(await word('Toggle one'))).toBe('32px'),
  );
  expect(sizeOf(await word('Toggle two'))).toBe('26px');
  expect(sizeOf(await word('Toggle three'))).toBe('22px');
  expect(sizeOf(await word('Toggle plain'))).toBe('16px');
});

test('in a day note an H3 is the quiet field label, and it follows the H3 size in proportion', async () => {
  const day = (
    <div className="note-day">
      <NoteEditor value={BODY} onChange={() => {}} label="Day note" />
    </div>
  );
  // The default 20 px reads as the comps' 13.5px label.
  const first = renderApp(day, { repository: await withPrefs() });
  expect(sizeOf(await word('ES Dec 26'))).toBe('13.5px');
  expect(
    sizeOf(
      (await word('Overnight range 6,598.50 to 6,611.75.')).parentElement!,
    ),
  ).toBe('14px');
  first.unmount();
  cleanup();
  // A larger H3 grows the label, and the body size is the day note's body too.
  renderApp(day, { repository: await withPrefs(CUSTOM) });
  await waitFor(async () =>
    expect(sizeOf(await word('ES Dec 26'))).toBe('14.85px'),
  );
  expect(
    sizeOf(
      (await word('Overnight range 6,598.50 to 6,611.75.')).parentElement!,
    ),
  ).toBe('16px');
});

test('in a day note a small H3 never makes a label smaller than 12px', async () => {
  renderApp(
    <div className="note-day">
      <NoteEditor value={BODY} onChange={() => {}} label="Day note" />
    </div>,
    { repository: await withPrefs({ ...CUSTOM, h3: 10 }) },
  );
  await waitFor(async () =>
    expect(sizeOf(await word('ES Dec 26'))).toBe('12px'),
  );
});
