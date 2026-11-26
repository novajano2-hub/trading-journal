'use client';

import {
  ArrowUpRight,
  Bank,
  CaretRight,
  ChartBar,
  ClockCounterClockwise,
  PlusCircle,
  ShieldCheck,
  SquaresFour,
} from '@phosphor-icons/react/dist/ssr';
import { useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { CARD, CARD_PAD, CardHeader } from '@/components/app/dashboard/shared';
import { StrategyError } from '@/components/app/strategies/strategy-states';
import { Chip } from '@/components/ui/chip';
import { gettingStarted, type GettingStarted } from '@/data/getting-started';
import {
  useAccounts,
  useActiveWorkspace,
  useChallenges,
  usePrefs,
  useTrades,
} from '@/data/query/hooks';
import { useSidebarState } from '../use-sidebar-state';
import { dateLine, greeting } from './greeting';
import { GettingStartedCard } from './getting-started';

/**
 * A card's list row: a link, its title and line, an arrow. TradeZella's cards
 * show only a pointer on hover [rec S01 0:11 zoom]: no fill, border or shadow
 * change, but the keyboard ring stays.
 */
const ROW =
  'flex min-h-[60px] cursor-pointer items-center gap-3.5 rounded-control py-2.5 no-underline outline-offset-2 focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:min-h-14';

function Row({
  href,
  icon,
  title,
  line,
  chip,
  external = false,
  muted = false,
}: {
  href: `/${string}`;
  icon?: ReactNode;
  title: string;
  line: string;
  chip?: string;
  /** The arrow points out, to a page outside the app. */
  external?: boolean;
  muted?: boolean;
}): React.JSX.Element {
  const Arrow = external ? ArrowUpRight : CaretRight;
  return (
    <li className="border-t border-line/70 first:border-t-0">
      <Link href={href} className={ROW}>
        {icon}
        <span className="min-w-0 flex-1">
          <b
            className={`block text-sm font-medium ${muted ? 'text-muted' : 'text-text'}`}
          >
            {title}
          </b>
          <span className="mt-0.5 block text-[12.5px] leading-[1.45] text-faint">
            {line}
          </span>
        </span>
        {chip ? <Chip>{chip}</Chip> : null}
        <Arrow
          size={13}
          weight="bold"
          aria-hidden="true"
          className="flex-none text-faint"
        />
      </Link>
    </li>
  );
}

const glyph = (muted = false) =>
  `flex-none ${muted ? 'text-faint opacity-70' : 'text-muted'}`;

function HomeCard({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}): React.JSX.Element {
  return (
    <section aria-labelledby={id} className={`${CARD} ${CARD_PAD} min-w-0`}>
      <CardHeader headingId={id} title={title} />
      <ul className="mt-1.5">{children}</ul>
    </section>
  );
}

function Explore(): React.JSX.Element {
  return (
    <HomeCard id="ex-heading" title="Explore">
      <Row
        href="/app/prop-firms"
        icon={<ShieldCheck size={18} aria-hidden="true" className={glyph()} />}
        title="Prop firms"
        line="Track evaluations and funded accounts against their rules."
      />
      <Row
        href="/app/dashboard"
        icon={<SquaresFour size={18} aria-hidden="true" className={glyph()} />}
        title="Dashboard"
        line="Your plan, what breaking it cost, and your results."
      />
      <Row
        href="/app/backtesting"
        icon={
          <ClockCounterClockwise
            size={18}
            aria-hidden="true"
            className={glyph(true)}
          />
        }
        title="Backtesting"
        line="Test a fix before you trade it. It needs market data, which Keel doesn't have yet."
        chip="Not live yet"
        muted
      />
    </HomeCard>
  );
}

/** TradeZella's four prop rows, in Keel's words. Static: they never react to the checklist [rec S01 0:11]. */
function RecommendedFocus(): React.JSX.Element {
  return (
    <HomeCard id="rf-heading" title="Recommended focus">
      <Row
        href="/app/settings/accounts?new=prop"
        icon={<Bank size={18} aria-hidden="true" className={glyph()} />}
        title="Add your prop account"
        line="Automatic sync isn't live yet, so you import its trades."
      />
      <Row
        href="/app/prop-firms?new=challenge"
        icon={<ShieldCheck size={18} aria-hidden="true" className={glyph()} />}
        title="Set up rule monitoring"
        line="A challenge checks your daily and max drawdown limits."
      />
      <Row
        href="/app/trades/new"
        icon={<PlusCircle size={18} aria-hidden="true" className={glyph()} />}
        title="Add your first challenge trade"
        line="Import it from your broker, or enter it by hand."
      />
      <Row
        href="/app/prop-firms"
        icon={<ChartBar size={18} aria-hidden="true" className={glyph()} />}
        title="Review your challenge dashboard"
        line="See how close you are to the target and each limit."
      />
    </HomeCard>
  );
}

function Resources(): React.JSX.Element {
  return (
    <HomeCard id="rs-heading" title="Resources">
      <Row
        href="/changelog"
        title="Changelog"
        line="What changed in Keel, newest first."
        external
      />
    </HomeCard>
  );
}

function Bar({ className }: { className: string }): React.JSX.Element {
  return <span className={`block rounded-chip bg-sunken ${className}`} />;
}

/** The cards' shapes while Home reads the workspace, without words. */
function CardsSkeleton(): React.JSX.Element {
  return (
    <div
      role="status"
      aria-label="Loading Home"
      // Keel's call: two columns from `lg` (see HomeView).
      className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_440px] lg:items-start"
    >
      {[
        ['h-[300px]', 'h-[200px]'],
        ['h-[260px]', 'h-[100px]'],
      ].map((col, i) => (
        <div key={i} aria-hidden="true" className="flex flex-col gap-4">
          {col.map((h) => (
            <div key={h} className={`${CARD} ${CARD_PAD} ${h}`}>
              <Bar className="h-3.5 w-24" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

type Prefs = NonNullable<ReturnType<typeof usePrefs>['data']>;

/** The greeting and the cards; `progress` undefined is the cards' skeleton. */
function HomeLayout({
  prefs,
  name,
  progress,
}: {
  prefs: Prefs | undefined;
  name: string | undefined;
  progress: GettingStarted | undefined;
}): React.JSX.Element {
  const now = new Date();
  // With the sidebar collapsed Home has no rail: its content sits in a centred column.
  const { collapsed } = useSidebarState();
  return (
    <div
      data-centred={collapsed}
      className={`flex flex-col gap-4 px-5 pt-0.5 pb-7${collapsed ? ' mx-auto w-full max-w-[1200px]' : ''}`}
    >
      <header className="pt-1.5 pb-0.5">
        {prefs ? (
          <>
            <h2 className="text-2xl leading-[1.15] font-semibold tracking-[-0.03em] sm:text-[26px]">
              {greeting(now, prefs.timeZone, name)}
            </h2>
            <p className="mt-1 text-sm text-muted">
              {dateLine(now, prefs.timeZone)}
            </p>
          </>
        ) : (
          // Prefs are still being read: the greeting's place, held empty.
          <div aria-hidden="true" className="h-[56px]" />
        )}
      </header>
      {progress ? (
        // Keel's call: two columns from `lg`, not comp 14's 640px: a fixed 440px
        // right column beside the app sidebar leaves the left unusable below it.
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_440px] lg:items-start">
          <div className="flex min-w-0 flex-col gap-4">
            <GettingStartedCard progress={progress} />
            <Explore />
          </div>
          <div className="flex min-w-0 flex-col gap-4">
            <RecommendedFocus />
            <Resources />
          </div>
        </div>
      ) : (
        <CardsSkeleton />
      )}
    </div>
  );
}

/** Home as an empty My workspace: it reads only the prefs (the zone), never the workspace's rows. */
function FirstRunHome(): React.JSX.Element {
  const prefs = usePrefs();
  return (
    <HomeLayout
      prefs={prefs.data}
      name={undefined}
      progress={gettingStarted([], [], [])}
    />
  );
}

function LiveHome(): React.JSX.Element {
  const queryClient = useQueryClient();
  const prefs = usePrefs();
  const workspace = useActiveWorkspace();
  const accounts = useAccounts();
  const challenges = useChallenges();
  const trades = useTrades();
  // The workspace read gates the three row reads: if it fails they stay
  // disabled, so its error is part of the chain.
  const error =
    prefs.error ??
    workspace.error ??
    accounts.error ??
    challenges.error ??
    trades.error;
  if (error)
    return (
      <StrategyError
        title="Home couldn't load."
        error={error}
        onRetry={() => void queryClient.resetQueries({ queryKey: ['keel'] })}
      />
    );
  const p = prefs.data;
  return (
    <HomeLayout
      prefs={p}
      // An old display name reads as the first name until one is set.
      name={p?.firstName ?? p?.displayName}
      progress={
        accounts.data && challenges.data && trades.data
          ? gettingStarted(accounts.data, challenges.data, trades.data)
          : undefined
      }
    />
  );
}

/**
 * Home: a greeting, then the Get started card with Explore, and Recommended
 * focus with Resources. `firstRun` is Home as an empty My workspace, held
 * while the required preferences dialog is open over it [inv-1 013]: the
 * greeting with no name and every step open (0 of 3). That mode calls no
 * workspace-row hook (accounts, challenges, trades), so nothing is read from
 * the workspace that happens to be active (the sample). Ordinary loading is
 * the greeting over skeleton cards.
 */
export function HomeView({
  firstRun = false,
}: {
  firstRun?: boolean;
}): React.JSX.Element {
  return firstRun ? <FirstRunHome /> : <LiveHome />;
}
