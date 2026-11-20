import { ArrowDown, ArrowRight, ArrowUp } from 'lucide-react';
import type { Trade } from '@/domain/types';
import { formatMoney, formatPnl } from '@/lib/format';
import { ticketPrice } from '@/lib/landing/sample-view';
import { MISSING, serialNumber, ticketTime } from '@/lib/ticket-format';
import { Field, TicketFooter, TicketHeader } from '../order-ticket';
import { RubberStamp } from '../rubber-stamp';
import { SideMark } from '../side-mark';
import { AFTER_HEAD, SECTION, SectionHead } from './section-head';

/** Authored sample wording: the rule the sample trade broke, and the fix noted on it. */
const RULE = 'Stop in with the entry';
const NOTE = 'Stop went in late. Fix: bracket order on every entry.';

type Stage = 1 | 2 | 3 | 4 | 5;

interface LoopTicketModel {
  number: string;
  side: 'buy' | 'sell';
  symbol: string;
  qty: string;
  entry: string;
  exit: string;
  net: string;
  time: string;
}

function toModel(t: Trade): LoopTicketModel {
  const first = t.executions[0];
  return {
    number: serialNumber(t.serial),
    side: first?.side ?? (t.direction === 'long' ? 'buy' : 'sell'),
    symbol: t.instrument.symbol,
    qty: String(t.maxPosition),
    entry: ticketPrice(t, t.avgEntry),
    exit: t.avgExit === undefined ? MISSING : ticketPrice(t, t.avgExit),
    net: formatPnl(t.net, t.pnlCurrency),
    time: ticketTime(t.openedAt),
  };
}

/**
 * The order ticket at one stop of the loop. Fields fill in as the ticket travels:
 * the fill, then the exit and net, then the review stamp in the band above the
 * time, then (on the next ticket) the rule it carries.
 */
function LoopTicket({
  model,
  stage,
  rule,
}: {
  model: LoopTicketModel;
  stage: Stage;
  /** A rule printed on a fresh ticket, not graded yet. */
  rule?: string;
}) {
  const filed = stage >= 2 && stage <= 4;
  return (
    <div className="ticket-stock relative z-[1] flex h-[236px] flex-col rounded-[3px] px-2.5 pt-2.5 pb-2.5 text-ink @min-[240px]:px-3">
      <TicketHeader number={model.number} compact />
      <dl className="mt-2 grid grid-cols-[36px_1fr_1fr] gap-px border border-rule bg-rule @min-[240px]:grid-cols-[40px_1fr_1fr] @min-[300px]:grid-cols-[44px_1fr_1fr]">
        <div className="row-span-2 flex items-center justify-center bg-stock">
          <dt className="sr-only">Side</dt>
          <dd>
            <SideMark side={model.side} size="sm" />
          </dd>
        </div>
        <Field label="Symbol" value={model.symbol} compact />
        <Field label="Qty" value={model.qty} compact />
        <Field label="In" value={model.entry} compact />
        <Field label="Out" value={filed ? model.exit : MISSING} compact />
        <Field
          label="Net P&L"
          value={filed ? model.net : MISSING}
          className="col-span-3"
          compact
        />
      </dl>
      {rule ? (
        <p className="mt-2.5 flex items-center gap-2 text-[13px] leading-tight font-semibold">
          <span
            aria-hidden="true"
            className="size-3.5 shrink-0 rounded-[2px] border-[1.5px] border-ink"
          />
          <span>
            <span className="sr-only">Rule to grade: </span>
            {rule}
          </span>
        </p>
      ) : null}
      <TicketFooter
        time={model.time}
        filed={filed}
        compact
        className="mt-auto"
      />
      {stage === 3 || stage === 4 ? (
        <RubberStamp
          tone="sell"
          size="xs"
          className="absolute top-[176px] right-3 -rotate-[5deg]"
        >
          RULE BROKEN
        </RubberStamp>
      ) : null}
    </div>
  );
}

const ICON = { 'aria-hidden': true, strokeWidth: 2 } as const;

/** One losing sample trade, carried all the way round the loop Keel is built on. */
export function LoopSection({ trades }: { trades: readonly Trade[] }) {
  const broken = trades.find((t) => t.ruleChecks.some((c) => !c.followed));
  const next = broken
    ? trades.find((t) => t.serial === broken.serial + 1)
    : undefined;
  if (!broken || !next) return null;
  const ticket = toModel(broken);
  const nextTicket = toModel(next);

  const steps: {
    name: string;
    says: string;
    model: LoopTicketModel;
    stage: Stage;
  }[] = [
    {
      name: 'Trade',
      says: 'The fill prints as a ticket, time-stamped to the second.',
      model: ticket,
      stage: 1,
    },
    {
      name: 'Journal',
      says: `Keel files it: the exit, ${formatMoney(broken.fees, broken.pnlCurrency)} in fees and the net, to the cent.`,
      model: ticket,
      stage: 2,
    },
    {
      name: 'Review',
      says: 'Checked against your rules. The stop wasn’t kept, so it’s stamped.',
      model: ticket,
      stage: 3,
    },
    {
      name: 'Test',
      says: 'You note the fix. The next trades put it to the test.',
      model: ticket,
      stage: 4,
    },
    {
      name: 'Trade again',
      says: 'The next ticket carries the rule. The loop starts over.',
      model: nextTicket,
      stage: 5,
    },
  ];

  return (
    <section aria-labelledby="loop-title" className={SECTION}>
      <SectionHead id="loop-title" title="One bad trade, all the way round.">
        Sample ticket {ticket.number} goes round the loop Keel is built on.
        Every stop leaves its mark.
      </SectionHead>

      <div className={`relative ${AFTER_HEAD}`}>
        <ol className="m-0 grid list-none gap-x-7 gap-y-16 p-0 md:grid-cols-2 xl:grid-cols-5 xl:gap-y-0">
          {steps.map((s, i) => (
            <li key={s.name} className="relative min-w-0">
              <h3 className="font-display text-[32px] leading-none font-black uppercase">
                {s.name}
              </h3>
              <p className="mt-2 max-w-[26em] text-base leading-snug font-medium xl:min-h-[3lh] xl:text-[15px]">
                {s.says}
              </p>
              {/* The ticket's width sets its type steps, at every breakpoint. */}
              <div className="@container relative mt-4 max-w-[380px] xl:max-w-none">
                <LoopTicket
                  model={s.model}
                  stage={s.stage}
                  rule={s.stage === 5 ? RULE : undefined}
                />
                {i < steps.length - 1 ? (
                  <ArrowRight
                    {...ICON}
                    className="absolute top-1/2 -right-[26px] hidden size-6 -translate-y-1/2 xl:block"
                  />
                ) : null}
              </div>
              {s.stage === 4 ? (
                <p className="loop-note relative mx-3 -mt-3 max-w-[340px] rotate-[1.5deg] rounded-b-[2px] px-3 pt-5 pb-2.5 text-[14px] leading-[22px] font-semibold xl:mx-2">
                  <span className="block text-[11px] leading-[22px] font-bold tracking-[0.2em] text-ink/70 uppercase">
                    Note
                  </span>
                  {NOTE}
                </p>
              ) : null}
              {i < steps.length - 1 ? (
                <ArrowDown
                  {...ICON}
                  className="mx-auto mt-6 -mb-10 block size-7 md:hidden"
                />
              ) : null}
            </li>
          ))}
        </ol>
        {/* The way back: from the next ticket round to the first stop. */}
        <div
          aria-hidden="true"
          className="loop-return relative mt-8 hidden h-11 rounded-b-[22px] border-x-2 border-b-2 border-ink xl:block"
        >
          <ArrowUp
            {...ICON}
            className="absolute -top-[22px] -left-[13px] size-6 bg-gold"
          />
        </div>
      </div>
    </section>
  );
}
