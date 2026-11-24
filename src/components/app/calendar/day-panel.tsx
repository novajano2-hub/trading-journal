'use client';

import {
  CalendarBlank,
  Info,
  ListBullets,
  NotePencil,
} from '@phosphor-icons/react/dist/ssr';
import Link from 'next/link';
import { useId } from 'react';
import { FigureText } from '@/components/product/figure-text';
import { buttonClasses } from '@/components/ui/button-styles';
import { Chip, SideChip } from '@/components/ui/chip';
import { IconTile } from '@/components/ui/icon-tile';
import { MetricTip } from '@/components/ui/metric-tip';
import type { CalendarDay, DayExit, DayGrading } from '@/data/calendar';
import { serializeFilters, type GlobalFilters } from '@/data/filters';
import { formatUnitValue } from '@/lib/display';
import { formatPct, formatQty, plural } from '@/lib/format';
import { RatioText } from '../ratio-text';
import { TradeLink } from '../trades/cells';
import { CARD, InstrumentName } from '../dashboard/shared';
import { dayLabel, TONE_INK, type FormatMoney } from './month-grid';

const TONE_CHIP = { gain: 'gain', loss: 'loss', flat: 'accent' } as const;
const TONE_WORD = { gain: 'Green day', loss: 'Red day', flat: 'Flat day' };

/** "10:42" on the clock of `timeZone`. */
function clock(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(iso));
}

const W = 296;
const H = 112;

/** The day's running P&L, stepping at each exit; its last level is the day's net. */
function DayChart({
  exits,
  label,
}: {
  exits: readonly DayExit[];
  label: string;
}): React.JSX.Element {
  const id = useId();
  const t0 = Date.parse(exits[0]!.time);
  const t1 = Date.parse(exits[exits.length - 1]!.time);
  const span = Math.max(1, t1 - t0);
  const pad = 6;
  const x = (iso: string) =>
    pad + ((Date.parse(iso) - t0) / span) * (W - 2 * pad - 24);
  const levels = exits.reduce<number[]>(
    (acc, e) => [...acc, (acc[acc.length - 1] ?? 0) + e.value],
    [],
  );
  const lo = Math.min(0, ...levels);
  const hi = Math.max(0, ...levels);
  const y = (v: number) =>
    hi === lo ? H / 2 : 8 + ((hi - v) / (hi - lo)) * (H - 16);
  const base = y(0);
  let d = `M${pad},${base}`;
  exits.forEach((e, i) => {
    d += ` H${x(e.time)} V${y(levels[i]!)}`;
  });
  d += ` H${W - pad}`;
  const area = `${d} V${base} Z`;
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={label}
      className="mt-2 block h-auto w-full max-w-[460px] overflow-visible"
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--accent)" stopOpacity="0.22" />
          <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <line
        x1={pad}
        x2={W - pad}
        y1={base}
        y2={base}
        stroke="var(--line-2)"
        strokeDasharray="3 4"
      />
      <path d={area} fill={`url(#${id})`} />
      <path
        d={d}
        fill="none"
        stroke="var(--accent)"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * One day: its net, its figures, a running line, the trades that exited on
 * it, and the way into its note and the trade log. Beside the month from
 * `lg`; a sheet below it (the view wraps it).
 */
export function DayPanel({
  date,
  day,
  exits,
  grading,
  currency,
  stillOpen,
  fmt,
  basis,
  timeZone,
  filters,
  headingId,
  inSheet = false,
}: {
  date: string;
  day: CalendarDay;
  exits: readonly DayExit[];
  grading: DayGrading;
  currency: string;
  /** Trades opened on this date that have no exit yet. */
  stillOpen: number;
  fmt: FormatMoney;
  basis: 'net' | 'gross';
  timeZone: string;
  filters: GlobalFilters;
  headingId: string;
  /** In the sheet, its close button takes the top right. */
  inSheet?: boolean;
}): React.JSX.Element {
  const decided = day.wins + day.losses;
  const other = basis === 'net' ? day.gross : day.gross - day.fees;
  const query = serializeFilters({
    ...filters,
    range: { from: date, to: date },
  }).toString();
  const tip = (
    id: Parameters<typeof MetricTip>[0]['id'],
    label: string,
    note?: string,
  ) => (
    <MetricTip id={id} basis={basis} note={note}>
      {label}
    </MetricTip>
  );
  const mini: [string, React.ReactNode, React.ReactNode][] = [
    [
      'Trades',
      tip('trades', 'Trades', 'Here, trades with an exit on this day.'),
      day.trades,
    ],
    [
      'Winners',
      tip('winners', 'Winners', 'Here, trades that exited this day in profit.'),
      day.wins,
    ],
    [
      'Losers',
      tip('losers', 'Losers', 'Here, trades that exited this day at a loss.'),
      day.losses,
    ],
    [
      'Win rate',
      tip('win-rate', 'Win rate'),
      decided === 0 ? 'None decided' : formatPct(day.wins / decided, 1),
    ],
    ['Volume', tip('volume', 'Volume'), formatQty(day.volume)],
    [
      'Profit factor',
      tip(
        'profit-factor',
        'Profit factor',
        'Here, what the day won over what it lost.',
      ),
      <RatioText key="pf" value={day.profitFactor} />,
    ],
    ['Fees', tip('fees', 'Fees'), <FigureText key="f" f={fmt(-day.fees)} />],
    [
      basis === 'net' ? 'Gross' : 'Net',
      basis === 'net' ? tip('gross-pnl', 'Gross') : tip('net-pnl', 'Net'),
      <FigureText key="g" f={fmt(other)} />,
    ],
  ];
  if (day.r !== null)
    mini.push([
      'Realized R',
      tip('realized-r', 'Realized R'),
      formatUnitValue('r', day.r, { currency, signed: true }),
    ]);
  for (const [key, id, label] of [
    ['ticks', 'day-ticks', 'Ticks'],
    ['pips', 'day-pips', 'Pips'],
    ['points', 'day-points', 'Points'],
  ] as const)
    if (day[key] !== null)
      mini.push([
        label,
        tip(id, label),
        formatUnitValue(key, day[key], { currency, signed: true }),
      ]);
  const { rules, mistakes } = grading;
  mini.push(
    [
      'Rules kept',
      tip(
        'rule-adherence',
        'Rules kept',
        'Here, the checks on the trades that exited this day, for the rules that apply to each.',
      ),
      rules.checked === 0 ? 'None graded' : `${rules.kept} of ${rules.checked}`,
    ],
    [
      'Mistakes',
      tip(
        'mistake-cost',
        'Mistakes',
        'Here, trades that exited this day with a mistake tag, and what they made on it.',
      ),
      mistakes.trades === 0 ? (
        'None'
      ) : (
        <>
          {mistakes.trades} {plural(mistakes.trades, 'trade')}, net{' '}
          <FigureText f={fmt(mistakes.pnl)} />
        </>
      ),
    ],
  );
  return (
    <div className="flex min-h-0 flex-col">
      <div className={`flex items-center gap-2.5 ${inSheet ? 'pr-11' : ''}`}>
        <IconTile icon={CalendarBlank} tone="accent" />
        <h2
          id={headingId}
          // The sheet opens with focus here, not on its close button.
          tabIndex={inSheet ? -1 : undefined}
          className="text-[15px] font-semibold tracking-[-0.015em] text-text outline-none!"
        >
          {dayLabel(date)}
        </h2>
        {day.tone !== 'none' ? (
          <span className="ml-auto">
            <Chip tone={TONE_CHIP[day.tone]}>{TONE_WORD[day.tone]}</Chip>
          </span>
        ) : null}
      </div>

      {day.trades === 0 ? (
        <p className="mt-4 text-[14px] leading-relaxed text-muted">
          No trades exited this day.
          {stillOpen > 0 ? '' : ' Days are booked on the date a trade exits.'}
        </p>
      ) : (
        <>
          <p className="mt-3 flex items-baseline gap-2.5">
            <b
              className={`text-[30px] leading-[1.1] font-semibold tracking-[-0.04em] tabular-nums ${TONE_INK[day.tone]}`}
            >
              <FigureText f={fmt(day.net, day.r, false, day)} />
            </b>
            <span className="text-[12.5px] text-faint">
              <MetricTip id="pnl" basis={basis} />
            </span>
          </p>
          <dl className="mt-3 grid grid-cols-3 gap-x-3 gap-y-2.5 border-t border-line pt-2.5">
            {mini.map(([k, label, v]) => (
              <div
                key={k}
                className={`min-w-0 ${k === 'Mistakes' ? 'col-span-full' : ''}`}
              >
                <dt className="text-[12px] text-faint">{label}</dt>
                <dd className="text-[15px] font-semibold tabular-nums text-text [overflow-wrap:anywhere]">
                  {v}
                </dd>
              </div>
            ))}
          </dl>
          {exits.length > 1 ? (
            <>
              <h3 className="mt-4 flex text-[12.5px] font-medium text-faint">
                Through the day
                <em className="ml-auto font-normal not-italic">by exit time</em>
              </h3>
              <DayChart
                exits={exits}
                label={`Running P&L through ${dayLabel(date)}, ending at ${fmt(day.net, day.r, false, day).label}`}
              />
              <p className="mt-1 flex justify-between text-[12px] text-faint tabular-nums">
                <span>{clock(exits[0]!.time, timeZone)}</span>
                <span>{clock(exits[exits.length - 1]!.time, timeZone)}</span>
              </p>
            </>
          ) : null}
          <h3 className="mt-4 text-[12.5px] font-medium text-faint">
            Trades that exited
          </h3>
          <table className="mt-1 w-full border-collapse text-[13.5px]">
            <caption className="sr-only">
              Trades that exited on {dayLabel(date)}
            </caption>
            <thead className="sr-only">
              <tr>
                <th scope="col">Exit</th>
                <th scope="col">Instrument</th>
                <th scope="col">Side</th>
                <th scope="col">P&amp;L</th>
              </tr>
            </thead>
            <tbody>
              {exits.map((e, i) => (
                <tr
                  key={`${e.trade.id}-${i}`}
                  className="border-b border-line last:border-b-0"
                >
                  <td className="h-[34px] w-[52px] pr-2 font-semibold tabular-nums text-text">
                    {clock(e.time, timeZone)}
                  </td>
                  <td className="min-w-0 pr-2">
                    <TradeLink id={e.trade.id}>
                      <InstrumentName trade={e.trade} timeZone={timeZone} />
                    </TradeLink>
                  </td>
                  <td className="w-[60px] pr-2">
                    <SideChip side={e.trade.direction} />
                  </td>
                  <td
                    className={`text-right font-[550] tabular-nums ${e.value < 0 ? 'text-loss' : e.value > 0 ? 'text-gain' : 'text-text'}`}
                  >
                    <FigureText f={fmt(e.value, e.r, false, e)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {stillOpen > 0 ? (
        <p className="mt-2.5 flex gap-1.5 text-[12.5px] leading-snug text-muted">
          <Info
            aria-hidden="true"
            size={15}
            className="mt-px flex-none text-faint"
          />
          {stillOpen} {plural(stillOpen, 'trade')} opened this day{' '}
          {stillOpen === 1 ? 'is' : 'are'} still open. An exit books on its own
          day.
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-3">
        <Link
          href={`/app/notebook/daily/${date}`}
          className={`${buttonClasses('secondary', 'sm')} min-w-fit flex-1 px-2.5! whitespace-nowrap`}
        >
          <NotePencil
            aria-hidden="true"
            size={16}
            weight="duotone"
            className="shrink-0"
          />
          Open daily note
        </Link>
        <Link
          href={`/app/trades${query ? `?${query}` : ''}`}
          className={`${buttonClasses('secondary', 'sm')} min-w-fit flex-1 px-2.5! whitespace-nowrap`}
        >
          <ListBullets aria-hidden="true" size={16} className="shrink-0" />
          Open in Trades
        </Link>
      </div>
    </div>
  );
}

export const PANEL_CARD = `${CARD} p-5`;
