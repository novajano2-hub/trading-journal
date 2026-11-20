import type { CSSProperties } from 'react';
import { formatFillTime } from '@/domain/import/fill-time';
import { MISSING, serialNumber } from '@/lib/ticket-format';
import type { PreviewTicket } from '@/domain/import/preview';
import type { TicketModel } from '@/lib/landing/sample-view';
import { RubberStamp } from './rubber-stamp';
import { SideMark } from './side-mark';

type Common = {
  className?: string;
  style?: CSSProperties;
};

export type OrderTicketProps =
  | (Common & {
      variant: 'sample';
      model: TicketModel;
    })
  | (Common & {
      variant: 'yours';
      model: PreviewTicket;
      /** 1-based position of this fill in the visitor's file. */
      fill: number;
    });

function shown(value: string | number | undefined): string {
  if (value === undefined) return MISSING;
  const s = String(value).trim();
  return s === '' ? MISSING : s;
}

/** `compact` is the loop's smaller ticket: tighter rules and a smaller figure scale. */
export function Field({
  label,
  value,
  className = '',
  compact = false,
}: {
  label: string;
  value: string;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={`min-w-0 bg-stock px-1.5 @min-[300px]:px-2 ${compact ? 'pt-1 pb-0.5' : 'pt-1.5 pb-1'} ${className}`}
    >
      <dt className="text-[11px] leading-tight font-bold tracking-[0.16em] text-ink/70 uppercase">
        {label}
      </dt>
      {/* Figures are never cut off: they step down the ticket's type scale as
          the ticket narrows, and only wrap if a visitor's value still won't fit. */}
      <dd
        className={`leading-snug font-semibold tracking-tight wrap-anywhere ${compact ? 'text-[15px] @min-[240px]:text-[17px]' : 'text-[17px] @min-[300px]:text-[19px] @min-[360px]:text-[22px]'}`}
      >
        {value}
      </dd>
    </div>
  );
}

export function TicketHeader({
  number,
  upper = false,
  compact = false,
}: {
  number: string;
  upper?: boolean;
  compact?: boolean;
}) {
  return (
    <header
      className={`flex items-baseline justify-between border-b-[1.5px] border-ink text-[11px] leading-none font-bold ${compact ? 'pb-1.5 tracking-[0.18em]' : 'pb-2 tracking-[0.2em]'}`}
    >
      <span className="uppercase">Order ticket</span>
      <span className={upper ? 'uppercase' : ''}>{number}</span>
    </header>
  );
}

export function TicketFooter({
  time,
  filed,
  compact = false,
  className = '',
}: {
  time: string;
  filed: boolean;
  compact?: boolean;
  className?: string;
}) {
  return (
    <p className={`flex items-baseline justify-between gap-3 ${className}`}>
      <span
        className={`min-w-0 font-stamp leading-none tracking-[0.06em] text-stamp uppercase wrap-anywhere ${compact ? 'text-[14px]' : 'text-[15px] @min-[360px]:text-[17px]'}`}
      >
        {time}
      </span>
      <span className="shrink-0 text-[11px] leading-none font-bold tracking-[0.2em] text-ink/70 uppercase">
        {filed ? 'Filed' : 'Unfiled'}
      </span>
    </p>
  );
}

/**
 * A trade ticket on card stock. "sample" tickets carry the domain's P&L and stamps;
 * "yours" tickets show only what was read from the visitor's file, never a stamp or P&L.
 */
export function OrderTicket(props: OrderTicketProps) {
  const { className = '', style } = props;
  const sample = props.variant === 'sample' ? props.model : null;
  const yours = props.variant === 'yours' ? props.model : null;

  const side = sample?.side ?? yours?.side;
  const symbol = shown(sample?.symbol ?? yours?.symbol);
  const price = shown(sample?.price ?? yours?.price);
  const qty = shown(sample?.qty ?? yours?.qty);
  // The visitor's own clock, reprinted the way the sample tickets print time.
  const time = shown(
    sample?.time ??
      (yours?.time === undefined ? undefined : formatFillTime(yours.time)),
  );
  const number =
    props.variant === 'sample'
      ? serialNumber(props.model.serial)
      : `Fill ${String(props.fill).padStart(2, '0')}`;

  return (
    <article
      data-testid={`ticket-${props.variant}`}
      aria-label={`${sample ? 'Sample ticket' : 'Your ticket'}, ${number}`}
      style={style}
      className={`ticket-stock @container relative flex h-[220px] w-full flex-col rounded-[3px] px-3.5 pt-3 pb-3 text-ink md:h-[236px] md:px-[18px] md:pt-4 md:pb-4 ${className}`}
    >
      <TicketHeader number={number} upper={!sample} />

      <dl className="mt-2 grid grid-cols-[44px_1fr_1fr] gap-px border border-rule bg-rule md:mt-2.5 @min-[300px]:grid-cols-[52px_1fr_1fr] @min-[360px]:grid-cols-[70px_1fr_1fr]">
        <div className="row-span-2 flex items-center justify-center bg-stock">
          <dt className="sr-only">Side</dt>
          <dd>
            <SideMark side={side} />
          </dd>
        </div>
        <Field label="Symbol" value={symbol} />
        <Field label="Price" value={price} />
        {sample ? (
          <>
            <Field label="Qty" value={qty} />
            <Field label="Net P&L" value={sample.netPnl} />
          </>
        ) : (
          <Field label="Qty" value={qty} className="col-span-2" />
        )}
      </dl>

      {sample?.stamp ? (
        // The stamp band, between the fields and the clock: ink never lands on a figure.
        <div className="mt-auto flex pt-1 pb-0.5 pl-1">
          <RubberStamp
            tone={sample.stamp === 'RULE BROKEN' ? 'sell' : 'ink'}
            size="sm"
            className="-rotate-[2deg]"
          >
            {sample.stamp}
          </RubberStamp>
        </div>
      ) : null}

      <TicketFooter
        time={time}
        filed={!!sample}
        className={sample?.stamp ? 'mt-0.5' : 'mt-auto'}
      />
    </article>
  );
}
