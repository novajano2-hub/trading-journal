'use client';

import { CalendarBlank, Funnel } from '@phosphor-icons/react/dist/ssr';
import { useMemo, useState, type ReactNode } from 'react';
import {
  useAccounts,
  useChallenges,
  usePrefs,
  usePropTxns,
  useStrategies,
} from '@/data/query/hooks';
import {
  accountSize,
  CHALLENGE_TYPE_LABELS,
  type ChallengeType,
} from '@/domain/prop/finance';
import { useDisplay } from '@/lib/display';
import { usePhone } from '@/lib/use-phone';
import { rangeChipLabel } from '@/lib/range-label';
import { Segmented } from '@/components/ui/segmented';
import { CheckRows, FilterChip } from '../filter-chip';
import { toggleId } from '../filter-model';
import { DateBody } from '../filter-popovers';
import {
  FilterSheetShell,
  Row,
  SHEET_BUTTON,
  SheetFace,
} from '../filter-sheet';
import { NO_SELECTION, type PropSelection } from './prop-filter-params';
import { usePropFilters, type PropFilterState } from './use-prop-filters';

/** What the filters can choose from: the firms, sizes and strategies the workspace's own challenges and transactions carry. */
interface PropOptions {
  firms: string[];
  /** Account sizes in cents, smallest first. */
  sizes: number[];
  strategies: { id: string; name: string }[];
}

const TYPES: readonly ChallengeType[] = ['1-step', '2-step', 's2f'];

/** The choices the six filters offer; `undefined` until the workspace has loaded. */
function usePropOptions(): PropOptions | undefined {
  const challenges = useChallenges().data;
  const accounts = useAccounts().data;
  const txns = usePropTxns().data;
  const strategies = useStrategies().data;
  const baseCurrency = usePrefs().data?.baseCurrency;
  return useMemo(() => {
    if (!challenges || !accounts || !txns || !strategies || !baseCurrency)
      return undefined;
    const firms = [
      ...new Set(
        [...challenges.map((c) => c.firm), ...txns.map((t) => t.firm)]
          .map((f) => f.trim())
          .filter(Boolean),
      ),
    ].sort((a, b) => a.localeCompare(b));
    // A size is read on the base currency's accounts, as the dashboard reads it.
    const own = accounts.filter((a) => a.currency === baseCurrency);
    const sizes = [
      ...new Set(
        challenges
          .map((c) => accountSize(c, own))
          .filter((s): s is number => s !== null),
      ),
    ].sort((a, b) => a - b);
    // Only the strategies a challenge carries: any other would match nothing.
    const used = new Set(challenges.flatMap((c) => c.strategyIds ?? []));
    return {
      firms,
      sizes,
      strategies: strategies
        .filter((s) => used.has(s.id))
        .map((s) => ({ id: s.id, name: s.name }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    };
  }, [challenges, accounts, txns, strategies, baseCurrency]);
}

const toggle = <T,>(list: readonly T[], value: T): T[] =>
  list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

const PHASES = [
  { value: 'any', label: 'Any' },
  { value: 'evaluation', label: 'Evaluation' },
  { value: 'funded', label: 'Funded' },
] as const;
const STATUSES = [
  { value: 'any', label: 'Any' },
  { value: 'active', label: 'Active' },
  { value: 'breached', label: 'Breached' },
] as const;

function None({ children }: { children: ReactNode }): React.JSX.Element {
  return <p className="px-2 py-2 text-[13px] text-muted">{children}</p>;
}

/** The six filters' controls, one block each: checkboxes where several can be chosen, radios where one can. */
function Choices({
  name,
  selection: s,
  options,
  onChange,
}: {
  name: 'firm' | 'phase' | 'status' | 'size' | 'type' | 'strategy';
  selection: PropSelection;
  options: PropOptions;
  onChange(next: PropSelection): void;
}): React.JSX.Element {
  const display = useDisplay();
  switch (name) {
    case 'firm':
      return options.firms.length === 0 ? (
        <None>No firms yet.</None>
      ) : (
        <CheckRows
          legend="Firm"
          items={options.firms.map((f) => ({ id: f, label: f }))}
          selected={s.firm}
          onToggle={(id) => onChange({ ...s, firm: toggleId(s.firm, id) })}
        />
      );
    // One choice among few, and Any: a switch, which takes a line where radio rows take four.
    case 'phase':
      return (
        <div className="px-2 pt-0.5 pb-1.5">
          <Segmented
            label="Phase"
            options={PHASES}
            value={s.phase ?? 'any'}
            coarseTargets
            onChange={(v) =>
              onChange({ ...s, phase: v === 'any' ? undefined : v })
            }
          />
        </div>
      );
    case 'status':
      return (
        <div className="px-2 pt-0.5 pb-1.5">
          <Segmented
            label="Status"
            options={STATUSES}
            value={s.status ?? 'any'}
            coarseTargets
            onChange={(v) =>
              onChange({ ...s, status: v === 'any' ? undefined : v })
            }
          />
        </div>
      );
    case 'size':
      return options.sizes.length === 0 ? (
        <None>No account sizes yet.</None>
      ) : (
        <CheckRows
          legend="Account size"
          // A size is an amount: it reads as the display shows one, hidden under Privacy.
          items={options.sizes.map((cents) => ({
            id: String(cents),
            label: display.cash(cents, false).text,
          }))}
          selected={s.size.map(String)}
          onToggle={(id) =>
            onChange({ ...s, size: toggle(s.size, Number(id)) })
          }
        />
      );
    case 'type':
      return (
        <CheckRows
          legend="Account type"
          items={TYPES.map((t) => ({ id: t, label: CHALLENGE_TYPE_LABELS[t] }))}
          selected={s.type}
          onToggle={(id) =>
            onChange({ ...s, type: toggle(s.type, id as ChallengeType) })
          }
        />
      );
    case 'strategy':
      return options.strategies.length === 0 ? (
        <None>No strategy is on a challenge yet.</None>
      ) : (
        <CheckRows
          legend="Strategy"
          items={options.strategies.map((x) => ({ id: x.id, label: x.name }))}
          selected={s.strategy}
          onToggle={(id) =>
            onChange({ ...s, strategy: toggleId(s.strategy, id) })
          }
        />
      );
  }
}

const GROUPS = [
  ['firm', 'Firm'],
  ['phase', 'Phase'],
  ['status', 'Status'],
  ['size', 'Account size'],
  ['type', 'Account type'],
  ['strategy', 'Strategy'],
] as const;

/** The Filters popover's body: the six filters under their names. */
function FilterBody({
  selection,
  options,
  onChange,
}: {
  selection: PropSelection;
  options: PropOptions;
  onChange(next: PropSelection): void;
}): React.JSX.Element {
  return (
    <>
      {GROUPS.map(([name, title]) => (
        <div
          key={name}
          data-filter={name}
          className="border-b border-line pb-1.5 last:border-b-0 last:pb-0"
        >
          <p
            aria-hidden="true"
            className="px-2 pt-2 pb-1 text-[12px] font-medium text-faint"
          >
            {title}
          </p>
          <Choices
            name={name}
            selection={selection}
            options={options}
            onChange={onChange}
          />
        </div>
      ))}
    </>
  );
}

/** The two chips before the workspace has loaded: the same, inert. */
export function PropChipsInert({
  dateLabel = 'All time',
}: {
  dateLabel?: string;
}): React.JSX.Element {
  return (
    <div role="group" aria-label="Filters" className="flex items-center gap-1">
      <FilterChip
        label={dateLabel}
        title="Date"
        active={false}
        disabled
        onClear={() => {}}
        icon={CalendarBlank}
        alwaysSet
      >
        {() => null}
      </FilterChip>
      <FilterChip
        label="Filters"
        title="Filters"
        active={false}
        disabled
        onClear={() => {}}
        icon={Funnel}
      >
        {() => null}
      </FilterChip>
    </div>
  );
}

function PropFilterRow({
  f,
  options,
}: {
  f: PropFilterState;
  options: PropOptions;
}): React.JSX.Element {
  return (
    <div
      role="group"
      aria-label="Filters"
      className="flex min-w-0 items-center gap-1"
    >
      <FilterChip
        label={rangeChipLabel(f.range, f.dates)}
        title="Date"
        active={f.dateSet}
        onClear={() => f.setRange({})}
        wide
        icon={CalendarBlank}
        alwaysSet
      >
        {(close) => (
          <DateBody
            range={f.range}
            today={f.today}
            onChange={f.setRange}
            close={close}
          />
        )}
      </FilterChip>
      <FilterChip
        label={f.selected > 0 ? `Filters ${f.selected}` : 'Filters'}
        title="Filters"
        active={f.selected > 0}
        onClear={() => f.setSelection(NO_SELECTION)}
        icon={Funnel}
      >
        {() => (
          <FilterBody
            selection={f.selection}
            options={options}
            onChange={f.setSelection}
          />
        )}
      </FilterChip>
      {f.any ? (
        <button
          type="button"
          onClick={f.clear}
          className="ml-1.5 h-8 flex-none rounded-control px-2.5 text-[13px] font-semibold whitespace-nowrap text-accent-ink transition-colors duration-200 hover:bg-surface-1 pointer-coarse:h-11"
        >
          Clear filters
        </button>
      ) : null}
    </div>
  );
}

type Key = 'date' | (typeof GROUPS)[number][0];

/** What a filter is set to, as a row of the phone's sheet reads it. */
function summary(values: readonly string[]): string {
  if (values.length === 0) return 'Any';
  return values.length === 1
    ? values[0]!
    : `${values[0]} +${values.length - 1}`;
}

function PropFilterSheet({
  f,
  options,
}: {
  f: PropFilterState;
  options: PropOptions;
}): React.JSX.Element {
  const display = useDisplay();
  const [row, setRow] = useState<Key | null>(null);
  const s = f.selection;
  const count = f.selected + (f.dateSet ? 1 : 0);
  const strategyName = new Map(options.strategies.map((x) => [x.id, x.name]));
  const values: Record<(typeof GROUPS)[number][0], string[]> = {
    firm: s.firm,
    phase: s.phase ? [PHASES.find((p) => p.value === s.phase)!.label] : [],
    status: s.status ? [STATUSES.find((p) => p.value === s.status)!.label] : [],
    size: s.size.map((c) => display.cash(c, false).text),
    type: s.type.map((t) => CHALLENGE_TYPE_LABELS[t]),
    strategy: s.strategy.map((id) => strategyName.get(id) ?? id),
  };
  const clears: Partial<Record<Key, PropSelection>> = {
    firm: { ...s, firm: [] },
    size: { ...s, size: [] },
    type: { ...s, type: [] },
    strategy: { ...s, strategy: [] },
  };
  const flip = (key: Key) => setRow((r) => (r === key ? null : key));
  return (
    <FilterSheetShell
      name={count > 0 ? `Filters, ${count} active` : 'Filters'}
      Glyph={Funnel}
      count={count}
      title="Filters"
      onClosed={() => setRow(null)}
      onClear={f.any ? f.clear : undefined}
    >
      <Row
        wideTitle
        title="Date"
        value={rangeChipLabel(f.range, f.dates)}
        set={f.dateSet}
        open={row === 'date'}
        onToggle={() => flip('date')}
      >
        <DateBody
          range={f.range}
          today={f.today}
          onChange={f.setRange}
          close={() => setRow(null)}
        />
      </Row>
      {GROUPS.map(([name, title]) => {
        const clear = clears[name];
        return (
          <Row
            wideTitle
            key={name}
            title={title}
            value={summary(values[name])}
            set={values[name].length > 0}
            open={row === name}
            onToggle={() => flip(name)}
            onClear={clear ? () => f.setSelection(clear) : undefined}
          >
            <Choices
              name={name}
              selection={s}
              options={options}
              onChange={f.setSelection}
            />
          </Row>
        );
      })}
    </FilterSheetShell>
  );
}

/**
 * The top bar's chips on the prop Dashboard and Accounts (C37): the global
 * date range, and a Filters popover with firm, phase, status, account size,
 * account type and strategy, with "Clear filters" while any is set. Below
 * `sm` they are one Filters button and its sheet. All of it is in the address
 * (`usePropFilters`). Render inside `<Suspense>`: it reads the search params.
 */
export function PropFilterBar(): React.JSX.Element {
  const f = usePropFilters();
  const options = usePropOptions();
  const phone = usePhone();
  if (!options || f.today === '')
    return phone ? (
      <button
        type="button"
        disabled
        aria-label="Filters"
        className={SHEET_BUTTON}
      >
        <SheetFace Glyph={Funnel} count={0} />
      </button>
    ) : (
      <PropChipsInert dateLabel={rangeChipLabel(f.range, f.dates)} />
    );
  return phone ? (
    <PropFilterSheet f={f} options={options} />
  ) : (
    <PropFilterRow f={f} options={options} />
  );
}
