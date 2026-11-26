'use client';

import { useId } from 'react';
import { FigureText } from '@/components/product/figure-text';
import { MetricTip } from '@/components/ui/metric-tip';
import { Segmented } from '@/components/ui/segmented';
import type { MetricId } from '@/content/metric-definitions';
import type { PropFinance, PropFinanceView } from '@/data/prop-finance';
import { BREACH_REASON_LABELS } from '@/domain/prop/finance';
import { useDisplay } from '@/lib/display';
import { formatPct, plural } from '@/lib/format';
import { CardHeader, signTone } from '../dashboard/shared';
import { TipGlyph } from '../dashboard/widgets/frame';
import { Cash, PANEL, Track } from './prop-parts';

/** A row of a rate list: a name and what stands behind it, the track, the share. */
const ROW =
  'grid min-h-10 grid-cols-[minmax(0,1fr)_4.5rem_2.5rem] items-center gap-3 border-t border-line/70 text-[13px] first:border-t-0 sm:grid-cols-[minmax(0,1fr)_7.5rem_2.75rem]';

const PASS_OPTIONS = [
  { value: 'firm', label: 'Firm' },
  { value: 'type', label: 'Type' },
  { value: 'size', label: 'Size' },
  { value: 'strategy', label: 'Strategy' },
] as const;

/**
 * Pass rate (C32): passed over the evaluations that passed or were breached,
 * overall and by firm, account type, account size or strategy. Active
 * evaluations and accounts that went straight to funded are not counted. Rates
 * and counts are not amounts: Privacy leaves them, and hides a size's value.
 */
export function PassRateCard({
  d,
  by,
  onBy,
}: {
  d: PropFinance;
  by: PropFinanceView['passRate'];
  onBy(next: PropFinanceView['passRate']): void;
}): React.JSX.Element {
  const id = useId();
  const display = useDisplay();
  const { passed, attempted } = d.passRate.overall;
  return (
    <section aria-labelledby={id} className={PANEL}>
      <CardHeader
        headingId={id}
        title="Pass rate"
        after={<TipGlyph id="prop-pass-rate" basis="net" name="Pass rate" />}
        end={
          <Segmented
            label="Pass rate by"
            options={PASS_OPTIONS}
            value={by}
            onChange={onBy}
            coarseTargets
          />
        }
      />
      <div className="mt-2.5 mb-1.5 flex flex-wrap items-baseline gap-x-2.5">
        <span className="text-[22px] leading-tight font-semibold tracking-[-0.02em] tabular-nums">
          {attempted === 0 ? 'None' : formatPct(passed / attempted, 1)}
        </span>
        <span className="text-[12.5px] text-faint">
          {attempted === 0
            ? 'No challenge has an outcome yet.'
            : `${passed} of ${attempted} ${plural(attempted, 'evaluation')} passed`}
        </span>
      </div>
      <ul data-list="pass" aria-label={`Pass rate by ${by}`}>
        {d.passRate.rows.map((r) => (
          <li key={r.key} className={ROW}>
            <span className="min-w-0 font-medium">
              {by === 'size' && r.key !== 'none' ? (
                <FigureText f={display.cash(Number(r.key), false)} />
              ) : (
                r.label
              )}
              <small className="ml-1.5 text-[12px] font-normal text-faint max-sm:ml-0 max-sm:block">
                passed {r.passed} of {r.attempted}
              </small>
            </span>
            <Track share={r.passed / r.attempted} />
            <b className="text-right font-semibold tabular-nums">
              {formatPct(r.passed / r.attempted, 0)}
            </b>
          </li>
        ))}
      </ul>
    </section>
  );
}

const BREACH_OPTIONS = [
  { value: 'evaluation', label: 'Evaluation' },
  { value: 'funded', label: 'Funded' },
] as const;

function Fact({
  tip,
  label,
  className = '',
  children,
}: {
  tip: MetricId;
  label: string;
  className?: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className="min-w-0">
      <dt>
        <MetricTip
          id={tip}
          basis="net"
          className="text-left text-[12.5px] text-faint"
        >
          {label}
        </MetricTip>
      </dt>
      <dd
        className={`mt-0.5 text-[17px] leading-snug font-semibold tracking-[-0.02em] tabular-nums ${className}`}
      >
        {children}
      </dd>
    </div>
  );
}

/**
 * Why accounts broke (C33, C34): the reasons given for the breaches of an
 * evaluation or of a funded account, most common first with their share, and
 * four facts about them: the days and the P&L before a breach, and the size
 * and firm that broke most. The P&L and the size are amounts and hide under
 * Privacy.
 */
export function BreachCard({
  d,
  which,
  onWhich,
}: {
  d: PropFinance;
  which: PropFinanceView['breaches'];
  onWhich(next: PropFinanceView['breaches']): void;
}): React.JSX.Element {
  const id = useId();
  const b = d.breaches;
  const days = b.avgDays === null ? null : Math.round(b.avgDays);
  return (
    <section aria-labelledby={id} className={PANEL}>
      <CardHeader
        headingId={id}
        title="Why accounts broke"
        after={
          <TipGlyph
            id="prop-breach-reasons"
            basis="net"
            name="Why accounts broke"
          />
        }
        end={
          <Segmented
            label="Breaches in"
            options={BREACH_OPTIONS}
            value={which}
            onChange={onWhich}
            coarseTargets
          />
        }
      />
      {b.reasons.length === 0 ? (
        <p className="py-6 text-[13.5px] text-faint">
          {d.challenges.length === 0
            ? 'No challenge has an outcome yet.'
            : which === 'evaluation'
              ? 'No evaluation has breached.'
              : 'No funded account has breached.'}
        </p>
      ) : (
        <ul
          data-list="breaches"
          aria-label="Reasons for breaches"
          className="mt-2"
        >
          {b.reasons.map((r) => (
            <li key={r.reason} className={ROW}>
              <span className="min-w-0 font-medium">
                {BREACH_REASON_LABELS[r.reason]}
                <small className="ml-1.5 text-[12px] font-normal whitespace-nowrap text-faint">
                  {r.count} {plural(r.count, 'breach', 'breaches')}
                </small>
              </span>
              <Track share={r.share} />
              <b className="text-right font-semibold tabular-nums">
                {formatPct(r.share, 0)}
              </b>
            </li>
          ))}
        </ul>
      )}
      <dl className="mt-auto grid grid-cols-2 gap-x-[18px] gap-y-3 border-t border-line pt-3">
        <Fact tip="prop-breach-days" label="Average days before a breach">
          {days === null ? 'None' : `${days} ${plural(days, 'day')}`}
        </Fact>
        <Fact
          tip="prop-breach-pnl"
          label="Average P&L before a breach"
          className={b.avgPnl === null ? '' : signTone(b.avgPnl)}
        >
          {b.avgPnl === null ? 'None' : <Cash cents={b.avgPnl} />}
        </Fact>
        <Fact tip="prop-breach-size" label="Most common size">
          {b.commonSize === null ? (
            'None'
          ) : (
            <Cash cents={b.commonSize} signed={false} />
          )}
        </Fact>
        <Fact tip="prop-breach-firm" label="Most common firm">
          {b.commonFirm === null || b.commonFirm.trim() === ''
            ? 'None'
            : b.commonFirm}
        </Fact>
      </dl>
    </section>
  );
}
