'use client';

import { MagnifyingGlass, Plus, Tag } from '@phosphor-icons/react/dist/ssr';
import { useId, useMemo, useState } from 'react';
import { ConfirmDialog } from '@/components/app/confirm-dialog';
import { CARD, CardHeader } from '@/components/app/dashboard/shared';
import { SelectField } from '@/components/app/import/select-field';
import { HELP, INPUT, LABEL } from '@/components/app/import/styles';
import { Button } from '@/components/ui/button';
import { buttonClasses } from '@/components/ui/button-styles';
import { Tabs, panelId, tabId } from '@/components/ui/tabs';
import {
  useCreateTag,
  useCreateTagCategory,
  useRemoveTag,
  useRemoveTagCategory,
  useTagCategories,
  useTags,
  useTrades,
  useUpdateTag,
  useUpdateTagCategory,
} from '@/data/query/hooks';
import { DuplicateNameError } from '@/data/repository';
import type { Tag as TagRow, TagCategory } from '@/domain/types';
import { plural } from '@/lib/format';
import { ColourPicker, SWATCHES, parseHex } from './colour-picker';
import {
  FieldError,
  focusField,
  NUM,
  RowMenu,
  SettingsDialog,
  TD,
  TH,
  type MenuAction,
} from './settings-ui';

type View = 'categories' | 'tags';
const PAGE = 50;

/** A category's colour, as a small rounded square. */
function Swatch({ color }: { color: string }): React.JSX.Element {
  return (
    <span
      aria-hidden="true"
      style={{ backgroundColor: color }}
      className="inline-block size-4 flex-none rounded-[5px] shadow-[inset_0_0_0_1px_rgb(0_0_0/0.12)]"
    />
  );
}

/** New category (no `category`) or Edit category: a name and a colour. */
function CategoryDialog({
  open,
  category,
  onClose,
  onSaved,
}: {
  open: boolean;
  category?: TagCategory;
  onClose(): void;
  onSaved?(saved: TagCategory): void;
}): React.JSX.Element {
  return (
    <SettingsDialog
      open={open}
      onClose={onClose}
      title={category ? 'Edit category' : 'New category'}
      description={
        category
          ? category.name
          : 'Group tags that belong together, like Sessions or Setups.'
      }
    >
      {open ? (
        <CategoryForm
          key={category?.id ?? 'new'}
          category={category}
          onClose={onClose}
          onSaved={onSaved}
        />
      ) : null}
    </SettingsDialog>
  );
}

function CategoryForm({
  category,
  onClose,
  onSaved,
}: {
  category?: TagCategory;
  onClose(): void;
  onSaved?(saved: TagCategory): void;
}): React.JSX.Element {
  const create = useCreateTagCategory();
  const update = useUpdateTagCategory();
  const id = useId();
  const [name, setName] = useState(category?.name ?? '');
  const [color, setColor] = useState(category?.color ?? SWATCHES[0]!.hex);
  const [error, setError] = useState<string | null>(null);
  const parsed = parseHex(color);
  const busy = create.isPending || update.isPending;
  const ready = name.trim() !== '' && parsed !== null;

  async function save() {
    if (!ready || parsed === null) return;
    setError(null);
    try {
      const saved = category
        ? await update.mutateAsync({
            id: category.id,
            patch: { name: name.trim(), color: parsed },
          })
        : await create.mutateAsync({ name: name.trim(), color: parsed });
      onSaved?.(saved);
      onClose();
    } catch (e) {
      setError(
        e instanceof DuplicateNameError
          ? `A category named ${e.duplicate} already exists.`
          : "Couldn't save the category. Try again.",
      );
      focusField(`${id}-name`);
    }
  }

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        e.stopPropagation();
        void save();
      }}
      className="grid gap-4"
    >
      <div>
        <label htmlFor={`${id}-name`} className={LABEL}>
          Category name
        </label>
        <input
          id={`${id}-name`}
          value={name}
          autoFocus
          onChange={(e) => setName(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-err` : undefined}
          className={INPUT}
        />
      </div>
      <ColourPicker text={color} onChange={setColor} />
      <div aria-live="polite">
        {error ? <FieldError id={`${id}-err`}>{error}</FieldError> : null}
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="secondary" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button type="submit" disabled={!ready || busy}>
          Save
        </Button>
      </div>
    </form>
  );
}

/** New tag (no `tag`) or Edit tag: a name, its category and a description. */
function TagDialog({
  open,
  tag,
  categories,
  defaultCategoryId,
  onClose,
}: {
  open: boolean;
  tag?: TagRow;
  categories: readonly TagCategory[];
  defaultCategoryId: string;
  onClose(): void;
}): React.JSX.Element {
  const [adding, setAdding] = useState(false);
  const [made, setMade] = useState<string | null>(null);
  return (
    <SettingsDialog
      open={open}
      onClose={onClose}
      title={tag ? 'Edit tag' : 'New tag'}
      description={tag ? tag.name : 'Tags are stored in lower case.'}
    >
      {open ? (
        <TagForm
          key={tag?.id ?? 'new'}
          tag={tag}
          categories={categories}
          categoryId={made ?? tag?.categoryId ?? defaultCategoryId}
          onCategory={setMade}
          onAddCategory={() => setAdding(true)}
          onClose={() => {
            setMade(null);
            onClose();
          }}
        />
      ) : null}
      <CategoryDialog
        open={adding}
        onClose={() => setAdding(false)}
        onSaved={(c) => setMade(c.id)}
      />
    </SettingsDialog>
  );
}

function TagForm({
  tag,
  categories,
  categoryId,
  onCategory,
  onAddCategory,
  onClose,
}: {
  tag?: TagRow;
  categories: readonly TagCategory[];
  categoryId: string;
  onCategory(id: string): void;
  onAddCategory(): void;
  onClose(): void;
}): React.JSX.Element {
  const create = useCreateTag();
  const update = useUpdateTag();
  const id = useId();
  const [name, setName] = useState(tag?.name ?? '');
  const [description, setDescription] = useState(tag?.description ?? '');
  const [error, setError] = useState<string | null>(null);
  const busy = create.isPending || update.isPending;
  const ready = name.trim() !== '' && categoryId !== '';

  async function save() {
    if (!ready) return;
    setError(null);
    const text = description.trim();
    try {
      if (tag)
        await update.mutateAsync({
          id: tag.id,
          patch: {
            name,
            categoryId,
            description: text === '' ? undefined : text,
          },
        });
      else
        await create.mutateAsync({
          name,
          categoryId,
          ...(text === '' ? {} : { description: text }),
        });
      onClose();
    } catch (e) {
      setError(
        e instanceof DuplicateNameError
          ? `A tag named ${e.duplicate} is already in that category.`
          : "Couldn't save the tag. Try again.",
      );
      focusField(`${id}-name`);
    }
  }

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
      className="grid gap-4"
    >
      <div>
        <label htmlFor={`${id}-name`} className={LABEL}>
          Tag name
        </label>
        <input
          id={`${id}-name`}
          value={name}
          autoFocus
          onChange={(e) => setName(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-err` : undefined}
          className={INPUT}
        />
      </div>
      <div>
        <div className="flex items-center justify-between gap-3">
          <label htmlFor={`${id}-cat`} className={LABEL}>
            Category
          </label>
          <button
            type="button"
            onClick={onAddCategory}
            className="mb-1.5 rounded-chip text-[12.5px] font-semibold text-accent-ink underline-offset-2 outline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:min-h-11"
          >
            Add category
          </button>
        </div>
        <SelectField
          id={`${id}-cat`}
          value={categoryId}
          onChange={(e) => onCategory(e.target.value)}
        >
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </SelectField>
      </div>
      <div>
        <label htmlFor={`${id}-desc`} className={LABEL}>
          Description
        </label>
        <textarea
          id={`${id}-desc`}
          value={description}
          rows={3}
          onChange={(e) => setDescription(e.target.value)}
          aria-describedby={`${id}-desc-help`}
          className={`${INPUT} h-auto resize-y py-2 leading-snug`}
        />
        <p id={`${id}-desc-help`} className={HELP}>
          Optional. What the tag means, for you later.
        </p>
      </div>
      <div aria-live="polite">
        {error ? <FieldError id={`${id}-err`}>{error}</FieldError> : null}
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="secondary" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button type="submit" disabled={!ready || busy}>
          Save
        </Button>
      </div>
    </form>
  );
}

type Dialog =
  | { kind: 'category'; category?: TagCategory }
  | { kind: 'tag'; tag?: TagRow }
  | { kind: 'delete-category'; category: TagCategory }
  | { kind: 'delete-tag'; tag: TagRow };

/** Tag categories (a name and a colour) and the tags in them. */
export function TagsSettings(): React.JSX.Element {
  const categories = useTagCategories();
  const tags = useTags();
  const tradesQuery = useTrades();
  const trades = tradesQuery.data;
  const removeTag = useRemoveTag();
  const removeCategory = useRemoveTagCategory();
  const baseId = useId();
  const [view, setView] = useState<View>('categories');
  const [search, setSearch] = useState('');
  const [shown, setShown] = useState(PAGE);
  const [dialog, setDialog] = useState<Dialog | null>(null);

  const cats = categories.data;
  const model = useMemo(() => {
    if (!cats || !tags.data || !trades) return undefined;
    const tradesPerTag = new Map<string, number>();
    const tagsOf = new Map<string, TagRow[]>();
    for (const t of tags.data)
      tagsOf.set(t.categoryId, [...(tagsOf.get(t.categoryId) ?? []), t]);
    const categoryOfTag = new Map(tags.data.map((t) => [t.id, t.categoryId]));
    const tradesPerCategory = new Map<string, number>();
    for (const trade of trades) {
      const seen = new Set<string>();
      for (const id of trade.tagIds) {
        tradesPerTag.set(id, (tradesPerTag.get(id) ?? 0) + 1);
        const c = categoryOfTag.get(id);
        if (c !== undefined) seen.add(c);
      }
      for (const c of seen)
        tradesPerCategory.set(c, (tradesPerCategory.get(c) ?? 0) + 1);
    }
    const nameOf = new Map(cats.map((c) => [c.id, c]));
    return { tradesPerTag, tradesPerCategory, tagsOf, nameOf };
  }, [cats, tags.data, trades]);

  const query = search.trim().toLowerCase();
  const visible = useMemo(() => {
    if (!model || !tags.data) return [];
    return tags.data.filter((t) => {
      if (query === '') return true;
      const category = model.nameOf.get(t.categoryId)?.name ?? '';
      return `${t.name} ${category} ${t.description ?? ''}`
        .toLowerCase()
        .includes(query);
    });
  }, [model, tags.data, query]);

  const error = categories.error ?? tags.error ?? tradesQuery.error;
  const loading = !cats || !tags.data || !model;

  const categoryActions = (c: TagCategory): MenuAction[] => [
    {
      label: 'Edit',
      onSelect: () => setDialog({ kind: 'category', category: c }),
    },
    ...(c.builtIn
      ? []
      : [
          {
            label: 'Delete',
            danger: true,
            onSelect: () => setDialog({ kind: 'delete-category', category: c }),
          },
        ]),
  ];
  const tagActions = (t: TagRow): MenuAction[] => [
    { label: 'Edit', onSelect: () => setDialog({ kind: 'tag', tag: t }) },
    {
      label: 'Delete',
      danger: true,
      onSelect: () => setDialog({ kind: 'delete-tag', tag: t }),
    },
  ];

  const deleting = dialog?.kind === 'delete-category' ? dialog.category : null;
  const deletingTag = dialog?.kind === 'delete-tag' ? dialog.tag : null;
  const k = deleting ? (model?.tagsOf.get(deleting.id)?.length ?? 0) : 0;
  const nCategory = deleting
    ? (model?.tradesPerCategory.get(deleting.id) ?? 0)
    : 0;
  const nTag = deletingTag ? (model?.tradesPerTag.get(deletingTag.id) ?? 0) : 0;

  return (
    <section
      aria-labelledby="tags-heading"
      className={`${CARD} overflow-hidden pt-[18px] pb-4`}
    >
      <CardHeader
        className="px-5"
        icon={Tag}
        tone="accent"
        headingId="tags-heading"
        title="Tags"
        end={
          view === 'categories' ? (
            <button
              type="button"
              onClick={() => setDialog({ kind: 'category' })}
              className={buttonClasses('primary', 'sm')}
            >
              <Plus size={14} weight="bold" aria-hidden="true" />
              New category
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setDialog({ kind: 'tag' })}
              className={buttonClasses('primary', 'sm')}
            >
              <Plus size={14} weight="bold" aria-hidden="true" />
              New tag
            </button>
          )
        }
      />
      <div className="mt-4 flex flex-wrap items-center gap-3 px-5">
        <Tabs<View>
          id={baseId}
          label="Tags view"
          value={view}
          onChange={(next) => {
            setView(next);
            setShown(PAGE);
          }}
          coarseTargets
          options={[
            { value: 'categories', label: 'Categories' },
            { value: 'tags', label: 'Tags' },
          ]}
        />
        {view === 'tags' ? (
          <div className="relative ml-auto w-full sm:w-[260px]">
            <MagnifyingGlass
              aria-hidden="true"
              size={16}
              className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-faint"
            />
            <input
              type="search"
              aria-label="Search tags"
              placeholder="Search tags"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setShown(PAGE);
              }}
              className={`${INPUT} pl-9`}
            />
          </div>
        ) : null}
      </div>

      <div
        role="tabpanel"
        id={panelId(baseId)}
        aria-labelledby={tabId(baseId, view)}
        className="mt-3"
      >
        {error ? (
          <p role="alert" className="px-5 pt-2 text-[13.5px] text-muted">
            Keel couldn&apos;t read your tags. Reload the page to try again.
          </p>
        ) : loading ? (
          <p role="status" className="px-5 pt-2 text-[13.5px] text-muted">
            Loading your tags...
          </p>
        ) : view === 'categories' ? (
          <div className="relative overflow-x-auto">
            <table
              aria-label="Tag categories"
              className="w-full min-w-[520px] border-collapse text-[13.5px]"
            >
              <thead>
                <tr>
                  <th scope="col" className={TH}>
                    Name
                  </th>
                  <th scope="col" className={TH}>
                    Colour
                  </th>
                  <th scope="col" className={`${TH} ${NUM}`}>
                    Tags
                  </th>
                  <th scope="col" className={TH}>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {cats.map((c) => (
                  <tr key={c.id}>
                    <td className={`${TD} whitespace-nowrap`}>
                      <span className="font-semibold text-text">{c.name}</span>
                      {c.builtIn ? (
                        <small className="ml-2 text-[12px] text-faint">
                          Built in
                        </small>
                      ) : null}
                    </td>
                    <td className={`${TD} whitespace-nowrap`}>
                      <span className="inline-flex items-center gap-2 font-mono text-[12.5px] text-muted">
                        <Swatch color={c.color} />
                        {c.color}
                      </span>
                    </td>
                    <td className={`${TD} ${NUM}`}>
                      {model.tagsOf.get(c.id)?.length ?? 0}
                    </td>
                    <td className={`${TD} text-right`}>
                      <RowMenu
                        label={`Actions for ${c.name}`}
                        actions={categoryActions(c)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : tags.data.length === 0 ? (
          <p className="px-5 pt-2 text-[13.5px] text-muted">
            No tags yet. Make one with New tag, or tag a trade from its page.
          </p>
        ) : visible.length === 0 ? (
          <p className="px-5 pt-2 text-[13.5px] text-muted">
            No tags match that search.
          </p>
        ) : (
          <div className="relative overflow-x-auto">
            <table
              aria-label="Tags"
              className="w-full min-w-[640px] border-collapse text-[13.5px]"
            >
              <thead>
                <tr>
                  <th scope="col" className={TH}>
                    Name
                  </th>
                  <th scope="col" className={TH}>
                    Category
                  </th>
                  <th scope="col" className={TH}>
                    Description
                  </th>
                  <th scope="col" className={`${TH} ${NUM}`}>
                    Trades
                  </th>
                  <th scope="col" className={TH}>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {visible.slice(0, shown).map((t) => {
                  const c = model.nameOf.get(t.categoryId);
                  return (
                    <tr key={t.id}>
                      <td
                        className={`${TD} whitespace-nowrap font-semibold text-text`}
                      >
                        {t.name}
                      </td>
                      <td className={`${TD} whitespace-nowrap`}>
                        <span className="inline-flex items-center gap-2">
                          {c ? <Swatch color={c.color} /> : null}
                          {c?.name ?? ''}
                        </span>
                      </td>
                      <td className={`${TD} max-w-[280px] truncate text-muted`}>
                        {t.description ?? ''}
                      </td>
                      <td className={`${TD} ${NUM}`}>
                        {model.tradesPerTag.get(t.id) ?? 0}
                      </td>
                      <td className={`${TD} text-right`}>
                        <RowMenu
                          label={`Actions for ${t.name}`}
                          actions={tagActions(t)}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {visible.length > shown ? (
              <div className="flex justify-center pt-3">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setShown((n) => n + PAGE)}
                >
                  Show more ({visible.length - shown} left)
                </Button>
              </div>
            ) : null}
          </div>
        )}
      </div>

      <CategoryDialog
        open={dialog?.kind === 'category'}
        category={dialog?.kind === 'category' ? dialog.category : undefined}
        onClose={() => setDialog(null)}
      />
      <TagDialog
        open={dialog?.kind === 'tag'}
        tag={dialog?.kind === 'tag' ? dialog.tag : undefined}
        categories={cats ?? []}
        defaultCategoryId={
          cats?.find((c) => c.id === 'custom-tags')?.id ?? cats?.[0]?.id ?? ''
        }
        onClose={() => setDialog(null)}
      />
      <ConfirmDialog
        open={deletingTag !== null}
        title={`Delete ${deletingTag?.name ?? ''}?`}
        body={
          nTag === 0
            ? 'No trade has it.'
            : `It's removed from ${nTag.toLocaleString('en-US')} ${plural(nTag, 'trade')}.`
        }
        confirmLabel="Delete tag"
        danger
        onConfirm={async () => {
          if (deletingTag) await removeTag.mutateAsync(deletingTag.id);
        }}
        onClose={() => setDialog(null)}
      />
      <ConfirmDialog
        open={deleting !== null}
        title={
          k === 0
            ? `Delete ${deleting?.name ?? ''}?`
            : `Delete ${deleting?.name ?? ''} and its ${k} ${plural(k, 'tag')}?`
        }
        body={
          k === 0
            ? 'It has no tags.'
            : `${k === 1 ? "It's" : "They're"} removed from ${nCategory.toLocaleString('en-US')} ${plural(nCategory, 'trade')}.`
        }
        confirmLabel="Delete category"
        danger
        onConfirm={async () => {
          if (deleting) await removeCategory.mutateAsync(deleting.id);
        }}
        onClose={() => setDialog(null)}
      />
    </section>
  );
}
