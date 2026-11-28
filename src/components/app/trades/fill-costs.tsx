'use client';

import { Check, Info, X } from '@phosphor-icons/react/dist/ssr';
import { useEffect, useId, useRef, useState } from 'react';
import { RAISED } from '@/components/ui/button-styles';
import { useSetFillCosts } from '@/data/query/hooks';
import { centsFromText } from '@/domain/fill-costs';
import type { Execution, Trade } from '@/domain/types';
import type { Display } from '@/lib/display';
import { currencySymbol } from '../settings/rule-fields';

/**
 * Costs by hand (Plan 6B spec §5.4, B58): a row of the Fills table opens its
 * exchange fee and commission as two fields and saves them when the row is
 * confirmed. One row is open at a time. The trade's fees and net follow, and
 * the change is logged, in the write (`useSetFillCosts`).
 */

export type CostField = 'fees' | 'commission';

const LABEL: Record<CostField, string> = {
  fees: 'Exchange fee',
  commission: 'Commission',
};

/** "1.05" for a field: whole cents as units of the currency, two places. */
const amountText = (cents: number): string => (cents / 100).toFixed(2);

interface OpenRow {
  id: string;
  fees: string;
  commission: string;
  /** The field the person came in by: it takes the focus. */
  focus: CostField;
}

export function useFillCosts(
  trade: Trade,
  display: Display,
  readOnly: boolean,
) {
  const write = useSetFillCosts();
  const errorId = useId();
  const [row, setRow] = useState<OpenRow | null>(null);
  const [invalid, setInvalid] = useState<CostField | null>(null);
  const [failed, setFailed] = useState(false);
  const inputs = useRef<Record<CostField, HTMLInputElement | null>>({
    fees: null,
    commission: null,
  });
  const openers = useRef(new Map<string, HTMLButtonElement>());
  const scroller = useRef<HTMLDivElement | null>(null);
  /** Where the focus goes back to when the row closes. */
  const back = useRef<string | null>(null);
  const masked = display.unit === 'privacy';

  // Another trade starts with no row open.
  const [of, setOf] = useState(trade.id);
  if (of !== trade.id) {
    setOf(trade.id);
    setRow(null);
    setInvalid(null);
    setFailed(false);
  }

  const openId = row?.id;
  const focusField = row?.focus;
  useEffect(() => {
    if (openId === undefined || focusField === undefined) return;
    // The fields and the buttons are at the row's end: on a narrow screen the
    // table scrolls, so show its end, then focus the field without moving the page.
    const box = scroller.current;
    if (box) box.scrollLeft = box.scrollWidth;
    inputs.current[focusField]?.focus({ preventScroll: true });
  }, [openId, focusField]);
  useEffect(() => {
    if (openId !== undefined || back.current === null) return;
    openers.current.get(back.current)?.focus();
    back.current = null;
  }, [openId]);

  const close = () => {
    setRow(null);
    setInvalid(null);
    setFailed(false);
  };

  return {
    /** Whether a row can be opened at all: an archived account's trades are read-only. */
    editable: !readOnly,
    masked,
    /** Whether the import already gave the trade a swap: then the note does not tell how to enter one. */
    hasSwap: trade.swap !== undefined,
    openId: row?.id ?? null,
    /** The sign the fields lead with: the trade's own currency, the one its fills' figures are in. */
    symbol: currencySymbol(trade.pnlCurrency),
    /** An amount as Privacy shows it, from the figure the table shows. */
    hidden: (cents: number) =>
      display.cash(cents, false, trade.pnlCurrency).text,
    pending: write.isPending,
    invalid,
    failed,
    errorId,
    row,

    open(fill: Execution, focus: CostField) {
      back.current = `${fill.id}:${focus}`;
      setInvalid(null);
      setFailed(false);
      setRow({
        id: fill.id,
        fees: amountText(fill.fees),
        commission: amountText(fill.commission),
        focus,
      });
    },
    type(field: CostField, text: string) {
      setRow((r) => (r ? { ...r, [field]: text } : r));
      setInvalid(null);
      setFailed(false);
    },
    cancel: close,
    async confirm(fill: Execution) {
      if (!row || write.isPending) return;
      // Under Privacy the amounts are hidden and cannot be edited: nothing to save.
      if (masked) return close();
      const fees = centsFromText(row.fees);
      const commission = centsFromText(row.commission);
      if (fees === null || commission === null) {
        const bad: CostField = fees === null ? 'fees' : 'commission';
        setInvalid(bad);
        inputs.current[bad]?.focus();
        return;
      }
      if (fees === fill.fees && commission === fill.commission) return close();
      setFailed(false);
      try {
        await write.mutateAsync({
          tradeId: trade.id,
          executionId: fill.id,
          costs: { commission, fees },
        });
        close();
      } catch {
        setFailed(true);
      }
    },

    inputRef: (field: CostField) => (el: HTMLInputElement | null) => {
      inputs.current[field] = el;
    },
    openerRef:
      (fill: Execution, field: CostField) => (el: HTMLButtonElement | null) => {
        const key = `${fill.id}:${field}`;
        if (el) openers.current.set(key, el);
        else openers.current.delete(key);
      },
    /** The table's scrolling box, to show the open row's end on a narrow screen. */
    setScroller: (el: HTMLDivElement | null) => {
      scroller.current = el;
    },
  };
}

export type FillCostsEdit = ReturnType<typeof useFillCosts>;

/** One cost of a fill: its figure, or a button that opens the row, or (while the row is open) its field. */
export function CostCell({
  edit,
  fill,
  field,
  when,
  figure,
}: {
  edit: FillCostsEdit;
  fill: Execution;
  field: CostField;
  /** The fill as a reader names it: "sell at 09:30:00". */
  when: string;
  /** The cost as the table shows it. */
  figure: React.ReactNode;
}): React.JSX.Element {
  const row = edit.row;
  if (row && row.id === fill.id) {
    const bad = edit.invalid === field;
    return (
      <label className="ml-auto flex h-[30px] w-[76px] items-center justify-end gap-[3px] rounded-[8px] border border-line-2 bg-surface-1 px-2 text-[13px] text-text shadow-[0_1px_1px_rgb(18_22_51/0.04)] transition-[border-color] duration-200 ease-(--ease-glide) hover:border-faint focus-within:border-accent focus-within:outline-2 focus-within:outline-accent/25 has-[input[aria-invalid=true]]:border-loss pointer-coarse:h-11">
        {edit.masked ? null : (
          <span aria-hidden="true" className="text-faint">
            {edit.symbol}
          </span>
        )}
        <input
          ref={edit.inputRef(field)}
          type="text"
          // A credit is negative, and a decimal keypad has no minus.
          inputMode="text"
          autoComplete="off"
          aria-label={LABEL[field]}
          aria-invalid={bad || undefined}
          aria-describedby={bad ? edit.errorId : undefined}
          readOnly={edit.masked}
          title={edit.masked ? 'Hidden by Privacy' : undefined}
          value={edit.masked ? edit.hidden(fill[field]) : row[field]}
          onChange={(e) => edit.type(field, e.target.value)}
          className="h-full min-w-[1ch] flex-1 bg-transparent text-right font-[550] tabular-nums outline-none! read-only:text-muted supports-[field-sizing:content]:flex-none supports-[field-sizing:content]:[field-sizing:content]"
        />
      </label>
    );
  }
  // Another row is open: finish it first, so nothing typed is lost.
  if (!edit.editable || edit.openId !== null) return <>{figure}</>;
  return (
    <button
      ref={edit.openerRef(fill, field)}
      type="button"
      aria-label={`Edit ${LABEL[field].toLowerCase()} of the ${when}`}
      onClick={() => edit.open(fill, field)}
      className="-mr-1.5 inline-flex min-h-7 items-center rounded-[7px] px-1.5 text-muted tabular-nums outline-offset-2 transition-colors duration-120 hover:bg-sunken hover:text-text focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:min-h-11"
    >
      {figure}
    </button>
  );
}

/** Enter in a field confirms the open row and Escape anywhere in it cancels, so the keyboard has the whole path. */
export function rowKeys(
  edit: FillCostsEdit,
  fill: Execution,
): React.KeyboardEventHandler<HTMLTableRowElement> {
  return (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      edit.cancel();
    } else if (e.key === 'Enter' && e.target instanceof HTMLInputElement) {
      e.preventDefault();
      void edit.confirm(fill);
    }
  };
}

/** The confirm and cancel buttons at the end of the open row. */
export function RowControls({
  edit,
  fill,
}: {
  edit: FillCostsEdit;
  fill: Execution;
}): React.JSX.Element {
  const BUTTON =
    'grid size-[30px] place-items-center rounded-[8px] outline-offset-2 focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-60 pointer-coarse:size-11';
  return (
    <span className="inline-flex gap-1">
      <button
        type="button"
        aria-label="Save this row's costs"
        disabled={edit.pending}
        onClick={() => void edit.confirm(fill)}
        className={`${BUTTON} ${RAISED}`}
      >
        <Check size={13} weight="bold" aria-hidden="true" />
      </button>
      <button
        type="button"
        aria-label="Cancel the edit"
        disabled={edit.pending}
        onClick={edit.cancel}
        className={`${BUTTON} border border-line-2 text-muted hover:border-faint hover:text-text`}
      >
        <X size={13} weight="bold" aria-hidden="true" />
      </button>
    </span>
  );
}

/** What sits under the table while a row is open: the note, and what is wrong. */
export function FillCostsNote({
  edit,
}: {
  edit: FillCostsEdit;
}): React.JSX.Element | null {
  if (edit.openId === null) return null;
  const problem = edit.invalid
    ? 'Enter an amount.'
    : edit.failed
      ? "Couldn't save the costs. Try again."
      : null;
  return (
    <>
      <p className="mt-2 flex items-start gap-1.5 text-[12.5px] text-faint">
        <Info size={15} aria-hidden="true" className="mt-px flex-none" />
        Confirm the row to save. The trade&apos;s fees and net update, and the
        change is logged.
        {edit.hasSwap
          ? null
          : ' A swap your broker charged goes in the fee as a positive amount, a credit as a negative one.'}
      </p>
      {edit.masked ? (
        <p className="mt-1 text-[12.5px] text-faint">
          Amounts are hidden by Privacy. Turn it off to edit them.
        </p>
      ) : null}
      {problem ? (
        <p
          id={edit.errorId}
          role="alert"
          className="mt-1.5 text-[12.5px] font-medium text-loss"
        >
          {problem}
        </p>
      ) : null}
    </>
  );
}
