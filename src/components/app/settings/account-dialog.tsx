'use client';

import { useId, useState } from 'react';
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
import type { Account, AccountType } from '@/domain/types';
import { FieldError, focusField, SettingsDialog } from './settings-ui';

export const ACCOUNT_TYPES: readonly { value: AccountType; label: string }[] = [
  { value: 'live', label: 'Live' },
  { value: 'demo', label: 'Demo' },
  { value: 'prop-evaluation', label: 'Prop evaluation' },
  { value: 'prop-funded', label: 'Prop funded' },
];

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
  onClose,
}: {
  /** Absent: a new account. */
  account?: Account;
  /** A new account's type before the user picks one; Home's first step opens on a prop account. */
  initialType?: AccountType;
  hasTrades: boolean;
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
  const [errors, setErrors] = useState<{
    name?: string;
    currency?: string;
    balance?: string;
  }>({});
  const [failed, setFailed] = useState(false);
  const busy = create.isPending || update.isPending;
  const shownZone = zone ?? account?.timeZone ?? prefs?.timeZone ?? 'UTC';

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
    try {
      if (account)
        await update.mutateAsync({
          id: account.id,
          patch: { ...fields, ...timeZone },
        });
      else
        await create.mutateAsync({ ...fields, ...timeZone, status: 'active' });
      onClose();
    } catch {
      setFailed(true);
    }
  }

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
      className="grid gap-3.5"
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
      <div aria-live="polite">
        {failed ? (
          <p className="text-[12.5px] font-medium text-loss">
            Couldn&apos;t save the account. Try again.
          </p>
        ) : null}
      </div>
      <div className="mt-1 flex flex-wrap justify-end gap-2">
        <Button variant="secondary" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy}>
          Save
        </Button>
      </div>
    </form>
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
  return (
    <SettingsDialog
      open={open}
      onClose={onClose}
      title={account ? 'Edit account' : 'New account'}
      description={account ? account.name : 'It starts with no trades.'}
    >
      {/* Mounted only while open, so a reopened dialog starts from the account as it is. */}
      {open ? (
        <AccountForm
          key={account?.id ?? 'new'}
          account={account}
          initialType={initialType}
          hasTrades={hasTrades}
          onClose={onClose}
        />
      ) : null}
    </SettingsDialog>
  );
}
