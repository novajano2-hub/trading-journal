'use client';

import { useCreateStrategyWithPhoto } from '@/data/query/hooks';
import type { NewStrategy } from '@/data/repository';
import type { StrategyTemplate } from '@/content/strategy-templates';
import type { Strategy } from '@/domain/types';
import { coverFile } from './template-cover';

/**
 * A template as a strategy to create: its words, groups, rules and assets,
 * the icon it wears and the link back to it. No trades, no checks and no
 * figures come with it: the examples stay in the template.
 */
export function newStrategyFrom(t: StrategyTemplate): NewStrategy {
  return {
    name: t.name,
    description: t.description,
    assetClasses: [...t.assetClasses],
    groups: t.groups.map((g) => ({
      title: g.title,
      rules: g.rules.map((r) => ({ text: r.text, showWhen: r.showWhen })),
    })),
    checklist: [],
    status: 'active',
    icon: t.icon,
    templateId: t.id,
  };
}

/**
 * Copying a template: `copy` creates the strategy with the template's cover as
 * a photo it owns, in one write (one created row, and no cover left behind
 * when it fails). A cover that cannot be kept (no room left) fails the copy,
 * and the caller says so: nothing is made.
 */
export function useCopyTemplate(): {
  copy(t: StrategyTemplate): Promise<Strategy>;
} {
  const create = useCreateStrategyWithPhoto();
  return {
    async copy(t) {
      return create.mutateAsync({
        input: newStrategyFrom(t),
        photo: await coverFile(t),
      });
    },
  };
}
