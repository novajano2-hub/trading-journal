'use client';

// The print layout for a note (B40): the note drawn read-only into a node set
// apart from the app, then the browser's print dialog. `print.css` hides the
// app and shows only this node on paper; on screen the node is off to the
// side and out of reach. It is a layout the page already has in its tree (so
// the note's chips, images and figures read the same data), not a window.
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { EagerFilesContext } from '../use-file-url';
import { registerPrinter, type ExportedNote } from './note-export';
import { NotePreview } from './note-editor';

/** How long the layout waits for the note's pictures before it prints anyway. */
export const PRINT_WAIT_MS = 10_000;
const POLL_MS = 100;

/** Whether everything the note draws from a stored file has settled: a picture, or the words that it is missing. */
function settled(root: HTMLElement): boolean {
  if (!root.querySelector('.ProseMirror')) return false;
  if (
    root.querySelector(
      '[data-image-frame][data-state="loading"], [data-image-frame][data-state="idle"]',
    )
  )
    return false;
  return [...root.querySelectorAll('img')].every((img) => img.complete);
}

function PrintLayout({
  note,
  onDone,
}: {
  note: ExportedNote;
  onDone(): void;
}): React.JSX.Element {
  const [root, setRoot] = useState<HTMLElement | null>(null);
  // A re-render of whatever holds the layout must not print a second time.
  const printed = useRef(false);
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  });

  useEffect(() => {
    if (!root || printed.current) return;
    const started = Date.now();
    const finish = () => {
      window.removeEventListener('afterprint', finish);
      done.current();
    };
    const poll = setInterval(() => {
      if (!settled(root) && Date.now() - started <= PRINT_WAIT_MS) return;
      clearInterval(poll);
      printed.current = true;
      window.addEventListener('afterprint', finish);
      window.print();
    }, POLL_MS);
    return () => {
      clearInterval(poll);
      window.removeEventListener('afterprint', finish);
    };
  }, [root]);

  return (
    <div
      id="print-note"
      data-print-root=""
      ref={setRoot}
      aria-hidden="true"
      // Never reachable on screen: nothing in it takes focus.
      {...{ inert: true }}
    >
      <h1 className="print-title">{note.title}</h1>
      {note.tags.length > 0 ? (
        <p className="print-tags">{note.tags.join(', ')}</p>
      ) : null}
      <EagerFilesContext.Provider value={true}>
        <NotePreview body={note.body} label={note.title || 'Note'} />
      </EagerFilesContext.Provider>
    </div>
  );
}

/**
 * Draws the print layout when an export asks for a PDF, and takes it away when
 * the print dialog is done. Mount one wherever a note can be exported.
 */
export function PrintHost(): React.JSX.Element | null {
  // Each export is its own layout, so asking again prints again.
  const [job, setJob] = useState<{ note: ExportedNote; id: number } | null>(
    null,
  );
  const count = useRef(0);
  useEffect(
    () =>
      registerPrinter((note) => {
        count.current += 1;
        setJob({ note, id: count.current });
      }),
    [],
  );
  if (!job) return null;
  return createPortal(
    <PrintLayout key={job.id} note={job.note} onDone={() => setJob(null)} />,
    document.body,
  );
}
