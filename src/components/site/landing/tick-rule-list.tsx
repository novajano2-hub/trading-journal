import type { CSSProperties, ComponentProps } from 'react';
import { RuleList } from '@/components/product/rule-list';

/**
 * The marketing page's rule list: each row carries the `data-tick-row` hook
 * and its index, so `TickIn` can tick them in one after another. The app's
 * `RuleList` has neither.
 */
export function TickRuleList(
  props: Omit<ComponentProps<typeof RuleList>, 'rowAttrs'>,
) {
  return (
    <RuleList
      {...props}
      rowAttrs={(i) =>
        ({
          'data-tick-row': '',
          style: { '--i': i } as CSSProperties,
        }) as React.HTMLAttributes<HTMLLIElement>
      }
    />
  );
}
