import type { ReactNode } from 'react';
import type { ModuleInfo } from '@/content/modules';
import { plotEquity } from '@/lib/landing/equity-plot';
import {
  SAMPLE_START,
  type SampleView,
  type TicketModel,
} from '@/lib/landing/sample-view';

/*
 * One artifact per rack card, filling the band under the card's line of text:
 * the card's real content, drawn in the floor's own vocabulary and, where there
 * is engine data, drawn from it. Live modules are inked; modules still in
 * development are a dashed, pencil-weight outline of the planned thing, since
 * dashed ink is how this world marks everything not yet real.
 *
 * Marks scale with their card, but their rules do not: every outline keeps a
 * hairline weight (non-scaling stroke). Only ink that is pressed, the stamps
 * and the progress bar, grows with the drawing. No stats: a figure here would
 * need a "sample" label, so the marks carry shapes, not numbers.
 */

type Slug = ModuleInfo['slug'];

/** Outline strokes stay at their pixel weight however far the mark scales. */
const HAIR = { vectorEffect: 'non-scaling-stroke' } as const;

/**
 * Fills its band. Shaped marks scale evenly and sit bottom-left; a line drawn
 * across time (the equity line) stretches to the band instead.
 */
function Mark({
  w,
  h,
  stretch = false,
  className = '',
  children,
}: {
  w: number;
  h: number;
  stretch?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio={stretch ? 'none' : 'xMinYMax meet'}
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`absolute inset-x-0 bottom-0 h-full max-h-[136px] w-full overflow-visible ${className}`}
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
        baseFrequency="1.5"
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
  const step = TICKET.w - 3;
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
              rx={1.5}
              fill="var(--stock)"
              stroke="currentColor"
              strokeOpacity={0.7}
              strokeWidth={1.25}
              {...HAIR}
            />
            <path
              d={`M${x + 3.5} ${y + 7.5}h${TICKET.w - 7}`}
              stroke="currentColor"
              strokeWidth={1.25}
              {...HAIR}
            />
            {/* The side, always a letter in a circle. */}
            <g className={side}>
              <circle
                cx={x + 10.5}
                cy={y + 19}
                r={6.5}
                stroke="currentColor"
                strokeWidth={1.75}
                {...HAIR}
              />
              <text
                x={x + 10.5}
                y={y + 19.5}
                fill="currentColor"
                fontSize={9.5}
                fontWeight={900}
                textAnchor="middle"
                dominantBaseline="central"
                className="font-display"
              >
                {t.side === 'buy' ? 'B' : 'S'}
              </text>
            </g>
            <text
              x={x + 20}
              y={y + 17.5}
              fill="currentColor"
              fontSize={5.6}
              fontWeight={600}
              className="font-text"
            >
              {t.symbol}
            </text>
            <path
              d={`M${x + 20} ${y + 24}h${TICKET.w - 24}`}
              stroke="currentColor"
              strokeOpacity={0.35}
              strokeWidth={1.25}
              {...HAIR}
            />
            {/* Its time stamp, in the clock's dot matrix. */}
            <path
              d={`M${x + 4.5} ${y + 42}h17`}
              className="text-stamp"
              stroke="currentColor"
              strokeWidth={1.2}
              strokeDasharray="0.01 1.9"
            />
            {t.stamp ? (
              <g
                filter="url(#rack-ink-journal)"
                className={`rack-ink ${t.stamp === 'RULE BROKEN' ? 'text-sell' : 'text-ink'}`}
                transform={`rotate(-12 ${cx} ${y + 32})`}
              >
                <rect
                  x={x + 3}
                  y={y + 27.5}
                  width={TICKET.w - 6}
                  height={9}
                  rx={0.8}
                  stroke="currentColor"
                  strokeWidth={0.9}
                />
                <text
                  x={cx}
                  y={y + 32.4}
                  fill="currentColor"
                  fontSize={4.8}
                  fontWeight={900}
                  letterSpacing={0.2}
                  textAnchor="middle"
                  dominantBaseline="central"
                  className="font-display"
                >
                  {t.stamp}
                </text>
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
  const sx = (x: number) => 1.5 + (x / 1000) * (W - 5);
  const sy = (y: number) => 3 + (y / 1000) * (H - 6);
  const line = points
    .map((p) => `${sx(p.x).toFixed(2)},${sy(p.y).toFixed(2)}`)
    .join(' ');
  const last = points.at(-1);
  return (
    <Mark w={W} h={H} stretch className="text-ink">
      <path
        d={`M0 0.5H${W}M0 ${H - 0.5}H${W}`}
        stroke="var(--rule)"
        strokeWidth={1}
        {...HAIR}
      />
      {view.days.slice(1).map((d, i) => (
        <path
          key={d.date}
          d={`M${sx(col * (i + 1))} 0.5V${H - 0.5}`}
          stroke="var(--rule)"
          strokeWidth={1}
          {...HAIR}
        />
      ))}
      <path
        d={`M0 ${sy(baseline)}H${W}`}
        stroke="currentColor"
        strokeOpacity={0.45}
        strokeWidth={1}
        strokeDasharray="3 3"
        {...HAIR}
      />
      <polyline
        points={line}
        stroke="currentColor"
        strokeWidth={1.75}
        {...HAIR}
      />
      {/* The close, as a round dot whatever the stretch. */}
      {last ? (
        <path
          d={`M${sx(last.x)} ${sy(last.y)}h0`}
          stroke="currentColor"
          strokeWidth={6}
          {...HAIR}
        />
      ) : null}
    </Mark>
  );
}

/** Strategies: a strategy's rules, each graded, one of them stamped broken. */
function StrategiesMark() {
  const rules = [
    { kept: true, name: [50, 30] },
    { kept: false, name: [58, 36] },
    { kept: true, name: [42, 24] },
  ];
  return (
    <Mark w={88} h={62} className="text-ink">
      <defs>
        <InkGrain id="rack-ink-strategies" />
      </defs>
      {rules.map((rule, i) => {
        const y = 3 + i * 20;
        const mid = { x: 8.5, y: y + 6.5 };
        return (
          <g key={i}>
            <rect
              x={2}
              y={y}
              width={13}
              height={13}
              rx={1.5}
              stroke="currentColor"
              strokeWidth={1.5}
              {...HAIR}
            />
            {/* The rule's name, as ruled lines: no invented wording. */}
            <path
              d={`M22 ${y + 4}h${rule.name[0]}M22 ${y + 9.5}h${rule.name[1]}`}
              stroke="currentColor"
              strokeOpacity={0.4}
              strokeWidth={1.5}
              {...HAIR}
            />
            {rule.kept ? (
              <path
                d={`M5 ${mid.y}l2.6 3 5-6.2`}
                stroke="currentColor"
                strokeWidth={1.75}
                {...HAIR}
              />
            ) : (
              <g
                filter="url(#rack-ink-strategies)"
                className="rack-ink text-sell"
                transform={`rotate(-9 ${mid.x} ${mid.y})`}
                stroke="currentColor"
              >
                <rect
                  x={mid.x - 9.5}
                  y={mid.y - 9.5}
                  width={19}
                  height={19}
                  rx={1.5}
                  strokeWidth={1.3}
                />
                <rect
                  x={mid.x - 7.4}
                  y={mid.y - 7.4}
                  width={14.8}
                  height={14.8}
                  rx={1}
                  strokeWidth={0.7}
                />
                <path
                  d={`M${mid.x - 4} ${mid.y - 4}l8 8m0-8-8 8`}
                  strokeWidth={2.2}
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
            dy={1}
            stdDeviation={1}
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
          rx={1}
          fill="var(--stock)"
          stroke="currentColor"
          strokeOpacity={0.3}
          strokeWidth={1}
          filter="url(#rack-slip-lift)"
          {...HAIR}
        />
        <path
          d="M14 25h46M14 32h46M14 39h46M14 46h46"
          stroke="var(--rule)"
          strokeWidth={1}
          {...HAIR}
        />
        {/* The note itself, in a quick hand on the rules. */}
        <path
          d="M15 23.5c2-2.6 3.2 1.6 5.2-.8s3 1.2 5-.6 3 1.4 5.2-.4 3.4 1 5.6-.6 3 .8 4.6-.2M15 30.5c2.2-2.4 3.4 1.4 5.4-.6s3 1.2 5.2-.4 3.2 1 5-.6M15 37.5c2-2.2 3.2 1.2 5-.6s3 1 4.6-.4"
          stroke="currentColor"
          strokeOpacity={0.75}
          strokeWidth={1.25}
          {...HAIR}
        />
        <path
          d="M14 16.5h11"
          stroke="currentColor"
          strokeOpacity={0.7}
          strokeWidth={2}
          strokeLinecap="butt"
          {...HAIR}
        />
      </g>
      {/* The pin through its head. */}
      <circle cx={37} cy={9} r={3.6} fill="currentColor" />
      <circle cx={35.8} cy={7.8} r={1} fill="var(--stock)" />
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
        {...HAIR}
      />
      {[0.25, 0.5, 0.75].map((f) => (
        <path
          key={f}
          d={`M${x0 + (x1 - x0) * f} 19v6`}
          stroke="currentColor"
          strokeOpacity={0.45}
          strokeWidth={1}
          {...HAIR}
        />
      ))}
      <path
        d={`M${x0} 16v10`}
        stroke="currentColor"
        strokeWidth={1.5}
        {...HAIR}
      />
      {/* Pressed ink: the distance covered, which grows with the mark. */}
      <path
        d={`M${x0} 22H${px}`}
        stroke="currentColor"
        strokeWidth={3.5}
        strokeLinecap="butt"
      />
      {/* The tick: where the account stands today. */}
      <path d={`M${px - 3} 12h6l-3 4.5z`} fill="currentColor" />
      {/* The target post, flagged. */}
      <path
        d={`M${x1} 26V6`}
        stroke="currentColor"
        strokeWidth={1.75}
        {...HAIR}
      />
      <path d={`M${x1} 6h7l-2.4 3 2.4 3h-7z`} fill="currentColor" />
    </Mark>
  );
}

/* ---- Modules in development: a pencil outline of the planned thing ---- */

const PLANNED = {
  stroke: 'currentColor',
  strokeWidth: 1.25,
  ...HAIR,
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
    <Mark w={106} h={34} className="text-ink/45">
      <polyline points={path.map((p) => p.join(',')).join(' ')} {...PLANNED} />
      {[path[2]!, path[5]!, path[8]!].map(([x, y]) => (
        <circle
          key={x}
          cx={x}
          cy={y}
          r={4}
          fill="var(--stock)"
          strokeDasharray="2.5 2"
          {...PLANNED}
        />
      ))}
      <path d="M1 33H105" strokeDasharray="4 3" {...PLANNED} />
    </Mark>
  );
}

/** Replay: price bars with a playhead stopped part way through the trade. */
function ReplayMark() {
  const bars: [number, number, number, number][] = [
    // x, high, low, up (1) or down (-1)
    [6, 10, 28, 1],
    [18, 6, 24, -1],
    [30, 12, 30, 1],
    [42, 8, 22, -1],
    [54, 4, 20, 1],
    [66, 9, 26, -1],
  ];
  return (
    <Mark w={78} h={36} className="text-ink/45">
      {bars.map(([x, hi, lo, dir]) => {
        const open = dir > 0 ? lo - 4 : hi + 4;
        const close = dir > 0 ? hi + 4 : lo - 4;
        return (
          <path
            key={x}
            d={`M${x} ${hi}V${lo}M${x - 3.5} ${open}H${x}M${x} ${close}h3.5`}
            {...PLANNED}
          />
        );
      })}
      <path d="M48 7V35" strokeDasharray="3 2.5" {...PLANNED} />
      <path d="M44.5 1.5h7L48 6z" {...PLANNED} />
    </Mark>
  );
}

/** Mentor & Spaces: a journal shared out to a mentor and a trading room. */
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
        strokeDasharray="4 3"
        {...PLANNED}
      />
      <rect
        x={x + 15}
        y={y + 3.5}
        width={12}
        height={3}
        rx={1.5}
        {...PLANNED}
      />
      <path d={`M${x + 9} ${y + 15}h24M${x + 13} ${y + 21}h16`} {...PLANNED} />
    </g>
  );
  return (
    <Mark w={152} h={44} className="text-ink/45">
      {badge(2, 10, -4)}
      <path d="M48 24h10M94 24h10" strokeDasharray="2.5 2.5" {...PLANNED} />
      {/* The journal they share. */}
      <rect x={60} y={4} width={32} height={38} rx={1.5} {...PLANNED} />
      <path d="M63.5 10.5h25M72 19h13M72 25h9M64 35h14" {...PLANNED} />
      <circle cx={66.5} cy={22} r={3.6} strokeDasharray="2 1.6" {...PLANNED} />
      {badge(108, 8, 4)}
    </Mark>
  );
}

/** AI assistant: your record of tickets, with a question where the side goes. */
function AssistantMark() {
  return (
    <Mark w={68} h={46} className="text-ink/45">
      <rect
        x={20}
        y={2}
        width={46}
        height={36}
        rx={2}
        fill="var(--stock)"
        strokeDasharray="4 3"
        {...PLANNED}
      />
      <rect
        x={11}
        y={5}
        width={46}
        height={36}
        rx={2}
        fill="var(--stock)"
        strokeDasharray="4 3"
        {...PLANNED}
      />
      <rect
        x={2}
        y={8}
        width={46}
        height={36}
        rx={2}
        fill="var(--stock)"
        strokeDasharray="4 3"
        {...PLANNED}
      />
      <path d="M6 15h38M26 24h16M26 30h11M6 39h18" {...PLANNED} />
      <circle cx={14.5} cy={27} r={7} strokeDasharray="2.4 1.9" {...PLANNED} />
      {/* A question mark, drawn. */}
      <path
        d="M12 24.8a2.6 2.6 0 1 1 3.6 2.4c-.8.4-1.1.9-1.1 1.6v.5"
        {...PLANNED}
        strokeWidth={1.5}
      />
      <circle cx={14.5} cy={31.8} r={0.9} fill="currentColor" />
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
