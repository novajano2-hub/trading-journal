'use client';

import {
  CaretLeft,
  CaretRight,
  MagnifyingGlass,
} from '@phosphor-icons/react/dist/ssr';
import { useMemo, useState } from 'react';
import { CARD, CardHeader } from '@/components/app/dashboard/shared';
import { FilterChip, RadioRows } from '@/components/app/filter-chip';
import { FigureText } from '@/components/product/figure-text';
import {
  useAccounts,
  useCashFlows,
  useFeeRules,
  useHistory,
  usePrefs,
  useStrategies,
  useTagCategories,
  useTags,
  useTargetRules,
  useTrades,
} from '@/data/query/hooks';
import type {
  HistoryAction,
  HistoryRow,
  HistorySource,
  HistoryType,
} from '@/domain/types';
import { useDisplay } from '@/lib/display';
import { usePhone } from '@/lib/use-phone';
import {
  ACTION_LABEL,
  ACTION_OPTIONS,
  fieldLabel,
  foldCreations,
  historyTime,
  matches,
  orderRows,
  shownValue,
  SOURCE_LABEL,
  SOURCE_OPTIONS,
  TYPE_LABEL,
  TYPE_OPTIONS,
  zoneWords,
  type HistoryLookups,
  type Shown,
} from './history-format';

/** B29: the table pages at 50 rows. */
const PAGE = 50;
const HEADING = 'edit-history-heading';

const TH =
  'h-10 px-3 text-left text-[12px] font-medium whitespace-nowrap text-faint first:pl-5 last:pr-5';
const TD = 'h-[58px] px-3 align-middle first:pl-5 last:pr-5';
/** The comp's search: 32px, the height of the filter chips beside it. */
const SEARCH =
  'block h-8 w-full rounded-control border border-line-2 bg-surface-1 pr-3 pl-9 text-[13.5px] font-medium text-text shadow-[var(--shadow-chip)] transition-[border-color,box-shadow] duration-200 outline-none placeholder:font-normal placeholder:text-faint hover:border-faint focus-visible:border-accent focus-visible:shadow-[0_0_0_3px_var(--accent-soft)] pointer-coarse:h-11';
const SOURCE_PILL =
  'inline-flex h-[22px] max-w-full items-center truncate rounded-full bg-sunken px-2 text-[12px] font-[550] text-muted';
const PAGE_BUTTON =
  'grid size-[30px] place-items-center rounded-[8px] border border-line bg-surface-1 text-muted outline-offset-2 transition-[border-color] duration-200 ease-(--ease-glide) enabled:hover:border-accent/35 enabled:hover:text-text focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40 pointer-coarse:size-11';

const NO_ROWS: readonly HistoryRow[] = [];

/** The change's two sides, or nothing for a row with no field. */
function changeOf(
  row: HistoryRow,
  ctx: HistoryLookups,
): { from: Shown; to: Shown } | null {
  if (row.field === undefined) return null;
  return {
    from: shownValue(row, 'oldValue', ctx),
    to: shownValue(row, 'newValue', ctx),
  };
}

function When({ at, timeZone }: { at: string; timeZone: string }) {
  const { when, offset } = historyTime(at, timeZone);
  return (
    <>
      <span className="whitespace-nowrap">{when}</span>{' '}
      <span className="whitespace-nowrap">{offset}</span>
    </>
  );
}

/**
 * Settings > Logs, under the import log: every change to a logged record in
 * the last 30 days (Plan 6B spec §5.9, B26 to B29), newest first, 50 to a
 * page, with a search over type, identifier and field and a filter each for
 * type, action and source. Values read through Display, so Privacy hides
 * money. On a phone each change is two lines.
 */
export function HistoryCard(): React.JSX.Element {
  const history = useHistory();
  const prefs = usePrefs().data;
  const timeZone = prefs?.timeZone ?? 'UTC';
  const display = useDisplay();
  const phone = usePhone();
  // What names a record and says which currency its money is in.
  const accountsQ = useAccounts();
  const strategiesQ = useStrategies();
  const tagsQ = useTags();
  const categoriesQ = useTagCategories();
  const tradesQ = useTrades();
  const flowsQ = useCashFlows();
  const targetRulesQ = useTargetRules();
  const feeRulesQ = useFeeRules();
  // Rows wait for the names, so none reads as removed while they load; a list that fails to load leaves its ids unnamed.
  const naming = [
    accountsQ,
    strategiesQ,
    tagsQ,
    categoriesQ,
    tradesQ,
    flowsQ,
    targetRulesQ,
    feeRulesQ,
  ].some((q) => q.status === 'pending');
  const accounts = accountsQ.data;
  const strategies = strategiesQ.data;
  const tags = tagsQ.data;
  const categories = categoriesQ.data;
  const trades = tradesQ.data;
  const flows = flowsQ.data;
  const targetRules = targetRulesQ.data;
  const feeRules = feeRulesQ.data;

  const [q, setQ] = useState('');
  const [type, setType] = useState<HistoryType>();
  const [action, setAction] = useState<HistoryAction>();
  const [source, setSource] = useState<HistorySource>();
  const [page, setPage] = useState(0);

  const lookups = useMemo(() => {
    const accountsById = new Map((accounts ?? []).map((a) => [a.id, a]));
    const accountCurrency = (id: string) => accountsById.get(id)?.currency;
    const currencyOf = new Map<string, string>();
    const put = (key: string, currency: string | undefined) => {
      if (currency) currencyOf.set(key, currency);
    };
    for (const a of accounts ?? []) put(`account:${a.id}`, a.currency);
    for (const t of trades ?? []) put(`trade:${t.id}`, t.pnlCurrency);
    for (const f of flows ?? [])
      put(`cash-flow:${f.id}`, accountCurrency(f.accountId));
    for (const r of targetRules ?? [])
      put(`target-rule:${r.id}`, accountCurrency(r.accountId));
    for (const r of feeRules ?? [])
      put(`fee-rule:${r.id}`, accountCurrency(r.accountId));
    return {
      accounts: accountsById,
      strategies: new Map((strategies ?? []).map((s) => [s.id, s.name])),
      tags: new Map((tags ?? []).map((t) => [t.id, t.name])),
      categories: new Map((categories ?? []).map((c) => [c.id, c.name])),
      currencyOf,
    };
  }, [
    accounts,
    strategies,
    tags,
    categories,
    trades,
    flows,
    targetRules,
    feeRules,
  ]);
  const ctx: HistoryLookups = {
    ...lookups,
    display,
    baseCurrency: prefs?.baseCurrency ?? 'USD',
  };

  const ordered = useMemo(
    () => orderRows(foldCreations(history.data ?? NO_ROWS)),
    [history.data],
  );
  const shown = useMemo(
    () => ordered.filter((r) => matches(r, { q, type, action, source })),
    [ordered, q, type, action, source],
  );
  const pages = Math.max(1, Math.ceil(shown.length / PAGE));
  const at = Math.min(page, pages - 1);
  const slice = shown.slice(at * PAGE, at * PAGE + PAGE);
  const from = shown.length === 0 ? 0 : at * PAGE + 1;
  const to = at * PAGE + slice.length;
  const filtered = q.trim() !== '' || !!type || !!action || !!source;

  /** Any change to what is searched or filtered starts again at the first page. */
  const refine =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      set(v);
      setPage(0);
    };
  const clearAll = () => {
    setQ('');
    setType(undefined);
    setAction(undefined);
    setSource(undefined);
    setPage(0);
  };

  return (
    <section
      aria-labelledby={HEADING}
      className={`${CARD} overflow-hidden pt-[18px] pb-3`}
    >
      <CardHeader
        className="px-5"
        headingId={HEADING}
        title="Edit history"
        after={
          <span className="text-[12.5px] leading-snug text-faint">
            Changes from the last 30 days, in {zoneWords(timeZone)}
          </span>
        }
      />

      {history.status === 'error' ? (
        <p role="alert" className="px-5 pt-3 text-[13.5px] text-loss">
          Keel couldn&apos;t read the edit history. Reload the page to try
          again.
        </p>
      ) : !history.data || naming ? (
        <Loading />
      ) : ordered.length === 0 ? (
        <div className="px-5 pt-3 pb-2 text-[13.5px] leading-snug">
          <p className="font-medium text-text">No changes yet</p>
          <p className="mt-1 text-muted">
            Edits to trades, accounts, balance adjustments, strategies, tags and
            default rules show here, with each import. Keel keeps them for 30
            days.
          </p>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 px-5 pt-3">
            <div className="relative w-full sm:w-[300px]">
              <MagnifyingGlass
                aria-hidden="true"
                size={16}
                className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-faint"
              />
              <input
                type="search"
                aria-label="Search edit history"
                placeholder="Search type, identifier or field"
                value={q}
                onChange={(e) => refine(setQ)(e.target.value)}
                className={SEARCH}
              />
            </div>
            <span className="text-[12.5px] text-faint sm:ml-2">Filter by</span>
            <Filter
              title="Type"
              value={type}
              labels={TYPE_LABEL}
              options={TYPE_OPTIONS}
              onChange={refine(setType)}
            />
            <Filter
              title="Action"
              value={action}
              labels={ACTION_LABEL}
              options={ACTION_OPTIONS}
              onChange={refine(setAction)}
            />
            <Filter
              title="Source"
              value={source}
              labels={SOURCE_LABEL}
              options={SOURCE_OPTIONS}
              onChange={refine(setSource)}
            />
          </div>

          {shown.length === 0 ? (
            <div className="px-5 pt-5 pb-3 text-[13.5px] leading-snug">
              <p className="font-medium text-text">No changes match</p>
              <p className="mt-1 text-muted">
                Nothing in the last 30 days matches the search and filters.
              </p>
              <button
                type="button"
                onClick={clearAll}
                className="-ml-2 mt-1.5 inline-flex h-8 items-center rounded-chip px-2 text-[13px] font-semibold text-accent-ink transition-colors duration-200 hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:h-11"
              >
                Clear the search and filters
              </button>
            </div>
          ) : phone ? (
            <PhoneRows rows={slice} ctx={ctx} timeZone={timeZone} />
          ) : (
            <TableRows rows={slice} ctx={ctx} timeZone={timeZone} />
          )}

          {/* Always there, so a search that leaves nothing is announced too. */}
          <p aria-live="polite" className="sr-only">
            {filtered
              ? `${shown.length.toLocaleString('en-US')} ${shown.length === 1 ? 'change matches' : 'changes match'}`
              : ''}
          </p>
          {shown.length === 0 ? null : (
            <div className="mt-1 flex items-center gap-2 border-t border-line px-5 pt-3 pb-1 text-[12.5px] text-faint">
              <p className="tabular-nums">
                {from.toLocaleString('en-US')} to {to.toLocaleString('en-US')}{' '}
                of {shown.length.toLocaleString('en-US')}
              </p>
              <nav
                aria-label="Edit history pages"
                className="ml-auto flex gap-1.5"
              >
                <button
                  type="button"
                  aria-label="Previous page"
                  disabled={at === 0}
                  onClick={() => setPage(at - 1)}
                  className={PAGE_BUTTON}
                >
                  <CaretLeft size={14} weight="bold" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  aria-label="Next page"
                  disabled={at >= pages - 1}
                  onClick={() => setPage(at + 1)}
                  className={PAGE_BUTTON}
                >
                  <CaretRight size={14} weight="bold" aria-hidden="true" />
                </button>
              </nav>
            </div>
          )}
        </>
      )}
    </section>
  );
}

/** One filter chip: it names the filter at rest and reads as its value once set (B29). */
function Filter<T extends string>({
  title,
  value,
  labels,
  options,
  onChange,
}: {
  title: string;
  value: T | undefined;
  labels: Record<T, string>;
  options: readonly { value: T; label: string }[];
  onChange(v: T | undefined): void;
}): React.JSX.Element {
  return (
    <FilterChip
      label={value ? labels[value] : title}
      title={title}
      active={value !== undefined}
      onClear={() => onChange(undefined)}
    >
      {(close) => (
        <RadioRows
          legend={title}
          options={options}
          value={value}
          onChange={(v) => {
            onChange(v);
            close();
          }}
        />
      )}
    </FilterChip>
  );
}

function Loading(): React.JSX.Element {
  return (
    <div role="status" aria-label="Loading the edit history" className="mt-3">
      {Array.from({ length: 4 }, (_, i) => (
        <div
          key={i}
          aria-hidden="true"
          className="flex h-[58px] items-center gap-6 border-t border-line/70 px-5"
        >
          <span className="h-3 w-28 rounded-full bg-sunken" />
          <span className="h-3 w-40 rounded-full bg-sunken" />
          <span className="h-3 flex-1 rounded-full bg-sunken" />
        </div>
      ))}
    </div>
  );
}

function TableRows({
  rows,
  ctx,
  timeZone,
}: {
  rows: readonly HistoryRow[];
  ctx: HistoryLookups;
  timeZone: string;
}): React.JSX.Element {
  return (
    <table
      aria-labelledby={HEADING}
      className="mt-2.5 w-full table-fixed border-collapse text-[13px]"
    >
      <colgroup>
        <col className="w-[19%]" />
        <col className="w-[26%]" />
        <col />
        <col className="w-[11%]" />
        <col className="w-[11%]" />
      </colgroup>
      <thead>
        <tr className="border-b border-line">
          <th scope="col" className={TH}>
            Time
          </th>
          <th scope="col" className={TH}>
            Record
          </th>
          <th scope="col" className={TH}>
            Change
          </th>
          <th scope="col" className={TH}>
            Action
          </th>
          <th scope="col" className={TH}>
            Source
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const field = fieldLabel(row);
          const change = changeOf(row, ctx);
          return (
            <tr
              key={row.id}
              className="border-b border-line/70 last:border-b-0"
            >
              <td className={`${TD} text-muted tabular-nums`}>
                <When at={row.at} timeZone={timeZone} />
              </td>
              <td className={TD}>
                <span className="block text-[12px] leading-[1.4] text-faint">
                  {TYPE_LABEL[row.type]}
                </span>{' '}
                <span
                  className="block truncate font-[550] text-text"
                  title={row.label}
                >
                  {row.label}
                </span>
              </td>
              <td className={TD}>
                {change && field ? (
                  <>
                    <span className="block truncate font-[550] text-text">
                      {field}
                    </span>{' '}
                    <span
                      className="block truncate text-[12.5px] leading-[1.4] text-muted tabular-nums"
                      title={`${change.from.text} to ${change.to.text}`}
                    >
                      <FigureText f={change.from} /> to{' '}
                      <FigureText f={change.to} />
                    </span>
                  </>
                ) : (
                  <span className="text-faint">None</span>
                )}
              </td>
              <td className={`${TD} truncate`}>{ACTION_LABEL[row.action]}</td>
              <td className={TD}>
                <span className={SOURCE_PILL}>{SOURCE_LABEL[row.source]}</span>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function PhoneRows({
  rows,
  ctx,
  timeZone,
}: {
  rows: readonly HistoryRow[];
  ctx: HistoryLookups;
  timeZone: string;
}): React.JSX.Element {
  return (
    <ul aria-labelledby={HEADING} className="mt-2 px-5">
      {rows.map((row) => {
        const field = fieldLabel(row);
        const change = changeOf(row, ctx);
        return (
          <li
            key={row.id}
            className="flex flex-col gap-1 border-t border-line/70 py-2.5 first:border-t-0"
          >
            <span
              data-line="1"
              className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5"
            >
              <span className="min-w-0 text-[14px] font-semibold break-words text-text">
                <span className="font-medium text-faint">
                  {TYPE_LABEL[row.type]}
                </span>{' '}
                {row.label}
              </span>{' '}
              <span className="ml-auto text-[12.5px] text-muted tabular-nums">
                <When at={row.at} timeZone={timeZone} />
              </span>
            </span>
            <span
              data-line="2"
              className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5 text-[12.5px] text-muted"
            >
              {change && field ? (
                <span className="min-w-0 break-words tabular-nums">
                  <b className="font-[550] text-text">{field}</b>:{' '}
                  <FigureText f={change.from} /> to <FigureText f={change.to} />
                </span>
              ) : (
                <span>No field</span>
              )}{' '}
              <span>{ACTION_LABEL[row.action]}</span>{' '}
              <span>{SOURCE_LABEL[row.source]}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
