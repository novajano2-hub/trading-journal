'use client';

import { ArrowsLeftRight, Info } from '@phosphor-icons/react/dist/ssr';
import { useMemo, useState } from 'react';
import { Chip } from '@/components/ui/chip';
import { MorphDialog } from '@/components/ui/morph-dialog';
import {
  useAccounts,
  useMoveAccountTrades,
  useMoveTrades,
  usePrefs,
} from '@/data/query/hooks';
import type { Account, Trade } from '@/domain/types';
import { formatCount, formatInstrument, plural } from '@/lib/format';
import { ACCOUNT_TYPES } from '../settings/account-dialog';
import {
  failure,
  GroupFooter,
  WhatBox,
  WhatLine,
  type GroupDialogProps,
} from './group-dialogs';

/** "1229", "1229 and 1230", "1229, 1230 and 1231", "1, 2, 3 and 9 more". */
function serialsText(trades: readonly Trade[]): string {
  const serials = trades.map((t) => t.serial).sort((a, b) => a - b);
  if (serials.length > 3)
    return `${serials.slice(0, 3).join(', ')} and ${serials.length - 3} more`;
  if (serials.length < 2) return serials.join('');
  return `${serials.slice(0, -1).join(', ')} and ${serials.at(-1)}`;
}

/** "USD", or "USD and GBP". */
const currencies = (list: readonly string[]) =>
  list.length < 2
    ? list.join('')
    : `${list.slice(0, -1).join(', ')} and ${list.at(-1)}`;

const typeLabel = (a: Account) =>
  ACCOUNT_TYPES.find((t) => t.value === a.type)?.label ?? a.type;

/**
 * Move (B6, B7): the active accounts other than the trades' own, one picked.
 * The trades go with everything on them and keep their own currency and
 * figures. With `from`, it is the whole account's move from its menu: the
 * same picker and the same words, for every trade it holds (`trades`).
 */
export function MoveDialog({
  open,
  onOpenChange,
  origin,
  returnFocus,
  onDone,
  trades,
  from,
}: GroupDialogProps & {
  /** The trades that move: not in an archived account. */
  trades: readonly Trade[];
  /** Set for a whole account's move. */
  from?: Account;
}): React.JSX.Element {
  const accounts = useAccounts().data;
  const zone = usePrefs().data?.timeZone ?? 'UTC';
  const move = useMoveTrades();
  const moveAccount = useMoveAccountTrades();
  const [accountId, setAccountId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [was, setWas] = useState(false);
  if (open !== was) {
    setWas(open);
    if (open) {
      setAccountId(null);
      setError(null);
    }
  }

  const n = trades.length;
  const own = new Set(trades.map((t) => t.accountId));
  if (from) own.add(from.id);
  const choices = (accounts ?? []).filter(
    (a) => a.status === 'active' && !own.has(a.id),
  );
  const picked = choices.find((a) => a.id === accountId);
  // What stays behind when a trade moves to an account of another currency.
  const kept = useMemo(
    () => [...new Set(trades.map((t) => t.pnlCurrency))].sort(),
    [trades],
  );
  const differing = picked ? kept.filter((c) => c !== picked.currency) : [];
  const sources = (accounts ?? []).filter((a) => own.has(a.id));
  const names = [
    ...new Set(
      trades.map((t) => formatInstrument(t.instrument, t.openedAt, zone).name),
    ),
  ];
  const noun = `${formatCount(n)} ${plural(n, 'trade')}`;

  const confirm = async () => {
    if (!picked) return;
    setError(null);
    try {
      const moved = from
        ? await moveAccount.mutateAsync({ from: from.id, to: picked.id })
        : await move.mutateAsync({
            ids: trades.map((t) => t.id),
            accountId: picked.id,
          });
      onOpenChange(false);
      onDone(
        `Moved ${formatCount(moved)} ${plural(moved, 'trade')} to ${picked.name}.`,
      );
    } catch (e) {
      setError(failure(e, 'move'));
    }
  };

  return (
    <MorphDialog
      open={open}
      onOpenChange={onOpenChange}
      origin={origin}
      returnFocus={returnFocus}
      size="medium"
      title={
        from
          ? `Move the trades in ${from.name}`
          : n === 1
            ? `Move trade ${trades[0]?.serial}`
            : `Move ${formatCount(n)} trades`
      }
      description={
        from
          ? `${n === 1 ? 'Its one trade goes' : `All ${formatCount(n)} trades go`} to the account you pick. ${from.name} itself stays.`
          : `${serialsText(trades)}, ${names.length === 1 ? names[0] : 'several instruments'}, now in ${sources.length === 1 ? sources[0]?.name : `${sources.length} accounts`}. Pick where ${n === 1 ? 'it goes' : 'they go'}.`
      }
      footer={
        <GroupFooter
          onCancel={() => onOpenChange(false)}
          disabled={!picked || move.isPending || moveAccount.isPending}
          icon={<ArrowsLeftRight size={16} aria-hidden="true" />}
          label={`Move ${noun}`}
          onConfirm={() => void confirm()}
        />
      }
    >
      {choices.length === 0 ? (
        <p className="pt-3 text-[13.5px] text-muted">
          There is no other active account to move to.
        </p>
      ) : (
        <div
          role="radiogroup"
          aria-label="Account"
          className="mt-1 flex flex-col gap-0.5"
        >
          {choices.map((a) => {
            const on = a.id === accountId;
            return (
              <label
                key={a.id}
                className={`flex min-h-[52px] cursor-pointer items-center gap-3 rounded-[10px] border px-3 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent ${on ? 'border-accent/30 bg-accent-soft' : 'border-transparent hover:bg-sunken'}`}
              >
                <input
                  type="radio"
                  name="move-to"
                  checked={on}
                  onChange={() => setAccountId(a.id)}
                  className="peer sr-only"
                />
                <span
                  aria-hidden="true"
                  className={`grid size-4 flex-none place-items-center rounded-full border shadow-[var(--shadow-chip)] ${on ? 'border-accent bg-accent' : 'border-line-2 bg-surface-1'}`}
                >
                  {on ? (
                    <span className="size-1.5 rounded-full bg-accent-fg" />
                  ) : null}
                </span>
                <b className="min-w-0 flex-1 text-[14px] font-semibold">
                  {a.name}
                </b>
                <Chip tone={a.type.startsWith('prop') ? 'accent' : 'neutral'}>
                  {typeLabel(a)}
                </Chip>
                <small className="w-[34px] flex-none text-right text-[12.5px] text-faint">
                  {a.currency}
                </small>
              </label>
            );
          })}
        </div>
      )}
      {picked && differing.length > 0 ? (
        <p
          role="status"
          className="mt-2.5 flex items-start gap-2.5 rounded-[10px] bg-sunken px-3 py-2.5 text-[13px] leading-[1.5] text-muted"
        >
          <Info
            size={16}
            aria-hidden="true"
            className="mt-px flex-none text-muted"
          />
          <span>
            {picked.name} is in {picked.currency}.{' '}
            {n === 1
              ? `This trade keeps its own currency, ${currencies(differing)}, and every figure on it stays as it is.`
              : `These trades keep their own ${plural(differing.length, 'currency', 'currencies')}, ${currencies(differing)}, and every figure on them stays as it is.`}
          </span>
        </p>
      ) : null}
      <p className="mt-2 text-[12.5px] text-faint">
        Only active accounts are listed. Archived accounts are read-only.
      </p>
      <WhatBox title="What moves">
        <WhatLine>
          {n === 1
            ? 'The trade'
            : n === 2
              ? 'Both trades'
              : `All ${formatCount(n)} trades`}
          , with everything on {n === 1 ? 'it' : 'them'}: notes, tags,
          strategies, rule checks, targets and stops, rating, the reviewed mark
          and files.
        </WhatLine>
        <WhatLine>
          {sources.length === 1 ? (
            <>
              <strong>{sources[0]?.name}</strong>{' '}
              {from ? 'stays, with' : 'keeps'} its deposits, withdrawals and
              balance.
            </>
          ) : (
            <>
              The accounts {n === 1 ? 'it' : 'they'} leave keep their deposits,
              withdrawals and balance.
            </>
          )}
        </WhatLine>
        <WhatLine>
          There is no undo. Move {n === 1 ? 'it' : 'them'} back the same way.
        </WhatLine>
      </WhatBox>
      {error ? (
        <p role="alert" className="mt-3 text-[13px] font-medium text-loss">
          {error}
        </p>
      ) : null}
    </MorphDialog>
  );
}
