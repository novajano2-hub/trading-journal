import type { ReactNode } from 'react';
import type { ModuleInfo } from '@/content/modules';
import { plotEquity } from '@/lib/landing/equity-plot';
import {
  SAMPLE_START,
  type SampleView,
  type TicketModel,
} from '@/lib/landing/sample-view';

/*
 * One small artifact per rack card, drawn in the floor's own vocabulary and,
 * where there is engine data, drawn from it. Live modules are inked; modules
 * still in development are a dashed, pencil-weight outline of the planned thing,
 * since dashed ink is how this world marks everything not yet real.
 */

type Slug = ModuleInfo['slug'];

/** A mark at its natural pixel size; it only scales down if a card is narrower. */
function Mark({
  w,
  h,
  className = '',
  children,
}: {
  w: number;
  h: number;
  className?: string;
  children: ReactNode;
}) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`block h-auto max-w-full shrink overflow-visible ${className}`}
    >
      {children}
    </svg>
  );
}

/** Uneven stamp ink, the same grain as the rubber stamps on the tickets. */
function InkGrain({ id }: { id: string }) {
  return (
    <filter id={id} x="-20%" y="-20%" width="140%" height="140%">
      <feTurbulence
        type="fractalNoise"
        baseFrequency="0.8"
        numOctaves={2}
        seed={7}
        result="grain"
      />
      <feColorMatrix
        in="grain"
        type="matrix"
        values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -3.6 0 0 0 2.9"
        result="holes"
      />
      <feComposite in="SourceGraphic" in2="holes" operator="in" />
    </filter>
  );
}

/* ---- Live modules ---- */

const TICKET = { w: 38, h: 48 };
const STRIP_TILT = [-3, 1.5, -1.5, 2.5];

/** Journal: the sample's filed tickets, side by side in a strip. */
function JournalMark({ tickets }: { tickets: readonly TicketModel[] }) {
  const filed = [...tickets].sort((a, b) => a.serial - b.serial);
  const step = TICKET.w - 8;
  const w = step * (filed.length - 1) + TICKET.w + 6;
  return (
    <Mark w={w} h={TICKET.h + 8} className="text-ink">
      <defs>
        <InkGrain id="rack-ink-journal" />
      </defs>
      {filed.map((t, i) => {
        const x = 3 + i * step;
        const y = 4;
        const cx = x + TICKET.w / 2;
        const cy = y + TICKET.h / 2;
        const side = t.side === 'buy' ? 'text-buy' : 'text-sell';
        return (
          <g
            key={t.serial}
            transform={`rotate(${STRIP_TILT[i % STRIP_TILT.length]} ${cx} ${cy})`}
          >
            <rect
              x={x}
              y={y}
              width={TICKET.w}
              height={TICKET.h}
              rx={2}
              fill="var(--stock)"
              stroke="currentColor"
              strokeOpacity={0.7}
              strokeWidth={1.25}
            />
            <path
              d={`M${x + 4} ${y + 8}h${TICKET.w - 8}`}
              stroke="currentColor"
              strokeWidth={1.25}
            />
            {/* The side, always a letter in a circle. */}
            <g className={side}>
              <circle
                cx={x + 11.5}
                cy={y + 20}
                r={7}
                stroke="currentColor"
                strokeWidth={1.5}
              />
              <text
                x={x + 11.5}
                y={y + 20.6}
                fill="currentColor"
                fontSize={10.5}
                fontWeight={900}
                textAnchor="middle"
                dominantBaseline="central"
                className="font-display"
              >
                {t.side === 'buy' ? 'B' : 'S'}
              </text>
            </g>
            <path
              d={`M${x + 22} ${y + 16}h11M${x + 22} ${y + 23}h8`}
              stroke="currentColor"
              strokeOpacity={0.4}
              strokeWidth={1.5}
            />
            {/* Its time stamp, in the clock's dot matrix. */}
            <path
              d={`M${x + 5} ${y + 41}h16`}
              className="text-stamp"
              stroke="currentColor"
              strokeWidth={1.6}
              strokeDasharray="0.1 2.6"
            />
            {t.stamp ? (
              <g
                filter="url(#rack-ink-journal)"
                className={`rack-ink ${t.stamp === 'RULE BROKEN' ? 'text-sell' : 'text-ink'}`}
                transform={`rotate(-14 ${cx} ${y + 31})`}
                stroke="currentColor"
              >
                <rect
                  x={x + 4}
                  y={y + 26}
                  width={30}
                  height={10}
                  rx={1}
                  strokeWidth={1.5}
                />
                <path
                  d={`M${x + 8} ${y + 31}h22`}
                  strokeWidth={3}
                  strokeLinecap="butt"
                  strokeDasharray="3 1.2 2 1.2"
                />
              </g>
            ) : null}
          </g>
        );
      })}
    </Mark>
  );
}

/** Analytics: the sample week's equity, on the recap sheet's day columns. */
function AnalyticsMark({ view }: { view: SampleView }) {
  const W = 100;
  const H = 40;
  const { points, col, baseline } = plotEquity(
    view.equity,
    view.days,
    SAMPLE_START,
  );
  const sx = (x: number) => 1 + (x / 1000) * (W - 4);
  const sy = (y: number) => 2 + (y / 1000) * (H - 4);
  const line = points
    .map((p) => `${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`)
    .join(' ');
  const last = points.at(-1);
  return (
    <Mark w={W} h={H} className="text-ink">
      {view.days.slice(1).map((d, i) => (
        <path
          key={d.date}
          d={`M${sx(col * (i + 1))} 1V${H - 1}`}
          stroke="var(--rule)"
          strokeWidth={1}
        />
      ))}
      <path
        d={`M1 ${sy(baseline)}H${W - 3}`}
        stroke="currentColor"
        strokeOpacity={0.45}
        strokeWidth={1}
        strokeDasharray="2 2.5"
      />
      <polyline points={line} stroke="currentColor" strokeWidth={1.75} />
      {last ? (
        <circle cx={sx(last.x)} cy={sy(last.y)} r={2.5} fill="currentColor" />
      ) : null}
    </Mark>
  );
}

/** Strategies: a row of graded rules, one of them stamped broken. */
function StrategiesMark() {
  const graded = [true, false, true];
  return (
    <Mark w={100} h={24} className="text-ink">
      <defs>
        <InkGrain id="rack-ink-strategies" />
      </defs>
      {graded.map((kept, i) => {
        // Each rule is a box and its name; rules sit further apart than that.
        const x = 2 + i * 35;
        const box = { x, y: 6, s: 13 };
        const mid = { x: x + 6.5, y: 12.5 };
        return (
          <g key={i}>
            <rect
              x={box.x}
              y={box.y}
              width={box.s}
              height={box.s}
              rx={1.5}
              stroke="currentColor"
              strokeWidth={1.5}
            />
            <path
              d={`M${x + 17.5} ${mid.y - 2.5}h9M${x + 17.5} ${mid.y + 2.5}h5.5`}
              stroke="currentColor"
              strokeOpacity={0.4}
              strokeWidth={1.5}
            />
            {kept ? (
              <path
                d={`M${x + 3} ${mid.y}l2.6 3 5.2-6.4`}
                stroke="currentColor"
                strokeWidth={1.75}
              />
            ) : (
              <g
                filter="url(#rack-ink-strategies)"
                className="rack-ink text-sell"
                transform={`rotate(-9 ${mid.x} ${mid.y})`}
                stroke="currentColor"
              >
                <rect
                  x={mid.x - 10}
                  y={mid.y - 10}
                  width={20}
                  height={20}
                  rx={1.5}
                  strokeWidth={1.6}
                />
                <rect
                  x={mid.x - 7.6}
                  y={mid.y - 7.6}
                  width={15.2}
                  height={15.2}
                  rx={1}
                  strokeWidth={0.9}
                />
                <path
                  d={`M${mid.x - 4.2} ${mid.y - 4.2}l8.4 8.4m0-8.4-8.4 8.4`}
                  strokeWidth={2.6}
                  strokeLinecap="square"
                />
              </g>
            )}
          </g>
        );
      })}
    </Mark>
  );
}

/** Notebook: a ruled note slip, pinned. */
function NotebookMark() {
  return (
    <Mark w={74} h={54} className="text-ink">
      <defs>
        <filter
          id="rack-slip-lift"
          x="-20%"
          y="-20%"
          width="140%"
          height="150%"
        >
          <feDropShadow
            dx={0}
            dy={1.5}
            stdDeviation={1.4}
            floodColor="var(--navy)"
            floodOpacity={0.28}
          />
        </filter>
      </defs>
      <g transform="rotate(-3.5 37 30)">
        <rect
          x={9}
          y={10}
          width={56}
          height={40}
          rx={1.5}
          fill="var(--stock)"
          stroke="currentColor"
          strokeOpacity={0.3}
          strokeWidth={1}
          filter="url(#rack-slip-lift)"
        />
        <path
          d="M14 25h46M14 32h46M14 39h46M14 46h46"
          stroke="var(--rule)"
          strokeWidth={1}
        />
        {/* The note itself, in a quick hand on the rules. */}
        <path
          d="M15 23.5c2-2.6 3.2 1.6 5.2-.8s3 1.2 5-.6 3 1.4 5.2-.4 3.4 1 5.6-.6 3 .8 4.6-.2M15 30.5c2.2-2.4 3.4 1.4 5.4-.6s3 1.2 5.2-.4 3.2 1 5-.6"
          stroke="currentColor"
          strokeOpacity={0.75}
          strokeWidth={1.25}
        />
        <path
          d="M14 16.5h11"
          stroke="currentColor"
          strokeOpacity={0.7}
          strokeWidth={2}
          strokeLinecap="butt"
        />
      </g>
      {/* The pin through its head. */}
      <circle cx={37} cy={9} r={4} fill="currentColor" />
      <circle cx={35.7} cy={7.7} r={1.1} fill="var(--stock)" />
    </Mark>
  );
}

/** Prop firms: how far the sample account has come toward its profit target. */
function PropMark({ progress }: { progress: number }) {
  const x0 = 3;
  const x1 = 92;
  const px = x0 + (x1 - x0) * Math.min(Math.max(progress, 0), 1);
  return (
    <Mark w={100} h={30} className="text-ink">
      <path
        d={`M${x0} 22H${x1}`}
        stroke="currentColor"
        strokeOpacity={0.35}
        strokeWidth={1.5}
      />
      {[0.25, 0.5, 0.75].map((f) => (
        <path
          key={f}
          d={`M${x0 + (x1 - x0) * f} 19v6`}
          stroke="currentColor"
          strokeOpacity={0.45}
          strokeWidth={1}
        />
      ))}
      <path d={`M${x0} 16v10`} stroke="currentColor" strokeWidth={1.5} />
      <path
        d={`M${x0} 22H${px}`}
        stroke="currentColor"
        strokeWidth={4}
        strokeLinecap="butt"
      />
      {/* The tick: where the account stands today. */}
      <path d={`M${px - 3.5} 11h7l-3.5 5z`} fill="currentColor" />
      {/* The target post, flagged. */}
      <path d={`M${x1} 26V6`} stroke="currentColor" strokeWidth={1.75} />
      <path d={`M${x1} 6h7l-2.4 3 2.4 3h-7z`} fill="currentColor" />
    </Mark>
  );
}

/* ---- Modules in development: a pencil outline of the planned thing ---- */

const PLANNED = {
  className: 'text-ink/45',
  stroke: 'currentColor',
  strokeWidth: 1.25,
} as const;

/** Backtesting: a setup's past entries, marked along a stretch of history. */
function BacktestingMark() {
  const path: [number, number][] = [
    [2, 28],
    [12, 21],
    [20, 25],
    [30, 15],
    [40, 19],
    [50, 9],
    [60, 16],
    [70, 12],
    [80, 22],
    [90, 10],
    [102, 14],
  ];
  return (
    <Mark w={106} h={34} className={PLANNED.className}>
      <polyline
        points={path.map((p) => p.join(',')).join(' ')}
        stroke={PLANNED.stroke}
        strokeWidth={PLANNED.strokeWidth}
      />
      {[path[2]!, path[5]!, path[8]!].map(([x, y]) => (
        <circle
          key={x}
          cx={x}
          cy={y}
          r={4}
          fill="var(--stock)"
          stroke={PLANNED.stroke}
          strokeWidth={PLANNED.strokeWidth}
          strokeDasharray="2.2 1.8"
        />
      ))}
      <path
        d="M1 33H105"
        stroke={PLANNED.stroke}
        strokeWidth={PLANNED.strokeWidth}
        strokeDasharray="3 2.5"
      />
    </Mark>
  );
}

/** Replay: price bars with a playhead stopped part way through the trade. */
function ReplayMark() {
  const bars: [number, number, number, number][] = [
    // x, high, low, open/close offset
    [6, 10, 28, 1],
    [18, 6, 24, -1],
    [30, 12, 30, 1],
    [42, 8, 22, -1],
    [54, 4, 20, 1],
    [66, 9, 26, -1],
  ];
  return (
    <Mark w={78} h={36} className={PLANNED.className}>
      {bars.map(([x, hi, lo, dir]) => {
        const open = dir > 0 ? lo - 4 : hi + 4;
        const close = dir > 0 ? hi + 4 : lo - 4;
        return (
          <path
            key={x}
            d={`M${x} ${hi}V${lo}M${x - 3.5} ${open}H${x}M${x} ${close}h3.5`}
            stroke={PLANNED.stroke}
            strokeWidth={PLANNED.strokeWidth}
          />
        );
      })}
      <path
        d="M48 7V35"
        stroke={PLANNED.stroke}
        strokeWidth={PLANNED.strokeWidth}
        strokeDasharray="2.5 2"
      />
      <path
        d="M44.5 1.5h7L48 6z"
        stroke={PLANNED.stroke}
        strokeWidth={PLANNED.strokeWidth}
      />
    </Mark>
  );
}

/** Mentor & Spaces: two trader badges, one journal between them. */
function MentorsMark() {
  const badge = (x: number, y: number, tilt: number) => (
    <g transform={`rotate(${tilt} ${x + 21} ${y + 14})`}>
      <rect
        x={x}
        y={y}
        width={42}
        height={28}
        rx={4}
        fill="var(--stock)"
        stroke={PLANNED.stroke}
        strokeWidth={PLANNED.strokeWidth}
        strokeDasharray="3 2"
      />
      <rect
        x={x + 15}
        y={y + 3.5}
        width={12}
        height={3}
        rx={1.5}
        stroke={PLANNED.stroke}
        strokeWidth={1}
      />
      <path
        d={`M${x + 9} ${y + 15}h24M${x + 13} ${y + 21}h16`}
        stroke={PLANNED.stroke}
        strokeWidth={PLANNED.strokeWidth}
      />
    </g>
  );
  return (
    <Mark w={84} h={40} className={PLANNED.className}>
      {badge(3, 8, -4)}
      {badge(38, 4, 4)}
    </Mark>
  );
}

/** AI assistant: a ticket from your record, with a question where the side goes. */
function AssistantMark() {
  return (
    <Mark w={50} h={44} className={PLANNED.className}>
      <rect
        x={2}
        y={2}
        width={46}
        height={40}
        rx={2}
        stroke={PLANNED.stroke}
        strokeWidth={PLANNED.strokeWidth}
        strokeDasharray="3 2"
      />
      <path
        d="M6 9.5h38M26 19h16M26 26h11M6 36h18"
        stroke={PLANNED.stroke}
        strokeWidth={PLANNED.strokeWidth}
      />
      <circle
        cx={14.5}
        cy={22}
        r={7.5}
        stroke={PLANNED.stroke}
        strokeWidth={PLANNED.strokeWidth}
        strokeDasharray="2.4 1.9"
      />
      {/* A question mark, drawn. */}
      <path
        d="M11.9 19.6a2.7 2.7 0 1 1 3.8 2.5c-.8.4-1.2.9-1.2 1.7v.6"
        stroke={PLANNED.stroke}
        strokeWidth={1.5}
      />
      <circle cx={14.5} cy={27.2} r={0.95} fill="currentColor" />
    </Mark>
  );
}

/** The one artifact a module's rack card carries. */
export function RackMark({ slug, view }: { slug: Slug; view: SampleView }) {
  switch (slug) {
    case 'journal':
      return <JournalMark tickets={view.heroTickets} />;
    case 'analytics':
      return <AnalyticsMark view={view} />;
    case 'strategies':
      return <StrategiesMark />;
    case 'notebook':
      return <NotebookMark />;
    case 'prop-firms':
      return <PropMark progress={view.prop.profit.progress} />;
    case 'backtesting':
      return <BacktestingMark />;
    case 'replay':
      return <ReplayMark />;
    case 'mentors':
      return <MentorsMark />;
    case 'assistant':
      return <AssistantMark />;
  }
}
