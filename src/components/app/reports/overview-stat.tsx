'use client';

import type { Icon } from '@phosphor-icons/react';
import Link from 'next/link';
import { useId, type ReactNode } from 'react';
import { FigureText } from '@/components/product/figure-text';
import { MetricTip } from '@/components/ui/metric-tip';
import type { MetricId } from '@/content/metric-definitions';
import { formatUnitValue, useDisplay } from '@/lib/display';
import type { TileTone } from '@/components/ui/icon-tile';
import { CARD, CARD_PAD, CardHeader } from '../dashboard/shared';
import type { ReportData } from './use-report-data';

/** The empty value: "None", never a dash or blank. */
export const NONE = <span className="font-medium text-faint">None</span>;

/** A figure that opens the trade or the day behind it. */
export function FigureLink({
  href,
  label,
  children,
}: {
  href: string;
  /** What the link opens, for assistive tech: the figure alone does not say. */
  label: string;
  children: ReactNode;
}): React.JSX.Element {
  return (
    <Link
      href={href}
      prefetch={false}
      aria-label={label}
      className="rounded-chip outline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:inline-flex pointer-coarse:min-h-11 pointer-coarse:items-center"
    >
      {children}
    </Link>
  );
}

/**
 * A figure, or None when it is null; a link to the trade or the day behind it
 * when `href` is given. A figure of 0 is a figure.
 */
export function LinkedFigure({
  href,
  label,
  children,
}: {
  href?: string;
  label?: string;
  children: ReactNode;
}): React.JSX.Element {
  if (children === null || children === undefined) return NONE;
  if (href === undefined) return <>{children}</>;
  return (
    <FigureLink href={href} label={label ?? 'Open'}>
      {children}
    </FigureLink>
  );
}

/** One label and its figure on a hairline row; a null figure reads None. */
export function Stat({
  id,
  label,
  data,
  tone = '',
  sub,
  href,
  linkLabel,
  children,
}: {
  id: MetricId;
  /** The visible label, where the card words it differently from the definition's. */
  label?: string;
  data: ReportData;
  tone?: string;
  sub?: ReactNode;
  /** Makes the figure a link to the trade or the day behind it. */
  href?: string;
  linkLabel?: string;
  /** The figure; null reads None. */
  children: ReactNode;
}): React.JSX.Element {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-line/70 py-2.5 last:border-b-0">
      <span className="text-[13.5px] text-muted">
        <MetricTip id={id} basis={data.basis}>
          {label}
        </MetricTip>
      </span>
      <span
        data-stat={id}
        className={`text-right font-semibold tabular-nums ${tone}`}
      >
        <LinkedFigure href={href} label={linkLabel ?? id}>
          {children}
        </LinkedFigure>
        {sub ? (
          <small className="ml-1.5 text-xs font-normal text-faint">{sub}</small>
        ) : null}
      </span>
    </div>
  );
}

/** A titled card of stat rows, named for assistive tech by its title. */
export function StatCard({
  title,
  icon,
  tone = 'neutral',
  children,
}: {
  title: string;
  icon: Icon;
  tone?: TileTone;
  children: ReactNode;
}): React.JSX.Element {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className={`${CARD} ${CARD_PAD}`}>
      <CardHeader icon={icon} tone={tone} headingId={headingId} title={title} />
      <div className="mt-1">{children}</div>
    </section>
  );
}

/** Money as the display unit and Privacy read it; null stays null, so the row says None. */
export function useMoney(
  data: ReportData,
): (cents: number | null, signed?: boolean) => ReactNode {
  const display = useDisplay();
  function money(cents: number | null, signed = true): ReactNode {
    return cents === null ? null : (
      <FigureText f={display.figure({ money: cents }, signed, data.currency)} />
    );
  }
  return money;
}

/**
 * A day or month figure: cents as money, or, when the display unit narrowed
 * the trades (`ctx.unit`), the unit's own number. Null stays null (None).
 */
export function useDayValue(
  data: ReportData,
): (value: number | null) => ReactNode {
  const money = useMoney(data);
  const unit = data.ctx.unit;
  function show(value: number | null): ReactNode {
    if (value === null) return null;
    return unit
      ? formatUnitValue(unit, value, { currency: data.currency, signed: true })
      : money(value);
  }
  return show;
}
