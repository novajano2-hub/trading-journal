'use client';

import { User } from '@phosphor-icons/react/dist/ssr';
import { useId, useState } from 'react';
import { CARD, CardHeader } from '@/components/app/dashboard/shared';
import { TimeZoneField } from '@/components/app/import/time-zone-field';
import { INPUT, LABEL, HELP } from '@/components/app/import/styles';
import {
  usePrefs,
  useSavedPrefs,
  useUnsetPrefs,
  useUpdatePrefs,
} from '@/data/query/hooks';
import { FieldError } from './settings-ui';

/** A three-letter currency code Intl knows. */
function isCurrency(code: string): boolean {
  if (!/^[A-Za-z]{3}$/.test(code)) return false;
  try {
    new Intl.NumberFormat('en-US', { style: 'currency', currency: code });
    return true;
  } catch {
    return false;
  }
}

/** What a field is doing with its save, for a screen reader and the eye. */
export function SaveStatus({
  saving,
  failed,
}: {
  saving: boolean;
  failed: boolean;
}): React.JSX.Element {
  return (
    <p
      role="status"
      aria-live="polite"
      className={`min-h-5 text-[12.5px] ${failed ? 'font-medium text-loss' : 'text-faint'}`}
    >
      {failed ? "Couldn't save that. Try again." : saving ? 'Saving...' : ''}
    </p>
  );
}

/** A field's typing, and the saved value it was typed over. */
interface Draft {
  base: string;
  text: string;
}

/** Name, time zone and base currency. Each saves as you finish it. */
export function ProfileSettings(): React.JSX.Element {
  const prefs = usePrefs().data;
  const saved = useSavedPrefs().data;
  const update = useUpdatePrefs();
  const unset = useUnsetPrefs();
  const nameId = useId();
  const currencyId = useId();

  // What is typed belongs to the saved value it was typed over: once that
  // changes (a save lands, or another tab saves), the typing is stale.
  const [nameDraft, setNameDraft] = useState<Draft | null>(null);
  const [currencyDraft, setCurrencyDraft] = useState<Draft | null>(null);
  const [currencyError, setCurrencyError] = useState(false);

  if (!prefs || !saved)
    return (
      <section className={`${CARD} px-5 pt-[18px] pb-5`}>
        <p role="status" className="text-[13.5px] text-muted">
          Loading your profile...
        </p>
      </section>
    );

  const zoneSaved = saved.timeZone !== undefined;
  const savedName = prefs.displayName ?? '';
  const name = nameDraft?.base === savedName ? nameDraft.text : null;
  const currency =
    currencyDraft?.base === prefs.baseCurrency ? currencyDraft.text : null;
  const shownName = name ?? savedName;
  const shownCurrency = currency ?? prefs.baseCurrency;
  const busy = update.isPending || unset.isPending;

  return (
    <section
      aria-labelledby="profile-heading"
      className={`${CARD} px-5 pt-[18px] pb-6`}
    >
      <CardHeader
        icon={User}
        tone="accent"
        headingId="profile-heading"
        title="Profile"
      />
      <div className="mt-5 grid max-w-[460px] gap-5">
        <div>
          <label htmlFor={nameId} className={LABEL}>
            Name
          </label>
          <input
            id={nameId}
            value={shownName}
            autoComplete="name"
            onChange={(e) =>
              setNameDraft({ base: savedName, text: e.target.value })
            }
            onBlur={() => {
              if (name === null) return;
              const next = name.trim();
              if (next === savedName) return setNameDraft(null);
              // An empty name is no name: the key is forgotten, not saved empty.
              if (next === '') unset.mutate(['displayName']);
              else update.mutate({ displayName: next });
            }}
            className={INPUT}
          />
          <p className={HELP}>Shown in your workspace. Optional.</p>
        </div>

        <div>
          <TimeZoneField
            label="Time zone"
            value={prefs.timeZone}
            onChange={(timeZone) => update.mutate({ timeZone })}
          />
          <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted">
            {zoneSaved ? (
              <button
                type="button"
                onClick={() => unset.mutate(['timeZone'])}
                className="rounded-chip font-medium text-accent-ink underline underline-offset-2 outline-offset-2 focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:min-h-11"
              >
                Use browser default
              </button>
            ) : (
              <span>Browser default ({prefs.timeZone})</span>
            )}
          </p>
        </div>

        <div>
          <label htmlFor={currencyId} className={LABEL}>
            Base currency
          </label>
          <input
            id={currencyId}
            value={shownCurrency}
            maxLength={3}
            autoComplete="off"
            spellCheck={false}
            aria-invalid={currencyError || undefined}
            aria-describedby={`${currencyId}-${currencyError ? 'err' : 'help'}`}
            onChange={(e) => {
              setCurrencyDraft({
                base: prefs.baseCurrency,
                text: e.target.value.toUpperCase(),
              });
              setCurrencyError(false);
            }}
            onBlur={() => {
              if (currency === null) return;
              if (currency === prefs.baseCurrency)
                return setCurrencyDraft(null);
              if (!isCurrency(currency)) return setCurrencyError(true);
              update.mutate({ baseCurrency: currency.toUpperCase() });
            }}
            className={`${INPUT} max-w-[120px] uppercase`}
          />
          {currencyError ? (
            <FieldError id={`${currencyId}-err`}>
              Use a three-letter currency code, like USD.
            </FieldError>
          ) : (
            <p id={`${currencyId}-help`} className={HELP}>
              The currency your totals and goals are in. Trades in another
              currency are shown on their own.
            </p>
          )}
        </div>
        <SaveStatus saving={busy} failed={update.isError || unset.isError} />
      </div>
    </section>
  );
}
