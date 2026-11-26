'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { ScrollFade } from '@/components/ui/scroll-fade';
import { FigureText } from '@/components/product/figure-text';
import {
  accountSize,
  CHALLENGE_TYPE_LABELS,
  challengeType,
} from '@/domain/prop/finance';
import type { ChallengeCheck } from '@/domain/prop/challenge';
import type { Account, Challenge } from '@/domain/types';
import { useDisplay } from '@/lib/display';
import {
  challengeChip,
  dateLabel,
  phaseName,
  shownPhase,
  StatusChip,
} from './challenge-card';

/** A challenge with what the rule check says of it. */
export interface AccountRow {
  c: Challenge;
  check: ChallengeCheck;
  /** The day it started: the earliest phase start date, else the day of its first trade; null with neither. */
  started: string | null;
}

/** The address of a challenge's details page. */
export const detailsHref = (id: string): string =>
  `/app/prop-firms/accounts/${encodeURIComponent(id)}`;

const TH =
  'h-[34px] border-b border-line pr-2.5 text-left text-[12px] font-medium whitespace-nowrap text-faint last:pr-0';
const TD =
  'h-[38px] overflow-hidden border-b border-line/70 pr-2.5 text-ellipsis whitespace-nowrap last:pr-0';
const NUM = 'text-right tabular-nums';

/** What a row shows of a challenge, read from its shown phase. */
function useRowFigures(
  { c, check, started }: AccountRow,
  accounts: readonly Account[],
) {
  const display = useDisplay();
  const phase = shownPhase(c, check);
  const account = phase?.account;
  const currency = account?.currency ?? 'USD';
  const size = accountSize(c, accounts);
  return {
    account: account?.name ?? null,
    type: CHALLENGE_TYPE_LABELS[challengeType(c)],
    size:
      size === null ? null : (
        <FigureText f={display.cash(size, false, currency)} />
      ),
    phase: phase ? phaseName(c, phase.step) : 'Evaluation',
    balance:
      phase?.balance === undefined || phase.archived ? null : (
        <FigureText f={display.cash(phase.balance, false, currency)} />
      ),
    started: started ? dateLabel(started) : null,
    chip: <StatusChip kind={challengeChip(c, check)} />,
  };
}

const None = (): React.JSX.Element => <span className="text-faint">None</span>;

function TableRow({
  row,
  accounts,
  menu,
}: {
  row: AccountRow;
  accounts: readonly Account[];
  menu: ReactNode;
}): React.JSX.Element {
  const { c } = row;
  const f = useRowFigures(row, accounts);
  return (
    <tr>
      <td className={TD}>
        <Link
          href={detailsHref(c.id)}
          className="rounded-chip font-semibold text-text no-underline outline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-accent"
        >
          {c.name}
        </Link>
      </td>
      <td className={`${TD} text-muted`} title={c.firm}>
        {c.firm}
      </td>
      <td className={`${TD} text-muted`} title={f.account ?? undefined}>
        {f.account ?? <None />}
      </td>
      <td className={TD} title={f.type}>
        {f.type}
      </td>
      <td className={`${TD} ${NUM}`}>{f.size ?? <None />}</td>
      <td className={TD}>{f.phase}</td>
      <td className={TD}>{f.chip}</td>
      <td className={`${TD} ${NUM} font-semibold`}>{f.balance ?? <None />}</td>
      <td className={`${TD} text-muted`}>{f.started ?? <None />}</td>
      <td className={`${TD} text-right`}>
        <span data-menu-of={c.id} className="inline-flex">
          {menu}
        </span>
      </td>
    </tr>
  );
}

/** The List layout from `sm` up: one table row a challenge (C63). */
export function AccountsTable({
  rows,
  accounts,
  menuFor,
}: {
  rows: readonly AccountRow[];
  accounts: readonly Account[];
  menuFor(row: AccountRow): ReactNode;
}): React.JSX.Element {
  return (
    <ScrollFade className="mt-3">
      <table
        aria-label="Challenges"
        className="w-full min-w-[880px] table-fixed border-collapse text-[13.5px]"
      >
        <colgroup>
          <col style={{ width: '15%' }} />
          <col style={{ width: '11%' }} />
          <col style={{ width: '16%' }} />
          <col style={{ width: '11%' }} />
          <col style={{ width: '10%' }} />
          <col style={{ width: '8%' }} />
          <col style={{ width: '9%' }} />
          <col style={{ width: '11%' }} />
          <col style={{ width: '9%' }} />
          <col style={{ width: 52 }} />
        </colgroup>
        <thead>
          <tr>
            <th scope="col" className={TH}>
              Challenge
            </th>
            <th scope="col" className={TH}>
              Firm
            </th>
            <th scope="col" className={TH}>
              Trading account
            </th>
            <th scope="col" className={TH}>
              Type
            </th>
            <th scope="col" className={`${TH} ${NUM}`}>
              Size
            </th>
            <th scope="col" className={TH}>
              Phase
            </th>
            <th scope="col" className={TH}>
              Status
            </th>
            <th scope="col" className={`${TH} ${NUM}`}>
              Balance
            </th>
            <th scope="col" className={TH}>
              Started
            </th>
            <th scope="col" className={TH}>
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <TableRow
              key={row.c.id}
              row={row}
              accounts={accounts}
              menu={menuFor(row)}
            />
          ))}
        </tbody>
      </table>
    </ScrollFade>
  );
}

function PhoneRow({
  row,
  accounts,
  menu,
}: {
  row: AccountRow;
  accounts: readonly Account[];
  menu: ReactNode;
}): React.JSX.Element {
  const { c } = row;
  const f = useRowFigures(row, accounts);
  return (
    <li className="flex items-center gap-1 border-t border-line first:border-t-0">
      <Link
        href={detailsHref(c.id)}
        className="flex min-h-[60px] min-w-0 flex-1 flex-col justify-center gap-1 py-2 no-underline outline-offset-2 focus-visible:outline-2 focus-visible:outline-accent"
      >
        <span
          data-line="1"
          className="flex min-w-0 items-baseline justify-between gap-3 text-[14px]"
        >
          <span className="min-w-0 truncate font-semibold text-text">
            {c.name}
          </span>
          <span className="flex-none font-semibold text-text tabular-nums">
            {f.balance}
          </span>
        </span>
        <span
          data-line="2"
          className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-muted"
        >
          <span>{f.account ?? 'No trading account linked'}</span>
          {f.started ? <span>started {f.started}</span> : null}
          {f.chip}
        </span>
      </Link>
      <span data-menu-of={c.id} className="flex-none">
        {menu}
      </span>
    </li>
  );
}

/** The List layout below `sm`: two-line rows, name and balance, then account, start and status. */
export function AccountsRows({
  rows,
  accounts,
  menuFor,
}: {
  rows: readonly AccountRow[];
  accounts: readonly Account[];
  menuFor(row: AccountRow): ReactNode;
}): React.JSX.Element {
  return (
    <ul aria-label="Challenges" className="mt-2">
      {rows.map((row) => (
        <PhoneRow
          key={row.c.id}
          row={row}
          accounts={accounts}
          menu={menuFor(row)}
        />
      ))}
    </ul>
  );
}
