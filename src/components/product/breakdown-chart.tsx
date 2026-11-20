'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { formatPnlWhole } from '@/lib/format';
import type { BreakdownRowView } from '@/lib/landing/sample-view';
import { enter, glide } from '@/lib/motion';

const BAR_AREA_PX = 190;
/** Bar height in px: zero stays a zero-height slot so 0 to nonzero animates. */
export function barHeight(value: number, max: number): number {
  return value === 0 ? 0 : Math.max(2, (Math.abs(value) / max) * BAR_AREA_PX);
}
const tone = (n: number) =>
  n > 0 ? 'text-gain' : n < 0 ? 'text-loss' : 'text-faint';

/** On first view the bars wait below the baseline, then grow in order. */
type Stage = 'final' | 'hidden' | 'reveal';

const noSubscribe = () => () => {};
/** False while hydrating, so bars rendered on the server mount where they are. */
const useHydrated = () =>
  useSyncExternalStore(
    noSubscribe,
    () => true,
    () => false,
  );

/**
 * Bars for one breakdown, on whichever basis the rows carry. Each slot holds
 * a full-height bar that slides up out of the baseline (transform only), so a
 * bar keeps its rounded top at any height. Slots are keyed by index, so
 * switching datasets moves the same bars. The chart reveals itself the first
 * time it scrolls into view; it renders finished without JS or with reduced motion.
 */
export function BreakdownChart({
  rows,
  label,
  monoLabels = false,
}: {
  rows: readonly BreakdownRowView[];
  /** The chart's accessible name, e.g. "Net P&L by hour". */
  label: string;
  /** Axis labels are times or numbers. */
  monoLabels?: boolean;
}) {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const [stage, setStage] = useState<Stage>('final');
  const hydrated = useHydrated();
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.pnl)));
  const cols = {
    gridTemplateColumns: `repeat(${rows.length}, minmax(0, 1fr))`,
  };

  useEffect(() => {
    const el = ref.current;
    if (reduced || !el) return;
    let first = true;
    const io = new IntersectionObserver(
      ([entry]) => {
        const seen = entry!.isIntersecting;
        if (first) {
          first = false;
          // Already on screen (a reload mid-page): leave it finished.
          if (seen) io.disconnect();
          else setStage('hidden');
          return;
        }
        if (seen) {
          setStage('reveal');
          io.disconnect();
        }
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [reduced]);

  return (
    <div ref={ref}>
      <div
        role="img"
        aria-label={label}
        className="grid h-[220px] items-end gap-1.5 border-b border-line font-mono sm:gap-[18px]"
        style={cols}
      >
        {rows.map((r, i) => {
          const h = stage === 'hidden' ? 0 : barHeight(r.pnl, max);
          return (
            <div
              key={i}
              className="relative h-full overflow-x-visible overflow-y-clip"
            >
              <motion.div
                className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-2"
                // A slot added by a longer dataset grows from the baseline.
                initial={hydrated ? { y: BAR_AREA_PX } : false}
                animate={{ y: BAR_AREA_PX - h }}
                transition={
                  reduced || stage === 'hidden'
                    ? { duration: 0 }
                    : stage === 'reveal'
                      ? { duration: 0.56, ease: enter.ease, delay: i * 0.05 }
                      : glide
                }
                onAnimationComplete={() => {
                  if (stage === 'reveal' && i === rows.length - 1)
                    setStage('final');
                }}
              >
                <b
                  className={`text-[11px] leading-4 font-normal whitespace-nowrap sm:text-xs ${tone(r.pnl)}`}
                >
                  {formatPnlWhole(r.pnl)}
                </b>
                <i
                  className={`block w-full max-w-14 rounded-t-md transition-colors duration-300 ${r.pnl < 0 ? 'bg-loss' : 'bg-gain'}`}
                  style={{ height: BAR_AREA_PX }}
                />
              </motion.div>
            </div>
          );
        })}
      </div>
      <div
        aria-hidden="true"
        className={`mt-2 grid gap-1.5 text-center text-[11px] leading-4 text-faint sm:gap-[18px] sm:text-xs ${monoLabels ? 'font-mono' : ''}`}
        style={cols}
      >
        {rows.map((r, i) => (
          <span key={i} className="break-words">
            {r.label}
          </span>
        ))}
      </div>
    </div>
  );
}
