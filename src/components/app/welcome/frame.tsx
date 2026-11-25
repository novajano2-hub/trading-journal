import type { ReactNode } from 'react';
import { CARD } from '../dashboard/shared';

/** The welcome's and the survey's card (comp 10): 400px wide, centred under the mark. */
export function WelcomeCard({
  children,
  busy = false,
}: {
  children?: ReactNode;
  busy?: boolean;
}): React.JSX.Element {
  return (
    <div
      aria-busy={busy || undefined}
      className={`${CARD} px-8 pt-[30px] pb-7 max-sm:px-5 max-sm:py-[22px]`}
    >
      {children}
    </div>
  );
}

/**
 * The buttons under the card; on a phone they pin to the foot, above the
 * safe area, where the page's own foot leaves room for them (comp 10).
 */
export function Actions({
  children,
}: {
  children: ReactNode;
}): React.JSX.Element {
  return (
    <div className="mt-[26px] flex gap-2 max-sm:fixed max-sm:inset-x-0 max-sm:bottom-0 max-sm:z-10 max-sm:mt-0 max-sm:border-t max-sm:border-line max-sm:bg-bg max-sm:px-5 max-sm:pt-3 max-sm:pb-[calc(12px+env(safe-area-inset-bottom))]">
      {children}
    </div>
  );
}

/** 44px, 15px at weight 500: the comp's welcome and survey buttons. */
export const ACTION_BUTTON = 'h-11 text-[15px] font-medium';
