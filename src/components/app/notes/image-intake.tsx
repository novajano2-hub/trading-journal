'use client';

// How a note takes images in (spec §5.6, B32): a file from the Insert menu's
// picker, a paste or a drop is checked, stored under the note (`note:<id>`)
// and put in the body as a reference. A file Keel won't keep, and a note that
// is closed with its day, say why instead of failing quietly. Only mounted for
// a note that can take images; `NoteEditor` mounts it, and the editor's paste
// and drop plugins reach it through the bridge.
import { X } from '@phosphor-icons/react/dist/ssr';
import type { Editor } from '@tiptap/core';
import type { UseMutationResult } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useAddFile } from '@/data/query/hooks';
import {
  FileRejected,
  IMAGE_TYPES,
  LockedDayError,
  SHOT_MAX_BYTES,
  type NewFile,
} from '@/data/repository';
import type { StoredFile } from '@/domain/types';
import { refOf, type ImageLink } from './extensions/image-model';

/** Why a file did not go in, in Keel's words. */
function reasonFor(error: unknown, name: string): string {
  if (error instanceof LockedDayError)
    return "This day is closed. Its note can't take new images.";
  if (error instanceof FileRejected) {
    if (error.reason === 'type')
      return `${name} isn't a PNG, JPEG, GIF or WebP image.`;
    if (error.reason === 'size') return `${name} is over 10 MB.`;
    return `Couldn't save ${name}. This browser has no room left.`;
  }
  return `Couldn't save ${name}.`;
}

/** What a picture is called to a screen reader: its file's name without the extension. */
const altOf = (name: string): string =>
  name.replace(/\.[^./\\]+$/, '').slice(0, 200) || 'Image';

/**
 * Checks each file, stores it under the note, and puts the pictures in the
 * body together (one change, one step to undo). A refused file is a sentence
 * in the result and does not stop the others, except a closed day, which
 * refuses them all the same way. Nothing is read, and no note is stored, for
 * a file that is refused first.
 */
async function intake(
  editor: Editor,
  deps: {
    /** The owner of the files: the note's id, stored if need be. */
    owner(): Promise<string>;
    write(owner: string, file: NewFile): Promise<StoredFile>;
  },
  files: File[],
  at: { inline?: boolean; pos?: number } | undefined,
): Promise<string[]> {
  const problems: string[] = [];
  const kept: { src: string; alt: string }[] = [];
  let owner: string | undefined;
  for (const file of files) {
    const name = file.name || 'image';
    if (!(IMAGE_TYPES as readonly string[]).includes(file.type)) {
      problems.push(reasonFor(new FileRejected('type'), name));
      continue;
    }
    if (file.size > SHOT_MAX_BYTES) {
      problems.push(reasonFor(new FileRejected('size'), name));
      continue;
    }
    try {
      owner ??= await deps.owner();
      const stored = await deps.write(owner, {
        bytes: await file.arrayBuffer(),
        type: file.type,
        name,
      });
      kept.push({ src: refOf(stored.id), alt: altOf(name) });
    } catch (error) {
      problems.push(reasonFor(error, name));
      if (error instanceof LockedDayError) break;
    }
  }
  if (kept.length > 0 && !editor.isDestroyed) {
    const chain = editor.chain().focus();
    // A drop lands where it was dropped.
    if (at?.pos !== undefined) chain.caretAt(at.pos);
    chain
      .insertContent(
        kept.map((attrs) => ({
          type: at?.inline ? 'inlineImage' : 'image',
          attrs,
        })),
      )
      .run();
  }
  return problems;
}

export function ImageIntake({
  editor,
  link,
  noteId,
  ensureNoteId,
}: {
  editor: Editor;
  link: ImageLink;
  /** The note that owns the images, once it is stored. */
  noteId: string | undefined;
  /** Stores a note that is not stored yet, and says its id. */
  ensureNoteId: (() => Promise<string>) | undefined;
}): React.JSX.Element {
  const add: UseMutationResult<
    StoredFile,
    Error,
    { owner: string; file: NewFile; images: boolean }
  > = useAddFile();
  const [problems, setProblems] = useState<{ id: number; text: string }[]>([]);
  const picker = useRef<HTMLInputElement>(null);
  const inline = useRef(false);
  const next = useRef(0);
  // What `take` uses outlives the render that made it: it reads the latest.
  const latest = useRef({ add, noteId, ensureNoteId });
  useEffect(() => {
    latest.current = { add, noteId, ensureNoteId };
  });

  useEffect(
    () =>
      link.provide({
        take: (files, at) => {
          setProblems([]);
          void intake(
            editor,
            {
              owner: async () => {
                const { noteId: id, ensureNoteId: ensure } = latest.current;
                return `note:${id ?? (await ensure!())}`;
              },
              write: (owner, file) =>
                latest.current.add.mutateAsync({ owner, file, images: true }),
            },
            files,
            at,
          ).then((said) =>
            setProblems(said.map((text) => ({ id: next.current++, text }))),
          );
          return true;
        },
        pick: (isInline) => {
          inline.current = isInline;
          picker.current?.click();
          return true;
        },
      }),
    [link, editor],
  );

  return (
    <>
      <input
        ref={picker}
        type="file"
        multiple
        accept={IMAGE_TYPES.join(',')}
        aria-label="Image files"
        tabIndex={-1}
        className="sr-only"
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = '';
          link.bridge.take(files, { inline: inline.current });
        }}
      />
      {problems.length > 0 ? (
        <div
          role="alert"
          className="mt-2 flex items-start gap-2 rounded-control bg-sunken px-3 py-2 text-[13px] text-loss"
        >
          <ul className="min-w-0 flex-1">
            {problems.map((p) => (
              <li key={p.id}>{p.text}</li>
            ))}
          </ul>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => setProblems([])}
            className="grid size-6 flex-none place-items-center rounded-control text-muted outline-offset-2 hover:bg-surface-1 hover:text-text focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:size-11"
          >
            <X size={12} weight="bold" aria-hidden="true" />
          </button>
        </div>
      ) : null}
    </>
  );
}
