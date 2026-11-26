// @vitest-environment happy-dom
import { afterEach, expect, test, vi } from 'vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { Editor } from '@tiptap/core';
import { EditorToolbar } from './editor-toolbar';
import { noteExtensions } from './extensions';
import { NoteEditor } from './note-editor';
import {
  FONT_FAMILIES,
  FONT_SIZES,
  HIGHLIGHTS,
  TEXT_COLOURS,
} from './note-style';

const editors: Editor[] = [];
afterEach(() => {
  cleanup();
  for (const e of editors.splice(0)) e.destroy();
  window.innerWidth = 1024;
});

const para = (text: string, marks?: { type: string }[]) => ({
  type: 'paragraph',
  content: [{ type: 'text', text, ...(marks ? { marks } : {}) }],
});
const PLAN = { type: 'doc', content: [para('Held the plan')] };

/** A real editor on the document, its text selected, with the toolbar over it. */
function setup(content: unknown = PLAN, from = 1, to = 14) {
  const editor = new Editor({
    extensions: noteExtensions(),
    content: content as never,
  });
  editors.push(editor);
  editor.commands.setTextSelection({ from, to });
  const view = render(<EditorToolbar editor={editor} />);
  return { editor, ...view };
}

type Role = 'menuitem' | 'menuitemradio' | 'menuitemcheckbox';

/** Opens a menu from its button, with the keyboard as the Radix menus take it. */
async function openMenu(name: string | RegExp) {
  const button = screen.getByRole('button', { name });
  fireEvent.keyDown(button, { key: 'Enter' });
  await screen.findAllByRole('menu');
  return button;
}

async function choose(menu: string | RegExp, item: string, role: Role) {
  await openMenu(menu);
  fireEvent.click(await screen.findByRole(role, { name: item }));
  await waitFor(() => expect(screen.queryAllByRole('menu')).toHaveLength(0));
}

const STYLE = /^Style:/;
const FONT = /^Font:/;
const SIZE = /^Size:/;
const FORMAT = /^Format/;
const PARAGRAPH = /^Paragraph/;

const json = (e: Editor) => e.getJSON() as { content?: Node[] };
type Node = {
  type: string;
  attrs?: Record<string, unknown>;
  content?: Node[];
  text?: string;
};
const first = (e: Editor) => json(e).content?.[0];
const mark = (e: Editor, name: string, attr: string) =>
  e.getAttributes(name)[attr] as unknown;

interface Row {
  /** The control, as the toolbar names it. */
  control: string | RegExp;
  /** The menu's item; a plain button has none. */
  item?: string;
  role?: Role;
  doc?: unknown;
  check(e: Editor): boolean;
}

const BUTTONS: Row[] = [
  { control: 'Bold', check: (e) => e.isActive('bold') },
  { control: 'Italic', check: (e) => e.isActive('italic') },
  { control: 'Underline', check: (e) => e.isActive('underline') },
];

type Check = (e: Editor) => boolean;
const isToggle =
  (n: number): Check =>
  (e) =>
    json(e).content!.some((b) => b.type === 'details' && b.attrs?.toggle === n);

const STYLES: Row[] = (
  [
    ['Heading 1', (e) => e.isActive('heading', { level: 1 })],
    ['Heading 2', (e) => e.isActive('heading', { level: 2 })],
    ['Heading 3', (e) => e.isActive('heading', { level: 3 })],
    ['Bulleted list', (e) => e.isActive('bulletList')],
    ['Numbered list', (e) => e.isActive('orderedList')],
    ['Checklist', (e) => e.isActive('taskList')],
    ['Quote', (e) => e.isActive('blockquote')],
    ['Toggle heading 1', isToggle(1)],
    ['Toggle heading 2', isToggle(2)],
    ['Toggle heading 3', isToggle(3)],
  ] satisfies [string, Check][]
).map(([item, check]) => ({
  control: STYLE,
  item,
  role: 'menuitemradio' as Role,
  check,
}));

const FORMATS: Row[] = [
  ['Strikethrough', 'strike'],
  ['Inline code', 'code'],
  ['Superscript', 'superscript'],
  ['Subscript', 'subscript'],
].map(([item, name]) => ({
  control: FORMAT,
  item: item!,
  role: 'menuitemcheckbox' as Role,
  check: (e: Editor) => e.isActive(name!),
}));

const ALIGNS: Row[] = [
  ['Left', 'left'],
  ['Centre', 'center'],
  ['Right', 'right'],
  ['Justify', 'justify'],
  ['Start', 'start'],
  ['End', 'end'],
].map(([item, value]) => ({
  control: PARAGRAPH,
  item: item!,
  role: 'menuitemradio' as Role,
  check: (e: Editor) => first(e)?.attrs?.textAlign === value,
}));

const FONTS: Row[] = FONT_FAMILIES.filter((f) => f.value !== null).map((f) => ({
  control: FONT,
  item: f.label,
  role: 'menuitemradio' as Role,
  check: (e: Editor) => mark(e, 'textStyle', 'fontFamily') === f.value,
}));

const SIZES: Row[] = [8, 24, 72].map((n) => ({
  control: SIZE,
  item: String(n),
  role: 'menuitemradio' as Role,
  check: (e: Editor) => mark(e, 'textStyle', 'fontSize') === `${n}px`,
}));

const COLOURS: Row[] = TEXT_COLOURS.map((c) => ({
  control: 'Text colour',
  item: c.label,
  role: 'menuitemradio' as Role,
  check: (e: Editor) => mark(e, 'textStyle', 'color') === c.value,
}));

const HIGHLIGHT_ROWS: Row[] = HIGHLIGHTS.map((c) => ({
  control: 'Highlight',
  item: c.label,
  role: 'menuitemradio' as Role,
  check: (e: Editor) => mark(e, 'highlight', 'color') === c.value,
}));

const INSERTS: Row[] = (
  [
    ['Table', (e) => e.isActive('table')],
    [
      'Divider',
      (e) => json(e).content!.some((n) => n.type === 'horizontalRule'),
    ],
    ['Toggle', isToggle(0)],
    ['Toggle heading 1', isToggle(1)],
    ['Toggle heading 2', isToggle(2)],
    ['Toggle heading 3', isToggle(3)],
  ] satisfies [string, Check][]
).map(([item, check]) => ({
  control: 'Insert',
  item,
  role: 'menuitem' as Role,
  check,
}));

const ROWS: Row[] = [
  ...BUTTONS,
  ...STYLES,
  ...FORMATS,
  ...ALIGNS,
  ...FONTS,
  ...SIZES,
  ...COLOURS,
  ...HIGHLIGHT_ROWS,
  ...INSERTS,
];

test.each(ROWS.map((r) => [`${String(r.control)} ${r.item ?? ''}`.trim(), r]))(
  'every control applies its mark or node: %s',
  async (_name, row) => {
    const { editor } = setup(row.doc);
    expect(row.check(editor)).toBe(false);
    if (row.item === undefined) {
      fireEvent.click(screen.getByRole('button', { name: row.control }));
    } else {
      await choose(row.control, row.item, row.role!);
    }
    expect(row.check(editor)).toBe(true);
  },
);

test('Left is the alignment that is already in force, and Normal text clears a heading', async () => {
  const { editor } = setup({
    type: 'doc',
    content: [
      {
        type: 'heading',
        attrs: { level: 2, textAlign: 'center' },
        content: [{ type: 'text', text: 'Held the plan' }],
      },
    ],
  });
  await choose(STYLE, 'Normal text', 'menuitemradio');
  expect(first(editor)?.type).toBe('paragraph');
  await choose(PARAGRAPH, 'Left', 'menuitemradio');
  expect(first(editor)?.attrs?.textAlign).toBe('left');
});

test("the palettes and sizes are Keel's own", () => {
  expect(FONT_FAMILIES.map((f) => f.label)).toEqual(['Sans', 'Serif', 'Mono']);
  expect(FONT_SIZES[0]).toBe(8);
  expect(FONT_SIZES.at(-1)).toBe(72);
  expect(FONT_SIZES).toHaveLength(65);
  expect(TEXT_COLOURS.length).toBeGreaterThanOrEqual(8);
  expect(HIGHLIGHTS.length).toBeGreaterThanOrEqual(8);
  for (const c of [...TEXT_COLOURS, ...HIGHLIGHTS]) {
    // Tokens, so a colour follows the theme; never a literal.
    expect(c.value).toMatch(/^var\(--note-(ink|hl)-[a-z]+\)$/);
  }
});

test('Default clears the colour and None clears the highlight', async () => {
  const doc = {
    type: 'doc',
    content: [
      para('Held the plan', [
        {
          type: 'textStyle',
          attrs: { color: TEXT_COLOURS[0]!.value },
        } as never,
        { type: 'highlight', attrs: { color: HIGHLIGHTS[0]!.value } } as never,
      ]),
    ],
  };
  const { editor } = setup(doc);
  expect(mark(editor, 'textStyle', 'color')).toBe(TEXT_COLOURS[0]!.value);
  await choose('Text colour', 'Default', 'menuitemradio');
  expect(mark(editor, 'textStyle', 'color')).toBeFalsy();
  expect(editor.isActive('highlight')).toBe(true);
  await choose('Highlight', 'None', 'menuitemradio');
  expect(editor.isActive('highlight')).toBe(false);
});

test('Sans puts the default face back', async () => {
  const { editor } = setup();
  await choose(FONT, 'Serif', 'menuitemradio');
  expect(editor.isActive('textStyle')).toBe(true);
  await choose(FONT, 'Sans', 'menuitemradio');
  expect(mark(editor, 'textStyle', 'fontFamily')).toBeFalsy();
});

test('Clear formatting removes every mark but the link', async () => {
  const { editor } = setup({
    type: 'doc',
    content: [
      para('Held the plan', [
        { type: 'bold' },
        { type: 'italic' },
        { type: 'underline' },
        { type: 'strike' },
        { type: 'link', attrs: { href: 'https://example.com' } } as never,
        { type: 'highlight', attrs: { color: HIGHLIGHTS[1]!.value } } as never,
        {
          type: 'textStyle',
          attrs: { color: TEXT_COLOURS[2]!.value },
        } as never,
      ]),
    ],
  });
  await choose(FORMAT, 'Clear formatting', 'menuitem');
  const marks = (
    first(editor)?.content?.[0] as Node & {
      marks?: { type: string }[];
    }
  ).marks;
  expect(marks?.map((m) => m.type)).toEqual(['link']);
});

test('superscript and subscript do not stack', async () => {
  const { editor } = setup();
  await choose(FORMAT, 'Superscript', 'menuitemcheckbox');
  await choose(FORMAT, 'Subscript', 'menuitemcheckbox');
  expect(editor.isActive('subscript')).toBe(true);
  expect(editor.isActive('superscript')).toBe(false);
  await choose(FORMAT, 'Superscript', 'menuitemcheckbox');
  expect(editor.isActive('superscript')).toBe(true);
  expect(editor.isActive('subscript')).toBe(false);
});

test('Indent and Outdent move a paragraph, and Outdent is off at the margin', async () => {
  const { editor } = setup();
  await openMenu(PARAGRAPH);
  expect(
    screen
      .getByRole('menuitem', { name: 'Outdent' })
      .hasAttribute('data-disabled'),
  ).toBe(true);
  fireEvent.click(screen.getByRole('menuitem', { name: 'Indent' }));
  await waitFor(() => expect(first(editor)?.attrs?.indent).toBe(1));
  await choose(PARAGRAPH, 'Outdent', 'menuitem');
  expect(first(editor)?.attrs?.indent).toBe(0);
});

test('the style menu toggles a toggle heading', async () => {
  const { editor } = setup(PLAN, 3, 3);
  expect(
    screen.getByRole('button', { name: 'Style: Normal text' }),
  ).toBeTruthy();
  await choose(STYLE, 'Toggle heading 2', 'menuitemradio');
  expect(first(editor)?.type).toBe('details');
  expect(first(editor)?.attrs?.toggle).toBe(2);
  // The title is the text that was there; the button says where the caret is.
  expect(first(editor)?.content?.[0]?.content?.[0]?.text).toBe('Held the plan');
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Style: Toggle heading 2' }),
    ).toBeTruthy(),
  );
  await openMenu(STYLE);
  expect(
    screen
      .getByRole('menuitemradio', { name: 'Toggle heading 2' })
      .getAttribute('aria-checked'),
  ).toBe('true');
  fireEvent.click(
    screen.getByRole('menuitemradio', { name: 'Toggle heading 2' }),
  );
  await waitFor(() => expect(screen.queryAllByRole('menu')).toHaveLength(0));
  expect(first(editor)?.type).toBe('paragraph');
  expect(first(editor)?.content?.[0]?.text).toBe('Held the plan');
});

test('the style button names the block the caret is in', async () => {
  const { editor } = setup(
    {
      type: 'doc',
      content: [
        {
          type: 'heading',
          attrs: { level: 3 },
          content: [{ type: 'text', text: 'Plan' }],
        },
      ],
    },
    2,
    2,
  );
  expect(screen.getByRole('button', { name: 'Style: Heading 3' })).toBeTruthy();
  act(() => {
    editor.commands.toggleBulletList();
  });
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Style: Bulleted list' }),
    ).toBeTruthy(),
  );
});

test('the size button shows a size set on the text, and the font button the face', async () => {
  setup({
    type: 'doc',
    content: [
      para('Held the plan', [
        {
          type: 'textStyle',
          attrs: { fontSize: '24px', fontFamily: FONT_FAMILIES[1]!.value },
        } as never,
      ]),
    ],
  });
  expect(screen.getByRole('button', { name: 'Size: 24' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Font: Serif' })).toBeTruthy();
});

test('Undo and Redo follow the history', async () => {
  const { editor } = setup();
  const undo = screen.getByRole('button', { name: 'Undo' });
  const redo = screen.getByRole('button', { name: 'Redo' });
  expect(undo.hasAttribute('disabled')).toBe(true);
  expect(redo.hasAttribute('disabled')).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Bold' }));
  await waitFor(() => expect(undo.hasAttribute('disabled')).toBe(false));
  fireEvent.click(undo);
  expect(editor.isActive('bold')).toBe(false);
  await waitFor(() => expect(redo.hasAttribute('disabled')).toBe(false));
  fireEvent.click(redo);
  expect(editor.isActive('bold')).toBe(true);
});

test('the toggle buttons carry aria-pressed and follow the selection', async () => {
  const { editor } = setup();
  const bold = screen.getByRole('button', { name: 'Bold' });
  expect(bold.getAttribute('aria-pressed')).toBe('false');
  act(() => {
    editor.commands.toggleBold();
  });
  await waitFor(() => expect(bold.getAttribute('aria-pressed')).toBe('true'));
});

test('the toolbar is a named toolbar with one tab stop, and the arrow keys rove', async () => {
  setup();
  const bar = screen.getByRole('toolbar', { name: 'Formatting' });
  const bold = screen.getByRole('button', { name: 'Bold' });
  const italic = screen.getByRole('button', { name: 'Italic' });
  bold.focus();
  const stops = () =>
    within(bar)
      .getAllByRole('button')
      .filter((b) => b.getAttribute('tabindex') === '0');
  await waitFor(() => expect(stops()).toEqual([bold]));
  fireEvent.keyDown(bold, { key: 'ArrowRight' });
  await waitFor(() => expect(document.activeElement).toBe(italic));
  expect(stops()).toEqual([italic]);
  fireEvent.keyDown(italic, { key: 'ArrowLeft' });
  await waitFor(() => expect(document.activeElement).toBe(bold));
  fireEvent.keyDown(bold, { key: 'End' });
  const enabled = within(bar)
    .getAllByRole('button')
    .filter((b) => !b.hasAttribute('disabled'));
  await waitFor(() => expect(document.activeElement).toBe(enabled.at(-1)));
  fireEvent.keyDown(document.activeElement!, { key: 'Home' });
  await waitFor(() => expect(document.activeElement).toBe(enabled[0]));
});

test('every control has an accessible name', () => {
  setup();
  const bar = screen.getByRole('toolbar', { name: 'Formatting' });
  for (const b of within(bar).getAllByRole('button')) {
    const name = b.getAttribute('aria-label') ?? b.textContent;
    expect((name ?? '').trim(), b.outerHTML).not.toBe('');
  }
});

test('Link keeps its own form: Apply sets the mark, an empty address removes it', async () => {
  const { editor } = setup();
  fireEvent.click(screen.getByRole('button', { name: 'Link' }));
  const input = await screen.findByRole('textbox', { name: 'Link address' });
  fireEvent.change(input, { target: { value: 'example.com' } });
  fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
  expect(editor.getAttributes('link').href).toBe('https://example.com');
  fireEvent.click(screen.getByRole('button', { name: 'Link' }));
  const again = await screen.findByRole('textbox', { name: 'Link address' });
  fireEvent.change(again, { target: { value: '' } });
  fireEvent.click(screen.getByRole('button', { name: 'Remove link' }));
  expect(editor.isActive('link')).toBe(false);
});

/** A key as the menu shows it, `aria-keyshortcuts`, to the event a keyboard sends. */
function press(editor: Editor, shortcut: string) {
  const parts = shortcut.split('+');
  const key = parts.pop()!;
  const code =
    (
      {
        ',': 188,
        '.': 190,
        '[': 219,
        ']': 221,
      } as Record<string, number>
    )[key] ?? key.toUpperCase().charCodeAt(0);
  const event = new KeyboardEvent('keydown', {
    key,
    ctrlKey: parts.includes('Control'),
    shiftKey: parts.includes('Shift'),
    altKey: parts.includes('Alt'),
    bubbles: true,
    cancelable: true,
  });
  Object.defineProperty(event, 'keyCode', { value: code });
  const handled = editor.view.someProp('handleKeyDown', (f) =>
    f(editor.view, event),
  );
  return handled === true;
}

/** The items whose key bindings the menus show: where each lives and what it is. */
const BOUND: [RegExp, string, Role][] = [
  [STYLE, 'Normal text', 'menuitemradio'],
  [STYLE, 'Heading 1', 'menuitemradio'],
  [STYLE, 'Bulleted list', 'menuitemradio'],
  [STYLE, 'Numbered list', 'menuitemradio'],
  [FORMAT, 'Strikethrough', 'menuitemcheckbox'],
  [FORMAT, 'Inline code', 'menuitemcheckbox'],
  [FORMAT, 'Superscript', 'menuitemcheckbox'],
  [FORMAT, 'Subscript', 'menuitemcheckbox'],
  [PARAGRAPH, 'Left', 'menuitemradio'],
  [PARAGRAPH, 'Centre', 'menuitemradio'],
  [PARAGRAPH, 'Right', 'menuitemradio'],
  [PARAGRAPH, 'Justify', 'menuitemradio'],
  [PARAGRAPH, 'Indent', 'menuitem'],
];
const UNBOUND: [RegExp, string, Role][] = [
  [STYLE, 'Toggle heading 1', 'menuitemradio'],
  [PARAGRAPH, 'Start', 'menuitemradio'],
  [PARAGRAPH, 'End', 'menuitemradio'],
];

const BOUND_EFFECT: Record<string, (e: Editor) => boolean> = {
  'Heading 1': (e) => e.isActive('heading', { level: 1 }),
  'Bulleted list': (e) => e.isActive('bulletList'),
  'Numbered list': (e) => e.isActive('orderedList'),
  Strikethrough: (e) => e.isActive('strike'),
  'Inline code': (e) => e.isActive('code'),
  Superscript: (e) => e.isActive('superscript'),
  Subscript: (e) => e.isActive('subscript'),
  Left: (e) => first(e)?.attrs?.textAlign === 'left',
  Centre: (e) => first(e)?.attrs?.textAlign === 'center',
  Right: (e) => first(e)?.attrs?.textAlign === 'right',
  Justify: (e) => first(e)?.attrs?.textAlign === 'justify',
  Indent: (e) => first(e)?.attrs?.indent === 1,
};

async function shownKeys(items: [RegExp, string, Role][]) {
  const keys = new Map<string, string | null>();
  for (const [menu, name, role] of items) {
    await openMenu(menu);
    const el = await screen.findByRole(role, { name });
    keys.set(name, el.getAttribute('aria-keyshortcuts'));
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    await waitFor(() => expect(screen.queryAllByRole('menu')).toHaveLength(0));
  }
  return keys;
}

test('every key binding a menu shows does what its item does', async () => {
  const { editor, unmount } = setup(PLAN, 3, 3);
  const shown = await shownKeys(BOUND);
  const hidden = await shownKeys(UNBOUND);
  unmount();
  editor.destroy();
  // Start, End and the toggle headings have no binding to show.
  for (const [name, keys] of hidden) expect(keys, name).toBeNull();
  for (const [name, keys] of shown) {
    expect(keys, name).toBeTruthy();
    if (name === 'Normal text') continue; // set from a heading below
    const fresh = new Editor({
      extensions: noteExtensions(),
      content: PLAN as never,
    });
    editors.push(fresh);
    fresh.commands.setTextSelection({ from: 1, to: 14 });
    expect(press(fresh, keys!), name).toBe(true);
    expect(BOUND_EFFECT[name]!(fresh), `${name} by ${keys}`).toBe(true);
  }
  const heading = new Editor({
    extensions: noteExtensions(),
    content: {
      type: 'doc',
      content: [
        {
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: 'Plan' }],
        },
      ],
    } as never,
  });
  editors.push(heading);
  heading.commands.setTextSelection(2);
  expect(press(heading, shown.get('Normal text')!)).toBe(true);
  expect(first(heading)?.type).toBe('paragraph');
});

test('the toolbar is hidden when read-only', async () => {
  render(
    <NoteEditor value={PLAN} onChange={() => {}} label="Trade note" readOnly />,
  );
  await screen.findByText('Held the plan');
  expect(screen.queryByRole('toolbar')).toBeNull();
});

test('the toolbar edits the note through NoteEditor', async () => {
  const onChange = vi.fn();
  render(<NoteEditor value={PLAN} onChange={onChange} label="Trade note" />);
  await screen.findByRole('toolbar', { name: 'Formatting' });
  await choose(STYLE, 'Heading 2', 'menuitemradio');
  await waitFor(() => expect(onChange).toHaveBeenCalled());
  expect(JSON.stringify(onChange.mock.calls.at(-1)![0])).toContain('"level":2');
});

test('version history, full screen and dictation show only where a host passes them', () => {
  const { editor } = setup();
  const onHistory = vi.fn();
  const onFullScreen = vi.fn();
  const onDictate = vi.fn();
  expect(screen.queryByRole('button', { name: 'Version history' })).toBeNull();
  cleanup();
  render(
    <EditorToolbar
      editor={editor}
      onHistory={onHistory}
      onFullScreen={onFullScreen}
      onDictate={onDictate}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Version history' }));
  fireEvent.click(screen.getByRole('button', { name: 'Full screen' }));
  fireEvent.click(screen.getByRole('button', { name: /^Dictate/ }));
  expect(onHistory).toHaveBeenCalledOnce();
  expect(onFullScreen).toHaveBeenCalledOnce();
  expect(onDictate).toHaveBeenCalledOnce();
});

test('on a phone the toolbar is two rows and the rest sits in More', async () => {
  window.innerWidth = 390;
  const { editor } = setup(PLAN, 1, 14);
  for (const name of [
    'Undo',
    'Redo',
    STYLE,
    'Bold',
    'Italic',
    'Underline',
    'Link',
    'Insert',
    'More tools',
  ]) {
    expect(screen.getByRole('button', { name }), String(name)).toBeTruthy();
  }
  for (const name of [
    FONT,
    SIZE,
    FORMAT,
    PARAGRAPH,
    'Text colour',
    'Highlight',
  ]) {
    expect(screen.queryByRole('button', { name }), String(name)).toBeNull();
  }
  // More holds each of them, and the choice there is the same command.
  await openMenu('More tools');
  fireEvent.keyDown(await screen.findByRole('menuitem', { name: /^Font/ }), {
    key: 'ArrowRight',
  });
  const serif = await screen.findByRole('menuitemradio', { name: 'Serif' });
  // A sheet takes no choice in its first moments (see the test below).
  await new Promise((r) => setTimeout(r, 400));
  fireEvent.click(serif);
  await waitFor(() =>
    expect(mark(editor, 'textStyle', 'fontFamily')).toBe(
      FONT_FAMILIES[1]!.value,
    ),
  );
});

test('alignment has nowhere to go in a toggle title, and says so', async () => {
  const { editor } = setup(PLAN, 3, 3);
  editor.commands.setToggle(1);
  await openMenu(PARAGRAPH);
  for (const name of ['Left', 'Centre', 'Justify', 'End']) {
    expect(
      screen.getByRole('menuitemradio', { name }).hasAttribute('data-disabled'),
      name,
    ).toBe(true);
  }
});

test('on a phone the press that opens a sheet does not choose what is under it', async () => {
  window.innerWidth = 390;
  const { editor } = setup(PLAN, 1, 14);
  const insert = screen.getByRole('button', { name: 'Insert' });
  fireEvent.pointerDown(insert, { button: 0, ctrlKey: false });
  const table = await screen.findByRole('menuitem', { name: 'Table' });
  // The pointer is released over the sheet, which now covers the button.
  fireEvent.pointerUp(table);
  expect(editor.isActive('table')).toBe(false);
  expect(screen.queryAllByRole('menu')).toHaveLength(1);
  // A moment later, a choice is a choice.
  await new Promise((r) => setTimeout(r, 400));
  fireEvent.click(table);
  await waitFor(() => expect(editor.isActive('table')).toBe(true));
});

test('a choice puts focus back in the text, not on the button', async () => {
  const { editor } = setup();
  document.body.append(editor.view.dom);
  expect(document.activeElement).not.toBe(editor.view.dom);
  await openMenu(STYLE);
  expect(document.activeElement).not.toBe(editor.view.dom);
  fireEvent.click(
    await screen.findByRole('menuitemradio', { name: 'Heading 2' }),
  );
  // The menu is still on its way out: the text already has the keyboard.
  await waitFor(() => expect(document.activeElement).toBe(editor.view.dom));
  editor.view.dom.remove();
});

test('a toggle has no room on the first line of a list item, and says so', async () => {
  const { editor } = setup(
    {
      type: 'doc',
      content: [
        {
          type: 'bulletList',
          content: [{ type: 'listItem', content: [para('One')] }],
        },
      ],
    },
    4,
    4,
  );
  expect(editor.state.selection.$from.parent.type.name).toBe('paragraph');
  await openMenu(STYLE);
  expect(
    screen
      .getByRole('menuitemradio', { name: 'Toggle heading 1' })
      .hasAttribute('data-disabled'),
  ).toBe(true);
  expect(
    screen
      .getByRole('menuitemradio', { name: 'Heading 1' })
      .hasAttribute('data-disabled'),
  ).toBe(false);
});
