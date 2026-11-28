'use client';

// Keeps versions of the open note as it is edited (B39). It draws nothing and
// is its own component so that an edit re-renders this and not the editor.
import { useEffect, useState } from 'react';
import { useVersionKeeper } from '@/data/query/hooks';

export function VersionKeeper({
  noteId,
  subscribe,
}: {
  /** The stored note; none yet for a note the host stores on its first change. */
  noteId: string | undefined;
  /** Calls `onEdit` with the whole body after each edit; returns the way to stop. */
  subscribe(onEdit: (body: unknown) => void): () => void;
}): null {
  const [body, setBody] = useState<unknown>(undefined);
  useEffect(() => subscribe(setBody), [subscribe]);
  useVersionKeeper(noteId, body);
  return null;
}
