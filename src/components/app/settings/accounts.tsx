'use client';

import { CheckCircle, Lock, Plus, X } from '@phosphor-icons/react/dist/ssr';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { ConfirmDialog, ConfirmFailure } from '@/components/app/confirm-dialog';
import { CARD, CardHeader } from '@/components/app/dashboard/shared';
import { writeParam } from '@/components/app/reports/use-report-data';
import { MoveDialog } from '@/components/app/trades/move-dialog';
import { SelectBox } from '@/components/app/trades/select-box';
import { FigureText } from '@/components/product/figure-text';
import { buttonClasses } from '@/components/ui/button-styles';
import { Chip } from '@/components/ui/chip';
import { MetricTip } from '@/components/ui/metric-tip';
import {
  useAccounts,
  useActiveWorkspace,
  useCashFlows,
  useClearAccountTrades,
  useImportHistory,
  usePrefs,
  useRemoveAccount,
  useTrades,
  useUpdateAccount,
} from '@/data/query/hooks';
import { balanceAt } from '@/domain/metrics/balance';
import { localDate } from '@/domain/time';
import type { Account, ImportJob, Trade } from '@/domain/types';
import { useDisplay } from '@/lib/display';
import { plural } from '@/lib/format';
import { useAddressCopy } from '@/lib/use-address-copy';
import { usePhone } from '@/lib/use-phone';
import { zoneLabel } from '@/lib/time-zone-label';
import { ScrollFade } from '@/components/ui/scroll-fade';
import { ACCOUNT_TYPES, AccountDialog } from './account-dialog';
import { AccountsBulkBar } from './accounts-bulk-bar';
import {
  CCY_PARAM,
  formatList,
  isNarrowed,
  matches,
  parseView,
  SEARCH_PARAM,
  STATUS_PARAM,
  TYPE_PARAM,
  type AccountsView,
} from './accounts-list';
import { AccountsToolbar } from './accounts-toolbar';
import { BalanceAdjustments } from './cash-flows';
import { costMethodInfo, methodOf } from './cost-methods';
import {
  NUM,
  RowMenu,
  TD as TD_BASE,
  TH as TH_BASE,
  type MenuAction,
} from './settings-ui';

// Eleven columns in a 982px card: the gap between columns is 8px here (12px in
// the other settings tables) and three of them give way (the Cost method and
// Time zone headers and the Prop rules cell may break onto a second line), so
// the full broker name fits without a sideways scroll.
const TH = TH_BASE.replace('px-1.5', 'px-1');
const TH_WRAP = TH.replace('whitespace-nowrap', 'whitespace-normal');
/** Both pills on the selected row: the accent-soft Type fill would vanish into the row, so each takes a raised ground and an outline. */
const SELECTED_PILL = 'bg-surface-1! ring-1 ring-inset ring-line-2';
const TD = TD_BASE.replace('px-1.5', 'px-1');

type Dialog =
  | { kind: 'new'; type?: Account['type'] }
  | { kind: 'edit'; account: Account }
  /** `count`: the trades it held when asked, so the words hold while it closes. */
  | { kind: 'clear'; account: Account; count: number }
  | { kind: 'delete'; account: Account }
  /** The ones that go and the ones kept (they hold trades), as asked. */
  | { kind: 'bulk-delete'; remove: Row[]; kept: Row[] };

interface Row {
  account: Account;
  tradeCount: number;
  /** Deposits and withdrawals. */
  flowCount: number;
  balance: number;
}

/** "10 Nov 2026" in the trader's zone. */
const importDay = (iso: string, timeZone: string) =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(iso));

const typeLabel = (a: Account) =>
  ACCOUNT_TYPES.find((t) => t.value === a.type)?.label ?? a.type;

/**
 * The account's newest import not undone, or None, under its name. It sits on
 * the name's second line, not in a column of its own: a tenth column would
 * squeeze the broker to an ellipsis in the 1440 card.
 */
function LastImport({
  job,
  timeZone,
}: {
  job: ImportJob | undefined;
  timeZone: string;
}): React.JSX.Element {
  return (
    <small
      data-last-import=""
      title={job?.fileName}
      className="block text-[12px] leading-4 font-normal text-faint"
    >
      Last import {job ? importDay(job.createdAt, timeZone) : 'None'}
    </small>
  );
}

/** Prop accounts have rules to set; the others have none to. */
function PropRules({ account }: { account: Account }): React.JSX.Element {
  const prop = account.type.startsWith('prop');
  if (!prop) return <span className="text-faint">Does not apply</span>;
  if (account.propRules)
    return (
      <span className="inline-flex items-center gap-1.5 font-medium text-text">
        <CheckCircle
          size={16}
          weight="fill"
          aria-hidden="true"
          className="text-accent"
        />
        Set
      </span>
    );
  return (
    <Link
      href="/app/prop-firms"
      className="font-semibold text-accent-ink underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-accent"
    >
      Set up rules
    </Link>
  );
}

/** The workspace's accounts, with what each holds today and what can be done to it. */
function AccountsBody(): React.JSX.Element {
  const accounts = useAccounts();
  const tradesQuery = useTrades();
  const flowsQuery = useCashFlows();
  const trades = tradesQuery.data;
  const flows = flowsQuery.data;
  const readFailed =
    accounts.status === 'error' ||
    tradesQuery.status === 'error' ||
    flowsQuery.status === 'error';
  const prefs = usePrefs().data;
  const router = useRouter();
  const imports = useImportHistory().data;
  const workspace = useActiveWorkspace().data;
  const update = useUpdateAccount();
  const clear = useClearAccountTrades();
  const remove = useRemoveAccount();
  const display = useDisplay();
  // Home's first step links here with ?new=prop: the new-account dialog opens on
  // a prop account, and the param leaves the address (below) so a reload or
  // Back doesn't open it again. The page reads the address on the client only.
  const params = useSearchParams();
  const [dialog, setDialog] = useState<Dialog | null>(() =>
    params.get('new') === 'prop'
      ? { kind: 'new', type: 'prop-evaluation' }
      : null,
  );
  const [failed, setFailed] = useState<string | null>(null);
  // The account whose deposits and withdrawals the card below shows; none picked: the first active one.
  const [pickedId, setPickedId] = useState<string | null>(null);
  const cardRef = useRef<HTMLElement>(null);
  const phone = usePhone();
  // Move trades: the account and its trades are kept while the dialog closes, so its words hold.
  const [moving, setMoving] = useState<{
    account: Account;
    trades: Trade[];
  } | null>(null);
  const [moveOpen, setMoveOpen] = useState(false);
  const moveFrom = useRef<HTMLElement | null>(null);
  const [moved, setMoved] = useState<React.ReactNode>(null);

  // The search and filters live in the address; the copy changes at once and follows it.
  useEffect(() => {
    if (params.get('new') === 'prop') writeParam('new', null);
  }, [params]);
  const addressKey = [SEARCH_PARAM, TYPE_PARAM, STATUS_PARAM, CCY_PARAM]
    .map((k) => params.get(k) ?? '')
    .join('|');
  const fromAddress = useMemo(() => parseView(params), [params]);
  const [view, setView] = useAddressCopy<AccountsView>(fromAddress, addressKey);
  const onSearch = (q: string) => {
    setView({ ...view, q });
    writeParam(SEARCH_PARAM, q === '' ? null : q);
  };
  const onFilters = (
    patch: Partial<Pick<AccountsView, 'types' | 'statuses' | 'currencies'>>,
  ) => {
    const next = { ...view, ...patch };
    setView(next);
    if (patch.types) writeParam(TYPE_PARAM, formatList(next.types));
    if (patch.statuses) writeParam(STATUS_PARAM, formatList(next.statuses));
    if (patch.currencies) writeParam(CCY_PARAM, formatList(next.currencies));
  };
  /** Search and every filter cleared in one write, from no stale copy. */
  const clearAll = () => {
    setView({ q: '', types: [], statuses: [], currencies: [] });
    for (const k of [SEARCH_PARAM, TYPE_PARAM, STATUS_PARAM, CCY_PARAM])
      writeParam(k, null);
  };
  const [chosen, setChosen] = useState<ReadonlySet<string>>(new Set());

  const timeZone = prefs?.timeZone;
  const rows = useMemo(() => {
    if (!accounts.data || !trades || !flows || timeZone === undefined)
      return undefined;
    const today = localDate(new Date().toISOString(), timeZone);
    const byAccount = new Map<string, Trade[]>();
    for (const t of trades)
      byAccount.set(t.accountId, [...(byAccount.get(t.accountId) ?? []), t]);
    const flowCounts = new Map<string, number>();
    for (const f of flows)
      flowCounts.set(f.accountId, (flowCounts.get(f.accountId) ?? 0) + 1);
    return [...accounts.data]
      .sort(
        (a, b) =>
          Number(a.status === 'archived') - Number(b.status === 'archived') ||
          a.name.localeCompare(b.name),
      )
      .map((account): Row => {
        const own = byAccount.get(account.id) ?? [];
        return {
          account,
          tradeCount: own.length,
          flowCount: flowCounts.get(account.id) ?? 0,
          balance: balanceAt([account], flows, own, today, { timeZone }),
        };
      });
  }, [accounts.data, trades, flows, timeZone]);

  // The newest import of each account that has not been undone.
  const lastImport = useMemo(() => {
    const latest = new Map<string, ImportJob>();
    for (const job of imports ?? []) {
      if (job.status === 'undone') continue;
      const have = latest.get(job.accountId);
      if (!have || job.createdAt > have.createdAt)
        latest.set(job.accountId, job);
    }
    return latest;
  }, [imports]);

  const shown = useMemo(
    () => rows?.filter((r) => matches(r.account, view)),
    [rows, view],
  );
  // Only what the list shows can be selected or acted on.
  const picked = shown?.filter((r) => chosen.has(r.account.id)) ?? [];
  const allShown = shown !== undefined && shown.length > 0;
  const toggleAll = (on: boolean) =>
    setChosen(on ? new Set(shown?.map((r) => r.account.id)) : new Set());
  const toggleOne = (id: string, on: boolean) =>
    setChosen((was) => {
      const next = new Set(was);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  const currencies = useMemo(
    () => [...new Set(rows?.map((r) => r.account.currency))].sort(),
    [rows],
  );

  const setStatus = async (status: Account['status']) => {
    setFailed(null);
    try {
      for (const r of picked)
        if (r.account.status !== status)
          await update.mutateAsync({ id: r.account.id, patch: { status } });
    } catch {
      setFailed(
        `Couldn't ${status === 'archived' ? 'archive' : 'unarchive'} every account. Try again.`,
      );
    }
  };
  const bulkDelete = () =>
    setDialog({
      kind: 'bulk-delete',
      remove: picked.filter((r) => r.tradeCount === 0),
      kept: picked.filter((r) => r.tradeCount > 0),
    });

  const selected =
    rows?.find((r) => r.account.id === pickedId)?.account ??
    rows?.find((r) => r.account.status === 'active')?.account ??
    rows?.[0]?.account;

  const archived = rows?.filter((r) => r.account.status === 'archived').length;
  const countOf = (id: string) =>
    rows?.find((r) => r.account.id === id)?.tradeCount ?? 0;

  const actions = (account: Account, tradeCount: number): MenuAction[] => [
    { label: 'Edit', onSelect: () => setDialog({ kind: 'edit', account }) },
    // An archived account is read-only: nothing can be added to it. Imports land
    // only in My workspace, so the sample's accounts do not offer Import.
    ...(account.status === 'active' && workspace?.kind === 'user'
      ? [
          {
            label: 'Import trades',
            onSelect: () =>
              router.push(
                `/app/import?account=${encodeURIComponent(account.id)}`,
              ),
          },
        ]
      : []),
    ...(account.status === 'active'
      ? [
          {
            label: 'Add a trade',
            onSelect: () =>
              router.push(
                `/app/trades/new?account=${encodeURIComponent(account.id)}`,
              ),
          },
        ]
      : []),
    // Every trade of the account to another active account; an archived one is read-only.
    // With no other active account to take them, it is off and says why (spec §5.1).
    ...(account.status === 'active' && tradeCount > 0
      ? [
          {
            label: 'Move trades',
            ...(rows?.some(
              (r) =>
                r.account.status === 'active' && r.account.id !== account.id,
            )
              ? {}
              : { offReason: 'There is no other active account to move to.' }),
            onSelect: (from: HTMLElement | null) => {
              moveFrom.current = from;
              setMoved(null);
              setMoving({
                account,
                trades: (trades ?? []).filter(
                  (t) => t.accountId === account.id,
                ),
              });
              setMoveOpen(true);
            },
          },
        ]
      : []),
    {
      label: 'Deposits and withdrawals',
      onSelect: () => {
        setPickedId(account.id);
      },
      afterClose: () => cardRef.current?.focus(),
    },
    {
      label: account.status === 'archived' ? 'Unarchive' : 'Archive',
      onSelect: () => {
        setFailed(null);
        update.mutate(
          {
            id: account.id,
            patch: {
              status: account.status === 'archived' ? 'active' : 'archived',
            },
          },
          {
            onError: () =>
              setFailed(`Couldn't update ${account.name}. Try again.`),
          },
        );
      },
    },
    ...(tradeCount > 0
      ? [
          {
            label: 'Clear trades',
            danger: true,
            onSelect: () =>
              setDialog({ kind: 'clear', account, count: tradeCount }),
          },
        ]
      : [
          {
            label: 'Delete',
            danger: true,
            onSelect: () => setDialog({ kind: 'delete', account }),
          },
        ]),
  ];

  const open = dialog?.kind === 'edit' ? dialog.account : undefined;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
      <section
        aria-labelledby="accounts-heading"
        className={`${CARD} overflow-hidden pt-[18px] pb-2`}
      >
        <CardHeader
          className="px-5"
          headingId="accounts-heading"
          title="Accounts"
          after={
            rows ? (
              <span className="text-[12.5px] text-faint">
                {workspace?.name}, {rows.length}{' '}
                {plural(rows.length, 'account')}
                {archived ? `, ${archived} archived` : ''}
              </span>
            ) : null
          }
          end={
            <button
              type="button"
              onClick={() => setDialog({ kind: 'new' })}
              className={buttonClasses('primary')}
            >
              <Plus size={14} weight="bold" aria-hidden="true" />
              New account
            </button>
          }
        />

        {failed ? (
          <p
            role="alert"
            className="mx-5 mt-3 rounded-control bg-warn-soft px-3.5 py-3 text-[13px] text-text"
          >
            {failed}
          </p>
        ) : null}

        {moved ? (
          <div
            role="status"
            aria-label="Moved"
            className="mx-5 mt-3 flex items-start gap-3 rounded-control border border-line bg-surface-1 py-2.5 pr-2 pl-4 text-[13.5px] text-text shadow-[var(--shadow-chip)]"
          >
            <p className="min-w-0 flex-1 pt-0.5 text-pretty">{moved}</p>
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => setMoved(null)}
              className="grid size-7 flex-none place-items-center rounded-chip text-muted hover:bg-sunken focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:size-11"
            >
              <X size={14} aria-hidden="true" />
            </button>
          </div>
        ) : null}

        {rows && rows.length > 0 && !readFailed ? (
          <AccountsToolbar
            view={view}
            currencies={currencies}
            onSearch={onSearch}
            onFilters={onFilters}
          />
        ) : null}

        {readFailed ? (
          <p role="alert" className="px-5 pt-3 text-[13.5px] text-muted">
            Keel couldn&apos;t read your accounts. Reload the page to try again.
          </p>
        ) : !rows ? (
          <p role="status" className="px-5 pt-3 pb-4 text-[13.5px] text-muted">
            Loading your accounts...
          </p>
        ) : rows.length === 0 ? (
          <p className="px-5 pt-3 pb-4 text-[13.5px] text-muted">
            No accounts yet. Make one here, or import a file and make it there.
          </p>
        ) : shown && shown.length === 0 ? (
          <div className="px-5 pt-3 pb-4">
            <p className="text-[13.5px] text-muted">No account matches.</p>
            <button
              type="button"
              onClick={clearAll}
              className="mt-1 text-[13.5px] font-semibold text-accent-ink underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:h-11"
            >
              {view.q.trim() === ''
                ? 'Clear filters'
                : isNarrowed({ ...view, q: '' })
                  ? 'Clear search and filters'
                  : 'Clear search'}
            </button>
          </div>
        ) : phone ? (
          <>
            <div className="mt-2 flex min-h-11 items-center gap-0.5 border-t border-line py-1 pr-5 pl-3 text-[13px] text-muted">
              <SelectBox
                label="Select all accounts"
                checked={picked.length === shown?.length && allShown}
                indeterminate={picked.length > 0}
                onChange={toggleAll}
              />
              Select all
            </div>
            <ul aria-labelledby="accounts-heading">
              {shown?.map(({ account: a, tradeCount, balance }) => {
                const gone = a.status === 'archived';
                return (
                  <li
                    key={a.id}
                    aria-current={a.id === selected?.id ? 'true' : undefined}
                    className={`flex items-center gap-1 border-t border-line py-2.5 pr-5 pl-3 ${gone ? 'text-faint' : ''} ${a.id === selected?.id ? 'bg-accent-soft' : ''}`}
                  >
                    <SelectBox
                      label={`Select ${a.name}`}
                      checked={chosen.has(a.id)}
                      onChange={(on) => toggleOne(a.id, on)}
                    />
                    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                      <span
                        data-line="1"
                        className="flex min-w-0 items-baseline justify-between gap-3"
                      >
                        <span
                          className={`min-w-0 truncate text-[14px] ${gone ? 'font-medium text-muted' : 'font-semibold text-text'}`}
                        >
                          {a.name}
                          {gone ? (
                            <small className="ml-2 text-[12px] font-normal text-faint">
                              Read-only
                            </small>
                          ) : null}
                        </span>
                        <span
                          className={`flex-none text-[14px] tabular-nums ${gone ? '' : 'font-semibold text-text'}`}
                        >
                          <FigureText
                            f={display.cash(balance, false, a.currency)}
                          />
                        </span>
                      </span>
                      <span
                        data-line="2"
                        className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px]"
                      >
                        <Chip
                          tone={
                            a.type.startsWith('prop') ? 'accent' : 'neutral'
                          }
                          className={a.id === selected?.id ? SELECTED_PILL : ''}
                        >
                          {typeLabel(a)}
                        </Chip>
                        <span>{costMethodInfo(methodOf(a)).short}</span>
                        <Chip
                          className={a.id === selected?.id ? SELECTED_PILL : ''}
                        >
                          {gone ? <Lock size={13} aria-hidden="true" /> : null}
                          {gone ? 'Archived' : 'Active'}
                        </Chip>
                        <PropRules account={a} />
                      </span>
                    </div>
                    <RowMenu
                      label={`Actions for ${a.name}`}
                      actions={actions(a, tradeCount)}
                    />
                  </li>
                );
              })}
            </ul>
          </>
        ) : (
          <ScrollFade className="mt-2">
            <table
              aria-labelledby="accounts-heading"
              className="w-full min-w-[960px] border-collapse text-[13.5px]"
            >
              <thead>
                <tr>
                  <th
                    scope="col"
                    className={`${TH} sticky left-0 z-[1] bg-surface-1`}
                  >
                    <span className="inline-flex items-center gap-1">
                      <span className="-ml-2">
                        <SelectBox
                          label="Select all accounts"
                          checked={picked.length === shown?.length && allShown}
                          indeterminate={picked.length > 0}
                          onChange={toggleAll}
                        />
                      </span>
                      Name
                    </span>
                  </th>
                  <th scope="col" className={TH}>
                    Broker
                  </th>
                  <th scope="col" className={TH}>
                    Type
                  </th>
                  <th scope="col" className={TH}>
                    Currency
                  </th>
                  <th scope="col" className={`${TH} ${NUM}`}>
                    Starting balance
                  </th>
                  <th scope="col" className={`${TH} ${NUM}`}>
                    Balance today
                  </th>
                  <th scope="col" className={TH_WRAP}>
                    <MetricTip id="cost-method" basis="net" />
                  </th>
                  <th scope="col" className={TH_WRAP}>
                    Time zone
                  </th>
                  <th scope="col" className={TH}>
                    Status
                  </th>
                  <th scope="col" className={TH}>
                    Prop rules
                  </th>
                  <th
                    scope="col"
                    className={`${TH} sticky right-0 z-[1] w-16 bg-surface-1 shadow-[inset_1px_0_0_var(--color-line)] lg:bg-transparent lg:shadow-none`}
                  >
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {shown?.map(({ account: a, tradeCount, balance }) => {
                  const gone = a.status === 'archived';
                  return (
                    <tr
                      key={a.id}
                      aria-current={a.id === selected?.id ? 'true' : undefined}
                      className={`${gone ? 'text-faint' : ''} ${a.id === selected?.id ? '[&>td]:bg-accent-soft' : ''}`}
                    >
                      <td
                        className={`${TD} sticky left-0 z-[1] whitespace-nowrap bg-surface-1`}
                      >
                        <span className="inline-flex items-start gap-1">
                          <span className="-ml-2 mt-[-3px]">
                            <SelectBox
                              label={`Select ${a.name}`}
                              checked={chosen.has(a.id)}
                              onChange={(on) => toggleOne(a.id, on)}
                            />
                          </span>
                          <span>
                            <span
                              data-account-name=""
                              className={
                                gone
                                  ? 'font-medium text-muted'
                                  : 'font-semibold text-text'
                              }
                            >
                              {a.name}
                            </span>
                            {gone ? (
                              <small className="ml-2 text-[12px] text-faint">
                                Read-only
                              </small>
                            ) : null}
                            {workspace?.kind === 'user' ? (
                              <LastImport
                                job={lastImport.get(a.id)}
                                timeZone={timeZone ?? 'UTC'}
                              />
                            ) : null}
                          </span>
                        </span>
                      </td>
                      <td
                        className={`${TD} max-w-[160px] text-muted`}
                        title={a.broker}
                      >
                        <span className="line-clamp-2">{a.broker}</span>
                      </td>
                      <td className={`${TD} whitespace-nowrap`}>
                        <Chip
                          tone={
                            a.type.startsWith('prop') ? 'accent' : 'neutral'
                          }
                          className={a.id === selected?.id ? SELECTED_PILL : ''}
                        >
                          {typeLabel(a)}
                        </Chip>
                      </td>
                      <td className={`${TD} text-muted`}>{a.currency}</td>
                      <td className={`${TD} ${NUM} whitespace-nowrap`}>
                        <FigureText
                          f={display.cash(a.startingBalance, false, a.currency)}
                        />
                      </td>
                      <td
                        className={`${TD} ${NUM} whitespace-nowrap ${gone ? '' : 'font-semibold text-text'}`}
                      >
                        <FigureText
                          f={display.cash(balance, false, a.currency)}
                        />
                      </td>
                      <td className={`${TD} whitespace-nowrap`}>
                        <Chip
                          className={a.id === selected?.id ? SELECTED_PILL : ''}
                        >
                          {costMethodInfo(methodOf(a)).short}
                        </Chip>
                      </td>
                      <td
                        className={`${TD} whitespace-nowrap text-muted`}
                        title={
                          a.timeZone
                            ? zoneLabel(a.timeZone)
                            : 'Read in your own time zone'
                        }
                      >
                        {a.timeZone ? zoneLabel(a.timeZone) : 'Yours'}
                      </td>
                      <td className={TD}>
                        <Chip
                          className={a.id === selected?.id ? SELECTED_PILL : ''}
                        >
                          {gone ? <Lock size={13} aria-hidden="true" /> : null}
                          {gone ? 'Archived' : 'Active'}
                        </Chip>
                      </td>
                      <td className={TD}>
                        <PropRules account={a} />
                      </td>
                      <td
                        className={`${TD} sticky right-0 z-[1] bg-surface-1 text-right shadow-[inset_1px_0_0_var(--color-line)] lg:shadow-none`}
                      >
                        <RowMenu
                          label={`Actions for ${a.name}`}
                          actions={actions(a, tradeCount)}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </ScrollFade>
        )}

        <AccountDialog
          open={dialog?.kind === 'new' || dialog?.kind === 'edit'}
          account={open}
          initialType={dialog?.kind === 'new' ? dialog.type : undefined}
          hasTrades={open ? countOf(open.id) > 0 : false}
          onClose={() => setDialog(null)}
        />
        {moving ? (
          <MoveDialog
            open={moveOpen}
            onOpenChange={setMoveOpen}
            origin={moveFrom}
            returnFocus={moveFrom}
            trades={moving.trades}
            from={moving.account}
            onDone={setMoved}
          />
        ) : null}
        <ConfirmDialog
          open={dialog?.kind === 'clear'}
          title={`Clear the trades in ${dialog?.kind === 'clear' ? dialog.account.name : ''}?`}
          body={
            dialog?.kind === 'clear'
              ? `Delete all ${dialog.count.toLocaleString('en-US')} ${plural(dialog.count, 'trade')} and imports in ${dialog.account.name}? This can't be undone.`
              : ''
          }
          confirmLabel="Clear trades"
          danger
          requireText={dialog?.kind === 'clear' ? dialog.account.name : ''}
          onConfirm={async () => {
            if (dialog?.kind === 'clear')
              await clear.mutateAsync(dialog.account.id);
          }}
          onClose={() => setDialog(null)}
        />
        <ConfirmDialog
          open={dialog?.kind === 'delete'}
          title={`Delete ${dialog?.kind === 'delete' ? dialog.account.name : ''}?`}
          body="Its deposits and withdrawals go with it. This can't be undone."
          confirmLabel="Delete account"
          danger
          onConfirm={async () => {
            if (dialog?.kind === 'delete')
              await remove.mutateAsync(dialog.account.id);
          }}
          onClose={() => setDialog(null)}
        />
        <ConfirmDialog
          open={dialog?.kind === 'bulk-delete'}
          title={
            dialog?.kind === 'bulk-delete'
              ? `Delete ${dialog.remove.length} ${plural(dialog.remove.length, 'account')}?`
              : ''
          }
          body={
            dialog?.kind === 'bulk-delete' ? (
              <>
                <p>
                  Each one&apos;s deposits and withdrawals go with it. This
                  can&apos;t be undone.
                </p>
                <ul className="mt-2 list-disc pl-5 text-[13.5px]">
                  {dialog.remove.map((r) => (
                    <li key={r.account.id}>
                      <span className="font-semibold text-text">
                        {r.account.name}
                      </span>
                      : {r.tradeCount} {plural(r.tradeCount, 'trade')},{' '}
                      {r.flowCount}{' '}
                      {r.flowCount === 1
                        ? 'deposit or withdrawal'
                        : 'deposits and withdrawals'}
                    </li>
                  ))}
                </ul>
                {dialog.kept.length > 0 ? (
                  <>
                    <p className="mt-3">
                      Kept, because an account with trades needs Clear trades
                      first:
                    </p>
                    <ul className="mt-1 list-disc pl-5 text-[13.5px]">
                      {dialog.kept.map((r) => (
                        <li key={r.account.id}>
                          <span className="font-semibold text-text">
                            {r.account.name}
                          </span>{' '}
                          holds {r.tradeCount.toLocaleString('en-US')}{' '}
                          {plural(r.tradeCount, 'trade')}
                        </li>
                      ))}
                    </ul>
                  </>
                ) : null}
              </>
            ) : (
              ''
            )
          }
          confirmLabel={
            dialog?.kind === 'bulk-delete' && dialog.remove.length > 1
              ? 'Delete accounts'
              : 'Delete account'
          }
          danger
          onConfirm={async () => {
            if (dialog?.kind !== 'bulk-delete') return;
            // One by one, and stop at the first failure so the words are exact.
            const present = new Set(rows?.map((r) => r.account.id));
            const todo = dialog.remove.filter((r) => present.has(r.account.id));
            const deleted: Row[] = [];
            /** The selection as it was, minus what is gone: by id, never by name. */
            const dropDeleted = () => {
              const ids = new Set(deleted.map((x) => x.account.id));
              setChosen(
                (prev) => new Set([...prev].filter((id) => !ids.has(id))),
              );
            };
            for (const [i, r] of todo.entries()) {
              try {
                await remove.mutateAsync(r.account.id);
                deleted.push(r);
              } catch (e) {
                const reason = e instanceof Error ? e.message : 'unknown error';
                const left = todo.slice(i + 1).map((x) => x.account.name);
                dropDeleted();
                // The list no longer shows what is gone.
                setDialog({
                  ...dialog,
                  remove: todo.filter((x) => !deleted.includes(x)),
                });
                throw new ConfirmFailure(
                  [
                    deleted.length > 0
                      ? `Deleted: ${deleted.map((x) => x.account.name).join(', ')}.`
                      : '',
                    `Couldn't delete: ${r.account.name} (${reason}).`,
                    left.length > 0 ? `Not attempted: ${left.join(', ')}.` : '',
                  ]
                    .filter(Boolean)
                    .join(' '),
                );
              }
            }
            dropDeleted();
          }}
          onClose={() => setDialog(null)}
        />
      </section>
      {picked.length > 0 ? (
        // In the flow, so the last row is never under it; it sticks above the tab bar.
        <div className="pointer-events-none sticky bottom-[calc(var(--tab-bar)+16px)] z-30 flex justify-center">
          <AccountsBulkBar
            selected={picked.length}
            archivable={
              picked.filter((r) => r.account.status === 'active').length
            }
            restorable={
              picked.filter((r) => r.account.status === 'archived').length
            }
            deletable={picked.filter((r) => r.tradeCount === 0).length}
            onArchive={() => void setStatus('archived')}
            onUnarchive={() => void setStatus('active')}
            onDelete={bulkDelete}
            onClear={() => setChosen(new Set())}
          />
        </div>
      ) : null}
      {selected && !readFailed && rows ? (
        <BalanceAdjustments account={selected} cardRef={cardRef} />
      ) : null}
    </div>
  );
}

/** The accounts page: it reads the address for its search and filters, so it waits for it inside a boundary. */
export function AccountsSettings(): React.JSX.Element {
  return (
    <Suspense
      fallback={
        <p role="status" className="px-5 pt-3 text-[13.5px] text-muted">
          Loading your accounts...
        </p>
      }
    >
      <AccountsBody />
    </Suspense>
  );
}
