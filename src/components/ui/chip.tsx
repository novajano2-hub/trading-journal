import type { ReactNode } from 'react';

export type ChipTone = 'neutral' | 'accent' | 'gain' | 'loss';

const TONE: Record<ChipTone, string> = {
  neutral: 'bg-sunken text-muted border-line',
  accent: 'bg-accent-soft text-accent-ink border-transparent',
  gain: 'bg-gain-soft text-gain border-transparent',
  loss: 'bg-loss-soft text-loss border-transparent',
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
      className={`inline-flex h-6 items-center gap-1 rounded-chip border px-2 text-xs font-medium ${mono ? 'font-mono' : ''} ${TONE[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

/** Trade side: Long reads gain, Short reads loss. */
export function SideChip({ side }: { side: 'long' | 'short' }) {
  return (
    <Chip tone={side === 'long' ? 'gain' : 'loss'}>
      {side === 'long' ? 'Long' : 'Short'}
    </Chip>
  );
}

/** Status pill: a dot plus a label. */
export function StatusPill({
  tone = 'neutral',
  children,
}: {
  tone?: ChipTone;
  children: ReactNode;
}) {
  return (
    <Chip tone={tone}>
      <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
      {children}
    </Chip>
  );
}
