// @vitest-environment happy-dom
import {
  act,
  cleanup,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { MotionGlobalConfig } from 'motion/react';
import { useState } from 'react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { fixtureSample } from '@/data/__fixtures__/sample';
import { createLocalRepository } from '@/data/local/local-repository';
import type { Repository } from '@/data/repository';
import { fakeIntersectionObserver } from '../__fixtures__/intersection';
import { renderApp } from '../__fixtures__/render-app';
import { noteFileOf } from './note-export';
import { NoteMenu } from './note-menu';

vi.mock('next/navigation', () => import('../__fixtures__/navigation'));
MotionGlobalConfig.skipAnimations = true;

const M = 'mine';
const doc = (...texts: string[]) => ({
  type: 'doc',
  content: texts.map((t) => ({
    type: 'paragraph',
    content: [{ type: 'text', text: t }],
  })),
});

beforeEach(() => {
  fakeIntersectionObserver({ auto: true });
  URL.createObjectURL = vi.fn(() => 'blob:note');
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

async function newRepo(): Promise<Repository> {
  const repo = createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: async () => fixtureSample(),
  });
  await repo.prefs.update({ timeZone: 'America/New_York' });
  await repo.workspaces.setActive(M);
  return repo;
}

const NOTE = {
  title: 'Opening range',
  tags: ['playbook'],
  body: doc('Long 2 on the break.'),
};

function mount(
  repo: Repository,
  props: Partial<React.ComponentProps<typeof NoteMenu>> = {},
) {
  const read = vi.fn(() => NOTE);
  renderApp(<NoteMenu read={read} {...props} />, { repository: repo });
  return { read };
}

async function open() {
  const button = await screen.findByRole('button', {
    name: 'Export or import',
  });
  fireEvent.keyDown(button, { key: 'Enter' });
  return screen.findByRole('menu');
}

test('the menu offers both exports and an import', async () => {
  mount(await newRepo());
  const menu = await open();
  expect(
    within(menu)
      .getAllByRole('menuitem')
      .map((i) => i.textContent),
  ).toEqual(['Export as PDF', 'Export as Keel note', 'Import a Keel note']);
  // A closing menu takes no pointer, inside a dialog too.
  expect(menu.className).toContain('data-[state=closed]:pointer-events-none!');
});

test('Export as Keel note downloads the note as it stands now', async () => {
  const blobs: Blob[] = [];
  URL.createObjectURL = vi.fn((b: Blob) => {
    blobs.push(b);
    return 'blob:note';
  });
  const names: string[] = [];
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    names.push(this.download);
  });
  const { read } = mount(await newRepo());
  const menu = await open();
  fireEvent.click(
    within(menu).getByRole('menuitem', { name: 'Export as Keel note' }),
  );
  await waitFor(() => expect(names).toEqual(['Opening range.json']));
  // Read when chosen, so the file is the text on screen and not the stored copy.
  expect(read).toHaveBeenCalledTimes(1);
  expect(JSON.parse(await blobs[0]!.text())).toEqual(noteFileOf(NOTE));
});

test('Export as PDF draws the note into a hidden print layout and opens the print dialog', async () => {
  const print = vi.fn();
  window.print = print;
  mount(await newRepo());
  const menu = await open();
  fireEvent.click(
    within(menu).getByRole('menuitem', { name: 'Export as PDF' }),
  );

  const layout = await waitFor(() => {
    const el = document.getElementById('print-note');
    expect(el).not.toBeNull();
    return el!;
  });
  // A direct child of the page, set apart from the app, and not for a screen reader.
  expect(layout.parentElement).toBe(document.body);
  expect(layout.getAttribute('aria-hidden')).toBe('true');
  expect(layout.hasAttribute('data-print-root')).toBe(true);
  expect(
    within(layout).getByRole('heading', {
      name: 'Opening range',
      hidden: true,
    }),
  ).toBeTruthy();
  expect(await within(layout).findByText('Long 2 on the break.')).toBeTruthy();
  // The note is drawn read-only, with no toolbar.
  expect(within(layout).queryByRole('toolbar')).toBeNull();
  await waitFor(() => expect(print).toHaveBeenCalledTimes(1));

  // When the print dialog is done the layout goes.
  act(() => {
    window.dispatchEvent(new Event('afterprint'));
  });
  await waitFor(() => expect(document.getElementById('print-note')).toBeNull());
});

test('a re-render does not print twice, and asking again prints the new note', async () => {
  const print = vi.fn();
  window.print = print;
  const read = vi.fn(() => NOTE);
  function Surface() {
    const [n, setN] = useState(0);
    return (
      <>
        <button onClick={() => setN(n + 1)}>Re-render {n}</button>
        <NoteMenu read={read} />
      </>
    );
  }
  renderApp(<Surface />, { repository: await newRepo() });
  const exportPdf = async () => {
    fireEvent.keyDown(
      await screen.findByRole('button', { name: 'Export or import' }),
      { key: 'Enter' },
    );
    fireEvent.click(
      await screen.findByRole('menuitem', { name: 'Export as PDF' }),
    );
  };
  await exportPdf();
  await waitFor(() => expect(print).toHaveBeenCalledTimes(1));

  // The print dialog is still open (no afterprint yet) and the page re-renders.
  fireEvent.click(screen.getByRole('button', { name: /^Re-render/ }));
  await new Promise((r) => setTimeout(r, 350));
  expect(print).toHaveBeenCalledTimes(1);

  // Asking for another PDF draws that note and prints it.
  read.mockReturnValue({ ...NOTE, title: 'Second note' });
  await exportPdf();
  await waitFor(() => expect(print).toHaveBeenCalledTimes(2));
  expect(
    within(document.getElementById('print-note')!).getByRole('heading', {
      name: 'Second note',
      hidden: true,
    }),
  ).toBeTruthy();
  expect(document.querySelectorAll('#print-note')).toHaveLength(1);
});

async function printWith(body: unknown, repo: Repository) {
  const print = vi.fn();
  window.print = print;
  renderApp(<NoteMenu read={() => ({ ...NOTE, body })} />, {
    repository: repo,
  });
  fireEvent.keyDown(
    await screen.findByRole('button', { name: 'Export or import' }),
    { key: 'Enter' },
  );
  fireEvent.click(
    await screen.findByRole('menuitem', { name: 'Export as PDF' }),
  );
  return print;
}
const image = (id: string) => ({
  type: 'doc',
  content: [
    {
      type: 'image',
      attrs: { src: `keel-file:${id}`, alt: 'Chart', width: 70 },
    },
  ],
});

test('the print layout does not wait on a picture that is not stored', async () => {
  // It settles as "Image not found" at once, and the page is printed.
  const print = await printWith(image('gone'), await newRepo());
  await waitFor(() => expect(print).toHaveBeenCalledTimes(1));
  expect(
    within(document.getElementById('print-note')!).getByText('Image not found'),
  ).toBeTruthy();
});

test('the print layout waits for a picture that is still loading, but not for ever', async () => {
  const repo = await newRepo();
  const stored = await repo.files.add(
    M,
    'note:n-1',
    {
      bytes: new Uint8Array([137, 80, 78, 71]).buffer as ArrayBuffer,
      type: 'image/png',
      name: 'chart.png',
    },
    { images: true },
  );
  // A picture whose bytes are on the way: its element reports not complete.
  const original = Object.getOwnPropertyDescriptor(
    HTMLImageElement.prototype,
    'complete',
  )!;
  Object.defineProperty(HTMLImageElement.prototype, 'complete', {
    configurable: true,
    get: () => false,
  });
  try {
    const print = await printWith(image(stored.id), repo);
    const layout = await waitFor(() => {
      const el = document.getElementById('print-note');
      expect(el?.querySelector('img')).not.toBeNull();
      return el!;
    });
    // Drawn eagerly (no waiting to scroll into view), and not printed yet.
    expect(layout.querySelector('img')!.getAttribute('loading')).toBe('eager');
    await new Promise((r) => setTimeout(r, 350));
    expect(print).not.toHaveBeenCalled();
    // Ten seconds on, it prints what it has.
    const real = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(real + 11_000);
    await waitFor(() => expect(print).toHaveBeenCalledTimes(1));
  } finally {
    Object.defineProperty(HTMLImageElement.prototype, 'complete', original);
  }
});

const fileOf = (note: unknown, name = 'note.json') =>
  new File([JSON.stringify(note)], name, { type: 'application/json' });

async function pick(file: File) {
  const menu = await open();
  // The item opens the file chooser; the chooser's answer arrives as a change.
  const chooser = vi.spyOn(HTMLInputElement.prototype, 'click');
  fireEvent.click(
    within(menu).getByRole('menuitem', { name: 'Import a Keel note' }),
  );
  await waitFor(() => expect(chooser).toHaveBeenCalled());
  const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
  expect(input.accept).toContain('.json');
  expect(input.getAttribute('aria-label')).toBe('Keel note file');
  fireEvent.change(input, { target: { files: [file] } });
}

test('Import a Keel note stores a new note in the folder and hands it to the host', async () => {
  const repo = await newRepo();
  const folder = await repo.folders.create(M, 'Playbook');
  const onImported = vi.fn();
  mount(repo, { folderId: folder.id, onImported });
  await pick(fileOf(noteFileOf({ ...NOTE, title: 'From elsewhere' })));

  await waitFor(() => expect(onImported).toHaveBeenCalledTimes(1));
  const entry = onImported.mock.calls[0]![0];
  const stored = (await repo.journal.list(M)).filter(
    (e) => e.title === 'From elsewhere',
  );
  expect(stored).toHaveLength(1);
  expect(stored[0]).toMatchObject({
    id: entry.id,
    kind: 'note',
    folderId: folder.id,
    tags: ['playbook'],
    linkedTradeIds: [],
    body: NOTE.body,
  });
  // Dated on the day it was brought in, in the trader's zone, like any new note.
  expect(stored[0]!.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
});

test('without a host to open it, an imported note is announced with a way to it', async () => {
  const repo = await newRepo();
  mount(repo);
  await pick(fileOf(noteFileOf({ ...NOTE, title: 'From elsewhere' })));
  const done = await screen.findByRole('dialog', { name: 'Note imported' });
  const link = within(done).getByRole('link', { name: 'Open note' });
  const [stored] = (await repo.journal.list(M)).filter(
    (e) => e.title === 'From elsewhere',
  );
  expect(link.getAttribute('href')).toBe(`/app/notebook/${stored!.id}`);
  expect(done.textContent).toContain('From elsewhere');
  fireEvent.click(within(done).getByRole('button', { name: 'Close' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
});

test('a file that is not a Keel note is refused in plain words, and nothing is stored', async () => {
  const repo = await newRepo();
  const before = (await repo.journal.list(M)).length;
  mount(repo);
  await pick(fileOf({ kind: 'keel-trades', version: 1 }, 'trades.json'));
  const refused = await screen.findByRole('alertdialog', {
    name: "Couldn't import that file",
  });
  expect(refused.textContent).toContain("That file isn't a Keel note.");
  fireEvent.click(within(refused).getByRole('button', { name: 'Close' }));
  await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  expect((await repo.journal.list(M)).length).toBe(before);
  // The chooser is ready for the same file again.
  expect(
    document.querySelector<HTMLInputElement>('input[type="file"]')!.value,
  ).toBe('');
});
