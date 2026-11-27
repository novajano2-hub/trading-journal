'use client';

import {
  useAddFile,
  useCreateStrategy,
  useUpdateStrategy,
} from '@/data/query/hooks';
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
 * Copying a template: `copy` creates the strategy and gives it the template's
 * cover as a photo it owns; `attachCover` is that second step alone, for the
 * create form once a strategy filled from a template is saved. A cover that
 * cannot be kept (no room left) never undoes the strategy: it is made without
 * a photo.
 */
export function useCopyTemplate(): {
  copy(t: StrategyTemplate): Promise<Strategy>;
  attachCover(
    strategyId: string,
    t: StrategyTemplate,
  ): Promise<Strategy | null>;
} {
  const create = useCreateStrategy();
  const addFile = useAddFile();
  const update = useUpdateStrategy();

  const attachCover = async (
    strategyId: string,
    t: StrategyTemplate,
  ): Promise<Strategy | null> => {
    try {
      const file = await coverFile(t);
      const stored = await addFile.mutateAsync({
        owner: `strategy:${strategyId}`,
        file,
        // A photo is a PNG, JPEG or WebP; the SVG is Keel's own drawing, kept
        // as it is where the browser cannot draw it to a PNG.
        images: file.type !== 'image/svg+xml',
      });
      return await update.mutateAsync({
        id: strategyId,
        patch: { photoId: stored.id },
      });
    } catch {
      return null;
    }
  };

  return {
    attachCover,
    async copy(t) {
      const made = await create.mutateAsync(newStrategyFrom(t));
      return (await attachCover(made.id, t)) ?? made;
    },
  };
}
