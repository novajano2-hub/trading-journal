import type { CSSProperties } from 'react';
import { CheckCircle, XCircle } from '@phosphor-icons/react/dist/ssr';

export interface RuleRow {
  text: string;
  ok: boolean;
  /** The strategy the rule belongs to, shown at the right. */
  who?: string;
}

/** Strategy rules graded kept or broken. State is carried by icon, color and text. */
export function RuleList({
  rules,
  label,
}: {
  rules: readonly RuleRow[];
  /** Names the list for assistive tech. */
  label?: string;
}) {
  return (
    <ul
      aria-label={label}
      className="rounded-control border border-line bg-surface-1 px-4 py-1"
    >
      {rules.map((r, i) => (
        <li
          key={r.text}
          data-tick-row=""
          style={{ '--i': i } as CSSProperties}
          className="flex items-center gap-2.5 border-t border-line py-[9px] text-sm first:border-t-0"
        >
          {r.ok ? (
            <CheckCircle
              size={18}
              weight="fill"
              className="shrink-0 text-gain"
              aria-hidden="true"
            />
          ) : (
            <XCircle
              size={18}
              weight="fill"
              className="shrink-0 text-loss"
              aria-hidden="true"
            />
          )}
          <span className="sr-only">{r.ok ? 'Kept: ' : 'Broken: '}</span>
          {r.text}
          {r.who ? (
            <span className="ml-auto font-mono text-xs text-faint">
              {r.who}
            </span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
