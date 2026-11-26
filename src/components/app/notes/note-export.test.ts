// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import {
  NoteImportRefused,
  exportNote,
  importNote,
  noteFileName,
  noteFileOf,
  registerPrinter,
} from './note-export';

const para = (text: string) => ({
  type: 'paragraph',
  content: [{ type: 'text', text }],
});
const doc = (...content: unknown[]) => ({ type: 'doc', content });

const entry = {
  title: "ES opening range: what's working",
  tags: ['playbook', 'es'],
  body: doc(
    {
      type: 'heading',
      attrs: { level: 2, textAlign: null, indent: 0 },
      content: [{ type: 'text', text: 'Tuesday' }],
    },
    para('Long 2 on the break.'),
    { type: 'image', attrs: { src: 'keel-file:f-1', alt: 'Chart', width: 70 } },
    {
      type: 'timedList',
      content: [
        {
          type: 'timedItem',
          attrs: { time: '09:41' },
          content: [para('Long 2.')],
        },
      ],
    },
  ),
};

/** What the browser is told to download: the blob's text and the file name. */
function captureDownload() {
  const blobs: Blob[] = [];
  URL.createObjectURL = vi.fn((b: Blob) => {
    blobs.push(b);
    return 'blob:note';
  });
  URL.revokeObjectURL = vi.fn();
  const names: string[] = [];
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    names.push(this.download);
  });
  return {
    names,
    text: async () => blobs[0]!.text(),
    type: () => blobs[0]!.type,
  };
}

beforeEach(() => {
  document.body.innerHTML = '';
  // Only the clock the download waits on; blobs and promises run as they are.
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

test('export to a Keel note file and import it back', async () => {
  const sent = captureDownload();
  exportNote(entry, 'keel');

  const text = await sent.text();
  expect(sent.type()).toBe('application/json');
  expect(sent.names).toEqual(["ES opening range- what's working.json"]);
  // The file is Keel's own, version 1: kind, version, title, body, tags.
  expect(JSON.parse(text)).toEqual({
    kind: 'keel-note',
    version: 1,
    title: entry.title,
    body: entry.body,
    tags: entry.tags,
  });
  // The download link is gone, and the object URL is let go once the save has begun.
  expect(document.querySelector('a[download]')).toBeNull();
  expect(URL.revokeObjectURL).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1000);
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:note');

  const draft = await importNote(
    new File([text], sent.names[0]!, { type: 'application/json' }),
  );
  // A new plain note: the content comes back as it left, with no links to trades.
  expect(draft).toEqual({
    kind: 'note',
    title: entry.title,
    body: entry.body,
    tags: entry.tags,
    linkedTradeIds: [],
  });
});

test('a note file names no id, no folder and holds no image bytes', () => {
  const file = noteFileOf({
    ...entry,
    // Stray fields of a stored entry are never written out.
    ...({ id: 'n-1', workspaceId: 'mine', folderId: 'f-1' } as object),
  });
  expect(Object.keys(file).sort()).toEqual([
    'body',
    'kind',
    'tags',
    'title',
    'version',
  ]);
  expect(JSON.stringify(file)).not.toContain('base64');
});

test('the file name comes from the title and is safe to save', () => {
  expect(noteFileName('Daily review, Wed 25 Nov')).toBe(
    'Daily review, Wed 25 Nov.json',
  );
  expect(noteFileName('a/b\\c:d*e?f"g<h>i|j')).toBe('a-b-c-d-e-f-g-h-i-j.json');
  expect(noteFileName('   ')).toBe('Note.json');
  expect(noteFileName('x'.repeat(300))).toBe(`${'x'.repeat(80)}.json`);
});

test('PDF hands the note to the print layout and says when nothing can print', () => {
  expect(exportNote(entry, 'pdf')).toBe(false);
  const print = vi.fn();
  const first = registerPrinter(print);
  const other = vi.fn();
  const second = registerPrinter(other);
  // The layout mounted last takes it.
  expect(exportNote(entry, 'pdf')).toBe(true);
  expect(other).toHaveBeenCalledWith(entry);
  expect(print).not.toHaveBeenCalled();
  second();
  expect(exportNote(entry, 'pdf')).toBe(true);
  expect(print).toHaveBeenCalledTimes(1);
  first();
  expect(exportNote(entry, 'pdf')).toBe(false);
});

const file = (text: string, name = 'note.json') => new File([text], name);
const refused = async (f: File | Blob) => {
  const error = await importNote(f).then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(NoteImportRefused);
  return (error as NoteImportRefused).message;
};
const fileOf = (over: Record<string, unknown>) =>
  file(
    JSON.stringify({
      kind: 'keel-note',
      version: 1,
      title: 'T',
      body: doc(para('x')),
      tags: [],
      ...over,
    }),
  );

test('import refuses what is not a Keel note, with a plain message', async () => {
  const messages = [
    await refused(file('not json at all')),
    await refused(file('[]')),
    await refused(file('{"kind":"keel-trades","version":1}')),
    await refused(fileOf({ version: 2 })),
    await refused(fileOf({ version: undefined })),
    await refused(fileOf({ title: 12 })),
    await refused(fileOf({ tags: 'es' })),
    await refused(fileOf({ tags: ['es', 3] })),
    await refused(fileOf({ body: 'text' })),
    await refused(fileOf({ body: { type: 'paragraph' } })),
    await refused(fileOf({ body: { type: 'doc', content: 'nope' } })),
    // A node this editor does not have would open as an empty note.
    await refused(fileOf({ body: doc({ type: 'hologram' }) })),
    // A node in the wrong place is not a note either.
    await refused(fileOf({ body: doc({ type: 'text', text: 'loose' }) })),
  ];
  for (const m of messages) {
    expect(m.length).toBeGreaterThan(10);
    // Keel's own words: a sentence, no dashes, nothing about JSON.
    expect(m).not.toMatch(/[–—]|json/i);
  }
  expect(messages[0]).toBe("That file isn't a Keel note.");
  // A newer file says so, and the others do not blame the version.
  expect(messages[3]).toBe(
    'That note was made by a newer version of Keel, so this one cannot read it.',
  );
});

test('import refuses a file too large to be a note', async () => {
  const big = new Blob([new Uint8Array(5 * 1024 * 1024 + 1)]);
  expect(await refused(big)).toBe('That file is too large to be a Keel note.');
});

test('import tidies the title and the tags', async () => {
  const draft = await importNote(
    fileOf({
      title: '   ',
      tags: ['  ES ', 'es', '#Playbook', '', 'x'.repeat(60)],
    }),
  );
  // An empty title is a title Keel can show; tags are lowercase, trimmed, once each.
  expect(draft.title).toBe('Untitled note');
  expect(draft.tags).toEqual(['es', 'playbook', 'x'.repeat(40)]);
  const long = await importNote(fileOf({ title: 'y'.repeat(300) }));
  expect(long.title).toHaveLength(200);
});

test('an imported note keeps the nodes this editor knows', async () => {
  const body = doc(
    {
      type: 'columns',
      content: [
        { type: 'column', content: [para('a')] },
        { type: 'column', content: [para('b')] },
      ],
    },
    { type: 'pageBreak' },
    {
      type: 'paragraph',
      content: [
        { type: 'tradeLink', attrs: { tradeId: 't-1' } },
        { type: 'inlineMath', attrs: { latex: 'x^2' } },
      ],
    },
  );
  const draft = await importNote(fileOf({ body }));
  expect(draft.body).toEqual(body);
});
