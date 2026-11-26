'use client';

import { CaretDown, Check, Plus, X } from '@phosphor-icons/react/dist/ssr';
import { DropdownMenu } from 'radix-ui';
import {
  Fragment,
  useId,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import { FigureText } from '@/components/product/figure-text';
import { Button } from '@/components/ui/button';
import { MenuSelect } from '@/components/ui/menu-select';
import { toCents } from '@/domain/money';
import { unitsForRule, type RuleAsset } from '@/domain/rules/target-rules';
import type { FeeRule, LevelUnit, RuleLevel, TargetRule } from '@/domain/types';
import type { Display } from '@/lib/display';
import { plural } from '@/lib/format';
import {
  BARE_INPUT,
  FIELD,
  parseNumber,
  plain,
  UNIT_LABEL,
  UNIT_SUFFIX,
  UNIT_TRIGGER,
} from '../trades/levels-block';

/** One side of a target rule: a unit and its levels, each a value and a share of the position. */
export type RuleSide = NonNullable<TargetRule['target']>;

/** The instruments a rule can be for, in the order the comp lists them. */
export const INSTRUMENTS: readonly { value: RuleAsset; label: string }[] = [
  { value: 'stock', label: 'Stock' },
  { value: 'option', label: 'Option' },
  { value: 'future-option', label: 'Future option' },
  { value: 'future', label: 'Future' },
  { value: 'forex', label: 'Forex' },
  { value: 'crypto', label: 'Crypto' },
  { value: 'cfd', label: 'CFD' },
];

export const instrumentLabel = (asset: RuleAsset): string =>
  INSTRUMENTS.find((i) => i.value === asset)?.label ?? asset;

/** The instrument as an adjective for a count: "412 futures trades", "every futures symbol". */
const KIND_WORD: Record<RuleAsset, string> = {
  stock: 'stock',
  option: 'option',
  'future-option': 'future option',
  future: 'futures',
  forex: 'forex',
  crypto: 'crypto',
  cfd: 'CFD',
};
export const kindWord = (asset: RuleAsset): string => KIND_WORD[asset];

/** "ES", "ES and MES", "ES, MES and NQ". */
export function listWords(items: readonly string[]): string {
  return items.length < 2
    ? items.join('')
    : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;
}

/** The symbol of a currency, so a field can lead with it ("$", "€"). */
export function currencySymbol(currency: string): string {
  try {
    return (
      new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency,
        currencyDisplay: 'narrowSymbol',
      })
        .formatToParts(0)
        .find((p) => p.type === 'currency')?.value ?? currency
    );
  } catch {
    return currency;
  }
}

/* ------------------------------------------------------------------ */
/* How a rule reads in the cards and in the apply dialog.              */
/* ------------------------------------------------------------------ */

const UNIT_WORD: Partial<Record<LevelUnit, readonly [string, string]>> = {
  ticks: ['tick', 'ticks'],
  points: ['point', 'points'],
  pips: ['pip', 'pips'],
};

/** One level's value in words: "8 points", "5.5 from entry", "$300.00"; a price is a bare number. */
function valueNode(
  unit: LevelUnit,
  value: number,
  currency: string,
  display: Display,
): ReactNode {
  if (unit === 'price') return plain(value);
  if (unit === 'movement') return `${plain(value)} from entry`;
  if (unit === 'amount')
    return (
      <FigureText f={display.cash(toCents(Math.abs(value)), false, currency)} />
    );
  const [one, many] = UNIT_WORD[unit] ?? [unit, unit];
  return `${plain(value)} ${plural(value, one, many)}`;
}

/**
 * One side of a rule as words. Full: "Targets 8 points (50%), 16 points
 * (50%)". Compact, for a phone: "Targets 8 and 16 points, 50% each". Plain, for
 * a sentence: "Targets 8 and 16 points".
 */
export function SideWords({
  role,
  side,
  currency,
  display,
  form = 'full',
  lowerCase = false,
}: {
  role: 'target' | 'stop';
  side: RuleSide;
  currency: string;
  display: Display;
  form?: 'full' | 'compact' | 'plain';
  /** "stop 6 points" inside a sentence. */
  lowerCase?: boolean;
}): React.JSX.Element {
  const many = side.levels.length > 1;
  const noun = role === 'target' ? 'Target' : 'Stop';
  const head = `${many ? `${noun}s` : noun}`;
  const lead = lowerCase ? head.toLowerCase() : head;
  const at = side.unit === 'price' ? 'at ' : '';
  if (form === 'full')
    return (
      <>
        {lead} {at}
        {side.levels.map((l, i) => (
          <Fragment key={i}>
            {i > 0 ? ', ' : ''}
            {valueNode(side.unit, l.value, currency, display)} ({plain(l.pct)}%)
          </Fragment>
        ))}
      </>
    );
  // Compact: the values joined, the unit said once, the shares after.
  const word = UNIT_WORD[side.unit];
  const last = side.levels.at(-1);
  const shares = side.levels.map((l) => plain(l.pct));
  const same = shares.every((s) => s === shares[0]);
  return (
    <>
      {lead} {at}
      {side.levels.map((l, i) => (
        <Fragment key={i}>
          {i === 0 ? '' : i === side.levels.length - 1 ? ' and ' : ', '}
          {side.unit === 'amount' || side.unit === 'price'
            ? valueNode(side.unit, l.value, currency, display)
            : plain(l.value)}
        </Fragment>
      ))}
      {word && last ? ` ${word[many || last.value !== 1 ? 1 : 0]}` : ''}
      {side.unit === 'movement' ? ' from entry' : ''}
      {form === 'plain'
        ? ''
        : `, ${
            many && same
              ? `${shares[0]}% each`
              : shares.map((s) => `${s}%`).join(many ? ' and ' : '')
          }`}
    </>
  );
}

const MODE_WORD: Record<FeeRule['mode'], string> = {
  'per-contract': 'Per contract',
  'per-execution': 'Per execution',
};
const ON_WORD: Record<FeeRule['applyOn'], string> = {
  all: 'every execution',
  entry: 'entries',
  exit: 'exits',
};

/** "$1.29 commission, $1.38 fee", the amounts through Display. */
export function CostWords({
  rule,
  currency,
  display,
}: {
  rule: Pick<FeeRule, 'commission' | 'fee'>;
  currency: string;
  display: Display;
}): React.JSX.Element {
  return (
    <>
      <FigureText f={display.cash(rule.commission, false, currency)} />{' '}
      commission, <FigureText f={display.cash(rule.fee, false, currency)} /> fee
    </>
  );
}

/** "Per contract, on every execution". */
export const feeHow = (rule: Pick<FeeRule, 'mode' | 'applyOn'>): string =>
  `${MODE_WORD[rule.mode]}, on ${ON_WORD[rule.applyOn]}`;

/* ------------------------------------------------------------------ */
/* Fields.                                                             */
/* ------------------------------------------------------------------ */

/** The dialog's 40px field: the comp's `inp`. */
export const FIELD_BOX =
  'flex h-10 w-full min-w-0 items-center gap-2 rounded-[10px] border border-line-2 bg-surface-1 px-3 text-[14px] text-text shadow-[0_1px_1px_rgb(18_22_51/0.04)] transition-[border-color] duration-200 ease-(--ease-glide) hover:border-faint focus-within:border-accent focus-within:outline-2 focus-within:outline-accent/25 has-[input[aria-invalid=true]]:border-loss pointer-coarse:h-11';

export const FIELD_LABEL = 'mb-1.5 block text-[13.5px] font-medium text-text';
export const FIELD_HINT = 'mt-1.5 text-[12.5px] leading-[1.45] text-muted';

/** A labelled field: the words above, whatever the control is below. */
export function Field({
  label,
  id,
  className = '',
  children,
}: {
  label: string;
  /** The control's id, for a text input; a select or a group names itself. */
  id?: string;
  className?: string;
  children: ReactNode;
}): React.JSX.Element {
  return (
    <div className={className}>
      {id ? (
        <label htmlFor={id} className={FIELD_LABEL}>
          {label}
        </label>
      ) : (
        <span className={FIELD_LABEL}>{label}</span>
      )}
      {children}
    </div>
  );
}

const SELECT_ITEM =
  'relative flex min-h-9 cursor-pointer items-center rounded-[8px] py-1.5 pr-9 pl-3 text-[14px] text-text select-none data-highlighted:bg-sunken data-disabled:cursor-default data-disabled:text-faint pointer-coarse:min-h-11';

/**
 * A full-width choice from a short list, as the comp's field with its caret
 * and a list the width of the field. A Radix menu, so the arrows, typing,
 * Enter and Escape work; the button is named by its label and the choice.
 */
export function FieldSelect({
  label,
  value,
  placeholder,
  options,
  onChange,
  disabled = false,
  empty,
}: {
  label: string;
  value: string;
  placeholder: string;
  options: readonly { value: string; label: string }[];
  onChange(value: string): void;
  disabled?: boolean;
  /** Said in the field when there is nothing to choose from. */
  empty?: string;
}): React.JSX.Element {
  const current = options.find((o) => o.value === value);
  const shown = options.length === 0 && empty ? empty : placeholder;
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        disabled={disabled || options.length === 0}
        aria-label={`${label}, ${current?.label ?? shown}`}
        className={`${FIELD_BOX} cursor-pointer justify-between text-left outline-offset-0 focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-accent/25 data-[state=open]:border-accent data-[state=open]:outline-2 data-[state=open]:outline-accent/25 disabled:cursor-default disabled:opacity-60`}
      >
        <span className={`min-w-0 truncate ${current ? '' : 'text-faint'}`}>
          {current?.label ?? shown}
        </span>
        <CaretDown
          size={14}
          weight="bold"
          aria-hidden="true"
          className="flex-none text-faint"
        />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          sideOffset={4}
          collisionPadding={12}
          aria-label={label}
          className="z-[60] max-h-(--radix-dropdown-menu-content-available-height) w-(--radix-dropdown-menu-trigger-width) origin-(--radix-dropdown-menu-content-transform-origin) overflow-y-auto rounded-[12px] border border-line bg-surface-1 p-1.5 text-text shadow-[var(--shadow)] outline-none motion-safe:data-[state=closed]:animate-tip-out motion-safe:data-[state=open]:animate-pop-in"
        >
          <DropdownMenu.RadioGroup value={value} onValueChange={onChange}>
            {options.map((o) => (
              <DropdownMenu.RadioItem
                key={o.value}
                value={o.value}
                className={SELECT_ITEM}
              >
                {o.label}
                <DropdownMenu.ItemIndicator className="absolute right-3 inline-flex">
                  <Check
                    size={16}
                    aria-hidden="true"
                    className="text-accent-ink"
                  />
                </DropdownMenu.ItemIndicator>
              </DropdownMenu.RadioItem>
            ))}
          </DropdownMenu.RadioGroup>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

/** A switch with the Settings page's look; on a coarse pointer its hit area is 44px tall (the 28px track plus 8px above and below). */
export function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange(next: boolean): void;
  label: string;
}): React.JSX.Element {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-10 flex-none rounded-full transition-colors duration-200 outline-offset-2 focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:h-7 pointer-coarse:w-12 pointer-coarse:before:absolute pointer-coarse:before:inset-x-0 pointer-coarse:before:-inset-y-2 pointer-coarse:before:content-[''] ${checked ? 'bg-accent' : 'bg-line-2'}`}
    >
      <span
        aria-hidden="true"
        className={`absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow-[var(--shadow-chip)] transition-transform duration-200 pointer-coarse:size-6 ${checked ? 'translate-x-4 pointer-coarse:translate-x-5' : ''}`}
      />
    </button>
  );
}

const normalise = (raw: string): string[] =>
  raw
    .split(/[\s,;]+/)
    .map((s) => s.trim().toUpperCase())
    .filter((s) => s !== '');

/**
 * Symbols as removable chips in one field: a comma, a space or Enter turns
 * the typed text into chips (upper case, each once), leaving the field does
 * the same, Backspace on an empty field takes the last one off. `suggestions`
 * are the symbols the account has traded, offered as the user types.
 */
export function SymbolsInput({
  symbols,
  onChange,
  suggestions = [],
  label = 'Symbols',
  id,
}: {
  symbols: readonly string[];
  onChange(next: string[]): void;
  suggestions?: readonly string[];
  label?: string;
  id: string;
}): React.JSX.Element {
  const [text, setText] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const listId = `${id}-list`;
  const commit = (raw: string) => {
    const add = normalise(raw).filter(
      (s, i, all) => !symbols.includes(s) && all.indexOf(s) === i,
    );
    if (add.length > 0) onChange([...symbols, ...add]);
  };
  return (
    <div
      // A click on the field's own space is a click on its text box.
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) {
          e.preventDefault();
          input.current?.focus();
        }
      }}
      className="flex min-h-10 w-full cursor-text flex-wrap items-center gap-1.5 rounded-[10px] border border-line-2 bg-surface-1 px-2 py-1 shadow-[0_1px_1px_rgb(18_22_51/0.04)] transition-[border-color] duration-200 ease-(--ease-glide) focus-within:border-accent focus-within:outline-2 focus-within:outline-accent/25 hover:border-faint pointer-coarse:min-h-11"
    >
      {symbols.map((s) => (
        <button
          key={s}
          type="button"
          aria-label={`Remove ${s}`}
          onClick={() => onChange(symbols.filter((x) => x !== s))}
          className="inline-flex h-[26px] items-center gap-1 rounded-full bg-sunken pr-1.5 pl-2.5 text-[12.5px] font-[550] text-text outline-offset-2 hover:bg-line focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:h-11 pointer-coarse:px-3.5"
        >
          {s}
          <X
            size={11}
            weight="bold"
            aria-hidden="true"
            className="text-muted"
          />
        </button>
      ))}
      <input
        ref={input}
        id={id}
        aria-label={label}
        list={suggestions.length > 0 ? listId : undefined}
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        placeholder="Add a symbol"
        value={text}
        onChange={(e) => {
          const next = e.target.value;
          // A separator ends a symbol.
          if (/[\s,;]$/.test(next)) {
            commit(next);
            setText('');
          } else setText(next);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            // Enter adds the symbol; it does not submit the dialog.
            e.preventDefault();
            commit(text);
            setText('');
          } else if (e.key === 'Backspace' && text === '' && symbols.length) {
            onChange(symbols.slice(0, -1));
          }
        }}
        onBlur={() => {
          commit(text);
          setText('');
        }}
        className="h-7 min-w-24 flex-1 bg-transparent px-1 text-[13.5px] text-text outline-none! placeholder:text-faint pointer-coarse:h-9"
      />
      {suggestions.length > 0 ? (
        <datalist id={listId}>
          {suggestions
            .filter((s) => !symbols.includes(s))
            .map((s) => (
              <option key={s} value={s} />
            ))}
        </datalist>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Level rows of a rule.                                               */
/* ------------------------------------------------------------------ */

export interface DraftRow {
  /** Stable for the row's life, so removing one does not move another's text. */
  key: number;
  value: string;
  /** A share of the position, as typed. */
  pct: string;
}
export interface DraftSide {
  unit: LevelUnit;
  rows: DraftRow[];
}
export interface RowError {
  field: 'value' | 'pct';
  text: string;
}

let rowKey = 0;
export const newRow = (value = '', pct = '100'): DraftRow => ({
  key: (rowKey += 1),
  value,
  pct,
});
/** A side as the dialog opens it: price, one level, not set, at 100%. */
export const blankSide = (): DraftSide => ({
  unit: 'price',
  rows: [newRow()],
});
/** A stored side as rows of text; a rule without the side opens it blank. */
export function draftOf(side: RuleSide | undefined): DraftSide {
  return side
    ? {
        unit: side.unit,
        rows: side.levels.map((l) => newRow(plain(l.value), plain(l.pct))),
      }
    : blankSide();
}

/**
 * What a draft side comes to: the levels whose value is filled in (a row left
 * not set is skipped), and the error of each one that cannot be kept.
 */
export function readSide(draft: DraftSide): {
  side: RuleSide | undefined;
  errors: Record<number, RowError>;
} {
  const levels: RuleLevel[] = [];
  const errors: Record<number, RowError> = {};
  for (const row of draft.rows) {
    if (row.value.trim() === '') continue;
    const value = parseNumber(row.value);
    if (value === null || (draft.unit === 'price' && value <= 0)) {
      errors[row.key] = {
        field: 'value',
        text:
          draft.unit === 'price' ? 'Enter a price above 0.' : 'Enter a number.',
      };
      continue;
    }
    const pct = parseNumber(row.pct);
    if (pct === null || pct <= 0 || pct > 100) {
      errors[row.key] = {
        field: 'pct',
        text: 'Enter a share above 0 and up to 100.',
      };
      continue;
    }
    levels.push({ value, pct });
  }
  return {
    side: levels.length > 0 ? { unit: draft.unit, levels } : undefined,
    errors,
  };
}

const WORDS = {
  target: { many: 'Targets', one: 'Target' },
  stop: { many: 'Stops', one: 'Stop' },
} as const;

/** The comp's "Share" field: its number, the % after it. */
function RuleLevelRow({
  role,
  index,
  unit,
  row,
  currency,
  masked,
  hidden,
  error,
  errorId,
  autoFocus,
  onChange,
  onRemove,
}: {
  role: 'target' | 'stop';
  index: number;
  unit: LevelUnit;
  row: DraftRow;
  currency: string;
  masked: boolean;
  /** An amount under Privacy, as it reads. */
  hidden: string;
  error?: RowError;
  errorId: string;
  autoFocus: boolean;
  onChange(next: DraftRow): void;
  onRemove(): void;
}): React.JSX.Element {
  const one = WORDS[role].one;
  const suffix = UNIT_SUFFIX[unit] ?? (unit === 'amount' ? currency : null);
  return (
    <div
      data-level-row
      className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_32px] items-center gap-x-2 gap-y-1.5 max-sm:grid-cols-[minmax(0,1fr)_44px] max-sm:py-0.5"
    >
      <div className={`${FIELD} max-sm:col-start-1 max-sm:row-start-1`}>
        <input
          type="text"
          inputMode="decimal"
          aria-label={`${one} level ${index + 1}`}
          data-field={`${role}-${row.key}-value`}
          aria-invalid={error?.field === 'value' || undefined}
          aria-describedby={error?.field === 'value' ? errorId : undefined}
          autoFocus={autoFocus}
          autoComplete="off"
          readOnly={masked}
          placeholder="Not set"
          title={masked ? 'Hidden by Privacy' : undefined}
          value={masked && row.value.trim() !== '' ? hidden : row.value}
          onChange={(e) => onChange({ ...row, value: e.target.value })}
          className={BARE_INPUT}
        />
        {suffix ? (
          <small className="pr-1.5 pl-1 text-[12.5px] font-normal text-faint">
            {suffix}
          </small>
        ) : null}
      </div>
      <div className={`${FIELD} max-sm:col-start-1 max-sm:row-start-2`}>
        <input
          type="text"
          inputMode="decimal"
          aria-label={`${one} share ${index + 1}`}
          data-field={`${role}-${row.key}-pct`}
          aria-invalid={error?.field === 'pct' || undefined}
          aria-describedby={error?.field === 'pct' ? errorId : undefined}
          autoComplete="off"
          value={row.pct}
          onChange={(e) => onChange({ ...row, pct: e.target.value })}
          className={BARE_INPUT}
        />
        <small className="pr-1.5 pl-1 text-[12.5px] font-normal text-faint">
          %
        </small>
      </div>
      <button
        type="button"
        aria-label={`Remove ${role} level ${index + 1}`}
        onClick={onRemove}
        className="grid size-8 place-items-center rounded-[8px] text-faint outline-offset-2 hover:bg-sunken hover:text-text focus-visible:outline-2 focus-visible:outline-accent max-sm:col-start-2 max-sm:row-span-2 max-sm:row-start-1 max-sm:size-11 max-sm:self-center pointer-coarse:size-11"
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
 * One side of a rule, as the comp's bordered box: its name and unit, the
 * Level and Share headings, a row per level, Add level. The unit select waits
 * for an instrument (`asset`), then lists what that instrument has.
 */
export function RuleLevelsBox({
  role,
  draft,
  asset,
  currency,
  masked,
  display,
  errors,
  onChange,
}: {
  role: 'target' | 'stop';
  draft: DraftSide;
  /** Empty until the user has chosen the instrument. */
  asset: RuleAsset | '';
  currency: string;
  /** Amounts hidden by Privacy: an amount level is shown hidden and not edited. */
  masked: boolean;
  display: Display;
  /** What is wrong, by row; absent until the user has tried to save. */
  errors: Record<number, RowError> | null;
  onChange(next: DraftSide): void;
}): React.JSX.Element {
  const baseId = useId();
  const words = WORDS[role];
  const [added, setAdded] = useState<number | null>(null);
  const hideAmounts = masked && draft.unit === 'amount';
  const units = asset === '' ? [] : unitsForRule(asset);

  return (
    <div
      role="group"
      aria-label={words.many}
      className="min-w-0 rounded-[10px] border border-line px-3 pt-2.5 pb-1.5"
    >
      <div className="mb-1 flex items-center gap-2">
        <b className="min-w-0 flex-1 text-[13.5px] font-semibold">
          {words.many}
        </b>
        {asset === '' ? (
          <button
            type="button"
            aria-disabled="true"
            aria-label={`${words.many} unit, pick an instrument first`}
            title="Pick an instrument first"
            className={`${UNIT_TRIGGER} cursor-default! text-faint hover:border-line-2!`}
          >
            Unit
            <CaretDown
              size={11}
              weight="bold"
              aria-hidden="true"
              className="flex-none text-faint"
            />
          </button>
        ) : (
          <MenuSelect
            label={`${words.many} unit`}
            value={draft.unit}
            align="end"
            onChange={(next) => onChange({ ...draft, unit: next as LevelUnit })}
            options={units.map((u) => ({ value: u, label: UNIT_LABEL[u] }))}
            triggerClassName={UNIT_TRIGGER}
          />
        )}
      </div>
      <div
        aria-hidden="true"
        className="grid min-h-[30px] grid-cols-[minmax(0,1fr)_minmax(0,1fr)_32px] items-center gap-x-2 text-[12px] font-medium text-faint max-sm:hidden"
      >
        <span>Level</span>
        <span>Share</span>
      </div>
      <div className="flex flex-col gap-1.5">
        {draft.rows.map((row, i) => (
          <RuleLevelRow
            key={row.key}
            role={role}
            index={i}
            unit={draft.unit}
            row={row}
            currency={currency}
            masked={hideAmounts}
            hidden={
              display.cash(
                toCents(Math.abs(parseNumber(row.value) ?? 0)),
                false,
                currency,
              ).text
            }
            error={errors?.[row.key]}
            errorId={`${baseId}-${row.key}`}
            autoFocus={added === row.key}
            onChange={(next) =>
              onChange({
                ...draft,
                rows: draft.rows.map((r) => (r.key === row.key ? next : r)),
              })
            }
            onRemove={() =>
              onChange({
                ...draft,
                rows: draft.rows.filter((r) => r.key !== row.key),
              })
            }
          />
        ))}
      </div>
      {draft.rows.length === 0 ? (
        <p className="py-1 text-[13px] text-muted">
          No {words.many.toLowerCase()} in this rule.
        </p>
      ) : null}
      {hideAmounts ? (
        <p className="pt-1 text-xs text-faint">
          Amounts are hidden by Privacy. Turn it off to edit them.
        </p>
      ) : null}
      <div className="mt-1">
        <button
          type="button"
          disabled={hideAmounts}
          title={hideAmounts ? 'Hidden by Privacy' : undefined}
          onClick={() => {
            const row = newRow();
            setAdded(row.key);
            onChange({ ...draft, rows: [...draft.rows, row] });
          }}
          className="-ml-2 inline-flex h-[30px] items-center gap-1.5 rounded-[8px] px-2 text-[13px] font-semibold text-accent-ink outline-offset-2 hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:text-faint disabled:hover:bg-transparent pointer-coarse:h-11"
        >
          <Plus size={14} weight="bold" aria-hidden="true" />
          Add level
          <span className="sr-only"> for {words.many.toLowerCase()}</span>
        </button>
      </div>
    </div>
  );
}

/** The dialogs' footer: Cancel and the action, on the right. */
export function RuleFooter({
  onCancel,
  label,
  disabled,
  busy = false,
  formId,
  onConfirm,
}: {
  onCancel(): void;
  label: string;
  disabled: boolean;
  busy?: boolean;
  /** Set: the button submits that form. */
  formId?: string;
  onConfirm?(): void;
}): React.JSX.Element {
  return (
    <div className="flex justify-end gap-2">
      <Button variant="secondary" onClick={onCancel}>
        Cancel
      </Button>
      <Button
        type={formId ? 'submit' : 'button'}
        form={formId}
        disabled={disabled || busy}
        onClick={onConfirm}
      >
        {label}
      </Button>
    </div>
  );
}

/** The element a dialog grows from and hands focus back to: set by whatever opened it. */
export type FocusRef = RefObject<HTMLElement | null>;
