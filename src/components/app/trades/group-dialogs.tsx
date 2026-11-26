'use client';

import { ArrowsMerge, ArrowsSplit } from '@phosphor-icons/react/dist/ssr';
import { useMemo, useState, type ReactNode, type RefObject } from 'react';
import { Button } from '@/components/ui/button';
import { MorphDialog } from '@/components/ui/morph-dialog';
import {
  useAccounts,
  useMergeTrades,
  usePrefs,
  useSplitTrade,
  useTrades,
} from '@/data/query/hooks';
import { ArchivedAccountError } from '@/data/repository';
import {
  canMerge,
  canSplit,
  GroupRefused,
  mergeKeeper,
} from '@/domain/grouping';
import { localDate } from '@/domain/time';
import type { Execution, Trade } from '@/domain/types';
import { formatInstrument, plural, price } from '@/lib/format';
import { usePhone } from '@/lib/use-phone';
import { qty } from './columns';
import { SelectBox } from './select-box';
import { clock, dayLabel } from './trade-time';

/** What every grouping dialog is given: where it grew from and where focus returns. */
export interface GroupDialogProps {
  open: boolean;
  onOpenChange(open: boolean): void;
  origin: RefObject<HTMLElement | null>;
  returnFocus: RefObject<HTMLElement | null>;
  /** Called once the write is in: the words for the result, in the log's toast. */
  onDone(message: ReactNode): void;
}

/** What a refused or failed grouping says, in the dialog. */
export function failure(error: unknown, what: string): string {
  if (error instanceof ArchivedAccountError)
    return 'An archived account is read-only, so nothing was changed.';
  if (error instanceof GroupRefused)
    return `Keel can't ${what} these as ticked. Check the executions and try again.`;
  return `Couldn't ${what}. Try again.`;
}

/** The comp's second box: what will happen, one line per effect. */
export function WhatBox({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}): React.JSX.Element {
  return (
    <div className="mt-3.5 rounded-[10px] bg-sunken px-3.5 py-3 text-[13px] leading-[1.5] text-muted">
      <b className="mb-1 block text-[13px] font-semibold text-text">{title}</b>
      <ul className="flex flex-col gap-1 [&_strong]:font-semibold [&_strong]:text-text">
        {children}
      </ul>
    </div>
  );
}

/** One line of a `WhatBox`, with the comp's faint dot. */
export function WhatLine({
  children,
}: {
  children: ReactNode;
}): React.JSX.Element {
  return (
    <li className="relative pl-3.5 before:absolute before:top-[0.62em] before:left-0.5 before:size-1 before:rounded-full before:bg-faint before:content-['']">
      {children}
    </li>
  );
}

/** The footer: the count on the left (its own row on a phone), Cancel and the action on the right. */
export function GroupFooter({
  caption,
  onCancel,
  disabled,
  icon,
  label,
  onConfirm,
}: {
  caption?: ReactNode;
  onCancel(): void;
  disabled: boolean;
  icon: ReactNode;
  label: string;
  onConfirm(): void;
}): React.JSX.Element {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-2.5">
      {caption ? (
        <span className="text-[12.5px] text-faint max-sm:basis-full">
          {caption}
        </span>
      ) : null}
      <div className="ml-auto flex gap-2">
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button disabled={disabled} onClick={onConfirm}>
          {icon}
          {label}
        </Button>
      </div>
    </div>
  );
}

/** "1229", "1229 and 1230", "1229, 1230 and 1231" in bold. */
function Serials({ trades }: { trades: readonly Trade[] }): React.JSX.Element {
  return (
    <>
      {trades.map((t, i) => (
        <span key={t.id}>
          {i === 0 ? '' : i === trades.length - 1 ? ' and ' : ', '}
          <strong>{t.serial}</strong>
        </span>
      ))}
    </>
  );
}

const TH =
  'h-10 border-b border-line pr-3 text-left text-[12px] font-medium whitespace-nowrap text-faint';
const TD = 'h-10 border-b border-line/70 pr-3 last:pr-0';
const BOX = '-ml-2 pointer-coarse:-ml-3.5';

/** One execution of a list, and what it is read with. */
interface FillRow {
  exec: Execution;
  /** The trade it sits in: shown in a merge. */
  serial: number;
  tick: number;
  /** The running position after it, in the trade's direction: shown in a split. */
  held?: number;
}

/** The time of a fill: with its day when the list spans more than one. */
function stamp(iso: string, zone: string, withDay: boolean): string {
  if (!withDay) return clock(iso, zone);
  const day = new Intl.DateTimeFormat('en-GB', {
    timeZone: zone,
    day: 'numeric',
    month: 'short',
  }).format(new Date(iso));
  return `${day} ${clock(iso, zone)}`;
}

/**
 * Every execution with a box, in a table (a two-line row on a phone). In a
 * merge the box says what joins; in a split, what leaves.
 */
function FillsList({
  rows,
  ticked,
  onToggle,
  onAll,
  zone,
  kind,
}: {
  rows: readonly FillRow[];
  ticked: ReadonlySet<string>;
  onToggle(id: string, on: boolean): void;
  onAll(on: boolean): void;
  zone: string;
  kind: 'merge' | 'split';
}): React.JSX.Element {
  const phone = usePhone();
  const first = rows[0];
  const withDay =
    first !== undefined &&
    rows.some(
      (r) => localDate(r.exec.time, zone) !== localDate(first.exec.time, zone),
    );
  const all = rows.length > 0 && rows.every((r) => ticked.has(r.exec.id));
  const some = rows.some((r) => ticked.has(r.exec.id));
  const words = (r: FillRow) => ({
    time: stamp(r.exec.time, zone, withDay),
    side: r.exec.side === 'buy' ? 'Buy' : 'Sell',
    qty: qty(r.exec.qty),
    price: price(r.exec.price, r.tick),
  });
  const label = (r: FillRow) => {
    const w = words(r);
    return `${w.time} ${w.side} ${w.qty} at ${w.price}${kind === 'merge' ? `, trade ${r.serial}` : ''}`;
  };

  if (phone)
    return (
      <ul aria-label="Executions" className="m-0 mt-1 list-none p-0">
        {rows.map((r) => {
          const w = words(r);
          const on = ticked.has(r.exec.id);
          return (
            <li
              key={r.exec.id}
              className={`flex items-center gap-3 border-t border-line/70 first:border-t-0 ${on && kind === 'split' ? '-mx-5 bg-accent-soft/70 px-5' : ''}`}
            >
              <span className={BOX}>
                <SelectBox
                  label={label(r)}
                  checked={on}
                  onChange={(next) => onToggle(r.exec.id, next)}
                />
              </span>
              <div className="flex min-h-[60px] min-w-0 flex-1 flex-col justify-center gap-1 py-2">
                <span
                  data-line="1"
                  className="flex items-baseline gap-2 text-[14px]"
                >
                  <b className="font-semibold tabular-nums">{w.time}</b>
                  <span className="text-[12.5px] text-muted">{w.side}</span>
                </span>
                <span
                  data-line="2"
                  className="flex flex-wrap gap-x-3 gap-y-0.5 text-[12.5px] text-muted tabular-nums"
                >
                  <span>
                    {w.qty} at {w.price}
                  </span>
                  {kind === 'merge' ? <span>Trade {r.serial}</span> : null}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    );

  return (
    <table
      aria-label="Executions"
      className="mt-1 w-full border-collapse text-[13.5px]"
    >
      <thead>
        <tr>
          <th scope="col" className={`${TH} w-[34px]`}>
            <span className={`${BOX} block`}>
              <SelectBox
                label="Select all executions"
                checked={all}
                indeterminate={some && !all}
                onChange={onAll}
              />
            </span>
          </th>
          {kind === 'merge' ? (
            <th scope="col" className={TH}>
              Trade
            </th>
          ) : null}
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
          {kind === 'split' ? (
            <th scope="col" className={`${TH} text-right`}>
              Position
            </th>
          ) : null}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const w = words(r);
          const on = ticked.has(r.exec.id);
          return (
            <tr
              key={r.exec.id}
              className={on && kind === 'split' ? 'bg-accent-soft/70' : ''}
            >
              <td className={TD}>
                <span className={`${BOX} block`}>
                  <SelectBox
                    label={label(r)}
                    checked={on}
                    onChange={(next) => onToggle(r.exec.id, next)}
                  />
                </span>
              </td>
              {kind === 'merge' ? (
                <td className={`${TD} text-muted tabular-nums`}>{r.serial}</td>
              ) : null}
              <td
                className={`${TD} font-semibold whitespace-nowrap tabular-nums`}
              >
                {w.time}
              </td>
              <td className={TD}>
                <span className="inline-flex h-[22px] items-center rounded-[7px] bg-sunken px-2 text-xs font-semibold text-muted">
                  {w.side}
                </span>
              </td>
              <td className={`${TD} text-right tabular-nums`}>{w.qty}</td>
              <td className={`${TD} text-right font-medium tabular-nums`}>
                {w.price}
              </td>
              {kind === 'split' ? (
                <td
                  className={`${TD} text-right tabular-nums ${r.held === 0 ? 'text-faint' : ''}`}
                >
                  {r.held === undefined
                    ? ''
                    : r.held === 0
                      ? 'Flat'
                      : `${r.held > 0 ? '+' : '−'}${qty(Math.abs(r.held))}`}
                </td>
              ) : null}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/** The trade's account, and the zone its times are read in. */
function useTradeZone(trade: Trade | undefined) {
  const accounts = useAccounts().data;
  const prefs = usePrefs().data;
  const account = accounts?.find((a) => a.id === trade?.accountId);
  return { account, zone: account?.timeZone ?? prefs?.timeZone ?? 'UTC' };
}

/** "buy 2 and sell 2". */
function sidesOf(fills: readonly Execution[]): string {
  const buy = fills.reduce((s, e) => s + (e.side === 'buy' ? e.qty : 0), 0);
  const sell = fills.reduce((s, e) => s + (e.side === 'sell' ? e.qty : 0), 0);
  return [buy > 0 ? `buy ${qty(buy)}` : '', sell > 0 ? `sell ${qty(sell)}` : '']
    .filter(Boolean)
    .join(' and ');
}

/** "ends flat" or "stays open, long 1". */
function endsOf(fills: readonly Execution[]): string {
  const net = fills.reduce(
    (s, e) => s + (e.side === 'buy' ? e.qty : -e.qty),
    0,
  );
  if (Math.abs(net) < 1e-9) return 'ends flat';
  return `stays open, ${net > 0 ? 'long' : 'short'} ${qty(Math.abs(net))}`;
}

const count = (n: number) => `${n} ${plural(n, 'execution')}`;

/**
 * Merge (spec 5.1, B1 to B3): every execution of the trades, newest last, all
 * ticked. An unticked one stays in its trade. The earliest-opened trade that
 * gives an execution keeps its record; the others it empties are removed.
 */
export function MergeDialog({
  open,
  onOpenChange,
  origin,
  returnFocus,
  onDone,
  trades,
}: GroupDialogProps & {
  /** The trades to merge: not in an archived account. */
  trades: readonly Trade[];
}): React.JSX.Element {
  const merge = useMergeTrades();
  const { account, zone } = useTradeZone(trades[0]);
  const rows = useMemo<FillRow[]>(
    () =>
      open
        ? trades
            .flatMap((t) =>
              t.executions.map((exec) => ({
                exec,
                serial: t.serial,
                tick: t.instrument.tickSize,
              })),
            )
            .sort(
              (a, b) =>
                Date.parse(a.exec.time) - Date.parse(b.exec.time) ||
                a.exec.id.localeCompare(b.exec.id),
            )
        : [],
    [open, trades],
  );
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  // Each opening starts with every execution ticked.
  const [was, setWas] = useState(false);
  if (open !== was) {
    setWas(open);
    if (open) {
      setPicked(new Set(rows.map((r) => r.exec.id)));
      setError(null);
    }
  }

  const refusal = canMerge(trades, picked);
  const keeper = refusal === null ? mergeKeeper(trades, picked) : undefined;
  const given = (t: Trade) =>
    t.executions.filter((e) => picked.has(e.id)).length;
  const others = keeper ? trades.filter((t) => t.id !== keeper.id) : [];
  const removed = others.filter(
    (t) => t.executions.length > 0 && given(t) === t.executions.length,
  );
  const partial = others.filter(
    (t) => given(t) > 0 && given(t) < t.executions.length,
  );
  const untouched = others.filter((t) => given(t) === 0);
  const total = keeper
    ? keeper.executions.length + others.reduce((s, t) => s + given(t), 0)
    : 0;
  const earliest = [...trades].sort(
    (a, b) =>
      Date.parse(a.openedAt) - Date.parse(b.openedAt) || a.serial - b.serial,
  )[0];
  const one = removed.length === 1;
  const hadNote = removed.some((t) => t.noteId !== undefined);

  const toggle = (id: string, on: boolean) =>
    setPicked((was) => {
      const next = new Set(was);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  const confirm = async () => {
    setError(null);
    try {
      const kept = await merge.mutateAsync({
        ids: trades.map((t) => t.id),
        picked: [...picked],
      });
      const joined = trades.filter((t) => given(t) > 0).length;
      onOpenChange(false);
      onDone(`Merged ${joined} trades into trade ${kept.serial}.`);
    } catch (e) {
      setError(failure(e, 'merge'));
    }
  };

  const first = trades[0];
  return (
    <MorphDialog
      open={open}
      onOpenChange={onOpenChange}
      origin={origin}
      returnFocus={returnFocus}
      size="medium"
      title={`Merge ${trades.length} trades`}
      description={
        first
          ? `${formatInstrument(first.instrument, first.openedAt, zone).name} in ${account?.name ?? 'its account'}. Untick an execution to leave it in its trade.`
          : undefined
      }
      footer={
        <GroupFooter
          caption={`${picked.size} of ${rows.length} executions ticked`}
          onCancel={() => onOpenChange(false)}
          disabled={refusal !== null || merge.isPending}
          icon={<ArrowsMerge size={16} aria-hidden="true" />}
          label="Merge"
          onConfirm={() => void confirm()}
        />
      }
    >
      <FillsList
        rows={rows}
        ticked={picked}
        onToggle={toggle}
        onAll={(on) =>
          setPicked(on ? new Set(rows.map((r) => r.exec.id)) : new Set())
        }
        zone={zone}
        kind="merge"
      />
      <WhatBox title="What will happen">
        {keeper ? (
          <>
            <WhatLine>
              <strong>{keeper.serial}</strong>{' '}
              {keeper.id === earliest?.id
                ? 'opened first'
                : 'opened first of the trades with ticked executions'}
              , so it keeps its record (note, rating, rule checks) and{' '}
              {total === picked.size
                ? `takes all ${count(total)}`
                : `ends with ${count(total)}`}
              .
            </WhatLine>
            {removed.length > 0 ? (
              <WhatLine>
                <Serials trades={removed} /> {one ? 'is' : 'are'} left with
                none, so {one ? 'it is' : 'they are'} removed.{' '}
                {one ? 'Its' : 'Their'} tags and strategies join {keeper.serial}
                , {one ? 'its' : 'their'} files move there
                {hadNote
                  ? `, and ${one ? 'its' : 'their'} ${plural(removed.length, 'note')} stay${one ? 's' : ''} in Trade notes, unlinked`
                  : ''}
                .
              </WhatLine>
            ) : null}
            {partial.map((t) => (
              <WhatLine key={t.id}>
                <strong>{t.serial}</strong> keeps the{' '}
                {count(t.executions.length - given(t))} you left unticked. Its
                tags and strategies also join {keeper.serial}.
              </WhatLine>
            ))}
            {untouched.length > 0 ? (
              <WhatLine>
                <Serials trades={untouched} />{' '}
                {untouched.length === 1 ? 'has' : 'have'} no ticked execution,
                so {untouched.length === 1 ? 'it is' : 'they are'} left as{' '}
                {untouched.length === 1 ? 'it is' : 'they are'}.
              </WhatLine>
            ) : null}
            <WhatLine>
              There is no undo. To separate them again, split {keeper.serial}.
            </WhatLine>
          </>
        ) : (
          <>
            <WhatLine>
              Tick executions from at least two trades to merge.
            </WhatLine>
            <WhatLine>There is no undo.</WhatLine>
          </>
        )}
      </WhatBox>
      {error ? (
        <p role="alert" className="mt-3 text-[13px] font-medium text-loss">
          {error}
        </p>
      ) : null}
    </MorphDialog>
  );
}

/**
 * Split (B4): the trade's executions, none ticked. A ticked one moves to a new
 * trade; at least one has to move and one stay. Each part is rebuilt, so one
 * that does not return to flat is open.
 */
export function SplitDialog({
  open,
  onOpenChange,
  origin,
  returnFocus,
  onDone,
  trade,
}: GroupDialogProps & { trade: Trade }): React.JSX.Element {
  const split = useSplitTrade();
  const all = useTrades().data;
  const { zone } = useTradeZone(trade);
  const fills = useMemo(
    () =>
      [...trade.executions].sort(
        (a, b) =>
          Date.parse(a.time) - Date.parse(b.time) || a.id.localeCompare(b.id),
      ),
    [trade],
  );
  const rows = useMemo<FillRow[]>(() => {
    if (!open) return [];
    const into = trade.direction === 'long' ? 'buy' : 'sell';
    let held = 0;
    return fills.map((exec) => {
      held += exec.side === into ? exec.qty : -exec.qty;
      return {
        exec,
        serial: trade.serial,
        tick: trade.instrument.tickSize,
        held: Math.abs(held) < 1e-9 ? 0 : held,
      };
    });
  }, [open, trade, fills]);
  const [moved, setMoved] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [was, setWas] = useState(false);
  if (open !== was) {
    setWas(open);
    if (open) {
      setMoved(new Set());
      setError(null);
    }
  }

  const refusal = canSplit(trade, moved);
  const leaving = fills.filter((e) => moved.has(e.id));
  const staying = fills.filter((e) => !moved.has(e.id));
  // The next serial after the highest in the workspace (the repository's rule).
  const next = all ? Math.max(0, ...all.map((t) => t.serial)) + 1 : null;

  const toggle = (id: string, on: boolean) =>
    setMoved((was) => {
      const set = new Set(was);
      if (on) set.add(id);
      else set.delete(id);
      return set;
    });

  const confirm = async () => {
    setError(null);
    try {
      const { original, created } = await split.mutateAsync({
        id: trade.id,
        moved: [...moved],
      });
      onOpenChange(false);
      onDone(
        `Split trade ${original.serial}. Trade ${created.serial} takes the ${count(leaving.length)} you moved.`,
      );
    } catch (e) {
      setError(failure(e, 'split'));
    }
  };

  return (
    <MorphDialog
      open={open}
      onOpenChange={onOpenChange}
      origin={origin}
      returnFocus={returnFocus}
      size="medium"
      title={`Split trade ${trade.serial}`}
      description={`${formatInstrument(trade.instrument, trade.openedAt, zone).name}, ${dayLabel(trade.openedAt, zone)}. Tick the executions that move to a new trade.`}
      footer={
        <GroupFooter
          caption={`${moved.size} of ${fills.length} ticked`}
          onCancel={() => onOpenChange(false)}
          disabled={refusal !== null || split.isPending}
          icon={<ArrowsSplit size={16} aria-hidden="true" />}
          label="Split"
          onConfirm={() => void confirm()}
        />
      }
    >
      <FillsList
        rows={rows}
        ticked={moved}
        onToggle={toggle}
        onAll={(on) =>
          setMoved(on ? new Set(fills.map((e) => e.id)) : new Set())
        }
        zone={zone}
        kind="split"
      />
      <WhatBox title="What will happen">
        {refusal === null ? (
          <>
            <WhatLine>
              <strong>{trade.serial}</strong> keeps {count(staying.length)},{' '}
              {sidesOf(staying)}, and {endsOf(staying)}. It keeps its note,
              rating, rule checks, targets and stops.
            </WhatLine>
            <WhatLine>
              A new trade
              {next === null ? (
                ''
              ) : (
                <>
                  , <strong>{next}</strong>,
                </>
              )}{' '}
              takes the {leaving.length} ticked{' '}
              {plural(leaving.length, 'execution')}, {sidesOf(leaving)}, and{' '}
              {endsOf(leaving)}. It copies {trade.serial}&apos;s tags and
              strategies.
            </WhatLine>
          </>
        ) : (
          <WhatLine>
            {refusal === 'nothing-left'
              ? 'Leave at least one execution in the trade.'
              : 'Tick at least one execution to move to a new trade.'}
          </WhatLine>
        )}
        <WhatLine>There is no undo. To put them back, merge the two.</WhatLine>
      </WhatBox>
      {error ? (
        <p role="alert" className="mt-3 text-[13px] font-medium text-loss">
          {error}
        </p>
      ) : null}
    </MorphDialog>
  );
}
