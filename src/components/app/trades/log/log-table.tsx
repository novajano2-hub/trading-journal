'use client';

import { Plus } from '@phosphor-icons/react/dist/ssr';
import { useRouter, useSearchParams } from 'next/navigation';
import { useId, useState } from 'react';
import { Popover } from 'radix-ui';
import { Button } from '@/components/ui/button';
import { MetricTip } from '@/components/ui/metric-tip';
import type { MetricId } from '@/content/metric-definitions';
import { dayOfTrade } from '@/data/day-log';
import { useUpdateTrades } from '@/data/query/hooks';
import { COLUMN_LABELS, type ColumnId } from '@/data/trade-columns';
import { withTagPick } from '@/data/trade-patch';
import type { Trade } from '@/domain/types';
import { usePhone } from '@/lib/use-phone';
import { TagPicker } from '../../tag-picker';
import { TradeTime } from '../../dashboard/shared';
import {
  ALIGN,
  COLUMN_WIDTHS,
  PAD_LEFT,
  cellOf,
  type CellEnv,
} from '../columns';
import { TagsCell } from '../cells';
import { PhoneRows } from '../phone-rows';
import { clockOf, dayLabel } from '@/lib/day-label';

/** The widths the day table wants over the trade log's: HH:MM:SS, a ticker pill, a contract with its expiry. */
const WIDTHS: Record<ColumnId, number> = {
  ...COLUMN_WIDTHS,
  open: 84,
  ticker: 96,
  instrument: 170,
  tags: 132,
};

/** Headers the day table spells out where the trade log is terse. */
const HEADER_LABEL: Partial<Record<ColumnId, string>> = {
  realizedR: 'Realized R',
};

/** The columns whose header names a metric. */
const HEADER_TIPS: Partial<Record<ColumnId, MetricId>> = {
  roi: 'net-roi',
  realizedR: 'realized-r',
};

/** The tags cell with a "+" that opens the tag picker for this trade. */
function TagsWithPicker({
  trade,
  env,
}: {
  trade: Trade;
  env: CellEnv;
}): React.JSX.Element {
  const update = useUpdateTrades();
  const title = useId();
  const date = dayLabel(dayOfTrade(trade, env.timeZone));
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <span className="min-w-0 flex-1">
        <TagsCell
          tags={env.facts.tagsOf(trade)}
          mistakes={env.facts.mistakesOf(trade)}
        />
      </span>
      <Popover.Root>
        <Popover.Trigger
          aria-label={`Add tags to ${trade.instrument.root}, ${dayLabel(dayOfTrade(trade, env.timeZone))}`}
          className="grid size-[22px] flex-none place-items-center rounded-full border border-line text-muted outline-offset-1 hover:bg-sunken focus-visible:outline-2 focus-visible:outline-accent data-[state=open]:bg-sunken pointer-coarse:size-11"
        >
          <Plus size={12} weight="bold" aria-hidden="true" />
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            aria-labelledby={title}
            align="end"
            sideOffset={6}
            collisionPadding={12}
            className="z-[60] w-[280px] max-w-[calc(100vw-24px)] origin-(--radix-popover-content-transform-origin) rounded-[12px] border border-line bg-surface-1 p-3 text-text shadow-[var(--shadow)] outline-none motion-safe:data-[state=closed]:animate-tip-out motion-safe:data-[state=open]:animate-pop-in"
          >
            {/* Names the trade, as the record's tag panel does; the wording is Keel's own. */}
            <h3
              id={title}
              className="mb-2 text-[13.5px] font-semibold text-text"
            >
              Tags for {trade.instrument.root}, {date}
            </h3>
            <TagPicker
              label={`Tags for ${trade.instrument.root}`}
              autoFocus
              selected={trade.tagIds}
              onChange={(ids) =>
                update.mutate({
                  ids: [trade.id],
                  patch: withTagPick(trade.tagIds, ids),
                })
              }
            />
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </span>
  );
}

/** One cell of the day table: the trade log's, but HH:MM:SS for the open time, "(open)" and a bracketed ROI for an open trade, and the tag picker. */
function Cell({
  id,
  t,
  env,
}: {
  id: ColumnId;
  t: Trade;
  env: CellEnv;
}): React.ReactNode {
  const open = t.status === 'open';
  switch (id) {
    case 'open':
      return (
        <TradeTime
          text={`${clockOf(t.openedAt, env.timeZone, true)}`}
          className="text-[13px]"
        />
      );
    case 'net':
      return (
        <>
          {open ? <span className="mr-1 text-faint">(open)</span> : null}
          {cellOf(id, t, env)}
        </>
      );
    case 'roi':
      return open ? <>({cellOf(id, t, env)})</> : cellOf(id, t, env);
    case 'tags':
      return <TagsWithPicker trade={t} env={env} />;
    default:
      return cellOf(id, t, env);
  }
}

/** Rows a table shows before its Show more (the spec: tables page at 50 rows). */
const PAGE = 50;

/**
 * A day's (or week's) trades as a table: the given columns, rows in the order
 * given (newest open time first), no sorting and no selection. The first 50
 * rows, then a Show more for the next 50 (Keel's call, TradeZella unknown: the
 * record is silent on paging). A row opens its trade, carrying the page's
 * filters; the instrument is its link. Below `sm` it becomes the trade log's
 * two-line rows.
 */
export function LogTable({
  trades,
  columns,
  env,
  label = 'Trades',
}: {
  trades: readonly Trade[];
  columns: readonly ColumnId[];
  env: CellEnv;
  /** The table's name, so a page of several tables says which. */
  label?: string;
}): React.JSX.Element {
  const phone = usePhone();
  const router = useRouter();
  const search = useSearchParams().toString();
  const [shown, setShown] = useState(PAGE);
  const rows = trades.slice(0, shown);
  const more =
    trades.length > shown ? (
      <div className="flex justify-center py-2">
        <Button
          variant="secondary"
          aria-label={`Show more, ${label}`}
          onClick={() => setShown((n) => n + PAGE)}
        >
          Show more
        </Button>
      </div>
    ) : null;

  if (phone)
    return (
      <>
        <PhoneRows trades={rows} env={env} marksOpen />
        {more}
      </>
    );

  return (
    <>
      <div className="relative overflow-x-auto">
        <table
          aria-label={label}
          style={{
            minWidth: `${columns.reduce((n, id) => n + WIDTHS[id], 0)}px`,
          }}
          className="w-full table-fixed border-collapse text-[13px] whitespace-nowrap [font-stretch:90%]"
        >
          <colgroup>
            {columns.map((id) => (
              <col key={id} style={{ width: WIDTHS[id] }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              {columns.map((id) => {
                const align = ALIGN[id];
                const tip = HEADER_TIPS[id];
                return (
                  <th
                    key={id}
                    scope="col"
                    className={`h-10 border-b border-line pr-1.5 align-middle text-xs font-medium text-faint last:pr-0 ${PAD_LEFT.has(id) ? 'pl-4' : ''} ${align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'}`}
                  >
                    {tip ? (
                      <MetricTip
                        id={tip}
                        basis={env.ctx.pnlBasis}
                        className="text-xs font-medium"
                      >
                        {HEADER_LABEL[id] ?? COLUMN_LABELS[id].label}
                      </MetricTip>
                    ) : (
                      COLUMN_LABELS[id].label
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => (
              <tr
                key={t.id}
                onClick={(e) => {
                  // The row opens the trade; its own links and buttons keep their jobs.
                  if (
                    (e.target as HTMLElement).closest(
                      'a,button,input,[role=dialog]',
                    )
                  )
                    return;
                  router.push(
                    `/app/trades/${encodeURIComponent(t.id)}${search ? `?${search}` : ''}`,
                  );
                }}
                className="h-10 cursor-pointer border-t border-line/70 text-text transition-colors duration-200 ease-(--ease-glide) first:border-t-0 hover:bg-sunken/60"
              >
                {columns.map((id) => {
                  const align = ALIGN[id];
                  return (
                    <td
                      key={id}
                      className={`overflow-hidden py-1 pr-1.5 last:pr-0 ${PAD_LEFT.has(id) ? 'pl-4' : ''} ${align === 'right' ? 'text-right tabular-nums' : align === 'center' ? 'text-center' : 'text-left'}`}
                    >
                      <Cell id={id} t={t} env={env} />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {more}
    </>
  );
}
