import { useEffect, useSyncExternalStore } from 'react';

export type LogView = 'day' | 'week' | 'all';

const KEY = 'keel.tradeLogView';

/** Where each view of the trade log lives. */
export const LOG_VIEW_HREF: Record<LogView, string> = {
  day: '/app/trades/day',
  week: '/app/trades/week',
  all: '/app/trades',
};

/**
 * Keel's call (TradeZella opens a drawer instead of a page): the trade page's
 * "Trades" crumb returns to the view of the trade log the reader was last on in
 * this tab (Day, Week or All), so a trade opened from the Day view backs out to
 * it. Kept per tab in session storage; All when nothing is kept or storage is
 * unavailable.
 */
export function rememberLogView(view: LogView): void {
  try {
    window.sessionStorage.setItem(KEY, view);
  } catch {
    // Storage can be blocked; the crumb then returns to All.
  }
}

export function lastLogView(): LogView {
  try {
    const v = window.sessionStorage.getItem(KEY);
    return v === 'day' || v === 'week' ? v : 'all';
  } catch {
    return 'all';
  }
}

/** Each of the three views calls this: it is the view the crumb returns to. */
export function useRememberLogView(view: LogView): void {
  useEffect(() => rememberLogView(view), [view]);
}

/** The view to return to; All on the server and until the client reads storage. */
export function useLastLogView(): LogView {
  return useSyncExternalStore(
    () => () => {},
    lastLogView,
    () => 'all',
  );
}
