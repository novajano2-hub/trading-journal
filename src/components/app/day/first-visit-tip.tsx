'use client';

import { useEffect } from 'react';
import { usePrefs, useUpdatePrefs } from '@/data/query/hooks';

export const TEMPLATES_TIP = 'day-plan-templates';

/**
 * The one-time tip about the default daily template, in plan mode. It sits in
 * the card's flow, under the template line and above the note, so it never
 * covers Change template or the editor at any width. Got it and Escape both
 * close it for good (`seenTips`).
 */
export function FirstVisitTip(): React.JSX.Element | null {
  const prefs = usePrefs().data;
  const update = useUpdatePrefs();
  const shown = prefs !== undefined && !prefs.seenTips?.includes(TEMPLATES_TIP);
  const seen = prefs?.seenTips;
  const dismiss = () =>
    update.mutate({ seenTips: [...(seen ?? []), TEMPLATES_TIP] });

  useEffect(() => {
    if (!shown) return;
    const onKey = (e: KeyboardEvent) => {
      // A menu or dialog that took the Escape keeps it.
      if (e.key === 'Escape' && !e.defaultPrevented) dismiss();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // `dismiss` only reads `seen` and the stable mutate.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown, seen]);

  if (!shown) return null;
  return (
    <div
      role="note"
      aria-label="Tip"
      className="mt-3 flex flex-wrap items-center gap-x-3 rounded-[12px] border border-line bg-sunken px-3.5 py-2 text-[13px] leading-[1.5] text-text"
    >
      <p className="min-w-0 flex-1 basis-[200px]">
        New day notes start from your default daily template. Edit it, or pick
        another, from Templates.
      </p>
      <button
        type="button"
        onClick={dismiss}
        className="-ml-1.5 inline-flex h-8 items-center rounded-chip px-1.5 text-[13px] font-semibold text-accent-ink outline-offset-2 hover:text-accent-hover focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:h-11"
      >
        Got it
      </button>
    </div>
  );
}
