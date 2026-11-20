import type { CSSProperties } from 'react';
import { formatMoney, formatPct, formatPnl, formatRatio } from '@/lib/format';
import { plotEquity, type Plotted } from '@/lib/landing/equity-plot';
import { SAMPLE_START, type SampleView } from '@/lib/landing/sample-view';
import {
  MISSING,
  onTradingDate,
  ticketTime,
  weekdayOf,
} from '@/lib/ticket-format';
import { RubberStamp } from '../rubber-stamp';
import { AFTER_HEAD, SECTION, SectionHead } from './section-head';

const weekday = (date: string, style: 'short' | 'long' = 'short') =>
  weekdayOf(date, style);
const dayMonth = (date: string) =>
  onTradingDate(date, { day: 'numeric', month: 'short' });

function LedgerRow({
  label,
  value,
  note,
  total = false,
}: {
  label: string;
  value: string;
  note?: string;
  total?: boolean;
}) {
  return (
    <div
      className={`flex items-baseline justify-between gap-4 py-2.5 ${
        total
          ? 'border-t-[1.5px] border-b-4 border-double border-ink'
          : 'border-b border-rule'
      }`}
    >
      <dt className="min-w-0">
        <span className="block text-[12px] leading-tight font-bold tracking-[0.16em] uppercase">
          {label}
        </span>
        {note ? (
          <span className="mt-0.5 block text-[13px] leading-snug font-medium text-ink/75">
            {note}
          </span>
        ) : null}
      </dt>
      <dd
        className={`shrink-0 font-semibold ${total ? 'text-[24px]' : 'text-[19px]'}`}
      >
        {value}
      </dd>
    </div>
  );
}

/** The sample week as a filed daily recap sheet: every figure computed by the engine. */
export function SampleWeekSection({ view }: { view: SampleView }) {
  const { summary, days, drawdown, equity, trades } = view;
  const first = days[0];
  const last = days.at(-1);
  const lastFill = equity.at(-1);
  if (!first || !last || !lastFill) return null;

  const { points, col, baseline } = plotEquity(equity, days, SAMPLE_START);
  const line = points
    .map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(' ');
  const maxAbs = Math.max(...days.map((d) => Math.abs(d.net)), 1);
  const peak = points.find((p) => p.point?.time === drawdown.peakAt);
  const trough = points.find((p) => p.point?.time === drawdown.troughAt);
  const dayOf = (p: Plotted | undefined) => (p ? days[p.day]?.date : undefined);
  const peakDay = dayOf(peak);
  const troughDay = dayOf(trough);

  return (
    <section aria-labelledby="week-title" className={SECTION}>
      <SectionHead id="week-title" title="Sample week, on one sheet.">
        Monday to Friday, {trades.length} sample trades, recapped the way Keel
        files yours: fees in, to the cent.
      </SectionHead>

      <div className={`recap-lift ${AFTER_HEAD}`}>
        <div className="recap-sheet rounded-[3px] bg-stock px-4 pt-12 pb-6 text-ink md:px-8 md:pt-14 md:pb-8">
          <div className="flex flex-col gap-5 border-b-[1.5px] border-ink pb-4 lg:flex-row lg:items-end lg:justify-between">
            <p className="flex items-center gap-4">
              <span className="font-display text-[34px] leading-none font-black uppercase md:text-[44px]">
                Daily recap
              </span>
              <RubberStamp tone="ink" size="sm" className="-rotate-[7deg]">
                Sample
              </RubberStamp>
            </p>
            <dl className="grid grid-cols-2 gap-px border border-rule bg-rule sm:grid-cols-3 lg:min-w-[560px]">
              <div className="bg-stock px-2.5 pt-1.5 pb-1">
                <dt className="text-[11px] font-bold tracking-[0.16em] text-ink/70 uppercase">
                  Account
                </dt>
                <dd className="text-[17px] font-semibold">Sample</dd>
              </div>
              <div className="bg-stock px-2.5 pt-1.5 pb-1">
                <dt className="text-[11px] font-bold tracking-[0.16em] text-ink/70 uppercase">
                  Week
                </dt>
                <dd className="text-[17px] font-semibold">
                  {dayMonth(first.date)} to {dayMonth(last.date)}
                </dd>
              </div>
              <div className="col-span-2 bg-stock px-2.5 pt-1.5 pb-1 sm:col-span-1">
                <dt className="text-[11px] font-bold tracking-[0.16em] text-ink/70 uppercase">
                  Last fill
                </dt>
                <dd className="font-stamp text-[16px] leading-[25.5px] tracking-[0.06em] text-stamp uppercase">
                  {ticketTime(lastFill.time)}
                </dd>
              </div>
            </dl>
          </div>

          <div className="mt-6 grid gap-x-12 gap-y-8 xl:grid-cols-[minmax(0,1fr)_380px]">
            <figure className="m-0 min-w-0">
              <figcaption
                id="equity-cap"
                className="flex flex-wrap items-baseline justify-between gap-x-4 text-[12px] font-bold tracking-[0.16em] uppercase"
              >
                <span>Equity</span>
                <span className="tracking-[0.06em] normal-case">
                  {formatMoney(SAMPLE_START)} to {formatMoney(lastFill.equity)}
                </span>
              </figcaption>
              <div className="relative mt-3 h-[176px] border-y border-rule md:h-[232px]">
                <svg
                  role="img"
                  aria-labelledby="equity-cap"
                  aria-describedby="week-days"
                  viewBox="0 0 1000 1000"
                  preserveAspectRatio="none"
                  className="absolute inset-0 size-full overflow-visible"
                >
                  {days.slice(1).map((d, i) => (
                    <line
                      key={d.date}
                      x1={col * (i + 1)}
                      x2={col * (i + 1)}
                      y1={0}
                      y2={1000}
                      className="stroke-rule"
                      strokeWidth={1}
                      vectorEffect="non-scaling-stroke"
                    />
                  ))}
                  <line
                    x1={0}
                    x2={1000}
                    y1={baseline}
                    y2={baseline}
                    className="stroke-ink/55"
                    strokeWidth={1.5}
                    strokeDasharray="5 5"
                    vectorEffect="non-scaling-stroke"
                  />
                  {peak && trough ? (
                    <path
                      d={`M${peak.x} ${peak.y}H${trough.x}V${trough.y}`}
                      fill="none"
                      className="stroke-ink"
                      strokeWidth={1.5}
                      strokeDasharray="2 4"
                      vectorEffect="non-scaling-stroke"
                    />
                  ) : null}
                  <polyline
                    points={line}
                    fill="none"
                    className="stroke-ink"
                    strokeWidth={2.75}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    vectorEffect="non-scaling-stroke"
                  />
                  {points.slice(1).map((p) => (
                    <path
                      key={p.point?.tradeId}
                      d={`M${p.x} ${p.y}h0`}
                      className="stroke-ink"
                      strokeWidth={8}
                      strokeLinecap="round"
                      vectorEffect="non-scaling-stroke"
                    />
                  ))}
                </svg>
                {days.map((d, i) => (
                  <span
                    key={d.date}
                    aria-hidden="true"
                    className="absolute top-1 -translate-x-1/2 text-[11px] leading-none font-bold tracking-[0.1em] uppercase sm:hidden"
                    style={{ left: `${((i + 0.5) / days.length) * 100}%` }}
                  >
                    {weekday(d.date)}
                  </span>
                ))}
                <span
                  aria-hidden="true"
                  className="absolute left-1 translate-y-1.5 text-[11px] leading-none font-bold tracking-[0.12em] uppercase"
                  style={{ top: `${baseline / 10}%` }}
                >
                  Start
                </span>
                {trough ? (
                  <span
                    aria-hidden="true"
                    className="absolute -translate-x-1/2 translate-y-3 text-center text-[11px] leading-tight font-bold tracking-[0.08em] uppercase"
                    style={{
                      left: `${trough.x / 10}%`,
                      top: `${trough.y / 10}%`,
                    }}
                  >
                    Max drawdown
                    <span className="block text-[13px] tracking-normal normal-case">
                      {formatMoney(drawdown.amount)}
                    </span>
                  </span>
                ) : null}
              </div>
              <ol
                id="week-days"
                className="m-0 grid list-none p-0 sm:grid-cols-5"
              >
                {days.map((d) => (
                  <li
                    key={d.date}
                    className="grid min-w-0 grid-cols-[64px_minmax(0,1fr)_96px] items-center gap-x-3 border-t border-rule py-2 first:border-t-0 sm:block sm:border-t-0 sm:border-l sm:px-2 sm:pt-2 sm:pb-0 sm:first:border-l-0 md:px-2.5"
                  >
                    <span className="block">
                      <span className="block font-display text-[20px] leading-none font-black uppercase md:text-[24px]">
                        {weekday(d.date)}
                      </span>
                      <span className="block text-[11px] leading-snug font-bold tracking-[0.1em] text-ink/70 uppercase">
                        {dayMonth(d.date)}
                      </span>
                    </span>
                    <span aria-hidden="true" className="day-track">
                      <span
                        className={`day-bar ${d.net >= 0 ? 'bg-ink' : 'day-loss border-[1.5px] border-ink'}`}
                        data-sign={d.net >= 0 ? 'gain' : 'loss'}
                        style={
                          {
                            '--bar': Math.max(0.04, Math.abs(d.net) / maxAbs),
                          } as CSSProperties
                        }
                      />
                    </span>
                    <span className="block text-right sm:text-left">
                      <span className="block text-[17px] leading-tight font-semibold sm:text-[15px] md:text-[17px]">
                        {formatPnl(d.net)}
                      </span>
                      <span className="block text-[11px] leading-snug font-medium text-ink/70">
                        {d.tradeCount === 1
                          ? '1 trade'
                          : `${d.tradeCount} trades`}
                      </span>
                    </span>
                  </li>
                ))}
              </ol>
            </figure>

            <dl className="m-0 self-start">
              <LedgerRow
                label="Gross P&L"
                value={formatPnl(summary.grossPnl)}
              />
              <LedgerRow label="Fees" value={formatPnl(-summary.fees)} />
              <LedgerRow
                label="Net P&L"
                value={formatPnl(summary.netPnl)}
                total
              />
              <div className="h-4" />
              <LedgerRow
                label="Win rate"
                value={
                  summary.winRate === null
                    ? MISSING
                    : formatPct(summary.winRate, 1)
                }
                note={`${summary.wins} won, ${summary.losses} lost`}
              />
              <LedgerRow
                label="Profit factor"
                value={
                  summary.profitFactor === null
                    ? MISSING
                    : formatRatio(summary.profitFactor)
                }
                note="Dollars won for each dollar lost"
              />
              <LedgerRow
                label="Expectancy"
                value={
                  summary.expectancy === null
                    ? MISSING
                    : formatPnl(summary.expectancy)
                }
                note="Per trade, after fees"
              />
              <LedgerRow
                label="Max drawdown"
                value={formatMoney(drawdown.amount)}
                note={
                  peakDay && troughDay
                    ? `${weekday(peakDay, 'long')}’s high to ${weekday(troughDay, 'long')}’s low`
                    : undefined
                }
              />
            </dl>
          </div>
        </div>
      </div>
    </section>
  );
}
