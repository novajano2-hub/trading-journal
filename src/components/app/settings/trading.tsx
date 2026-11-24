'use client';

import { SlidersHorizontal } from '@phosphor-icons/react/dist/ssr';
import { useId, useState } from 'react';
import { CARD, CardHeader } from '@/components/app/dashboard/shared';
import { HELP, INPUT, LABEL } from '@/components/app/import/styles';
import { Segmented } from '@/components/ui/segmented';
import { usePrefs, useUpdatePrefs } from '@/data/query/hooks';
import type {
  AssetClass,
  BreakevenRange,
  PnlBasis,
  WeekStart,
} from '@/domain/types';
import { SaveStatus } from './profile';
import { FieldError } from './settings-ui';

const CLASSES: readonly { value: AssetClass; label: string }[] = [
  { value: 'stock', label: 'Stocks' },
  { value: 'option', label: 'Options' },
  { value: 'future', label: 'Futures' },
  { value: 'forex', label: 'Forex' },
  { value: 'crypto', label: 'Crypto' },
  { value: 'cfd', label: 'CFDs' },
];

/** A figure typed as text: dollars or percent, as a number; null when it isn't one. */
function parseAmount(text: string): number | null {
  const n = Number(text.replace(/,/g, '').trim());
  return text.trim() === '' || !Number.isFinite(n) ? null : n;
}

/** The range's bound as the field shows it: dollars, or a percentage. */
function shown(range: BreakevenRange, edge: 'from' | 'to'): string {
  const v = range[edge];
  const n = range.unit === 'amount' ? v / 100 : v * 100;
  return String(Math.round(n * 1e6) / 1e6);
}

/** The range from what is typed; null when a field isn't a number. */
function rangeOf(
  unit: BreakevenRange['unit'],
  from: string,
  to: string,
): BreakevenRange | null {
  const a = parseAmount(from);
  const b = parseAmount(to);
  if (a === null || b === null) return null;
  return unit === 'amount'
    ? { unit, from: Math.round(a * 100), to: Math.round(b * 100) }
    : { unit, from: a / 100, to: b / 100 };
}

/** The breakeven band: a trade whose P&L lands inside it is breakeven. */
function Breakeven(): React.JSX.Element | null {
  const prefs = usePrefs().data;
  const update = useUpdatePrefs();
  const fromId = useId();
  const toId = useId();
  const [held, setDraft] = useState<{
    key: string;
    from: string;
    to: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!prefs) return null;
  const range = prefs.breakevenRange;
  // What is typed belongs to the range it was typed over: once a save lands, it is stale.
  const key = `${range.unit}:${range.from}:${range.to}`;
  const draft = held?.key === key ? held : null;
  const from = draft?.from ?? shown(range, 'from');
  const to = draft?.to ?? shown(range, 'to');

  const commit = (nextFrom: string, nextTo: string) => {
    const next = rangeOf(range.unit, nextFrom, nextTo);
    if (next === null) return setError('Enter a number in each field.');
    if (!(next.from <= next.to)) return setError('From must be at most To.');
    setError(null);
    if (next.from === range.from && next.to === range.to) return;
    update.mutate({ breakevenRange: next });
  };

  const field = (
    id: string,
    label: string,
    value: string,
    set: (v: string) => void,
    onBlur: () => void,
  ) => (
    <div className="w-[130px]">
      <label htmlFor={id} className={LABEL}>
        {label}
      </label>
      <div className="relative">
        {range.unit === 'amount' ? (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[13.5px] text-faint"
          >
            $
          </span>
        ) : null}
        <input
          id={id}
          inputMode="decimal"
          value={value}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? 'breakeven-error' : undefined}
          onChange={(e) => {
            set(e.target.value);
            setError(null);
          }}
          onBlur={onBlur}
          className={`${INPUT} ${range.unit === 'amount' ? 'pl-6' : 'pr-7'}`}
        />
        {range.unit === 'percent' ? (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-[13.5px] text-faint"
          >
            %
          </span>
        ) : null}
      </div>
    </div>
  );

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span
          id="breakeven-label"
          className="text-[14px] font-medium text-text"
        >
          Breakeven range
        </span>
        <Segmented
          label="Breakeven unit"
          value={range.unit}
          options={[
            { value: 'amount', label: '$' },
            { value: 'percent', label: '%' },
          ]}
          coarseTargets
          onChange={(unit) => {
            // Dollars don't convert to a percentage, so the band starts again at zero.
            setError(null);
            update.mutate({
              breakevenRange:
                unit === 'amount'
                  ? { unit: 'amount', from: 0, to: 0 }
                  : { unit: 'percent', from: 0, to: 0 },
            });
          }}
        />
      </div>
      <div
        role="group"
        aria-labelledby="breakeven-label"
        className="mt-3 flex flex-wrap items-start gap-3"
      >
        {field(
          fromId,
          'From',
          from,
          (v) => setDraft({ key, from: v, to }),
          () => draft && commit(draft.from, to),
        )}
        {field(
          toId,
          'To',
          to,
          (v) => setDraft({ key, from, to: v }),
          () => draft && commit(from, draft.to),
        )}
      </div>
      {error ? (
        <FieldError id="breakeven-error">{error}</FieldError>
      ) : (
        <p className={HELP}>
          {range.unit === 'amount'
            ? 'A trade that closes between these two amounts counts as breakeven, not a win or a loss.'
            : 'A trade whose return on the capital it committed lands between these two counts as breakeven. A tenth of a percent is 0.1.'}
        </p>
      )}
    </div>
  );
}

/** The instruments you trade, the breakeven band, expired options and the default basis. */
export function TradingSettings(): React.JSX.Element {
  const prefs = usePrefs().data;
  const update = useUpdatePrefs();
  const [intent, setIntent] = useState<AssetClass[] | null>(null);
  if (!prefs)
    return (
      <section className={`${CARD} px-5 pt-[18px] pb-5`}>
        <p role="status" className="text-[13.5px] text-muted">
          Loading your trading settings...
        </p>
      </section>
    );

  // Chips pressed before the first save lands build on each other, not on the old list.
  const traded = (update.isPending && intent) || prefs.instrumentsTraded;
  const toggle = (value: AssetClass) => {
    const next = traded.includes(value)
      ? traded.filter((c) => c !== value)
      : CLASSES.map((c) => c.value).filter(
          (c) => c === value || traded.includes(c),
        );
    setIntent(next);
    update.mutate({ instrumentsTraded: next });
  };

  return (
    <section
      aria-labelledby="trading-heading"
      className={`${CARD} px-5 pt-[18px] pb-6`}
    >
      <CardHeader
        icon={SlidersHorizontal}
        tone="accent"
        headingId="trading-heading"
        title="Trading"
      />
      <div className="mt-5 grid max-w-[560px] gap-7">
        <fieldset>
          <legend className="text-[14px] font-medium text-text">
            Instruments you trade
          </legend>
          <p className={HELP}>
            Pick every kind of instrument you trade. Keel leaves the others out
            of its choices.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {CLASSES.map((c) => {
              const on = traded.includes(c.value);
              return (
                <label
                  key={c.value}
                  className={`inline-flex h-9 cursor-pointer items-center rounded-full border px-3.5 text-[13.5px] font-medium transition-colors duration-200 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent pointer-coarse:h-11 ${
                    on
                      ? 'border-transparent bg-accent-soft text-accent-ink'
                      : 'border-line-2 bg-surface-1 text-muted hover:border-faint hover:text-text'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => toggle(c.value)}
                    className="sr-only"
                  />
                  {c.label}
                </label>
              );
            })}
          </div>
        </fieldset>

        <Breakeven />

        <div className="flex items-start gap-4">
          <div className="min-w-0 flex-1">
            <span
              id="settle-label"
              className="block text-[14px] font-medium text-text"
            >
              Settle expired options at zero
            </span>
            <p id="settle-help" className={HELP}>
              An option still open past its expiry closes at zero on that day,
              so it books its full loss without a hand-made exit.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={prefs.settleExpiredOptions}
            aria-labelledby="settle-label"
            aria-describedby="settle-help"
            onClick={() =>
              update.mutate({
                settleExpiredOptions: !prefs.settleExpiredOptions,
              })
            }
            className={`relative mt-0.5 h-6 w-10 flex-none rounded-full transition-colors duration-200 outline-offset-2 focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:h-7 pointer-coarse:w-12 ${prefs.settleExpiredOptions ? 'bg-accent' : 'bg-line-2'}`}
          >
            <span
              aria-hidden="true"
              className={`absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow-[var(--shadow-chip)] transition-transform duration-200 pointer-coarse:size-6 ${prefs.settleExpiredOptions ? 'translate-x-4 pointer-coarse:translate-x-5' : ''}`}
            />
          </button>
        </div>

        <div>
          <span className="block text-[14px] font-medium text-text">
            Default P&amp;L basis
          </span>
          <p className={HELP}>
            Net takes fees and commissions out. The P&amp;L choice in the
            Display menu changes the same setting.
          </p>
          <Segmented<PnlBasis>
            label="Default P&L basis"
            className="mt-3"
            value={prefs.pnlBasis}
            options={[
              { value: 'net', label: 'Net' },
              { value: 'gross', label: 'Gross' },
            ]}
            coarseTargets
            onChange={(pnlBasis) => update.mutate({ pnlBasis })}
          />
        </div>
        <div>
          <span className="block text-[14px] font-medium text-text">
            Weeks start on
          </span>
          <p className={HELP}>
            The Calendar, the weekly totals, the This week and Last week dates
            and the weekday reports all begin their weeks on this day.
          </p>
          <Segmented<WeekStart>
            label="Weeks start on"
            className="mt-3"
            value={prefs.weekStart ?? 'sunday'}
            options={[
              { value: 'sunday', label: 'Sunday' },
              { value: 'monday', label: 'Monday' },
            ]}
            coarseTargets
            onChange={(weekStart) => update.mutate({ weekStart })}
          />
        </div>
        <SaveStatus saving={update.isPending} failed={update.isError} />
      </div>
    </section>
  );
}
