'use client';

// Technique adapted from HorizonX Task Checkbox, commercial licence: the check
// that draws itself, the fill that grows (240ms, kept) and the ripple, here a
// soft disc that grows and fades, on checking. The fill eases on Keel's glide
// curve: the original's overshoot is dropped. Rebuilt as a native checkbox
// inside its label in Keel tokens; the strike-through, gradient fill, drop
// shadow and foreign palette are dropped.
import { useState, type ReactNode } from 'react';

/**
 * A real checkbox: visually hidden input inside its label, so the keyboard,
 * Space and label clicks all work natively. The box is 18px inside a 44px hit
 * area on coarse pointers.
 */
export function TaskCheckbox({
  checked,
  onCheckedChange,
  children,
  disabled = false,
  'aria-label': ariaLabel,
}: {
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
  children?: ReactNode;
  'aria-label'?: string;
  disabled?: boolean;
}): React.JSX.Element {
  // The ripple belongs to the false-to-true change, not to every checked box:
  // a box that mounts checked stays still.
  const [prev, setPrev] = useState(checked);
  const [ripple, setRipple] = useState(false);
  if (prev !== checked) {
    setPrev(checked);
    setRipple(checked);
  }

  return (
    <label
      className={`group relative inline-flex select-none items-center gap-2.5 text-[14px] text-text pointer-coarse:min-h-11 pointer-coarse:min-w-11 ${
        disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        aria-label={ariaLabel}
        onChange={(event) => onCheckedChange(event.currentTarget.checked)}
        className="peer sr-only"
      />
      <span
        aria-hidden="true"
        className="relative grid size-[18px] flex-none place-items-center rounded-[6px] border border-line-2 bg-surface-1 shadow-[var(--shadow-chip)] transition-colors duration-[240ms] ease-[var(--ease-glide)] group-hover:border-accent/50 peer-checked:border-[var(--gain-fill,var(--gain))] peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent motion-reduce:transition-none"
      >
        <span
          className={`absolute -inset-px rounded-[6px] bg-[var(--gain-fill,var(--gain))] ${
            checked ? 'scale-100 opacity-100' : 'scale-0 opacity-0'
          } transition-[transform,opacity] duration-[240ms] ease-[var(--ease-glide)] motion-reduce:transition-none`}
        />
        <svg viewBox="0 0 18 18" className="relative size-[18px]" fill="none">
          <path
            d="M4.75 9.5l3 3 5.5-6.5"
            pathLength={1}
            strokeDasharray={1}
            strokeDashoffset={checked ? 0 : 1}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`stroke-white transition-[stroke-dashoffset] duration-[240ms] ease-[cubic-bezier(0.2,0.8,0.2,1)] motion-reduce:transition-none ${
              checked ? 'delay-[80ms]' : ''
            }`}
          />
        </svg>
        {ripple ? (
          <span
            data-ripple
            className="pointer-events-none absolute left-1/2 top-1/2 size-[25px] rounded-full bg-[var(--gain-fill,var(--gain))]/35 motion-safe:animate-check-ripple motion-reduce:hidden"
          />
        ) : null}
      </span>
      {children}
    </label>
  );
}
