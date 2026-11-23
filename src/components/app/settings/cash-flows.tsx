'use client';

import {
  CurrencyDollar,
  PencilSimple,
  Plus,
  Trash,
} from '@phosphor-icons/react/dist/ssr';
import { useId, useState, type Ref } from 'react';
import { ConfirmDialog } from '@/components/app/confirm-dialog';
import { CARD, CardHeader } from '@/components/app/dashboard/shared';
import { FigureText } from '@/components/product/figure-text';
import { INPUT, LABEL } from '@/components/app/import/styles';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { Segmented } from '@/components/ui/segmented';
import {
  useCashFlows,
  useCreateCashFlow,
  usePrefs,
  useRemoveCashFlow,
  useUpdateCashFlow,
} from '@/data/query/hooks';
import { toCents } from '@/domain/money';
import { localDate } from '@/domain/time';
import type { Account, CashFlow } from '@/domain/types';
import { useDisplay } from '@/lib/display';
import { FieldError, focusField, NUM, TD, TH } from './settings-ui';

type Kind = 'deposit' | 'withdrawal';

/** "Fri 6 Nov 2026". */
function dayLabel(date: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'UTC',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(`${date}T00:00:00Z`));
}

/** What a flow is called on its buttons: its note, else its date. */
const nameOf = (f: CashFlow) => f.note || f.date;

function FlowForm({
  account,
  flow,
  today,
  onDone,
}: {
  account: Account;
  /** Absent: a new flow. */
  flow?: CashFlow;
  today: string;
  onDone(): void;
}): React.JSX.Element {
  const create = useCreateCashFlow();
  const update = useUpdateCashFlow();
  const ids = useId();
  const [date, setDate] = useState(flow?.date ?? today);
  const [kind, setKind] = useState<Kind>(
    flow && flow.amount < 0 ? 'withdrawal' : 'deposit',
  );
  const [amount, setAmount] = useState(
    flow ? String(Math.abs(flow.amount) / 100) : '',
  );
  const [note, setNote] = useState(flow?.note ?? '');
  const [errors, setErrors] = useState<{ date?: string; amount?: string }>({});
  const [failed, setFailed] = useState(false);
  const busy = create.isPending || update.isPending;

  async function save() {
    const value = Number(amount.replace(/,/g, ''));
    const next: typeof errors = {};
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) next.date = 'Pick a date.';
    if (amount.trim() === '' || !Number.isFinite(value) || value <= 0)
      next.amount = 'Enter an amount above zero.';
    setErrors(next);
    setFailed(false);
    if (Object.keys(next).length > 0) {
      focusField(next.date ? `${ids}-date` : `${ids}-amount`);
      return;
    }
    const cents = toCents(value) * (kind === 'withdrawal' ? -1 : 1);
    try {
      if (flow)
        await update.mutateAsync({
          id: flow.id,
          patch: { date, amount: cents, note },
        });
      else
        await create.mutateAsync({
          accountId: account.id,
          date,
          amount: cents,
          note,
        });
      onDone();
    } catch {
      setFailed(true);
    }
  }

  return (
    <form
      noValidate
      aria-label={
        flow ? 'Edit deposit or withdrawal' : 'New deposit or withdrawal'
      }
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
      className="mx-5 mt-4 mb-1 grid gap-3.5 rounded-control bg-sunken p-3.5"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={`${ids}-date`} className={LABEL}>
            Date
          </label>
          <input
            id={`${ids}-date`}
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            aria-invalid={errors.date ? true : undefined}
            aria-describedby={errors.date ? `${ids}-date-err` : undefined}
            className={INPUT}
          />
          {errors.date ? (
            <FieldError id={`${ids}-date-err`}>{errors.date}</FieldError>
          ) : null}
        </div>
        <div>
          <span className={LABEL}>Type</span>
          <Segmented<Kind>
            label="Type"
            value={kind}
            options={[
              { value: 'deposit', label: 'Deposit' },
              { value: 'withdrawal', label: 'Withdrawal' },
            ]}
            coarseTargets
            onChange={setKind}
          />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={`${ids}-amount`} className={LABEL}>
            Amount
          </label>
          <input
            id={`${ids}-amount`}
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            aria-invalid={errors.amount ? true : undefined}
            aria-describedby={errors.amount ? `${ids}-amount-err` : undefined}
            className={INPUT}
          />
          {errors.amount ? (
            <FieldError id={`${ids}-amount-err`}>{errors.amount}</FieldError>
          ) : null}
        </div>
        <div>
          <label htmlFor={`${ids}-note`} className={LABEL}>
            Note
          </label>
          <input
            id={`${ids}-note`}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className={INPUT}
          />
        </div>
      </div>
      <div aria-live="polite">
        {failed ? (
          <p className="text-[12.5px] font-medium text-loss">
            Couldn&apos;t save that. Try again.
          </p>
        ) : null}
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="secondary" onClick={onDone} disabled={busy}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy}>
          Save
        </Button>
      </div>
    </form>
  );
}

const ICON_BTN =
  'inline-grid size-8 place-items-center rounded-[8px] text-faint outline-offset-0 hover:bg-sunken hover:text-text focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:size-11';

/**
 * The selected account's dated deposits and withdrawals (comp 11's "Balance
 * adjustments" card), with add, edit and remove. They move the balance on their
 * date and are not profit or loss. The card takes focus when asked for from a
 * row's menu (`cardRef`).
 */
export function BalanceAdjustments({
  account,
  cardRef,
}: {
  account: Account;
  cardRef?: Ref<HTMLElement>;
}): React.JSX.Element {
  const prefs = usePrefs().data;
  const flowsQuery = useCashFlows();
  const flows = flowsQuery.data;
  const remove = useRemoveCashFlow();
  // Balances and flows are cash, so they follow the display unit only under Privacy.
  const display = useDisplay();
  const [form, setForm] = useState<
    { kind: 'new' } | { kind: 'edit'; flow: CashFlow } | null
  >(null);
  const [removing, setRemoving] = useState<CashFlow | null>(null);
  // The form belongs to the account it was opened for.
  const [formFor, setFormFor] = useState(account.id);
  if (formFor !== account.id) {
    setFormFor(account.id);
    setForm(null);
  }

  const own = (flows ?? []).filter((f) => f.accountId === account.id);
  const total = own.reduce((n, f) => n + f.amount, 0);
  const today = localDate(new Date().toISOString(), prefs?.timeZone ?? 'UTC');
  const money = (cents: number, signed: boolean) =>
    display.cash(cents, signed, account.currency);

  return (
    <section
      ref={cardRef}
      tabIndex={-1}
      aria-labelledby="adjustments-heading"
      className={`${CARD} pt-[18px] pb-5 outline-offset-2 focus-visible:outline-2 focus-visible:outline-accent`}
    >
      <CardHeader
        className="px-5"
        icon={CurrencyDollar}
        tone="accent"
        headingId="adjustments-heading"
        title="Balance adjustments"
        after={
          <span className="text-[12.5px] text-faint">
            {account.name}, in {account.currency}
          </span>
        }
        end={
          form ? null : (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setForm({ kind: 'new' })}
            >
              <Plus size={14} aria-hidden="true" />
              Add adjustment
            </Button>
          )
        }
      />
      {form ? (
        <FlowForm
          key={form.kind === 'edit' ? form.flow.id : 'new'}
          account={account}
          flow={form.kind === 'edit' ? form.flow : undefined}
          today={today}
          onDone={() => setForm(null)}
        />
      ) : null}
      {flowsQuery.status === 'error' ? (
        <p role="alert" className="px-5 pt-3 text-[13.5px] text-muted">
          Keel couldn&apos;t read the deposits and withdrawals. Reload the page
          to try again.
        </p>
      ) : !flows ? (
        <p role="status" className="px-5 pt-3 text-[13.5px] text-muted">
          Loading the deposits and withdrawals...
        </p>
      ) : own.length === 0 ? (
        <p className="px-5 pt-3 text-[13.5px] text-muted">
          No deposits or withdrawals.
        </p>
      ) : (
        <div className="relative mt-3 overflow-x-auto">
          <table
            aria-labelledby="adjustments-heading"
            className="w-full min-w-[560px] border-collapse text-[13.5px]"
          >
            <thead>
              <tr>
                <th scope="col" className={TH}>
                  Date
                </th>
                <th scope="col" className={TH}>
                  Type
                </th>
                <th scope="col" className={TH}>
                  Note
                </th>
                <th scope="col" className={`${TH} ${NUM}`}>
                  Amount
                </th>
                <th scope="col" className={TH}>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {own.map((f) => (
                <tr key={f.id}>
                  <td className={`${TD} whitespace-nowrap`}>
                    {dayLabel(f.date)}
                  </td>
                  <td className={TD}>
                    <Chip>{f.amount < 0 ? 'Withdrawal' : 'Deposit'}</Chip>
                  </td>
                  <td className={`${TD} text-muted`}>{f.note ?? ''}</td>
                  <td className={`${TD} ${NUM} whitespace-nowrap`}>
                    <FigureText f={money(f.amount, true)} />
                  </td>
                  <td className={`${TD} whitespace-nowrap text-right`}>
                    <button
                      type="button"
                      aria-label={`Edit ${nameOf(f)}`}
                      onClick={() => setForm({ kind: 'edit', flow: f })}
                      className={ICON_BTN}
                    >
                      <PencilSimple size={16} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      aria-label={`Remove ${nameOf(f)}`}
                      onClick={() => setRemoving(f)}
                      className={ICON_BTN}
                    >
                      <Trash size={16} aria-hidden="true" />
                    </button>
                  </td>
                </tr>
              ))}
              <tr>
                <td colSpan={3} className={`${TD} font-semibold text-text`}>
                  Total, on a{' '}
                  <FigureText f={money(account.startingBalance, false)} />{' '}
                  starting balance
                </td>
                <td className={`${TD} ${NUM} font-semibold text-text`}>
                  <FigureText f={money(total, true)} />
                </td>
                <td className={TD} />
              </tr>
            </tbody>
          </table>
        </div>
      )}
      <p className="mx-5 mt-4 rounded-control bg-sunken px-4 py-3.5 text-[12.5px] leading-[1.55] text-muted">
        <b className="mb-1 block text-[13px] font-semibold text-text">
          Not profit or loss
        </b>
        Deposits and withdrawals move the balance on their date without counting
        as P&amp;L. Return % and drawdown % are measured on your real balance,
        with them in.
      </p>
      <ConfirmDialog
        open={removing !== null}
        danger
        title={`Remove ${removing ? nameOf(removing) : ''}?`}
        body={
          removing
            ? `This ${removing.amount < 0 ? 'withdrawal' : 'deposit'} of ${money(Math.abs(removing.amount), false).text} on ${dayLabel(removing.date)} is taken out of the balance. This can't be undone.`
            : ''
        }
        confirmLabel="Remove"
        onConfirm={async () => {
          if (removing) await remove.mutateAsync(removing.id);
        }}
        onClose={() => setRemoving(null)}
      />
    </section>
  );
}
