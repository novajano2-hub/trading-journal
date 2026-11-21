'use client';

import { useMemo, useState, type RefObject } from 'react';
import { Warning } from '@phosphor-icons/react/dist/ssr';
import { Chip, SideChip } from '@/components/ui/chip';
import { MorphDialog } from '@/components/ui/morph-dialog';
import { TaskCheckbox } from '@/components/ui/task-checkbox';
import type { DashboardModel } from '@/data/dashboard';
import { useUpdateTrade } from '@/data/query/hooks';
import { withRuleCheck } from '@/data/trade-patch';
import { pnlOf } from '@/domain/metrics/context';
import type { Cents, Strategy, Tag, Trade } from '@/domain/types';
import { formatPnl } from '@/lib/format';
import { shortTime } from '@/lib/time-format';
import type { DrillTarget } from './dashboard-view';
import { tradeNoun } from './mistakes-card';
import { signTone } from './plan-card';

function Money({ cents, currency }: { cents: Cents; currency: string }) {
  return (
    <span className={`font-mono tabular-nums ${signTone(cents)}`}>
      {formatPnl(cents, currency)}
    </span>
  );
}

function Count({ n }: { n: number }) {
  return (
    <>
      <span className="font-mono tabular-nums">{n}</span> {tradeNoun(n)}
    </>
  );
}

/**
 * A rule's "Kept" box on one trade. It flips at once; the saved value takes
 * over once it catches up, and a failed save reverts and reports.
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

  return (
    <TaskCheckbox
      aria-label={label}
      checked={optimistic?.value ?? saved}
      onCheckedChange={(value) => {
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
    />
  );
}

const TH =
  'h-[26px] pb-1 pl-3 align-bottom text-left text-xs font-normal text-faint first:pl-0';
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
}: {
  target: DrillTarget;
  rows: readonly Trade[];
  ruleText: string;
  model: DashboardModel;
  timeZone: string;
  strategyName: ReadonlyMap<string, string>;
  mistakeName: ReadonlyMap<string, string>;
}): React.JSX.Element {
  const [failed, setFailed] = useState(false);
  const rule = target.kind === 'rule' ? target.ruleId : null;
  const basisLabel = model.basis === 'gross' ? 'Gross P&L' : 'Net P&L';
  // Below sm the time folds under the symbol, so the symbol may lead the row.
  const symbolPad = rule ? '' : 'max-sm:pl-0';

  return (
    <>
      {failed ? (
        <p
          role="alert"
          className="mb-3 flex items-center gap-2 rounded-control bg-sunken px-3 py-2 text-[13px] text-text"
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
        <table aria-label="Trades" className="w-full border-collapse">
          <thead>
            <tr>
              {rule ? (
                <th scope="col" className={`${TH} w-11`}>
                  Kept
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
              <th scope="col" className={`${TH} max-sm:hidden`}>
                Mistakes
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => {
              const time = shortTime(t.closedAt ?? t.openedAt, timeZone);
              const mistakes = t.tagIds.flatMap(
                (id) => mistakeName.get(id) ?? [],
              );
              const strategy =
                t.strategyId !== undefined
                  ? strategyName.get(t.strategyId)
                  : undefined;
              return (
                <tr key={t.id} className="border-t border-line text-[13px]">
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
                  <td
                    className={`${TD} font-mono text-[12.5px] whitespace-nowrap text-faint tabular-nums max-sm:hidden`}
                  >
                    {time}
                  </td>
                  <td
                    className={`${TD} ${symbolPad} py-1.5 font-mono text-[12.5px] text-text`}
                  >
                    {/* A long option symbol truncates on phones; the title and the Kept box's label carry it whole. */}
                    <span
                      title={t.instrument.symbol}
                      className="block whitespace-nowrap max-sm:max-w-[7rem] max-sm:truncate"
                    >
                      {t.instrument.symbol}
                    </span>
                    <span className="block whitespace-nowrap text-faint tabular-nums sm:hidden">
                      {time}
                    </span>
                  </td>
                  <td className={TD}>
                    <SideChip side={t.direction} />
                  </td>
                  <td className={`${TD} max-sm:hidden`}>
                    {strategy ?? <span className="text-faint">None</span>}
                  </td>
                  <td
                    className={`${TD} text-right text-[12.5px] whitespace-nowrap`}
                  >
                    <Money
                      cents={pnlOf(t, model.basis)}
                      currency={t.pnlCurrency}
                    />
                  </td>
                  <td className={`${TD} max-sm:hidden`}>
                    {mistakes.length > 0 ? (
                      <span className="flex flex-wrap gap-1">
                        {mistakes.map((name) => (
                          <Chip key={name} tone="loss">
                            {name}
                          </Chip>
                        ))}
                      </span>
                    ) : (
                      <span className="text-faint">None</span>
                    )}
                  </td>
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
}): React.JSX.Element | null {
  const byId = useMemo(() => new Map(trades.map((t) => [t.id, t])), [trades]);
  const strategyName = useMemo(
    () => new Map(strategies.map((s) => [s.id, s.name])),
    [strategies],
  );
  const mistakeName = useMemo(
    () =>
      new Map(
        tags.filter((t) => t.category === 'mistake').map((t) => [t.id, t.name]),
      ),
    [tags],
  );
  const rows = tradeIds.flatMap((id) => byId.get(id) ?? []);
  const currency = model.currency;

  let title: string;
  let description: React.ReactNode;
  if (target.kind === 'rule') {
    const score = model.plan.rules.find((r) => r.ruleId === target.ruleId);
    title =
      score?.text ??
      strategies.flatMap((s) => s.rules).find((r) => r.id === target.ruleId)
        ?.text ??
      '';
    description = (
      <>
        Broken on <Count n={score?.broken ?? 0} />, {caption}. Cost when broken{' '}
        <Money cents={score?.brokenPnl ?? 0} currency={currency} />. Trades that
        kept it: <Money cents={score?.keptPnl ?? 0} currency={currency} />.
      </>
    );
  } else {
    const cost = model.mistakes.find((m) => m.tagId === target.tagId);
    title = cost?.name ?? mistakeName.get(target.tagId) ?? '';
    description = (
      <>
        <Count n={cost?.tradeCount ?? 0} />, {caption},{' '}
        <Money cents={cost?.pnl ?? 0} currency={currency} /> {model.basis}.
      </>
    );
  }

  return (
    <MorphDialog
      open={open}
      onOpenChange={onOpenChange}
      origin={origin}
      returnFocus={returnFocus}
      title={title}
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
        ruleText={title}
        model={model}
        timeZone={timeZone}
        strategyName={strategyName}
        mistakeName={mistakeName}
      />
    </MorphDialog>
  );
}
