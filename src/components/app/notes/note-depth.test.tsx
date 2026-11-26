// @vitest-environment happy-dom
// Task 21 on the editor itself: full screen, dictation, the history control,
// the version keeper and the template slot, as NoteEditor wires them.
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import type { Editor } from '@tiptap/core';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { MotionGlobalConfig } from 'motion/react';
import { DropdownMenu } from 'radix-ui';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { fixtureSample } from '@/data/__fixtures__/sample';
import { createLocalRepository } from '@/data/local/local-repository';
import type { Repository } from '@/data/repository';
import type { FrozenDay } from '@/domain/types';
import { fakeIntersectionObserver } from '../__fixtures__/intersection';
import { renderApp } from '../__fixtures__/render-app';
import { NoteEditor, type NoteEditorProps } from './note-editor';

vi.mock('next/navigation', () => import('../__fixtures__/navigation'));
MotionGlobalConfig.skipAnimations = true;

const M = 'mine';
const para = (text: string) => ({
  type: 'paragraph',
  content: [{ type: 'text', text }],
});
const doc = (...texts: string[]) => ({
  type: 'doc',
  content: texts.map(para),
});

beforeEach(() => {
  fakeIntersectionObserver({ auto: true });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

const editorOf = (textbox: HTMLElement) =>
  (textbox as HTMLElement & { editor: Editor }).editor;

// ---- full screen -------------------------------------------------------------

function bare(props: Partial<NoteEditorProps> = {}) {
  return render(
    <>
      <nav aria-label="The app">App chrome</nav>
      <main>
        <NoteEditor
          label="Trade note"
          value={doc('Held the plan')}
          onChange={() => {}}
          {...props}
        />
      </main>
    </>,
  );
}

const escape = (target: Element = document.activeElement ?? document.body) => {
  const event = new KeyboardEvent('keydown', {
    key: 'Escape',
    bubbles: true,
    cancelable: true,
  });
  act(() => {
    target.dispatchEvent(event);
  });
  return event;
};

test('Escape leaves full screen', async () => {
  bare();
  const textbox = await screen.findByRole('textbox', { name: 'Trade note' });
  expect(screen.queryByRole('dialog')).toBeNull();

  fireEvent.click(screen.getByRole('button', { name: 'Full screen' }));
  // The editor fills the window as a dialog of its own, the app behind it is
  // out of reach, and the text has the focus.
  const full = await screen.findByRole('dialog', {
    name: 'Trade note, full screen',
  });
  expect(full.getAttribute('aria-modal')).toBe('true');
  expect(full.contains(textbox)).toBe(true);
  expect(full.className).toContain('fixed');
  expect(
    screen.getByRole('navigation', { hidden: true }).hasAttribute('inert'),
  ).toBe(true);
  expect(document.activeElement).toBe(textbox);
  // The control that opened it now leaves it.
  expect(screen.queryByRole('button', { name: 'Full screen' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Exit full screen' })).toBeTruthy();

  escape();
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(screen.getByRole('navigation').hasAttribute('inert')).toBe(false);
  expect(screen.getByRole('button', { name: 'Full screen' })).toBeTruthy();
  // The note is where it was, and the caret is back in it.
  expect(screen.getByRole('textbox', { name: 'Trade note' })).toBe(textbox);
  expect(document.activeElement).toBe(textbox);
});

test('the control leaves full screen too, and a menu or a dialog on top keeps its own Escape', async () => {
  bare();
  await screen.findByRole('textbox', { name: 'Trade note' });
  fireEvent.click(screen.getByRole('button', { name: 'Full screen' }));
  await screen.findByRole('dialog', { name: 'Trade note, full screen' });

  // A menu is open over the note: Escape closes the menu and full screen stays.
  const format = screen.getByRole('button', { name: /^Format/ });
  fireEvent.keyDown(format, { key: 'Enter' });
  const menu = await screen.findByRole('menu');
  escape(menu);
  await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
  expect(
    screen.getByRole('dialog', { name: 'Trade note, full screen' }),
  ).toBeTruthy();

  // Nothing open: the next Escape leaves.
  escape(screen.getByRole('textbox', { name: 'Trade note' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

  // The control does it too.
  fireEvent.click(screen.getByRole('button', { name: 'Full screen' }));
  await screen.findByRole('dialog', { name: 'Trade note, full screen' });
  fireEvent.click(screen.getByRole('button', { name: 'Exit full screen' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
});

test('Escape in a field of the note, or with the slash list open, is not a way out of full screen', async () => {
  bare();
  const textbox = await screen.findByRole('textbox', { name: 'Trade note' });
  fireEvent.click(screen.getByRole('button', { name: 'Full screen' }));
  await screen.findByRole('dialog', { name: 'Trade note, full screen' });

  // The link address box has its own Escape (it closes the form).
  fireEvent.click(screen.getByRole('button', { name: 'Link' }));
  const address = await screen.findByRole('textbox', { name: 'Link address' });
  escape(address);
  expect(
    screen.getByRole('dialog', { name: 'Trade note, full screen' }),
  ).toBeTruthy();

  // The slash list is open: Escape closes it, not the full screen.
  const editor = editorOf(textbox);
  editor.commands.focus('end');
  act(() => {
    editor.commands.insertContent(' /ta');
  });
  await screen.findByRole('listbox');
  escape(textbox);
  await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull());
  expect(
    screen.getByRole('dialog', { name: 'Trade note, full screen' }),
  ).toBeTruthy();
  // And now nothing is open.
  escape(textbox);
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
});

test('full screen gives focus back to the control that was used from the keyboard', async () => {
  bare();
  await screen.findByRole('textbox', { name: 'Trade note' });
  const button = screen.getByRole('button', { name: 'Full screen' });
  act(() => button.focus());
  fireEvent.click(button);
  await screen.findByRole('dialog', { name: 'Trade note, full screen' });
  escape();
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(document.activeElement).toBe(
    screen.getByRole('button', { name: 'Full screen' }),
  );
});

test('a host inside a moved box can say no to full screen', async () => {
  bare({ canFullScreen: false });
  await screen.findByRole('toolbar', { name: 'Formatting' });
  expect(screen.queryByRole('button', { name: /full screen/i })).toBeNull();
});

test('a note that is read-only has no full screen', async () => {
  bare({ readOnly: true });
  await screen.findByRole('textbox', { name: 'Trade note' });
  expect(screen.queryByRole('button', { name: /full screen/i })).toBeNull();
});

// ---- dictation ---------------------------------------------------------------

class FakeRecognition {
  static last: FakeRecognition | undefined;
  continuous = false;
  interimResults = true;
  lang = '';
  started = 0;
  stopped = 0;
  onresult: ((e: unknown) => void) | null = null;
  onend: (() => void) | null = null;
  onerror: ((e: { error: string }) => void) | null = null;
  constructor() {
    FakeRecognition.last = this;
  }
  start() {
    this.started += 1;
  }
  stop() {
    this.stopped += 1;
    this.onend?.();
  }
  say(text: string) {
    this.onresult?.({
      resultIndex: 0,
      results: [Object.assign([{ transcript: text }], { isFinal: true })],
    });
  }
}

test('dictation is hidden when unsupported', async () => {
  bare();
  await screen.findByRole('toolbar', { name: 'Formatting' });
  expect(screen.queryByRole('button', { name: /^Dictate/ })).toBeNull();
  cleanup();

  vi.stubGlobal('webkitSpeechRecognition', FakeRecognition);
  bare();
  await screen.findByRole('toolbar', { name: 'Formatting' });
  expect(screen.getByRole('button', { name: /^Dictate/ })).toBeTruthy();
});

test('the microphone types what it hears at the caret, and stops when asked', async () => {
  vi.stubGlobal('webkitSpeechRecognition', FakeRecognition);
  const onChange = vi.fn();
  bare({ onChange });
  const textbox = await screen.findByRole('textbox', { name: 'Trade note' });
  const editor = editorOf(textbox);
  editor.commands.setTextSelection(editor.state.doc.content.size - 1);

  const mic = screen.getByRole('button', { name: /^Dictate/ });
  fireEvent.click(mic);
  const rec = FakeRecognition.last!;
  expect(rec.started).toBe(1);
  expect(mic.getAttribute('aria-pressed')).toBe('true');
  expect(screen.getByRole('status', { name: 'Dictation' }).textContent).toBe(
    'Listening',
  );

  // A phrase lands after the text with a space between; the next one likewise.
  act(() => rec.say('and sized down after'));
  act(() => rec.say('the first target'));
  expect(editor.getText()).toBe(
    'Held the plan and sized down after the first target',
  );
  expect(onChange).toHaveBeenCalled();

  fireEvent.click(mic);
  expect(rec.stopped).toBe(1);
  await waitFor(() => expect(mic.getAttribute('aria-pressed')).toBeNull());
  expect(screen.getByRole('status', { name: 'Dictation' }).textContent).toBe(
    '',
  );
});

test('dictation says why when the microphone is blocked, and stops with the editor', async () => {
  vi.stubGlobal('webkitSpeechRecognition', FakeRecognition);
  const view = bare();
  await screen.findByRole('textbox', { name: 'Trade note' });
  fireEvent.click(screen.getByRole('button', { name: /^Dictate/ }));
  const rec = FakeRecognition.last!;
  act(() => {
    rec.onerror?.({ error: 'not-allowed' });
    rec.onend?.();
  });
  expect((await screen.findByRole('alert')).textContent).toContain(
    "Keel can't use the microphone",
  );
  expect(
    screen
      .getByRole('button', { name: /^Dictate/ })
      .getAttribute('aria-pressed'),
  ).toBeNull();

  // Leaving the note while it listens stops the listening.
  fireEvent.click(screen.getByRole('button', { name: /^Dictate/ }));
  const second = FakeRecognition.last!;
  expect(second.stopped).toBe(0);
  view.unmount();
  expect(second.stopped).toBe(1);
});

// ---- the history control, the keeper and restore -------------------------------

function newRepo(now: () => Date = () => new Date()): Repository {
  return createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    now,
    sample: async () => fixtureSample(),
  });
}

async function storedNote(repo: Repository, text = 'stored text') {
  await repo.prefs.update({ timeZone: 'America/New_York' });
  const note = await repo.journal.save(M, {
    kind: 'note',
    title: 'Opening range',
    body: doc(text),
    linkedTradeIds: [],
    tags: ['playbook'],
  });
  await repo.workspaces.setActive(M);
  return note;
}

function app(repo: Repository, props: Partial<NoteEditorProps> = {}) {
  const onChange = vi.fn();
  const view = renderApp(
    <NoteEditor
      label="Note"
      value={doc('stored text')}
      onChange={onChange}
      {...props}
    />,
    { repository: repo },
  );
  return { view, onChange };
}

test('the history control is there for a stored note, and not for one with no id or no data', async () => {
  const repo = newRepo();
  const note = await storedNote(repo);
  app(repo, { noteId: note.id });
  await screen.findByRole('toolbar', { name: 'Formatting' });
  expect(screen.getByRole('button', { name: 'Version history' })).toBeTruthy();
  cleanup();

  // A note that cannot take an id (a template's body) has no history.
  app(repo);
  await screen.findByRole('toolbar', { name: 'Formatting' });
  expect(screen.queryByRole('button', { name: 'Version history' })).toBeNull();
  cleanup();

  // A note the host will store on its first change has the control; its history is empty.
  app(repo, { ensureNoteId: async () => note.id });
  await screen.findByRole('toolbar', { name: 'Formatting' });
  fireEvent.click(screen.getByRole('button', { name: 'Version history' }));
  expect(await screen.findByText('No earlier versions yet')).toBeTruthy();
  cleanup();

  // Without the app's data around, the editor still works and draws no history.
  render(
    <NoteEditor
      label="Bare"
      value={doc('x')}
      onChange={() => {}}
      noteId="n-1"
    />,
  );
  await screen.findByRole('toolbar', { name: 'Formatting' });
  expect(screen.queryByRole('button', { name: 'Version history' })).toBeNull();
});

test('a version is kept on leaving a note that was edited, and not on leaving one that was only read', async () => {
  const repo = newRepo();
  const note = await storedNote(repo);

  const read = app(repo, { noteId: note.id });
  await screen.findByRole('toolbar', { name: 'Formatting' });
  read.view.unmount();
  await new Promise((r) => setTimeout(r, 50));
  expect(await repo.noteVersions.list(M, note.id)).toEqual([]);

  const edit = app(repo, { noteId: note.id });
  const textbox = await screen.findByRole('textbox', { name: 'Note' });
  const editor = editorOf(textbox);
  act(() => {
    editor.commands.insertContentAt(
      editor.state.doc.content.size,
      para(' and more'),
    );
  });
  edit.view.unmount();
  await waitFor(async () =>
    expect(await repo.noteVersions.list(M, note.id)).toHaveLength(1),
  );
  const [kept] = await repo.noteVersions.list(M, note.id);
  expect(kept).toMatchObject({ kind: 'auto' });
  expect(JSON.stringify(kept!.body)).toContain('and more');
});

test('restoring from the history puts the version in the editor, tells you, and is not an edit', async () => {
  let t = new Date('2026-11-25T19:00:00.000Z');
  const repo = newRepo(() => t);
  const note = await storedNote(repo, 'the later text');
  await repo.noteVersions.keep(M, note.id, doc('the earlier text'), 'auto');
  t = new Date('2026-11-25T21:00:00.000Z');
  const { onChange } = app(repo, {
    noteId: note.id,
    value: doc('the later text'),
  });
  const textbox = await screen.findByRole('textbox', { name: 'Note' });
  await screen.findByRole('toolbar', { name: 'Formatting' });

  fireEvent.click(screen.getByRole('button', { name: 'Version history' }));
  const dialog = await screen.findByRole('dialog', { name: 'Version history' });
  expect(await within(dialog).findByText('the earlier text')).toBeTruthy();
  fireEvent.click(
    within(dialog).getByRole('button', { name: 'Restore this version' }),
  );
  const ask = await screen.findByRole('dialog', {
    name: 'Restore this version?',
  });
  await act(async () => {
    fireEvent.click(within(ask).getByRole('button', { name: 'Restore' }));
  });

  await waitFor(() =>
    expect(editorOf(textbox).getText()).toBe('the earlier text'),
  );
  // The store has it already, so the host is not asked to save it again.
  expect(onChange).not.toHaveBeenCalled();
  expect((await repo.journal.get(M, note.id))!.body).toEqual(
    doc('the earlier text'),
  );
  // And the person is told, in words that carry the version's time.
  await waitFor(() =>
    expect(
      screen.getByRole('status', { name: 'Version history' }).textContent,
    ).toContain('Restored the version from Wed 25 Nov, 14:00'),
  );
  // The editor stays one editor: no remount, same box.
  expect(screen.getByRole('textbox', { name: 'Note' })).toBe(textbox);
});

test("a finished day's note has a Version history button with no toolbar, and the dialog only reads", async () => {
  let t = new Date('2026-11-19T14:00:00.000Z');
  const repo = newRepo(() => t);
  await repo.prefs.update({ timeZone: 'America/New_York' });
  const note = await repo.journal.dailyNote(M, '2026-11-19');
  await repo.journal.save(M, { ...note, body: doc('plan') });
  await repo.noteVersions.keep(M, note.id, doc('plan'), 'auto');
  const frozen: FrozenDay = {
    version: (await repo.tracker.get(M)).versions[0]!,
    inputs: {},
    ticks: {},
  };
  await repo.days.finish(M, '2026-11-19', frozen);
  await repo.workspaces.setActive(M);
  t = new Date('2026-11-25T21:00:00.000Z');

  app(repo, { noteId: note.id, readOnly: true, value: doc('plan') });
  await screen.findByRole('textbox', { name: 'Note' });
  expect(screen.queryByRole('toolbar')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Version history' }));
  const dialog = await screen.findByRole('dialog', { name: 'Version history' });
  await within(dialog).findByRole('button', { name: '09:00' });
  expect(within(dialog).queryByRole('button', { name: /Restore/ })).toBeNull();
  expect(
    within(dialog).getByText(
      "This note is read only, so a version can't be restored.",
    ),
  ).toBeTruthy();
});

test('a read-only note with no stored id has no history to open', async () => {
  app(newRepo(), { readOnly: true });
  await screen.findByRole('textbox', { name: 'Note' });
  expect(screen.queryByRole('button', { name: 'Version history' })).toBeNull();
});

// ---- the template slot -----------------------------------------------------------

test("the template slot renders each host's menu inside the toolbar", async () => {
  const hosts = ['day card', 'day dialog', 'notebook pane'];
  for (const host of hosts) {
    cleanup();
    bare({
      templateSlot: ({ trigger }) => (
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>{trigger}</DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content>
              <DropdownMenu.Item>{`Templates of the ${host}`}</DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      ),
    });
    const toolbar = await screen.findByRole('toolbar', { name: 'Formatting' });
    const button = within(toolbar).getByRole('button', {
      name: 'Insert a template',
    });
    fireEvent.keyDown(button, { key: 'Enter' });
    expect(
      await screen.findByRole('menuitem', { name: `Templates of the ${host}` }),
    ).toBeTruthy();
  }
  // Read-only notes have no toolbar, and so no template control.
  cleanup();
  bare({ readOnly: true, templateSlot: ({ trigger }) => trigger });
  await screen.findByRole('textbox', { name: 'Trade note' });
  expect(
    screen.queryByRole('button', { name: 'Insert a template' }),
  ).toBeNull();
});
