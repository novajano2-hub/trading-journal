'use client';

import { useId } from 'react';

export type SegmentedOption<T extends string> = { value: T; label: string };

/** Radio-style segmented control. Arrow keys move through the group natively. */
export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
}) {
  const name = useId();
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="inline-flex rounded-control border border-line bg-sunken p-0.5"
    >
      {options.map((o) => (
        <label
          key={o.value}
          className="relative cursor-pointer rounded-[8px] px-3 py-1.5 text-sm font-medium text-muted transition-colors has-[:checked]:bg-surface-1 has-[:checked]:text-text has-[:checked]:shadow-[0_0_0_1px_var(--line-2)] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring"
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
