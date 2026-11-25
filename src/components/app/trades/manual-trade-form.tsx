'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import {
  CaretDown,
  CaretLeft,
  Plus,
  Trash,
  Warning,
} from '@phosphor-icons/react/dist/ssr';
import { Button } from '@/components/ui/button';
import { buttonClasses } from '@/components/ui/button-styles';
import {
  useAccounts,
  useCreateManualTrade,
  usePrefs,
  useReplaceManualTrade,
  useTrade,
} from '@/data/query/hooks';
import { ManualTradeRejected, type ManualTradeInput } from '@/data/repository';
import { fillTimeToUtc } from '@/domain/import/fill-time';
import {
  ASSET_TYPES,
  assetTypeOf,
  buildManualTrade,
  defaultMultiplier,
  defaultTickSize,
  FOREX_LOT,
  formPriceOf,
  instrumentProblems,
  manualInstrument,
  symbolSuggestions,
  type AssetType,
  type ManualTradeError,
} from '@/domain/manual-trade';
import { toCents } from '@/domain/money';
import { sidesOf } from '@/domain/risk';
import { localDate } from '@/domain/time';
import type { Account, Side, Trade } from '@/domain/types';
import { zoneLabel } from '@/lib/time-zone-label';
import { clock } from './trade-time';

const INPUT =
  'block h-[38px] w-full rounded-control border border-line-2 bg-surface-1 px-3 text-[14px] font-[550] text-text tabular-nums shadow-[var(--shadow-chip)] transition-[border-color,box-shadow] duration-200 ease-[var(--ease-glide)] outline-none placeholder:text-faint hover:border-faint focus-visible:border-accent focus-visible:shadow-[0_0_0_3px_var(--accent-soft)] aria-invalid:border-muted read-only:bg-sunken read-only:text-muted pointer-coarse:h-11';
const SECTION =
  'rounded-card border border-line bg-surface-1 px-5 pt-[18px] pb-5 shadow-[var(--shadow-card)]';
const LABEL = 'mb-1.5 block text-[12.5px] font-medium text-muted';

interface Row {
  key: number;
  date: string;
  time: string;
  side: Side;
  qty: string;
  price: string;
  commission: string;
  fees: string;
}

/** Field keys the errors hang on; the order is the page order, so the first one gets focus. */
type ErrorKey =
  | 'account'
  | 'symbol'
  | 'option'
  | 'multiplier'
  | 'tick'
  | 'fills'
  | `row:${number}`
  | 'stop'
  | 'target';
type Errors = Partial<Record<ErrorKey, string>>;

const blankRow = (key: number): Row => ({
  key,
  date: '',
  time: '',
  side: 'buy',
  qty: '',
  price: '',
  commission: '',
  fees: '',
});

/** A typed number: thousands commas allowed; blank or unreadable is NaN. */
function num(s: string): number {
  const t = s.replace(/[,\s]/g, '');
  return t === '' ? NaN : Number(t);
}

function plain(n: number): string {
  return String(Number(n.toFixed(8)));
}

function zoneOf(account: Account | undefined, fallback: string): string {
  return account?.timeZone ?? fallback;
}

/** A stored instant as the date and time boxes show it, read in `zone`. */
function wall(iso: string, zone: string): { date: string; time: string } {
  const t = clock(iso, zone);
  return {
    date: localDate(iso, zone),
    time: t.endsWith(':00') ? t.slice(0, 5) : t,
  };
}

interface Initial {
  accountId: string;
  type: AssetType;
  symbol: string;
  expiry: string;
  strike: string;
  right: 'call' | 'put';
  multiplier: string | null;
  tick: string | null;
  rows: Row[];
  stop: string;
  target: string;
}

function initialFor(
  trade: Trade | null,
  account: Account,
  zone: string,
): Initial {
  if (!trade)
    return {
      accountId: account.id,
      type: 'stock',
      symbol: '',
      expiry: '',
      strike: '',
      right: 'call',
      multiplier: null,
      tick: null,
      rows: [blankRow(1)],
      stop: '',
      target: '',
    };
  const inst = trade.instrument;
  const type = assetTypeOf(inst);
  const option = inst.assetClass === 'option';
  // The form shows a stop or target that is one Price level, however it was saved.
  const sides = sidesOf(trade);
  const shown = (price: number | undefined) =>
    price === undefined ? '' : plain(price);
  return {
    accountId: trade.accountId,
    type,
    symbol: option ? (inst.underlying ?? inst.root) : inst.symbol,
    expiry: inst.expiry ?? '',
    strike: inst.strike === undefined ? '' : plain(inst.strike),
    right: inst.right ?? 'call',
    multiplier: plain(inst.pointValue),
    tick: plain(inst.tickSize),
    rows: trade.executions.map((e, i) => ({
      key: i + 1,
      ...wall(e.time, zone),
      side: e.side,
      qty: plain(e.qty),
      price: plain(e.price),
      commission: e.commission ? plain(e.commission / 100) : '',
      fees: e.fees ? plain(e.fees / 100) : '',
    })),
    stop: shown(formPriceOf(sides.stops)),
    target: shown(formPriceOf(sides.targets)),
  };
}

function ErrorText({ id, children }: { id: string; children?: string }) {
  return (
    <div aria-live="polite">
      {children ? (
        // An input problem, not a loss: neutral, never loss red.
        <p
          id={id}
          className="mt-1.5 flex items-start gap-1.5 text-xs leading-4 text-text"
        >
          <Warning
            size={14}
            aria-hidden="true"
            className="mt-px flex-none text-muted"
          />
          {children}
        </p>
      ) : null}
    </div>
  );
}

function Field({
  label,
  error,
  hint,
  className = '',
  children,
}: {
  label: string;
  error?: string | undefined;
  hint?: string;
  className?: string;
  children(p: {
    id: string;
    'aria-describedby': string | undefined;
    'aria-invalid': true | undefined;
  }): ReactNode;
}) {
  const id = useId();
  const errId = `${id}-error`;
  const hintId = `${id}-hint`;
  const describedBy =
    [hint ? hintId : '', error ? errId : ''].filter(Boolean).join(' ') ||
    undefined;
  return (
    <div className={`min-w-0 ${className}`}>
      <label htmlFor={id} className={LABEL}>
        {label}
      </label>
      {children({
        id,
        'aria-describedby': describedBy,
        'aria-invalid': error ? true : undefined,
      })}
      {hint ? (
        <p id={hintId} className="mt-1.5 text-xs leading-4 text-faint">
          {hint}
        </p>
      ) : null}
      <ErrorText id={errId}>{error}</ErrorText>
    </div>
  );
}

function Select({
  className = '',
  children,
  ...props
}: React.ComponentProps<'select'>) {
  return (
    <span className="relative block">
      <select
        {...props}
        className={`${INPUT} appearance-none pr-8 ${className}`}
      >
        {children}
      </select>
      <CaretDown
        size={14}
        weight="bold"
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-muted"
      />
    </span>
  );
}

function Form({
  trade,
  accounts,
  prefsZone,
  preferredAccountId,
}: {
  trade: Trade | null;
  accounts: Account[];
  prefsZone: string;
  /** An account to start on when adding (`?account=`); not in `accounts` (archived, unknown): ignored. */
  preferredAccountId?: string | null;
}) {
  const router = useRouter();
  const create = useCreateManualTrade();
  const replace = useReplaceManualTrade();
  const listId = useId();
  const nextKey = useRef(100);

  const first =
    accounts.find((a) => a.id === trade?.accountId) ??
    (trade ? undefined : accounts.find((a) => a.id === preferredAccountId)) ??
    accounts[0]!;
  const [init] = useState(() =>
    initialFor(trade, first, zoneOf(first, prefsZone)),
  );
  const [accountId, setAccountId] = useState(init.accountId);
  const [type, setType] = useState(init.type);
  const [symbol, setSymbol] = useState(init.symbol);
  const [expiry, setExpiry] = useState(init.expiry);
  const [strike, setStrike] = useState(init.strike);
  const [right, setRight] = useState(init.right);
  const [multiplier, setMultiplier] = useState(init.multiplier);
  const [tick, setTick] = useState(init.tick);
  const [rows, setRows] = useState(init.rows);
  const [stop, setStop] = useState(init.stop);
  const [target, setTarget] = useState(init.target);
  const [errors, setErrors] = useState<Errors>({});
  const [saveFailed, setSaveFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [focusKey, setFocusKey] = useState<{ key: string; n: number }>();
  const els = useRef(new Map<string, HTMLElement | null>());

  const account = accounts.find((a) => a.id === accountId) ?? first;
  const zone = zoneOf(account, prefsZone);
  const optionLike = type === 'option' || type === 'future-option';
  const showTick =
    type === 'future' || type === 'future-option' || type === 'cfd';
  const lots = type === 'forex';
  const multiplierShown =
    multiplier ?? (defaultMultiplier(type, symbol) || '').toString();
  const tickShown = tick ?? plain(defaultTickSize(type, symbol));
  const suggestions = symbolSuggestions(type);

  useEffect(() => {
    if (focusKey) els.current.get(focusKey.key)?.focus();
  }, [focusKey]);
  const ref = (key: string) => (el: HTMLElement | null) => {
    els.current.set(key, el);
  };

  const patchRow = (key: number, p: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...p } : r)));

  const describe = (key: ErrorKey, ...extra: (string | undefined)[]) => {
    const ids = [...extra, errors[key] ? `${key}-err` : undefined].filter(
      Boolean,
    );
    return ids.length ? ids.join(' ') : undefined;
  };

  const spec = () => ({
    type,
    symbol,
    ...(expiry ? { expiry } : {}),
    ...(num(strike) > 0 ? { strike: num(strike) } : {}),
    right,
    multiplier: lots
      ? FOREX_LOT
      : Number.isNaN(num(multiplierShown))
        ? 0
        : num(multiplierShown),
    tickSize: num(tickShown) > 0 ? num(tickShown) : 0.01,
    quoteCurrency: account.currency,
  });

  const fromBuilder = (error: ManualTradeError, fillIndex?: number): Errors => {
    const root = manualInstrument(spec()).root;
    switch (error) {
      case 'no-fills':
        return { fills: 'Add at least one fill.' };
      case 'reversal':
        return {
          fills:
            'These fills reverse the position. Split them into two trades.',
        };
      case 'option-fields':
        return { option: 'Enter the strike, expiry and call or put.' };
      case 'multiplier':
        return { multiplier: `Enter the contract multiplier for ${root}.` };
      case 'bad-fill': {
        const row = rows[fillIndex ?? 0];
        return {
          [`row:${row?.key ?? 0}`]: `Check fill ${(fillIndex ?? 0) + 1}: quantity and price must be above zero.`,
        };
      }
    }
  };

  const show = (found: Errors) => {
    setErrors(found);
    const order: ErrorKey[] = [
      'account',
      'symbol',
      'option',
      'multiplier',
      'tick',
      'fills',
      ...rows.map((r): ErrorKey => `row:${r.key}`),
      'stop',
      'target',
    ];
    const first = order.find((k) => found[k]);
    if (!first) return;
    // A row's error lands on the box that is wrong: the quantity, else the date.
    const key = first.startsWith('row:')
      ? `${found[first]?.includes('quantity') ? 'qty' : 'date'}:${first.slice(4)}`
      : first;
    setFocusKey((f) => ({ key, n: (f?.n ?? 0) + 1 }));
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setSaveFailed(false);

    const local: Errors = {};
    if (!symbol.trim())
      local.symbol = optionLike
        ? 'Enter the underlying.'
        : type === 'future'
          ? 'Enter the symbol with its contract month, such as ESZ6.'
          : 'Enter a symbol.';
    if (showTick && !(num(tickShown) > 0))
      local.tick = 'Enter a tick size above zero.';
    const fills: ManualTradeInput['fills'] = [];
    rows.forEach((r, i) => {
      const time = fillTimeToUtc(`${r.date} ${r.time}`.trim(), {
        timeZone: zone,
        dateOrder: 'mdy',
      });
      const cost = (s: string) => (s.trim() === '' ? 0 : num(s));
      if (!r.date || !r.time || time === null)
        local[`row:${r.key}`] = `Check fill ${i + 1}: enter its date and time.`;
      else if (Number.isNaN(cost(r.commission)) || Number.isNaN(cost(r.fees)))
        local[`row:${r.key}`] =
          `Check fill ${i + 1}: commission and fees must be numbers.`;
      else if (cost(r.commission) < 0 || cost(r.fees) < 0)
        local[`row:${r.key}`] = 'Enter fees as a positive amount.';
      else
        fills.push({
          time,
          side: r.side,
          qty: num(r.qty),
          price: num(r.price),
          commission: toCents(cost(r.commission)),
          fees: toCents(cost(r.fees)),
        });
    });
    const price = (s: string, k: 'stop' | 'target') => {
      if (s.trim() === '') return undefined;
      if (!(num(s) > 0))
        local[k] = 'Enter a price above zero, or leave it empty.';
      return num(s);
    };
    const plannedStop = price(stop, 'stop');
    const plannedTarget = price(target, 'target');
    if (Object.keys(local).length) return show(local);

    const input: ManualTradeInput = {
      accountId,
      instrument: manualInstrument(spec()),
      fills,
      ...(plannedStop !== undefined ? { plannedStop } : {}),
      ...(plannedTarget !== undefined ? { plannedTarget } : {}),
    };
    const dry = buildManualTrade(input, {
      workspaceId: '',
      serial: 0,
      accountCurrency: account.currency,
    });
    if (!dry.ok) {
      const found = fromBuilder(dry.error, dry.fillIndex);
      // The builder stops at its first reason: also list the instrument's own gaps, so one Save shows both.
      for (const p of instrumentProblems(input.instrument))
        Object.assign(found, fromBuilder(p));
      return show(found);
    }

    setErrors({});
    setSaving(true);
    try {
      const saved = trade
        ? await replace.mutateAsync({ id: trade.id, input })
        : await create.mutateAsync(input);
      router.push(`/app/trades/${encodeURIComponent(saved.id)}`);
    } catch (err) {
      setSaving(false);
      if (err instanceof ManualTradeRejected)
        show(fromBuilder(err.error, err.fillIndex));
      else setSaveFailed(true);
    }
  };

  const cancelHref = trade
    ? `/app/trades/${encodeURIComponent(trade.id)}`
    : '/app/trades';
  const fillsErr = errors.fills;
  const qtyLabel = lots ? 'Lots' : 'Quantity';

  return (
    <form
      noValidate
      onSubmit={submit}
      className="mx-auto flex w-full max-w-[920px] flex-col gap-4 px-5 pt-1 pb-10 lg:pt-0"
    >
      <div>
        <Link
          href={cancelHref}
          className="inline-flex min-h-8 items-center gap-1.5 rounded-chip text-[13px] font-semibold text-accent-ink outline-offset-2 hover:text-accent-hover focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:min-h-11"
        >
          <CaretLeft size={14} weight="bold" aria-hidden="true" />
          {trade ? 'Back to trade' : 'Back to trades'}
        </Link>
        <h1 className="mt-1 text-[22px] leading-7 font-semibold tracking-[-0.01em] text-text">
          {trade ? `Edit trade ${trade.serial}` : 'Add a trade'}
        </h1>
        <p className="mt-1 text-[13.5px] leading-[1.45] text-muted">
          Enter the fills of one position. Net P&amp;L, R and the rest are
          worked out from them.
        </p>
      </div>

      <section aria-labelledby="mt-instrument" className={SECTION}>
        <h2
          id="mt-instrument"
          className="mb-3 text-[15px] font-semibold text-text"
        >
          Instrument
        </h2>
        <div className="grid gap-x-3 gap-y-3.5 sm:grid-cols-2">
          <Field label="Account" error={errors.account}>
            {(p) => (
              <>
                <Select
                  {...p}
                  value={accountId}
                  onChange={(e) => setAccountId(e.target.value)}
                  aria-describedby={[p['aria-describedby'], 'mt-zone']
                    .filter(Boolean)
                    .join(' ')}
                >
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </Select>
                <p id="mt-zone" className="mt-1.5 text-xs leading-4 text-faint">
                  Times in {zoneLabel(zone)}
                </p>
              </>
            )}
          </Field>
          <Field label="Asset type">
            {(p) => (
              <Select
                {...p}
                value={type}
                onChange={(e) => {
                  setType(e.target.value as AssetType);
                  setMultiplier(null);
                  setTick(null);
                  setErrors({});
                }}
              >
                {ASSET_TYPES.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field
            label="Symbol"
            error={errors.symbol}
            hint={
              type === 'future'
                ? 'With its contract month, such as ESZ6.'
                : type === 'future-option'
                  ? 'The futures root, such as CL.'
                  : optionLike
                    ? 'The underlying, such as AAPL.'
                    : undefined
            }
          >
            {(p) => (
              <input
                {...p}
                ref={ref('symbol')}
                type="text"
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                list={suggestions.length ? listId : undefined}
                value={symbol}
                onChange={(e) => setSymbol(e.target.value)}
                className={INPUT}
              />
            )}
          </Field>
          {suggestions.length ? (
            <datalist id={listId}>
              {suggestions.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          ) : null}
        </div>

        {optionLike ? (
          <div className="mt-3.5">
            <div className="grid grid-cols-2 gap-x-3 gap-y-3.5 sm:grid-cols-3">
              <Field label="Expiry">
                {(p) => (
                  <input
                    {...p}
                    ref={ref('option')}
                    type="date"
                    value={expiry}
                    aria-describedby={describe('option')}
                    onChange={(e) => setExpiry(e.target.value)}
                    className={INPUT}
                  />
                )}
              </Field>
              <Field label="Strike">
                {(p) => (
                  <input
                    {...p}
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    value={strike}
                    aria-describedby={describe('option')}
                    onChange={(e) => setStrike(e.target.value)}
                    className={INPUT}
                  />
                )}
              </Field>
              <Field label="Call or put" className="col-span-2 sm:col-span-1">
                {(p) => (
                  <Select
                    {...p}
                    value={right}
                    aria-describedby={describe('option')}
                    onChange={(e) => setRight(e.target.value as 'call' | 'put')}
                  >
                    <option value="call">Call</option>
                    <option value="put">Put</option>
                  </Select>
                )}
              </Field>
            </div>
            <ErrorText id="option-err">{errors.option}</ErrorText>
          </div>
        ) : null}

        {type !== 'stock' ? (
          <div className="mt-3.5 grid grid-cols-2 gap-x-3 gap-y-3.5 sm:grid-cols-3">
            <Field
              label="Multiplier"
              error={errors.multiplier}
              hint={
                lots
                  ? 'One lot is 100,000 units.'
                  : type === 'future' || type === 'future-option'
                    ? 'Dollars per point, per contract.'
                    : undefined
              }
            >
              {(p) => (
                <input
                  {...p}
                  ref={ref('multiplier')}
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  readOnly={lots}
                  value={lots ? String(FOREX_LOT) : multiplierShown}
                  onChange={(e) => setMultiplier(e.target.value)}
                  className={INPUT}
                />
              )}
            </Field>
            {showTick ? (
              <Field label="Tick size" error={errors.tick}>
                {(p) => (
                  <input
                    {...p}
                    ref={ref('tick')}
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    value={tickShown}
                    onChange={(e) => setTick(e.target.value)}
                    className={INPUT}
                  />
                )}
              </Field>
            ) : null}
          </div>
        ) : null}
      </section>

      <section aria-labelledby="mt-fills" className={SECTION}>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 id="mt-fills" className="text-[15px] font-semibold text-text">
            Fills
          </h2>
          <span className="text-xs text-faint">
            Commission and fees in {account.currency}
          </span>
        </div>

        <div
          aria-hidden="true"
          className="hidden gap-x-2 px-0 pb-1.5 text-[12.5px] font-medium text-muted md:grid md:grid-cols-[1.2fr_1.3fr_0.8fr_0.8fr_0.9fr_0.8fr_0.8fr_44px]"
        >
          <span>Date</span>
          <span>Time</span>
          <span>Side</span>
          <span>{qtyLabel}</span>
          <span>Price</span>
          <span>Commission</span>
          <span>Fees</span>
          <span />
        </div>

        <ul className="flex flex-col gap-3 md:gap-2">
          {rows.map((r, i) => {
            const n = i + 1;
            const key: ErrorKey = `row:${r.key}`;
            const err = errors[key];
            const d = err ? `${key}-err` : undefined;
            const cell = (
              label: string,
              name: string,
              input: ReactNode,
              span = '',
            ) => (
              <div className={`min-w-0 ${span}`} data-cell={name}>
                <span
                  aria-hidden="true"
                  className="mb-1 block text-[12.5px] font-medium text-muted md:hidden"
                >
                  {label}
                </span>
                {input}
              </div>
            );
            const common = {
              'aria-describedby': d,
              'aria-invalid': err ? (true as const) : undefined,
              className: INPUT,
            };
            return (
              <li key={r.key}>
                <div className="grid grid-cols-2 items-end gap-x-2 gap-y-2.5 rounded-control border border-line bg-bg/40 p-3 md:grid-cols-[1.2fr_1.3fr_0.8fr_0.8fr_0.9fr_0.8fr_0.8fr_44px] md:border-0 md:bg-transparent md:p-0">
                  {cell(
                    'Date',
                    'date',
                    <input
                      {...common}
                      ref={ref(`date:${r.key}`)}
                      type="date"
                      aria-label={`Fill ${n} date`}
                      value={r.date}
                      onChange={(e) =>
                        patchRow(r.key, { date: e.target.value })
                      }
                    />,
                  )}
                  {cell(
                    'Time',
                    'time',
                    <input
                      {...common}
                      type="time"
                      aria-label={`Fill ${n} time`}
                      value={r.time}
                      onChange={(e) =>
                        patchRow(r.key, { time: e.target.value })
                      }
                    />,
                  )}
                  {cell(
                    'Side',
                    'side',
                    <Select
                      {...common}
                      aria-label={`Fill ${n} side`}
                      value={r.side}
                      onChange={(e) =>
                        patchRow(r.key, { side: e.target.value as Side })
                      }
                    >
                      <option value="buy">Buy</option>
                      <option value="sell">Sell</option>
                    </Select>,
                  )}
                  {cell(
                    qtyLabel,
                    'qty',
                    <input
                      {...common}
                      ref={ref(`qty:${r.key}`)}
                      type="text"
                      inputMode="decimal"
                      autoComplete="off"
                      aria-label={`Fill ${n} quantity`}
                      value={r.qty}
                      onChange={(e) => patchRow(r.key, { qty: e.target.value })}
                    />,
                  )}
                  {cell(
                    'Price',
                    'price',
                    <input
                      {...common}
                      type="text"
                      inputMode="decimal"
                      autoComplete="off"
                      aria-label={`Fill ${n} price`}
                      value={r.price}
                      onChange={(e) =>
                        patchRow(r.key, { price: e.target.value })
                      }
                    />,
                  )}
                  {cell(
                    'Commission',
                    'commission',
                    <input
                      {...common}
                      type="text"
                      inputMode="decimal"
                      autoComplete="off"
                      placeholder="0"
                      aria-label={`Fill ${n} commission`}
                      value={r.commission}
                      onChange={(e) =>
                        patchRow(r.key, { commission: e.target.value })
                      }
                    />,
                  )}
                  {cell(
                    'Fees',
                    'fees',
                    <input
                      {...common}
                      type="text"
                      inputMode="decimal"
                      autoComplete="off"
                      placeholder="0"
                      aria-label={`Fill ${n} fees`}
                      value={r.fees}
                      onChange={(e) =>
                        patchRow(r.key, { fees: e.target.value })
                      }
                    />,
                  )}
                  <button
                    type="button"
                    aria-label={`Remove fill ${n}`}
                    onClick={() =>
                      setRows((rs) => rs.filter((x) => x.key !== r.key))
                    }
                    className="inline-flex h-[38px] items-center justify-center gap-2 rounded-control text-[13px] font-medium text-muted outline-offset-2 transition-colors hover:bg-sunken hover:text-text focus-visible:outline-2 focus-visible:outline-accent md:w-11 pointer-coarse:h-11"
                  >
                    <Trash size={16} aria-hidden="true" />
                    <span className="md:hidden">Remove</span>
                  </button>
                </div>
                <ErrorText id={`${key}-err`}>{err}</ErrorText>
              </li>
            );
          })}
        </ul>

        <div className="mt-3">
          <button
            type="button"
            ref={ref('fills')}
            aria-describedby={describe('fills')}
            onClick={() =>
              setRows((rs) => {
                const last = rs[rs.length - 1];
                return [
                  ...rs,
                  {
                    ...blankRow(nextKey.current++),
                    date: last?.date ?? '',
                    side: last ? (last.side === 'buy' ? 'sell' : 'buy') : 'buy',
                  },
                ];
              })
            }
            className={`${buttonClasses('secondary', 'sm')} gap-1.5 outline-offset-2 focus-visible:outline-2 focus-visible:outline-accent`}
          >
            <Plus size={14} weight="bold" aria-hidden="true" />
            Add fill
          </button>
          <ErrorText id="fills-err">{fillsErr}</ErrorText>
        </div>
      </section>

      <section aria-labelledby="mt-plan" className={SECTION}>
        <h2 id="mt-plan" className="mb-3 text-[15px] font-semibold text-text">
          Plan
        </h2>
        <div className="grid grid-cols-2 gap-x-3 gap-y-3.5 sm:max-w-[28rem]">
          <Field
            label="Planned stop"
            error={errors.stop}
            hint="Optional. Sets the risk, so R can be worked out."
          >
            {(p) => (
              <input
                {...p}
                ref={ref('stop')}
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={stop}
                onChange={(e) => setStop(e.target.value)}
                className={INPUT}
              />
            )}
          </Field>
          <Field label="Planned target" error={errors.target} hint="Optional.">
            {(p) => (
              <input
                {...p}
                ref={ref('target')}
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                className={INPUT}
              />
            )}
          </Field>
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={saving}>
          Save trade
        </Button>
        <Link href={cancelHref} className={buttonClasses('ghost')}>
          Cancel
        </Link>
        <div aria-live="polite">
          {saveFailed ? (
            <p
              role="alert"
              className="flex items-center gap-1.5 text-[13px] text-text"
            >
              <Warning size={14} aria-hidden="true" className="text-muted" />
              The trade could not be saved. Try again.
            </p>
          ) : null}
        </div>
      </div>
    </form>
  );
}

function Notice({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-[920px] flex-col items-start gap-3 px-5 pt-1 pb-10 lg:pt-0">
      <div className={`${SECTION} flex w-full flex-col items-start gap-3`}>
        <p className="text-[15px] font-semibold text-text">{title}</p>
        {children}
      </div>
    </div>
  );
}

/** Add a trade by hand, or (with `tradeId`) edit one that was entered by hand. */
export function ManualTradeForm({ tradeId }: { tradeId?: string }) {
  const accounts = useAccounts();
  const prefs = usePrefs();
  const trade = useTrade(tradeId ?? '');
  const preferredAccountId = useSearchParams().get('account');

  if (
    !accounts.data ||
    !prefs.data ||
    (tradeId !== undefined && trade.data === undefined)
  )
    return (
      <div aria-busy="true" className="mx-auto h-64 w-full max-w-[920px] px-5">
        <span className="sr-only">Loading</span>
      </div>
    );

  if (tradeId !== undefined && !trade.data)
    return (
      <Notice title="This trade isn't in this workspace.">
        <Link href="/app/trades" className={buttonClasses('secondary')}>
          Back to trades
        </Link>
      </Notice>
    );
  if (trade.data && trade.data.source !== 'manual')
    return (
      <Notice title="Only trades you entered by hand can be edited here.">
        <p className="text-[13.5px] text-muted">
          This one came from an import. Undo the import, or change it from the
          trade page.
        </p>
        <Link
          href={`/app/trades/${encodeURIComponent(trade.data.id)}`}
          className={buttonClasses('secondary')}
        >
          Back to trade
        </Link>
      </Notice>
    );

  const usable = accounts.data.filter(
    (a) => a.status === 'active' || a.id === trade.data?.accountId,
  );
  if (usable.length === 0)
    return (
      <Notice title="Add an account first.">
        <Link
          href="/app/settings/accounts"
          className={buttonClasses('secondary')}
        >
          Go to accounts
        </Link>
      </Notice>
    );
  return (
    <Form
      trade={trade.data ?? null}
      accounts={usable}
      prefsZone={prefs.data.timeZone}
      preferredAccountId={preferredAccountId}
    />
  );
}
