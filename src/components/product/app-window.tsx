import type { ReactNode } from 'react';
import { CaretDown } from '@phosphor-icons/react/dist/ssr';

/**
 * The product window frame: top bar with account, range and basis, then the
 * content. `meta` sits at the right of the bar, before the basis switch (for
 * example the "Sample data" label). The bar wraps rather than clips on phones.
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
  const sel =
    'inline-flex h-7 items-center gap-1.5 rounded-chip border border-line px-2.5 text-text';
  return (
    <div className="overflow-hidden rounded-card border border-line bg-surface-1 shadow-[var(--shadow)]">
      <div className="flex min-h-[46px] flex-wrap items-center gap-2 border-b border-line px-3.5 py-2 text-[12.5px] sm:flex-nowrap sm:py-0">
        <span className={sel}>
          {account}
          <CaretDown size={13} className="text-faint" aria-hidden="true" />
        </span>
        <span className={`${sel} font-mono`}>{range}</span>
        <span className="ml-auto flex items-center gap-3">
          {meta}
          <span className="flex rounded-[7px] bg-sunken p-0.5">
            {(['Gross', 'Net'] as const).map((b) => (
              <span
                key={b}
                className={`rounded-[5px] px-2.5 py-1 ${b === basis ? 'bg-surface-1 text-text shadow-[var(--shadow-chip)]' : 'text-muted'}`}
              >
                {b}
              </span>
            ))}
          </span>
        </span>
      </div>
      {children}
    </div>
  );
}
