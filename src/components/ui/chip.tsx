import type { ReactNode } from 'react';

export type ChipTone = 'neutral' | 'accent' | 'gain' | 'loss';

const TONE: Record<ChipTone, string> = {
  neutral: 'bg-sunken text-muted',
  accent: 'bg-accent-soft text-accent-ink',
  gain: 'bg-gain-soft text-gain',
  loss: 'bg-loss-soft text-loss',
};

/** 6px-radius tag. Use `mono` for numbers or symbols. */
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
      className={`inline-flex h-[22px] items-center gap-[5px] rounded-chip px-2 text-xs ${mono ? 'font-mono' : ''} ${TONE[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

/** Trade side: Long reads gain, Short reads loss. */
export function SideChip({ side }: { side: 'long' | 'short' }) {
  return (
    <span
      className={`inline-flex h-5 items-center rounded-chip px-[7px] text-[11.5px] font-medium ${side === 'long' ? 'bg-gain-soft text-gain' : 'bg-loss-soft text-loss'}`}
    >
      {side === 'long' ? 'Long' : 'Short'}
    </span>
  );
}
