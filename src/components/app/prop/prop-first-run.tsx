'use client';

import { Plus } from '@phosphor-icons/react/dist/ssr';
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { FieldError, focusField } from '@/components/app/settings/settings-ui';
import { Button } from '@/components/ui/button';
import { MetricTip } from '@/components/ui/metric-tip';
import type { MetricId } from '@/content/metric-definitions';
import { metricContextOf } from '@/data/metrics';
import { shortDate } from '@/domain/prop/challenge';
import { totals } from '@/domain/prop/finance';
import { TXN_CATEGORY_LABELS } from '@/domain/prop/transactions';
import { localDate } from '@/domain/time';
import type { Challenge, PropTxn, Trade, UserPrefs } from '@/domain/types';
import { FigureSourceContext } from '@/lib/display';
import { CARD, signTone } from '../dashboard/shared';
import { dateLabel } from './challenge-card';
import { Cash } from './prop-parts';
import { fieldsOf, useNewTxn, type FieldName } from './txn-add';

/** How the trader trades: stored only, and it changes nothing else (C71). */
export type PropAnswer = 'own' | 'prop' | 'both';

/** How the run ended: with the answer if one was given, and whether the trader asked to add accounts. */
export interface RunEnd {
  answer?: PropAnswer;
  addAccounts: boolean;
}

const ANSWERS: readonly { id: PropAnswer; label: string; line: string }[] = [
  {
    id: 'own',
    label: 'Own capital',
    line: 'Your own trading accounts. They go in your journal as now.',
  },
  {
    id: 'prop',
    label: 'Prop firms',
    line: 'Evaluation and funded accounts with a prop firm.',
  },
  {
    id: 'both',
    label: 'Both',
    line: 'Prop accounts here; your own accounts stay in your journal.',
  },
];

const STEPS = 4;
const NO_TRADES: ReadonlyMap<string, Trade> = new Map();
const NO_CHALLENGES: readonly Challenge[] = [];

/** The day as the Transactions tab shows it: the year only for another year than this one. */
const dayOf = (date: string, today: string): string =>
  date.slice(0, 4) === today.slice(0, 4) ? shortDate(date) : dateLabel(date);

/** The form's fields, in the comp's order, each with its visible label. */
const FORM_FIELDS: readonly { name: FieldName; label: string }[] = [
  { name: 'firm', label: 'Firm' },
  { name: 'amount', label: 'Amount' },
  { name: 'date', label: 'Date' },
  { name: 'category', label: 'Category' },
  { name: 'status', label: 'Status' },
  { name: 'description', label: 'Description, optional' },
];

function Field({
  htmlFor,
  label,
  error,
  errorId,
  children,
}: {
  htmlFor: string;
  label: string;
  error: string | undefined;
  errorId: string;
  children: ReactNode;
}): React.JSX.Element {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-[13.5px] font-medium text-text">
        {label}
      </label>
      {children}
      {error ? <FieldError id={errorId}>{error}</FieldError> : null}
    </div>
  );
}

/** Step 1: three radio rows (the comp's `radio`), none chosen until the trader does. */
function HowYouTrade({
  headingId,
  answer,
  onAnswer,
}: {
  headingId: string;
  answer: PropAnswer | undefined;
  onAnswer(next: PropAnswer): void;
}): React.JSX.Element {
  const name = useId();
  return (
    <div
      role="radiogroup"
      aria-labelledby={headingId}
      className="mt-3.5 flex flex-col gap-1.5"
    >
      {ANSWERS.map((a) => (
        <label
          key={a.id}
          className="relative flex cursor-pointer items-start gap-2.5 rounded-[10px] border border-line px-3 py-2.5 text-[14px] font-medium transition-colors duration-200 has-[:checked]:border-accent/45 has-[:checked]:bg-accent-soft/60 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent pointer-coarse:min-h-12"
        >
          <input
            type="radio"
            name={name}
            value={a.id}
            checked={answer === a.id}
            onChange={() => onAnswer(a.id)}
            className="peer sr-only"
          />
          <span
            aria-hidden="true"
            className="mt-px grid size-4 flex-none place-items-center rounded-full border-[1.5px] border-line-2 bg-surface-1 after:size-2 after:rounded-full after:bg-accent after:opacity-0 peer-checked:border-accent peer-checked:after:opacity-100"
          />
          <span>
            {a.label}
            <small className="mt-px block text-[12.5px] font-normal text-muted">
              {a.line}
            </small>
          </span>
        </label>
      ))}
    </div>
  );
}

/** The rows added so far, newest first: day, firm, category and the signed amount. */
function Added({
  rows,
  today,
}: {
  rows: readonly PropTxn[];
  today: string;
}): React.JSX.Element | null {
  if (rows.length === 0) return null;
  return (
    <ul
      aria-label="Added"
      className="mt-3.5 grid grid-cols-[70px_minmax(0,1fr)_minmax(0,1fr)_auto] gap-x-2.5 border-t border-line max-sm:grid-cols-[56px_minmax(0,1fr)_auto]"
    >
      {rows.map((t) => (
        <li
          key={t.id}
          className="col-span-4 grid grid-cols-subgrid border-b border-line/70 py-2.5 text-[13.5px] max-sm:col-span-3"
        >
          <span className="text-muted">{dayOf(t.date, today)}</span>
          <span className="truncate">{t.firm}</span>
          <span className="truncate max-sm:hidden">
            {TXN_CATEGORY_LABELS[t.category]}
          </span>
          <span
            className={`text-right font-semibold tabular-nums ${
              t.status === 'ignored' ? 'text-faint' : signTone(t.amount)
            }`}
          >
            {t.status === 'ignored' ? (
              <span className="mr-2 text-[12px] font-normal">Ignored</span>
            ) : null}
            <Cash cents={t.amount} />
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Step 3: what was spent, earned and kept, Task 4's totals of the transactions (C60). */
function Totals({ txns }: { txns: readonly PropTxn[] }): React.JSX.Element {
  const { spent, earned, net } = totals(txns);
  const figures: {
    tip: MetricId;
    label: string;
    cents: number;
  }[] = [
    { tip: 'prop-spent', label: 'Spent', cents: spent === 0 ? 0 : -spent },
    { tip: 'prop-earned', label: 'Earned', cents: earned },
    { tip: 'prop-net', label: 'Net', cents: net },
  ];
  return (
    <dl className="mt-4 grid grid-cols-3 max-sm:grid-cols-1 max-sm:gap-3">
      {figures.map((f, i) => (
        <div
          key={f.tip}
          className={`min-w-0 ${
            i === 0 ? '' : 'border-l border-line pl-[18px]'
          } ${i === 2 ? '' : 'pr-[18px]'} max-sm:border-0 max-sm:p-0`}
        >
          <dt>
            <MetricTip
              id={f.tip}
              basis="net"
              className="text-left text-[12.5px] text-faint"
            >
              {f.label}
            </MetricTip>
          </dt>
          <dd
            className={`mt-1 text-[22px] leading-tight font-semibold tracking-[-0.02em] whitespace-nowrap tabular-nums ${signTone(f.cents)}`}
          >
            <Cash cents={f.cents} />
          </dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * The prop module's first run (C71, comp 13): four steps on one card, shown
 * instead of the dashboard on the first visit to a workspace that has no
 * challenge and no transaction. How you trade (stored only), a transaction
 * form adding real rows to a list, three totals, and an offer to add active
 * accounts. Skip, at any step, ends it; so do both buttons of the last. The
 * answer is the only thing it keeps of its own, and there is no bank-link
 * choice (C38). `onEnd` writes the end, and rejects if it could not.
 */
export function PropFirstRun({
  prefs,
  txns,
  onEnd,
}: {
  prefs: UserPrefs;
  /** The workspace's transactions, live: the rows added here arrive through it. */
  txns: readonly PropTxn[];
  onEnd(end: RunEnd): Promise<void>;
}): React.JSX.Element {
  const headingId = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const moved = useRef(false);
  const [step, setStep] = useState(1);
  const [answer, setAnswer] = useState<PropAnswer | undefined>();
  const [added, setAdded] = useState<readonly PropTxn[]>([]);
  const [notice, setNotice] = useState('');
  const [ending, setEnding] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const today = localDate(new Date().toISOString(), prefs.timeZone);
  const ctx = useMemo(() => metricContextOf(prefs), [prefs]);
  const knownFirms = useMemo(() => txns.map((t) => t.firm), [txns]);
  const api = useNewTxn({
    today,
    challenges: NO_CHALLENGES,
    knownFirms,
    requireFirm: true,
  });
  const fields = fieldsOf(api, false, {
    firm: 'Firm name',
    description: 'For example, a reset',
    amountAlign: 'left',
  });

  // A new step takes focus, so a keyboard or screen-reader user lands on it.
  useEffect(() => {
    if (moved.current) heading.current?.focus();
  }, [step]);
  const go = (n: number) => {
    moved.current = true;
    setProblem(null);
    setStep(n);
  };

  /** Writes the row typed; false when it is not valid or the write failed (the form says why). */
  async function add(focusFirm: boolean): Promise<boolean> {
    const row = await api.save();
    if (!row) return false;
    setAdded((rows) => [row, ...rows]);
    setNotice(`Transaction added. ${added.length + 1} in the list.`);
    api.reset();
    if (focusFirm) focusField(`${api.id}-firm`);
    return true;
  }

  // A row typed and not added is not lost on Continue: it is added first.
  const typed = api.draft.firm.trim() !== '' || api.draft.amount.trim() !== '';
  async function next() {
    if (step === 2 && typed && !(await add(false))) return;
    go(step + 1);
  }

  async function end(addAccounts: boolean) {
    setEnding(true);
    setProblem(null);
    try {
      await onEnd({ ...(answer !== undefined && { answer }), addAccounts });
    } catch {
      setProblem("Couldn't save that. Try again.");
      setEnding(false);
    }
  }

  const busy = ending || api.busy;
  const title = [
    'How do you trade?',
    "Add what you've paid and been paid",
    'Your prop-firm money so far',
    'Track your active accounts',
  ][step - 1];
  const hint = [
    'This only helps you set up; it changes nothing else.',
    'Fees and resets as a negative amount, payouts as a positive one. You can add more later in Transactions.',
    null,
    'Add each evaluation or funded account as a challenge, with its rules, to follow its progress against them.',
  ][step - 1];

  return (
    // Prop money is the base currency, signed, whatever the display menu says
    // (C72): no percent base, so only Privacy changes it.
    <FigureSourceContext.Provider
      value={{ tradesById: NO_TRADES, ctx, pctBase: null }}
    >
      <div className="flex min-w-0 flex-col gap-4 px-5 pt-1 pb-5 lg:pt-0">
        <div className="flex justify-center pt-2">
          <section
            aria-labelledby={headingId}
            className={`${CARD} w-full max-w-[640px] min-w-0 px-6 pt-[22px] pb-[18px] max-sm:px-4 max-sm:pt-[18px] max-sm:pb-3.5`}
          >
            <div className="flex items-center justify-between text-[12.5px] text-faint">
              <span>{`Step ${step} of ${STEPS}`}</span>
              <span aria-hidden="true" data-run-bar="" className="flex gap-1">
                {Array.from({ length: STEPS }, (_, i) => (
                  <i
                    key={i}
                    data-on={i < step}
                    className={`block h-1 w-7 rounded-[2px] ${i < step ? 'bg-accent' : 'bg-line'}`}
                  />
                ))}
              </span>
            </div>
            <h2
              id={headingId}
              ref={heading}
              tabIndex={-1}
              className="mt-3.5 text-[19px] leading-snug font-[650] tracking-[-0.02em] outline-none"
            >
              {title}
            </h2>
            {hint ? (
              <p className="mt-1 text-[12.5px] leading-[1.45] text-muted">
                {hint}
              </p>
            ) : null}

            {step === 1 ? (
              <HowYouTrade
                headingId={headingId}
                answer={answer}
                onAnswer={setAnswer}
              />
            ) : null}

            {step === 2 ? (
              <>
                <form
                  noValidate
                  aria-label="Add a transaction"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void add(true);
                  }}
                  className="mt-3.5"
                >
                  <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                    {FORM_FIELDS.map(({ name, label }) => (
                      <Field
                        key={name}
                        htmlFor={`${api.id}-${name}`}
                        label={label}
                        error={
                          name === 'firm' ||
                          name === 'amount' ||
                          name === 'date'
                            ? api.errors[name]
                            : undefined
                        }
                        errorId={`${api.id}-${name}-err`}
                      >
                        {fields[name]}
                      </Field>
                    ))}
                  </div>
                  {api.failure ? (
                    <p
                      role="alert"
                      className="mt-3 text-[13px] font-medium text-loss"
                    >
                      {api.failure}
                    </p>
                  ) : null}
                  <div className="mt-3">
                    <Button type="submit" variant="secondary" disabled={busy}>
                      <Plus size={16} weight="bold" aria-hidden="true" />
                      Add transaction
                    </Button>
                  </div>
                </form>
                <Added rows={added} today={today} />
                <p role="status" className="sr-only">
                  {notice}
                </p>
              </>
            ) : null}

            {step === 3 ? <Totals txns={txns} /> : null}

            {problem ? (
              <p
                role="alert"
                className="mt-4 text-[13px] font-medium text-loss"
              >
                {problem}
              </p>
            ) : null}

            {step < STEPS ? (
              <div className="mt-5 flex items-center justify-end gap-2 border-t border-line pt-3.5">
                <div className="mr-auto flex gap-1">
                  {step > 1 ? (
                    <Button
                      variant="ghost"
                      disabled={busy}
                      onClick={() => go(step - 1)}
                    >
                      Back
                    </Button>
                  ) : null}
                  <Button
                    variant="ghost"
                    disabled={busy}
                    onClick={() => void end(false)}
                  >
                    Skip
                  </Button>
                </div>
                <Button
                  disabled={busy || (step === 1 && answer === undefined)}
                  onClick={() => void next()}
                >
                  Continue
                </Button>
              </div>
            ) : (
              <div className="mt-5 flex flex-wrap items-center justify-end gap-2 border-t border-line pt-3.5 max-sm:flex-col-reverse max-sm:*:w-full">
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={() => void end(false)}
                >
                  Go to the dashboard
                </Button>
                <Button disabled={busy} onClick={() => void end(true)}>
                  <Plus size={16} weight="bold" aria-hidden="true" />
                  Add active accounts
                </Button>
              </div>
            )}
          </section>
        </div>
      </div>
    </FigureSourceContext.Provider>
  );
}
