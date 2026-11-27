'use client';

import { Check } from '@phosphor-icons/react/dist/ssr';
import type { Strategy } from '@/domain/types';

/**
 * The strategies as checkbox chips, several at once: the multi-select the
 * challenge form and the details page's Attach control share. The caller owns
 * the list and the selection; `onToggle` says which one changed and whether it
 * is now on. A checked chip wears the accent, so the choice never rests on
 * colour alone (the check mark and the checkbox state say it too).
 */
export function StrategyChips({
  strategies,
  selected,
  onToggle,
  disabled = false,
}: {
  strategies: readonly Strategy[];
  selected: readonly string[];
  onToggle(id: string, on: boolean): void;
  disabled?: boolean;
}): React.JSX.Element {
  return (
    <div className="flex flex-wrap gap-2">
      {strategies.map((st) => (
        <label
          key={st.id}
          className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-control border border-line px-3 text-[13px] font-medium transition-colors duration-200 has-[:checked]:border-accent/45 has-[:checked]:bg-accent-soft/60 has-[:disabled]:cursor-default has-[:disabled]:opacity-60 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent pointer-coarse:min-h-11"
        >
          <input
            type="checkbox"
            checked={selected.includes(st.id)}
            disabled={disabled}
            onChange={(ev) => onToggle(st.id, ev.target.checked)}
            className="peer sr-only"
          />
          <Check
            size={14}
            weight="bold"
            aria-hidden="true"
            className="hidden text-accent-ink peer-checked:block"
          />
          {st.name}
        </label>
      ))}
    </div>
  );
}
