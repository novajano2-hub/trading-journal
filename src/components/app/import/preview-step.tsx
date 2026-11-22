'use client';

import { Check, Rows, Warning } from '@phosphor-icons/react/dist/ssr';
import { useMemo, useState } from 'react';
import {
  CARD,
  CARD_PAD,
  CardHeader,
  InstrumentName,
  TradeTime,
} from '@/components/app/dashboard/shared';
import { clock } from '@/components/app/trades/trade-time';
import { FigureText } from '@/components/product/figure-text';
import { buttonClasses } from '@/components/ui/button-styles';
import { Chip } from '@/components/ui/chip';
import { useImportPlan } from '@/data/query/derived';
import { useImportContext } from '@/data/query/hooks';
import type { ImportMapping } from '@/domain/import/mapping';
import type { ImportPlan, TradeFlag } from '@/domain/import/plan';
import type { RowIssue } from '@/domain/import/rows';
import type { Account, ImportJob, Trade } from '@/domain/types';
import type { ImportFile } from '@/lib/decode';
import { useDisplay, type Display } from '@/lib/display';
import { plural } from '@/lib/format';
import { ConfirmStep } from './confirm-step';
import { FIELD_LABEL, ISSUE_REASON } from './fields';

const ICON = { 'aria-hidden': true } as const;
const ISSUES_SHOWN = 20;
const ROWS_PER_PAGE = 50;

const TH =
  'h-9 px-2.5 text-left text-[12px] font-medium whitespace-nowrap text-faint first:pl-5 last:pr-5';
const TD = 'h-[38px] px-2.5 align-middle first:pl-5 last:pr-5';
const LINK =
  'cursor-pointer font-semibold text-accent-ink hover:text-accent-hover focus-visible:outline-2 focus-visible:outline-accent';

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/** "9 Nov 19:21", read in the account's zone. */
function stamp(iso: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    day: 'numeric',
    month: 'numeric',
  }).formatToParts(new Date(iso));
  const d = parts.find((p) => p.type === 'day')?.value ?? '';
  const m = Number(parts.find((p) => p.type === 'month')?.value ?? 1);
  return `${d} ${MONTHS[m - 1] ?? ''} ${clock(iso, timeZone, false)}`;
}

/** What a row-level problem reads as; the value it found is shown beside it. */
function issueText(issue: RowIssue): string {
  return `${FIELD_LABEL[issue.field]} ${ISSUE_REASON[issue.code]}`;
}

/** The symbols that need a point value, in words. */
function symbolList(keys: readonly string[]): string {
  if (keys.length <= 1) return keys[0] ?? '';
  return `${keys.slice(0, -1).join(', ')} and ${keys[keys.length - 1]}`;
}

/** The flag's words, for the ones that read as a note under the trade. */
function flagNote(f: TradeFlag): string | null {
  switch (f.code) {
    case 'unconverted-currency':
      return `Not converted from ${f.currency}`;
    case 'expired-worthless':
      return `Expired worthless on ${f.expiry}`;
    case 'direction-flipped':
      return `Now ${f.now}, was ${f.was}: an earlier import overlaps this file`;
    case 'pnl-mismatch':
      return null;
  }
}

/** Step 3: what Keel read and built from the file, and the way to confirm it. */
export function PreviewStep({
  file,
  mapping,
  account,
  onBack,
  onChooseAnother,
  onDone,
}: {
  file: ImportFile;
  mapping: ImportMapping;
  account: Account;
  onBack: () => void;
  onChooseAnother: () => void;
  onDone: (job: ImportJob) => void;
}) {
  const display = useDisplay();
  const context = useImportContext(account.id);
  const [stale, setStale] = useState(false);
  const [onlyFlagged, setOnlyFlagged] = useState(false);
  const [limit, setLimit] = useState(ROWS_PER_PAGE);
  const [allIssues, setAllIssues] = useState(false);

  const planned = useImportPlan({
    parsed: file.parsed,
    mapping,
    accountId: account.id,
    fileName: file.name,
  });
  const plan = planned.data;

  const flagsByTrade = useMemo(() => {
    const out = new Map<string, TradeFlag[]>();
    for (const f of plan?.flags ?? [])
      out.set(f.tradeId, [...(out.get(f.tradeId) ?? []), f]);
    return out;
  }, [plan]);

  if (planned.status === 'error')
    return (
      <section className={`${CARD} ${CARD_PAD} max-w-[640px]`}>
        <p role="alert" className="text-[14px] text-loss">
          Keel couldn&apos;t read this account&apos;s trades to build the
          preview. Go back and try again.
        </p>
        <button
          type="button"
          onClick={onBack}
          className={`${buttonClasses('secondary')} mt-3`}
        >
          Back
        </button>
      </section>
    );
  if (!plan)
    return (
      <p role="status" className="text-[13.5px] text-muted">
        Building the preview...
      </p>
    );

  const closed = plan.trades.filter(
    (t) => t.status === 'closed' && t.pnlCurrency === account.currency,
  );
  const net = closed.reduce((sum, t) => sum + t.net, 0);
  const checks = plan.flags.filter((f) => f.code === 'pnl-mismatch').length;
  const flagged = new Set(plan.flags.map((f) => f.tradeId));
  const hasPnl =
    mapping.kind === 'closed-trades' && mapping.columns.pnl !== undefined;
  const duplicates = plan.duplicateRows.length;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
      {stale ? (
        <p
          role="alert"
          className="flex items-start gap-2.5 rounded-control bg-warn-soft px-3.5 py-3 text-[13px] leading-snug text-text"
        >
          <Warning {...ICON} size={17} className="mt-px shrink-0 text-warn" />
          Your trades changed while you were mapping. Review the preview again.
        </p>
      ) : null}

      <section
        aria-label="What Keel read"
        className={`${CARD} grid grid-cols-2 gap-x-5 gap-y-4 px-5 py-3.5 lg:grid-cols-[repeat(4,1fr)_auto] lg:items-center`}
      >
        <Tile
          label="Rows read"
          value={plan.rowCount}
          sub={`${file.parsed.headers.length} columns`}
        />
        <Tile
          label="Trades built"
          value={plan.trades.length}
          sub={checks > 0 ? `${checks} with a P&L to check` : 'none to check'}
        />
        <Tile
          label="Duplicates skipped"
          value={duplicates}
          sub={duplicates > 0 ? `already in ${account.name}` : 'none found'}
        />
        <Tile
          label="Rows with issues"
          value={plan.issues.length}
          sub={plan.issues.length > 0 ? 'skipped, listed below' : 'none found'}
        />
        {!plan.blocked ? (
          <div className="col-span-2 border-line lg:col-span-1 lg:border-l lg:pl-5">
            <span className="block text-[12px] text-faint">
              Net P&amp;L of the {plan.trades.length}{' '}
              {plural(plan.trades.length, 'trade')}
            </span>
            <b className="text-[22px] font-semibold tracking-[-0.03em] tabular-nums">
              <FigureText f={display.cash(net, true, account.currency)} />
            </b>
          </div>
        ) : null}
      </section>

      {plan.blocked ? (
        <Blocked
          plan={plan}
          account={account}
          onBack={onBack}
          onChooseAnother={onChooseAnother}
        />
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 lg:grid-cols-[minmax(0,1fr)_352px]">
          <div className="min-w-0 max-lg:order-last">
            <TradesCard
              plan={plan}
              account={account}
              hasPnl={hasPnl}
              flagged={flagged}
              flagsByTrade={flagsByTrade}
              onlyFlagged={onlyFlagged}
              onOnlyFlagged={setOnlyFlagged}
              limit={limit}
              onMore={() => setLimit((l) => l + ROWS_PER_PAGE)}
              pointValues={mapping.overrides}
            />
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)] gap-4 max-lg:order-first">
            {plan.issues.length > 0 ? (
              <IssuesCard
                issues={plan.issues}
                all={allIssues}
                onAll={() => setAllIssues(true)}
              />
            ) : null}
            <ConfirmStep
              plan={plan}
              account={account}
              onBack={onBack}
              onStale={() => {
                setStale(true);
                void context.refetch();
              }}
              onDone={onDone}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function Tile({
  label,
  value,
  sub,
}: {
  label: string;
  value: number;
  sub: string;
}) {
  return (
    <div className="min-w-0">
      <span className="block text-[12px] text-faint">{label}</span>
      <b className="block text-[22px] leading-tight font-semibold tracking-[-0.03em] tabular-nums">
        {value.toLocaleString('en-US')}
      </b>
      <small className="block text-[12px] text-faint">{sub}</small>
    </div>
  );
}

/** A plan that cannot be committed: why, and the way out. */
function Blocked({
  plan,
  account,
  onBack,
  onChooseAnother,
}: {
  plan: ImportPlan;
  account: Account;
  onBack: () => void;
  onChooseAnother: () => void;
}) {
  const [allIssues, setAllIssues] = useState(false);
  const head =
    plan.blocked === 'unresolved-symbols'
      ? `${symbolList(plan.unresolvedKeys)} ${plan.unresolvedKeys.length === 1 ? 'needs' : 'need'} a point value`
      : plan.blocked === 'nothing-new'
        ? `Every row is already imported into ${account.name}`
        : 'Keel found no rows it could read';
  const body =
    plan.blocked === 'unresolved-symbols'
      ? "Keel can't price these futures without a point value (dollars per point), so it can't work out their P&L. Set them in the Map step, then come back."
      : plan.blocked === 'nothing-new'
        ? 'Nothing here is new, so there is nothing to add. Choose a different file, or go back if you picked the wrong account.'
        : plan.issues.length > 0
          ? 'Every row was skipped. The reasons are listed; the date order, time zone and columns are the usual cause.'
          : 'The file has no data rows under its header. Choose another file.';
  const primary = buttonClasses('primary');
  const secondary = buttonClasses('secondary');
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 lg:grid-cols-[minmax(0,640px)_352px]">
      <section
        className={`${CARD} ${CARD_PAD}`}
        aria-labelledby="import-blocked"
      >
        <CardHeader
          icon={Warning}
          tone="warn"
          headingId="import-blocked"
          title={head}
        />
        <p className="mt-2.5 text-[14px] leading-normal text-muted">{body}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {plan.blocked === 'unresolved-symbols' ? (
            <button type="button" onClick={onBack} className={primary}>
              Set point values
            </button>
          ) : plan.blocked === 'nothing-new' ? (
            <>
              <button
                type="button"
                onClick={onChooseAnother}
                className={primary}
              >
                Choose another file
              </button>
              <button type="button" onClick={onBack} className={secondary}>
                Back to columns
              </button>
            </>
          ) : (
            <>
              <button type="button" onClick={onBack} className={primary}>
                Back to columns
              </button>
              <button
                type="button"
                onClick={onChooseAnother}
                className={secondary}
              >
                Choose another file
              </button>
            </>
          )}
        </div>
      </section>
      {plan.issues.length > 0 ? (
        <IssuesCard
          issues={plan.issues}
          all={allIssues}
          onAll={() => setAllIssues(true)}
        />
      ) : null}
    </div>
  );
}

function IssuesCard({
  issues,
  all,
  onAll,
}: {
  issues: readonly RowIssue[];
  all: boolean;
  onAll: () => void;
}) {
  const shown = all ? issues : issues.slice(0, ISSUES_SHOWN);
  return (
    <section className={`${CARD} ${CARD_PAD}`} aria-labelledby="import-issues">
      <CardHeader
        icon={Warning}
        tone="neutral"
        headingId="import-issues"
        title="Skipped rows"
        end={
          <span className="text-[12.5px] text-faint">
            {issues.length.toLocaleString('en-US')}{' '}
            {plural(issues.length, 'row')}
          </span>
        }
      />
      <ul className="mt-2.5">
        {shown.map((issue) => (
          <li
            key={issue.rowIndex}
            className="grid grid-cols-[58px_minmax(0,1fr)] gap-2 border-b border-line/70 py-2 last:border-b-0"
          >
            <span className="pt-px text-[12.5px] text-faint tabular-nums">
              Row {issue.rowIndex}
            </span>
            <span className="min-w-0 text-[13px] leading-snug font-semibold text-text">
              {issueText(issue)}
              {issue.value !== '' ? (
                <span className="mt-1 flex items-center gap-1.5 text-[12.5px] font-normal text-muted">
                  {FIELD_LABEL[issue.field]}:
                  <span className="inline-flex h-[22px] max-w-full items-center truncate rounded-chip bg-sunken px-1.5 text-[12px] font-medium">
                    {issue.value}
                  </span>
                </span>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
      {!all && issues.length > ISSUES_SHOWN ? (
        <button
          type="button"
          onClick={onAll}
          className={`${LINK} mt-1 inline-flex min-h-8 items-center rounded-chip text-[12.5px] pointer-coarse:min-h-11`}
        >
          Show all {issues.length}
        </button>
      ) : null}
    </section>
  );
}

function TradesCard({
  plan,
  account,
  hasPnl,
  flagged,
  flagsByTrade,
  onlyFlagged,
  onOnlyFlagged,
  limit,
  onMore,
  pointValues,
}: {
  plan: ImportPlan;
  account: Account;
  hasPnl: boolean;
  flagged: ReadonlySet<string>;
  flagsByTrade: ReadonlyMap<string, TradeFlag[]>;
  onlyFlagged: boolean;
  onOnlyFlagged: (on: boolean) => void;
  limit: number;
  onMore: () => void;
  pointValues: ImportMapping['overrides'];
}) {
  const display = useDisplay();
  const tz = account.timeZone ?? 'UTC';
  const list = onlyFlagged
    ? plan.trades.filter((t) => flagged.has(t.id))
    : plan.trades;
  const shown = list.slice(0, limit);
  const points = Object.entries(pointValues)
    .map(
      ([k, v]) =>
        `${k} at ${v.pointValue.toLocaleString('en-US')} dollars a point`,
    )
    .join(', ');

  return (
    <section
      className={`${CARD} overflow-hidden pt-[18px]`}
      aria-labelledby="import-trades"
    >
      <CardHeader
        className="px-5"
        icon={Rows}
        tone="accent"
        headingId="import-trades"
        title="Trades Keel built"
        end={
          points ? (
            <span className="hidden text-[12.5px] text-faint xl:inline">
              Point values: {points}
            </span>
          ) : undefined
        }
      />
      <div className="relative mt-2.5 overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-line">
              <th scope="col" className={TH}>
                Instrument
              </th>
              <th scope="col" className={TH}>
                Side
              </th>
              <th scope="col" className={TH}>
                Opened
              </th>
              <th scope="col" className={TH}>
                Closed
              </th>
              <th scope="col" className={`${TH} text-right`}>
                Qty
              </th>
              <th scope="col" className={`${TH} text-right`}>
                Keel net
              </th>
              <th scope="col" className={`${TH} text-right`}>
                File P&amp;L
              </th>
            </tr>
          </thead>
          <tbody>
            {shown.map((t) => (
              <TradeRows
                key={t.id}
                trade={t}
                tz={tz}
                account={account}
                hasPnl={hasPnl}
                flags={flagsByTrade.get(t.id) ?? []}
                highlighted={flagged.has(t.id)}
                display={display}
              />
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line px-5 py-3 text-[12.5px] text-faint">
        <span>
          Showing {shown.length.toLocaleString('en-US')} of{' '}
          {list.length.toLocaleString('en-US')}. Times in {tz}.
        </span>
        {shown.length < list.length ? (
          <button type="button" onClick={onMore} className={LINK}>
            Show {Math.min(ROWS_PER_PAGE, list.length - shown.length)} more
          </button>
        ) : null}
        {flagged.size > 0 ? (
          <button
            type="button"
            aria-pressed={onlyFlagged}
            onClick={() => onOnlyFlagged(!onlyFlagged)}
            className={`${LINK} ml-auto`}
          >
            {onlyFlagged
              ? 'Show all trades'
              : `Show only the ${flagged.size} to check`}
          </button>
        ) : null}
      </div>
    </section>
  );
}

function TradeRows({
  trade: t,
  tz,
  account,
  hasPnl,
  flags,
  highlighted,
  display,
}: {
  trade: Trade;
  tz: string;
  account: Account;
  hasPnl: boolean;
  flags: readonly TradeFlag[];
  highlighted: boolean;
  display: Display;
}) {
  const mismatch = flags.find((f) => f.code === 'pnl-mismatch');
  const notes = flags.map(flagNote).filter((n): n is string => n !== null);
  const open = t.status === 'open';
  const shade = highlighted ? 'bg-sunken/80' : '';
  return (
    <>
      <tr
        className={`${shade} ${notes.length === 0 ? 'border-b border-line/70' : ''}`}
      >
        <td className={TD}>
          <InstrumentName trade={t} timeZone={tz} />
        </td>
        <td className={TD}>
          <span className="inline-flex h-[22px] items-center rounded-chip bg-sunken px-2 text-[12px] font-medium text-muted">
            {t.direction === 'long' ? 'Long' : 'Short'}
          </span>
        </td>
        <td className={TD}>
          <TradeTime text={stamp(t.openedAt, tz)} />
        </td>
        <td className={TD}>
          {t.closedAt ? (
            <TradeTime text={stamp(t.closedAt, tz)} />
          ) : (
            <span className="text-muted">Still open</span>
          )}
        </td>
        <td className={`${TD} text-right tabular-nums`}>
          {t.maxPosition.toLocaleString('en-US')}
        </td>
        <td
          className={`${TD} text-right font-semibold tabular-nums ${t.net < 0 ? 'text-loss' : t.net > 0 ? 'text-gain' : ''}`}
        >
          {open ? (
            <span className="font-normal text-muted">Open</span>
          ) : (
            <FigureText f={display.cash(t.net, true, t.pnlCurrency)} />
          )}
        </td>
        <td className={`${TD} text-right tabular-nums`}>
          {mismatch?.code === 'pnl-mismatch' ? (
            <span className="font-semibold text-text underline decoration-faint decoration-dotted underline-offset-[3px]">
              File says{' '}
              <FigureText
                f={display.cash(mismatch.file, true, account.currency)}
              />
            </span>
          ) : hasPnl && !open ? (
            <span className="inline-grid size-5 place-items-center rounded-full bg-accent-soft text-accent">
              <Check {...ICON} size={12} weight="bold" />
              <span className="sr-only">Matches the file</span>
            </span>
          ) : (
            <span className="text-faint">
              -<span className="sr-only"> not in the file</span>
            </span>
          )}
        </td>
      </tr>
      {notes.length > 0 ? (
        <tr className={`${shade} border-b border-line/70`}>
          <td colSpan={7} className="px-5 pb-2 text-[12.5px] leading-snug">
            <Chip tone="warn" className="h-auto min-h-[22px] py-0.5">
              {notes.join('. ')}
            </Chip>
          </td>
        </tr>
      ) : null}
    </>
  );
}
