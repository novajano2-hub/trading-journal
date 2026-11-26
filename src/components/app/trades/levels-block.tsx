'use client';

import { Plus, X } from '@phosphor-icons/react/dist/ssr';
import { useId, useState } from 'react';
import { MenuSelect } from '@/components/ui/menu-select';
import { toCents } from '@/domain/money';
import {
  levelPrice,
  levelProblems,
  levelValueAt,
  unitsFor,
  type LevelProblem,
  type LevelRole,
  type LevelSides,
} from '@/domain/risk';
import type { Level, LevelSide, LevelUnit, Trade } from '@/domain/types';
import { useDisplay } from '@/lib/display';
import { formatQty, plural, price } from '@/lib/format';
import { SizeHelper } from './size-helper';

/** What a quantity of this trade is called: contracts, shares or units. */
export function noun(t: Trade, n: number): string {
  const c = t.instrument.assetClass;
  const one =
    c === 'future' || c === 'option'
      ? 'contract'
      : c === 'stock'
        ? 'share'
        : 'unit';
  return plural(n, one);
}

export const UNIT_LABEL: Record<LevelUnit, string> = {
  price: 'Price',
  movement: 'Price movement',
  ticks: 'Ticks',
  points: 'Points',
  amount: 'Amount',
  pips: 'Pips',
};
export const UNIT_SUFFIX: Partial<Record<LevelUnit, string>> = {
  ticks: 'ticks',
  points: 'points',
  pips: 'pips',
};
/** The unit select's look: the comp's 30px control beside a level block's heading. */
export const UNIT_TRIGGER =
  'inline-flex h-[30px] cursor-pointer items-center gap-1.5 rounded-[8px] border border-line-2 bg-surface-1 pr-2 pl-2.5 text-[13px] font-semibold whitespace-nowrap text-text shadow-[0_1px_1px_rgb(18_22_51/0.04)] outline-offset-2 transition-[border-color] duration-200 ease-(--ease-glide) hover:border-faint focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-default disabled:opacity-60 pointer-coarse:h-11';

const WORDS = {
  target: { many: 'Targets', one: 'Target', lower: 'target' },
  stop: { many: 'Stops', one: 'Stop', lower: 'stop' },
} as const;

export const FIELD =
  'flex h-9 min-w-0 items-center rounded-[8px] border border-line-2 bg-surface-1 pr-1 pl-2.5 text-[14px] font-[550] text-text tabular-nums shadow-[0_1px_1px_rgb(18_22_51/0.04)] transition-[border-color] duration-200 ease-(--ease-glide) hover:border-faint focus-within:border-accent focus-within:outline-2 focus-within:outline-accent/25 has-[input[aria-invalid=true]]:border-loss max-sm:h-10 pointer-coarse:h-11';
export const BARE_INPUT =
  'h-full min-w-0 flex-1 bg-transparent text-[14px] font-[550] tabular-nums outline-none! placeholder:text-faint read-only:text-muted disabled:cursor-not-allowed disabled:opacity-60';

/** A number typed in a field, or null for nothing or for something that is not one. */
export function parseNumber(text: string): number | null {
  const raw = text.replace(/[,\s]/g, '');
  if (raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export const plain = (n: number) =>
  n.toLocaleString('en-US', { maximumFractionDigits: 6, useGrouping: false });

const sidesOfRole = (role: LevelRole, side?: LevelSide): LevelSides =>
  side ? (role === 'target' ? { targets: side } : { stops: side }) : {};

/** The words under a level that cannot stand, from what `levelProblems` found. */
function problemText(
  trade: Trade,
  role: LevelRole,
  problem: LevelProblem,
  side: LevelSide,
): string {
  const words = WORDS[role];
  if (problem.kind === 'wrong-side') {
    const below = (trade.direction === 'long') === (role === 'stop');
    return `A ${words.lower} on a ${trade.direction} goes ${below ? 'below' : 'above'} the average entry, ${price(trade.avgEntry, trade.instrument.tickSize)}.`;
  }
  const covered = side.levels.reduce((n, l) => n + l.qty, 0);
  return `${words.many} cover ${formatQty(covered)} ${noun(trade, covered)}, more than the position of ${formatQty(trade.maxPosition)}.`;
}

interface RowError {
  text: string;
  field: 'value' | 'qty';
}

/** One level: its value, its quantity with the size helper, and remove. Saves when a field is left. */
function LevelRow({
  trade,
  role,
  index,
  unit,
  level,
  initialQty,
  readOnly,
  masked,
  error,
  errorId,
  resetKey,
  autoFocus,
  onAttempt,
  onRemove,
  onClearError,
}: {
  trade: Trade;
  role: LevelRole;
  index: number;
  unit: LevelUnit;
  /** Absent for a new level that has no price yet. */
  level?: Level;
  initialQty: string;
  readOnly: boolean;
  /** An amount under Privacy: shown hidden, not edited. */
  masked: boolean;
  error?: RowError;
  errorId: string;
  resetKey: number;
  autoFocus: boolean;
  onAttempt(valueText: string, qtyText: string): void;
  onRemove(): void;
  onClearError(): void;
}): React.JSX.Element {
  const display = useDisplay();
  const tick = trade.instrument.tickSize;
  const shownValue = (l: Level | undefined) =>
    l === undefined
      ? ''
      : unit === 'price'
        ? price(l.value, tick)
        : plain(l.value);
  const shownQty = (l: Level | undefined) =>
    l === undefined ? initialQty : formatQty(l.qty);
  const signature = `${unit}|${level?.value}|${level?.qty}|${resetKey}`;
  const [seen, setSeen] = useState(signature);
  const [value, setValue] = useState(shownValue(level));
  const [qty, setQty] = useState(shownQty(level));
  // A level saved elsewhere, or by this row, replaces what is typed.
  if (seen !== signature) {
    setSeen(signature);
    setValue(shownValue(level));
    setQty(shownQty(level));
  }
  const name = `${WORDS[role].one} level ${index + 1}`;
  const qtyName = `${WORDS[role].one} quantity ${index + 1}`;
  const revert = () => {
    setValue(shownValue(level));
    setQty(shownQty(level));
    onClearError();
  };
  const keys = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') e.currentTarget.blur();
    if (e.key === 'Escape') revert();
  };
  const cur = trade.pnlCurrency;
  const hidden = masked
    ? display.cash(toCents(Math.abs(level?.value ?? 0)), false, cur).text
    : '';

  return (
    <div
      data-level-row
      className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_32px] items-center gap-x-2 gap-y-1.5 py-0.5 max-sm:grid-cols-[minmax(0,1fr)_44px] max-sm:py-1.5"
    >
      <div className={`${FIELD} max-sm:col-start-1 max-sm:row-start-1`}>
        <input
          type="text"
          inputMode="decimal"
          aria-label={name}
          aria-invalid={error?.field === 'value' || undefined}
          aria-describedby={error?.field === 'value' ? errorId : undefined}
          autoFocus={autoFocus}
          disabled={readOnly}
          readOnly={masked}
          title={masked ? 'Hidden by Privacy' : undefined}
          value={masked ? hidden : value}
          onChange={(e) => {
            setValue(e.target.value);
            onClearError();
          }}
          onBlur={() => {
            if (!masked) onAttempt(value, qty);
          }}
          onKeyDown={keys}
          className={BARE_INPUT}
        />
        {UNIT_SUFFIX[unit] ? (
          <small className="pr-1.5 pl-1 text-[12.5px] font-normal text-faint">
            {UNIT_SUFFIX[unit]}
          </small>
        ) : unit === 'amount' ? (
          <small className="pr-1.5 pl-1 text-[12.5px] font-normal text-faint">
            {cur}
          </small>
        ) : null}
      </div>
      <div className={`${FIELD} max-sm:col-start-1 max-sm:row-start-2`}>
        <input
          type="text"
          inputMode="decimal"
          aria-label={qtyName}
          aria-invalid={error?.field === 'qty' || undefined}
          aria-describedby={error?.field === 'qty' ? errorId : undefined}
          disabled={readOnly}
          value={qty}
          onChange={(e) => {
            setQty(e.target.value);
            onClearError();
          }}
          onBlur={() => onAttempt(value, qty)}
          onKeyDown={keys}
          className={BARE_INPUT}
        />
        <SizeHelper
          position={trade.maxPosition}
          disabled={readOnly}
          label={`Fill ${role} quantity ${index + 1} from a share of the position`}
          onPick={(picked) => {
            const text = formatQty(picked);
            setQty(text);
            onAttempt(value, text);
          }}
        />
      </div>
      <button
        type="button"
        aria-label={`Remove ${role} level ${index + 1}`}
        disabled={readOnly}
        onClick={onRemove}
        className="grid size-8 place-items-center rounded-[8px] text-faint outline-offset-2 hover:bg-sunken hover:text-text focus-visible:outline-2 focus-visible:outline-accent disabled:pointer-events-none disabled:opacity-40 max-sm:col-start-2 max-sm:row-span-2 max-sm:row-start-1 max-sm:size-11 max-sm:self-center pointer-coarse:size-11"
      >
        <X size={14} weight="bold" aria-hidden="true" />
      </button>
      {error ? (
        <p
          id={errorId}
          role="alert"
          className="col-span-full text-[12.5px] font-medium text-loss"
        >
          {error.text}
        </p>
      ) : null}
    </div>
  );
}

/**
 * One side of a trade's plan, its targets or its stops (spec §5.2): a unit,
 * level rows, Add level, and the inline error of a level that cannot stand.
 * Leaving a field, or Enter, saves through `onCommit`; a level on the wrong
 * side of the average entry, one that takes the side past the position, or one
 * with no price or no quantity is shown its error and not saved.
 */
export function LevelsBlock({
  trade,
  side: role,
  value,
  readOnly,
  onCommit,
}: {
  trade: Trade;
  side: LevelRole;
  /** The side as the trade has it, read from its levels or from the old single field. */
  value?: LevelSide;
  readOnly: boolean;
  /** The side to save; undefined once its last level is removed. */
  onCommit(next: LevelSide | undefined): void;
}): React.JSX.Element {
  const display = useDisplay();
  const baseId = useId();
  const words = WORDS[role];
  const levels = value?.levels ?? [];
  // A side with no levels has no unit of its own: the one picked is kept for its first level.
  const [kept, setKept] = useState<LevelUnit>(value?.unit ?? 'price');
  if (value && value.unit !== kept) setKept(value.unit);
  const unit = value?.unit ?? kept;
  // A new level waits here, at the place it will take, until it has a price and is saved.
  const [draft, setDraft] = useState<{ qty: string; at: number } | null>(null);
  if (draft && levels.length > draft.at) setDraft(null);
  const [refusal, setRefusal] = useState<{
    index: number;
    error: RowError;
  } | null>(null);
  const [resetKey, setResetKey] = useState(0);

  const covered = levels.reduce((n, l) => n + l.qty, 0);
  const left = Math.round((trade.maxPosition - covered) * 1e6) / 1e6;
  const masked = display.unit === 'privacy' && unit === 'amount';
  const addReason = masked
    ? 'Hidden by Privacy'
    : left <= 0
      ? `The ${words.lower} levels already cover the whole position`
      : undefined;

  const stored = levelProblems(trade, sidesOfRole(role, value));
  const storedError = (index: number): RowError | undefined => {
    const p = stored.find((x) => x.index === index);
    return p && value
      ? {
          text: problemText(trade, role, p, value),
          field: p.kind === 'wrong-side' ? 'value' : 'qty',
        }
      : undefined;
  };
  const errorOf = (index: number) =>
    refusal?.index === index ? refusal.error : storedError(index);

  const attempt = (index: number, valueText: string, qtyText: string) => {
    const isNew = index >= levels.length;
    // A new level with no price is not a level yet.
    if (isNew && valueText.trim() === '') return;
    const refuse = (text: string, field: RowError['field']) =>
      setRefusal({ index, error: { text, field } });
    const v = parseNumber(valueText);
    if (v === null || (unit === 'price' && v <= 0))
      return refuse(
        unit === 'price' ? 'Enter a price above 0.' : 'Enter a number.',
        'value',
      );
    const q = parseNumber(qtyText);
    if (q === null || q <= 0)
      return refuse('A level needs a quantity above 0.', 'qty');
    const current = levels[index];
    if (current && current.value === v && current.qty === q) {
      // Nothing changed: show the saved wording again, and drop a refusal elsewhere.
      setRefusal(null);
      setResetKey((k) => k + 1);
      return;
    }
    const next = levels.map((l) => ({ ...l }));
    if (isNew) next.push({ value: v, qty: q });
    else next[index] = { value: v, qty: q };
    const proposed: LevelSide = { unit, levels: next };
    // Only a problem this edit brings is refused; one the side already had stays to be fixed.
    const fresh = levelProblems(trade, sidesOfRole(role, proposed)).filter(
      (p) => !stored.some((s) => s.kind === p.kind && s.index === p.index),
    );
    const first = fresh[0];
    if (first)
      return refuse(
        problemText(trade, role, first, proposed),
        first.kind === 'wrong-side' ? 'value' : 'qty',
      );
    setRefusal(null);
    onCommit(proposed);
  };

  const remove = (index: number) => {
    setRefusal(null);
    if (index >= levels.length) {
      setDraft(null);
      return;
    }
    onCommit(
      levels.length === 1
        ? undefined
        : { unit, levels: levels.filter((_, i) => i !== index) },
    );
  };

  const changeUnit = (next: LevelUnit) => {
    if (next === unit) return;
    setRefusal(null);
    if (levels.length === 0) {
      setKept(next);
      return;
    }
    // Every level stays at the price it was at.
    onCommit({
      unit: next,
      levels: levels.map((l) => ({
        qty: l.qty,
        value: levelValueAt(
          trade,
          role,
          next,
          levelPrice(trade, role, unit, l),
          l.qty,
        ),
      })),
    });
  };

  const draftShown = draft !== null && levels.length <= draft.at;
  const rows: React.ReactNode[] = levels.map((level, i) => (
    <LevelRow
      key={i}
      trade={trade}
      role={role}
      index={i}
      unit={unit}
      level={level}
      initialQty=""
      readOnly={readOnly}
      masked={masked}
      error={errorOf(i)}
      errorId={`${baseId}-${i}`}
      resetKey={resetKey}
      autoFocus={false}
      onAttempt={(v, q) => attempt(i, v, q)}
      onRemove={() => remove(i)}
      onClearError={() => setRefusal((r) => (r?.index === i ? null : r))}
    />
  ));
  if (draft && draftShown)
    rows.push(
      <LevelRow
        key={levels.length}
        trade={trade}
        role={role}
        index={levels.length}
        unit={unit}
        initialQty={draft.qty}
        readOnly={readOnly}
        masked={false}
        error={errorOf(levels.length)}
        errorId={`${baseId}-${levels.length}`}
        resetKey={resetKey}
        autoFocus
        onAttempt={(v, q) => attempt(levels.length, v, q)}
        onRemove={() => remove(levels.length)}
        onClearError={() =>
          setRefusal((r) => (r?.index === levels.length ? null : r))
        }
      />,
    );

  return (
    <div
      role="group"
      aria-label={words.many}
      className="grid grid-cols-[128px_minmax(0,1fr)] gap-x-[18px] max-sm:grid-cols-1"
    >
      <div className="flex flex-col items-start gap-0.5 pt-1 max-sm:flex-row max-sm:items-center max-sm:gap-2 max-sm:pt-0">
        <b className="text-[13.5px] leading-[30px] font-semibold">
          {words.many}
        </b>
        <MenuSelect
          label={`${words.many} unit`}
          value={unit}
          disabled={readOnly}
          onChange={(next) => changeUnit(next as LevelUnit)}
          options={unitsFor(trade.instrument).map((u) => ({
            value: u,
            label: UNIT_LABEL[u],
          }))}
          triggerClassName={UNIT_TRIGGER}
        />
        <button
          type="button"
          disabled={readOnly || draftShown || addReason !== undefined}
          title={addReason}
          onClick={() =>
            setDraft({
              qty: formatQty(Math.max(0, left)),
              at: levels.length,
            })
          }
          className="-ml-2 inline-flex h-[30px] items-center gap-1.5 rounded-[8px] px-2 text-[13px] font-semibold text-accent-ink outline-offset-2 hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:text-faint disabled:hover:bg-transparent max-sm:ml-auto pointer-coarse:h-11"
        >
          <Plus size={14} weight="bold" aria-hidden="true" />
          Add level
        </button>
      </div>
      <div className="min-w-0">
        {rows.length > 0 ? (
          rows
        ) : (
          <p className="py-2 text-[13px] text-muted max-sm:pt-0">
            No {words.lower} levels yet.
          </p>
        )}
        {masked ? (
          <p className="pt-1 text-xs text-faint">
            Amounts are hidden by Privacy. Turn it off to edit them.
          </p>
        ) : null}
      </div>
    </div>
  );
}
