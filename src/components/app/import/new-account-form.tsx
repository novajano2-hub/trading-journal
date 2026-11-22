'use client';

import { useEffect, useId, useRef, useState, type RefObject } from 'react';
import { buttonClasses } from '@/components/ui/button-styles';
import { useCreateUserAccount, usePrefs } from '@/data/query/hooks';
import { toCents } from '@/domain/money';
import { isValidTimeZone } from '@/domain/time';
import type { Account, AccountType } from '@/domain/types';
import { SelectField } from './select-field';
import { INPUT, LABEL } from './styles';
import { TimeZoneField } from './time-zone-field';

const TYPES: readonly { value: AccountType; label: string }[] = [
  { value: 'live', label: 'Live' },
  { value: 'demo', label: 'Demo' },
  { value: 'prop-evaluation', label: 'Prop evaluation' },
  { value: 'prop-funded', label: 'Prop funded' },
];

/** Makes the account from what is typed; null, with the errors shown, when it cannot. */
export type NewAccountSubmit = () => Promise<Account | null>;

/** The fields of a new account, inline in the import's account card. */
export function NewAccountForm({
  onCreated,
  onCancel,
  submitRef,
  onValid,
}: {
  onCreated: (account: Account) => void;
  /** Lets the page create the account for its own Continue. */
  submitRef?: RefObject<NewAccountSubmit | null>;
  /** Whether the fields can make an account, as they are. */
  onValid?: (valid: boolean) => void;
  /** Present when the visitor already has an account to go back to. */
  onCancel?: () => void;
}) {
  const prefs = usePrefs().data;
  const create = useCreateUserAccount();
  const ids = useId();
  const nameRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState('');
  const [broker, setBroker] = useState('');
  const [type, setType] = useState<AccountType>('live');
  const [currency, setCurrency] = useState<string | null>(null);
  const [balance, setBalance] = useState('0');
  const [zone, setZone] = useState<string | null>(null);
  const [errors, setErrors] = useState<{
    name?: string;
    currency?: string;
    balance?: string;
  }>({});
  const [failed, setFailed] = useState(false);

  const shownCurrency = currency ?? prefs?.baseCurrency ?? 'USD';
  const shownZone = zone ?? prefs?.timeZone ?? 'UTC';

  const amount = Number(balance.replace(/,/g, ''));
  const valid =
    name.trim() !== '' &&
    /^[A-Za-z]{3}$/.test(shownCurrency) &&
    balance.trim() !== '' &&
    Number.isFinite(amount) &&
    amount >= 0;
  useEffect(() => onValid?.(valid), [valid, onValid]);

  async function submit(): Promise<Account | null> {
    const next: typeof errors = {};
    if (!name.trim()) next.name = 'Give the account a name.';
    if (!/^[A-Za-z]{3}$/.test(shownCurrency))
      next.currency = 'Use a three-letter code, like USD.';
    if (balance.trim() === '' || !Number.isFinite(amount) || amount < 0)
      next.balance = 'Enter an amount of zero or more.';
    setErrors(next);
    setFailed(false);
    if (Object.keys(next).length > 0) {
      if (next.name) nameRef.current?.focus();
      return null;
    }
    try {
      const account = await create.mutateAsync({
        name: name.trim(),
        broker: broker.trim(),
        type,
        currency: shownCurrency.toUpperCase(),
        startingBalance: toCents(amount),
        status: 'active',
        ...(isValidTimeZone(shownZone) ? { timeZone: shownZone } : {}),
      });
      onCreated(account);
      return account;
    } catch {
      setFailed(true);
      return null;
    }
  }

  useEffect(() => {
    if (!submitRef) return;
    submitRef.current = submit;
    return () => {
      submitRef.current = null;
    };
  });

  return (
    <div
      role="group"
      aria-label="New account"
      className="mt-4 grid gap-3.5 rounded-control bg-sunken p-3.5"
    >
      <div>
        <label htmlFor={`${ids}-name`} className={LABEL}>
          Account name
        </label>
        <input
          ref={nameRef}
          id={`${ids}-name`}
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-invalid={errors.name ? true : undefined}
          aria-describedby={errors.name ? `${ids}-name-err` : undefined}
          className={INPUT}
        />
        {errors.name ? (
          <p
            id={`${ids}-name-err`}
            className="mt-1.5 text-[12.5px] font-medium text-loss"
          >
            {errors.name}
          </p>
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
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor={`${ids}-type`} className={LABEL}>
            Account type
          </label>
          <SelectField
            id={`${ids}-type`}
            value={type}
            onChange={(e) => setType(e.target.value as AccountType)}
          >
            {TYPES.map((t) => (
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
            value={shownCurrency}
            maxLength={3}
            onChange={(e) => setCurrency(e.target.value.toUpperCase())}
            aria-invalid={errors.currency ? true : undefined}
            aria-describedby={errors.currency ? `${ids}-cur-err` : undefined}
            className={INPUT}
          />
        </div>
      </div>
      {errors.currency ? (
        <p
          id={`${ids}-cur-err`}
          className="-mt-1.5 text-[12.5px] font-medium text-loss"
        >
          {errors.currency}
        </p>
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
          aria-describedby={errors.balance ? `${ids}-bal-err` : undefined}
          className={INPUT}
        />
        {errors.balance ? (
          <p
            id={`${ids}-bal-err`}
            className="mt-1.5 text-[12.5px] font-medium text-loss"
          >
            {errors.balance}
          </p>
        ) : null}
      </div>
      <TimeZoneField
        label="Account time zone"
        value={shownZone}
        onChange={setZone}
      />
      <div aria-live="polite">
        {failed ? (
          <p className="text-[12.5px] font-medium text-loss">
            Couldn&apos;t create the account. Try again.
          </p>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void submit()}
          disabled={create.isPending}
          className={buttonClasses('primary', 'sm')}
        >
          Create account
        </button>
        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            className={buttonClasses('ghost', 'sm')}
          >
            Cancel
          </button>
        ) : null}
      </div>
    </div>
  );
}
