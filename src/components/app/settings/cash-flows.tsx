'use client';

import { PencilSimple, Plus, Trash } from '@phosphor-icons/react/dist/ssr';
import { useId, useState } from 'react';
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
import { FieldError, NUM, SettingsDialog, TD, TH } from './settings-ui';

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
    if (Object.keys(next).length > 0) return;
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
      className="mb-4 grid gap-3.5 rounded-control bg-sunken p-3.5"
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
            className={INPUT}
          />
          {errors.date ? <FieldError>{errors.date}</FieldError> : null}
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
            className={INPUT}
          />
          {errors.amount ? <FieldError>{errors.amount}</FieldError> : null}
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
        <Button variant="secondary" size="sm" onClick={onDone} disabled={busy}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={busy}>
          Save
        </Button>
      </div>
    </form>
  );
}

const ICON_BTN =
  'inline-grid size-8 place-items-center rounded-[8px] text-faint outline-offset-0 hover:bg-sunken hover:text-text focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:size-11';

/**
 * An account's dated deposits and withdrawals, with add, edit and remove. They
 * move the balance on their date and are not profit or loss.
 */
export function CashFlowsDialog({
  account,
  onClose,
}: {
  /** Null: closed. */
  account: Account | null;
  onClose(): void;
}): React.JSX.Element {
  const prefs = usePrefs().data;
  const flows = useCashFlows().data;
  const remove = useRemoveCashFlow();
  const display = useDisplay();
  const [form, setForm] = useState<
    { kind: 'new' } | { kind: 'edit'; flow: CashFlow } | null
  >(null);
  const [failed, setFailed] = useState(false);

  const own = (flows ?? []).filter((f) => f.accountId === account?.id);
  const total = own.reduce((n, f) => n + f.amount, 0);
  const today = localDate(new Date().toISOString(), prefs?.timeZone ?? 'UTC');
  const money = (cents: number, signed: boolean) =>
    display.cash(cents, signed, account?.currency);

  const close = () => {
    setForm(null);
    setFailed(false);
    onClose();
  };

  return (
    <SettingsDialog
      open={account !== null}
      onClose={close}
      wide
      title="Deposits and withdrawals"
      description={account ? `${account.name}, in ${account.currency}` : ''}
    >
      {account ? (
        <>
          {form ? (
            <FlowForm
              key={form.kind === 'edit' ? form.flow.id : 'new'}
              account={account}
              flow={form.kind === 'edit' ? form.flow : undefined}
              today={today}
              onDone={() => setForm(null)}
            />
          ) : (
            <div className="mb-3 flex justify-end">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setForm({ kind: 'new' })}
              >
                <Plus size={14} aria-hidden="true" />
                Add
              </Button>
            </div>
          )}
          {failed ? (
            <p
              role="alert"
              className="mb-3 text-[12.5px] font-medium text-loss"
            >
              Couldn&apos;t remove that. Try again.
            </p>
          ) : null}
          {own.length === 0 ? (
            <p className="py-3 text-[13.5px] text-muted">
              No deposits or withdrawals.
            </p>
          ) : (
            <div className="relative -mx-6 overflow-x-auto">
              <table className="w-full min-w-[520px] border-collapse text-[13.5px]">
                <thead>
                  <tr>
                    <th scope="col" className={`${TH} !pl-6`}>
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
                    <th scope="col" className={`${TH} !pr-6`}>
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {own.map((f) => (
                    <tr key={f.id}>
                      <td className={`${TD} !pl-6 whitespace-nowrap`}>
                        {dayLabel(f.date)}
                      </td>
                      <td className={TD}>
                        <Chip>{f.amount < 0 ? 'Withdrawal' : 'Deposit'}</Chip>
                      </td>
                      <td className={`${TD} text-muted`}>{f.note ?? ''}</td>
                      <td className={`${TD} ${NUM} whitespace-nowrap`}>
                        <FigureText f={money(f.amount, true)} />
                      </td>
                      <td
                        className={`${TD} !pr-6 whitespace-nowrap text-right`}
                      >
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
                          disabled={remove.isPending}
                          onClick={() => {
                            setFailed(false);
                            remove.mutate(f.id, {
                              onError: () => setFailed(true),
                            });
                          }}
                          className={ICON_BTN}
                        >
                          <Trash size={16} aria-hidden="true" />
                        </button>
                      </td>
                    </tr>
                  ))}
                  <tr>
                    <td
                      colSpan={3}
                      className={`${TD} !pl-6 font-semibold text-text`}
                    >
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
          <p className="mt-4 rounded-control bg-sunken px-4 py-3.5 text-[12.5px] leading-[1.55] text-muted">
            <b className="mb-1 block text-[13px] font-semibold text-text">
              Not profit or loss
            </b>
            Deposits and withdrawals move the balance on their date without
            counting as P&amp;L, so drawdown % and prop limits stay measured on
            real money.
          </p>
        </>
      ) : null}
    </SettingsDialog>
  );
}
