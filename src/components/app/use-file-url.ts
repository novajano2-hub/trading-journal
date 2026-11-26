'use client';

// A stored file's bytes as an object URL, for an image that shows. The bytes
// are read with `useReadFile` (never held by a list or the query cache), made
// into an object URL when the image is wanted, and the URL is revoked when it
// goes. An image waits until it is near the viewport (where the browser can
// say), so a long note or a trade with many shots reads only what is in sight.
import { useEffect, useState, type RefCallback } from 'react';
import { useReadFile } from '@/data/query/hooks';

export type FileUrlStatus = 'idle' | 'loading' | 'ready' | 'missing' | 'error';

export interface FileUrl {
  url: string | undefined;
  /** `idle`: no id, or not wanted yet; `missing`: the file is not stored. */
  status: FileUrlStatus;
}

interface Settled {
  id: string;
  url?: string;
  status: 'ready' | 'missing' | 'error';
}

/**
 * The object URL of file `id` while `enabled`: one read of its bytes, one URL,
 * revoked when the id changes or the caller unmounts. A refetch of the file's
 * list changes nothing: the bytes of an id never change.
 */
export function useFileUrl(id: string | undefined, enabled = true): FileUrl {
  const read = useReadFile();
  const [settled, setSettled] = useState<Settled | null>(null);

  useEffect(() => {
    if (id === undefined || !enabled) return;
    let gone = false;
    let made: string | undefined;
    read(id).then(
      (file) => {
        if (gone) return;
        if (!file) {
          setSettled({ id, status: 'missing' });
          return;
        }
        made = URL.createObjectURL(new Blob([file.bytes], { type: file.type }));
        setSettled({ id, url: made, status: 'ready' });
      },
      () => {
        if (!gone) setSettled({ id, status: 'error' });
      },
    );
    return () => {
      gone = true;
      if (made !== undefined) {
        URL.revokeObjectURL(made);
        const revoked = made;
        // Never leave a revoked URL for the next render to draw.
        setSettled((s) => (s?.url === revoked ? null : s));
      }
    };
  }, [id, enabled, read]);

  if (id === undefined || !enabled) return { url: undefined, status: 'idle' };
  if (settled?.id !== id) return { url: undefined, status: 'loading' };
  return { url: settled.url, status: settled.status };
}

/** The nearest ancestor that scrolls, so "near" means near what the reader sees. */
function scrollParent(el: Element): Element | null {
  for (let p = el.parentElement; p; p = p.parentElement) {
    try {
      if (/(auto|scroll)/.test(getComputedStyle(p).overflowY)) return p;
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * A ref for the element to watch, and whether it has been within a screenful
 * of the viewport (true from then on). Where the browser has no
 * IntersectionObserver it is true at once.
 */
export function useNearViewport<T extends Element>(
  margin = '400px',
): [RefCallback<T>, boolean] {
  const [seen, setSeen] = useState(false);
  const [el, setEl] = useState<T | null>(null);
  const supported = typeof IntersectionObserver !== 'undefined';

  useEffect(() => {
    if (seen || !supported || !el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setSeen(true);
          io.disconnect();
        }
      },
      { root: scrollParent(el), rootMargin: margin },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [el, seen, supported, margin]);

  return [setEl, seen || !supported];
}

/** `useFileUrl` for an image that waits until it is near the viewport; put `ref` on the image's box. */
export function useLazyFileUrl<T extends Element = HTMLElement>(
  id: string | undefined,
): FileUrl & { ref: RefCallback<T> } {
  const [ref, near] = useNearViewport<T>();
  return { ...useFileUrl(id, near), ref };
}
