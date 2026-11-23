'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import {
  ArrowDown,
  ArrowUp,
  CaretLeft,
  CheckSquare,
  ListChecks,
  Plus,
  Target,
  Trash,
  Warning,
} from '@phosphor-icons/react/dist/ssr';
import { Button } from '@/components/ui/button';
import { buttonClasses } from '@/components/ui/button-styles';
import { IconTile } from '@/components/ui/icon-tile';
import {
  useCreateStrategy,
  useRemoveStrategy,
  useStrategy,
  useUpdateStrategy,
} from '@/data/query/hooks';
import type { NewStrategy } from '@/data/repository';
import {
  STRATEGY_ICONS,
  type AssetClass,
  type RuleShowWhen,
  type Strategy,
  type StrategyIcon,
  type StrategyTone,
} from '@/domain/types';
import { plural } from '@/lib/format';
import { ConfirmDialog } from '../confirm-dialog';
import { CARD, CardHeader } from '../dashboard/shared';
import {
  ASSET_LABEL,
  ASSET_ORDER,
  ICON_LABEL,
  SHOW_WHEN_LABEL,
  STRATEGY_ICON_GLYPH,
  TONE_LABEL,
  TONE_ORDER,
  deleteBody,
} from './strategy-style';
import { NoStrategy, StrategySkeleton } from './strategy-states';
import { useStrategyData } from './use-strategy-figures';

const INPUT =
  'block h-[38px] w-full rounded-control border border-line-2 bg-surface-1 px-3 text-[14px] font-[550] text-text shadow-[var(--shadow-chip)] transition-[border-color,box-shadow] duration-200 ease-[var(--ease-glide)] outline-none placeholder:text-faint hover:border-faint focus-visible:border-accent focus-visible:shadow-[0_0_0_3px_var(--accent-soft)] aria-invalid:border-muted pointer-coarse:h-11';
const LABEL = 'mb-1.5 block text-[12.5px] font-medium text-muted';
const ICON_BTN =
  'inline-flex size-8 flex-none items-center justify-center rounded-[8px] text-muted outline-offset-1 hover:bg-sunken hover:text-text focus-visible:outline-2 focus-visible:outline-accent disabled:pointer-events-none disabled:opacity-35 pointer-coarse:size-11';
const TEXT_BTN =
  'inline-flex min-h-8 items-center gap-1.5 rounded-chip text-[13px] font-semibold text-accent-ink outline-offset-2 hover:text-accent-hover focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:min-h-11';

interface RuleDraft {
  key: number;
  id?: string;
  text: string;
  showWhen: RuleShowWhen;
}
interface GroupDraft {
  key: number;
  id?: string;
  title: string;
  rules: RuleDraft[];
}
interface ItemDraft {
  key: number;
  text: string;
}

/** React keys for the drafts: unique for the page's life, never saved. */
let keySeq = 0;
const nextKey = () => (keySeq += 1);

const DEFAULT_GROUPS = ['Entry', 'Exit', 'Risk', 'Management'];

/** `list` with the item at `from` moved by `by` places (it stays put at an end). */
function moved<T>(list: readonly T[], from: number, by: -1 | 1): T[] {
  const to = from + by;
  if (to < 0 || to >= list.length) return [...list];
  const next = [...list];
  next.splice(to, 0, next.splice(from, 1)[0]!);
  return next;
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children(p: {
    id: string;
    'aria-describedby'?: string;
    'aria-invalid'?: true;
  }): ReactNode;
}) {
  const id = useId();
  const errId = `${id}-error`;
  return (
    <div>
      <label htmlFor={id} className={LABEL}>
        {label}
      </label>
      {children({
        id,
        'aria-describedby': error ? errId : undefined,
        'aria-invalid': error ? true : undefined,
      })}
      <div aria-live="polite">
        {error ? (
          // An input problem, not a loss: neutral, never loss red.
          <p
            id={errId}
            role="alert"
            className="mt-1.5 flex items-center gap-1.5 text-[13px] text-text"
          >
            <Warning size={14} aria-hidden="true" className="text-muted" />
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function StrategyEditor({
  initial,
}: {
  initial?: Strategy;
}): React.JSX.Element {
  const router = useRouter();
  const create = useCreateStrategy();
  const update = useUpdateStrategy();
  const remove = useRemoveStrategy();
  const { data: figures } = useStrategyData();

  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [icon, setIcon] = useState<StrategyIcon>(initial?.icon ?? 'target');
  const [tone, setTone] = useState<StrategyTone>(initial?.tone ?? 'accent');
  const [assets, setAssets] = useState<AssetClass[]>(
    initial?.assetClasses ?? [],
  );
  const [groups, setGroups] = useState<GroupDraft[]>(() =>
    initial
      ? initial.groups.map((g) => ({
          key: nextKey(),
          id: g.id,
          title: g.title,
          rules: g.rules.map((r) => ({
            key: nextKey(),
            id: r.id,
            text: r.text,
            showWhen: r.showWhen,
          })),
        }))
      : DEFAULT_GROUPS.map((title) => ({ key: nextKey(), title, rules: [] })),
  );
  const [items, setItems] = useState<ItemDraft[]>(() =>
    (initial?.checklist ?? []).map((text) => ({ key: nextKey(), text })),
  );
  const [errors, setErrors] = useState<{ name?: string; groups?: string }>({});
  const [saveFailed, setSaveFailed] = useState(false);
  const [removingGroup, setRemovingGroup] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const groupRefs = useRef(new Map<number, HTMLInputElement>());
  const pending = create.isPending || update.isPending;

  const patchGroup = (key: number, f: (g: GroupDraft) => GroupDraft) =>
    setGroups((gs) => gs.map((g) => (g.key === key ? f(g) : g)));
  const patchRule = (
    gKey: number,
    rKey: number,
    f: (r: RuleDraft) => RuleDraft,
  ) =>
    patchGroup(gKey, (g) => ({
      ...g,
      rules: g.rules.map((r) => (r.key === rKey ? f(r) : r)),
    }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaveFailed(false);
    const next: typeof errors = {};
    if (name.trim() === '') next.name = 'Give the strategy a name.';
    const unnamed = groups.find((g) => g.title.trim() === '');
    if (unnamed) next.groups = 'Name every group, or remove the empty one.';
    setErrors(next);
    if (next.name) return void nameRef.current?.focus();
    if (unnamed) return void groupRefs.current.get(unnamed.key)?.focus();

    const input: NewStrategy = {
      name: name.trim(),
      description: description.trim(),
      assetClasses: ASSET_ORDER.filter((a) => assets.includes(a)),
      groups: groups.map((g) => ({
        ...(g.id ? { id: g.id } : {}),
        title: g.title.trim(),
        rules: g.rules
          .filter((r) => r.text.trim() !== '')
          .map((r) => ({
            ...(r.id ? { id: r.id } : {}),
            text: r.text.trim(),
            showWhen: r.showWhen,
          })),
      })),
      checklist: items.map((i) => i.text.trim()).filter(Boolean),
      status: initial?.status ?? 'active',
      icon,
      tone,
    };
    try {
      const saved = initial
        ? await update.mutateAsync({ id: initial.id, patch: input })
        : await create.mutateAsync(input);
      router.push(`/app/strategies/${encodeURIComponent(saved.id)}`);
    } catch {
      setSaveFailed(true);
    }
  };

  const removing =
    removingGroup === null
      ? undefined
      : groups.find((g) => g.key === removingGroup);
  const removingRules = removing?.rules.length ?? 0;
  const tradeCount = initial
    ? (figures?.figures.get(initial.id)?.tradeCount ?? 0)
    : 0;
  const back = initial
    ? `/app/strategies/${encodeURIComponent(initial.id)}`
    : '/app/strategies';

  return (
    <div className="mx-auto flex w-full max-w-[860px] min-w-0 flex-col gap-4 px-5 pt-1 pb-8 lg:pt-0">
      <div>
        <Link href={back} className={TEXT_BTN}>
          <CaretLeft size={14} weight="bold" aria-hidden="true" />
          {initial ? 'Back to strategy' : 'Back to strategies'}
        </Link>
        <h1 className="mt-1 text-[22px] leading-7 font-semibold tracking-[-0.01em] text-text">
          {initial ? `Edit ${initial.name}` : 'New strategy'}
        </h1>
      </div>

      <form onSubmit={(e) => void submit(e)} noValidate className="contents">
        <section
          aria-labelledby="basics-h"
          className={`${CARD} px-5 pt-[18px] pb-5`}
        >
          <CardHeader
            icon={Target}
            tone="accent"
            headingId="basics-h"
            title="The strategy"
          />
          <div className="mt-4 grid gap-4">
            <Field label="Name" error={errors.name}>
              {(p) => (
                <input
                  {...p}
                  ref={nameRef}
                  value={name}
                  autoComplete="off"
                  placeholder="Opening range breakout"
                  onChange={(e) => setName(e.target.value)}
                  className={INPUT}
                />
              )}
            </Field>
            <Field label="Description">
              {(p) => (
                <textarea
                  {...p}
                  value={description}
                  rows={2}
                  placeholder="When you take it, and what you wait for."
                  onChange={(e) => setDescription(e.target.value)}
                  className={`${INPUT} h-auto min-h-[72px] py-2 leading-[1.5]`}
                />
              )}
            </Field>

            <div role="radiogroup" aria-label="Icon">
              <span className={LABEL} aria-hidden="true">
                Icon
              </span>
              <div className="flex flex-wrap gap-2">
                {STRATEGY_ICONS.map((key) => {
                  const Glyph = STRATEGY_ICON_GLYPH[key];
                  return (
                    <label
                      key={key}
                      className="relative cursor-pointer"
                      title={ICON_LABEL[key]}
                    >
                      <input
                        type="radio"
                        name="strategy-icon"
                        value={key}
                        checked={icon === key}
                        onChange={() => setIcon(key)}
                        aria-label={ICON_LABEL[key]}
                        className="peer sr-only"
                      />
                      <span className="grid size-10 place-items-center rounded-[10px] border border-line bg-surface-1 text-muted transition-colors peer-checked:border-accent peer-checked:bg-accent-soft peer-checked:text-accent-ink peer-focus-visible:outline-2 peer-focus-visible:outline-accent hover:border-faint pointer-coarse:size-11">
                        <Glyph size={20} weight="duotone" aria-hidden="true" />
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div role="radiogroup" aria-label="Colour">
              <span className={LABEL} aria-hidden="true">
                Colour
              </span>
              <div className="flex flex-wrap gap-2">
                {TONE_ORDER.map((key) => (
                  <label key={key} className="relative cursor-pointer">
                    <input
                      type="radio"
                      name="strategy-tone"
                      value={key}
                      checked={tone === key}
                      onChange={() => setTone(key)}
                      aria-label={TONE_LABEL[key]}
                      className="peer sr-only"
                    />
                    <span className="flex h-10 items-center gap-2.5 rounded-[10px] border border-line bg-surface-1 pr-3 pl-1.5 text-[13px] font-medium text-muted transition-colors peer-checked:border-accent peer-checked:text-text peer-focus-visible:outline-2 peer-focus-visible:outline-accent hover:border-faint pointer-coarse:h-11">
                      <IconTile icon={STRATEGY_ICON_GLYPH[icon]} tone={key} />
                      {TONE_LABEL[key]}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <fieldset>
              <legend className={LABEL}>Asset classes</legend>
              <div className="flex flex-wrap gap-2">
                {ASSET_ORDER.map((a) => (
                  <label key={a} className="relative cursor-pointer">
                    <input
                      type="checkbox"
                      checked={assets.includes(a)}
                      onChange={(e) =>
                        setAssets((cur) =>
                          e.target.checked
                            ? [...cur, a]
                            : cur.filter((x) => x !== a),
                        )
                      }
                      className="peer sr-only"
                    />
                    <span className="inline-flex h-9 items-center rounded-full border border-line bg-surface-1 px-3.5 text-[13.5px] font-medium text-muted transition-colors peer-checked:border-accent peer-checked:bg-accent-soft peer-checked:text-accent-ink peer-focus-visible:outline-2 peer-focus-visible:outline-accent hover:border-faint pointer-coarse:h-11">
                      {ASSET_LABEL[a]}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          </div>
        </section>

        <section
          aria-labelledby="rules-h"
          className={`${CARD} px-5 pt-[18px] pb-5`}
        >
          <CardHeader
            icon={ListChecks}
            tone="accent"
            headingId="rules-h"
            title="Rules"
          />
          <p className="mt-2 text-[13px] leading-[1.5] text-muted">
            Group rules the way you think about a trade. Each rule is graded on
            the trades its show-when fits.
            {initial ? ' Removing a rule drops its checks on your trades.' : ''}
          </p>
          <div aria-live="polite">
            {errors.groups ? (
              <p
                role="alert"
                className="mt-2 flex items-center gap-1.5 text-[13px] text-text"
              >
                <Warning size={14} aria-hidden="true" className="text-muted" />
                {errors.groups}
              </p>
            ) : null}
          </div>

          <div className="mt-4 flex flex-col gap-3">
            {groups.map((g, gi) => (
              <fieldset
                key={g.key}
                className="rounded-[12px] border border-line bg-sunken/50 p-3"
              >
                <legend className="sr-only">
                  {g.title || 'Untitled group'}
                </legend>
                <div className="flex items-center gap-1.5">
                  <input
                    aria-label="Group name"
                    ref={(el) => {
                      if (el) groupRefs.current.set(g.key, el);
                      else groupRefs.current.delete(g.key);
                    }}
                    value={g.title}
                    autoComplete="off"
                    placeholder="Group name"
                    onChange={(e) =>
                      patchGroup(g.key, (x) => ({
                        ...x,
                        title: e.target.value,
                      }))
                    }
                    className={`${INPUT} !w-auto flex-1 !font-semibold`}
                  />
                  <button
                    type="button"
                    aria-label={`Move group ${g.title || 'untitled'} up`}
                    disabled={gi === 0}
                    onClick={() => setGroups((gs) => moved(gs, gi, -1))}
                    className={ICON_BTN}
                  >
                    <ArrowUp size={16} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Move group ${g.title || 'untitled'} down`}
                    disabled={gi === groups.length - 1}
                    onClick={() => setGroups((gs) => moved(gs, gi, 1))}
                    className={ICON_BTN}
                  >
                    <ArrowDown size={16} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Remove group ${g.title || 'untitled'}`}
                    onClick={() => setRemovingGroup(g.key)}
                    className={ICON_BTN}
                  >
                    <Trash size={16} aria-hidden="true" />
                  </button>
                </div>

                <ul className="mt-2 flex flex-col gap-2">
                  {g.rules.map((r, ri) => {
                    const label = r.text.trim() || 'new rule';
                    return (
                      <li
                        key={r.key}
                        className="flex flex-wrap items-center gap-1.5"
                      >
                        <input
                          aria-label="Rule text"
                          value={r.text}
                          autoComplete="off"
                          placeholder="What the rule says"
                          onChange={(e) =>
                            patchRule(g.key, r.key, (x) => ({
                              ...x,
                              text: e.target.value,
                            }))
                          }
                          className={`${INPUT} !w-auto min-w-[200px] flex-[1_1_240px]`}
                        />
                        <select
                          aria-label="Show when"
                          value={r.showWhen}
                          onChange={(e) =>
                            patchRule(g.key, r.key, (x) => ({
                              ...x,
                              showWhen: e.target.value as RuleShowWhen,
                            }))
                          }
                          className={`${INPUT} !w-[132px] flex-none`}
                        >
                          {(Object.keys(SHOW_WHEN_LABEL) as RuleShowWhen[]).map(
                            (k) => (
                              <option key={k} value={k}>
                                {SHOW_WHEN_LABEL[k]}
                              </option>
                            ),
                          )}
                        </select>
                        <button
                          type="button"
                          aria-label={`Move ${label} up`}
                          disabled={ri === 0}
                          onClick={() =>
                            patchGroup(g.key, (x) => ({
                              ...x,
                              rules: moved(x.rules, ri, -1),
                            }))
                          }
                          className={ICON_BTN}
                        >
                          <ArrowUp size={16} aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          aria-label={`Move ${label} down`}
                          disabled={ri === g.rules.length - 1}
                          onClick={() =>
                            patchGroup(g.key, (x) => ({
                              ...x,
                              rules: moved(x.rules, ri, 1),
                            }))
                          }
                          className={ICON_BTN}
                        >
                          <ArrowDown size={16} aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          aria-label={`Remove ${label}`}
                          onClick={() =>
                            patchGroup(g.key, (x) => ({
                              ...x,
                              rules: x.rules.filter((q) => q.key !== r.key),
                            }))
                          }
                          className={ICON_BTN}
                        >
                          <Trash size={16} aria-hidden="true" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
                <button
                  type="button"
                  aria-label={`Add rule to ${g.title || 'untitled group'}`}
                  onClick={() =>
                    patchGroup(g.key, (x) => ({
                      ...x,
                      rules: [
                        ...x.rules,
                        { key: nextKey(), text: '', showWhen: 'always' },
                      ],
                    }))
                  }
                  className={`${TEXT_BTN} mt-2`}
                >
                  <Plus size={14} weight="bold" aria-hidden="true" />
                  Add rule
                </button>
              </fieldset>
            ))}
          </div>
          <button
            type="button"
            onClick={() =>
              setGroups((gs) => [
                ...gs,
                { key: nextKey(), title: '', rules: [] },
              ])
            }
            className={`${TEXT_BTN} mt-3`}
          >
            <Plus size={14} weight="bold" aria-hidden="true" />
            Add group
          </button>
        </section>

        <section
          aria-labelledby="checklist-h"
          className={`${CARD} px-5 pt-[18px] pb-5`}
        >
          <CardHeader
            icon={CheckSquare}
            tone="accent"
            headingId="checklist-h"
            title="Checklist"
          />
          <p className="mt-2 text-[13px] leading-[1.5] text-muted">
            Ticked before each entry. Each item is its own yes or no on the
            trade.
          </p>
          <ul className="mt-3 flex flex-col gap-2">
            {items.map((it, i) => (
              <li key={it.key} className="flex items-center gap-1.5">
                <input
                  aria-label="Checklist item"
                  value={it.text}
                  autoComplete="off"
                  onChange={(e) =>
                    setItems((xs) =>
                      xs.map((x) =>
                        x.key === it.key ? { ...x, text: e.target.value } : x,
                      ),
                    )
                  }
                  className={`${INPUT} !w-auto flex-1`}
                />
                <button
                  type="button"
                  aria-label={`Move ${it.text.trim() || 'new item'} up`}
                  disabled={i === 0}
                  onClick={() => setItems((xs) => moved(xs, i, -1))}
                  className={ICON_BTN}
                >
                  <ArrowUp size={16} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  aria-label={`Move ${it.text.trim() || 'new item'} down`}
                  disabled={i === items.length - 1}
                  onClick={() => setItems((xs) => moved(xs, i, 1))}
                  className={ICON_BTN}
                >
                  <ArrowDown size={16} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  aria-label={`Remove ${it.text.trim() || 'new item'}`}
                  onClick={() =>
                    setItems((xs) => xs.filter((x) => x.key !== it.key))
                  }
                  className={ICON_BTN}
                >
                  <Trash size={16} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() =>
              setItems((xs) => [...xs, { key: nextKey(), text: '' }])
            }
            className={`${TEXT_BTN} mt-2`}
          >
            <Plus size={14} weight="bold" aria-hidden="true" />
            Add checklist item
          </button>
        </section>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={pending}>
            {initial ? 'Save strategy' : 'Create strategy'}
          </Button>
          <Link href={back} className={buttonClasses('secondary')}>
            Cancel
          </Link>
          <div aria-live="polite">
            {saveFailed ? (
              <p
                role="alert"
                className="flex items-center gap-1.5 text-[13px] text-text"
              >
                <Warning size={14} aria-hidden="true" className="text-muted" />
                The strategy could not be saved. Try again.
              </p>
            ) : null}
          </div>
          {initial ? (
            <button
              type="button"
              onClick={() => setDeleting(true)}
              className={`${TEXT_BTN} ml-auto !text-loss hover:!opacity-80`}
            >
              <Trash size={14} aria-hidden="true" />
              Delete strategy
            </button>
          ) : null}
        </div>
      </form>

      <ConfirmDialog
        open={removing !== undefined}
        title={`Remove ${removing?.title.trim() || 'this group'}?`}
        body={
          removingRules > 0
            ? `Its ${removingRules} ${plural(removingRules, 'rule goes', 'rules go')} with it.${initial ? ' Trades lose their checks on them once you save.' : ''}`
            : 'The group is empty.'
        }
        confirmLabel="Remove group"
        danger
        onConfirm={async () => {
          setGroups((gs) => gs.filter((g) => g.key !== removingGroup));
        }}
        onClose={() => setRemovingGroup(null)}
      />
      {initial ? (
        <ConfirmDialog
          open={deleting}
          title={`Delete ${initial.name}?`}
          body={deleteBody(tradeCount)}
          confirmLabel="Delete"
          danger
          onConfirm={async () => {
            await remove.mutateAsync(initial.id);
            router.push('/app/strategies');
          }}
          onClose={() => setDeleting(false)}
        />
      ) : null}
    </div>
  );
}

/** Create (no id) or edit a strategy; the editor fills in once the strategy has loaded. */
export function StrategyForm({
  strategyId,
}: {
  strategyId?: string;
}): React.JSX.Element {
  const found = useStrategy(strategyId ?? '');
  if (strategyId === undefined) return <StrategyEditor />;
  if (found.isPending)
    return <StrategySkeleton label="Loading the strategy" rows={2} />;
  if (!found.data) return <NoStrategy />;
  return <StrategyEditor initial={found.data} />;
}
