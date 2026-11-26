'use client';

import { Check, Warning } from '@phosphor-icons/react/dist/ssr';
import { useMemo, useState } from 'react';
import {
  CARD,
  CARD_PAD,
  CardHeader,
  InstrumentName,
  TradeTime,
} from '@/components/app/dashboard/shared';
import { price } from '@/lib/format';
import { clock } from '@/lib/time-format';
import { FigureText } from '@/components/product/figure-text';
import { buttonClasses } from '@/components/ui/button-styles';
import { Chip } from '@/components/ui/chip';
import { useImportPlan } from '@/data/query/derived';
import { useImportContext } from '@/data/query/hooks';
import type { ImportMapping } from '@/domain/import/mapping';
import type { ImportPlan, TradeFlag } from '@/domain/import/plan';
import type { RowIssue } from '@/domain/import/rows';
import { unknownRoots } from '@/domain/import/unknown-symbols';
import type { Account, ImportJob, Trade } from '@/domain/types';
import type { ImportFile } from '@/lib/decode';
import { useDisplay, type Display } from '@/lib/display';
import { plural } from '@/lib/format';
import { zoneLabel } from '@/lib/time-zone-label';
import { ScrollFade } from '@/components/ui/scroll-fade';
import { ConfirmStep } from './confirm-step';
import { FIELD_LABEL, ISSUE_REASON, MONEY_FIELDS } from './fields';
import { HiddenAmount } from './hidden-amount';

const ICON = { 'aria-hidden': true } as const;
const ISSUES_SHOWN = 20;
const ROWS_PER_PAGE = 50;

const TH =
  'h-9 px-2 text-left text-[12px] font-medium whitespace-nowrap text-faint first:pl-5 last:pr-4';
const TD = 'h-[38px] px-2 align-middle first:pl-5 last:pr-4';
/** The first column holds its place below `lg`, where the table scrolls sideways. */
const STICKY =
  'max-lg:sticky max-lg:left-0 max-lg:z-[1] max-lg:shadow-[inset_-1px_0_0_var(--color-line)]';
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
  onSetPoints,
  onDone,
}: {
  file: ImportFile;
  mapping: ImportMapping;
  account: Account;
  onBack: () => void;
  onChooseAnother: () => void;
  /** Back to Map, with the first point-value input in focus. */
  onSetPoints: () => void;
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

  // The roots a point value can be given for; other unresolved symbols can't take one.
  const known = context.data?.overrides;
  const priceable = useMemo(
    () => unknownRoots(file.parsed, mapping, known ?? {}).map((r) => r.key),
    [file.parsed, mapping, known],
  );

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
        Reading the file...
      </p>
    );

  const closed = plan.trades.filter(
    (t) => t.status === 'closed' && t.pnlCurrency === account.currency,
  );
  const net = closed.reduce((sum, t) => sum + t.net, 0);
  const checks = plan.flags.filter((f) => f.code === 'pnl-mismatch').length;
  const flagged = new Set(plan.flags.map((f) => f.tradeId));
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
              Net P&amp;L of the {closed.length}{' '}
              {closed.length === plan.trades.length ? '' : 'closed '}
              {plural(closed.length, 'trade')}
            </span>
            <b
              className={`text-[22px] font-semibold tracking-[-0.03em] tabular-nums ${net < 0 ? 'text-loss' : net > 0 ? 'text-gain' : ''}`}
            >
              <FigureText f={display.cash(net, true, account.currency)} />
            </b>
          </div>
        ) : null}
      </section>

      {plan.blocked ? (
        <Blocked
          plan={plan}
          account={account}
          priceable={priceable}
          onBack={onBack}
          onSetPoints={onSetPoints}
          onChooseAnother={onChooseAnother}
        />
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 lg:grid-cols-[minmax(0,1fr)_352px]">
          <div className="min-w-0 max-lg:order-last max-sm:order-first">
            <TradesCard
              plan={plan}
              account={account}
              flagged={flagged}
              flagsByTrade={flagsByTrade}
              onlyFlagged={onlyFlagged}
              onOnlyFlagged={setOnlyFlagged}
              limit={limit}
              onMore={() => setLimit((l) => l + ROWS_PER_PAGE)}
              pointValues={mapping.overrides}
              hasPnl={
                mapping.kind === 'closed-trades' &&
                mapping.columns.pnl !== undefined
              }
            />
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)] gap-4 max-lg:order-first max-sm:order-last">
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
  priceable,
  onBack,
  onSetPoints,
  onChooseAnother,
}: {
  plan: ImportPlan;
  account: Account;
  /** The futures roots Map can ask a point value for. */
  priceable: readonly string[];
  onBack: () => void;
  onSetPoints: () => void;
  onChooseAnother: () => void;
}) {
  const [allIssues, setAllIssues] = useState(false);
  // Unresolved symbols split in two: roots that take a point value, and symbols
  // Keel does not recognise at all (usually the wrong column read as Symbol).
  const unresolved = plan.blocked === 'unresolved-symbols';
  const pricing = unresolved
    ? plan.unresolvedKeys.filter((k) => priceable.includes(k))
    : [];
  const unknown = unresolved
    ? plan.unresolvedKeys.filter((k) => !priceable.includes(k))
    : [];
  const head = unresolved
    ? pricing.length > 0
      ? `${symbolList(pricing)} ${pricing.length === 1 ? 'needs' : 'need'} a point value`
      : `${symbolList(unknown)} ${unknown.length === 1 ? 'is not a symbol' : 'are not symbols'} Keel knows`
    : plan.blocked === 'nothing-new'
      ? `Every row is already imported into ${account.name}`
      : 'Keel found no rows it could read';
  const unknownNote =
    unknown.length === 1
      ? "Keel doesn't recognise the symbol, check the Symbol column."
      : "Keel doesn't recognise these symbols, check the Symbol column.";
  const body = unresolved
    ? pricing.length > 0
      ? "Keel can't price these futures without a point value (dollars per point), so it can't work out their P&L. Set them in the Map step, then come back."
      : unknownNote
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
        <CardHeader headingId="import-blocked" title={head} />
        <p className="mt-2.5 text-[14px] leading-normal text-muted">{body}</p>
        {pricing.length > 0 && unknown.length > 0 ? (
          <p className="mt-2 text-[14px] leading-normal text-muted">
            Keel doesn&apos;t recognise {symbolList(unknown)}, check the Symbol
            column.
          </p>
        ) : null}
        <div className="mt-4 flex flex-wrap gap-2">
          {pricing.length > 0 ? (
            <>
              <button type="button" onClick={onSetPoints} className={primary}>
                Set point values
              </button>
              {unknown.length > 0 ? (
                <button type="button" onClick={onBack} className={secondary}>
                  Back to columns
                </button>
              ) : null}
            </>
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
  const hideMoney = useDisplay().unit === 'privacy';
  return (
    <section className={`${CARD} ${CARD_PAD}`} aria-labelledby="import-issues">
      <CardHeader
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
                    {hideMoney && MONEY_FIELDS.has(issue.field) ? (
                      <HiddenAmount />
                    ) : (
                      issue.value
                    )}
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
  flagged,
  flagsByTrade,
  onlyFlagged,
  onOnlyFlagged,
  limit,
  onMore,
  pointValues,
  hasPnl,
}: {
  plan: ImportPlan;
  account: Account;
  flagged: ReadonlySet<string>;
  flagsByTrade: ReadonlyMap<string, TradeFlag[]>;
  onlyFlagged: boolean;
  onOnlyFlagged: (on: boolean) => void;
  limit: number;
  onMore: () => void;
  pointValues: ImportMapping['overrides'];
  /** Whether the mapping reads a P&L column; without one there is nothing to check. */
  hasPnl: boolean;
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
      <ScrollFade className="mt-2.5">
        <table className="w-full min-w-[780px] border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-line">
              <th scope="col" className={`${TH} ${STICKY} bg-surface-1`}>
                Row
              </th>
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
                Qty
              </th>
              <th scope="col" className={`${TH} text-right`}>
                Entry
              </th>
              <th scope="col" className={`${TH} text-right`}>
                Exit
              </th>
              <th scope="col" className={`${TH} text-right`}>
                Fees
              </th>
              <th scope="col" className={`${TH} text-right`}>
                Keel net
              </th>
              {hasPnl ? (
                <>
                  <th scope="col" className={`${TH} text-right`}>
                    File P&amp;L
                  </th>
                  <th scope="col" className={`${TH} text-center`}>
                    Check
                  </th>
                </>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {shown.map((t) => (
              <TradeRows
                key={t.id}
                trade={t}
                tz={tz}
                account={account}
                filePnl={plan.filePnl[t.id]}
                hasPnl={hasPnl}
                flags={flagsByTrade.get(t.id) ?? []}
                highlighted={flagged.has(t.id)}
                display={display}
              />
            ))}
          </tbody>
        </table>
      </ScrollFade>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line px-5 py-3 text-[12.5px] text-faint">
        <span>
          Showing {shown.length.toLocaleString('en-US')} of{' '}
          {list.length.toLocaleString('en-US')}. Times in {zoneLabel(tz)}.
        </span>
        {!hasPnl ? (
          <span>
            Your file has no P&amp;L column, so there is nothing to check
            Keel&apos;s net against.
          </span>
        ) : null}
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

/** The file's own row number (the header is row 1): the first execution's id carries it. */
function fileRow(t: Trade): number | null {
  const m = /:r(\d+)(?::|$)/.exec(t.executions[0]?.id ?? '');
  return m ? Number(m[1]) : null;
}

function TradeRows({
  trade: t,
  tz,
  account,
  filePnl,
  hasPnl,
  flags,
  highlighted,
  display,
}: {
  trade: Trade;
  tz: string;
  account: Account;
  /** What the file says this trade made; undefined when it has no P&L column. */
  filePnl: number | undefined;
  hasPnl: boolean;
  flags: readonly TradeFlag[];
  highlighted: boolean;
  display: Display;
}) {
  const mismatch = flags.find((f) => f.code === 'pnl-mismatch');
  const notes = flags.map(flagNote).filter((n): n is string => n !== null);
  const open = t.status === 'open';
  const shade = highlighted ? 'bg-sunken/80' : '';
  const row = fileRow(t);
  const tick = t.instrument.tickSize;
  return (
    <>
      <tr
        className={`${shade} ${notes.length === 0 ? 'border-b border-line/70' : ''}`}
      >
        <td
          className={`${TD} ${STICKY} ${highlighted ? 'bg-sunken' : 'bg-surface-1'} text-faint tabular-nums`}
        >
          {row ?? 'None'}
        </td>
        <td className={TD}>
          {t.closedAt ? (
            <TradeTime text={stamp(t.closedAt, tz)} />
          ) : (
            <span className="text-muted">Still open</span>
          )}
        </td>
        <td className={TD}>
          <InstrumentName trade={t} timeZone={tz} />
        </td>
        <td className={TD}>
          <span className="inline-flex h-[22px] items-center rounded-chip bg-sunken px-1.5 text-[12px] font-medium text-muted">
            {t.direction === 'long' ? 'Long' : 'Short'}
          </span>
        </td>
        <td className={`${TD} text-right tabular-nums`}>
          {t.maxPosition.toLocaleString('en-US')}
        </td>
        <td className={`${TD} text-right tabular-nums`}>
          {price(t.avgEntry, tick)}
        </td>
        <td className={`${TD} text-right tabular-nums`}>
          {t.avgExit === undefined ? (
            <span className="text-muted">Open</span>
          ) : (
            price(t.avgExit, tick)
          )}
        </td>
        <td className={`${TD} text-right text-muted tabular-nums`}>
          <FigureText f={display.cash(t.fees, false, t.pnlCurrency)} />
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
        {hasPnl ? (
          <>
            <td className={`${TD} text-right tabular-nums`}>
              {filePnl === undefined ? (
                <span className="text-faint">None</span>
              ) : mismatch?.code === 'pnl-mismatch' ? (
                <span className="font-semibold text-text underline decoration-faint decoration-dotted underline-offset-[3px]">
                  <FigureText
                    f={display.cash(mismatch.file, true, account.currency)}
                  />
                </span>
              ) : (
                <span className="text-muted">
                  <FigureText
                    f={display.cash(filePnl, true, account.currency)}
                  />
                </span>
              )}
            </td>
            <td className={`${TD} text-center`}>
              {mismatch?.code === 'pnl-mismatch' ? (
                <span className="inline-flex h-[22px] items-center rounded-full border border-line-2 bg-surface-1 px-2 text-[12px] font-semibold whitespace-nowrap text-text">
                  Off by&nbsp;
                  <FigureText
                    f={display.cash(
                      Math.abs(mismatch.file - t.net),
                      false,
                      account.currency,
                    )}
                  />
                </span>
              ) : filePnl !== undefined && !open ? (
                <span className="inline-flex text-muted">
                  <Check {...ICON} size={14} />
                  <span className="sr-only">Matches the file</span>
                </span>
              ) : (
                <span className="text-faint">None</span>
              )}
            </td>
          </>
        ) : null}
      </tr>
      {notes.length > 0 ? (
        <tr className={`${shade} border-b border-line/70`}>
          <td
            colSpan={hasPnl ? 11 : 9}
            className="px-5 pb-2 text-[12.5px] leading-snug"
          >
            <Chip tone="warn" className="h-auto min-h-[22px] py-0.5">
              {notes.join('. ')}
            </Chip>
          </td>
        </tr>
      ) : null}
    </>
  );
}
