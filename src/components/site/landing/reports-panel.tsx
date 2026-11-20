'use client';

import { useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { BreakdownChart } from '@/components/product/breakdown-chart';
import { Segmented } from '@/components/ui/segmented';
import { panelId, tabId, Tabs, type TabOption } from '@/components/ui/tabs';
import type { PnlBasis } from '@/domain/metrics/context';
import { formatPnl } from '@/lib/format';
import type { BreakdownTab, SampleView } from '@/lib/landing/sample-view';
import { enter, glide } from '@/lib/motion';

const ID = 'reports';
const TABS: TabOption<BreakdownTab>[] = [
  { value: 'hour', label: 'Hour' },
  { value: 'session', label: 'Session' },
  { value: 'setup', label: 'Setup' },
  { value: 'symbol', label: 'Symbol' },
  { value: 'mistake', label: 'Mistake' },
];
const BASES: { value: PnlBasis; label: string }[] = [
  { value: 'gross', label: 'Gross' },
  { value: 'net', label: 'Net' },
];
const tone = (n: number) =>
  n > 0 ? 'text-gain' : n < 0 ? 'text-loss' : 'text-faint';

/**
 * The reports demo: tabs re-chart the engine's breakdowns, the basis switch
 * swaps in the gross derivation, and the side list ranks the same rows.
 */
export function ReportsPanel({
  breakdowns,
  breakeven,
}: {
  breakdowns: SampleView['breakdowns'];
  /** Already formatted, e.g. "$0.00 to $0.00". */
  breakeven: string;
}) {
  const reduced = useReducedMotion();
  const [tab, setTab] = useState<BreakdownTab>('hour');
  const [basis, setBasis] = useState<PnlBasis>('net');
  // The side list fades in on a visitor's change, never on load.
  const [changed, setChanged] = useState(false);
  const rows = breakdowns[basis][tab];
  // Sort is stable, so equal figures keep the engine's order.
  const ranked = [...rows].sort((a, b) => b.pnl - a.pnl);
  const name = `${basis === 'gross' ? 'Gross' : 'Net'} P&L by ${tab}`;
  const monoLabels = tab === 'hour';

  return (
    <div className="mt-12 overflow-hidden rounded-card border border-line bg-surface-1">
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-3 border-b border-line px-4 py-3.5 text-[13px] sm:px-[18px]">
        <Tabs
          id={ID}
          label="Break down by"
          options={TABS}
          value={tab}
          onChange={(v) => {
            setTab(v);
            setChanged(true);
          }}
        />
        <div className="flex flex-wrap items-center gap-2.5 sm:ml-auto">
          <Segmented
            label="P&L basis"
            options={BASES}
            value={basis}
            onChange={(v) => {
              setBasis(v);
              setChanged(true);
            }}
          />
          <span className="inline-flex h-7 items-center gap-1.5 rounded-chip border border-line px-2.5 whitespace-nowrap">
            Breakeven <span className="font-mono">{breakeven}</span>
          </span>
          <span className="text-xs text-faint">Sample data</span>
        </div>
      </div>
      <div
        role="tabpanel"
        id={panelId(ID)}
        aria-labelledby={tabId(ID, tab)}
        tabIndex={0}
        className="grid focus-visible:outline-offset-[-2px] md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]"
      >
        <div className="px-4 pt-6 pb-[18px] sm:px-6">
          <BreakdownChart rows={rows} label={name} monoLabels={monoLabels} />
        </div>
        <div className="border-t border-line px-[22px] py-5 md:border-t-0 md:border-l">
          <h3 className="text-[13px] font-medium text-muted">
            Ranked by {basis} P&amp;L
          </h3>
          <motion.ol
            key={tab}
            className="mt-3.5 grid gap-3.5 text-sm"
            initial={changed && !reduced ? { opacity: 0, y: 4 } : false}
            animate={{ opacity: 1, y: 0 }}
            transition={enter}
          >
            {ranked.map((r) => (
              <motion.li
                key={r.key}
                layout={reduced ? false : 'position'}
                transition={glide}
                className="flex justify-between gap-3"
              >
                <span className={monoLabels ? 'font-mono' : ''}>{r.label}</span>
                <span className={`font-mono whitespace-nowrap ${tone(r.pnl)}`}>
                  {formatPnl(r.pnl)}
                </span>
              </motion.li>
            ))}
          </motion.ol>
        </div>
      </div>
    </div>
  );
}
