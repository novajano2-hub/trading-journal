'use client';

import { Check } from '@phosphor-icons/react/dist/ssr';
import {
  useEffect,
  useId,
  useMemo,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import { SelectField } from '@/components/app/import/select-field';
import { INPUT, LABEL } from '@/components/app/import/styles';
import { FieldError, focusField } from '@/components/app/settings/settings-ui';
import { Button } from '@/components/ui/button';
import { MorphDialog } from '@/components/ui/morph-dialog';
import { useAddPropTxn } from '@/data/query/hooks';
import {
  parseAmount,
  TXN_CATEGORIES,
  TXN_CATEGORY_LABELS,
  TXN_STATUS_LABELS,
  TXN_STATUSES,
} from '@/domain/prop/transactions';
import type {
  Challenge,
  PropTxn,
  PropTxnCategory,
  PropTxnStatus,
} from '@/domain/types';

/** The row being added: text as typed, until it is saved. */
export interface TxnDraft {
  date: string;
  description: string;
  firm: string;
  /** The trader has typed a firm (a cleared field is none): a challenge no longer fills it in. */
  firmTyped: boolean;
  challengeId: string;
  category: PropTxnCategory;
  amount: string;
  status: PropTxnStatus;
}

const blank = (today: string): TxnDraft => ({
  date: today,
  description: '',
  firm: '',
  firmTyped: false,
  challengeId: '',
  category: 'uncategorized',
  amount: '',
  status: 'not-reviewed',
});

export const AMOUNT_HINT = '−300 or 3000';

export interface NewTxn {
  draft: TxnDraft;
  /** The firms already in the workspace, as suggestions for the firm field. */
  firms: readonly string[];
  challenges: readonly Challenge[];
  errors: { date?: string; amount?: string };
  /** What a refused write says. */
  failure: string | null;
  busy: boolean;
  /** The id the form's fields share; a field's id is `${id}-name`. */
  id: string;
  set<K extends keyof TxnDraft>(key: K, value: TxnDraft[K]): void;
  /** Choosing a challenge fills the firm in, until a firm has been typed. */
  setChallenge(challengeId: string): void;
  setFirm(firm: string): void;
  /** Starts a fresh row: today, uncategorized, not reviewed. */
  reset(): void;
  /** Writes the row; the saved row, or null when it is not valid or the write failed (and says why). */
  save(): Promise<PropTxn | null>;
}

/**
 * The state behind the add row and the add sheet: the draft with the defaults
 * the brief asks (today, uncategorized, not reviewed), the checks (a real
 * date, a nonzero amount), and the write. Invalid rows do not save: the first
 * bad field says what is wrong and takes focus.
 */
export function useNewTxn({
  today,
  challenges,
  knownFirms,
}: {
  today: string;
  challenges: readonly Challenge[];
  /** Firms the transactions already carry. */
  knownFirms: readonly string[];
}): NewTxn {
  const id = useId();
  const add = useAddPropTxn();
  const [draft, setDraft] = useState<TxnDraft>(() => blank(today));
  const [errors, setErrors] = useState<NewTxn['errors']>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const firms = useMemo(
    () =>
      [
        ...new Set(
          [...challenges.map((c) => c.firm), ...knownFirms]
            .map((f) => f.trim())
            .filter(Boolean),
        ),
      ].sort((a, b) => a.localeCompare(b)),
    [challenges, knownFirms],
  );

  const set: NewTxn['set'] = (key, value) =>
    setDraft((d) => ({ ...d, [key]: value }));

  async function save(): Promise<PropTxn | null> {
    const cents = parseAmount(draft.amount);
    const next: NewTxn['errors'] = {};
    if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.date)) next.date = 'Pick a date.';
    if (cents === null) next.amount = `Enter an amount, like ${AMOUNT_HINT}.`;
    setErrors(next);
    setFailure(null);
    if (cents === null || next.date) {
      focusField(`${id}-${next.date ? 'date' : 'amount'}`);
      return null;
    }
    setBusy(true);
    try {
      const description = draft.description.trim();
      return await add.mutateAsync({
        date: draft.date,
        ...(description && { description }),
        firm: draft.firm.trim(),
        ...(draft.challengeId && { challengeId: draft.challengeId }),
        category: draft.category,
        amount: cents,
        status: draft.status,
      });
    } catch {
      setFailure("Couldn't save that. Try again.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  return {
    draft,
    firms,
    challenges,
    errors,
    failure,
    busy,
    id,
    set,
    setChallenge: (challengeId) =>
      setDraft((d) => ({
        ...d,
        challengeId,
        firm: d.firmTyped
          ? d.firm
          : (challenges.find((c) => c.id === challengeId)?.firm ?? ''),
      })),
    setFirm: (firm) =>
      setDraft((d) => ({ ...d, firm, firmTyped: firm.trim() !== '' })),
    reset: () => {
      setDraft(blank(today));
      setErrors({});
      setFailure(null);
    },
    save,
  };
}

const ROW_INPUT = `${INPUT} min-w-0`;
/** The date's own column is narrow: its native picker needs the room the padding would take. */
const DATE_INPUT = `${INPUT} min-w-0 pl-2.5 pr-1.5`;

type FieldName =
  | 'date'
  | 'description'
  | 'firm'
  | 'challenge'
  | 'category'
  | 'amount'
  | 'status';

/**
 * The seven fields of a new transaction. In the table's row each is named by
 * `aria-label` (its column heading names it for the eye); in the sheet each
 * has its own visible label, drawn by the caller, so only `id` is set.
 */
function fieldsOf(
  api: NewTxn,
  named: boolean,
): Record<FieldName, React.JSX.Element> {
  const { draft, errors } = api;
  const props = (name: string, label: string) => ({
    id: `${api.id}-${name}`,
    ...(named && { 'aria-label': label }),
  });
  const invalid = (message: string | undefined, name: string) =>
    message
      ? {
          'aria-invalid': true as const,
          'aria-describedby': `${api.id}-${name}-err`,
        }
      : {};
  return {
    date: (
      <input
        {...props('date', 'Date')}
        {...invalid(errors.date, 'date')}
        type="date"
        value={draft.date}
        onChange={(e) => api.set('date', e.target.value)}
        className={DATE_INPUT}
      />
    ),
    description: (
      <input
        {...props('description', 'Description')}
        autoComplete="off"
        placeholder="Description"
        value={draft.description}
        onChange={(e) => api.set('description', e.target.value)}
        className={ROW_INPUT}
      />
    ),
    firm: (
      <>
        <input
          {...props('firm', 'Firm')}
          list={`${api.id}-firms`}
          autoComplete="off"
          placeholder="Firm"
          value={draft.firm}
          onChange={(e) => api.setFirm(e.target.value)}
          className={ROW_INPUT}
        />
        <datalist id={`${api.id}-firms`}>
          {api.firms.map((f) => (
            <option key={f} value={f} />
          ))}
        </datalist>
      </>
    ),
    challenge: (
      <SelectField
        {...props('challenge', 'Challenge')}
        value={draft.challengeId}
        onChange={(e) => api.setChallenge(e.target.value)}
        className="min-w-0 pl-2.5"
      >
        <option value="">None</option>
        {[...api.challenges]
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
      </SelectField>
    ),
    category: (
      <SelectField
        {...props('category', 'Category')}
        value={draft.category}
        onChange={(e) => api.set('category', e.target.value as PropTxnCategory)}
        className="min-w-0 pl-2.5"
      >
        {TXN_CATEGORIES.map((c) => (
          <option key={c} value={c}>
            {TXN_CATEGORY_LABELS[c]}
          </option>
        ))}
      </SelectField>
    ),
    amount: (
      <input
        {...props('amount', 'Amount')}
        {...invalid(errors.amount, 'amount')}
        inputMode="decimal"
        autoComplete="off"
        placeholder={AMOUNT_HINT}
        value={draft.amount}
        onChange={(e) => api.set('amount', e.target.value)}
        className={`${ROW_INPUT} text-right`}
      />
    ),
    status: (
      <SelectField
        {...props('status', 'Status')}
        value={draft.status}
        onChange={(e) => api.set('status', e.target.value as PropTxnStatus)}
        className="min-w-0 pl-2.5"
      >
        {TXN_STATUSES.map((s) => (
          <option key={s} value={s}>
            {TXN_STATUS_LABELS[s]}
          </option>
        ))}
      </SelectField>
    ),
  };
}

/**
 * The inline row at the top of the table (comp 07): the seven fields and a
 * tick that saves. Enter in the description, date or amount saves, and Escape
 * closes the row; the firm's Enter belongs to its suggestions.
 */
export function AddRow({
  api,
  onSaved,
  onCancel,
}: {
  api: NewTxn;
  onSaved(row: PropTxn): void;
  onCancel(): void;
}): React.JSX.Element {
  const f = fieldsOf(api, true);
  // The row opens with the cursor in the description: the date is already today's.
  useEffect(() => {
    document.getElementById(`${api.id}-description`)?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, as the row opens
  }, []);
  const save = async () => {
    const row = await api.save();
    if (row) onSaved(row);
  };
  const cell = 'h-14 bg-accent-soft/45 pr-2.5 align-middle last:pr-0';
  return (
    <>
      <tr
        data-add-row=""
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            onCancel();
          } else if (
            e.key === 'Enter' &&
            e.target instanceof HTMLInputElement &&
            e.target.id !== `${api.id}-firm`
          ) {
            e.preventDefault();
            void save();
          }
        }}
      >
        <td className={cell}>{f.date}</td>
        <td className={cell}>{f.description}</td>
        <td className={cell}>{f.firm}</td>
        <td className={cell}>{f.challenge}</td>
        <td className={cell}>{f.category}</td>
        <td className={cell}>{f.amount}</td>
        <td className={cell}>{f.status}</td>
        <td className={`${cell} text-right`}>
          <button
            type="button"
            aria-label="Save transaction"
            disabled={api.busy}
            onClick={() => void save()}
            className="inline-grid size-7 place-items-center rounded-[8px] border border-line bg-surface-1 text-accent-ink outline-offset-2 hover:bg-sunken focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-50 pointer-coarse:size-11"
          >
            <Check size={16} weight="bold" aria-hidden="true" />
          </button>
        </td>
      </tr>
      {api.errors.date || api.errors.amount || api.failure ? (
        <tr>
          <td colSpan={8} className="bg-accent-soft/45 px-0 pb-2">
            {api.errors.date ? (
              <FieldError id={`${api.id}-date-err`}>
                {api.errors.date}
              </FieldError>
            ) : null}
            {api.errors.amount ? (
              <FieldError id={`${api.id}-amount-err`}>
                {api.errors.amount}
              </FieldError>
            ) : null}
            {api.failure ? <FieldError>{api.failure}</FieldError> : null}
          </td>
        </tr>
      ) : null}
    </>
  );
}

const SHEET_FIELDS: readonly { name: FieldName; label: string }[] = [
  { name: 'date', label: 'Date' },
  { name: 'description', label: 'Description' },
  { name: 'firm', label: 'Firm' },
  { name: 'challenge', label: 'Challenge' },
  { name: 'category', label: 'Category' },
  { name: 'amount', label: 'Amount' },
  { name: 'status', label: 'Status' },
];

/**
 * The same fields as a full-height sheet with a fixed footer, for a phone
 * (§5.3): the add row is a table row and does not fit there.
 */
export function AddSheet({
  api,
  origin,
  returnFocus,
  onSaved,
  onClose,
}: {
  api: NewTxn;
  origin: RefObject<HTMLElement | null>;
  returnFocus: RefObject<HTMLElement | null>;
  onSaved(row: PropTxn): void;
  onClose(): void;
}): React.JSX.Element {
  const f = fieldsOf(api, false);
  const save = async () => {
    const row = await api.save();
    if (row) onSaved(row);
  };
  const messages: Partial<Record<FieldName, string | undefined>> = {
    date: api.errors.date,
    amount: api.errors.amount,
  };
  return (
    <MorphDialog
      open
      onOpenChange={(open) => {
        if (!open && !api.busy) onClose();
      }}
      origin={origin}
      returnFocus={returnFocus}
      title="Add transaction"
      description="A negative amount is a cost and a positive one is income."
      size="form"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={api.busy}>
            Cancel
          </Button>
          <Button disabled={api.busy} onClick={() => void save()}>
            Add transaction
          </Button>
        </div>
      }
    >
      <form
        noValidate
        aria-label="Add transaction"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
        className="mt-3 flex flex-col gap-3.5"
      >
        {SHEET_FIELDS.map(({ name, label }) => (
          <SheetField
            key={name}
            htmlFor={`${api.id}-${name}`}
            label={label}
            error={messages[name]}
            errorId={`${api.id}-${name}-err`}
          >
            {f[name]}
          </SheetField>
        ))}
        {api.failure ? (
          <p role="alert" className="text-[13px] font-medium text-loss">
            {api.failure}
          </p>
        ) : null}
        <button type="submit" hidden />
      </form>
    </MorphDialog>
  );
}

function SheetField({
  htmlFor,
  label,
  error,
  errorId,
  children,
}: {
  htmlFor: string;
  label: string;
  error?: string | undefined;
  errorId: string;
  children: ReactNode;
}): React.JSX.Element {
  return (
    <div>
      <label htmlFor={htmlFor} className={LABEL}>
        {label}
      </label>
      {children}
      {error ? <FieldError id={errorId}>{error}</FieldError> : null}
    </div>
  );
}
