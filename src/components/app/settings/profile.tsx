'use client';

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
import { USERNAME, USERNAME_MESSAGE, isCurrencyCode } from '@/data/onboarding';
import { zoneLabel } from '@/lib/time-zone-label';
import { AppearanceControl } from '../appearance';
import { FieldError } from './settings-ui';

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

/**
 * A text preference that saves when you leave the field. What is typed belongs
 * to the saved value it was typed over: once that changes (a save lands, or
 * another tab saves), the typing is stale.
 *
 * Keel's call (TradeZella unknown): the first run requires first name, last
 * name and username [inv-1 013] but Settings' rule isn't recorded, so a field
 * that is set can't be emptied: emptying it shows `required` and saves
 * nothing. A field never set (the v3 upgrade onboards without names) may stay
 * empty, with no error.
 */
function TextPref({
  label,
  saved,
  hint,
  autoComplete,
  required,
  invalid,
  onSave,
}: {
  label: string;
  saved: string;
  hint: string;
  autoComplete: string;
  /** What an emptied field that was set says. */
  required: string;
  /** The message for a typed value that can't be saved, or none. */
  invalid?(text: string): string | null;
  onSave(next: string): void;
}): React.JSX.Element {
  const id = useId();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const typed = draft?.base === saved ? draft.text : null;
  return (
    <div>
      <label htmlFor={id} className={LABEL}>
        {label}
      </label>
      <input
        id={id}
        value={typed ?? saved}
        autoComplete={autoComplete}
        spellCheck={false}
        aria-invalid={error !== null || undefined}
        aria-describedby={`${id}-${error !== null ? 'err' : 'help'}`}
        onChange={(e) => {
          setDraft({ base: saved, text: e.target.value });
          setError(null);
        }}
        onBlur={() => {
          if (typed === null) return;
          const next = typed.trim();
          if (next === saved) return setDraft(null);
          const message = next === '' ? required : (invalid?.(next) ?? null);
          if (message !== null) return setError(message);
          onSave(next);
        }}
        className={INPUT}
      />
      {error !== null ? (
        <FieldError id={`${id}-err`}>{error}</FieldError>
      ) : (
        <p id={`${id}-help`} className={HELP}>
          {hint}
        </p>
      )}
    </div>
  );
}

/** First name, last name, username, time zone, base currency and appearance. Each saves as you finish it. */
export function ProfileSettings(): React.JSX.Element {
  const prefs = usePrefs().data;
  const saved = useSavedPrefs().data;
  const update = useUpdatePrefs();
  const unset = useUnsetPrefs();
  const currencyId = useId();

  // What is typed belongs to the saved value it was typed over: once that
  // changes (a save lands, or another tab saves), the typing is stale.
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
  const currency =
    currencyDraft?.base === prefs.baseCurrency ? currencyDraft.text : null;
  const shownCurrency = currency ?? prefs.baseCurrency;
  const busy = update.isPending || unset.isPending;

  return (
    <section
      aria-labelledby="profile-heading"
      className={`${CARD} px-5 pt-[18px] pb-6`}
    >
      <CardHeader headingId="profile-heading" title="Profile" />
      <div className="mt-5 grid max-w-[460px] gap-5">
        <TextPref
          label="First name"
          // An old display name reads as the first name until one is saved.
          saved={prefs.firstName ?? prefs.displayName ?? ''}
          hint="Shown in your workspace, in your greeting."
          autoComplete="given-name"
          required="Enter your first name."
          onSave={(next) => update.mutate({ firstName: next })}
        />
        <TextPref
          label="Last name"
          saved={prefs.lastName ?? ''}
          hint="Your family name."
          autoComplete="family-name"
          required="Enter your last name."
          onSave={(next) => update.mutate({ lastName: next })}
        />
        <TextPref
          label="Username"
          saved={prefs.username ?? ''}
          hint="Letters, digits, dots and underscores, 3 to 30 characters."
          autoComplete="username"
          required="Enter a username."
          invalid={(text) => (USERNAME.test(text) ? null : USERNAME_MESSAGE)}
          onSave={(next) => update.mutate({ username: next })}
        />

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
              <span>Browser default ({zoneLabel(prefs.timeZone)})</span>
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
              if (!isCurrencyCode(currency)) return setCurrencyError(true);
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
              The currency your totals are in. Trades in another currency are
              shown on their own.
            </p>
          )}
        </div>
        <div>
          {/* The control's own name is Appearance; this is its visible label. */}
          <p aria-hidden="true" className={LABEL}>
            Appearance
          </p>
          <AppearanceControl />
          <p className={HELP}>System follows your device&apos;s setting.</p>
        </div>
        <SaveStatus saving={busy} failed={update.isError || unset.isError} />
      </div>
    </section>
  );
}
