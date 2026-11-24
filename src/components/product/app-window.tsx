import type { ReactNode } from 'react';
import { CalendarBlank, CaretDown } from '@phosphor-icons/react/dist/ssr';

/**
 * The product window: a piece of the app on its periwinkle canvas. The top
 * bar holds the account, the range, optional meta at the right (for example
 * the "Sample data" label) and the Gross/Net basis, as white controls; the
 * content below is the app's own white cards (ProductCard). The bar wraps
 * rather than clips on phones.
 */
export function AppWindow({
  account,
  range,
  basis = 'Net',
  meta,
  children,
}: {
  account: string;
  range: string;
  basis?: 'Gross' | 'Net';
  meta?: ReactNode;
  children: ReactNode;
}) {
  const control =
    'inline-flex h-[30px] items-center gap-1.5 rounded-control border border-line bg-surface-1 px-2.5 shadow-[0_1px_1px_rgb(18_22_51/0.04)]';
  return (
    <div className="overflow-hidden rounded-card border border-line-2/80 bg-bg shadow-[inset_0_1px_0_rgb(255_255_255/0.6),var(--shadow)] [[data-theme=dark]_&]:shadow-[var(--shadow)]">
      <div className="flex min-h-[52px] flex-wrap items-center gap-1.5 px-3 py-2.5 text-[12.5px] font-medium text-muted sm:flex-nowrap">
        <span className={control}>
          {account}
          <CaretDown size={12} className="text-faint" aria-hidden="true" />
        </span>
        <span className={`${control} font-semibold text-text tnum`}>
          <CalendarBlank
            size={14}
            className="text-accent-ink"
            aria-hidden="true"
          />
          {range}
        </span>
        <span className="ml-auto flex items-center gap-3">
          {meta}
          <span className="flex rounded-[9px] bg-line-2/55 p-[3px] shadow-[inset_0_1px_2px_rgb(18_22_51/0.07)]">
            {(['Gross', 'Net'] as const).map((b) => (
              <span
                key={b}
                className={`rounded-[7px] px-2.5 py-[3px] ${b === basis ? 'bg-surface-1 font-semibold text-text shadow-[var(--shadow-chip)] [[data-theme=dark]_&]:bg-line-2' : ''}`}
              >
                {b}
              </span>
            ))}
          </span>
        </span>
      </div>
      <div className="grid gap-2.5 px-2.5 pb-2.5 sm:gap-3 sm:px-3 sm:pb-3">
        {children}
      </div>
    </div>
  );
}
