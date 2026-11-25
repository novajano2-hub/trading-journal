'use client';

import { CaretUpDown, Info } from '@phosphor-icons/react/dist/ssr';
import { Dialog } from 'radix-ui';
import { useId, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useCompleteFirstRun } from '@/data/query/hooks';
import { USERNAME } from '@/data/onboarding';
import { FieldError } from '../settings/settings-ui';
import {
  currencyChoices,
  currencyPlural,
  zoneChoices,
  zoneName,
  type Choice,
} from './choices';
import { clearFirstRun, readFirstRun, toAnswers } from './survey-model';

/** TradeZella's default zone: US/Eastern, stored as its IANA name [inv-1 013]. */
export const DEFAULT_ZONE = 'America/New_York';
export const DEFAULT_CURRENCY = 'USD';

const LABEL = 'text-[13.5px] font-medium text-text';
const FIELD =
  'block h-10 w-full rounded-control border border-line-2 bg-surface-1 px-3 text-sm text-text shadow-[var(--shadow-chip)] transition-[border-color,box-shadow] duration-200 outline-none placeholder:text-faint hover:border-faint focus-visible:border-accent focus-visible:shadow-[0_0_0_3px_var(--accent-soft)] aria-invalid:border-loss pointer-coarse:h-11';
const HINT = 'text-[12.5px] leading-[1.45] text-muted';

function Select({
  id,
  label,
  value,
  onChange,
  choices,
  hint,
}: {
  id: string;
  label: string;
  value: string;
  onChange(value: string): void;
  choices: Choice[];
  hint?: string;
}): React.JSX.Element {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className={LABEL}>
        {label}
      </label>
      <div className="relative">
        <select
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-describedby={hint ? `${id}-hint` : undefined}
          className={`${FIELD} appearance-none pr-9`}
        >
          {choices.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
        <CaretUpDown
          size={14}
          weight="bold"
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-faint"
        />
      </div>
      {hint ? (
        <p id={`${id}-hint`} className={HINT}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/**
 * The first run's preferences (comp 13): names, a username, the default
 * currency and the time zone. All are required and there is no way to close
 * it or skip it: Escape and a click outside do nothing [inv-1 013; K48].
 * Finishing saves the survey answers and makes "My account" (the repository
 * does that in one transaction). A failed save keeps every answer and shows
 * the error; a retry makes no second account, since the write skips it when
 * My workspace has one. Below `sm` it is a full-height sheet with a fixed foot.
 */
export function PreferencesDialog({
  onSaved,
}: {
  /** Called with the zone's name once the save has landed. */
  onSaved(zone: string): void;
}): React.JSX.Element {
  const ids = useId();
  const complete = useCompleteFirstRun();
  const [first, setFirst] = useState('');
  const [last, setLast] = useState('');
  const [username, setUsername] = useState('');
  const [currency, setCurrency] = useState(DEFAULT_CURRENCY);
  const [zone, setZone] = useState(DEFAULT_ZONE);
  const [errors, setErrors] = useState<{
    first?: string;
    last?: string;
    username?: string;
  }>({});
  const [failed, setFailed] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  const currencies = useMemo(() => currencyChoices(), []);
  const zones = useMemo(() => zoneChoices(), []);

  async function submit() {
    const next: typeof errors = {};
    if (!first.trim()) next.first = 'Enter your first name.';
    if (!last.trim()) next.last = 'Enter your last name.';
    if (!USERNAME.test(username.trim()))
      next.username = 'Use 3 to 30 letters, digits, dots or underscores.';
    setErrors(next);
    setFailed(false);
    const invalid = next.first
      ? `${ids}-first`
      : next.last
        ? `${ids}-last`
        : next.username
          ? `${ids}-user`
          : null;
    if (invalid) {
      form.current?.querySelector<HTMLElement>(`[id="${invalid}"]`)?.focus();
      return;
    }
    try {
      await complete.mutateAsync({
        firstName: first.trim(),
        lastName: last.trim(),
        username: username.trim(),
        baseCurrency: currency,
        timeZone: zone,
        survey: toAnswers(readFirstRun().draft),
      });
    } catch {
      setFailed(true);
      return;
    }
    clearFirstRun();
    onSaved(zoneName(zone));
  }

  const field = (
    key: 'first' | 'last' | 'user',
    label: string,
    value: string,
    set: (v: string) => void,
    error: string | undefined,
    autoComplete: string,
    hint?: string,
  ) => (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={`${ids}-${key}`} className={LABEL}>
        {label}
      </label>
      <input
        id={`${ids}-${key}`}
        value={value}
        onChange={(e) => set(e.target.value)}
        autoComplete={autoComplete}
        spellCheck={false}
        aria-invalid={error ? true : undefined}
        aria-describedby={
          [hint ? `${ids}-${key}-hint` : '', error ? `${ids}-${key}-err` : '']
            .filter(Boolean)
            .join(' ') || undefined
        }
        className={FIELD}
      />
      {hint ? (
        <p id={`${ids}-${key}-hint`} className={HINT}>
          {hint}
        </p>
      ) : null}
      {error ? <FieldError id={`${ids}-${key}-err`}>{error}</FieldError> : null}
    </div>
  );

  return (
    <Dialog.Root open>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-veil" />
        <Dialog.Content
          // It can't be skipped: no close button, and Escape or a click outside do nothing.
          onEscapeKeyDown={(e) => e.preventDefault()}
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
          className="fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100dvh-40px)] w-[min(520px,calc(100vw-48px))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-[16px] border border-line bg-surface-1 text-text shadow-[var(--shadow)] outline-none motion-safe:data-[state=open]:animate-pop-in max-sm:inset-x-0 max-sm:top-auto max-sm:bottom-0 max-sm:h-[calc(100dvh-12px)] max-sm:max-h-none max-sm:w-full max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-b-none max-sm:border-x-0 max-sm:border-b-0"
        >
          <form
            ref={form}
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
            className="flex min-h-0 flex-1 flex-col"
          >
            <div className="flex-none px-6 pt-[18px] pb-3.5 max-sm:px-5">
              <Dialog.Title className="text-[17px] leading-snug font-semibold tracking-[-0.015em]">
                Your profile
              </Dialog.Title>
              <Dialog.Description className="mt-0.5 text-[13px] text-muted">
                You can change any of this later in Settings.
              </Dialog.Description>
            </div>
            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 pt-0.5 pb-5 max-sm:px-5">
              <div className="grid grid-cols-2 gap-2.5">
                {field(
                  'first',
                  'First name',
                  first,
                  setFirst,
                  errors.first,
                  'given-name',
                )}
                {field(
                  'last',
                  'Last name',
                  last,
                  setLast,
                  errors.last,
                  'family-name',
                )}
              </div>
              {field(
                'user',
                'Username',
                username,
                setUsername,
                errors.username,
                'username',
                'Letters, digits, dots and underscores, 3 to 30 characters.',
              )}
              <Select
                id={`${ids}-cur`}
                label="Default currency"
                value={currency}
                onChange={setCurrency}
                choices={currencies}
              />
              <Select
                id={`${ids}-zone`}
                label="Time zone"
                value={zone}
                onChange={setZone}
                choices={zones}
                hint="Keel shows every trade's times in this zone. Changing it later re-times them all."
              />
              <div className="flex items-start gap-2.5 rounded-control bg-sunken px-3 py-2.5 text-[13px] leading-[1.5] text-muted">
                <Info
                  size={16}
                  aria-hidden="true"
                  className="mt-px flex-none"
                />
                <span>
                  Finishing makes one account, <b>My account</b>, in{' '}
                  {currencyPlural(currency)}, so you can add trades straight
                  away.
                </span>
              </div>
              {failed ? (
                <p role="alert" className="text-[13px] font-medium text-loss">
                  Couldn&apos;t save your profile. Your answers are still here.
                  Try again.
                </p>
              ) : null}
            </div>
            <div className="flex flex-none justify-end border-t border-line bg-surface-1 px-6 py-3.5 max-sm:px-5 max-sm:pb-[calc(12px+env(safe-area-inset-bottom))]">
              <Button
                type="submit"
                disabled={complete.isPending}
                className="max-sm:h-11 max-sm:flex-1 max-sm:text-[15px]"
              >
                Finish setup
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
