import type { ReactNode } from 'react';

const SIZE = {
  sm: 'h-[22px] px-2 text-xs',
  md: 'h-7 px-2.5 text-[13px]',
} as const;

/**
 * A white pill for symbols, codes and times set on the canvas or a sunken
 * panel, where a sunken chip would vanish into its ground. Figures align.
 */
export function Pill({
  size = 'sm',
  children,
}: {
  size?: keyof typeof SIZE;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full border border-line bg-surface-1 font-medium text-text shadow-[0_1px_1px_rgb(18_22_51/0.04)] tnum ${SIZE[size]}`}
    >
      {children}
    </span>
  );
}
