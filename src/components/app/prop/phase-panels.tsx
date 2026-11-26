'use client';

import { UploadSimple } from '@phosphor-icons/react/dist/ssr';
import Link from 'next/link';
import { useId, useMemo } from 'react';
import { FigureText } from '@/components/product/figure-text';
import { Button } from '@/components/ui/button';
import { buttonClasses } from '@/components/ui/button-styles';
import { SideChip } from '@/components/ui/chip';
import { MetricTip } from '@/components/ui/metric-tip';
import type { MetricId } from '@/content/metric-definitions';
import type { ChallengePhaseCheck } from '@/domain/prop/challenge';
import type { PhaseStats } from '@/domain/prop/phase';
import { closedInOrder } from '@/domain/trade-status';
import type { Account, Cents, Trade } from '@/domain/types';
import { useDisplay } from '@/lib/display';
import { formatPct, plural } from '@/lib/format';
import { shortTime } from '@/lib/time-format';
import {
  CARD,
  CARD_PAD,
  Caption,
  CardHeader,
  InstrumentName,
  signTone,
  TradeTime,
} from '../dashboard/shared';
import { dayMonth, RuleLines } from './challenge-card';

/** How many of the phase's trades the card lists before it links to Trades. */
const SHOWN = 5;

/**
 * The phase's rules and where it stands against them (the path to funding),
 * read from the rule check: the profit against the target (a funded phase has
 * none), the trading days against the minimum, the daily loss and the drawdown
 * used and the best-day share, a line each with a track. A phase with no
 * account or no rules says so and offers the form.
 */
export function RulesCard({
  label,
  phase,
  startDate,
  onEdit,
}: {
  /** "Step 1", "Step 2" or "Funded". */
  label: string;
  phase: ChallengePhaseCheck | undefined;
  startDate?: string;
  onEdit(): void;
}): React.JSX.Element {
  const headingId = useId();
  const read = phase?.state !== undefined && phase.account?.propRules;
  return (
    <section
      aria-labelledby={headingId}
      className={`${CARD} ${CARD_PAD} flex min-w-0 flex-col`}
    >
      <CardHeader
        headingId={headingId}
        title={`${label} rules`}
        after={
          startDate ? <Caption>Since {dayMonth(startDate)}</Caption> : undefined
        }
      />
      {phase && read ? (
        <RuleLines phase={phase} omitFundedProfit className="mt-2" />
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-3 text-[13px] text-muted">
          <p className="min-w-0 flex-1">
            {phase?.archived
              ? 'Its account is archived, so Keel has no rules to read here.'
              : phase?.accountId
                ? "No rules yet. Add the firm's limits and Keel tracks this phase like the others."
                : "No account linked to this phase yet. Link one and add the firm's limits, and Keel tracks it like the others."}
          </p>
          <Button variant="secondary" size="sm" onClick={onEdit}>
            Set up rules
          </Button>
        </div>
      )}
    </section>
  );
}

/**
 * The five figures of the phase's trades, in a strip: win rate, average win,
 * average loss, best day and worst day. Always net money in the account's own
 * currency (the module's rule); a figure with nothing behind it reads None.
 */
export function StatsCard({
  label,
  stats,
  currency,
}: {
  label: string;
  stats: PhaseStats;
  currency: string;
}): React.JSX.Element {
  const display = useDisplay();
  const money = (cents: Cents | null) =>
    cents === null ? null : (
      <span className={signTone(cents)}>
        <FigureText f={display.cash(cents, true, currency)} />
      </span>
    );
  const items: { id: MetricId; label: string; value: React.ReactNode }[] = [
    {
      id: 'win-rate',
      label: 'Win rate',
      value: stats.winRate === null ? null : formatPct(stats.winRate, 1),
    },
    { id: 'avg-win', label: 'Average win', value: money(stats.avgWin) },
    { id: 'avg-loss', label: 'Average loss', value: money(stats.avgLoss) },
    { id: 'best-day', label: 'Best day', value: money(stats.bestDay) },
    { id: 'worst-day', label: 'Worst day', value: money(stats.worstDay) },
  ];
  return (
    <section
      aria-label={`${label} phase figures`}
      className={`${CARD} px-5 py-4`}
    >
      <dl className="m-0 grid grid-cols-2 gap-x-0 gap-y-4 sm:grid-cols-5">
        {items.map((it, i) => (
          <div
            key={it.id}
            data-stat={it.label}
            className={`min-w-0 px-4 ${i % 2 === 0 ? 'max-sm:pl-0' : 'max-sm:border-l max-sm:border-line'} sm:first:pl-0 sm:not-first:border-l sm:not-first:border-line`}
          >
            <dt className="text-[12.5px] text-faint">
              <MetricTip id={it.id} basis="net">
                {it.label}
              </MetricTip>
            </dt>
            <dd
              data-value=""
              className="m-0 mt-1 text-[19px] leading-tight font-semibold tracking-[-0.02em] tabular-nums"
            >
              {it.value ?? <span className="text-faint">None</span>}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** The address of one trade, without the page's own parameters. */
const tradeHref = (id: string): string =>
  `/app/trades/${encodeURIComponent(id)}`;

const TH =
  'h-[34px] border-b border-line pr-2.5 text-left text-[12px] font-medium whitespace-nowrap text-faint last:pr-0';
const TD =
  'h-[38px] border-b border-line/70 pr-2.5 whitespace-nowrap last:pr-0';

/**
 * The phase's closed trades, the newest five, then a link to Trades filtered to
 * the account (from the phase's start day, closed trades only, so the link's
 * count is the list's), and Import into this account. Below `sm` each trade is
 * a two-line row.
 */
export function TradesCard({
  label,
  account,
  trades,
  startDate,
  timeZone,
  phone,
}: {
  label: string;
  account: Account | undefined;
  /** The phase's trades (`phaseTradesOf`). */
  trades: readonly Trade[];
  startDate?: string;
  timeZone: string;
  phone: boolean;
}): React.JSX.Element {
  const headingId = useId();
  const display = useDisplay();
  const newest = useMemo(() => closedInOrder(trades).reverse(), [trades]);
  const shown = newest.slice(0, SHOWN);
  const filter = new URLSearchParams();
  if (account) filter.set('account', account.id);
  if (startDate) filter.set('from', startDate);
  filter.set('status', 'closed');
  const net = (t: Trade) => (
    <FigureText f={display.cash(t.net, true, t.pnlCurrency)} />
  );
  return (
    <section
      aria-labelledby={headingId}
      className={`${CARD} ${CARD_PAD} flex min-w-0 flex-col`}
    >
      <CardHeader
        headingId={headingId}
        title="Trades"
        after={
          account ? (
            <Caption>
              {label} phase, {newest.length} {plural(newest.length, 'trade')}
            </Caption>
          ) : undefined
        }
        end={
          account && account.status === 'active' ? (
            <Link
              href={`/app/import?account=${encodeURIComponent(account.id)}`}
              className={`${buttonClasses('secondary', 'sm')} no-underline outline-offset-2 focus-visible:outline-2 focus-visible:outline-accent`}
            >
              <UploadSimple size={15} aria-hidden="true" />
              Import into this account
            </Link>
          ) : undefined
        }
      />
      {shown.length === 0 ? (
        <p className="mt-3 pb-2 text-[13.5px] text-muted">
          {account
            ? 'No trades in this phase yet.'
            : 'No account linked to this phase yet. Link one with Edit.'}
        </p>
      ) : phone ? (
        <ul aria-label="Phase trades" className="m-0 mt-2 list-none p-0">
          {shown.map((t) => (
            <li key={t.id} className="border-t border-line/70 first:border-t-0">
              <Link
                href={tradeHref(t.id)}
                className="flex min-h-[60px] min-w-0 flex-col justify-center gap-1 py-2 text-[13px] no-underline outline-offset-[-2px] focus-visible:outline-2 focus-visible:outline-accent active:bg-sunken/60"
              >
                <span className="flex min-w-0 items-baseline justify-between gap-3">
                  <InstrumentName
                    trade={t}
                    timeZone={timeZone}
                    showExpiry={false}
                    className="flex-nowrap! text-[14px]"
                  />
                  <span
                    className={`flex-none text-[14px] font-semibold tabular-nums ${signTone(t.net)}`}
                  >
                    {net(t)}
                  </span>
                </span>
                <span className="flex min-h-5 min-w-0 items-center gap-3 text-[12.5px] text-muted">
                  <TradeTime
                    text={shortTime(t.closedAt, timeZone)}
                    className="text-[12.5px]"
                  />
                  <span className="flex-none">
                    {t.direction === 'long' ? 'Long' : 'Short'}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <table
          aria-label="Phase trades"
          className="mt-2 w-full table-fixed border-collapse text-[13.5px]"
        >
          <colgroup>
            <col style={{ width: '30%' }} />
            <col />
            <col style={{ width: '16%' }} />
            <col style={{ width: '22%' }} />
          </colgroup>
          <thead>
            <tr>
              <th scope="col" className={TH}>
                Closed
              </th>
              <th scope="col" className={TH}>
                Instrument
              </th>
              <th scope="col" className={TH}>
                Side
              </th>
              <th scope="col" className={`${TH} text-right`}>
                Net P&L
              </th>
            </tr>
          </thead>
          <tbody>
            {shown.map((t) => (
              <tr key={t.id}>
                <td className={TD}>
                  <TradeTime text={shortTime(t.closedAt, timeZone)} />
                </td>
                <td className={`${TD} overflow-hidden`}>
                  <Link
                    href={tradeHref(t.id)}
                    className="inline-flex min-w-0 rounded-chip underline-offset-4 outline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-accent"
                  >
                    <InstrumentName trade={t} timeZone={timeZone} />
                  </Link>
                </td>
                <td className={TD}>
                  <SideChip side={t.direction} />
                </td>
                <td
                  className={`${TD} text-right font-semibold tabular-nums ${signTone(t.net)}`}
                >
                  {net(t)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {newest.length > 0 ? (
        <Link
          href={`/app/trades?${filter.toString()}`}
          className="mt-3 inline-flex min-h-6 self-start rounded-chip text-[13px] font-semibold text-accent-ink outline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:min-h-11 pointer-coarse:items-center"
        >
          All {newest.length} {plural(newest.length, 'trade')} in Trades
        </Link>
      ) : null}
    </section>
  );
}
