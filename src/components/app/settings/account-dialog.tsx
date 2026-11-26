'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { SelectField } from '@/components/app/import/select-field';
import { HELP, INPUT, LABEL } from '@/components/app/import/styles';
import { TimeZoneField } from '@/components/app/import/time-zone-field';
import { Button } from '@/components/ui/button';
import {
  useCreateAccount,
  usePrefs,
  useUpdateAccount,
} from '@/data/query/hooks';
import { toCents } from '@/domain/money';
import { isValidTimeZone } from '@/domain/time';
import type { Account, AccountType, CostMethod } from '@/domain/types';
import { COST_METHODS, costMethodInfo, methodOf } from './cost-methods';
import { FieldError, focusField, SettingsDialog } from './settings-ui';

export const ACCOUNT_TYPES: readonly { value: AccountType; label: string }[] = [
  { value: 'live', label: 'Live' },
  { value: 'demo', label: 'Demo' },
  { value: 'prop-evaluation', label: 'Prop evaluation' },
  { value: 'prop-funded', label: 'Prop funded' },
];

/** The question's lines, in the comp's quiet 13.5px. */
const ASK = 'text-[13.5px] leading-[1.6] text-muted';

/**
 * The buttons' band: the comp's hairline above it, and it stays in view as the
 * form scrolls, so Save is never below the fold on a phone. The negative margins
 * run it to the dialog's edges over the body's 24px padding, and `-bottom-6`
 * lets it rest there (a sticky offset is measured from the padding's inside).
 */
const FOOT =
  'sticky -bottom-6 -mx-6 -mb-6 flex flex-wrap justify-end gap-2 rounded-b-[16px] border-t border-line bg-surface-1 px-6 py-3';

/** "50,000.00" for the field. */
function amountText(cents: number): string {
  return (cents / 100).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    useGrouping: false,
  });
}

function AccountForm({
  account,
  initialType,
  hasTrades,
  asking,
  askId,
  onAsking,
  onClose,
}: {
  /** Absent: a new account. */
  account?: Account;
  /** A new account's type before the user picks one; Home's first step opens on a prop account. */
  initialType?: AccountType;
  hasTrades: boolean;
  /** The method the question on the screen asks about; null: the form shows. */
  asking: CostMethod | null;
  /** The `id` of the question's first paragraph: the dialog's description while it shows. */
  askId: string;
  onAsking(method: CostMethod | null): void;
  onClose(): void;
}): React.JSX.Element {
  const prefs = usePrefs().data;
  const create = useCreateAccount();
  const update = useUpdateAccount();
  const ids = useId();
  const [name, setName] = useState(account?.name ?? '');
  const [broker, setBroker] = useState(account?.broker ?? '');
  const [type, setType] = useState<AccountType>(
    account?.type ?? initialType ?? 'live',
  );
  const [currency, setCurrency] = useState(
    account?.currency ?? prefs?.baseCurrency ?? 'USD',
  );
  const [balance, setBalance] = useState(
    account ? amountText(account.startingBalance) : '0',
  );
  const [zone, setZone] = useState<string | null>(null);
  // Only an existing account has a cost method (C74): a new one starts FIFO.
  const saved = account ? methodOf(account) : 'fifo';
  const [method, setMethod] = useState<CostMethod>(saved);
  const [errors, setErrors] = useState<{
    name?: string;
    currency?: string;
    balance?: string;
  }>({});
  const [failed, setFailed] = useState(false);
  const busy = create.isPending || update.isPending;
  const shownZone = zone ?? account?.timeZone ?? prefs?.timeZone ?? 'UTC';
  // An archived account is read-only: its method shows, and is never sent.
  const archived = account?.status === 'archived';
  const changed = account !== undefined && !archived && method !== saved;

  // Back from the question, focus returns to the choice it was about.
  const wasAsking = useRef(false);
  useEffect(() => {
    if (wasAsking.current && asking === null)
      focusField(`${ids}-method-${saved}`);
    wasAsking.current = asking !== null;
  }, [asking, ids, saved]);

  async function save() {
    const amount = Number(balance.replace(/,/g, ''));
    const next: typeof errors = {};
    if (!name.trim()) next.name = 'Give the account a name.';
    if (!/^[A-Za-z]{3}$/.test(currency))
      next.currency = 'Use a three-letter code, like USD.';
    if (balance.trim() === '' || !Number.isFinite(amount) || amount < 0)
      next.balance = 'Enter an amount of zero or more.';
    setErrors(next);
    setFailed(false);
    if (Object.keys(next).length > 0) {
      focusField(
        next.name ? `${ids}-name` : next.currency ? `${ids}-cur` : `${ids}-bal`,
      );
      return;
    }
    const fields = {
      name: name.trim(),
      broker: broker.trim(),
      type,
      currency: currency.toUpperCase(),
      startingBalance: toCents(amount),
    };
    const timeZone =
      zone !== null && isValidTimeZone(zone) ? { timeZone: zone } : {};
    // A new method rebuilds every trade of the account (C40): ask before it does.
    if (changed && asking === null) {
      onAsking(method);
      return;
    }
    try {
      // The method goes in the same write as the fields: one transaction.
      if (account)
        await update.mutateAsync({
          id: account.id,
          patch: {
            ...fields,
            ...timeZone,
            ...(changed ? { costMethod: method } : {}),
          },
        });
      else
        await create.mutateAsync({ ...fields, ...timeZone, status: 'active' });
      onClose();
    } catch {
      setFailed(true);
    }
  }

  const asked = asking !== null && account !== undefined;
  return (
    <>
      <form
        noValidate
        hidden={asked}
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
        className={asked ? 'hidden' : 'grid gap-3.5'}
      >
        <div>
          <label htmlFor={`${ids}-name`} className={LABEL}>
            Account name
          </label>
          <input
            id={`${ids}-name`}
            value={name}
            autoFocus
            onChange={(e) => setName(e.target.value)}
            aria-invalid={errors.name ? true : undefined}
            aria-describedby={errors.name ? `${ids}-name-err` : undefined}
            className={INPUT}
          />
          {errors.name ? (
            <FieldError id={`${ids}-name-err`}>{errors.name}</FieldError>
          ) : null}
        </div>
        <div>
          <label htmlFor={`${ids}-broker`} className={LABEL}>
            Broker
          </label>
          <input
            id={`${ids}-broker`}
            value={broker}
            onChange={(e) => setBroker(e.target.value)}
            className={INPUT}
          />
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)_110px] gap-3">
          <div>
            <label htmlFor={`${ids}-type`} className={LABEL}>
              Account type
            </label>
            <SelectField
              id={`${ids}-type`}
              value={type}
              onChange={(e) => setType(e.target.value as AccountType)}
            >
              {ACCOUNT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </SelectField>
          </div>
          <div>
            <label htmlFor={`${ids}-cur`} className={LABEL}>
              Currency
            </label>
            <input
              id={`${ids}-cur`}
              value={currency}
              maxLength={3}
              disabled={hasTrades}
              aria-describedby={
                [
                  hasTrades ? `${ids}-cur-help` : null,
                  errors.currency ? `${ids}-cur-err` : null,
                ]
                  .filter(Boolean)
                  .join(' ') || undefined
              }
              aria-invalid={errors.currency ? true : undefined}
              onChange={(e) => setCurrency(e.target.value.toUpperCase())}
              className={`${INPUT} uppercase disabled:opacity-60`}
            />
          </div>
        </div>
        {hasTrades ? (
          <p id={`${ids}-cur-help`} className={`${HELP} -mt-2`}>
            The currency is fixed once an account has trades.
          </p>
        ) : null}
        {errors.currency ? (
          <FieldError id={`${ids}-cur-err`}>{errors.currency}</FieldError>
        ) : null}
        <div>
          <label htmlFor={`${ids}-bal`} className={LABEL}>
            Starting balance
          </label>
          <input
            id={`${ids}-bal`}
            inputMode="decimal"
            value={balance}
            onChange={(e) => setBalance(e.target.value)}
            aria-invalid={errors.balance ? true : undefined}
            aria-describedby={`${ids}-bal-${errors.balance ? 'err' : 'help'}`}
            className={INPUT}
          />
          {errors.balance ? (
            <FieldError id={`${ids}-bal-err`}>{errors.balance}</FieldError>
          ) : (
            <p id={`${ids}-bal-help`} className={HELP}>
              What the account held before its first trade. Deposits and
              withdrawals are added on their own dates.
            </p>
          )}
        </div>
        <TimeZoneField
          label="Account time zone"
          value={shownZone}
          onChange={setZone}
        />
        {account ? (
          <div>
            <p id={`${ids}-method-label`} className={LABEL}>
              Cost method
            </p>
            <div
              role="radiogroup"
              aria-labelledby={`${ids}-method-label`}
              className="flex flex-col gap-1.5"
            >
              {COST_METHODS.map((m) => (
                <label
                  key={m.value}
                  className="flex cursor-pointer items-start gap-2.5 rounded-[10px] border border-line px-3 py-2.5 text-[13.5px] font-medium transition-colors duration-200 has-[:checked]:border-accent/45 has-[:checked]:bg-accent-soft/60 has-[:disabled]:cursor-default has-[:disabled]:opacity-70 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent pointer-coarse:min-h-11"
                >
                  <input
                    id={`${ids}-method-${m.value}`}
                    type="radio"
                    name={`${ids}-method`}
                    value={m.value}
                    checked={method === m.value}
                    disabled={archived}
                    onChange={() => setMethod(m.value)}
                    className="peer sr-only"
                  />
                  <span
                    aria-hidden="true"
                    className="mt-px grid size-[18px] flex-none place-items-center rounded-full border-[1.5px] border-line-2 bg-surface-1 after:size-2 after:rounded-full after:bg-accent after:opacity-0 peer-checked:border-accent peer-checked:after:opacity-100"
                  />
                  <span>
                    {m.label}
                    <small className="mt-0.5 block text-[12.5px] font-normal text-muted">
                      {m.line}
                    </small>
                  </span>
                </label>
              ))}
            </div>
            {archived ? (
              <p className={HELP}>An archived account keeps its cost method.</p>
            ) : null}
          </div>
        ) : null}
        <div aria-live="polite">
          {failed && !asked ? (
            <p className="text-[12.5px] font-medium text-loss">
              Couldn&apos;t save the account. Try again.
            </p>
          ) : null}
        </div>
        <div className={`mt-1 ${FOOT}`}>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy}>
            Save
          </Button>
        </div>
      </form>
      {asked ? (
        <div>
          <p id={askId} className={ASK}>
            Every trade in this account is worked out again from its fills. What
            can change:
          </p>
          <ul className={`${ASK} mt-2 ml-[18px] list-disc`}>
            <li>which day books each partial exit;</li>
            <li>the realized part of an open trade;</li>
            <li>
              the total of a pair converted at each exit&apos;s rate, such as
              USDJPY.
            </li>
          </ul>
          <p className={`${ASK} mt-2`}>
            A trade&apos;s fills, notes, tags, strategies and ratings stay as
            they are.
          </p>
          <div aria-live="polite">
            {failed ? (
              <p className="mt-3 text-[12.5px] font-medium text-loss">
                Couldn&apos;t save the account. Try again.
              </p>
            ) : null}
          </div>
          <div className={`mt-6 ${FOOT}`}>
            <Button
              variant="secondary"
              autoFocus
              disabled={busy}
              onClick={() => {
                // Cancel keeps the old method; the rest of the form stays as typed.
                setMethod(saved);
                setFailed(false);
                onAsking(null);
              }}
            >
              Cancel
            </Button>
            <Button disabled={busy} onClick={() => void save()}>
              Switch to {costMethodInfo(asking).named}
            </Button>
          </div>
        </div>
      ) : null}
    </>
  );
}

/** New account (no `account`) or Edit account, in one dialog with the same fields. */
export function AccountDialog({
  open,
  account,
  initialType,
  hasTrades,
  onClose,
}: {
  open: boolean;
  account?: Account;
  initialType?: AccountType;
  hasTrades: boolean;
  onClose(): void;
}): React.JSX.Element {
  // The question a changed cost method asks before it saves (C40); a closed dialog forgets it.
  const [asking, setAsking] = useState<CostMethod | null>(null);
  const askId = useId();
  if (!open && asking !== null) setAsking(null);
  const question = open && asking !== null && account !== undefined;
  return (
    <SettingsDialog
      open={open}
      onClose={onClose}
      title={
        question
          ? `Switch ${account.name} to ${costMethodInfo(asking).named}?`
          : account
            ? 'Edit account'
            : 'New account'
      }
      // The question is described by its own first paragraph, which says what changes.
      describedBy={question ? askId : undefined}
      description={account ? account.name : 'It starts with no trades.'}
    >
      {/* Mounted only while open, so a reopened dialog starts from the account as it is. */}
      {open ? (
        <AccountForm
          key={account?.id ?? 'new'}
          account={account}
          initialType={initialType}
          hasTrades={hasTrades}
          asking={asking}
          askId={askId}
          onAsking={setAsking}
          onClose={onClose}
        />
      ) : null}
    </SettingsDialog>
  );
}
