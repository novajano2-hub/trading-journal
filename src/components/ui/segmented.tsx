'use client';

import { useId } from 'react';

export type SegmentedOption<T extends string> = { value: T; label: string };

/** Radio-style segmented control. Arrow keys move through the group natively. */
export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
  className = '',
  coarseTargets = false,
}: {
  label: string;
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
  /** Options 44px high on coarse pointers, for touch. */
  coarseTargets?: boolean;
}) {
  const name = useId();
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={`inline-flex rounded-[7px] bg-sunken p-0.5 ${className}`}
    >
      {options.map((o) => (
        <label
          key={o.value}
          className={`relative cursor-pointer rounded-[5px] px-2.5 py-1 ${coarseTargets ? 'pointer-coarse:inline-flex pointer-coarse:min-h-11 pointer-coarse:items-center' : ''} text-[13px] text-muted transition-colors has-[:checked]:bg-surface-1 has-[:checked]:text-text has-[:checked]:shadow-[var(--shadow-chip)] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent`}
        >
          <input
            type="radio"
            name={name}
            value={o.value}
            checked={o.value === value}
            onChange={() => onChange(o.value)}
            className="sr-only"
          />
          {o.label}
        </label>
      ))}
    </div>
  );
}
