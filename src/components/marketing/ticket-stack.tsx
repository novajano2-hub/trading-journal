import type { CSSProperties } from 'react';
import type { PreviewTicket } from '@/domain/import/preview';
import type { TicketModel } from '@/lib/landing/sample-view';
import { OrderTicket } from './order-ticket';

/**
 * Four resting places in the fan, back to front. Phones get a tighter,
 * narrower fan so nothing crosses the gutter; md and up follow the sketch.
 * The front ticket rests low enough to leave the stamp band of the one
 * beneath it in plain view: its RULE BROKEN is the point of the stack.
 */
const SPOTS = [
  'z-[1] top-0 left-7 rotate-[5deg] md:top-5 md:left-[150px] md:rotate-[9deg]',
  'z-[2] top-10 left-4 rotate-[2.5deg] md:top-[70px] md:left-[110px] md:rotate-[4deg]',
  'z-[3] top-[104px] left-1 -rotate-2 md:top-[140px] md:left-[60px] md:-rotate-2',
  'z-[4] top-[322px] left-[30px] -rotate-[4deg] md:top-[332px] md:left-[226px] md:-rotate-[7deg]',
] as const;

const SPOT_BASE =
  'absolute w-[calc(100%-40px)] max-w-[380px] md:w-[380px] md:max-w-none';

type TicketStackProps =
  | { variant: 'sample'; tickets: readonly TicketModel[]; className?: string }
  | {
      variant: 'yours';
      tickets: readonly PreviewTicket[];
      className?: string;
    };

/** Spot index for the ticket at `i`, filling the front of the fan first. */
function spotFor(i: number, n: number, frontFirst: boolean): number {
  const count = Math.min(n, SPOTS.length);
  return frontFirst ? SPOTS.length - 1 - i : SPOTS.length - count + i;
}

export function TicketStack(props: TicketStackProps) {
  const { className = '' } = props;
  const n = Math.min(props.tickets.length, SPOTS.length);
  const caption =
    props.variant === 'sample'
      ? 'SAMPLE TICKETS'
      : n === 1
        ? 'YOUR FIRST FILL'
        : `YOUR FIRST ${n} FILLS`;

  return (
    <figure
      data-testid="ticket-stack"
      className={`relative m-0 h-[574px] w-full md:h-[620px] md:w-[620px] ${className}`}
    >
      <ol className="m-0 list-none p-0">
        {props.variant === 'sample'
          ? props.tickets.slice(0, n).map((t, i) => {
              // The newest trade sits on top and reads first.
              const spot = spotFor(i, n, true);
              return (
                <li key={t.serial} className={`${SPOT_BASE} ${SPOTS[spot]}`}>
                  <OrderTicket variant="sample" model={t} />
                </li>
              );
            })
          : props.tickets.slice(0, n).map((t, i) => {
              // The file prints in order; each fill lands on top of the last.
              const spot = spotFor(i, n, false);
              return (
                <li key={i} className={`${SPOT_BASE} ${SPOTS[spot]}`}>
                  <OrderTicket
                    variant="yours"
                    model={t}
                    fill={i + 1}
                    className="ticket-print"
                    style={{ '--print-i': i } as CSSProperties}
                  />
                </li>
              );
            })}
      </ol>
      <figcaption className="absolute bottom-0 left-1/2 -translate-x-1/2 text-xs leading-none font-bold tracking-[0.22em] whitespace-nowrap md:left-[300px] md:translate-x-0">
        {caption}
      </figcaption>
    </figure>
  );
}
