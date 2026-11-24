'use client';

import { Check, Minus } from '@phosphor-icons/react/dist/ssr';

/**
 * The log's selection box: a real checkbox, visually hidden, with the comp's
 * 16px accent box drawn over it inside a 44px target on coarse pointers.
 * `indeterminate` is for a header whose page is partly chosen.
 */
export function SelectBox({
  checked,
  indeterminate = false,
  onChange,
  label,
}: {
  checked: boolean;
  indeterminate?: boolean;
  onChange(next: boolean): void;
  label: string;
}): React.JSX.Element {
  const on = checked || indeterminate;
  return (
    <label className="relative inline-grid size-8 cursor-pointer place-items-center pointer-coarse:size-11">
      <input
        type="checkbox"
        aria-label={label}
        checked={checked}
        ref={(el) => {
          if (el) el.indeterminate = indeterminate && !checked;
        }}
        onChange={(e) => onChange(e.currentTarget.checked)}
        className="peer sr-only"
      />
      <span
        aria-hidden="true"
        className={`grid size-4 place-items-center rounded-[5px] border text-accent-fg shadow-[var(--shadow-chip)] transition-colors duration-200 ease-(--ease-glide) peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent motion-reduce:transition-none ${on ? 'border-accent bg-accent' : 'border-line-2 bg-surface-1 hover:border-accent/50'}`}
      >
        {checked ? (
          <Check size={11} weight="bold" />
        ) : indeterminate ? (
          <Minus size={11} weight="bold" />
        ) : null}
      </span>
    </label>
  );
}
