'use client';

import { useRouter } from 'next/navigation';
import { useId, useState, type RefObject } from 'react';
import {
  CaretRight,
  MagnifyingGlass,
  Plus,
} from '@phosphor-icons/react/dist/ssr';
import { Button } from '@/components/ui/button';
import { MorphDialog } from '@/components/ui/morph-dialog';
import { Segmented } from '@/components/ui/segmented';
import {
  STRATEGY_TEMPLATES,
  TEMPLATE_AUTHOR,
  type StrategyTemplate,
} from '@/content/strategy-templates';
import { usePrefs, useUpdatePrefs } from '@/data/query/hooks';
import type { AssetClass } from '@/domain/types';
import { ASSET_LABEL } from './strategy-style';
import { TemplateChips, TemplateCover } from './template-card';
import { filterTemplates, NO_FILTER } from './template-filter';

/** The asset classes the chooser filters by, in the order the comp lists them; templates cover these five. */
const ASSETS: readonly AssetClass[] = [
  'stock',
  'future',
  'forex',
  'option',
  'crypto',
];

/**
 * Whether New strategy opens the chooser (default on), and a way to change it.
 * The change shows at once; the saved value follows.
 */
export function useChooserPref(): { on: boolean; set(on: boolean): void } {
  const prefs = usePrefs();
  const update = useUpdatePrefs();
  const saving = update.isPending
    ? update.variables?.strategyChooser
    : undefined;
  return {
    on: saving ?? prefs.data?.strategyChooser !== false,
    set: (on) => update.mutate({ strategyChooser: on }),
  };
}

/** "Show templates when I make a strategy": the chooser's box, on the chooser and on the Templates tab. */
export function ChooserBox(): React.JSX.Element {
  const { on, set } = useChooserPref();
  return (
    <label className="inline-flex min-h-8 cursor-pointer items-center gap-2 text-[13px] text-muted pointer-coarse:min-h-11">
      <input
        type="checkbox"
        checked={on}
        onChange={(e) => set(e.target.checked)}
        className="size-4 flex-none accent-[var(--accent)]"
      />
      Show templates when I make a strategy
    </label>
  );
}

const ROW =
  'grid w-full cursor-pointer grid-cols-[88px_minmax(0,1fr)] items-center gap-4 rounded-[12px] border border-line p-2.5 text-left outline-offset-2 transition-colors duration-200 ease-(--ease-glide) hover:border-accent/35 hover:bg-accent-soft/40 focus-visible:outline-2 focus-visible:outline-accent sm:grid-cols-[128px_minmax(0,1fr)_20px]';

function Row({
  t,
  onPick,
}: {
  t: StrategyTemplate;
  onPick(): void;
}): React.JSX.Element {
  const nameId = useId();
  const descId = useId();
  return (
    <li>
      <button
        type="button"
        onClick={onPick}
        aria-labelledby={nameId}
        aria-describedby={descId}
        className={ROW}
      >
        <TemplateCover t={t} className="rounded-[8px] border border-line" />
        <span className="min-w-0">
          <span className="flex flex-wrap items-baseline gap-x-1.5">
            <b
              id={nameId}
              className="text-[14.5px] font-semibold tracking-[-0.01em] text-text"
            >
              {t.name}
            </b>
            <span className="text-[12.5px] text-faint">{TEMPLATE_AUTHOR}</span>
          </span>
          <span
            id={descId}
            className="mt-[3px] block text-[13px] leading-[1.45] text-muted"
          >
            {t.description}
          </span>
          <TemplateChips t={t} className="mt-1.5" plain />
        </span>
        <CaretRight
          size={16}
          weight="bold"
          aria-hidden="true"
          className="text-faint max-sm:hidden"
        />
      </button>
    </li>
  );
}

/**
 * The chooser New strategy opens while its box is on: Start blank, or one of
 * Keel's templates. A template opens the create form filled from it, unsaved;
 * Start blank opens it empty. Closing returns to the list, and Cancel on the
 * form returns here.
 */
export function TemplateChooser({
  open,
  onOpenChange,
  origin,
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
  origin: RefObject<HTMLElement | null>;
}): React.JSX.Element {
  const router = useRouter();
  const [asset, setAsset] = useState<'all' | AssetClass>('all');
  const [query, setQuery] = useState('');
  const shown = filterTemplates(STRATEGY_TEMPLATES, {
    ...NO_FILTER,
    assets: asset === 'all' ? [] : [asset],
    query,
  });

  return (
    <MorphDialog
      open={open}
      onOpenChange={onOpenChange}
      origin={origin}
      returnFocus={origin}
      title="New strategy"
      description="Start from a template written by Keel, or from blank. A template becomes your own copy to edit."
      size="sheet"
      footer={
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2.5">
          <ChooserBox />
          <Button
            variant="secondary"
            onClick={() => onOpenChange(false)}
            className="ml-auto"
          >
            Cancel
          </Button>
        </div>
      }
    >
      <div className="mt-1 flex flex-wrap items-center gap-2.5">
        <Segmented
          label="Asset class"
          value={asset}
          onChange={setAsset}
          coarseTargets
          className="max-sm:w-full max-sm:overflow-x-auto max-sm:[scrollbar-width:none]"
          options={[
            { value: 'all', label: 'All' },
            ...ASSETS.map((a) => ({ value: a, label: ASSET_LABEL[a] })),
          ]}
        />
        <div className="relative min-w-[180px] flex-1">
          <MagnifyingGlass
            size={16}
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-faint"
          />
          <input
            type="search"
            aria-label="Search templates"
            placeholder="Search templates"
            autoComplete="off"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-[34px] w-full rounded-control border border-line-2 bg-surface-1 pr-3 pl-9 text-[13.5px] text-text placeholder:text-faint focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:h-11"
          />
        </div>
      </div>

      <ul className="mt-3 flex flex-col gap-2">
        <li>
          <button
            type="button"
            onClick={() => router.push('/app/strategies/new')}
            className={`${ROW} border-dashed border-line-2`}
          >
            <span className="grid h-14 place-items-center rounded-[8px] border border-dashed border-line-2 text-muted sm:h-[72px]">
              <Plus size={22} aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <b className="block text-[14.5px] font-semibold tracking-[-0.01em] text-text">
                Start blank
              </b>
              <span className="mt-[3px] block text-[13px] leading-[1.45] text-muted">
                An empty strategy: add your own rules, groups and assets.
              </span>
            </span>
            <CaretRight
              size={16}
              weight="bold"
              aria-hidden="true"
              className="text-faint max-sm:hidden"
            />
          </button>
        </li>
        {shown.map((t) => (
          <Row
            key={t.id}
            t={t}
            onPick={() =>
              router.push(
                `/app/strategies/new?template=${encodeURIComponent(t.id)}`,
              )
            }
          />
        ))}
      </ul>
      {shown.length === 0 ? (
        <p role="status" className="px-1 pt-3 pb-1 text-[13.5px] text-muted">
          No templates match.
        </p>
      ) : null}
    </MorphDialog>
  );
}
