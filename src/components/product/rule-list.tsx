import type { HTMLAttributes } from 'react';
import { CheckCircle, XCircle } from '@phosphor-icons/react/dist/ssr';

export interface RuleRow {
  text: string;
  ok: boolean;
  /** The strategy the rule belongs to, shown at the right. */
  who?: string;
}

/**
 * Strategy rules graded kept or broken. State is carried by icon, colour and
 * text. `onAccent` sets the rows straight on the ultramarine plan surface,
 * as the app's "Your plan" card does; otherwise they sit in a white panel.
 */
export function RuleList({
  rules,
  label,
  onAccent = false,
  rowAttrs,
}: {
  rules: readonly RuleRow[];
  /** Names the list for assistive tech. */
  label?: string;
  onAccent?: boolean;
  /**
   * Extra attributes for row `i`. The landing's tick-in animation hooks in here
   * (see `TickRuleList`), so the app's own lists carry none of it.
   */
  rowAttrs?: (i: number) => HTMLAttributes<HTMLLIElement>;
}) {
  return (
    <ul
      aria-label={label}
      className={
        onAccent
          ? ''
          : 'rounded-control border border-line bg-surface-1 px-4 py-1 shadow-[var(--shadow-chip)]'
      }
    >
      {rules.map((r, i) => (
        <li
          key={r.text}
          {...rowAttrs?.(i)}
          className={`flex items-center gap-2.5 border-t py-[9px] text-sm first:border-t-0 ${onAccent ? 'border-white/12 text-white' : 'border-line'}`}
        >
          {r.ok ? (
            <CheckCircle
              size={18}
              weight="fill"
              className={`shrink-0 ${onAccent ? 'text-white' : 'text-gain-fill'}`}
              aria-hidden="true"
            />
          ) : (
            <XCircle
              size={18}
              weight="fill"
              className={`shrink-0 ${onAccent ? 'text-on-accent-loss' : 'text-loss-fill'}`}
              aria-hidden="true"
            />
          )}
          <span className="sr-only">{r.ok ? 'Kept: ' : 'Broken: '}</span>
          {r.text}
          {r.who ? (
            <span
              className={`ml-auto text-xs ${onAccent ? 'text-on-accent-muted' : 'text-faint'}`}
            >
              {r.who}
            </span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
