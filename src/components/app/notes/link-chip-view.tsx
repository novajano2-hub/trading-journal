'use client';

// How a trade chip and a day chip draw (spec §5.6, B34). A chip stores an id
// or a date; what it shows is read here, when it is drawn: a trade's symbol,
// number and net (through `useDisplay`, so Privacy masks the money), a day's
// date. Each opens its page. A trade that has gone shows a neutral chip that
// opens nothing.
import { CalendarBlank, ListBullets } from '@phosphor-icons/react/dist/ssr';
import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import Link from 'next/link';
import { usePrefs, useTrade } from '@/data/query/hooks';
import { localDate } from '@/domain/time';
import { dayHref } from '@/lib/day-routes';
import { useDisplay } from '@/lib/display';
import { dayLabel } from '@/lib/time-format';

const ICON = { size: 13, 'aria-hidden': true } as const;

export function TradeChipView({
  node,
  selected,
}: NodeViewProps): React.JSX.Element {
  const id = String(node.attrs.tradeId ?? '');
  const trade = useTrade(id);
  const display = useDisplay();
  const t = trade.data;
  return (
    <NodeViewWrapper
      as="span"
      data-selected={selected || undefined}
      className="note-chip-wrap"
    >
      {t ? (
        (() => {
          const figure = display.ofTrade(t);
          const net = display.figure(figure);
          return (
            <Link
              href={`/app/trades/${encodeURIComponent(t.id)}`}
              prefetch={false}
              className="note-chip"
            >
              <ListBullets {...ICON} />
              {t.instrument.symbol}
              <em>{t.serial}</em>
              <span
                className={
                  figure.money > 0
                    ? 'text-gain'
                    : figure.money < 0
                      ? 'text-loss'
                      : undefined
                }
                aria-label={net.label}
              >
                {net.text}
              </span>
            </Link>
          );
        })()
      ) : (
        <span
          className="note-chip note-chip-missing"
          title={trade.isPending ? undefined : 'This trade has been deleted.'}
          aria-busy={trade.isPending || undefined}
        >
          <ListBullets {...ICON} />
          {trade.isPending ? 'Trade' : 'Trade unavailable'}
        </span>
      )}
    </NodeViewWrapper>
  );
}

export function DayChipView({
  node,
  selected,
}: NodeViewProps): React.JSX.Element {
  const date = String(node.attrs.date ?? '');
  const prefs = usePrefs().data;
  const zone =
    prefs?.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const now = localDate(new Date().toISOString(), zone);
  const year = date.slice(0, 4) !== now.slice(0, 4);
  return (
    <NodeViewWrapper
      as="span"
      data-selected={selected || undefined}
      className="note-chip-wrap"
    >
      <Link href={dayHref(date, now)} prefetch={false} className="note-chip">
        <CalendarBlank {...ICON} />
        {dayLabel(date, { year })}
      </Link>
    </NodeViewWrapper>
  );
}
