import type { ReactNode } from 'react';

export type ChipTone = 'neutral' | 'accent' | 'gain' | 'loss' | 'warn' | 'info';

const TONE: Record<ChipTone, string> = {
  neutral: 'bg-sunken text-muted',
  accent: 'bg-accent-soft text-accent-ink',
  gain: 'bg-gain-soft text-gain',
  loss: 'bg-loss-soft text-loss',
  // App-only tones: their tokens exist under the app scope (theme.css).
  warn: 'bg-warn-soft text-warn',
  info: 'bg-info-soft text-info',
};

/** A pill tag. Use `mono` for numbers or symbols. */
export function Chip({
  tone = 'neutral',
  mono = false,
  className = '',
  children,
}: {
  tone?: ChipTone;
  mono?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex h-[22px] items-center gap-[5px] rounded-full px-2 text-xs font-[550] ${mono ? 'font-mono' : ''} ${TONE[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

/**
 * Trade side, in neutral ink: gain and loss colours are kept for signed money
 * and for rules kept or broken, so a side never reads as a result.
 */
export function SideChip({ side }: { side: 'long' | 'short' }) {
  return (
    <span className="inline-flex h-[22px] items-center rounded-[7px] bg-sunken px-[9px] text-xs font-semibold text-muted">
      {side === 'long' ? 'Long' : 'Short'}
    </span>
  );
}
