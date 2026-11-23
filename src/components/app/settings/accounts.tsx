'use client';

import { Bank, CheckCircle, Lock, Plus } from '@phosphor-icons/react/dist/ssr';
import Link from 'next/link';
import { useMemo, useRef, useState } from 'react';
import { ConfirmDialog } from '@/components/app/confirm-dialog';
import { CARD, CardHeader } from '@/components/app/dashboard/shared';
import { FigureText } from '@/components/product/figure-text';
import { buttonClasses } from '@/components/ui/button-styles';
import { Chip } from '@/components/ui/chip';
import {
  useAccounts,
  useActiveWorkspace,
  useCashFlows,
  useClearAccountTrades,
  usePrefs,
  useRemoveAccount,
  useTrades,
  useUpdateAccount,
} from '@/data/query/hooks';
import { balanceAt } from '@/domain/metrics/balance';
import { localDate } from '@/domain/time';
import type { Account, Trade } from '@/domain/types';
import { useDisplay } from '@/lib/display';
import { plural } from '@/lib/format';
import { zoneLabel } from '@/lib/time-zone-label';
import { ScrollFade } from '@/components/ui/scroll-fade';
import { ACCOUNT_TYPES, AccountDialog } from './account-dialog';
import { BalanceAdjustments } from './cash-flows';
import { NUM, RowMenu, TD, TH, type MenuAction } from './settings-ui';

type Dialog =
  | { kind: 'new' }
  | { kind: 'edit'; account: Account }
  /** `count`: the trades it held when asked, so the words hold while it closes. */
  | { kind: 'clear'; account: Account; count: number }
  | { kind: 'delete'; account: Account };

const typeLabel = (a: Account) =>
  ACCOUNT_TYPES.find((t) => t.value === a.type)?.label ?? a.type;

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
export function AccountsSettings(): React.JSX.Element {
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
  const workspace = useActiveWorkspace().data;
  const update = useUpdateAccount();
  const clear = useClearAccountTrades();
  const remove = useRemoveAccount();
  const display = useDisplay();
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  // The account whose deposits and withdrawals the card below shows; none picked: the first active one.
  const [pickedId, setPickedId] = useState<string | null>(null);
  const cardRef = useRef<HTMLElement>(null);

  const timeZone = prefs?.timeZone;
  const rows = useMemo(() => {
    if (!accounts.data || !trades || !flows || timeZone === undefined)
      return undefined;
    const today = localDate(new Date().toISOString(), timeZone);
    const byAccount = new Map<string, Trade[]>();
    for (const t of trades)
      byAccount.set(t.accountId, [...(byAccount.get(t.accountId) ?? []), t]);
    return [...accounts.data]
      .sort(
        (a, b) =>
          Number(a.status === 'archived') - Number(b.status === 'archived') ||
          a.name.localeCompare(b.name),
      )
      .map((account) => {
        const own = byAccount.get(account.id) ?? [];
        return {
          account,
          tradeCount: own.length,
          balance: balanceAt([account], flows, own, today, { timeZone }),
        };
      });
  }, [accounts.data, trades, flows, timeZone]);

  const selected =
    rows?.find((r) => r.account.id === pickedId)?.account ??
    rows?.find((r) => r.account.status === 'active')?.account ??
    rows?.[0]?.account;

  const archived = rows?.filter((r) => r.account.status === 'archived').length;
  const countOf = (id: string) =>
    rows?.find((r) => r.account.id === id)?.tradeCount ?? 0;

  const actions = (account: Account, tradeCount: number): MenuAction[] => [
    { label: 'Edit', onSelect: () => setDialog({ kind: 'edit', account }) },
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
          icon={Bank}
          tone="accent"
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
                    Name
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
                  <th scope="col" className={TH}>
                    Time zone
                  </th>
                  <th scope="col" className={TH}>
                    Status
                  </th>
                  <th scope="col" className={`${TH} min-w-[110px]`}>
                    Prop rules
                  </th>
                  <th
                    scope="col"
                    className={`${TH} sticky right-0 w-16 z-[1] bg-surface-1 shadow-[inset_1px_0_0_var(--color-line)] lg:shadow-none`}
                  >
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ account: a, tradeCount, balance }) => {
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
                        <span
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
                      </td>
                      <td
                        className={`${TD} max-w-[124px] truncate text-muted`}
                        title={a.broker}
                      >
                        {a.broker}
                      </td>
                      <td className={`${TD} whitespace-nowrap`}>
                        <Chip
                          tone={
                            a.type.startsWith('prop') ? 'accent' : 'neutral'
                          }
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
                        <Chip>
                          {gone ? (
                            <Lock
                              size={13}
                              weight="duotone"
                              aria-hidden="true"
                            />
                          ) : null}
                          {gone ? 'Archived' : 'Active'}
                        </Chip>
                      </td>
                      <td className={`${TD} min-w-[110px] whitespace-nowrap`}>
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
          hasTrades={open ? countOf(open.id) > 0 : false}
          onClose={() => setDialog(null)}
        />
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
      </section>
      {selected && !readFailed && rows ? (
        <BalanceAdjustments account={selected} cardRef={cardRef} />
      ) : null}
    </div>
  );
}
