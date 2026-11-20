'use client';

import { useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { formatPnl, formatPnlWhole } from '@/lib/format';
import type { BreakdownRowView, BreakdownTab } from '@/lib/landing/sample-view';
import { EASING_POINTS } from '@/lib/motion';
import { Segmented } from '@/components/ui/segmented';

const TABS: { value: BreakdownTab; label: string }[] = [
  { value: 'hour', label: 'Hour' },
  { value: 'session', label: 'Session' },
  { value: 'setup', label: 'Setup' },
  { value: 'symbol', label: 'Symbol' },
  { value: 'mistake', label: 'Mistake' },
];
const BAR_AREA_PX = 190;
const tone = (n: number) =>
  n > 0 ? 'text-gain' : n < 0 ? 'text-loss' : 'text-faint';

/** Bars for the chosen breakdown, plus a ranked list by setup. Bars grow to their height when the tab changes. */
export function BreakdownChart({
  breakdowns,
  initial = 'hour',
}: {
  breakdowns: Record<BreakdownTab, BreakdownRowView[]>;
  initial?: BreakdownTab;
}) {
  const [tab, setTab] = useState<BreakdownTab>(initial);
  const reduced = useReducedMotion();
  const rows = breakdowns[tab];
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.net)));
  return (
    <div className="overflow-hidden rounded-card border border-line bg-surface-1">
      <div className="flex flex-wrap items-center gap-2.5 border-b border-line px-[18px] py-3.5 text-[13px]">
        <Segmented
          label="Break down by"
          options={TABS}
          value={tab}
          onChange={setTab}
        />
        <span className="ml-auto text-xs text-faint">Sample data</span>
      </div>
      <div className="grid md:grid-cols-[2fr_1fr]">
        <div className="px-6 pb-[18px] pt-6">
          <div
            role="group"
            aria-label={`Net P&L by ${tab}`}
            className="grid h-[220px] items-end gap-2 border-b border-line font-mono sm:gap-[18px]"
            style={{ gridTemplateColumns: `repeat(${rows.length}, 1fr)` }}
          >
            {rows.map((r) => (
              <div
                key={r.key}
                className="flex h-full flex-col items-center justify-end gap-2"
              >
                <b className={`text-xs font-normal ${tone(r.net)}`}>
                  {formatPnlWhole(r.net)}
                </b>
                {r.net === 0 ? null : (
                  <motion.i
                    className={`block w-full max-w-14 rounded-t-md ${r.net > 0 ? 'bg-gain' : 'bg-loss'}`}
                    initial={false}
                    animate={{
                      height: Math.max(
                        2,
                        (Math.abs(r.net) / max) * BAR_AREA_PX,
                      ),
                    }}
                    transition={
                      reduced
                        ? { duration: 0 }
                        : { duration: 0.24, ease: [...EASING_POINTS.out] }
                    }
                  />
                )}
              </div>
            ))}
          </div>
          <div
            className="mt-2 grid gap-2 text-center font-mono text-xs text-faint sm:gap-[18px]"
            style={{ gridTemplateColumns: `repeat(${rows.length}, 1fr)` }}
          >
            {rows.map((r) => (
              <span key={r.key} className="break-words">
                {r.label}
              </span>
            ))}
          </div>
        </div>
        <div className="border-t border-line px-[22px] py-5 md:border-l md:border-t-0">
          <h3 className="text-[13px] font-medium text-muted">
            Net P&amp;L by setup
          </h3>
          <ol className="mt-3.5 grid gap-3.5 text-sm">
            {breakdowns.setup.map((r) => (
              <li key={r.key} className="flex justify-between gap-3">
                <span>{r.label}</span>
                <span className={`font-mono ${tone(r.net)}`}>
                  {formatPnl(r.net)}
                </span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}
