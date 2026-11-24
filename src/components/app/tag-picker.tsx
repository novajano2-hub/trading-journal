'use client';

import { useId, useMemo, useRef, useState } from 'react';
import { Check, Plus, X } from '@phosphor-icons/react/dist/ssr';
import Link from 'next/link';
import { useCreateTag, useTagCategories, useTags } from '@/data/query/hooks';
import type { Tag, TagCategory } from '@/domain/types';

/** The built-in category a tag lands in when the picker is not scoped. */
const CUSTOM_CATEGORY_ID = 'custom-tags';

type Item =
  | { kind: 'tag'; tag: Tag }
  | { kind: 'create'; name: string; category: TagCategory };

function Swatch({ color }: { color: string }): React.JSX.Element {
  return (
    <span
      aria-hidden="true"
      className="size-2.5 flex-none rounded-full"
      // A category's colour is data the user chose.
      style={{ backgroundColor: color }}
    />
  );
}

/**
 * Tags grouped by category, with a search box that is a combobox over the
 * list: the arrow keys move, Enter picks (or creates), Escape clears the text.
 * `selected` is the whole list of chosen tag ids, including any outside the
 * categories shown; `onChange` gets that list with the pick toggled. With
 * `categories`, only those are listed and "Create" goes to the first of them;
 * otherwise every category is listed and "Create" goes to Custom tags.
 */
export function TagPicker({
  selected,
  onChange,
  categories,
  allowCreate = true,
  label,
  autoFocus = false,
  manageLink = true,
}: {
  selected: string[];
  onChange(ids: string[]): void;
  categories?: TagCategory[];
  allowCreate?: boolean;
  label: string;
  autoFocus?: boolean;
  /** A "Manage tags" link to Settings > Tags below the list. */
  manageLink?: boolean;
}): React.JSX.Element {
  const allTags = useTags().data;
  const allCategories = useTagCategories().data;
  const create = useCreateTag();
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [failed, setFailed] = useState(false);

  const shown = categories ?? allCategories;
  const text = query.trim().toLowerCase();

  const groups = useMemo(() => {
    if (!shown || !allTags) return [];
    return shown
      .map((category) => ({
        category,
        tags: allTags
          .filter(
            (t) =>
              t.categoryId === category.id &&
              t.name.toLowerCase().includes(text),
          )
          .sort((a, b) =>
            a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }),
          ),
      }))
      .filter((g) => g.tags.length > 0);
  }, [shown, allTags, text]);

  const target =
    categories?.[0] ??
    allCategories?.find((c) => c.id === CUSTOM_CATEGORY_ID) ??
    allCategories?.find((c) => c.builtIn && c.role === undefined);
  const exists =
    target !== undefined &&
    (allTags ?? []).some(
      (t) => t.categoryId === target.id && t.name.toLowerCase() === text,
    );
  const canCreate =
    allowCreate && text !== '' && !exists && target !== undefined;

  const items: Item[] = [
    ...groups.flatMap((g) => g.tags.map((tag): Item => ({ kind: 'tag', tag }))),
    ...(canCreate
      ? [{ kind: 'create', name: text, category: target } as Item]
      : []),
  ];
  const current = Math.min(active, Math.max(0, items.length - 1));
  const optionId = (i: number) => `${id}-opt-${i}`;

  const byId = new Map((allTags ?? []).map((t) => [t.id, t]));
  const inScope = new Set((shown ?? []).map((c) => c.id));
  const chips = selected.flatMap((tagId) => {
    const tag = byId.get(tagId);
    return tag && inScope.has(tag.categoryId) ? [tag] : [];
  });

  const toggle = (tagId: string) =>
    onChange(
      selected.includes(tagId)
        ? selected.filter((x) => x !== tagId)
        : [...selected, tagId],
    );

  const pick = async (item: Item | undefined) => {
    if (!item) return;
    if (item.kind === 'tag') {
      toggle(item.tag.id);
      return;
    }
    setFailed(false);
    try {
      const tag = await create.mutateAsync({
        name: item.name,
        categoryId: item.category.id,
      });
      if (!selected.includes(tag.id)) onChange([...selected, tag.id]);
      setQuery('');
      setActive(0);
    } catch {
      setFailed(true);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        if (items.length) setActive((current + 1) % items.length);
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (items.length)
          setActive((current - 1 + items.length) % items.length);
        break;
      case 'Home':
        if (items.length) {
          e.preventDefault();
          setActive(0);
        }
        break;
      case 'End':
        if (items.length) {
          e.preventDefault();
          setActive(items.length - 1);
        }
        break;
      case 'Enter':
        e.preventDefault();
        void pick(items[current]);
        break;
      case 'Escape':
        // Clear the text first; with none left, let the surrounding popover close.
        if (query !== '') {
          e.preventDefault();
          e.stopPropagation();
          setQuery('');
        }
        break;
    }
  };

  const indexOf = new Map(
    items.flatMap((it, i) =>
      it.kind === 'tag' ? [[it.tag.id, i] as const] : [],
    ),
  );
  return (
    <div className="flex min-w-0 flex-col gap-2">
      {chips.length > 0 ? (
        <ul aria-label="Chosen tags" className="flex flex-wrap gap-1.5">
          {chips.map((tag) => (
            <li key={tag.id}>
              <button
                type="button"
                aria-label={`Remove ${tag.name}`}
                onClick={() => toggle(tag.id)}
                className="inline-flex h-[26px] items-center gap-1 rounded-full bg-accent-soft pr-1.5 pl-2.5 text-xs font-[550] text-accent-ink outline-offset-2 hover:bg-accent-soft/70 focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:h-11"
              >
                {tag.name}
                <X size={11} weight="bold" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <input
        ref={input}
        role="combobox"
        aria-label={label}
        aria-expanded="true"
        aria-controls={`${id}-list`}
        aria-autocomplete="list"
        aria-activedescendant={items.length ? optionId(current) : undefined}
        autoFocus={autoFocus}
        autoComplete="off"
        spellCheck={false}
        placeholder="Search or create a tag"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
        }}
        onKeyDown={onKeyDown}
        className="h-9 w-full rounded-control border border-line bg-surface-1 px-3 text-[13.5px] text-text placeholder:text-faint hover:border-accent/35 focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:h-11"
      />
      <div
        id={`${id}-list`}
        role="listbox"
        aria-label={`${label} list`}
        aria-multiselectable="true"
        className="max-h-[260px] overflow-y-auto"
      >
        {groups.map((g) => (
          <div
            key={g.category.id}
            role="group"
            aria-labelledby={`${id}-g-${g.category.id}`}
            className="py-1"
          >
            <div
              id={`${id}-g-${g.category.id}`}
              className="flex items-center gap-2 px-2 pt-1 pb-1 text-xs font-medium text-faint"
            >
              <Swatch color={g.category.color} />
              {g.category.name}
            </div>
            {g.tags.map((tag) => {
              const i = indexOf.get(tag.id) ?? 0;
              const on = selected.includes(tag.id);
              return (
                <div
                  key={tag.id}
                  id={optionId(i)}
                  role="option"
                  aria-selected={on}
                  // Keep the focus in the text box.
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => toggle(tag.id)}
                  onMouseMove={() => setActive(i)}
                  className={`flex min-h-8 cursor-pointer items-center justify-between gap-2 rounded-[8px] px-2 text-[13.5px] pointer-coarse:min-h-11 ${i === current ? 'bg-sunken' : ''} ${on ? 'font-semibold text-text' : 'text-text'}`}
                >
                  <span className="truncate">{tag.name}</span>
                  {on ? (
                    <Check
                      size={14}
                      weight="bold"
                      aria-hidden="true"
                      className="flex-none text-accent"
                    />
                  ) : null}
                </div>
              );
            })}
          </div>
        ))}
        {canCreate
          ? (() => {
              const i = items.length - 1;
              return (
                <div
                  id={optionId(i)}
                  role="option"
                  aria-selected={false}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => void pick(items[i])}
                  onMouseMove={() => setActive(i)}
                  className={`mt-1 flex min-h-8 cursor-pointer items-center gap-2 rounded-[8px] px-2 text-[13.5px] font-medium text-accent-ink pointer-coarse:min-h-11 ${i === current ? 'bg-sunken' : ''}`}
                >
                  <Plus size={14} weight="bold" aria-hidden="true" />
                  {`Create '${text}'`}
                </div>
              );
            })()
          : null}
        {items.length === 0 ? (
          <p className="px-2 py-3 text-[13px] text-faint">No tags match.</p>
        ) : null}
      </div>
      {manageLink ? (
        <Link
          href="/app/settings/tags"
          className="self-start rounded-chip px-2 text-[13px] font-semibold text-accent-ink outline-offset-2 hover:text-accent-hover focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:py-3"
        >
          Manage tags
        </Link>
      ) : null}
      {failed ? (
        <p role="alert" className="text-[13px] text-loss">
          Couldn&apos;t create that tag. Try again.
        </p>
      ) : null}
    </div>
  );
}
