'use client';

import { useId } from 'react';

export type SegmentedOption<T extends string> = { value: T; label: string };

/**
 * Radio-style segmented control. Arrow keys move through the group natively.
 * The track is recessed: the accent at 8% over whatever it sits on, with an
 * inner shadow along its top. The chosen option is a white pill (a lighter
 * line on a dark ground), its words a step bolder; an invisible bold twin
 * holds each option's width, so choosing one never nudges its neighbours.
 */
export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
  className = '',
  coarseTargets = false,
  disabled = false,
}: {
  label: string;
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
  /** Options 44px high on coarse pointers, for touch. */
  coarseTargets?: boolean;
  /** Shown but unavailable: faint, still in the tab order, and changes nothing. */
  disabled?: boolean;
}) {
  const name = useId();
  return (
    <div
      role="radiogroup"
      aria-label={label}
      aria-disabled={disabled || undefined}
      className={`inline-flex rounded-[11px] bg-accent/8 p-[3px] shadow-[inset_0_1px_2px_rgb(18_22_51/0.07)] [[data-theme=dark]_&]:shadow-[inset_0_1px_2px_rgb(0_0_0/0.35)] ${className}`}
    >
      {options.map((o) => (
        <label
          key={o.value}
          className={`relative inline-flex h-7 items-center rounded-[8px] px-[13px] ${coarseTargets ? 'pointer-coarse:min-h-11' : ''} text-[13.5px] font-medium transition-[background-color,color,box-shadow] duration-200 ease-(--ease-glide) has-[:checked]:bg-surface-1 has-[:checked]:font-semibold has-[:checked]:shadow-[var(--shadow-chip)] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent [[data-theme=dark]_&]:has-[:checked]:bg-line-2 ${disabled ? 'cursor-default text-faint' : 'cursor-pointer text-muted has-[:checked]:text-text'}`}
        >
          <input
            type="radio"
            name={name}
            value={o.value}
            checked={o.value === value}
            aria-disabled={disabled || undefined}
            onChange={() => {
              if (!disabled) onChange(o.value);
            }}
            className="sr-only"
          />
          <span className="grid justify-items-center">
            <span
              aria-hidden="true"
              className="invisible col-start-1 row-start-1 font-semibold"
            >
              {o.label}
            </span>
            <span className="col-start-1 row-start-1">{o.label}</span>
          </span>
        </label>
      ))}
    </div>
  );
}
