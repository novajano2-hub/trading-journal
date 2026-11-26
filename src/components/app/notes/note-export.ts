// Taking a note out of Keel and bringing one in (B40). "Keel note" is a small
// JSON file, one note at a time: its title, body and tags. A body names the
// note's images by reference (`keel-file:<id>`); the pictures are not in the
// file, so they come back where the same workspace still has them. "PDF" is
// the browser's print dialog on a print layout (`print-host.tsx` draws it).
import { getSchema } from '@tiptap/core';
import type { Schema } from '@tiptap/pm/model';
import type { JournalDraft } from '@/data/repository';
import { noteExtensions } from './extensions';

export const NOTE_FILE_KIND = 'keel-note';
export const NOTE_FILE_VERSION = 1;
/** A bigger file is not a note: a body is text, and images are not in it. */
export const NOTE_FILE_MAX_BYTES = 5 * 1024 * 1024;
const TITLE_MAX = 200;
const TAG_MAX = 40;
const TAGS_MAX = 50;
const NAME_MAX = 80;

/** What an export reads from a note. */
export interface ExportedNote {
  title: string;
  body: unknown;
  tags: readonly string[];
}

/** Keel's note file. */
export interface NoteFile {
  kind: typeof NOTE_FILE_KIND;
  version: typeof NOTE_FILE_VERSION;
  title: string;
  body: unknown;
  tags: string[];
}

export type NoteExportFormat = 'pdf' | 'keel';

/** A file that cannot be brought in as a note; `message` is a sentence for the person. */
export class NoteImportRefused extends Error {
  override name = 'NoteImportRefused';
}

const NOT_A_NOTE = "That file isn't a Keel note.";
const NEWER =
  'That note was made by a newer version of Keel, so this one cannot read it.';
const DAMAGED = "That note file is damaged, so Keel can't read it.";
const TOO_BIG = 'That file is too large to be a Keel note.';
const UNKNOWN = "That note holds content this version of Keel can't open.";

export function noteFileOf(note: ExportedNote): NoteFile {
  return {
    kind: NOTE_FILE_KIND,
    version: NOTE_FILE_VERSION,
    title: note.title,
    body: note.body,
    tags: [...note.tags],
  };
}

/** The title as a file name that every system saves: no path or reserved characters. */
export function noteFileName(title: string): string {
  const name = title
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '')
    .slice(0, NAME_MAX)
    .trim();
  return `${name === '' ? 'Note' : name}.json`;
}

// ---- PDF: whoever draws the print layout registers here ---------------------

type Printer = (note: ExportedNote) => void;
const printers: Printer[] = [];

/** A print layout says it can take notes; the one mounted last is asked. Returns the way to leave. */
export function registerPrinter(print: Printer): () => void {
  printers.push(print);
  return () => {
    const at = printers.lastIndexOf(print);
    if (at >= 0) printers.splice(at, 1);
  };
}

function download(note: ExportedNote): void {
  const blob = new Blob([JSON.stringify(noteFileOf(note), null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = noteFileName(note.title);
  a.hidden = true;
  document.body.append(a);
  a.click();
  a.remove();
  // Let the browser start the save before the address goes.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Exports one note. `keel` downloads the note file. `pdf` asks the print
 * layout to open the browser's print dialog; false means no layout was there.
 */
export function exportNote(
  note: ExportedNote,
  format: NoteExportFormat,
): boolean {
  if (format === 'keel') {
    download(note);
    return true;
  }
  const print = printers.at(-1);
  if (!print) return false;
  print(note);
  return true;
}

// ---- import -----------------------------------------------------------------

let schema: Schema | undefined;

/** The editor's own schema, built once, so a body is judged by what the editor can open. */
function editorSchema(): Schema {
  schema ??= getSchema(noteExtensions());
  return schema;
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

function tidyTags(raw: unknown[]): string[] {
  const tags: string[] = [];
  for (const t of raw) {
    const tag = (t as string)
      .trim()
      .replace(/^#+/, '')
      .trim()
      .toLowerCase()
      .slice(0, TAG_MAX);
    if (tag !== '' && !tags.includes(tag)) tags.push(tag);
  }
  return tags.slice(0, TAGS_MAX);
}

/**
 * Reads a Keel note file as a new plain note, untouched by any store: the
 * caller saves it where it belongs. Refuses, with `NoteImportRefused`, a file
 * that is not one, one from a newer Keel, a damaged one, one too large, and
 * one whose body this editor cannot open.
 */
export async function importNote(file: Blob): Promise<JournalDraft> {
  if (file.size > NOTE_FILE_MAX_BYTES) throw new NoteImportRefused(TOO_BIG);
  let parsed: unknown;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    throw new NoteImportRefused(NOT_A_NOTE);
  }
  if (!isRecord(parsed) || parsed.kind !== NOTE_FILE_KIND)
    throw new NoteImportRefused(NOT_A_NOTE);
  const version = parsed.version;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1)
    throw new NoteImportRefused(NOT_A_NOTE);
  if (version > NOTE_FILE_VERSION) throw new NoteImportRefused(NEWER);

  const { title, body, tags } = parsed;
  if (
    typeof title !== 'string' ||
    !Array.isArray(tags) ||
    !tags.every((t) => typeof t === 'string') ||
    !isRecord(body) ||
    body.type !== 'doc' ||
    !Array.isArray(body.content)
  )
    throw new NoteImportRefused(DAMAGED);
  try {
    editorSchema().nodeFromJSON(body).check();
  } catch {
    throw new NoteImportRefused(UNKNOWN);
  }

  return {
    kind: 'note',
    title: title.trim().slice(0, TITLE_MAX) || 'Untitled note',
    body,
    tags: tidyTags(tags),
    linkedTradeIds: [],
  };
}
