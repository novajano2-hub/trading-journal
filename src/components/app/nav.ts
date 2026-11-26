import type { Icon } from '@phosphor-icons/react';
import {
  CalendarBlank,
  ChartBar,
  ClockCounterClockwise,
  Gauge,
  GearSix,
  House,
  ListBullets,
  Notebook,
  PlayCircle,
  ShieldCheck,
  Sparkle,
  SquaresFour,
  Strategy,
  UploadSimple,
  UsersThree,
} from '@phosphor-icons/react/dist/ssr';
import { MODULES, type ModuleInfo } from '@/content/modules';
import { parseFilters, serializeFilters } from '@/data/filters';
import { decodedSegment } from '@/lib/route-param';

export type AppModuleId =
  | 'home'
  | 'dashboard'
  | 'trades'
  | 'calendar'
  | 'reports'
  | 'progress'
  | 'strategies'
  | 'notebook'
  | 'import'
  | 'prop-firms'
  | 'backtesting'
  | 'replay'
  | 'mentors'
  | 'assistant'
  | 'settings';

export interface NavItem {
  id: AppModuleId;
  label: string;
  href: `/app/${string}`;
  icon: Icon;
  group: 'modules' | 'not-live' | 'settings';
  /** The link carries the global filters, so the module opens on the same slice. */
  filterScoped: boolean;
  built: boolean;
  /** One line on what the module does, shown on its placeholder. */
  summary: string;
  /** Not-live only: what it waits for. */
  reason?: string;
}

/** The marketing one-liner for a module that isn't live yet. */
function oneLine(slug: ModuleInfo['slug']): string {
  const info = MODULES.find((m) => m.slug === slug);
  if (!info) throw new Error(`No module info for ${slug}`);
  return info.oneLine;
}

const NEEDS_MARKET_DATA = "It needs market data, which Keel doesn't have yet.";

export const APP_NAV: readonly NavItem[] = [
  {
    id: 'home',
    label: 'Home',
    href: '/app/home',
    icon: House,
    group: 'modules',
    filterScoped: false,
    built: true,
    summary:
      'Your first steps in Keel, a way into each part, and where to look next.',
  },
  {
    id: 'dashboard',
    label: 'Dashboard',
    href: '/app/dashboard',
    icon: SquaresFour,
    group: 'modules',
    filterScoped: true,
    built: true,
    summary:
      'How well you kept your plan, what breaking it cost, and your results.',
  },
  {
    id: 'trades',
    label: 'Trades',
    // Trades opens the Day view (K36); /app/trades stays the All view.
    href: '/app/trades/day',
    icon: ListBullets,
    group: 'modules',
    filterScoped: true,
    built: false,
    summary:
      'Every trade in your filters, with its fills, tags, notes and rule checks.',
  },
  {
    id: 'calendar',
    label: 'Calendar',
    href: '/app/calendar',
    icon: CalendarBlank,
    group: 'modules',
    filterScoped: true,
    built: false,
    summary: "Each day's P&L on a month grid, with the trades behind it.",
  },
  {
    id: 'reports',
    label: 'Reports',
    href: '/app/reports',
    icon: ChartBar,
    group: 'modules',
    filterScoped: true,
    built: false,
    summary:
      'Your results by time of day, weekday, symbol, strategy, tag, side, duration and R.',
  },
  {
    id: 'progress',
    label: 'Progress tracker',
    href: '/app/progress',
    icon: Gauge,
    group: 'modules',
    filterScoped: true,
    built: true,
    summary:
      'How consistently you follow your own rules: your streak, your score and every rule.',
  },
  {
    id: 'strategies',
    label: 'Strategies',
    href: '/app/strategies',
    icon: Strategy,
    group: 'modules',
    filterScoped: true,
    built: false,
    summary:
      'Your strategies with their rules and checklists, and how each one performs.',
  },
  {
    id: 'notebook',
    label: 'Notebook',
    href: '/app/notebook',
    icon: Notebook,
    group: 'modules',
    filterScoped: false,
    built: false,
    summary:
      'Daily reviews, pre-market plans and weekly recaps, linked to your trades.',
  },
  {
    id: 'import',
    label: 'Import',
    href: '/app/import',
    icon: UploadSimple,
    group: 'modules',
    filterScoped: false,
    built: true,
    summary: "Bring in trades from your broker's CSV export.",
  },
  {
    id: 'prop-firms',
    label: 'Prop firms',
    href: '/app/prop-firms',
    icon: ShieldCheck,
    group: 'modules',
    filterScoped: false,
    built: true,
    summary:
      'Your prop accounts against their profit target, loss limits, drawdown and trading days.',
  },
  {
    id: 'backtesting',
    label: 'Backtesting',
    href: '/app/backtesting',
    icon: ClockCounterClockwise,
    group: 'not-live',
    filterScoped: false,
    built: false,
    summary: oneLine('backtesting'),
    reason: NEEDS_MARKET_DATA,
  },
  {
    id: 'replay',
    label: 'Replay',
    href: '/app/replay',
    icon: PlayCircle,
    group: 'not-live',
    filterScoped: false,
    built: false,
    summary: oneLine('replay'),
    reason: NEEDS_MARKET_DATA,
  },
  {
    id: 'mentors',
    label: 'Mentors',
    href: '/app/mentors',
    icon: UsersThree,
    group: 'not-live',
    filterScoped: false,
    built: false,
    summary: oneLine('mentors'),
    reason: 'It needs accounts and sharing, which come with the backend.',
  },
  {
    id: 'assistant',
    label: 'Assistant',
    href: '/app/assistant',
    icon: Sparkle,
    group: 'not-live',
    filterScoped: false,
    built: false,
    summary: oneLine('assistant'),
    reason: 'It needs an AI provider, which comes with the backend.',
  },
  {
    id: 'settings',
    label: 'Settings',
    href: '/app/settings',
    icon: GearSix,
    group: 'settings',
    filterScoped: false,
    built: false,
    summary: 'Your timezone, breakeven range, accounts and import history.',
  },
];

/** The item with this id. Every `AppModuleId` has one. */
export function navItem(id: AppModuleId): NavItem {
  const item = APP_NAV.find((i) => i.id === id);
  if (!item) throw new Error(`No nav item ${id}`);
  return item;
}

/**
 * Where the item links from a page with these params. Filter-scoped modules
 * carry the canonical global filters and drop anything else (`by`, paging).
 */
export function navHref(
  item: NavItem,
  params: Pick<URLSearchParams, 'get' | 'getAll'>,
): string {
  if (!item.filterScoped) return item.href;
  const query = serializeFilters(parseFilters(params)).toString();
  return query ? `${item.href}?${query}` : item.href;
}

/** The item whose href is the longest prefix of `pathname`, by whole segments. */
export function activeItem(pathname: string): NavItem | undefined {
  // A day page sits under Trades (comps 04 and 05).
  if (dayPageDate(pathname) !== undefined) return navItem('trades');
  // Every Trades page: All, Day, Week and one trade (Trades' own href is the Day view).
  if (pathname === '/app/trades' || pathname.startsWith('/app/trades/'))
    return navItem('trades');
  let best: NavItem | undefined;
  for (const item of APP_NAV) {
    const inside =
      pathname === item.href || pathname.startsWith(`${item.href}/`);
    if (inside && (!best || item.href.length > best.href.length)) best = item;
  }
  return best;
}

/** The date segment when `pathname` is a day page (`/app/day/<date>` or its plan or review), raw and undecoded. */
export function dayPageDate(pathname: string): string | undefined {
  return /^\/app\/day\/([^/]+)(?:\/(?:plan|review))?\/?$/.exec(pathname)?.[1];
}

/** The top bar's title: the active module, else the product name. */
export function pageTitle(pathname: string): string {
  return activeItem(pathname)?.label ?? 'Keel';
}

/** The trade id when `pathname` is one trade's page (not a log view, the new-trade form or an edit), decoded. */
export function tradePageId(pathname: string): string | undefined {
  const m = /^\/app\/trades\/([^/]+)$/.exec(pathname);
  if (!m || m[1] === 'new' || m[1] === 'day' || m[1] === 'week')
    return undefined;
  return decodedSegment(m[1]!);
}

/** The strategy id when `pathname` is one strategy's page (not the list, the new form or the editor), decoded. */
export function strategyPageId(pathname: string): string | undefined {
  const m = /^\/app\/strategies\/([^/]+)$/.exec(pathname);
  return !m || m[1] === 'new' ? undefined : decodedSegment(m[1]!);
}

/** The strategy id when `pathname` is one strategy's editor, decoded. */
export function strategyEditId(pathname: string): string | undefined {
  const m = /^\/app\/strategies\/([^/]+)\/edit$/.exec(pathname);
  return m ? decodedSegment(m[1]!) : undefined;
}

/**
 * Whether the global filters drive this page: Dashboard, the trade log, Calendar,
 * Strategies (the list and one strategy), the progress tracker (its date range only) and Reports, except Compare, whose two groups each own their filters.
 * Elsewhere the bar shows no chips.
 */
export function filtersApply(pathname: string): boolean {
  return (
    /^\/app\/(dashboard|trades|calendar|strategies)$/.test(pathname) ||
    /^\/app\/trades\/(day|week)$/.test(pathname) ||
    (/^\/app\/strategies\/[^/]+$/.test(pathname) &&
      pathname !== '/app/strategies/new') ||
    (/^\/app\/reports(\/|$)/.test(pathname) &&
      !/^\/app\/reports\/compare\/?$/.test(pathname)) ||
    pathname === '/app/progress'
  );
}

/**
 * Pages where the bar shows the date range alone: the progress tracker, which
 * has no Filters and takes its accounts from the switcher (K14).
 */
export const datesOnly = (pathname: string): boolean =>
  pathname === '/app/progress';

/** Pages with no Display menu: money there is always net, in its own currency (P6A-03). */
export const hidesDisplayMenu = (pathname: string): boolean =>
  pathname === '/app/progress' || dayPageDate(pathname) !== undefined;

/** The page where each group of trades has its own filters rather than the global ones. */
export const isComparePage = (pathname: string): boolean =>
  /^\/app\/reports\/compare\/?$/.test(pathname);
