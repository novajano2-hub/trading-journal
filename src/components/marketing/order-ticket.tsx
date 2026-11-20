import type { CSSProperties } from 'react';
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
      /** Where the stamp lands: across the fields, or high in the corner when the ticket is mostly covered. */
      stampPlacement?: 'body' | 'corner';
    })
  | (Common & {
      variant: 'yours';
      model: PreviewTicket;
      /** 1-based position of this fill in the visitor's file. */
      fill: number;
    });

const MISSING = '—';

function shown(value: string | number | undefined): string {
  if (value === undefined) return MISSING;
  const s = String(value).trim();
  return s === '' ? MISSING : s;
}

function Field({
  label,
  value,
  className = '',
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className={`min-w-0 bg-stock px-2 pt-1.5 pb-1 ${className}`}>
      <dt className="text-[11px] leading-tight font-bold tracking-[0.16em] text-ink/70 uppercase">
        {label}
      </dt>
      <dd className="truncate text-[19px] leading-snug font-semibold md:text-[22px]">
        {value}
      </dd>
    </div>
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
  const time = shown(sample?.time ?? yours?.time);
  const number =
    props.variant === 'sample'
      ? `No. ${String(props.model.serial).padStart(6, '0')}`
      : `Fill ${String(props.fill).padStart(2, '0')}`;
  const corner =
    props.variant === 'sample' && props.stampPlacement === 'corner';

  return (
    <article
      data-testid={`ticket-${props.variant}`}
      aria-label={`${sample ? 'Sample ticket' : 'Your ticket'}, ${number}`}
      style={style}
      className={`ticket-stock relative flex h-[192px] w-full flex-col rounded-[3px] px-3.5 pt-3 pb-3 text-ink md:h-[236px] md:px-[18px] md:pt-4 md:pb-4 ${className}`}
    >
      <header className="flex items-baseline justify-between border-b-[1.5px] border-ink pb-2 text-[11px] leading-none font-bold tracking-[0.2em]">
        <span className="uppercase">Order ticket</span>
        <span className={sample ? '' : 'uppercase'}>{number}</span>
      </header>

      <dl className="mt-2 grid grid-cols-[52px_1fr_1fr] gap-px border border-rule bg-rule md:mt-2.5 md:grid-cols-[70px_1fr_1fr]">
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

      <p className="mt-auto flex items-baseline justify-between gap-3">
        <span className="truncate font-stamp text-[15px] leading-none tracking-[0.06em] text-stamp uppercase md:text-[17px]">
          {time}
        </span>
        <span className="shrink-0 text-[11px] leading-none font-bold tracking-[0.2em] text-ink/70 uppercase">
          {sample ? 'Filed' : 'Unfiled'}
        </span>
      </p>

      {sample?.stamp ? (
        <RubberStamp
          tone={sample.stamp === 'RULE BROKEN' ? 'sell' : 'ink'}
          size={corner ? 'sm' : 'md'}
          className={`absolute ${
            corner
              ? 'top-[30px] right-4 -rotate-[6deg] md:top-[29px] md:right-6'
              : 'top-[60px] right-4 -rotate-[14deg] md:top-[88px] md:right-[22px]'
          }`}
        >
          {sample.stamp}
        </RubberStamp>
      ) : null}
    </article>
  );
}
