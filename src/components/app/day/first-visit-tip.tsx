'use client';

import { usePrefs, useUpdatePrefs } from '@/data/query/hooks';

export const TEMPLATES_TIP = 'day-plan-templates';

/**
 * The one-time tip by the Templates control: the default daily template can
 * be edited. Gone for good once dismissed (`seenTips`). It sits under its
 * control, so put it inside a relatively placed wrapper.
 */
export function FirstVisitTip(): React.JSX.Element | null {
  const prefs = usePrefs().data;
  const update = useUpdatePrefs();
  if (!prefs || prefs.seenTips?.includes(TEMPLATES_TIP)) return null;
  return (
    <div
      role="note"
      aria-label="Tip"
      className="absolute top-full right-0 z-20 mt-2 w-[264px] rounded-[12px] border border-line bg-surface-1 p-3.5 text-[13px] leading-[1.5] text-text shadow-[var(--shadow)]"
    >
      <p>
        New day notes start from your default daily template. Edit it, or pick
        another, from Templates.
      </p>
      <button
        type="button"
        onClick={() =>
          update.mutate({
            seenTips: [...(prefs.seenTips ?? []), TEMPLATES_TIP],
          })
        }
        className="mt-2 -ml-1.5 inline-flex h-8 items-center rounded-chip px-1.5 text-[13px] font-semibold text-accent-ink outline-offset-2 hover:text-accent-hover focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:h-11"
      >
        Got it
      </button>
    </div>
  );
}
