// @vitest-environment happy-dom
// The blocks of Task 20 part B as a person meets them: through the editor, its
// slash menu, its dialogs and its handles, over the real repository.
import {
  act,
  cleanup,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import type { Editor } from '@tiptap/core';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { MotionGlobalConfig } from 'motion/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { fixtureSample } from '@/data/__fixtures__/sample';
import { createLocalRepository } from '@/data/local/local-repository';
import { usePrefs } from '@/data/query/hooks';
import type { Repository } from '@/data/repository';
import { pasteFiles } from '../__fixtures__/clipboard';
import { renderApp } from '../__fixtures__/render-app';
import { resetTwitterWidgets } from './embed-view';
import {
  NoteEditor,
  type NoteEditorHandle,
  type NoteEditorProps,
} from './note-editor';
import { SLASH_ITEMS, filterSlashItems } from './slash-menu';

vi.mock('next/navigation', () => import('../__fixtures__/navigation'));
MotionGlobalConfig.skipAnimations = true;

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  resetTwitterWidgets();
  delete (window as { twttr?: unknown }).twttr;
});
beforeEach(() => {
  document.documentElement.removeAttribute('data-theme');
});

type Node = {
  type: string;
  attrs?: Record<string, unknown>;
  content?: Node[];
  text?: string;
};
const para = (text?: string): Node => ({
  type: 'paragraph',
  ...(text ? { content: [{ type: 'text', text }] } : {}),
});
const docOf = (...content: Node[]) => ({ type: 'doc', content });
const chipDoc = (...inline: Node[]) =>
  docOf({
    type: 'paragraph',
    content: [{ type: 'text', text: 'Fills are in ' }, ...inline],
  });

function newRepo(): Repository {
  return createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: async () => fixtureSample(),
  });
}

/** Says the profile's time zone once the app has read it (the blocks' clock reads the same query). */
function ZoneProbe() {
  const zone = usePrefs().data?.timeZone;
  return <output aria-label="Profile zone">{zone ?? ''}</output>;
}

async function mount(
  over: Partial<NoteEditorProps> & {
    repo?: Repository;
    /** Waits until the app has the profile's time zone, so a clock is never the machine's. */
    zone?: string;
  } = {},
) {
  const { repo = newRepo(), zone, ...props } = over;
  const onChange = vi.fn();
  const handle: { current: NoteEditorHandle | null } = { current: null };
  const view = renderApp(
    <>
      {zone ? <ZoneProbe /> : null}
      <NoteEditor
        label="Note"
        value={docOf(para())}
        onChange={onChange}
        handleRef={handle}
        {...props}
      />
    </>,
    { repository: repo },
  );
  if (zone) {
    await waitFor(() =>
      expect(screen.getByLabelText('Profile zone').textContent).toBe(zone),
    );
    // The clock takes the zone in an effect of the same render: let it run.
    await act(async () => {});
  }
  const textbox = await screen.findByRole('textbox', { name: 'Note' });
  const editor = (textbox as HTMLElement & { editor: Editor }).editor;
  await waitFor(() => expect(handle.current).not.toBeNull());
  return { repo, onChange, view, textbox, editor, handle };
}

const json = (e: Editor) => e.getJSON() as { content?: Node[] };
const kinds = (e: Editor) => (json(e).content ?? []).map((b) => b.type);
const textOf = (n: Node | undefined): string =>
  n === undefined ? '' : (n.text ?? (n.content ?? []).map(textOf).join(''));
const find = (e: Editor, type: string) => {
  const out: Node[] = [];
  const walk = (n: Node) => {
    if (n.type === type) out.push(n);
    n.content?.forEach(walk);
  };
  walk(e.getJSON() as Node);
  return out;
};

/** Chooses a slash item the way the menu does: typing "/" and its name, then Enter. */
async function slash(editor: Editor, name: string) {
  act(() => {
    editor.commands.focus('end');
    editor.commands.insertContent(`/${name}`);
  });
  await screen.findByRole('listbox', { name: 'Insert a block' });
  const handled = editor.view.someProp('handleKeyDown', (f) =>
    f(
      editor.view,
      new KeyboardEvent('keydown', {
        key: 'Enter',
        bubbles: true,
        cancelable: true,
      }),
    ),
  );
  expect(handled).toBe(true);
}

// ---- the slash menu ----------------------------------------------------------

test('the slash list includes justify, and every block the editor has', () => {
  const labels = SLASH_ITEMS.map((i) => i.label);
  expect(labels).toContain('Align justify');
  expect(filterSlashItems('justify').map((i) => i.label)).toEqual([
    'Align justify',
  ]);
  for (const label of [
    'Normal text',
    'Heading 1',
    'Heading 2',
    'Heading 3',
    'Bulleted list',
    'Numbered list',
    'Checklist',
    'Timed list',
    'Quote',
    'Code block',
    'Collapsible section',
    'Toggle',
    'Toggle heading 1',
    'Toggle heading 2',
    'Toggle heading 3',
    'Table',
    'Divider',
    'Two columns',
    'Three columns',
    'Page break',
    'Equation',
    'Image',
    'Trade',
    'Day',
    'Align left',
    'Align centre',
    'Align right',
    'Align justify',
    'YouTube video',
    'Post from X',
  ])
    expect(labels, label).toContain(label);
  // Found by the word a person from elsewhere would type.
  expect(filterSlashItems('tweet').map((i) => i.label)).toEqual([
    'Post from X',
  ]);
  expect(filterSlashItems('center').map((i) => i.label)).toEqual([
    'Align centre',
  ]);
  // Every item says what it does, in words of its own.
  for (const i of SLASH_ITEMS) expect(i.hint.length).toBeGreaterThan(3);
});

test('the slash menu says how to filter and where the emoji are', async () => {
  const { editor } = await mount();
  act(() => {
    editor.commands.focus('end');
    editor.commands.insertContent('/');
  });
  const list = await screen.findByRole('listbox', { name: 'Insert a block' });
  expect(
    within(list.parentElement as HTMLElement).getByText(
      'Keep typing to filter. Type : for emoji.',
    ),
  ).toBeTruthy();
});

test.each([
  ['Normal text', (e: Editor) => kinds(e)[0] === 'paragraph'],
  ['Code block', (e: Editor) => kinds(e).includes('codeBlock')],
  ['Timed list', (e: Editor) => kinds(e).includes('timedList')],
  ['Toggle', (e: Editor) => find(e, 'details')[0]?.attrs?.toggle === 0],
  [
    'Toggle heading 3',
    (e: Editor) => find(e, 'details')[0]?.attrs?.toggle === 3,
  ],
  ['Two columns', (e: Editor) => find(e, 'column').length === 2],
  ['Three columns', (e: Editor) => find(e, 'column').length === 3],
  ['Page break', (e: Editor) => kinds(e).includes('pageBreak')],
  [
    'Align justify',
    (e: Editor) => find(e, 'paragraph')[0]?.attrs?.textAlign === 'justify',
  ],
  [
    'Align centre',
    (e: Editor) => find(e, 'paragraph')[0]?.attrs?.textAlign === 'center',
  ],
] as const)('the slash item %s does what it says', async (name, check) => {
  const { editor } = await mount();
  await slash(editor, name);
  await waitFor(() => expect(check(editor)).toBe(true));
});

test('the slash menu shows Image only where the note can take images', async () => {
  const none = await mount();
  act(() => {
    none.editor.commands.focus('end');
    none.editor.commands.insertContent('/image');
  });
  expect(await screen.findByText('Nothing matches.')).toBeTruthy();
  cleanup();
  const yes = await mount({ noteId: 'n-1' });
  act(() => {
    yes.editor.commands.focus('end');
    yes.editor.commands.insertContent('/image');
  });
  expect(await screen.findByRole('option', { name: /^Image/ })).toBeTruthy();
});

// ---- timed list ---------------------------------------------------------------

test('a timed list item starts with the time, in the profile time zone', async () => {
  const repo = newRepo();
  await repo.prefs.update({ timeZone: 'America/New_York' });
  // The profile is read a moment after the editor opens (here, a slow store,
  // as a busy full run makes it): the clock must not be the machine's zone's.
  const get = repo.prefs.get.bind(repo.prefs);
  vi.spyOn(repo.prefs, 'get').mockImplementation(async () => {
    await new Promise((r) => setTimeout(r, 150));
    return get();
  });
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-24T14:41:00Z'));
  const { editor, handle } = await mount({ repo, zone: 'America/New_York' });
  act(() => handle.current!.runSlashCommand('Timed list'));
  await waitFor(() => expect(kinds(editor)).toContain('timedList'));
  expect(find(editor, 'timedItem')[0]?.attrs?.time).toBe('09:41');
  // It shows beside the item, where the person can change it.
  const time = await screen.findByRole('textbox', { name: 'Time' });
  expect((time as HTMLInputElement).value).toBe('09:41');
  // The next item takes the time it is then.
  vi.setSystemTime(new Date('2026-11-24T14:52:00Z'));
  act(() => {
    editor.commands.insertContent('Range set');
  });
  act(() => {
    editor.view.someProp('handleKeyDown', (f) =>
      f(
        editor.view,
        new KeyboardEvent('keydown', {
          key: 'Enter',
          bubbles: true,
          cancelable: true,
        }),
      ),
    );
  });
  await waitFor(() => expect(find(editor, 'timedItem')).toHaveLength(2));
  expect(find(editor, 'timedItem').map((i) => i.attrs?.time)).toEqual([
    '09:41',
    '09:52',
  ]);
});

test('a time is changed in the box, and a time that is not a time goes back', async () => {
  const { editor } = await mount({
    value: docOf({
      type: 'timedList',
      content: [
        {
          type: 'timedItem',
          attrs: { time: '09:30' },
          content: [para('Range set')],
        },
      ],
    }),
  });
  const box = (await screen.findByRole('textbox', {
    name: 'Time',
  })) as HTMLInputElement;
  fireEvent.change(box, { target: { value: '9:41' } });
  fireEvent.blur(box);
  await waitFor(() =>
    expect(find(editor, 'timedItem')[0]?.attrs?.time).toBe('09:41'),
  );
  fireEvent.change(box, { target: { value: 'soon' } });
  fireEvent.blur(box);
  await waitFor(() => expect(box.value).toBe('09:41'));
  expect(find(editor, 'timedItem')[0]?.attrs?.time).toBe('09:41');
});

// ---- link chips ---------------------------------------------------------------

test('a trade chip links to its trade', async () => {
  const trade = fixtureSample().trades.find((t) => t.id === 'f-1')!;
  await mount({
    value: chipDoc({ type: 'tradeLink', attrs: { tradeId: 'f-1' } }),
  });
  const chip = await screen.findByRole('link', {
    name: new RegExp(trade.instrument.symbol),
  });
  expect(chip.getAttribute('href')).toBe('/app/trades/f-1');
  // The symbol, the trade's number and what it made, as the chip draws them.
  expect(chip.textContent).toContain(trade.instrument.symbol);
  expect(chip.textContent).toContain(String(trade.serial));
  expect(chip.textContent).toMatch(/[+−-]\$/);
});

test('a trade chip hides its money under Privacy', async () => {
  const repo = newRepo();
  await repo.prefs.update({ displayUnit: 'privacy' });
  await mount({
    repo,
    value: chipDoc({ type: 'tradeLink', attrs: { tradeId: 'f-1' } }),
  });
  const chip = await screen.findByRole('link', { name: /./ });
  await waitFor(() => expect(chip.textContent).toContain('•••'));
  expect(chip.textContent).not.toMatch(/\d\.\d\d/);
});

test('a chip for a trade that is gone says so and goes nowhere', async () => {
  await mount({
    value: chipDoc({ type: 'tradeLink', attrs: { tradeId: 'gone' } }),
  });
  expect(await screen.findByText('Trade unavailable')).toBeTruthy();
  expect(screen.queryByRole('link')).toBeNull();
});

test('a day chip opens that day: review for a past day, plan for a day to come', async () => {
  await mount({
    value: chipDoc(
      { type: 'dayLink', attrs: { date: '2020-03-02' } },
      { type: 'text', text: ' and ' },
      { type: 'dayLink', attrs: { date: '2099-03-02' } },
    ),
  });
  const links = await screen.findAllByRole('link');
  expect(links.map((l) => l.getAttribute('href'))).toEqual([
    '/app/day/2020-03-02/review',
    '/app/day/2099-03-02/plan',
  ]);
  expect(links[0]!.textContent).toContain('Mon 2 Mar');
});

test('the Trade item finds a trade by search and puts a chip of its id in the note', async () => {
  const { editor } = await mount();
  await slash(editor, 'Trade');
  const dialog = await screen.findByRole('dialog', { name: 'Link a trade' });
  const search = within(dialog).getByRole('combobox', {
    name: 'Search trades',
  });
  const symbol = fixtureSample().trades.find((t) => t.id === 'f-2')!.instrument
    .symbol;
  fireEvent.change(search, { target: { value: symbol } });
  const rows = await within(dialog).findAllByRole('option');
  expect(rows.length).toBeGreaterThan(0);
  // A row names the symbol, the day and what the trade made.
  expect(rows[0]!.textContent).toContain(symbol);
  expect(rows[0]!.textContent).toMatch(/[+−-]\$/);
  fireEvent.click(rows[0]!);
  await waitFor(() => expect(find(editor, 'tradeLink')).toHaveLength(1));
  const id = find(editor, 'tradeLink')[0]!.attrs!.tradeId as string;
  expect(fixtureSample().trades.some((t) => t.id === id)).toBe(true);
  // Ids only: no money and no label in the body.
  expect(JSON.stringify(find(editor, 'tradeLink')[0])).not.toMatch(/\$/);
  expect(screen.queryByRole('dialog')).toBeNull();
});

test('the trade picker shows its money through Privacy, and says when nothing matches', async () => {
  const repo = newRepo();
  await repo.prefs.update({ displayUnit: 'privacy' });
  const { editor } = await mount({ repo });
  await slash(editor, 'Trade');
  const dialog = await screen.findByRole('dialog', { name: 'Link a trade' });
  const rows = await within(dialog).findAllByRole('option');
  expect(rows[0]!.textContent).toContain('•••');
  fireEvent.change(
    within(dialog).getByRole('combobox', { name: 'Search trades' }),
    {
      target: { value: 'zzzz-no-such' },
    },
  );
  expect(await within(dialog).findByText('No trades match.')).toBeTruthy();
});

test('the Day item takes a date and puts a day chip in the note', async () => {
  const { editor } = await mount();
  await slash(editor, 'Day');
  const dialog = await screen.findByRole('dialog', { name: 'Link a day' });
  fireEvent.change(within(dialog).getByLabelText('Day'), {
    target: { value: '2026-11-18' },
  });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Link day' }));
  await waitFor(() => expect(find(editor, 'dayLink')).toHaveLength(1));
  expect(find(editor, 'dayLink')[0]!.attrs).toEqual({ date: '2026-11-18' });
});

// ---- equations ------------------------------------------------------------------

test('the Equation item takes LaTeX, shows it, and keeps a bad one out until it parses', async () => {
  const { editor } = await mount();
  await slash(editor, 'Equation');
  const dialog = await screen.findByRole('dialog', { name: 'Equation' });
  const field = within(dialog).getByRole('textbox', { name: 'LaTeX' });
  fireEvent.change(field, { target: { value: '\\frac{a' } });
  expect(await within(dialog).findByText(/isn.t valid LaTeX/)).toBeTruthy();
  expect(
    (
      within(dialog).getByRole('button', {
        name: 'Insert',
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  fireEvent.change(field, { target: { value: 'R = \\frac{gain}{risk}' } });
  await waitFor(() => expect(dialog.querySelector('.katex')).not.toBeNull());
  fireEvent.click(within(dialog).getByRole('button', { name: 'Insert' }));
  await waitFor(() => expect(find(editor, 'blockMath')).toHaveLength(1));
  expect(find(editor, 'blockMath')[0]!.attrs!.latex).toBe(
    'R = \\frac{gain}{risk}',
  );
  expect(editor.view.dom.querySelector('.katex')).not.toBeNull();
});

test('clicking an equation opens it to edit', async () => {
  const { editor } = await mount({
    value: docOf(para('Risk'), { type: 'blockMath', attrs: { latex: 'x^2' } }),
  });
  const rendered = editor.view.dom.querySelector('[data-type="block-math"]')!;
  fireEvent.click(rendered);
  const dialog = await screen.findByRole('dialog', { name: 'Edit equation' });
  const field = within(dialog).getByRole('textbox', { name: 'LaTeX' });
  expect((field as HTMLTextAreaElement).value).toBe('x^2');
  fireEvent.change(field, { target: { value: 'x^3' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
  await waitFor(() =>
    expect(find(editor, 'blockMath')[0]!.attrs!.latex).toBe('x^3'),
  );
});

// ---- embeds --------------------------------------------------------------------

const VIDEO = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
const POST = 'https://x.com/keel/status/1860000000000000001';

test('a YouTube link offers an embed with the no-cookie domain', async () => {
  const { editor, textbox } = await mount();
  const event = pasteFiles(textbox, [], VIDEO);
  expect(event.defaultPrevented).toBe(true);
  // The link is in the note as a link, and a small prompt asks about embedding it.
  expect(editor.getHTML()).toContain(VIDEO);
  const offer = await screen.findByRole('group', { name: 'Embed this link' });
  expect(within(offer).getByText('Embed this YouTube video?')).toBeTruthy();
  fireEvent.click(within(offer).getByRole('button', { name: 'Embed' }));
  await waitFor(() => expect(kinds(editor)).toContain('youtube'));
  expect(editor.getHTML()).not.toContain(`>${VIDEO}<`);
  const frame = await waitFor(() => {
    const f = editor.view.dom.querySelector('iframe');
    expect(f).not.toBeNull();
    return f!;
  });
  expect(frame.getAttribute('src')).toMatch(
    /^https:\/\/www\.youtube-nocookie\.com\/embed\/dQw4w9WgXcQ/,
  );
  // Where it comes from is said under it.
  expect(screen.getByText('From youtube.com')).toBeTruthy();
  expect(screen.queryByRole('group', { name: 'Embed this link' })).toBeNull();
});

test('Keep as link leaves the pasted address as a link', async () => {
  const { editor, textbox } = await mount();
  pasteFiles(textbox, [], VIDEO);
  const offer = await screen.findByRole('group', { name: 'Embed this link' });
  fireEvent.click(within(offer).getByRole('button', { name: 'Keep as link' }));
  expect(screen.queryByRole('group', { name: 'Embed this link' })).toBeNull();
  expect(kinds(editor)).toEqual(['paragraph']);
  expect(editor.getHTML()).toContain(`href="${VIDEO}"`);
});

test("a sentence with a link in it, or another site's link, is the editor's own paste and offers nothing", async () => {
  const { editor, textbox } = await mount();
  pasteFiles(textbox, [], 'see https://youtu.be/dQw4w9WgXcQ');
  pasteFiles(textbox, [], 'https://example.com/page');
  await act(async () => {
    await new Promise((r) => setTimeout(r, 60));
  });
  expect(screen.queryByRole('group', { name: 'Embed this link' })).toBeNull();
  expect(kinds(editor)).not.toContain('youtube');
});

test('a pasted X post link offers an embed of the post', async () => {
  const { editor, textbox } = await mount();
  pasteFiles(textbox, [], POST);
  const offer = await screen.findByRole('group', { name: 'Embed this link' });
  expect(within(offer).getByText('Embed this post from X?')).toBeTruthy();
  fireEvent.click(within(offer).getByRole('button', { name: 'Embed' }));
  await waitFor(() => expect(find(editor, 'tweet')).toHaveLength(1));
  expect(find(editor, 'tweet')[0]!.attrs).toEqual({ url: POST });
});

test('the YouTube item asks for the link and refuses one that is not a video', async () => {
  const { editor } = await mount();
  await slash(editor, 'YouTube video');
  const dialog = await screen.findByRole('dialog', {
    name: 'Embed a YouTube video',
  });
  const link = within(dialog).getByRole('textbox', { name: 'Link' });
  fireEvent.change(link, { target: { value: 'https://vimeo.com/12345' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Embed' }));
  expect(await within(dialog).findByRole('alert')).toBeTruthy();
  expect(kinds(editor)).not.toContain('youtube');
  fireEvent.change(link, { target: { value: VIDEO } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Embed' }));
  await waitFor(() => expect(kinds(editor)).toContain('youtube'));
});

function stubScripts() {
  const added: HTMLScriptElement[] = [];
  vi.spyOn(document.head, 'appendChild').mockImplementation(((n: Node) => {
    if (n instanceof HTMLScriptElement) added.push(n);
    return n;
  }) as never);
  return added;
}
const widgetSrc = (s: HTMLScriptElement) => s.src;
const TWEET_DOC = docOf(para('Tuesday'), {
  type: 'tweet',
  attrs: { url: POST },
});

test('the X embed loads its script only on mount and falls back offline', async () => {
  const scripts = stubScripts();
  // A note with no post never asks X for anything.
  const plain = await mount({ value: docOf(para('Tuesday')) });
  expect(scripts).toHaveLength(0);
  plain.view.unmount();
  cleanup();

  // Offline: the plain link, the source, and no script.
  const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
  const off = await mount({ value: TWEET_DOC });
  const link = await screen.findByRole('link', { name: POST });
  expect(link.getAttribute('href')).toBe(POST);
  expect(screen.getByText('From x.com')).toBeTruthy();
  expect(scripts).toHaveLength(0);

  // Back online: now it asks, once.
  online.mockReturnValue(true);
  act(() => {
    window.dispatchEvent(new Event('online'));
  });
  await waitFor(() => expect(scripts).toHaveLength(1));
  expect(widgetSrc(scripts[0]!)).toBe(
    'https://platform.twitter.com/widgets.js',
  );
  off.view.unmount();
});

test('the X embed draws the post when the script loads, and the link when it fails', async () => {
  const scripts = stubScripts();
  const createTweet = vi.fn<
    (
      id: string,
      el: HTMLElement,
      options?: Record<string, unknown>,
    ) => Promise<HTMLElement>
  >(async (_id, el) => {
    const drawn = document.createElement('div');
    drawn.setAttribute('data-drawn', '');
    el.appendChild(drawn);
    return drawn;
  });
  await mount({ value: TWEET_DOC });
  await waitFor(() => expect(scripts).toHaveLength(1));
  // Until it is drawn, the link is there.
  expect(screen.getByRole('link', { name: POST })).toBeTruthy();
  (window as unknown as { twttr: unknown }).twttr = {
    widgets: { createTweet },
  };
  act(() => {
    scripts[0]!.onload?.(new Event('load'));
  });
  await waitFor(() => expect(createTweet).toHaveBeenCalled());
  expect(createTweet.mock.calls[0]![0]).toBe('1860000000000000001');
  expect(createTweet.mock.calls[0]![2]).toMatchObject({ dnt: true });
  await waitFor(() =>
    expect(document.querySelector('[data-drawn]')).not.toBeNull(),
  );
  expect(screen.queryByRole('link', { name: POST })).toBeNull();
  expect(screen.getByText('From x.com')).toBeTruthy();
  cleanup();

  // A script that does not load: the link stays, with the reason.
  resetTwitterWidgets();
  delete (window as { twttr?: unknown }).twttr;
  scripts.length = 0;
  await mount({ value: TWEET_DOC });
  await waitFor(() => expect(scripts).toHaveLength(1));
  act(() => {
    scripts[0]!.onerror?.(new Event('error') as never);
  });
  expect(await screen.findByText("Couldn't load the post.")).toBeTruthy();
  expect(screen.getByRole('link', { name: POST })).toBeTruthy();
});

test('an embed in a print layout is only its link: no frame, no script', async () => {
  const scripts = stubScripts();
  const { editor } = await mount({
    readOnly: true,
    embeds: 'links',
    value: docOf(
      {
        type: 'youtube',
        attrs: { src: VIDEO, start: 0 },
      },
      { type: 'tweet', attrs: { url: POST } },
    ),
  });
  expect(editor.view.dom.querySelector('iframe')).toBeNull();
  expect(scripts).toHaveLength(0);
  expect(await screen.findByRole('link', { name: POST })).toBeTruthy();
  expect(screen.getByRole('link', { name: VIDEO })).toBeTruthy();
});

test('a YouTube embed plays from the no-cookie domain and falls back to its link offline', async () => {
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
  const { editor } = await mount({
    value: docOf({ type: 'youtube', attrs: { src: VIDEO, start: 0 } }),
  });
  expect(editor.view.dom.querySelector('iframe')).toBeNull();
  expect(await screen.findByRole('link', { name: VIDEO })).toBeTruthy();
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
  act(() => {
    window.dispatchEvent(new Event('online'));
  });
  await waitFor(() =>
    expect(
      editor.view.dom.querySelector('iframe')?.getAttribute('src'),
    ).toMatch(/^https:\/\/www\.youtube-nocookie\.com\/embed\/dQw4w9WgXcQ/),
  );
  // Still no cookies asked of the person's browser by the frame's own page.
  expect(
    editor.view.dom.querySelector('iframe')?.getAttribute('referrerpolicy'),
  ).toBe('strict-origin-when-cross-origin');
});

// ---- emoji ---------------------------------------------------------------------

test('":" opens the emoji search and inserts the pick', async () => {
  const { editor } = await mount();
  act(() => {
    editor.commands.focus('end');
    editor.commands.insertContent(':rocket');
  });
  const list = await screen.findByRole('listbox', { name: 'Emoji' });
  const option = await within(list).findByRole('option', { name: /rocket/ });
  expect(option.textContent).toContain('🚀');
  // The listbox is what the editor says it controls.
  expect(editor.view.dom.getAttribute('aria-controls')).toBe(list.id);
  fireEvent.mouseDown(option);
  await waitFor(() => expect(find(editor, 'emoji')).toHaveLength(1));
  expect(find(editor, 'emoji')[0]!.attrs!.name).toBe('rocket');
  expect(editor.view.dom.textContent).toContain('🚀');
  await waitFor(() =>
    expect(screen.queryByRole('listbox', { name: 'Emoji' })).toBeNull(),
  );
});

test('the emoji list is searched by name and by what it is also called, and the arrows and Enter choose', async () => {
  const { editor } = await mount();
  act(() => {
    editor.commands.focus('end');
    editor.commands.insertContent(':thumb');
  });
  const list = await screen.findByRole('listbox', { name: 'Emoji' });
  const options = within(list).getAllByRole('option');
  expect(options.length).toBeGreaterThan(1);
  expect(options.length).toBeLessThanOrEqual(8);
  expect(options.map((o) => o.textContent).join(' ')).toMatch(/👍|thumbs/);
  const key = (k: string) =>
    editor.view.someProp('handleKeyDown', (f) =>
      f(
        editor.view,
        new KeyboardEvent('keydown', {
          key: k,
          bubbles: true,
          cancelable: true,
        }),
      ),
    );
  act(() => {
    key('ArrowDown');
  });
  expect(
    within(list).getAllByRole('option')[1]!.getAttribute('aria-selected'),
  ).toBe('true');
  act(() => {
    key('Enter');
  });
  await waitFor(() => expect(find(editor, 'emoji')).toHaveLength(1));
});

test('a time like 09:41 or an address does not open the emoji list', async () => {
  const { editor } = await mount();
  act(() => {
    editor.commands.focus('end');
    editor.commands.insertContent('at 09:41 or https://example.com');
  });
  expect(screen.queryByRole('listbox', { name: 'Emoji' })).toBeNull();
});

// ---- the handles ---------------------------------------------------------------

/**
 * A handle's button. The handle is hidden until a block is hovered, and a
 * hidden control has no accessible name for Testing Library, so it is found by
 * its label.
 */
const handleButton = async (label: string) => {
  await waitFor(() =>
    expect(document.querySelector(`[aria-label="${label}"]`)).not.toBeNull(),
  );
  return document.querySelector(`[aria-label="${label}"]`) as HTMLElement;
};

test('the handle adds a block below with the slash menu open', async () => {
  const { editor } = await mount({ value: docOf(para('One'), para('Two')) });
  act(() => {
    editor.commands.setTextSelection(2);
  });
  fireEvent.click(await handleButton('Add a block below'));
  await screen.findByRole('listbox', { name: 'Insert a block' });
  // A new paragraph after the block the caret was in, holding the "/".
  expect(kinds(editor)).toEqual(['paragraph', 'paragraph', 'paragraph']);
  expect(textOf(json(editor).content![1])).toBe('/');
});

test('Move up and Move down move a block', async () => {
  const { editor } = await mount({
    value: docOf(para('One'), para('Two'), para('Three')),
  });
  act(() => {
    editor.commands.setTextSelection(7); // in "Two"
  });
  const grip = await handleButton('Move this block');
  const open = async () => {
    fireEvent.click(grip);
    return screen.findByRole('menu');
  };
  let menu = await open();
  fireEvent.click(within(menu).getByRole('menuitem', { name: 'Move down' }));
  await waitFor(() =>
    expect((json(editor).content ?? []).map(textOf)).toEqual([
      'One',
      'Three',
      'Two',
    ]),
  );
  await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
  menu = await open();
  fireEvent.click(within(menu).getByRole('menuitem', { name: 'Move up' }));
  await waitFor(() =>
    expect((json(editor).content ?? []).map(textOf)).toEqual([
      'One',
      'Two',
      'Three',
    ]),
  );
});

test('the first block cannot move up and the last cannot move down', async () => {
  const { editor } = await mount({ value: docOf(para('One'), para('Two')) });
  act(() => {
    editor.commands.setTextSelection(2);
  });
  fireEvent.click(await handleButton('Move this block'));
  const menu = await screen.findByRole('menu');
  expect(
    within(menu)
      .getByRole('menuitem', { name: 'Move up' })
      .hasAttribute('data-disabled'),
  ).toBe(true);
  expect(
    within(menu)
      .getByRole('menuitem', { name: 'Move down' })
      .hasAttribute('data-disabled'),
  ).toBe(false);
});

test('the paragraph menu also moves a block, for a keyboard and a phone that has no handles', async () => {
  const { editor } = await mount({ value: docOf(para('One'), para('Two')) });
  act(() => {
    editor.commands.setTextSelection(2);
  });
  fireEvent.keyDown(screen.getByRole('button', { name: /^Paragraph/ }), {
    key: 'Enter',
  });
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Move down' }));
  await waitFor(() =>
    expect((json(editor).content ?? []).map(textOf)).toEqual(['Two', 'One']),
  );
});

// ---- read-only ----------------------------------------------------------------

test('a read-only note shows its blocks and offers no way to change them', async () => {
  const trade = fixtureSample().trades.find((t) => t.id === 'f-1')!;
  const { editor } = await mount({
    readOnly: true,
    value: docOf(
      { type: 'pageBreak' },
      {
        type: 'columns',
        content: [
          { type: 'column', content: [para('Working')] },
          { type: 'column', content: [para('Not working')] },
        ],
      },
      {
        type: 'timedList',
        content: [
          {
            type: 'timedItem',
            attrs: { time: '09:30' },
            content: [para('Range set')],
          },
        ],
      },
      { type: 'blockMath', attrs: { latex: 'x^2' } },
      chipDoc(
        { type: 'tradeLink', attrs: { tradeId: 'f-1' } },
        { type: 'emoji', attrs: { name: 'rocket' } },
      ).content![0]!,
    ),
  });
  expect(screen.queryByRole('toolbar')).toBeNull();
  expect(document.querySelector('[aria-label="Add a block below"]')).toBeNull();
  expect(document.querySelector('[aria-label="Move this block"]')).toBeNull();
  // The blocks are there: the chip still goes to its trade, the time is text.
  expect(editor.view.dom.querySelector('[data-type="columns"]')).not.toBeNull();
  expect(
    editor.view.dom.querySelector('[data-type="page-break"]'),
  ).not.toBeNull();
  expect(editor.view.dom.querySelector('.katex')).not.toBeNull();
  expect(editor.view.dom.textContent).toContain('🚀');
  expect(
    (
      await screen.findByRole('link', {
        name: new RegExp(trade.instrument.symbol),
      })
    ).getAttribute('href'),
  ).toBe('/app/trades/f-1');
  expect(screen.queryByRole('textbox', { name: 'Time' })).toBeNull();
  expect(editor.view.dom.textContent).toContain('09:30');
  // Nothing opens a dialog from a read-only note, an equation included.
  fireEvent.click(editor.view.dom.querySelector('[data-type="block-math"]')!);
  expect(screen.queryByRole('dialog')).toBeNull();
  // No handle commands either.
  expect(editor.can().moveBlock('down')).toBe(false);
});
