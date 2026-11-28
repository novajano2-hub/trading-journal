// @vitest-environment happy-dom
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
import {
  FileRejected,
  LockedDayError,
  SHOT_MAX_BYTES,
  type Repository,
} from '@/data/repository';
import type { FrozenDay } from '@/domain/types';
import { pasteFiles } from '../__fixtures__/clipboard';
import { fakeIntersectionObserver } from '../__fixtures__/intersection';
import { renderApp } from '../__fixtures__/render-app';
import { NoteEditor, type NoteEditorProps } from './note-editor';

vi.mock('next/navigation', () => import('../__fixtures__/navigation'));
MotionGlobalConfig.skipAnimations = true;

const WS = fixtureSample().trades[0]!.workspaceId;
const OWNER = 'note:n-1';

let made = 0;
beforeEach(() => {
  made = 0;
  URL.createObjectURL = vi.fn(() => `blob:note-${(made += 1)}`);
  URL.revokeObjectURL = vi.fn();
  // Every image counts as near the screen, unless a test says otherwise.
  fakeIntersectionObserver({ auto: true });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const png = (name = 'shot.png') => new File([PNG], name, { type: 'image/png' });

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
const imageNode = (id: string, extra: Record<string, unknown> = {}): Node => ({
  type: 'image',
  attrs: { src: `keel-file:${id}`, alt: 'Chart', ...extra },
});

function newRepo(): Repository {
  return createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: async () => fixtureSample(),
  });
}

/** Puts an image file in the store as one of the note's, and says its id. */
async function seed(repo: Repository, name = 'Chart.png', owner = OWNER) {
  const stored = await repo.files.add(
    WS,
    owner,
    { bytes: PNG.buffer.slice(0) as ArrayBuffer, type: 'image/png', name },
    { images: true },
  );
  return stored.id;
}

async function mount(
  over: Partial<NoteEditorProps> & { repo?: Repository } = {},
) {
  const { repo = newRepo(), ...props } = over;
  const onChange = vi.fn();
  const view = renderApp(
    <NoteEditor
      label="Note"
      value={docOf(para())}
      onChange={onChange}
      noteId="n-1"
      {...props}
    />,
    { repository: repo },
  );
  const textbox = await screen.findByRole('textbox', { name: 'Note' });
  const editor = (textbox as HTMLElement & { editor: Editor }).editor;
  return { repo, onChange, view, textbox, editor };
}

/** The image nodes of the note's body, in order. */
const images = (editor: Editor) => {
  const out: Node[] = [];
  editor.state.doc.descendants((n) => {
    if (n.type.name === 'image' || n.type.name === 'inlineImage')
      out.push({ type: n.type.name, attrs: n.attrs as Node['attrs'] });
  });
  return out;
};
const topLevel = (editor: Editor) =>
  ((editor.getJSON() as Node).content ?? []).map((n) => n.type);

const paste = pasteFiles;
function drop(editor: Editor, files: File[], pos: number) {
  vi.spyOn(editor.view, 'posAtCoords').mockReturnValue({ pos, inside: -1 });
  const event = new Event('drop', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'dataTransfer', {
    value: { files, types: ['Files'], getData: () => '' },
  });
  Object.defineProperty(event, 'clientX', { value: 10 });
  Object.defineProperty(event, 'clientY', { value: 10 });
  act(() => {
    editor.view.dom.dispatchEvent(event);
  });
  return event;
}

const stored = (repo: Repository, owner = OWNER) => repo.files.list(WS, owner);

// ---- storing ----------------------------------------------------------------

test('a pasted image is stored and referenced', async () => {
  const { repo, editor, onChange, textbox } = await mount();
  const event = paste(textbox, [png('EURUSD entry.png')]);
  expect(event.defaultPrevented).toBe(true);
  await waitFor(async () => expect(await stored(repo)).toHaveLength(1));
  const [file] = await stored(repo);
  // Owned by the note, and nothing of the picture is lost.
  expect(file).toMatchObject({
    owner: OWNER,
    type: 'image/png',
    name: 'EURUSD entry.png',
    size: PNG.length,
  });
  expect([
    ...new Uint8Array((await repo.files.get(WS, file!.id))!.bytes),
  ]).toEqual([...PNG]);
  // The body holds a reference, never the bytes.
  await waitFor(() => expect(images(editor)).toHaveLength(1));
  expect(images(editor)[0]).toMatchObject({
    type: 'image',
    attrs: { src: `keel-file:${file!.id}`, alt: 'EURUSD entry' },
  });
  const saved = JSON.stringify(onChange.mock.calls.at(-1)![0]);
  expect(saved).toContain(`keel-file:${file!.id}`);
  expect(saved).not.toContain('data:');
  // It shows, as a picture made from the stored bytes.
  expect(
    (await screen.findByRole('img', { name: 'EURUSD entry' })).getAttribute(
      'src',
    ),
  ).toBe('blob:note-1');
});

test('a pasted image with text beside it is left to the editor (a copied sheet)', async () => {
  const { repo, editor, textbox } = await mount();
  paste(textbox, [png()], 'Symbol\tP&L');
  await act(async () => {
    await new Promise((r) => setTimeout(r, 40));
  });
  expect(await stored(repo)).toHaveLength(0);
  expect(images(editor)).toHaveLength(0);
});

test('a dropped image is stored and goes where it was dropped', async () => {
  const { repo, editor } = await mount({
    value: docOf(para('one'), para('two')),
  });
  // Between the two paragraphs.
  drop(editor, [png('drop.png')], 5);
  await waitFor(async () => expect(await stored(repo)).toHaveLength(1));
  await waitFor(() => expect(images(editor)).toHaveLength(1));
  const kinds = topLevel(editor);
  expect(kinds.indexOf('image')).toBe(1);
  expect(kinds.slice(0, 3)).toEqual(['paragraph', 'image', 'paragraph']);
});

test('several pasted images are all stored, in order', async () => {
  const { repo, editor, textbox } = await mount();
  paste(textbox, [png('a.png'), png('b.png'), png('c.png')]);
  await waitFor(() => expect(images(editor)).toHaveLength(3));
  expect((await stored(repo)).map((f) => f.name)).toEqual([
    'a.png',
    'b.png',
    'c.png',
  ]);
  expect(images(editor).map((n) => n.attrs?.alt)).toEqual(['a', 'b', 'c']);
});

// ---- the Insert menu --------------------------------------------------------

async function openInsert() {
  const button = screen.getByRole('button', { name: 'Insert' });
  fireEvent.keyDown(button, { key: 'Enter' });
  await screen.findAllByRole('menu');
}
const picker = () =>
  document.querySelector('input[type="file"]') as HTMLInputElement;

test('the Insert menu offers Image and Inline image', async () => {
  await mount();
  await openInsert();
  expect(screen.getByRole('menuitem', { name: 'Image' })).toBeTruthy();
  expect(screen.getByRole('menuitem', { name: 'Inline image' })).toBeTruthy();
  // The picker takes the four image types, and several files.
  expect(picker().accept).toBe('image/png,image/jpeg,image/gif,image/webp');
  expect(picker().multiple).toBe(true);
});

test('Image picks files and puts each in as a block', async () => {
  const click = vi.spyOn(HTMLInputElement.prototype, 'click');
  const { repo, editor } = await mount({ value: docOf(para('Before')) });
  await openInsert();
  fireEvent.click(screen.getByRole('menuitem', { name: 'Image' }));
  expect(click).toHaveBeenCalledTimes(1);
  fireEvent.change(picker(), { target: { files: [png('plan.png')] } });
  await waitFor(() => expect(images(editor)).toHaveLength(1));
  expect(images(editor)[0]!.type).toBe('image');
  expect(await stored(repo)).toHaveLength(1);
  expect(topLevel(editor)).toContain('image');
});

test('Inline image puts the picture in the line of text', async () => {
  const { editor } = await mount({ value: docOf(para('Fills are in , done')) });
  editor.commands.setTextSelection(14);
  await openInsert();
  fireEvent.click(screen.getByRole('menuitem', { name: 'Inline image' }));
  fireEvent.change(picker(), { target: { files: [png('chip.png')] } });
  await waitFor(() => expect(images(editor)).toHaveLength(1));
  expect(images(editor)[0]!.type).toBe('inlineImage');
  // Still one paragraph, with the text before and after.
  const [only, ...rest] = (editor.getJSON() as Node).content!;
  expect(rest).toHaveLength(0);
  expect(only!.content!.map((n) => n.type)).toEqual([
    'text',
    'inlineImage',
    'text',
  ]);
});

test('a note that cannot take images has no Image in Insert', async () => {
  await mount({ noteId: undefined });
  await openInsert();
  expect(screen.queryByRole('menuitem', { name: 'Image' })).toBeNull();
  expect(screen.queryByRole('menuitem', { name: 'Inline image' })).toBeNull();
  expect(picker()).toBeNull();
});

// ---- refusals ----------------------------------------------------------------

test('a file that is not an image is refused, and says why', async () => {
  const { repo, editor, textbox } = await mount();
  paste(textbox, [new File(['%PDF'], 'plan.pdf', { type: 'application/pdf' })]);
  expect((await screen.findByRole('alert')).textContent).toContain(
    "plan.pdf isn't a PNG, JPEG, GIF or WebP image.",
  );
  expect(await stored(repo)).toHaveLength(0);
  expect(images(editor)).toHaveLength(0);
});

test('a file over 10 MB is refused before it is read', async () => {
  const { repo, editor, textbox } = await mount();
  const add = vi.spyOn(repo.files, 'add');
  paste(textbox, [
    new File([new Uint8Array(SHOT_MAX_BYTES + 1)], 'huge.png', {
      type: 'image/png',
    }),
  ]);
  expect((await screen.findByRole('alert')).textContent).toContain(
    'huge.png is over 10 MB.',
  );
  expect(add).not.toHaveBeenCalled();
  expect(images(editor)).toHaveLength(0);
});

test('a full browser store says it has no room', async () => {
  const { repo, textbox, editor } = await mount();
  vi.spyOn(repo.files, 'add').mockRejectedValueOnce(new FileRejected('quota'));
  paste(textbox, [png('big.png')]);
  expect((await screen.findByRole('alert')).textContent).toContain(
    "Couldn't save big.png. This browser has no room left.",
  );
  expect(images(editor)).toHaveLength(0);
});

test('any other failure says the file could not be saved', async () => {
  const { repo, textbox } = await mount();
  vi.spyOn(repo.files, 'add').mockRejectedValueOnce(new Error('disk'));
  paste(textbox, [png('x.png')]);
  expect((await screen.findByRole('alert')).textContent).toContain(
    "Couldn't save x.png.",
  );
});

test('one refused file does not stop the others', async () => {
  const { repo, editor, textbox } = await mount();
  paste(textbox, [
    new File(['x'], 'notes.txt', { type: 'text/plain' }),
    png('ok.png'),
  ]);
  expect((await screen.findByRole('alert')).textContent).toContain(
    "notes.txt isn't a PNG, JPEG, GIF or WebP image.",
  );
  await waitFor(() => expect(images(editor)).toHaveLength(1));
  expect((await stored(repo)).map((f) => f.name)).toEqual(['ok.png']);
});

test('a refusal can be dismissed, and the next attempt clears it', async () => {
  const { textbox } = await mount();
  paste(textbox, [new File(['x'], 'a.txt', { type: 'text/plain' })]);
  const alert = await screen.findByRole('alert');
  fireEvent.click(within(alert).getByRole('button', { name: 'Dismiss' }));
  expect(screen.queryByRole('alert')).toBeNull();
  paste(textbox, [new File(['x'], 'b.txt', { type: 'text/plain' })]);
  expect((await screen.findByRole('alert')).textContent).toContain('b.txt');
  paste(textbox, [png('fine.png')]);
  await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
});

// ---- the day lock -------------------------------------------------------------

async function lockedNote() {
  const M = 'mine';
  let clock = new Date('2026-11-18T13:47:00.000Z');
  let n = 0;
  const repo = createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    now: () => clock,
    newId: () => `id-${++n}`,
    sample: async () => fixtureSample(),
  });
  await repo.prefs.update({ timeZone: 'America/New_York' });
  clock = new Date('2026-11-19T13:47:00.000Z');
  const note = await repo.journal.dailyNote(M, '2026-11-19');
  const frozen: FrozenDay = {
    version: (await repo.tracker.get(M)).versions[0]!,
    inputs: {},
    ticks: {},
  };
  await repo.days.finish(M, '2026-11-19', frozen);
  await repo.workspaces.setActive(M);
  return { repo, note, M };
}

test('an image on a locked daily note is refused', async () => {
  const { repo, note, M } = await lockedNote();
  const { editor, textbox } = await mount({ repo, noteId: note.id });
  paste(textbox, [png('late.png')]);
  const alert = await screen.findByRole('alert');
  expect(alert.textContent).toContain(
    "This day is closed. Its note can't take",
  );
  // Nothing was stored, and nothing went into the note.
  expect(await repo.files.list(M, `note:${note.id}`)).toHaveLength(0);
  expect(images(editor)).toHaveLength(0);
});

test('the lock is said for a day that finishes while the note is open', async () => {
  const { textbox, repo } = await mount();
  vi.spyOn(repo.files, 'add').mockRejectedValueOnce(new LockedDayError());
  paste(textbox, [png()]);
  expect((await screen.findByRole('alert')).textContent).toContain(
    'This day is closed.',
  );
});

// ---- a note that is not stored yet --------------------------------------------

test('a note with no id yet is stored first, once, and owns the images', async () => {
  const ensureNoteId = vi.fn(async () => 'n-9');
  const { repo, editor, textbox } = await mount({
    noteId: undefined,
    ensureNoteId,
  });
  paste(textbox, [png('a.png'), png('b.png')]);
  await waitFor(() => expect(images(editor)).toHaveLength(2));
  expect(ensureNoteId).toHaveBeenCalledTimes(1);
  expect(await stored(repo, 'note:n-9')).toHaveLength(2);
});

test('a refused file does not store the note', async () => {
  const ensureNoteId = vi.fn(async () => 'n-9');
  const { textbox } = await mount({ noteId: undefined, ensureNoteId });
  paste(textbox, [new File(['x'], 'a.txt', { type: 'text/plain' })]);
  await screen.findByRole('alert');
  expect(ensureNoteId).not.toHaveBeenCalled();
});

test('a note that cannot be stored says so and inserts nothing', async () => {
  const ensureNoteId = vi.fn(async () => {
    throw new LockedDayError();
  });
  const { editor, textbox } = await mount({ noteId: undefined, ensureNoteId });
  paste(textbox, [png()]);
  expect((await screen.findByRole('alert')).textContent).toContain(
    'This day is closed.',
  );
  expect(images(editor)).toHaveLength(0);
});

// ---- showing an image ----------------------------------------------------------

test('a stored image shows from its reference, read when it is near the screen', async () => {
  const io = fakeIntersectionObserver();
  const repo = newRepo();
  const id = await seed(repo, 'Chart.png');
  const get = vi.spyOn(repo.files, 'get');
  await mount({ repo, value: docOf(para('Look'), imageNode(id)) });
  // The picture's place is held, and nothing is read yet.
  await act(async () => {
    await new Promise((r) => setTimeout(r, 40));
  });
  const holder = document.querySelector('[data-image]') as HTMLElement;
  expect(holder).not.toBeNull();
  expect(screen.queryByRole('img', { name: 'Chart' })).toBeNull();
  expect(get).not.toHaveBeenCalled();
  act(() => io.reveal());
  const img = await screen.findByRole('img', { name: 'Chart' });
  expect(img.getAttribute('src')).toBe('blob:note-1');
  expect(get).toHaveBeenCalledTimes(1);
  expect(img.getAttribute('loading')).toBe('lazy');
});

test('the object URL is revoked when the note closes', async () => {
  const repo = newRepo();
  const id = await seed(repo);
  const { view } = await mount({ repo, value: docOf(imageNode(id)) });
  await screen.findByRole('img', { name: 'Chart' });
  expect(URL.revokeObjectURL).not.toHaveBeenCalled();
  view.unmount();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:note-1');
});

test('a missing file shows a neutral placeholder, never a crash', async () => {
  await mount({ value: docOf(para('x'), imageNode('gone')) });
  expect(await screen.findByText('Image not found')).toBeTruthy();
  expect(screen.queryByRole('img', { name: 'Chart' })).toBeNull();
  // The rest of the note still works.
  expect(screen.getByText('x')).toBeTruthy();
});

test('a source that is not a stored file is never loaded', async () => {
  const bad = {
    type: 'image',
    attrs: { src: 'https://example.com/pixel.png', alt: 'Remote' },
  };
  const { view } = await mount({ value: docOf(bad) });
  expect(await screen.findByText('Image not found')).toBeTruthy();
  expect(view.container.querySelector('img')).toBeNull();
});

test('a file that fails to read says so in the placeholder', async () => {
  const repo = newRepo();
  const id = await seed(repo);
  vi.spyOn(repo.files, 'get').mockRejectedValue(new Error('disk'));
  await mount({ repo, value: docOf(imageNode(id)) });
  expect(await screen.findByText("Couldn't load this image")).toBeTruthy();
});

// ---- resizing --------------------------------------------------------------------

/** A layout for happy-dom: a 600px text column (the block the image sits in), and the image at 300px. */
function layout(frame = 300, column = 600) {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
    function (this: HTMLElement) {
      const width = this.matches('[data-image-frame]')
        ? frame
        : this.classList.contains('react-renderer') ||
            this.classList.contains('ProseMirror')
          ? column
          : 0;
      return {
        width,
        height: width / 2,
        left: 0,
        top: 0,
        right: width,
        bottom: width / 2,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      } as DOMRect;
    },
  );
}

async function selectedImage(extra: Record<string, unknown> = {}) {
  const repo = newRepo();
  const id = await seed(repo);
  const ctx = await mount({
    repo,
    value: docOf(para('Look'), imageNode(id, extra)),
  });
  await screen.findByRole('img', { name: 'Chart' });
  act(() => {
    ctx.editor.commands.setNodeSelection(6);
  });
  return { ...ctx, id };
}
const handle = (corner: string) =>
  document.querySelector(`[data-resize-handle="${corner}"]`) as HTMLElement;
const figure = () => document.querySelector('[data-image]') as HTMLElement;
const widthOf = (editor: Editor) =>
  images(editor)[0]!.attrs?.width as number | null | undefined;

test('a selected image shows its four corner handles; an unselected one shows none', async () => {
  const { editor } = await selectedImage();
  await waitFor(() =>
    expect(document.querySelectorAll('[data-resize-handle]')).toHaveLength(4),
  );
  act(() => {
    editor.commands.setTextSelection(2);
  });
  await waitFor(() =>
    expect(document.querySelectorAll('[data-resize-handle]')).toHaveLength(0),
  );
});

test('dragging a corner stores a width percentage', async () => {
  layout(300, 600);
  const { editor, onChange } = await selectedImage();
  await waitFor(() => expect(handle('br')).not.toBeNull());
  const before = onChange.mock.calls.length;
  fireEvent.pointerDown(handle('br'), { clientX: 100, pointerId: 1 });
  fireEvent.pointerMove(window, { clientX: 220, pointerId: 1 });
  // While the corner is held the picture follows it, and the note is not touched.
  await waitFor(() => expect(figure().style.width).toBe('70%'));
  expect(onChange.mock.calls.length).toBe(before);
  fireEvent.pointerUp(window, { clientX: 220, pointerId: 1 });
  await waitFor(() => expect(widthOf(editor)).toBe(70));
  expect(onChange.mock.calls.length).toBe(before + 1);
  expect(figure().style.width).toBe('70%');
});

test('a left corner grows the picture as it is dragged left', async () => {
  layout(300, 600);
  const { editor } = await selectedImage();
  await waitFor(() => expect(handle('tl')).not.toBeNull());
  fireEvent.pointerDown(handle('tl'), { clientX: 100, pointerId: 1 });
  fireEvent.pointerMove(window, { clientX: 40, pointerId: 1 });
  fireEvent.pointerUp(window, { clientX: 40, pointerId: 1 });
  await waitFor(() => expect(widthOf(editor)).toBe(60));
});

test('a width stays between 10 and 100 percent', async () => {
  layout(300, 600);
  const { editor } = await selectedImage();
  await waitFor(() => expect(handle('br')).not.toBeNull());
  fireEvent.pointerDown(handle('br'), { clientX: 100, pointerId: 1 });
  fireEvent.pointerUp(window, { clientX: 2000, pointerId: 1 });
  await waitFor(() => expect(widthOf(editor)).toBe(100));
  fireEvent.pointerDown(handle('br'), { clientX: 100, pointerId: 1 });
  fireEvent.pointerUp(window, { clientX: -5000, pointerId: 1 });
  await waitFor(() => expect(widthOf(editor)).toBe(10));
});

test('a stored width is drawn as that percentage of the column', async () => {
  await selectedImage({ width: 55 });
  expect(figure().style.width).toBe('55%');
});

test('a slider gives the keyboard the same resize', async () => {
  const { editor } = await selectedImage({ width: 80 });
  const slider = (await screen.findByRole('slider', {
    name: 'Image width',
  })) as HTMLInputElement;
  expect(slider.min).toBe('10');
  expect(slider.max).toBe('100');
  expect(slider.value).toBe('80');
  fireEvent.change(slider, { target: { value: '60' } });
  await waitFor(() => expect(widthOf(editor)).toBe(60));
  expect(figure().style.width).toBe('60%');
});

// ---- the caption ---------------------------------------------------------------------

test('a block image has a caption that edits and is stored', async () => {
  const { editor, onChange } = await selectedImage();
  const caption = (await screen.findByRole('textbox', {
    name: 'Image caption',
  })) as HTMLTextAreaElement;
  expect(caption.placeholder).toBe('Add a caption');
  fireEvent.change(caption, {
    target: { value: 'ES 5-minute, 24 Nov. The break held.' },
  });
  await waitFor(() =>
    expect(images(editor)[0]!.attrs?.caption).toBe(
      'ES 5-minute, 24 Nov. The break held.',
    ),
  );
  expect(caption.value).toBe('ES 5-minute, 24 Nov. The break held.');
  expect(JSON.stringify(onChange.mock.calls.at(-1)![0])).toContain(
    'The break held.',
  );
});

test('typing in the caption does not reach the note', async () => {
  const { editor } = await selectedImage();
  const caption = await screen.findByRole('textbox', {
    name: 'Image caption',
  });
  caption.focus();
  fireEvent.keyDown(caption, { key: 'a' });
  fireEvent.keyDown(caption, { key: 'Backspace' });
  // The body still has its paragraph and its image.
  expect(topLevel(editor).slice(0, 2)).toEqual(['paragraph', 'image']);
});

test('a caption is one line of words: a pasted line break becomes a space', async () => {
  const { editor } = await selectedImage();
  const caption = await screen.findByRole('textbox', {
    name: 'Image caption',
  });
  fireEvent.change(caption, { target: { value: 'First line\nsecond line' } });
  await waitFor(() =>
    expect(images(editor)[0]!.attrs?.caption).toBe('First line second line'),
  );
});

test('Enter in the caption moves on to the text after the image, adding nothing', async () => {
  const { editor } = await selectedImage();
  const caption = await screen.findByRole('textbox', {
    name: 'Image caption',
  });
  fireEvent.change(caption, { target: { value: 'ES 5m' } });
  await waitFor(() => expect(images(editor)[0]!.attrs?.caption).toBe('ES 5m'));
  const event = fireEvent.keyDown(caption, { key: 'Enter' });
  // Handled: the field does not get a new line.
  expect(event).toBe(false);
  expect(images(editor)[0]!.attrs?.caption).toBe('ES 5m');
  // The caret is now after the image (its trailing paragraph).
  const after = editor.state.selection.$from;
  expect(after.parent.type.name).toBe('paragraph');
  expect(after.pos).toBeGreaterThan(6);
});

test('an inline image has no caption', async () => {
  const repo = newRepo();
  const id = await seed(repo);
  await mount({
    repo,
    value: docOf({
      type: 'paragraph',
      content: [
        { type: 'text', text: 'See ' },
        { type: 'inlineImage', attrs: { src: `keel-file:${id}`, alt: 'Chip' } },
      ],
    }),
  });
  await screen.findByRole('img', { name: 'Chip' });
  expect(screen.queryByRole('textbox', { name: 'Image caption' })).toBeNull();
});

// ---- the viewer -----------------------------------------------------------------------

async function twoAndAnInline() {
  const repo = newRepo();
  const a = await seed(repo, 'First.png');
  const b = await seed(repo, 'Second.png');
  const c = await seed(repo, 'Third.png');
  // A fourth file the note owns but its body does not use.
  await seed(repo, 'Unused.png');
  const ctx = await mount({
    repo,
    value: docOf(
      imageNode(a, { alt: 'First' }),
      para('between'),
      imageNode(b, { alt: 'Second' }),
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'chip ' },
          {
            type: 'inlineImage',
            attrs: { src: `keel-file:${c}`, alt: 'Third' },
          },
        ],
      },
    ),
  });
  for (const name of ['First', 'Second', 'Third'])
    await screen.findByRole('img', { name });
  return ctx;
}

test('double-click opens the viewer on that image, among the note’s images only', async () => {
  await twoAndAnInline();
  fireEvent.doubleClick(screen.getByRole('img', { name: 'Second' }));
  const viewer = await screen.findByRole('dialog', { name: 'Image 2 of 3' });
  expect(viewer.textContent).toContain('Second');
  expect(
    await within(viewer).findByRole('img', { name: 'Second' }),
  ).toBeTruthy();
  // Next goes to the inline image; the unused file is not in the walk.
  fireEvent.click(within(viewer).getByRole('button', { name: 'Next' }));
  await screen.findByRole('dialog', { name: 'Image 3 of 3' });
  expect(
    (
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Next',
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  // The note's images cannot be deleted from the viewer.
  expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
});

test('Escape closes the viewer', async () => {
  await twoAndAnInline();
  fireEvent.doubleClick(screen.getByRole('img', { name: 'First' }));
  const viewer = await screen.findByRole('dialog', { name: 'Image 1 of 3' });
  fireEvent.keyDown(viewer, { key: 'Escape' });
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
});

test('a button on the image opens the viewer too, for the keyboard and for touch', async () => {
  await twoAndAnInline();
  fireEvent.click(
    screen.getByRole('button', { name: 'Open image larger, First' }),
  );
  await screen.findByRole('dialog', { name: 'Image 1 of 3' });
});

test('a missing image has nothing to enlarge', async () => {
  await mount({ value: docOf(imageNode('gone', { alt: 'Old' })) });
  fireEvent.doubleClick(await screen.findByText('Image not found'));
  await act(async () => {
    await new Promise((r) => setTimeout(r, 40));
  });
  expect(screen.queryByRole('dialog')).toBeNull();
});

// ---- reading only -----------------------------------------------------------------------

test('a read-only note shows its images without handles, slider or caption field', async () => {
  const repo = newRepo();
  const id = await seed(repo);
  const { editor } = await mount({
    repo,
    readOnly: true,
    value: docOf(imageNode(id, { caption: 'The break held.' })),
  });
  await screen.findByRole('img', { name: 'Chart' });
  expect(screen.queryByRole('toolbar')).toBeNull();
  act(() => {
    editor.commands.setNodeSelection(0);
  });
  expect(document.querySelectorAll('[data-resize-handle]')).toHaveLength(0);
  expect(screen.queryByRole('slider')).toBeNull();
  expect(screen.queryByRole('textbox', { name: 'Image caption' })).toBeNull();
  // The caption reads as text under the picture.
  expect(screen.getByText('The break held.').tagName).toBe('FIGCAPTION');
  // It still opens larger.
  fireEvent.doubleClick(screen.getByRole('img', { name: 'Chart' }));
  await screen.findByRole('dialog', { name: 'Image 1 of 1' });
});

test('a read-only image with no caption draws no caption line', async () => {
  const repo = newRepo();
  const id = await seed(repo);
  await mount({ repo, readOnly: true, value: docOf(imageNode(id)) });
  await screen.findByRole('img', { name: 'Chart' });
  expect(document.querySelector('figcaption')).toBeNull();
});

test('a read-only note takes no pasted image', async () => {
  const { repo, editor, textbox } = await mount({ readOnly: true });
  paste(textbox, [png()]);
  await act(async () => {
    await new Promise((r) => setTimeout(r, 40));
  });
  expect(await stored(repo)).toHaveLength(0);
  expect(images(editor)).toHaveLength(0);
});

// ---- files outlive the body ----------------------------------------------------------------

test('taking an image out of the note keeps its file (versions keep them)', async () => {
  const repo = newRepo();
  const id = await seed(repo);
  const { editor } = await mount({
    repo,
    value: docOf(para('Look'), imageNode(id)),
  });
  await screen.findByRole('img', { name: 'Chart' });
  act(() => {
    editor.chain().setNodeSelection(6).deleteSelection().run();
  });
  await waitFor(() => expect(images(editor)).toHaveLength(0));
  expect((await stored(repo)).map((f) => f.id)).toEqual([id]);
});
