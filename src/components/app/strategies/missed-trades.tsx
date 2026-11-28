'use client';

import {
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import {
  PencilSimple,
  Plus,
  Trash,
  Warning,
} from '@phosphor-icons/react/dist/ssr';
import { FigureText } from '@/components/product/figure-text';
import { buttonClasses } from '@/components/ui/button-styles';
import { MorphDialog } from '@/components/ui/morph-dialog';
import {
  useMissedTrades,
  usePrefs,
  useRemoveMissedTrade,
  useSaveMissedTrade,
} from '@/data/query/hooks';
import { defaultPrefs } from '@/data/repository';
import { localDate } from '@/domain/time';
import type { MissedTrade, Strategy } from '@/domain/types';
import { useDisplay } from '@/lib/display';
import { clock, dayLabel } from '@/lib/time-format';
import { zoneLabel } from '@/lib/time-zone-label';
import { ConfirmDialog } from '../confirm-dialog';
import { CARD, CardHeader } from '../dashboard/shared';
import {
  Field,
  FIELD_BOX,
  FIELD_HINT,
  RuleFooter,
  currencySymbol,
} from '../settings/rule-fields';
import { focusField } from '../settings/settings-ui';
import {
  atFromInput,
  costInput,
  parseCost,
  parsePrice,
  priceInput,
  priceText,
  wallInput,
} from './missed-trade-fields';

const TH =
  'px-2.5 py-2 text-left text-[12.5px] font-medium whitespace-nowrap text-faint first:pl-0 last:pr-0';
const TD = 'px-2.5 py-2.5 align-middle first:pl-0 last:pr-0';
const ICON_BTN =
  'inline-flex size-[30px] items-center justify-center rounded-[8px] text-muted outline-offset-1 hover:bg-sunken hover:text-text focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:size-11';
const INNER =
  'h-full min-w-0 flex-1 bg-transparent tabular-nums outline-none! placeholder:text-faint read-only:text-muted';

/** An input problem, not a loss: neutral, never loss red. */
function Problem({
  id,
  children,
}: {
  id: string;
  children: ReactNode;
}): React.JSX.Element {
  return (
    <p
      id={id}
      role="alert"
      className="mt-1.5 flex items-center gap-1.5 text-[13px] text-text"
    >
      <Warning size={14} aria-hidden="true" className="text-muted" />
      {children}
    </p>
  );
}

/** The time zone the profile reads clocks in. */
function useZone(): string {
  return usePrefs().data?.timeZone ?? defaultPrefs().timeZone;
}

/**
 * Add a missed trade, or (with `trade`) edit one (B43): exactly TradeZella's
 * fields, the symbol, a date and time, a price, a commission and fees, and
 * nothing else. Only the symbol and the time are needed. The commission and
 * fees are money, so Privacy hides them and they are not edited then.
 */
function MissedTradeDialog({
  open,
  onOpenChange,
  origin,
  strategy,
  trade,
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
  origin: RefObject<HTMLElement | null>;
  strategy: Strategy;
  /** Absent: a new one. */
  trade?: MissedTrade;
}): React.JSX.Element {
  const ids = useId();
  const zone = useZone();
  const prefs = usePrefs().data;
  const display = useDisplay();
  const save = useSaveMissedTrade();
  const masked = display.unit === 'privacy';
  const sign = currencySymbol(prefs?.baseCurrency ?? 'USD');

  const [symbol, setSymbol] = useState('');
  const [at, setAt] = useState('');
  const [price, setPrice] = useState('');
  const [commission, setCommission] = useState('');
  const [fees, setFees] = useState('');
  const [errors, setErrors] = useState<
    Partial<Record<'symbol' | 'at' | 'price' | 'commission' | 'fees', string>>
  >({});
  const [failed, setFailed] = useState(false);
  // A reopened dialog starts from the trade it shows (or from now, for a new one).
  const [was, setWas] = useState(false);
  if (open !== was) {
    setWas(open);
    if (open) {
      setSymbol(trade?.symbol ?? '');
      setAt(wallInput(trade?.at ?? new Date().toISOString(), zone));
      setPrice(trade?.price === undefined ? '' : priceInput(trade.price));
      setCommission(
        trade?.commission === undefined ? '' : costInput(trade.commission),
      );
      setFees(trade?.fees === undefined ? '' : costInput(trade.fees));
      setErrors({});
      setFailed(false);
    }
  }

  const submit = async () => {
    if (save.isPending) return;
    const next: typeof errors = {};
    const when = atFromInput(at, zone);
    const p = parsePrice(price);
    // Hidden amounts are not edited: what was stored stays.
    const c = masked ? trade?.commission : parseCost(commission);
    const f = masked ? trade?.fees : parseCost(fees);
    if (symbol.trim() === '') next.symbol = 'Enter the symbol.';
    if (when === null) next.at = 'Pick a date and time.';
    if (p === null) next.price = 'Enter a price above zero, or leave it empty.';
    if (c === null)
      next.commission = 'Enter an amount like 2.58, or leave it empty.';
    if (f === null) next.fees = 'Enter an amount like 2.58, or leave it empty.';
    setErrors(next);
    setFailed(false);
    const first = (
      ['symbol', 'at', 'price', 'commission', 'fees'] as const
    ).find((k) => next[k]);
    if (first || when === null || p === null || c === null || f === null) {
      focusField(`${ids}-${first ?? 'symbol'}`);
      return;
    }
    try {
      await save.mutateAsync({
        ...(trade ? { id: trade.id } : {}),
        missed: {
          strategyId: strategy.id,
          symbol: symbol.trim().toUpperCase(),
          at: when,
          price: p,
          commission: c,
          fees: f,
        },
      });
      onOpenChange(false);
    } catch {
      setFailed(true);
    }
  };

  const err = (k: keyof typeof errors) => errors[k];
  const bad = (k: keyof typeof errors) =>
    err(k)
      ? {
          'aria-invalid': true as const,
          'aria-describedby': `${ids}-${k}-error`,
        }
      : {};
  const problem = (k: keyof typeof errors) =>
    err(k) ? <Problem id={`${ids}-${k}-error`}>{err(k)}</Problem> : null;

  /** A money field: the currency's sign and the amount; hidden and not edited under Privacy. */
  const money = (
    k: 'commission' | 'fees',
    label: string,
    text: string,
    set: (v: string) => void,
    stored: number | undefined,
  ) => (
    <Field label={label} id={`${ids}-${k}`}>
      <div className={FIELD_BOX}>
        {masked ? null : (
          <span aria-hidden="true" className="text-faint">
            {sign}
          </span>
        )}
        <input
          id={`${ids}-${k}`}
          type="text"
          // A credit is negative, and a decimal keypad has no minus.
          inputMode="text"
          autoComplete="off"
          placeholder={masked ? undefined : '0.00'}
          readOnly={masked}
          title={masked ? 'Hidden by Privacy' : undefined}
          value={masked ? display.cash(stored ?? 0, false).text : text}
          onChange={(e) => set(e.target.value)}
          className={INNER}
          {...bad(k)}
        />
      </div>
      {problem(k)}
    </Field>
  );

  return (
    <MorphDialog
      open={open}
      onOpenChange={onOpenChange}
      origin={origin}
      returnFocus={origin}
      size="medium"
      title={trade ? 'Edit missed trade' : 'Add a missed trade'}
      description={`${strategy.name}. A trade you saw and skipped; it counts in no figure, filter or report.`}
      footer={
        <RuleFooter
          onCancel={() => onOpenChange(false)}
          label={trade ? 'Save' : 'Add'}
          disabled={false}
          busy={save.isPending}
          formId={`${ids}-form`}
        />
      }
    >
      <form
        id={`${ids}-form`}
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div className="grid grid-cols-2 gap-x-4 gap-y-3.5 max-sm:grid-cols-1">
          <Field label="Symbol" id={`${ids}-symbol`}>
            <div className={FIELD_BOX}>
              <input
                id={`${ids}-symbol`}
                type="text"
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                placeholder="ES"
                value={symbol}
                onChange={(e) => setSymbol(e.target.value)}
                className={INNER}
                {...bad('symbol')}
              />
            </div>
            {problem('symbol')}
          </Field>
          <Field label="Date and time" id={`${ids}-at`}>
            <div className={FIELD_BOX}>
              <input
                id={`${ids}-at`}
                type="datetime-local"
                value={at}
                onChange={(e) => setAt(e.target.value)}
                className={INNER}
                {...bad('at')}
              />
            </div>
            {problem('at')}
            <p className={FIELD_HINT}>Times in {zoneLabel(zone)}.</p>
          </Field>
          <Field label="Price" id={`${ids}-price`} className="col-span-full">
            <div className={FIELD_BOX}>
              <input
                id={`${ids}-price`}
                type="text"
                inputMode="decimal"
                autoComplete="off"
                placeholder="6,618.50"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className={INNER}
                {...bad('price')}
              />
            </div>
            {problem('price')}
          </Field>
          {money(
            'commission',
            'Commission',
            commission,
            setCommission,
            trade?.commission,
          )}
          {money('fees', 'Fees', fees, setFees, trade?.fees)}
        </div>
        {masked ? (
          <p className={`${FIELD_HINT} mt-2.5`}>
            Amounts are hidden by Privacy. Turn it off to edit them.
          </p>
        ) : null}
        {failed ? (
          <p role="alert" className="mt-3 text-[13px] font-medium text-text">
            Couldn&apos;t save the missed trade. Try again.
          </p>
        ) : null}
      </form>
    </MorphDialog>
  );
}

/**
 * A strategy's missed trades (B43): trades it called for that the trader saw
 * and skipped. Kept apart, in a table of their own: no figure, filter, report,
 * calendar or pattern counts them. Add, edit and delete; a table above `sm`,
 * two-line rows on a phone.
 */
export function MissedTradesCard({
  strategy,
}: {
  strategy: Strategy;
}): React.JSX.Element {
  const list = useMissedTrades(strategy.id);
  const zone = useZone();
  const display = useDisplay();
  const remove = useRemoveMissedTrade();
  const addButton = useRef<HTMLButtonElement>(null);
  /** What the dialog grows from and returns to. */
  const opener = useRef<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);
  // The trade the dialog was opened on stays while it fades out.
  const [target, setTarget] = useState<MissedTrade>();
  const [deleting, setDeleting] = useState<MissedTrade | null>(null);

  const thisYear = useMemo(
    () => localDate(new Date().toISOString(), zone).slice(0, 4),
    [zone],
  );
  const dateOf = (m: MissedTrade) => {
    const date = localDate(m.at, zone);
    return dayLabel(date, { year: date.slice(0, 4) !== thisYear });
  };
  const timeOf = (m: MissedTrade) => clock(m.at, zone, false);
  const label = (m: MissedTrade) => `${m.symbol}, ${dateOf(m)} ${timeOf(m)}`;
  const cost = (cents: number | undefined) =>
    cents === undefined ? (
      <span className="text-faint">None</span>
    ) : (
      <FigureText f={display.cash(cents, false)} />
    );

  const buttons = (m: MissedTrade) => (
    <span className="inline-flex gap-0.5">
      <button
        type="button"
        aria-label={`Edit ${label(m)}`}
        className={ICON_BTN}
        onClick={(e) => {
          opener.current = e.currentTarget;
          setTarget(m);
          setOpen(true);
        }}
      >
        <PencilSimple size={16} aria-hidden="true" />
      </button>
      <button
        type="button"
        aria-label={`Delete ${label(m)}`}
        className={ICON_BTN}
        onClick={() => setDeleting(m)}
      >
        <Trash size={16} aria-hidden="true" />
      </button>
    </span>
  );

  const trades = list.data ?? [];

  return (
    <section
      aria-labelledby="missed-h"
      className={`${CARD} px-5 pt-[18px] pb-4`}
    >
      <CardHeader
        headingId="missed-h"
        title="Missed trades"
        after={
          <span className="text-[12.5px] text-faint">
            Kept apart: no figure, filter or report counts them
          </span>
        }
        end={
          <button
            ref={addButton}
            type="button"
            aria-label="Add a missed trade"
            aria-haspopup="dialog"
            className={`${buttonClasses('secondary', 'sm')} outline-offset-2 focus-visible:outline-2 focus-visible:outline-accent`}
            onClick={(e) => {
              opener.current = e.currentTarget;
              setTarget(undefined);
              setOpen(true);
            }}
          >
            <Plus size={14} weight="bold" aria-hidden="true" />
            Add
          </button>
        }
      />
      {list.isError ? (
        <p role="alert" className="mt-3 text-[14px] text-muted">
          Couldn&apos;t load the missed trades.
        </p>
      ) : list.data && trades.length === 0 ? (
        <p className="mt-2.5 text-[13.5px] text-muted">No missed trades yet.</p>
      ) : trades.length > 0 ? (
        <>
          <ul
            aria-label="Missed trades, one row each"
            className="mt-1 sm:hidden"
          >
            {trades.map((m) => (
              <li
                key={m.id}
                className="flex items-center gap-1 border-b border-line/70 py-2.5 last:border-b-0"
              >
                <div className="min-w-0 flex-1 text-[13.5px]">
                  <span className="flex items-baseline justify-between gap-3">
                    <b className="font-semibold text-text">{m.symbol}</b>
                    {m.price === undefined ? null : (
                      <b className="font-semibold tabular-nums">
                        {priceText(m.price)}
                      </b>
                    )}
                  </span>
                  <span className="mt-0.5 flex flex-wrap gap-x-3.5 gap-y-0.5 text-[13px] text-muted tabular-nums">
                    <span>
                      {dateOf(m)} {timeOf(m)}
                    </span>
                    {m.commission === undefined ? null : (
                      <span>
                        <FigureText f={display.cash(m.commission, false)} />{' '}
                        commission
                      </span>
                    )}
                    {m.fees === undefined ? null : (
                      <span>
                        <FigureText f={display.cash(m.fees, false)} /> fees
                      </span>
                    )}
                  </span>
                </div>
                {buttons(m)}
              </li>
            ))}
          </ul>
          <div className="mt-1 overflow-x-auto max-sm:hidden">
            <table aria-label="Missed trades" className="w-full text-[13.5px]">
              <thead>
                <tr className="border-b border-line">
                  <th scope="col" className={TH}>
                    Date and time
                  </th>
                  <th scope="col" className={TH}>
                    Symbol
                  </th>
                  <th scope="col" className={`${TH} !text-right`}>
                    Price
                  </th>
                  <th scope="col" className={`${TH} !text-right`}>
                    Commission
                  </th>
                  <th scope="col" className={`${TH} !text-right`}>
                    Fees
                  </th>
                  <th scope="col" className={TH}>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {trades.map((m) => (
                  <tr
                    key={m.id}
                    className="h-11 border-b border-line/70 last:border-b-0"
                  >
                    <td
                      className={`${TD} whitespace-nowrap text-muted tabular-nums`}
                    >
                      {dateOf(m)}{' '}
                      <b className="font-semibold text-text">{timeOf(m)}</b>
                    </td>
                    <td className={`${TD} font-semibold text-text`}>
                      {m.symbol}
                    </td>
                    <td className={`${TD} text-right font-medium tabular-nums`}>
                      {m.price === undefined ? (
                        <span className="text-faint">None</span>
                      ) : (
                        priceText(m.price)
                      )}
                    </td>
                    <td className={`${TD} text-right text-muted tabular-nums`}>
                      {cost(m.commission)}
                    </td>
                    <td className={`${TD} text-right text-muted tabular-nums`}>
                      {cost(m.fees)}
                    </td>
                    <td className={`${TD} text-right`}>{buttons(m)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}

      <MissedTradeDialog
        open={open}
        onOpenChange={setOpen}
        origin={opener}
        strategy={strategy}
        trade={target}
      />
      <ConfirmDialog
        open={deleting !== null}
        title="Delete this missed trade?"
        body={
          deleting
            ? `${label(deleting)} is removed. No figure ever counted it, so nothing else changes.`
            : ''
        }
        confirmLabel="Delete"
        danger
        returnFocus={addButton}
        onConfirm={async () => {
          if (deleting) await remove.mutateAsync(deleting.id);
        }}
        onClose={() => setDeleting(null)}
      />
    </section>
  );
}
