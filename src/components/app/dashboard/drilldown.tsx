'use client';

import { useMemo, useState, type RefObject } from 'react';
import { Popover } from 'radix-ui';
import {
  CheckCircle,
  Tag as TagIcon,
  Warning,
  XCircle,
} from '@phosphor-icons/react/dist/ssr';
import { Chip, SideChip } from '@/components/ui/chip';
import { MetricTip } from '@/components/ui/metric-tip';
import { MorphDialog } from '@/components/ui/morph-dialog';
import type { DashboardModel } from '@/data/dashboard';
import { useUpdateTrade, useUpdateTrades } from '@/data/query/hooks';
import { withRuleCheck, withTagPick } from '@/data/trade-patch';
import { pnlOf } from '@/domain/metrics/context';
import { mistakeTags } from '@/domain/metrics/mistakes';
import {
  strategyRules,
  type Cents,
  type Strategy,
  type Tag,
  type TagCategory,
  type Trade,
} from '@/domain/types';
import { useDisplay } from '@/lib/display';
import { keepHyphens, plural } from '@/lib/format';
import { shortTime } from '@/lib/time-format';
import type { DrillTarget } from './dashboard-view';
import { TagPicker } from '../tag-picker';
import { TradeLink } from '../trades/cells';
import { InstrumentName, signTone, TradeTime } from './shared';

/** An amount in the chosen unit: one trade's, a set's by id, or a bare sum (a percentage reads over the account's base, other units in dollars). */
function Money({
  cents,
  currency,
  trade,
  ids,
}: {
  cents: Cents;
  currency: string;
  trade?: Trade;
  ids?: readonly string[];
}) {
  const display = useDisplay();
  const figure = trade
    ? display.ofTrade(trade)
    : ids
      ? display.ofTrades(ids, cents)
      : { money: cents };
  const { text } =
    trade || ids
      ? display.figure(figure, true, currency)
      : display.cash(cents, true, currency);
  return (
    <span
      className={`font-[550] whitespace-nowrap tabular-nums ${signTone(cents)}`}
    >
      {text}
    </span>
  );
}

function Count({ n }: { n: number }) {
  return (
    <>
      <span className="tabular-nums">{n}</span> {plural(n, 'trade')}
    </>
  );
}

/**
 * A rule's kept or broken mark on one trade, a native checkbox drawn as a
 * gain CheckCircle (kept) or a loss XCircle (broken); Space or a click
 * regrades it. It flips at once; the saved value takes over once it catches
 * up, and a failed save reverts and reports.
 */
function KeptBox({
  trade,
  ruleId,
  label,
  onSaving,
  onFailed,
}: {
  trade: Trade;
  ruleId: string;
  label: string;
  onSaving(): void;
  onFailed(): void;
}): React.JSX.Element {
  const update = useUpdateTrade();
  const saved =
    trade.ruleChecks.find((c) => c.ruleId === ruleId)?.followed === true;
  const [optimistic, setOptimistic] = useState<{
    value: boolean;
    landed: boolean;
  } | null>(null);
  if (optimistic?.landed && optimistic.value === saved) setOptimistic(null);
  const kept = optimistic?.value ?? saved;
  const mark =
    'absolute inset-0 transition-[opacity,scale] duration-[240ms] ease-[var(--ease-glide)] motion-reduce:transition-none';

  return (
    <label className="group relative inline-flex cursor-pointer items-center justify-center pointer-coarse:min-h-11 pointer-coarse:min-w-11">
      <input
        type="checkbox"
        checked={kept}
        aria-label={label}
        onChange={(event) => {
          const value = event.currentTarget.checked;
          setOptimistic({ value, landed: false });
          onSaving();
          update
            .mutateAsync({
              id: trade.id,
              patch: withRuleCheck(trade, ruleId, value),
            })
            .then(
              () =>
                setOptimistic((o) =>
                  o?.value === value ? { value, landed: true } : o,
                ),
              () => {
                setOptimistic(null);
                onFailed();
              },
            );
        }}
        className="peer sr-only"
      />
      <span
        aria-hidden="true"
        className="relative size-6 rounded-full outline-offset-1 transition-colors duration-200 ease-[var(--ease-glide)] group-hover:bg-sunken peer-focus-visible:outline-2 peer-focus-visible:outline-accent"
      >
        <XCircle
          size={20}
          weight="fill"
          className={`${mark} m-0.5 text-loss ${kept ? 'scale-75 opacity-0' : ''}`}
        />
        <CheckCircle
          size={20}
          weight="fill"
          className={`${mark} m-0.5 text-gain ${kept ? '' : 'scale-75 opacity-0'}`}
        />
      </span>
      <span className="sr-only">{kept ? 'Kept' : 'Broken'}</span>
    </label>
  );
}

const TH =
  'h-[34px] border-b border-line pl-3 align-middle text-left text-xs font-medium text-faint first:pl-0';
const TD = 'h-[38px] pl-3 align-middle first:pl-0';

/** The trades behind one rule's or one mistake's number. */
function TradesTable({
  target,
  rows,
  ruleText,
  model,
  timeZone,
  strategyName,
  mistakeName,
  mistakeCategories,
}: {
  target: DrillTarget;
  rows: readonly Trade[];
  ruleText: string;
  model: DashboardModel;
  timeZone: string;
  strategyName: ReadonlyMap<string, string>;
  mistakeName: ReadonlyMap<string, string>;
  mistakeCategories: TagCategory[];
}): React.JSX.Element {
  const [failed, setFailed] = useState(false);
  const rule = target.kind === 'rule' ? target.ruleId : null;
  const basisLabel = model.basis === 'gross' ? 'Gross P&L' : 'Net P&L';
  // Below sm the time folds under the symbol, so the symbol may lead the row.
  const symbolPad = rule ? '' : 'max-sm:pl-0';
  // A mistake's own trades all carry it: list only their others, and drop
  // the column when no row has another.
  const rowMistakes = rows.map((t) =>
    t.tagIds.flatMap((id) =>
      target.kind === 'mistake' && id === target.tagId
        ? []
        : (mistakeName.get(id) ?? []),
    ),
  );
  const showMistakes = rule !== null || rowMistakes.some((m) => m.length > 0);

  return (
    <>
      {failed ? (
        <p
          role="alert"
          className="mt-2 mb-1 flex items-center gap-2 rounded-control bg-sunken px-3 py-2 text-[13px] text-text"
        >
          <Warning
            size={16}
            aria-hidden="true"
            className="flex-none text-muted"
          />
          Couldn&apos;t save. Try again.
        </p>
      ) : null}
      <div className="-mx-5 overflow-x-auto px-5">
        <table
          aria-label="Trades"
          className="w-full border-collapse text-[13.5px]"
        >
          <thead>
            <tr>
              {rule ? (
                <th scope="col" className={`${TH} w-11`}>
                  <MetricTip id="trade-rule-kept" basis={model.basis} />
                </th>
              ) : null}
              <th scope="col" className={`${TH} max-sm:hidden`}>
                Time
              </th>
              <th scope="col" className={`${TH} ${symbolPad}`}>
                Symbol
              </th>
              <th scope="col" className={TH}>
                Side
              </th>
              <th scope="col" className={`${TH} max-sm:hidden`}>
                Strategy
              </th>
              <th scope="col" className={`${TH} text-right`}>
                {basisLabel}
              </th>
              {showMistakes ? (
                <th scope="col" className={`${TH} max-sm:hidden`}>
                  {rule ? 'Mistakes' : 'Other mistakes'}
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((t, i) => {
              const time = shortTime(t.closedAt ?? t.openedAt, timeZone);
              const mistakes = rowMistakes[i] ?? [];
              const strategy =
                t.strategyIds
                  .flatMap((id) => strategyName.get(id) ?? [])
                  .join(', ') || undefined;
              return (
                <tr
                  key={t.id}
                  className="border-t border-line/70 text-text first:border-t-0"
                >
                  {rule ? (
                    <td className={TD}>
                      <div className="flex items-center">
                        <KeptBox
                          trade={t}
                          ruleId={rule}
                          label={`Kept ${ruleText} on ${t.instrument.symbol} ${time}`}
                          onSaving={() => setFailed(false)}
                          onFailed={() => setFailed(true)}
                        />
                      </div>
                    </td>
                  ) : null}
                  <td className={`${TD} max-sm:hidden`}>
                    <TradeTime text={time} />
                  </td>
                  <td className={`${TD} ${symbolPad} py-1.5`}>
                    {/* The title and the Kept box's label keep the symbol as traded; below sm the time takes the expiry's place. */}
                    <TradeLink id={t.id}>
                      <InstrumentName
                        trade={t}
                        timeZone={timeZone}
                        className="sm:flex-nowrap"
                        detailClassName="max-sm:hidden"
                      />
                    </TradeLink>
                    <TradeTime
                      text={time}
                      className="block text-xs sm:hidden"
                    />
                  </td>
                  <td className={TD}>
                    <SideChip side={t.direction} />
                  </td>
                  <td className={`${TD} max-sm:hidden`}>
                    {strategy ?? <span className="text-faint">None</span>}
                  </td>
                  <td className={`${TD} text-right whitespace-nowrap`}>
                    <Money
                      trade={t}
                      cents={pnlOf(t, model.basis)}
                      currency={t.pnlCurrency}
                    />
                  </td>
                  {showMistakes ? (
                    <td className={`${TD} max-sm:hidden`}>
                      {mistakes.length > 0 ? (
                        <span className="flex flex-wrap gap-1">
                          {mistakes.map((name) => (
                            <Chip key={name} tone="warn">
                              {name}
                            </Chip>
                          ))}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-2">
                          <span className="text-faint">None</span>
                          {mistakeCategories.length > 0 ? (
                            <TagMissing
                              trade={t}
                              label={`Tag a mistake on ${t.instrument.symbol} ${time}`}
                              categories={mistakeCategories}
                              onSaving={() => setFailed(false)}
                              onFailed={() => setFailed(true)}
                            />
                          ) : null}
                        </span>
                      )}
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

/**
 * "Tag" beside a trade that has no mistake: opens the tag picker, scoped to
 * the mistake categories, and saves each pick on the trade. A failed save
 * reports in the table's own alert.
 */
function TagMissing({
  trade,
  label,
  categories,
  onSaving,
  onFailed,
}: {
  trade: Trade;
  label: string;
  categories: TagCategory[];
  onSaving(): void;
  onFailed(): void;
}): React.JSX.Element {
  const update = useUpdateTrades();
  return (
    <Popover.Root>
      <Popover.Trigger
        aria-label={label}
        className="inline-flex h-6 items-center gap-1 rounded-chip px-1.5 text-xs font-medium text-accent-ink outline-offset-1 hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-accent data-[state=open]:bg-accent-soft pointer-coarse:h-11 pointer-coarse:px-3"
      >
        <TagIcon size={13} aria-hidden="true" />
        Tag
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={6}
          collisionPadding={12}
          className="z-[60] w-[280px] max-w-[calc(100vw-24px)] origin-(--radix-popover-content-transform-origin) rounded-[12px] border border-line bg-surface-1 p-3 text-text shadow-[var(--shadow)] outline-none motion-safe:data-[state=closed]:animate-tip-out motion-safe:data-[state=open]:animate-pop-in"
        >
          <TagPicker
            manageLink={false}
            label="Mistakes"
            autoFocus
            categories={categories}
            selected={trade.tagIds}
            onChange={(tagIds) => {
              onSaving();
              update.mutate(
                { ids: [trade.id], patch: withTagPick(trade.tagIds, tagIds) },
                { onError: onFailed },
              );
            }}
          />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

/**
 * The signature move: a rule's or a mistake's exact trades, grown out of the
 * row that opened them. The trade list is the snapshot taken at opening, so a
 * regraded trade stays put while the figures above it update.
 */
export function Drilldown({
  target,
  tradeIds,
  open,
  onOpenChange,
  origin,
  returnFocus,
  model,
  caption,
  timeZone,
  trades,
  strategies,
  tags,
  categories,
}: {
  /** Kept after closing, so the dialog can play its exit. */
  target: DrillTarget;
  tradeIds: readonly string[];
  open: boolean;
  onOpenChange(open: boolean): void;
  origin: RefObject<HTMLElement | null>;
  returnFocus: RefObject<HTMLElement | null>;
  model: DashboardModel;
  caption: string;
  timeZone: string;
  /** Every trade in the workspace, so a row outlives its filters. */
  trades: readonly Trade[];
  strategies: readonly Strategy[];
  tags: readonly Tag[];
  categories: readonly TagCategory[];
}): React.JSX.Element | null {
  const byId = useMemo(() => new Map(trades.map((t) => [t.id, t])), [trades]);
  const strategyName = useMemo(
    () => new Map(strategies.map((s) => [s.id, s.name])),
    [strategies],
  );
  const mistakeName = useMemo(
    () => new Map(mistakeTags(tags, categories).map((t) => [t.id, t.name])),
    [tags, categories],
  );
  const mistakeCategories = useMemo(
    () => categories.filter((c) => c.role === 'mistake'),
    [categories],
  );
  const rows = tradeIds.flatMap((id) => byId.get(id) ?? []);
  const currency = model.currency;

  let title: string;
  let ruleText = '';
  let description: React.ReactNode;
  if (target.kind === 'rule') {
    const score = model.plan.rules.find((r) => r.ruleId === target.ruleId);
    ruleText =
      score?.text ??
      strategies.flatMap(strategyRules).find((r) => r.id === target.ruleId)
        ?.text ??
      '';
    title = score ? `${ruleText} (${score.strategyName})` : ruleText;
    description = (
      <>
        Broken on <Count n={score?.broken ?? 0} />, {caption}. Cost when broken{' '}
        <Money
          cents={score?.brokenPnl ?? 0}
          currency={currency}
          ids={score?.brokenTradeIds ?? []}
        />
        . Trades that kept it:{' '}
        <Money cents={score?.keptPnl ?? 0} currency={currency} />.
      </>
    );
  } else {
    const cost = model.mistakes.find((m) => m.tagId === target.tagId);
    title = cost?.name ?? mistakeName.get(target.tagId) ?? '';
    description = (
      <>
        <Count n={cost?.tradeCount ?? 0} />, {caption},{' '}
        <Money
          cents={cost?.pnl ?? 0}
          currency={currency}
          ids={cost?.tradeIds ?? []}
        />{' '}
        {model.basis}.
      </>
    );
  }

  return (
    <MorphDialog
      open={open}
      onOpenChange={onOpenChange}
      origin={origin}
      returnFocus={returnFocus}
      // A rule's title keeps "1-hour" whole on a narrow screen.
      title={target.kind === 'rule' ? keepHyphens(title) : title}
      description={description}
    >
      <TradesTable
        key={
          target.kind === 'rule'
            ? `rule:${target.ruleId}`
            : `tag:${target.tagId}`
        }
        target={target}
        rows={rows}
        ruleText={ruleText}
        model={model}
        timeZone={timeZone}
        strategyName={strategyName}
        mistakeName={mistakeName}
        mistakeCategories={mistakeCategories}
      />
    </MorphDialog>
  );
}
