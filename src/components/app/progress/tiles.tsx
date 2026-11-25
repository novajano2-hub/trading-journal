import { MetricTip } from '@/components/ui/metric-tip';
import { plural } from '@/lib/format';

/** On a phone the three tiles are one card of three columns; from sm each is its own card. */
const TILE =
  'flex min-w-0 flex-col sm:min-h-[124px] sm:rounded-card sm:border sm:border-line sm:bg-surface-1 sm:px-5 sm:py-4 sm:shadow-[var(--shadow-card)] max-sm:px-3 max-sm:first:pl-1 max-sm:not-first:border-l max-sm:not-first:border-line';

const LABEL = 'self-start text-[12.5px] whitespace-nowrap text-faint';
const FIG =
  'mt-1.5 block text-[31px] leading-[1.15] font-semibold tracking-[-0.04em] whitespace-nowrap tabular-nums max-sm:mt-0.5 max-sm:text-[20px] max-sm:tracking-[-0.03em]';
/** The word after a figure: small and muted beside the card's, the figure's own size on a phone. */
const UNIT =
  'text-[15px] font-medium tracking-normal text-muted max-sm:text-[20px] max-sm:font-semibold max-sm:tracking-[-0.03em] max-sm:text-text';

/** The half gauge: the score as an accent arc over its track. No arc at None or 0. */
function Gauge({ share }: { share: number | null }): React.JSX.Element {
  const pct = share === null ? 0 : Math.round(share * 100);
  return (
    <svg
      viewBox="0 0 132 72"
      aria-hidden="true"
      className="-mr-1 h-auto w-[132px] max-w-full min-w-0 shrink max-sm:hidden"
    >
      <defs>
        <linearGradient id="progress-gauge" x1="0" x2="1">
          <stop
            offset="0"
            stopColor="color-mix(in srgb, var(--accent) 70%, #fff)"
          />
          <stop offset="1" stopColor="var(--accent)" />
        </linearGradient>
      </defs>
      <path
        d="M10 64 A56 56 0 0 1 122 64"
        pathLength={100}
        fill="none"
        strokeWidth={11}
        strokeLinecap="round"
        className="stroke-accent-soft [[data-theme=dark]_&]:stroke-line"
      />
      {pct > 0 ? (
        <path
          d="M10 64 A56 56 0 0 1 122 64"
          pathLength={100}
          fill="none"
          stroke="url(#progress-gauge)"
          strokeWidth={11}
          strokeLinecap="round"
          strokeDasharray={`${pct} 100`}
        />
      ) : null}
    </svg>
  );
}

/**
 * TradeZella's three tiles and nothing more: the current streak, the period's
 * score as a half gauge, and today's rules met over those that apply, with a
 * bar. `score` is null with no scored day in the range, and reads None.
 */
export function ProgressTiles({
  streak,
  score,
  rangeText,
  met,
  active,
}: {
  streak: number;
  score: number | null;
  /** The range as a short phrase: "1-24 Nov", "all time". */
  rangeText: string;
  met: number;
  active: number;
}): React.JSX.Element {
  const share = active > 0 ? met / active : 0;
  return (
    <section
      aria-label="Summary"
      className="grid grid-cols-3 gap-4 max-sm:gap-0 max-sm:rounded-card max-sm:border max-sm:border-line max-sm:bg-surface-1 max-sm:px-4 max-sm:py-3.5 max-sm:shadow-[var(--shadow-card)]"
    >
      <div className={TILE}>
        <MetricTip id="tracker-streak" basis="net" className={LABEL}>
          Current streak
        </MetricTip>
        <span className={FIG}>
          {streak}
          <small className={UNIT}> {plural(streak, 'day')}</small>
        </span>
      </div>
      <div
        className={`${TILE} sm:flex-row sm:items-center sm:justify-between sm:gap-3`}
      >
        <div className="flex flex-none flex-col">
          <MetricTip id="tracker-score" basis="net" className={LABEL}>
            Score<span className="max-sm:hidden">, {rangeText}</span>
          </MetricTip>
          <span className={FIG}>
            {score === null ? 'None' : `${Math.round(score * 100)}%`}
          </span>
        </div>
        <Gauge share={score} />
      </div>
      <div className={TILE}>
        <MetricTip id="tracker-today" basis="net" className={LABEL}>
          Today
        </MetricTip>
        <span className={FIG}>
          {met}
          <small className={UNIT}>
            {' '}
            of {active}
            <span className="max-sm:hidden"> rules met</span>
          </small>
        </span>
        <div
          aria-hidden="true"
          className="mt-2.5 h-1.5 overflow-hidden rounded-[3px] bg-accent-soft max-sm:hidden"
        >
          <i
            className="block h-full rounded-[3px] bg-[linear-gradient(90deg,color-mix(in_srgb,var(--accent)_78%,#fff),var(--accent))]"
            style={{ width: `${Math.round(share * 100)}%` }}
          />
        </div>
      </div>
    </section>
  );
}
