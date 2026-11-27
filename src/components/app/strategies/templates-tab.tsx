'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { DropdownMenu } from 'radix-ui';
import {
  CaretDown,
  Check,
  MagnifyingGlass,
} from '@phosphor-icons/react/dist/ssr';
import {
  STRATEGY_TEMPLATES,
  STYLE_LABEL,
  STYLE_ORDER,
  type TemplateStyle,
} from '@/content/strategy-templates';
import { useStrategies } from '@/data/query/hooks';
import type { AssetClass } from '@/domain/types';
import { ASSET_LABEL } from './strategy-style';
import { TemplateCard } from './template-card';
import { ChooserBox } from './template-chooser';
import {
  filterTemplates,
  NO_FILTER,
  type TemplateFilter,
} from './template-filter';
import { useCopyTemplate } from './use-copy-template';

const ASSETS: readonly AssetClass[] = [
  'stock',
  'future',
  'forex',
  'option',
  'crypto',
];

const TRIGGER =
  'inline-flex h-8 min-w-0 cursor-pointer items-center gap-1.5 rounded-control border border-line bg-surface-1 pr-2 pl-2.5 text-[13.5px] font-medium text-text transition-[border-color] duration-200 ease-(--ease-glide) outline-offset-2 hover:border-accent/35 focus-visible:outline-2 focus-visible:outline-accent data-[state=open]:border-accent/35 pointer-coarse:h-11';
const ITEM =
  'relative flex min-h-9 cursor-pointer items-center rounded-[8px] py-1.5 pr-3 pl-8 text-[13.5px] text-text select-none outline-none data-highlighted:bg-sunken pointer-coarse:min-h-11';

/** A pick-several filter: its button names it and counts what is picked; the list stays open while you pick. */
function FilterMenu<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly { value: T; label: string }[];
  value: readonly T[];
  onChange(next: T[]): void;
}): React.JSX.Element {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger className={TRIGGER}>
        {label}
        {value.length > 0 ? (
          <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-accent-soft px-1 text-[11.5px] font-semibold text-accent-ink tabular-nums">
            {value.length}
          </span>
        ) : null}
        <CaretDown
          size={12}
          weight="bold"
          aria-hidden="true"
          className="flex-none text-faint"
        />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          sideOffset={6}
          collisionPadding={12}
          aria-label={label}
          className="z-[60] min-w-44 origin-(--radix-dropdown-menu-content-transform-origin) rounded-[12px] border border-line bg-surface-1 p-1.5 text-text shadow-[var(--shadow)] outline-none motion-safe:data-[state=closed]:animate-tip-out motion-safe:data-[state=open]:animate-pop-in"
        >
          {options.map((o) => (
            <DropdownMenu.CheckboxItem
              key={o.value}
              checked={value.includes(o.value)}
              onCheckedChange={(on) =>
                onChange(
                  on ? [...value, o.value] : value.filter((v) => v !== o.value),
                )
              }
              onSelect={(e) => e.preventDefault()}
              className={ITEM}
            >
              <DropdownMenu.ItemIndicator className="absolute left-2 inline-flex">
                <Check
                  size={16}
                  aria-hidden="true"
                  className="text-accent-ink"
                />
              </DropdownMenu.ItemIndicator>
              {o.label}
            </DropdownMenu.CheckboxItem>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

/**
 * The Templates tab: Keel's templates with filters for asset and style, a
 * search over name and asset class, and the chooser's box. "+" on a card adds
 * a copy to My strategies and opens it; a template already copied is marked
 * Added and still adds another.
 */
export function TemplatesTab(): React.JSX.Element {
  const router = useRouter();
  const strategies = useStrategies();
  const { copy } = useCopyTemplate();
  const [filter, setFilter] = useState<TemplateFilter>(NO_FILTER);
  const [pending, setPending] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  const copied = new Set(
    (strategies.data ?? []).flatMap((s) =>
      s.templateId === undefined ? [] : [s.templateId],
    ),
  );
  const shown = filterTemplates(STRATEGY_TEMPLATES, filter);

  const add = async (id: string) => {
    const t = STRATEGY_TEMPLATES.find((x) => x.id === id);
    if (!t || pending !== null) return;
    setPending(id);
    setFailed(null);
    try {
      const made = await copy(t);
      router.push(`/app/strategies/${encodeURIComponent(made.id)}`);
    } catch {
      setFailed(id);
    } finally {
      setPending(null);
    }
  };

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <FilterMenu<AssetClass>
          label="Asset"
          value={filter.assets}
          onChange={(assets) => setFilter((f) => ({ ...f, assets }))}
          options={ASSETS.map((a) => ({ value: a, label: ASSET_LABEL[a] }))}
        />
        <FilterMenu<TemplateStyle>
          label="Style"
          value={filter.styles}
          onChange={(styles) => setFilter((f) => ({ ...f, styles }))}
          options={STYLE_ORDER.map((s) => ({
            value: s,
            label: STYLE_LABEL[s],
          }))}
        />
        <div className="relative w-[260px] max-sm:order-3 max-sm:w-full">
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
            value={filter.query}
            onChange={(e) =>
              setFilter((f) => ({ ...f, query: e.target.value }))
            }
            className="h-8 w-full rounded-control border border-line-2 bg-surface-1 pr-3 pl-9 text-[13.5px] text-text placeholder:text-faint focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:h-11"
          />
        </div>
        <span className="ml-auto max-sm:order-4 max-sm:ml-0">
          <ChooserBox />
        </span>
      </div>

      {shown.length === 0 ? (
        <p
          role="status"
          className="px-1 py-8 text-center text-[14.5px] text-muted"
        >
          No templates match.
        </p>
      ) : (
        shown.map((t) => (
          <TemplateCard
            key={t.id}
            t={t}
            added={copied.has(t.id)}
            pending={pending === t.id}
            failed={failed === t.id}
            onAdd={() => void add(t.id)}
          />
        ))
      )}
    </div>
  );
}
