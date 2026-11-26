'use client';

import { useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import {
  CaretLeft,
  CaretRight,
  Info,
  PencilSimple,
  SealCheck,
  Trash,
  Warning,
} from '@phosphor-icons/react/dist/ssr';
import { FigureText } from '@/components/product/figure-text';
import { Button } from '@/components/ui/button';
import { buttonClasses } from '@/components/ui/button-styles';
import { SideChip } from '@/components/ui/chip';
import { Segmented } from '@/components/ui/segmented';
import { StateGlyph } from '@/components/ui/state-glyph';
import { MetricTip } from '@/components/ui/metric-tip';
import type { MetricId } from '@/content/metric-definitions';
import { metricContextOf } from '@/data/metrics';
import { useGlobalFilters, useTradeSet } from '@/data/query/derived';
import {
  useAccounts,
  usePrefs,
  useRemoveTrades,
  useStrategies,
  useTagCategories,
  useTags,
  useTrade,
  useUpdateTrades,
} from '@/data/query/hooks';
import { StorageUnavailableError } from '@/data/repository';
import { LOG_VIEW_HREF, useLastLogView } from '@/lib/log-view';
import { heldMs, netRoiOf, statusOf } from '@/data/trade-rows';
import {
  withRuleCheck,
  withTagPick,
  type TradePatch,
} from '@/data/trade-patch';
import { closedQty, moneyPerPip } from '@/domain/metrics/units';
import { costBasis, type MetricContext } from '@/domain/metrics/context';
import { plannedReward, plannedRisk, sidesOf } from '@/domain/risk';
import { plannedR, rOf, tradeVolume } from '@/domain/metrics/summary';
import {
  strategyRules,
  type Execution,
  type PnlBasis,
  type Trade,
} from '@/domain/types';
import {
  formatUnitValue,
  tradeFigure,
  useDisplay,
  type Display,
} from '@/lib/display';
import { formatDuration, formatInstrument, plural } from '@/lib/format';
import { CARD, CardHeader, InstrumentName } from '../dashboard/shared';
import { ConfirmDialog } from '../confirm-dialog';
import { ManageTagsLink } from '../tag-picker';
import type { NoteEditorHandle } from '../notes/note-editor';
import { price } from '@/lib/format';
import { StatusChip } from './cells';
import { qty } from './columns';
import { FillsTimeline, positions, sortedFills } from './fills-timeline';
import { LevelsBlock, noun } from './levels-block';
import { RatingRow } from '../routine/rating-row';
import { RuleChecklist } from './rule-checklist';
import { clock } from '@/lib/time-format';
import { clockOnDay, dayLabel } from './trade-time';
import {
  DayNote,
  dayNoteDate,
  StrategyPicker,
  TagRows,
  TradeNote,
} from './trade-journal';

const PAD = 'px-5 pt-[18px] pb-4';

type Save = (patch: TradePatch | ((t: Trade) => TradePatch)) => void;

function Skeleton(): React.JSX.Element {
  return (
    <div
      role="status"
      aria-label="Loading the trade"
      className="flex flex-col gap-4 px-5 pt-1 pb-5 lg:pt-0"
    >
      <div className={`${CARD} h-[112px]`} aria-hidden="true" />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_390px]">
        <div className={`${CARD} h-[420px]`} aria-hidden="true" />
        <div className={`${CARD} h-[420px]`} aria-hidden="true" />
      </div>
    </div>
  );
}

function Message({
  icon,
  title,
  body,
  children,
  role,
}: {
  icon: typeof Warning;
  title: string;
  body?: string;
  children?: React.ReactNode;
  role?: 'alert';
}): React.JSX.Element {
  return (
    <div
      role={role}
      className="mx-auto flex w-full max-w-[520px] flex-col items-center px-5 py-16 text-center"
    >
      <StateGlyph icon={icon} />
      <h2 className="mt-5 text-[17px] leading-snug font-semibold tracking-[-0.015em] text-balance text-text">
        {title}
      </h2>
      {body ? (
        <p className="mt-2 text-[15px] leading-[1.6] text-pretty text-muted">
          {body}
        </p>
      ) : null}
      {children ? <div className="mt-6">{children}</div> : null}
    </div>
  );
}

function Stat({
  label,
  tip,
  basis,
  sub,
  tone = '',
  children,
}: {
  label: string;
  /** The metric whose definition the label carries. */
  tip?: MetricId;
  basis?: PnlBasis;
  sub?: React.ReactNode;
  tone?: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className="min-w-0 bg-surface-1 px-3.5 py-3 first:pl-0 max-sm:[&:nth-child(2n+1)]:pl-0 sm:[&:nth-child(4n+1)]:pl-0 sm:[&:not(:nth-child(4n+1))]:pl-4">
      <span className="block text-xs text-faint">
        {tip && basis ? (
          <MetricTip id={tip} basis={basis}>
            {label}
          </MetricTip>
        ) : (
          label
        )}
      </span>
      <b
        className={`mt-0.5 block text-[17px] leading-8 font-semibold tracking-[-0.02em] tabular-nums ${tone}`}
      >
        {children}
      </b>
      {sub ? (
        <small className="mt-px block text-xs leading-[1.4] text-faint">
          {sub}
        </small>
      ) : null}
    </div>
  );
}

const tone = (cents: number) =>
  cents < 0 ? 'text-loss' : cents > 0 ? 'text-gain' : '';

function sum(list: readonly Execution[], pick: (e: Execution) => number) {
  return list.reduce((n, e) => n + pick(e), 0);
}

function Stats({
  trade,
  display,
  basis,
  ctx,
  readOnly,
  save,
}: {
  trade: Trade;
  display: Display;
  basis: 'net' | 'gross';
  ctx: MetricContext;
  readOnly: boolean;
  save: Save;
}): React.JSX.Element {
  const cur = trade.pnlCurrency;
  const tick = trade.instrument.tickSize;
  const cash = (cents: number, signed = true) => (
    <FigureText f={display.cash(cents, signed, cur)} />
  );
  const into = trade.direction === 'long' ? 'buy' : 'sell';
  const entries = trade.executions.filter((e) => e.side === into);
  const exits = trade.executions.filter((e) => e.side !== into);
  const commission = sum(trade.executions, (e) => e.commission);
  const exchange = sum(trade.executions, (e) => e.fees);
  const future = trade.instrument.assetClass === 'future';
  const dir = trade.direction === 'long' ? 1 : -1;
  const move =
    trade.avgExit === undefined
      ? undefined
      : (trade.avgExit - trade.avgEntry) * dir;
  // Realized R needs a closed trade (spec §5.2).
  const r = trade.status === 'open' ? undefined : rOf(trade, basis);
  const planned = plannedR(trade);
  const rText = (n: number, signed: boolean) =>
    formatUnitValue('r', n, { currency: cur, signed });
  // The plan: the sides as the trade has them (levels, or the old single
  // stop and target read as one level each), and the figures they make.
  const sides = sidesOf(trade);
  const reward = plannedReward(trade);
  const risk = plannedRisk(trade);
  const needsBoth = 'needs a target and a stop';
  const per = future ? 'points' : `per ${noun(trade, 1)}`;
  const held = heldMs(trade);

  // The unit rows: the same functions every report reads, so the page agrees
  // with them. A row the asset class lacks is absent.
  const fig = tradeFigure(trade, ctx);
  const forex = trade.instrument.assetClass === 'forex';
  const unitRows: React.ReactNode[] = [];
  if (future) {
    const opened = tradeVolume(trade);
    const closed = closedQty(trade);
    const units = (key: 'points' | 'ticks', label: string) => {
      const v = fig[key];
      return (
        <Stat
          key={key}
          label={label}
          tone={v === null || v === undefined ? '' : tone(v)}
        >
          {v === null || v === undefined ? (
            <span className="text-[14px] font-normal text-faint">None</span>
          ) : (
            formatUnitValue(key, v, { currency: cur, signed: true })
          )}
        </Stat>
      );
    };
    unitRows.push(
      units('points', 'Points'),
      units('ticks', 'Ticks'),
      <Stat key="contracts" label="Contracts">
        {closed < opened - 1e-9
          ? `${qty(closed)} of ${qty(opened)} closed`
          : qty(opened)}
      </Stat>,
    );
  }
  if (forex) {
    const pips = fig.pips ?? null;
    const perPip = moneyPerPip(trade);
    unitRows.push(
      <Stat
        key="pips"
        label="Pips"
        tone={pips === null ? '' : tone(pips)}
        sub="per lot"
      >
        {pips === null ? (
          <span className="text-[14px] font-normal text-faint">None</span>
        ) : (
          formatUnitValue('pips', pips, { currency: cur, signed: true })
        )}
      </Stat>,
      <Stat key="per-pip" label="Money per pip" sub="gross P&L over pips">
        {perPip === null ? (
          <span className="text-[14px] font-normal text-faint">None</span>
        ) : (
          cash(perPip, false)
        )}
      </Stat>,
    );
  }
  // Whole rows only, so the hairlines between cells never show an empty one.
  const fillers = (rows: number) => (4 - (rows % 4)) % 4;
  const blanks = (rows: number, name: string) =>
    Array.from({ length: fillers(rows) }, (_, i) => (
      <div key={`${name}-${i}`} aria-hidden="true" className="bg-surface-1" />
    ));

  const GRID =
    'grid grid-cols-2 gap-px bg-line sm:grid-cols-4 [&>div]:border-0';
  // Eight cells: Swap shares the second row with Gross P&L and Fees (spec §5.4).
  const FIRST_CELLS = 8;
  const realizedSub =
    r !== undefined && trade.initialRisk !== undefined ? (
      <>
        {basis} over {cash(trade.initialRisk, false)} risk
      </>
    ) : sides.stops === undefined ? (
      'needs a stop'
    ) : trade.status === 'open' ? (
      'after the trade closes'
    ) : (
      'needs a risk above 0'
    );
  const none = <span className="text-[14px] font-normal text-faint">None</span>;

  return (
    <>
      <div className={`mt-3.5 border-t border-line ${GRID}`}>
        <Stat
          label="Avg entry"
          sub={`${entries.length} ${plural(entries.length, into)}, ${qty(sum(entries, (e) => e.qty))} ${noun(
            trade,
            sum(entries, (e) => e.qty),
          )}`}
        >
          {price(trade.avgEntry, tick)}
        </Stat>
        <Stat
          label="Avg exit"
          sub={
            trade.avgExit === undefined
              ? 'Still open'
              : `${exits.length} ${plural(exits.length, into === 'buy' ? 'sell' : 'buy')}, ${qty(sum(exits, (e) => e.qty))} ${noun(
                  trade,
                  sum(exits, (e) => e.qty),
                )}`
          }
        >
          {trade.avgExit === undefined ? (
            <span className="text-[14px] font-normal text-faint">None</span>
          ) : (
            price(trade.avgExit, tick)
          )}
        </Stat>
        <Stat label="Quantity" sub={`max position, ${noun(trade, 2)}`}>
          {qty(trade.maxPosition)}
        </Stat>
        <Stat
          label="Duration"
          sub={held === undefined ? 'since entry' : 'entry to flat'}
        >
          {held === undefined ? (
            <span className="text-[14px] font-normal text-faint">Open</span>
          ) : (
            formatDuration(held)
          )}
        </Stat>
        <Stat
          label="Gross P&L"
          tone={tone(trade.gross)}
          sub={
            move === undefined
              ? undefined
              : `${move > 0 ? '+' : move < 0 ? '−' : ''}${price(Math.abs(move), tick)} ${per} on ${qty(trade.maxPosition)}`
          }
        >
          {cash(trade.gross)}
        </Stat>
        <Stat
          label="Fees"
          sub={
            <>
              {cash(commission, false)} commission, {cash(exchange, false)}{' '}
              exchange
            </>
          }
        >
          {cash(-trade.fees)}
        </Stat>
        <Stat
          label="Swap"
          tip="swap"
          basis={basis}
          tone={trade.swap === undefined ? '' : tone(trade.swap)}
          sub={trade.swap === undefined ? undefined : 'from the import'}
        >
          {trade.swap === undefined ? none : cash(trade.swap)}
        </Stat>
        <Stat label="Cost basis" sub="entry price x size">
          {cash(costBasis(trade), false)}
        </Stat>
        {blanks(FIRST_CELLS, 'first')}
      </div>

      <div
        role="group"
        aria-labelledby="plan-h"
        className="border-t border-line pt-3.5 pb-1.5"
      >
        <b id="plan-h" className="text-[13.5px] font-semibold">
          Plan
        </b>
        <div
          aria-hidden="true"
          className="mt-2 grid grid-cols-[128px_minmax(0,1fr)] gap-x-[18px] max-sm:hidden"
        >
          <span />
          <span className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_32px] gap-x-2 pb-1 text-xs text-faint">
            <span>Level</span>
            <span>Quantity</span>
          </span>
        </div>
        <LevelsBlock
          trade={trade}
          side="target"
          value={sides.targets}
          readOnly={readOnly}
          onCommit={(next) => save({ targets: next })}
        />
        <p className="my-2.5 flex items-center gap-2.5 text-[12.5px] whitespace-nowrap text-faint before:h-0 before:flex-none before:basis-[128px] before:border-t before:border-dashed before:border-line-2 after:h-0 after:flex-1 after:border-t after:border-dashed after:border-line-2 max-sm:before:flex-1 max-sm:before:basis-0">
          <span>
            Avg entry{' '}
            <b className="font-semibold text-text tabular-nums">
              {price(trade.avgEntry, tick)}
            </b>
            , {qty(trade.maxPosition)} {noun(trade, trade.maxPosition)}
          </span>
        </p>
        <LevelsBlock
          trade={trade}
          side="stop"
          value={sides.stops}
          readOnly={readOnly}
          onCommit={(next) => save({ stops: next })}
        />
        <div className={`mt-3 border-t border-line ${GRID}`}>
          <Stat
            label="Planned R"
            tip="planned-r"
            basis={basis}
            sub={
              planned !== undefined
                ? 'reward over risk'
                : reward === undefined
                  ? needsBoth
                  : 'needs a risk above 0'
            }
          >
            {planned === undefined ? none : rText(planned, false)}
          </Stat>
          <Stat
            label="Realized R"
            tip="realized-r"
            basis={basis}
            tone={r === undefined ? '' : tone(r)}
            sub={realizedSub}
          >
            {r === undefined ? none : rText(r, true)}
          </Stat>
          <Stat
            label="Planned reward"
            tip="planned-reward"
            basis={basis}
            sub={reward === undefined ? needsBoth : 'if every target fills'}
          >
            {reward === undefined ? none : cash(reward, false)}
          </Stat>
          <Stat
            label="Planned risk"
            tip="planned-risk"
            basis={basis}
            sub={risk === undefined ? needsBoth : 'if every stop fills'}
          >
            {risk === undefined ? none : cash(risk, false)}
          </Stat>
        </div>
      </div>

      <div className={`border-t border-line ${GRID}`}>
        <Stat
          label="MAE"
          tip="mae"
          basis={basis}
          tone={trade.mae === undefined ? '' : tone(trade.mae)}
          sub="worst open P&L"
        >
          {trade.mae === undefined ? (
            <span className="text-[14px] font-normal text-faint">
              Not recorded
            </span>
          ) : (
            cash(trade.mae)
          )}
        </Stat>
        <Stat
          label="MFE"
          tip="mfe"
          basis={basis}
          tone={trade.mfe === undefined ? '' : tone(trade.mfe)}
          sub="best open P&L"
        >
          {trade.mfe === undefined ? (
            <span className="text-[14px] font-normal text-faint">
              Not recorded
            </span>
          ) : (
            cash(trade.mfe)
          )}
        </Stat>
        {unitRows}
        {blanks(2 + unitRows.length, 'last')}
      </div>
    </>
  );
}

function Executions({
  trade,
  timeZone,
  display,
}: {
  trade: Trade;
  timeZone: string;
  display: Display;
}): React.JSX.Element {
  const fills = sortedFills(trade);
  const held = positions(trade, fills);
  const tick = trade.instrument.tickSize;
  const cash = (cents: number) => (
    <FigureText f={display.cash(cents, false, trade.pnlCurrency)} />
  );
  const TH =
    'h-9 border-b border-line pr-3.5 text-left text-xs font-medium text-faint last:pr-0';
  const TD = 'h-9 border-b border-line/70 pr-3.5 last:pr-0';
  return (
    <div className="relative mt-3.5 overflow-x-auto">
      <table
        aria-label="Executions"
        className="w-full min-w-[560px] border-collapse text-[13.5px]"
      >
        <thead>
          <tr>
            <th scope="col" className={TH}>
              Time
            </th>
            <th scope="col" className={TH}>
              Side
            </th>
            <th scope="col" className={`${TH} text-right`}>
              Quantity
            </th>
            <th scope="col" className={`${TH} text-right`}>
              Price
            </th>
            <th scope="col" className={`${TH} text-right`}>
              Position
            </th>
            <th scope="col" className={`${TH} text-right`}>
              Exchange fees
            </th>
            <th scope="col" className={`${TH} text-right`}>
              Commission
            </th>
          </tr>
        </thead>
        <tbody>
          {fills.map((f, i) => (
            <tr key={f.id}>
              <td
                className={`${TD} font-semibold whitespace-nowrap tabular-nums`}
              >
                {clockOnDay(f.time, trade.openedAt, timeZone)}
              </td>
              <td className={TD}>
                <span className="inline-flex h-[22px] items-center rounded-[7px] bg-sunken px-2 text-xs font-semibold text-muted">
                  {f.side === 'buy' ? 'Buy' : 'Sell'}
                </span>
              </td>
              <td className={`${TD} text-right tabular-nums`}>{qty(f.qty)}</td>
              <td className={`${TD} text-right font-medium tabular-nums`}>
                {price(f.price, tick)}
              </td>
              <td
                className={`${TD} text-right tabular-nums ${held[i] === 0 ? 'text-faint' : ''}`}
              >
                {held[i] === 0
                  ? 'Flat'
                  : `${held[i]! > 0 ? '+' : '−'}${qty(Math.abs(held[i]!))}`}
              </td>
              <td className={`${TD} text-right text-muted tabular-nums`}>
                {cash(f.fees)}
              </td>
              <td className={`${TD} text-right text-muted tabular-nums`}>
                {cash(f.commission)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="font-semibold text-text">
            <td className="h-[38px] pr-3.5">Total</td>
            <td />
            <td className="pr-3.5 text-right tabular-nums">
              {qty(sum(fills, (e) => e.qty))}
            </td>
            <td />
            <td />
            <td className="pr-3.5 text-right tabular-nums">
              {cash(sum(fills, (e) => e.fees))}
            </td>
            <td className="text-right tabular-nums">
              {cash(sum(fills, (e) => e.commission))}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

const NAV =
  'flex h-8 w-full items-center gap-1.5 rounded-control border border-line bg-surface-1 px-2.5 text-[13px] font-medium text-muted outline-offset-2 hover:border-line-2 hover:text-text focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:h-11';

/** Previous or Next: a link that keeps the filters, or a faint stub when there is none. */
function Neighbour({
  trade,
  next,
  href,
  timeZone,
}: {
  trade: Trade | undefined;
  next: boolean;
  href: (id: string) => string;
  timeZone: string;
}): React.JSX.Element {
  const word = next ? 'Next trade' : 'Previous trade';
  if (!trade)
    return (
      <span
        aria-disabled="true"
        className={`${NAV} cursor-default justify-between border-dashed text-faint`}
      >
        {next ? null : <CaretLeft size={14} aria-hidden="true" />}
        <span>No {next ? 'later' : 'earlier'} trade</span>
        {next ? <CaretRight size={14} aria-hidden="true" /> : null}
      </span>
    );
  const name = formatInstrument(
    trade.instrument,
    trade.openedAt,
    timeZone,
  ).name;
  return (
    <Link
      href={href(trade.id)}
      aria-label={`${word}, ${trade.serial} ${name}`}
      className={`${NAV} ${next ? 'justify-end' : ''}`}
    >
      {next ? null : (
        <CaretLeft
          size={14}
          aria-hidden="true"
          className="flex-none text-faint"
        />
      )}
      <span className="min-w-0 truncate">
        <b className="font-semibold text-text tabular-nums">{trade.serial}</b>{' '}
        {name}
      </span>
      {next ? (
        <CaretRight
          size={14}
          aria-hidden="true"
          className="flex-none text-faint"
        />
      ) : null}
    </Link>
  );
}

function NoteCard({
  trade,
  timeZone,
  readOnly,
  handleRef,
}: {
  trade: Trade;
  timeZone: string;
  readOnly: boolean;
  handleRef?: { current: NoteEditorHandle | null };
}): React.JSX.Element {
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'failed'>(
    'idle',
  );
  const [which, setWhich] = useState<'trade' | 'day'>('trade');
  const date = dayNoteDate(trade, timeZone);
  const switchTo = (next: 'trade' | 'day') => {
    setWhich(next);
    setStatus('idle');
  };
  return (
    <section aria-labelledby="note-h" className={`${CARD} ${PAD}`}>
      <CardHeader
        headingId="note-h"
        title="Notes"
        end={
          <span
            role="status"
            className={`text-[12.5px] ${status === 'failed' ? 'text-loss' : 'text-faint'}`}
          >
            {status === 'saving'
              ? 'Saving'
              : status === 'saved'
                ? 'Saved'
                : status === 'failed'
                  ? "Couldn't save the note"
                  : ''}
          </span>
        }
      />
      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <Segmented<'trade' | 'day'>
          label="Note"
          coarseTargets
          value={which}
          options={[
            { value: 'trade', label: 'Trade note' },
            { value: 'day', label: 'Daily note' },
          ]}
          onChange={switchTo}
        />
      </div>
      {which === 'trade' ? (
        <TradeNote
          key={trade.id}
          trade={trade}
          readOnly={readOnly}
          handleRef={handleRef}
          onStatus={setStatus}
        />
      ) : (
        <DayNote
          key={date}
          date={date}
          readOnly={readOnly}
          handleRef={handleRef}
          onStatus={setStatus}
        />
      )}
    </section>
  );
}

function TradePage({
  trade,
  noteHandleRef,
}: {
  trade: Trade;
  noteHandleRef?: { current: NoteEditorHandle | null };
}): React.JSX.Element {
  const display = useDisplay();
  const router = useRouter();
  const queryString = useSearchParams().toString();
  const { filters } = useGlobalFilters();
  const set = useTradeSet(filters);
  const prefs = usePrefs().data!;
  const accounts = useAccounts().data ?? [];
  const strategies = useStrategies().data ?? [];
  const tags = useTags().data ?? [];
  const categories = useTagCategories().data ?? [];
  const updateMany = useUpdateTrades();
  const remove = useRemoveTrades();
  const [saveFailed, setSaveFailed] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const account = accounts.find((a) => a.id === trade.accountId);
  const readOnly = account?.status === 'archived';
  const timeZone = account?.timeZone ?? prefs.timeZone;
  const ctx = useMemo(() => metricContextOf(prefs), [prefs]);
  const basis = ctx.pnlBasis;
  const manual = trade.source === 'manual';
  const cur = trade.pnlCurrency;

  const save: Save = (patch) => {
    setSaveFailed(false);
    updateMany.mutate(
      { ids: [trade.id], patch },
      { onError: () => setSaveFailed(true) },
    );
  };

  const href = (id: string, path = '') =>
    `/app/trades/${encodeURIComponent(id)}${path}${queryString ? `?${queryString}` : ''}`;
  // Back goes to the log view last used in this tab, with the filters it was
  // left with, as the top bar's crumb does (Keel's call: TradeZella opens a drawer).
  const logView = useLastLogView();
  const backHref = `${LOG_VIEW_HREF[logView]}${queryString ? `?${queryString}` : ''}`;

  // The neighbours: by open time within the filtered set (the trade itself is
  // in it even when an archived account would have left it out).
  const { prev, next } = useMemo(() => {
    const list = set.data?.trades ?? [];
    const all = list.some((t) => t.id === trade.id) ? list : [...list, trade];
    const sorted = [...all].sort(
      (a, b) =>
        Date.parse(a.openedAt) - Date.parse(b.openedAt) || a.serial - b.serial,
    );
    const at = sorted.findIndex((t) => t.id === trade.id);
    return { prev: sorted[at - 1], next: sorted[at + 1] };
  }, [set.data?.trades, trade]);

  const roi = netRoiOf(trade);
  // The header's sub-line adds the swap so its figures add up to the net; a
  // trade with none, or a swap of nothing, reads as it always did.
  const swap =
    trade.swap === undefined || trade.swap === 0 ? undefined : trade.swap;
  // Realized R needs a closed trade (spec §5.2).
  const r = trade.status === 'open' ? undefined : rOf(trade, basis);
  const planned = plannedR(trade);
  const fig = display.ofTrade(trade);
  const money = pnlTone(basis === 'gross' ? trade.gross : trade.net);
  const strategyNames = trade.strategyIds.flatMap(
    (id) => strategies.find((s) => s.id === id)?.name ?? [],
  );
  const chosen = trade.strategyIds.flatMap(
    (id) => strategies.find((s) => s.id === id) ?? [],
  );

  const when =
    trade.closedAt === undefined
      ? `${dayLabel(trade.openedAt, timeZone)}, ${clock(trade.openedAt, timeZone)}, still open`
      : `${dayLabel(trade.openedAt, timeZone)}, ${clock(trade.openedAt, timeZone)} to ${clockOnDay(trade.closedAt, trade.openedAt, timeZone)}`;

  const setStrategies = (ids: string[]) =>
    save((t) => {
      const kept = new Set(ids);
      const gone = new Set(
        t.strategyIds
          .filter((id) => !kept.has(id))
          .flatMap((id) => {
            const s = strategies.find((x) => x.id === id);
            return s ? strategyRules(s).map((rule) => rule.id) : [];
          }),
      );
      return {
        strategyIds: ids,
        ruleChecks: t.ruleChecks.filter((c) => !gone.has(c.ruleId)),
      };
    });

  const grade = (ruleId: string, next: boolean | null) =>
    save((t) => ({
      ruleChecks:
        next === null
          ? t.ruleChecks.filter((c) => c.ruleId !== ruleId)
          : (withRuleCheck(t, ruleId, next).ruleChecks ?? []),
    }));

  return (
    <div className="flex flex-col gap-4 px-5 pt-1 pb-6 lg:pt-0">
      <div
        className={`flex flex-wrap items-center gap-x-4 gap-y-2 ${manual && !readOnly ? '' : 'max-sm:hidden'}`}
      >
        <Link
          href={backHref}
          // On a phone the top bar's "Trades" crumb is the way back.
          className="max-sm:hidden inline-flex min-h-8 items-center gap-1.5 rounded-chip text-[13px] font-semibold text-accent-ink outline-offset-2 hover:text-accent-hover focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:min-h-11"
        >
          <CaretLeft size={14} weight="bold" aria-hidden="true" />
          Back to trades
        </Link>
        {manual && !readOnly ? (
          <span className="ml-auto flex items-center gap-2">
            <Link
              href={href(trade.id, '/edit')}
              className={`${buttonClasses('secondary', 'sm')} gap-1.5`}
            >
              <PencilSimple size={16} aria-hidden="true" />
              Edit fills
            </Link>
            <Button
              variant="secondary"
              size="sm"
              className="gap-1.5 text-loss"
              onClick={() => setDeleting(true)}
            >
              <Trash size={16} aria-hidden="true" />
              Delete trade
            </Button>
          </span>
        ) : null}
      </div>

      {readOnly ? (
        <p
          role="status"
          className="flex items-center gap-2 rounded-control bg-sunken px-3.5 py-2.5 text-[13.5px] text-text"
        >
          <Info size={16} aria-hidden="true" className="flex-none text-muted" />
          This account is archived. Its trades are read-only.
        </p>
      ) : null}
      {saveFailed ? (
        <p
          role="alert"
          className="flex items-center gap-2 rounded-control bg-sunken px-3.5 py-2.5 text-[13.5px] text-text"
        >
          <Warning
            size={16}
            aria-hidden="true"
            className="flex-none text-muted"
          />
          Couldn&apos;t save. Try again.
        </p>
      ) : null}

      <section
        aria-label={`Trade ${trade.serial}`}
        className={`${CARD} grid items-center gap-x-3 gap-y-4 max-sm:items-start px-[22px] py-[18px] max-sm:grid-cols-[1.5fr_1fr_1fr] sm:gap-x-0 lg:grid-cols-[minmax(0,1fr)_auto_auto_auto_auto]`}
      >
        <div className="min-w-0 max-sm:col-span-3">
          <h2 className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-[22px] leading-[1.25] font-semibold tracking-[-0.03em] text-text">
            <InstrumentName
              trade={trade}
              timeZone={timeZone}
              className="flex-nowrap"
            />
            <SideChip side={trade.direction} />
            <StatusChip status={statusOf(trade, ctx)} />
            <button
              type="button"
              aria-pressed={trade.reviewed === true}
              disabled={readOnly}
              onClick={() =>
                save({ reviewed: trade.reviewed === true ? undefined : true })
              }
              className={`inline-flex h-7 items-center gap-1.5 rounded-[8px] px-2.5 text-[13px] font-semibold tracking-normal outline-offset-2 focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60 pointer-coarse:h-11 ${trade.reviewed ? 'bg-accent-soft text-accent-ink shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--accent)_18%,transparent)]' : 'text-muted shadow-[inset_0_0_0_1px_var(--line-2)] hover:text-text'}`}
            >
              <SealCheck
                size={16}
                weight={trade.reviewed ? 'fill' : 'regular'}
                aria-hidden="true"
              />
              Reviewed
            </button>
          </h2>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13.5px] text-muted">
            <span className="tabular-nums">{when}</span>
            {account ? <span>{account.name}</span> : null}
            {strategyNames.length > 0 ? (
              <span>{strategyNames.join(', ')}</span>
            ) : null}
          </p>
        </div>

        <div className="min-w-0 lg:border-l lg:border-line lg:px-7">
          <span className="block text-xs text-faint">
            <MetricTip id="pnl" basis={basis} />
          </span>
          <b
            className={`block text-[31px] leading-[1.15] max-sm:text-[22px] font-semibold tracking-[-0.04em] tabular-nums ${money}`}
          >
            <FigureText f={display.figure(fig, true, cur)} />
          </b>
          <small className="block text-xs text-faint">
            <span className="whitespace-nowrap">
              <FigureText f={display.cash(trade.gross, true, cur)} /> gross,
            </span>{' '}
            <span className="whitespace-nowrap">
              <FigureText f={display.cash(-trade.fees, true, cur)} /> fees
              {swap === undefined ? '' : ','}
            </span>
            {swap === undefined ? null : (
              <>
                {' '}
                <span className="whitespace-nowrap">
                  <FigureText f={display.cash(swap, true, cur)} /> swap
                </span>
              </>
            )}
          </small>
        </div>
        <div className="min-w-0 lg:border-l lg:border-line lg:px-7">
          <span className="block text-xs text-faint">
            <MetricTip id="net-roi" basis={basis} />
          </span>
          <b
            className={`block text-[22px] leading-[1.6] font-semibold tracking-[-0.03em] tabular-nums max-sm:text-[18px] ${roi === undefined ? '' : tone(roi)}`}
          >
            {roi === undefined ? (
              <span className="text-[14px] font-normal text-faint">None</span>
            ) : (
              formatUnitValue('percent', roi, { currency: cur, signed: true })
            )}
          </b>
        </div>
        <div className="min-w-0 lg:border-l lg:border-line lg:px-7">
          <span className="block text-xs text-faint">
            <MetricTip id="realized-r" basis={basis} />
          </span>
          <b
            className={`block text-[22px] leading-[1.6] font-semibold tracking-[-0.03em] tabular-nums max-sm:text-[18px] ${r === undefined ? '' : tone(r)}`}
          >
            {r === undefined ? (
              <span className="text-[14px] font-normal text-faint">None</span>
            ) : (
              formatUnitValue('r', r, { currency: cur, signed: true })
            )}
          </b>
          <small className="block text-xs text-faint">
            {planned === undefined
              ? 'add a target for planned R'
              : `of ${formatUnitValue('r', planned, { currency: cur, signed: false })} planned`}
          </small>
        </div>
        <div className="flex flex-col gap-1.5 max-sm:col-span-3 lg:w-[188px] lg:border-l lg:border-line lg:pl-6">
          <Neighbour
            trade={prev}
            next={false}
            href={(id) => href(id)}
            timeZone={timeZone}
          />
          <Neighbour
            trade={next}
            next
            href={(id) => href(id)}
            timeZone={timeZone}
          />
        </div>
      </section>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_390px]">
        <div className="flex min-w-0 flex-col gap-4">
          <section aria-labelledby="exec-h" className={`${CARD} ${PAD}`}>
            <CardHeader
              headingId="exec-h"
              title="Execution"
              after={
                <span className="text-[12.5px] text-faint">
                  {trade.instrument.symbol}
                  {trade.instrument.pointValue !== 1 ? (
                    // A multiplier on the price move, a plain number: nothing for Privacy to hide.
                    <>
                      , ×
                      {trade.instrument.pointValue.toLocaleString('en-US', {
                        maximumFractionDigits: 6,
                      })}{' '}
                      multiplier
                    </>
                  ) : null}
                </span>
              }
            />
            <Stats
              trade={trade}
              display={display}
              basis={basis}
              ctx={ctx}
              readOnly={readOnly}
              save={save}
            />
          </section>

          <section aria-labelledby="fills-h" className={`${CARD} ${PAD}`}>
            <CardHeader
              headingId="fills-h"
              title="Fills"
              after={
                <span className="text-[12.5px] text-faint">
                  {trade.executions.length}{' '}
                  {plural(trade.executions.length, 'execution')}
                </span>
              }
              end={<Legend trade={trade} />}
            />
            <FillsTimeline
              trade={trade}
              timeZone={timeZone}
              display={display}
            />
            <p className="mt-2.5 flex items-start gap-1.5 text-[12.5px] text-faint">
              <Info size={15} aria-hidden="true" className="mt-px flex-none" />
              Plotted from your fills only. The price path between fills needs
              market data, which Keel does not have yet.
            </p>
            <Executions trade={trade} timeZone={timeZone} display={display} />
          </section>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <section aria-labelledby="rules-h" className={`${CARD} ${PAD}`}>
            <CardHeader headingId="rules-h" title="Strategies and rules" />
            <div className="mt-3">
              <StrategyPicker
                strategies={strategies}
                selected={trade.strategyIds}
                disabled={readOnly}
                onChange={setStrategies}
              />
            </div>
            {chosen.map((s) => (
              <RuleChecklist
                key={s.id}
                strategy={s}
                trade={trade}
                ctx={ctx}
                readOnly={readOnly}
                onGrade={grade}
              />
            ))}
          </section>

          <section aria-labelledby="tags-h" className={`${CARD} ${PAD}`}>
            <CardHeader
              headingId="tags-h"
              title="Tags and rating"
              end={<ManageTagsLink header />}
            />
            <TagRows
              categories={categories}
              tags={tags}
              tagIds={trade.tagIds}
              readOnly={readOnly}
              onChange={(ids) => save(withTagPick(trade.tagIds, ids))}
            />
            <RatingRow
              rating={trade.rating}
              disabled={readOnly}
              onChange={(rating) => save({ rating })}
            />
          </section>

          <NoteCard
            trade={trade}
            timeZone={prefs.timeZone}
            readOnly={readOnly}
            handleRef={noteHandleRef}
          />
        </div>
      </div>

      <ConfirmDialog
        open={deleting}
        title="Delete this trade?"
        body="Its fills, tags, rule checks and note link are removed for good. This can't be undone."
        confirmLabel="Delete"
        danger
        onConfirm={async () => {
          await remove.mutateAsync([trade.id]);
          router.push(backHref);
        }}
        onClose={() => setDeleting(false)}
      />
    </div>
  );
}

function pnlTone(cents: number): string {
  return tone(cents);
}

function Legend({ trade }: { trade: Trade }): React.JSX.Element {
  // The chart's zones: one for each side the trade has, saved either way.
  const sides = sidesOf(trade);
  return (
    <span className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
      <span className="inline-flex items-center gap-1.5">
        <svg width="12" height="11" aria-hidden="true" className="fill-text">
          <path d="M6,1 L11,10 L1,10 Z" />
        </svg>
        Buy
      </span>
      <span className="inline-flex items-center gap-1.5">
        <svg
          width="12"
          height="11"
          aria-hidden="true"
          className="fill-surface-1 stroke-text"
        >
          <path
            d="M6,10 L11,1 L1,1 Z"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
        </svg>
        Sell
      </span>
      {sides.targets === undefined ? null : (
        <span className="inline-flex items-center gap-1.5">
          <i
            aria-hidden="true"
            className="inline-block size-2.5 border border-gain-fill bg-gain-soft"
          />
          Target zone
        </span>
      )}
      {sides.stops === undefined ? null : (
        <span className="inline-flex items-center gap-1.5">
          <i
            aria-hidden="true"
            className="inline-block size-2.5 border border-loss-fill bg-loss-soft"
          />
          Risk zone
        </span>
      )}
    </span>
  );
}

/**
 * One trade, where it is journaled: its numbers, fills, rule checks, tags,
 * rating and note. Render inside `<Suspense>` (it reads the URL's filters, for
 * Previous and Next). An archived account's trades are read-only.
 */
export function TradeView({
  id,
  noteHandleRef,
}: {
  id: string;
  /** Test hook: receives the note editor's command handle. */
  noteHandleRef?: { current: NoteEditorHandle | null };
}): React.JSX.Element {
  const trade = useTrade(id);
  const prefs = usePrefs();
  const accounts = useAccounts();
  const strategies = useStrategies();
  const tags = useTags();
  const categories = useTagCategories();
  const queryClient = useQueryClient();
  const search = useSearchParams().toString();
  const logView = useLastLogView();

  const error = [trade, prefs, accounts, strategies, tags, categories].find(
    (q) => q.error,
  )?.error;
  if (error)
    return (
      <Message
        role="alert"
        icon={Warning}
        title={
          error instanceof StorageUnavailableError
            ? "Keel can't open storage in this browser, so your workspace can't load."
            : "This trade couldn't load."
        }
      >
        <Button
          variant="secondary"
          onClick={() => {
            if (error instanceof StorageUnavailableError)
              window.location.reload();
            else void queryClient.resetQueries({ queryKey: ['keel'] });
          }}
        >
          Try again
        </Button>
      </Message>
    );
  if (
    trade.data === undefined ||
    !prefs.data ||
    !accounts.data ||
    !strategies.data ||
    !tags.data ||
    !categories.data
  )
    return <Skeleton />;
  if (trade.data === null)
    return (
      <Message icon={Warning} title="This trade isn't in this workspace.">
        <Link
          href={`${LOG_VIEW_HREF[logView]}${search ? `?${search}` : ''}`}
          className={buttonClasses('secondary')}
        >
          Back to trades
        </Link>
      </Message>
    );
  return <TradePage trade={trade.data} noteHandleRef={noteHandleRef} />;
}
