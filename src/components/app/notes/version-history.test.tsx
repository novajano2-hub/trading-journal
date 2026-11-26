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
import { useRef, useState } from 'react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { fixtureSample } from '@/data/__fixtures__/sample';
import { createLocalRepository } from '@/data/local/local-repository';
import type { Repository } from '@/data/repository';
import type { FrozenDay, JournalEntry } from '@/domain/types';
import { fakeIntersectionObserver } from '../__fixtures__/intersection';
import { renderApp } from '../__fixtures__/render-app';
import { NotePreview } from './note-editor';
import { VersionHistory } from './version-history';

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

/** The clock the repository stamps versions with; the test moves it. */
let clock = new Date('2026-11-25T21:00:00.000Z');

beforeEach(() => {
  fakeIntersectionObserver({ auto: true });
  vi.useFakeTimers({ toFake: ['Date'], now: clock });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function newRepo(): Repository {
  return createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    now: () => clock,
    sample: async () => fixtureSample(),
  });
}
const at = (iso: string) => {
  clock = new Date(iso);
};

/** A stored note with its versions kept at the given instants (New York is UTC-5 in November). */
async function seed(repo: Repository) {
  await repo.prefs.update({ timeZone: 'America/New_York' });
  at('2026-11-23T23:00:00.000Z');
  const note = await repo.journal.save(M, {
    kind: 'note',
    title: "ES opening range: what's working",
    body: doc('Mon text'),
    linkedTradeIds: [],
    tags: ['playbook'],
  });
  at('2026-11-23T23:12:00.000Z');
  await repo.noteVersions.keep(M, note.id, doc('Mon text'), 'auto');
  at('2026-11-24T22:05:00.000Z');
  await repo.noteVersions.keep(M, note.id, doc('Tue evening'), 'auto');
  at('2026-11-25T19:20:00.000Z');
  await repo.noteVersions.keep(M, note.id, doc('Wed 14:20'), 'auto');
  at('2026-11-25T20:58:00.000Z');
  await repo.noteVersions.keep(M, note.id, doc('Wed 15:58'), 'before-restore');
  at('2026-11-25T21:00:00.000Z');
  await repo.workspaces.setActive(M);
  return note;
}

function Harness(props: {
  noteId: string | undefined;
  readOnly?: boolean;
  current?: unknown;
  onRestored?: (e: JournalEntry) => void;
}) {
  const [open, setOpen] = useState(true);
  const opener = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button ref={opener} onClick={() => setOpen(true)}>
        Open history
      </button>
      <VersionHistory
        noteId={props.noteId}
        readOnly={props.readOnly ?? false}
        open={open}
        onOpenChange={setOpen}
        origin={opener}
        returnFocus={opener}
        current={props.current ?? doc('Right now')}
        preview={(body) => <NotePreview body={body} label="Version preview" />}
        onRestored={props.onRestored ?? (() => {})}
      />
    </>
  );
}

async function mount(
  repo: Repository,
  props: Parameters<typeof Harness>[0],
): Promise<HTMLElement> {
  renderApp(<Harness {...props} />, { repository: repo });
  return screen.findByRole('dialog', { name: 'Version history' });
}

test('with no earlier version it says so, and offers nothing to restore', async () => {
  const repo = newRepo();
  await repo.prefs.update({ timeZone: 'America/New_York' });
  const note = await repo.journal.save(M, {
    kind: 'note',
    title: 'Fresh',
    body: doc('x'),
    linkedTradeIds: [],
    tags: [],
  });
  await repo.workspaces.setActive(M);
  const dialog = await mount(repo, { noteId: note.id });
  expect(
    await within(dialog).findByText('No earlier versions yet'),
  ).toBeTruthy();
  expect(within(dialog).queryByRole('button', { name: /Restore/ })).toBeNull();
  // A note that is not stored yet has no versions either.
  cleanup();
  const none = await mount(repo, { noteId: undefined });
  expect(await within(none).findByText('No earlier versions yet')).toBeTruthy();
});

test('it lists Current, then the versions by day with their times, and marks a "before restore"', async () => {
  const repo = newRepo();
  const note = await seed(repo);
  const dialog = await mount(repo, { noteId: note.id });
  // The note's title and the 30 days, as the header's line.
  expect(
    await within(dialog).findByText(
      "ES opening range: what's working. Versions are kept for 30 days.",
    ),
  ).toBeTruthy();
  await within(dialog).findByRole('button', { name: '14:20' });

  const nav = within(dialog).getByRole('navigation', { name: 'Versions' });
  // Current first, then the days as headings and each day's times, newest first.
  expect(nav.textContent).toBe(
    [
      'CurrentNow',
      'Today',
      '15:58Before restore',
      '14:20',
      'Yesterday',
      '17:05',
      'Mon 23 Nov',
      '18:12',
    ].join(''),
  );
});

test('the newest version is open in a read-only preview, and choosing another changes it', async () => {
  const repo = newRepo();
  const note = await seed(repo);
  const dialog = await mount(repo, { noteId: note.id });
  const newest = await within(dialog).findByRole('button', { name: /^15:58/ });
  expect(newest.getAttribute('aria-current')).toBe('true');
  // The preview is the version's own text, not editable, with no toolbar.
  const preview = await within(dialog).findByText('Wed 15:58');
  const box = preview.closest('[role="textbox"]')!;
  expect(box.getAttribute('contenteditable')).toBe('false');
  expect(within(dialog).queryByRole('toolbar')).toBeNull();
  expect(within(dialog).getByText('Wed 25 Nov, 15:58')).toBeTruthy();
  expect(within(dialog).getByText('Read only')).toBeTruthy();

  fireEvent.click(within(dialog).getByRole('button', { name: '17:05' }));
  expect(await within(dialog).findByText('Tue evening')).toBeTruthy();
  expect(within(dialog).getByText('Tue 24 Nov, 17:05')).toBeTruthy();
  expect(
    within(dialog)
      .getByRole('button', { name: '17:05' })
      .getAttribute('aria-current'),
  ).toBe('true');
  expect(within(dialog).queryByText('Wed 15:58')).toBeNull();

  // Current previews the text the editor holds now.
  fireEvent.click(within(dialog).getByRole('button', { name: /^Current/ }));
  expect(await within(dialog).findByText('Right now')).toBeTruthy();
  // There is nothing to restore from Current.
  expect(
    within(dialog).queryByRole('button', { name: 'Restore this version' }),
  ).toBeNull();
});

test('restore asks first, and does nothing until it is confirmed', async () => {
  const repo = newRepo();
  const note = await seed(repo);
  const onRestored = vi.fn();
  const dialog = await mount(repo, { noteId: note.id, onRestored });
  fireEvent.click(await within(dialog).findByRole('button', { name: '14:20' }));
  expect(
    within(dialog).getByText(
      'Restoring saves the current note as a version first.',
    ),
  ).toBeTruthy();
  fireEvent.click(
    within(dialog).getByRole('button', { name: 'Restore this version' }),
  );

  const ask = await screen.findByRole('dialog', {
    name: 'Restore this version?',
  });
  // It says what stays: the title and tags are not touched, and the text is kept first.
  expect(ask.textContent).toContain('Wed 25 Nov, 14:20');
  expect(ask.textContent).toMatch(/title and tags/);
  fireEvent.click(within(ask).getByRole('button', { name: 'Cancel' }));
  await waitFor(() =>
    expect(
      screen.queryByRole('dialog', { name: 'Restore this version?' }),
    ).toBeNull(),
  );
  expect((await repo.journal.get(M, note.id))!.body).toEqual(doc('Mon text'));
  expect(onRestored).not.toHaveBeenCalled();

  fireEvent.click(
    within(dialog).getByRole('button', { name: 'Restore this version' }),
  );
  const again = await screen.findByRole('dialog', {
    name: 'Restore this version?',
  });
  await act(async () => {
    fireEvent.click(within(again).getByRole('button', { name: 'Restore' }));
  });

  // The note has the version's text, its title and tags as they were, and the
  // text it had is kept as "before restore".
  await waitFor(async () =>
    expect((await repo.journal.get(M, note.id))!.body).toEqual(
      doc('Wed 14:20'),
    ),
  );
  const stored = (await repo.journal.get(M, note.id))!;
  expect(stored).toMatchObject({
    title: "ES opening range: what's working",
    tags: ['playbook'],
  });
  const kept = await repo.noteVersions.list(M, note.id);
  expect(kept[0]).toMatchObject({
    kind: 'before-restore',
    body: doc('Mon text'),
  });
  // The host hears of it, and the history closes.
  await waitFor(() => expect(onRestored).toHaveBeenCalledTimes(1));
  expect(onRestored.mock.calls[0]![0]).toMatchObject({
    id: note.id,
    body: doc('Wed 14:20'),
  });
  await waitFor(() =>
    expect(
      screen.queryByRole('dialog', { name: 'Version history' }),
    ).toBeNull(),
  );
});

async function lockedNote(repo: Repository) {
  await repo.prefs.update({ timeZone: 'America/New_York' });
  at('2026-11-19T14:00:00.000Z');
  const note = await repo.journal.dailyNote(M, '2026-11-19');
  await repo.journal.save(M, { ...note, body: doc('plan') });
  await repo.noteVersions.keep(M, note.id, doc('plan'), 'auto');
  await repo.journal.save(M, { ...note, body: doc('after') });
  const frozen: FrozenDay = {
    version: (await repo.tracker.get(M)).versions[0]!,
    inputs: {},
    ticks: {},
  };
  await repo.days.finish(M, '2026-11-19', frozen);
  at('2026-11-25T21:00:00.000Z');
  await repo.workspaces.setActive(M);
  return note;
}

test("a locked daily note's history is read-only and restore is refused", async () => {
  const repo = newRepo();
  const note = await lockedNote(repo);

  // Read-only: the versions list and preview, no Restore, and the reason.
  const dialog = await mount(repo, { noteId: note.id, readOnly: true });
  await within(dialog).findByRole('button', { name: '09:00' });
  expect(await within(dialog).findByText('plan')).toBeTruthy();
  expect(within(dialog).queryByRole('button', { name: /Restore/ })).toBeNull();
  expect(
    within(dialog).getByText(
      "This note is read only, so a version can't be restored.",
    ),
  ).toBeTruthy();

  // Even where a host forgot to say read-only, the store refuses and the
  // dialog says why: nothing changes and no "before restore" appears.
  cleanup();
  const stale = await mount(repo, { noteId: note.id, readOnly: false });
  fireEvent.click(
    await within(stale).findByRole('button', { name: 'Restore this version' }),
  );
  const ask = await screen.findByRole('dialog', {
    name: 'Restore this version?',
  });
  await act(async () => {
    fireEvent.click(within(ask).getByRole('button', { name: 'Restore' }));
  });
  expect(
    await within(ask).findByText(
      "This day is closed, so its note can't be restored.",
    ),
  ).toBeTruthy();
  expect((await repo.journal.get(M, note.id))!.body).toEqual(doc('after'));
  expect(await repo.noteVersions.list(M, note.id)).toHaveLength(1);
});

test('closing gives focus back to the control that opened it', async () => {
  const repo = newRepo();
  const note = await seed(repo);
  const dialog = await mount(repo, { noteId: note.id });
  await within(dialog).findByRole('button', { name: '14:20' });
  // Focus is inside the dialog, on its first control.
  expect(dialog.contains(document.activeElement)).toBe(true);
  // The footer's Close (the header's X is named Close too).
  fireEvent.click(
    within(dialog).getAllByRole('button', { name: 'Close' }).at(-1)!,
  );
  await waitFor(() =>
    expect(
      screen.queryByRole('dialog', { name: 'Version history' }),
    ).toBeNull(),
  );
  await waitFor(() =>
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Open history' }),
    ),
  );
});
