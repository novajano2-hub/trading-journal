'use client';

import { useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMemo, useRef, useState } from 'react';
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
  useJournal,
  useJournalEntry,
  usePatterns,
  usePrefs,
  useRemoveTrades,
  useStrategies,
  useTagCategories,
  useTags,
  useTrade,
  useUnsetPrefs,
  useUpdatePrefs,
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
import { findDailyEntry } from '../notebook/notebook-model';
import type { NoteEditorHandle } from '../notes/note-editor';
import { NoteMenu } from '../notes/note-menu';
import { price } from '@/lib/format';
import { StatusChip } from './cells';
import { qty } from './columns';
import {
  CostCell,
  FillCostsNote,
  rowKeys,
  RowControls,
  useFillCosts,
} from './fill-costs';
import { FillsTimeline, positions, sortedFills } from './fills-timeline';
import { LevelsBlock, noun } from './levels-block';
import { RatingRow } from '../routine/rating-row';
import { RuleChecklist } from './rule-checklist';
import { PatternsButton } from './patterns-button';
import { StatsChooser, type StatChoice } from './stats-chooser';
import { TradeFiles } from './trade-files';
import { clock, dayLabel as dayName } from '@/lib/time-format';
import { clockOnDay, dayLabel } from './trade-time';
import {
  DayNote,
  dayNoteDate,
  StrategyPicker,
  TagRows,
  TradeNote,
} from './trade-journal';

const PAD = 'px-5 pt-[18px] pb-4';

const EMPTY_DOC = { type: 'doc', content: [{ type: 'paragraph' }] };

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

/**
 * The Execution card's rows in the order the page draws them: what "Choose
 * stats" lists (B51). The first eight sit in the first grid, Targets and Stops
 * are the plan's two level blocks, then the four figures the plan makes, then
 * MAE, MFE and the unit rows the instrument has. Swap follows Fees.
 */
export const STAT_IDS = [
  'avg-entry',
  'avg-exit',
  'quantity',
  'duration',
  'gross-pnl',
  'fees',
  'swap',
  'cost-basis',
  'targets',
  'stops',
  'planned-r',
  'realized-r',
  'planned-reward',
  'planned-risk',
  'mae',
  'mfe',
  'points',
  'ticks',
  'contracts',
  'pips',
  'money-per-pip',
] as const;
export type StatId = (typeof STAT_IDS)[number];

const FIRST_IDS: readonly StatId[] = STAT_IDS.slice(0, 8);
const PLAN_IDS: readonly StatId[] = [
  'planned-r',
  'realized-r',
  'planned-reward',
  'planned-risk',
];
const LAST_IDS: readonly StatId[] = STAT_IDS.slice(14);

/** One stat as the card and the chooser both read it. */
interface StatDef {
  label: string;
  /** The figure; undefined when the trade has none, and `absent` says so. */
  value?: React.ReactNode;
  /** What a missing figure reads: None unless said. */
  absent?: string;
  /** The metric whose definition the label carries. */
  tip?: MetricId;
  tone?: string;
  sub?: React.ReactNode;
}
type StatDefs = Partial<Record<StatId, StatDef>>;

/**
 * Every stat this trade has, keyed by id. A stat the instrument lacks (Points
 * on a forex trade) is absent. The same figures the reports read, so the page
 * agrees with them.
 */
function statDefs(
  trade: Trade,
  display: Display,
  basis: 'net' | 'gross',
  ctx: MetricContext,
): StatDefs {
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
  const fig = tradeFigure(trade, ctx);
  const levels = (n: number | undefined) =>
    n === undefined ? undefined : `${n} ${plural(n, 'level')}`;
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

  const defs: StatDefs = {
    'avg-entry': {
      label: 'Avg entry',
      value: price(trade.avgEntry, tick),
      sub: `${entries.length} ${plural(entries.length, into)}, ${qty(sum(entries, (e) => e.qty))} ${noun(
        trade,
        sum(entries, (e) => e.qty),
      )}`,
    },
    'avg-exit': {
      label: 'Avg exit',
      value:
        trade.avgExit === undefined ? undefined : price(trade.avgExit, tick),
      sub:
        trade.avgExit === undefined
          ? 'Still open'
          : `${exits.length} ${plural(exits.length, into === 'buy' ? 'sell' : 'buy')}, ${qty(sum(exits, (e) => e.qty))} ${noun(
              trade,
              sum(exits, (e) => e.qty),
            )}`,
    },
    quantity: {
      label: 'Quantity',
      value: qty(trade.maxPosition),
      sub: `max position, ${noun(trade, 2)}`,
    },
    duration: {
      label: 'Duration',
      value: held === undefined ? undefined : formatDuration(held),
      absent: 'Open',
      sub: held === undefined ? 'since entry' : 'entry to flat',
    },
    'gross-pnl': {
      label: 'Gross P&L',
      value: cash(trade.gross),
      tone: tone(trade.gross),
      sub:
        move === undefined
          ? undefined
          : `${move > 0 ? '+' : move < 0 ? '−' : ''}${price(Math.abs(move), tick)} ${per} on ${qty(trade.maxPosition)}`,
    },
    fees: {
      label: 'Fees',
      value: cash(-trade.fees),
      sub: (
        <>
          {cash(commission, false)} commission, {cash(exchange, false)} exchange
        </>
      ),
    },
    swap: {
      label: 'Swap',
      tip: 'swap',
      value: trade.swap === undefined ? undefined : cash(trade.swap),
      tone: trade.swap === undefined ? '' : tone(trade.swap),
      sub: trade.swap === undefined ? undefined : 'from the import',
    },
    'cost-basis': {
      label: 'Cost basis',
      value: cash(costBasis(trade), false),
      sub: 'entry price x size',
    },
    // The two level blocks are drawn by the plan; the chooser lists how many levels each has.
    targets: { label: 'Targets', value: levels(sides.targets?.levels.length) },
    stops: { label: 'Stops', value: levels(sides.stops?.levels.length) },
    'planned-r': {
      label: 'Planned R',
      tip: 'planned-r',
      value: planned === undefined ? undefined : rText(planned, false),
      sub:
        planned !== undefined
          ? 'reward over risk'
          : reward === undefined
            ? needsBoth
            : 'needs a risk above 0',
    },
    'realized-r': {
      label: 'Realized R',
      tip: 'realized-r',
      value: r === undefined ? undefined : rText(r, true),
      tone: r === undefined ? '' : tone(r),
      sub: realizedSub,
    },
    'planned-reward': {
      label: 'Planned reward',
      tip: 'planned-reward',
      value: reward === undefined ? undefined : cash(reward, false),
      sub: reward === undefined ? needsBoth : 'if every target fills',
    },
    'planned-risk': {
      label: 'Planned risk',
      tip: 'planned-risk',
      value: risk === undefined ? undefined : cash(risk, false),
      sub: risk === undefined ? needsBoth : 'if every stop fills',
    },
    mae: {
      label: 'MAE',
      tip: 'mae',
      value: trade.mae === undefined ? undefined : cash(trade.mae),
      absent: 'Not recorded',
      tone: trade.mae === undefined ? '' : tone(trade.mae),
      sub: 'worst open P&L',
    },
    mfe: {
      label: 'MFE',
      tip: 'mfe',
      value: trade.mfe === undefined ? undefined : cash(trade.mfe),
      absent: 'Not recorded',
      tone: trade.mfe === undefined ? '' : tone(trade.mfe),
      sub: 'best open P&L',
    },
  };

  // The unit rows; a row the asset class lacks is absent.
  if (future) {
    const opened = tradeVolume(trade);
    const closed = closedQty(trade);
    const units = (key: 'points' | 'ticks', label: string): StatDef => {
      const v = fig[key];
      return {
        label,
        value:
          v === null || v === undefined
            ? undefined
            : formatUnitValue(key, v, { currency: cur, signed: true }),
        tone: v === null || v === undefined ? '' : tone(v),
      };
    };
    defs.points = units('points', 'Points');
    defs.ticks = units('ticks', 'Ticks');
    defs.contracts = {
      label: 'Contracts',
      value:
        closed < opened - 1e-9
          ? `${qty(closed)} of ${qty(opened)} closed`
          : qty(opened),
    };
  }
  if (trade.instrument.assetClass === 'forex') {
    const pips = fig.pips ?? null;
    const perPip = moneyPerPip(trade);
    defs.pips = {
      label: 'Pips',
      value:
        pips === null
          ? undefined
          : formatUnitValue('pips', pips, { currency: cur, signed: true }),
      tone: pips === null ? '' : tone(pips),
      sub: 'per lot',
    };
    defs['money-per-pip'] = {
      label: 'Money per pip',
      value: perPip === null ? undefined : cash(perPip, false),
      sub: 'gross P&L over pips',
    };
  }
  return defs;
}

const NONE = 'text-[14px] font-normal text-faint';

function Stats({
  trade,
  defs,
  shown,
  basis,
  readOnly,
  save,
}: {
  trade: Trade;
  defs: StatDefs;
  /** The ids the user wants on the card; the trade's own lack of a stat is `defs`. */
  shown: ReadonlySet<string>;
  basis: 'net' | 'gross';
  readOnly: boolean;
  save: Save;
}): React.JSX.Element {
  const tick = trade.instrument.tickSize;
  const sides = sidesOf(trade);
  const on = (ids: readonly StatId[]) =>
    ids.filter((id) => shown.has(id) && defs[id] !== undefined);
  const first = on(FIRST_IDS);
  const derived = on(PLAN_IDS);
  const last = on(LAST_IDS);
  const targets = shown.has('targets');
  const stops = shown.has('stops');
  const planned = targets || stops || derived.length > 0;

  // Whole rows only, so the hairlines between cells never show an empty one.
  const GRID =
    'grid grid-cols-2 gap-px bg-line sm:grid-cols-4 [&>div]:border-0';
  const cells = (ids: readonly StatId[], name: string) => (
    <>
      {ids.map((id) => {
        const def = defs[id]!;
        return (
          <Stat
            key={id}
            label={def.label}
            tip={def.tip}
            basis={basis}
            tone={def.tone}
            sub={def.sub}
          >
            {def.value ?? <span className={NONE}>{def.absent ?? 'None'}</span>}
          </Stat>
        );
      })}
      {Array.from({ length: (4 - (ids.length % 4)) % 4 }, (_, i) => (
        <div key={`${name}-${i}`} aria-hidden="true" className="bg-surface-1" />
      ))}
    </>
  );

  if (first.length + derived.length + last.length === 0 && !targets && !stops)
    return (
      <p className="mt-3.5 border-t border-line pt-3.5 text-[13.5px] text-muted">
        No stats to show. Choose stats picks what this card lists.
      </p>
    );

  return (
    <div className="mt-3.5">
      {first.length > 0 ? (
        <div className={`border-t border-line ${GRID}`}>
          {cells(first, 'first')}
        </div>
      ) : null}

      {planned ? (
        <div
          role="group"
          aria-labelledby="plan-h"
          className="border-t border-line pt-3.5 pb-1.5"
        >
          <b id="plan-h" className="text-[13.5px] font-semibold">
            Plan
          </b>
          {targets || stops ? (
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
          ) : null}
          {targets ? (
            <LevelsBlock
              trade={trade}
              side="target"
              value={sides.targets}
              readOnly={readOnly}
              onCommit={(next) => save({ targets: next })}
            />
          ) : null}
          {targets && stops ? (
            <p className="my-2.5 flex items-center gap-2.5 text-[12.5px] whitespace-nowrap text-faint before:h-0 before:flex-none before:basis-[128px] before:border-t before:border-dashed before:border-line-2 after:h-0 after:flex-1 after:border-t after:border-dashed after:border-line-2 max-sm:before:flex-1 max-sm:before:basis-0">
              <span>
                Avg entry{' '}
                <b className="font-semibold text-text tabular-nums">
                  {price(trade.avgEntry, tick)}
                </b>
                , {qty(trade.maxPosition)} {noun(trade, trade.maxPosition)}
              </span>
            </p>
          ) : null}
          {stops ? (
            <LevelsBlock
              trade={trade}
              side="stop"
              value={sides.stops}
              readOnly={readOnly}
              onCommit={(next) => save({ stops: next })}
            />
          ) : null}
          {derived.length > 0 ? (
            <div
              className={`${targets || stops ? 'mt-3 ' : 'mt-2 '}border-t border-line ${GRID}`}
            >
              {cells(derived, 'plan')}
            </div>
          ) : null}
        </div>
      ) : null}

      {last.length > 0 ? (
        <div className={`border-t border-line ${GRID}`}>
          {cells(last, 'last')}
        </div>
      ) : null}
    </div>
  );
}

/**
 * The Execution card: its stats as the reader chose them, and the Choose stats
 * dialog (B51). The choice is the reader's own, so an archived account's trade
 * can still change it.
 */
function ExecutionCard({
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
  const prefs = usePrefs().data!;
  const update = useUpdatePrefs();
  const unset = useUnsetPrefs();
  // Every pattern of the workspace's trades; this trade's own are the button's.
  const patterns = usePatterns().data;
  const defs = statDefs(trade, display, basis, ctx);
  const shown: readonly string[] = prefs.tradeStats ?? STAT_IDS;
  const rows: StatChoice[] = STAT_IDS.map((id) => {
    const def = defs[id];
    return {
      id,
      label: def?.label ?? id,
      value:
        def === undefined ? undefined : (def.value ?? def.absent ?? 'None'),
      listed: def !== undefined,
    };
  });

  return (
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
        end={
          <span className="flex flex-wrap items-center justify-end gap-2">
            <PatternsButton
              hits={
                patterns ? (patterns.byTrade.get(trade.id) ?? []) : undefined
              }
            />
            <StatsChooser
              rows={rows}
              shown={shown}
              onSave={async (next) => {
                if (next === undefined) await unset.mutateAsync(['tradeStats']);
                else await update.mutateAsync({ tradeStats: next });
              }}
            />
          </span>
        }
      />
      <Stats
        trade={trade}
        defs={defs}
        shown={new Set(shown)}
        basis={basis}
        readOnly={readOnly}
        save={save}
      />
    </section>
  );
}

function Executions({
  trade,
  timeZone,
  display,
  readOnly,
}: {
  trade: Trade;
  timeZone: string;
  display: Display;
  readOnly: boolean;
}): React.JSX.Element {
  const edit = useFillCosts(trade, display, readOnly);
  const fills = sortedFills(trade);
  const held = positions(trade, fills);
  const tick = trade.instrument.tickSize;
  const cash = (cents: number) => (
    <FigureText f={display.cash(cents, false, trade.pnlCurrency)} />
  );
  const TH =
    'h-9 border-b border-line pr-3.5 text-left text-xs font-medium whitespace-nowrap text-faint last:pr-0';
  const TD = 'h-9 border-b border-line/70 pr-3.5 last:pr-0';
  return (
    <>
      {/* The cost buttons reach 6px past the column, so the scroller's padding keeps their focus ring and its edge from scrolling. */}
      <div
        ref={(el) => edit.setScroller(el)}
        className="relative -mx-1.5 mt-3.5 overflow-x-auto px-1.5"
      >
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
              {edit.openId !== null ? (
                <th scope="col" className={`${TH} w-[76px]`}>
                  <span className="sr-only">Save the row</span>
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {fills.map((f, i) => {
              const open = edit.openId === f.id;
              const when = `${f.side} at ${clockOnDay(f.time, trade.openedAt, timeZone)}`;
              return (
                <tr
                  key={f.id}
                  className={open ? 'bg-accent-soft/55' : undefined}
                  onKeyDown={open ? rowKeys(edit, f) : undefined}
                >
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
                  <td className={`${TD} text-right tabular-nums`}>
                    {qty(f.qty)}
                  </td>
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
                    <CostCell
                      edit={edit}
                      fill={f}
                      field="fees"
                      when={when}
                      figure={cash(f.fees)}
                    />
                  </td>
                  <td className={`${TD} text-right text-muted tabular-nums`}>
                    <CostCell
                      edit={edit}
                      fill={f}
                      field="commission"
                      when={when}
                      figure={cash(f.commission)}
                    />
                  </td>
                  {edit.openId !== null ? (
                    <td className={TD}>
                      {open ? <RowControls edit={edit} fill={f} /> : null}
                    </td>
                  ) : null}
                </tr>
              );
            })}
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
              <td
                className={`text-right tabular-nums ${edit.openId !== null ? 'pr-3.5' : ''}`}
              >
                {cash(sum(fills, (e) => e.commission))}
              </td>
              {edit.openId !== null ? <td /> : null}
            </tr>
          </tfoot>
        </table>
      </div>
      <FillCostsNote edit={edit} />
    </>
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
  // Export and import act on the note in view, as the editor holds it.
  const ownHandle = useRef<NoteEditorHandle | null>(null);
  const note = handleRef ?? ownHandle;
  const tradeEntry = useJournalEntry(trade.noteId ?? '').data ?? undefined;
  const dayEntry = findDailyEntry(
    useJournal({ enabled: which === 'day' }).data,
    date,
  );
  const entry = which === 'trade' ? tradeEntry : dayEntry;
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
        <NoteMenu
          read={() => ({
            title:
              entry?.title ??
              (which === 'trade'
                ? `${trade.instrument.symbol} trade note`
                : `Daily review, ${dayName(date)}`),
            tags: entry?.tags ?? [],
            body: note.current?.getJSON() ?? entry?.body ?? EMPTY_DOC,
          })}
        />
      </div>
      {which === 'trade' ? (
        <TradeNote
          key={trade.id}
          trade={trade}
          readOnly={readOnly}
          handleRef={note}
          onStatus={setStatus}
        />
      ) : (
        <DayNote
          key={date}
          date={date}
          readOnly={readOnly}
          handleRef={note}
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
          <ExecutionCard
            trade={trade}
            display={display}
            basis={basis}
            ctx={ctx}
            readOnly={readOnly}
            save={save}
          />

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
            <Executions
              trade={trade}
              timeZone={timeZone}
              display={display}
              readOnly={readOnly}
            />
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

          <TradeFiles trade={trade} readOnly={readOnly} />

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
