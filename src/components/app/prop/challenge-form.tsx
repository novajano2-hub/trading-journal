'use client';

import { Check, Info } from '@phosphor-icons/react/dist/ssr';
import { useId, useRef, useState, type ReactNode } from 'react';
import { ConfirmDialog } from '@/components/app/confirm-dialog';
import { SelectField } from '@/components/app/import/select-field';
import { HELP, INPUT, LABEL } from '@/components/app/import/styles';
import {
  FieldError,
  focusField,
  SettingsDialog,
} from '@/components/app/settings/settings-ui';
import { Button } from '@/components/ui/button';
import { Segmented } from '@/components/ui/segmented';
import {
  useAccounts,
  useChallenges,
  useCreateAccount,
  useCreateChallenge,
  usePrefs,
  useRemoveChallenge,
  useStrategies,
  useUpdateAccount,
  useUpdateChallenge,
} from '@/data/query/hooks';
import { toCents } from '@/domain/money';
import { drawdownLabel } from '@/domain/prop/challenge';
import type {
  Account,
  Cents,
  Challenge,
  ChallengeStep,
  DrawdownType,
} from '@/domain/types';
import { useDisplay } from '@/lib/display';
import {
  draftFromRules,
  emptyRules,
  rulesFromDraft,
  type RuleDraft,
  type RuleErrors,
  type Unit,
} from './rule-draft';

interface PhaseDraft {
  /** 'none', 'new', or the id of the account linked. */
  link: string;
  newName: string;
  newBalance: string;
  startDate: string;
  rules: RuleDraft;
}

const STEPS: readonly ChallengeStep[] = ['step-1', 'step-2', 'funded'];
const LEGEND: Record<ChallengeStep, string> = {
  'step-1': 'Step 1',
  'step-2': 'Step 2',
  funded: 'Funded',
};
const UNITS = [
  { value: 'amount', label: '$' },
  { value: 'percent', label: '%' },
] as const;
const DRAWDOWN_TYPES: readonly DrawdownType[] = [
  'static',
  'eod-trailing',
  'trailing',
];

/** How many of the same challenge one save can make (C64). */
const MAX_QUANTITY = 20;

const blankPhase = (): PhaseDraft => ({
  link: 'none',
  newName: '',
  newBalance: '',
  startDate: '',
  rules: emptyRules(),
});

const cents = (text: string): Cents | null => {
  const n = Number(text.replace(/,/g, ''));
  return text.trim() !== '' && Number.isFinite(n) && n >= 0 ? toCents(n) : null;
};

/** A fee in cents for the form: the stored one in dollars, or blank. */
const feeText = (c: Cents | undefined): string =>
  c === undefined ? '' : String(c / 100).replace(/\.0+$/, '');

function initialPhases(
  challenge: Challenge | undefined,
  accounts: readonly Account[],
): Record<ChallengeStep, PhaseDraft> {
  const out = {
    'step-1': blankPhase(),
    'step-2': blankPhase(),
    funded: blankPhase(),
  };
  for (const p of challenge?.phases ?? []) {
    const account = accounts.find((a) => a.id === p.accountId);
    out[p.step] = {
      ...blankPhase(),
      link: account ? account.id : 'none',
      startDate: p.startDate ?? '',
      rules: account?.propRules
        ? draftFromRules(account.propRules)
        : emptyRules(),
    };
  }
  return out;
}

/** A labelled text field with its error line. */
function Field({
  id,
  label,
  error,
  help,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  help?: ReactNode;
  children: (props: {
    id: string;
    'aria-invalid'?: true;
    'aria-describedby'?: string;
  }) => ReactNode;
}): React.JSX.Element {
  const describedBy = [error ? `${id}-err` : null, help ? `${id}-help` : null]
    .filter(Boolean)
    .join(' ');
  return (
    <div>
      <label htmlFor={id} className={LABEL}>
        {label}
      </label>
      {children({
        id,
        ...(error && { 'aria-invalid': true as const }),
        ...(describedBy && { 'aria-describedby': describedBy }),
      })}
      {error ? <FieldError id={`${id}-err`}>{error}</FieldError> : null}
      {help ? (
        <p id={`${id}-help`} className={HELP}>
          {help}
        </p>
      ) : null}
    </div>
  );
}

/** An amount with its unit, dollars or a percentage of the starting balance. */
function LimitField({
  id,
  label,
  value,
  unit,
  start,
  error,
  onChange,
  onUnit,
}: {
  id: string;
  label: string;
  value: string;
  unit: Unit;
  start: Cents | null;
  error?: string;
  onChange(v: string): void;
  onUnit(u: Unit): void;
}): React.JSX.Element {
  const display = useDisplay();
  const n = Number(value.replace(/,/g, ''));
  const known =
    unit === 'percent' && start !== null && Number.isFinite(n) && n > 0;
  return (
    <Field
      id={id}
      label={label}
      error={error}
      help={
        known ? (
          <>
            {`${n}% of ${display.cash(start, false).text} is `}
            {display.cash(Math.round((start * n) / 100), false).text}
          </>
        ) : undefined
      }
    >
      {(p) => (
        <div className="flex items-center gap-2">
          <input
            {...p}
            inputMode="decimal"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className={INPUT}
          />
          <Segmented<Unit>
            label={`${label} unit`}
            value={unit}
            options={UNITS}
            coarseTargets
            onChange={onUnit}
          />
        </div>
      )}
    </Field>
  );
}

function PhaseFields({
  step,
  idp,
  draft,
  accounts,
  taken,
  elsewhere,
  errors,
  onChange,
  onCopy,
}: {
  step: ChallengeStep;
  idp: string;
  draft: PhaseDraft;
  accounts: readonly Account[];
  /** Account ids linked in the other phases. */
  taken: ReadonlySet<string>;
  /** Account id to the name of the other challenge that links it. */
  elsewhere: ReadonlyMap<string, string>;
  errors: Record<string, string>;
  onChange(next: PhaseDraft): void;
  /** Step 2 only. */
  onCopy?: () => void;
}): React.JSX.Element {
  const funded = step === 'funded';
  const linked = accounts.find((a) => a.id === draft.link);
  const start: Cents | null =
    draft.link === 'new'
      ? cents(draft.newBalance)
      : (linked?.startingBalance ?? null);
  const hasAccount = draft.link !== 'none';
  const id = (name: string) => `${idp}-${step}-${name}`;
  const e = (name: string) => errors[id(name)];
  const setRules = (patch: Partial<RuleDraft>) =>
    onChange({ ...draft, rules: { ...draft.rules, ...patch } });

  return (
    <fieldset className="grid gap-3.5 rounded-control border border-line bg-sunken/50 p-3.5">
      <legend className="px-1.5 text-[13.5px] font-semibold">
        {LEGEND[step]}
      </legend>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id={id('account')} label="Account" error={e('account')}>
          {(p) => (
            <SelectField
              {...p}
              value={draft.link}
              onChange={(ev) => {
                const link = ev.target.value;
                const next = accounts.find((a) => a.id === link);
                onChange({
                  ...draft,
                  link,
                  rules: next?.propRules
                    ? draftFromRules(next.propRules)
                    : draft.rules,
                });
              }}
            >
              <option value="none">None</option>
              <option value="new">Create a new account</option>
              {accounts
                .filter((a) => !taken.has(a.id))
                .map((a) => (
                  <option
                    key={a.id}
                    value={a.id}
                    disabled={elsewhere.has(a.id)}
                  >
                    {a.name}
                    {a.status === 'archived' ? ' (archived)' : ''}
                    {elsewhere.has(a.id) ? ` (in ${elsewhere.get(a.id)})` : ''}
                  </option>
                ))}
            </SelectField>
          )}
        </Field>
        <Field id={id('start')} label="Start date">
          {(p) => (
            <input
              {...p}
              type="date"
              value={draft.startDate}
              onChange={(ev) =>
                onChange({ ...draft, startDate: ev.target.value })
              }
              className={INPUT}
            />
          )}
        </Field>
      </div>
      {draft.link === 'new' ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            id={id('new-name')}
            label="New account name"
            error={e('new-name')}
          >
            {(p) => (
              <input
                {...p}
                value={draft.newName}
                onChange={(ev) =>
                  onChange({ ...draft, newName: ev.target.value })
                }
                className={INPUT}
              />
            )}
          </Field>
          <Field
            id={id('new-balance')}
            label="Starting balance"
            error={e('new-balance')}
          >
            {(p) => (
              <input
                {...p}
                inputMode="decimal"
                value={draft.newBalance}
                onChange={(ev) =>
                  onChange({ ...draft, newBalance: ev.target.value })
                }
                className={INPUT}
              />
            )}
          </Field>
        </div>
      ) : null}

      {onCopy ? (
        <div>
          <Button variant="secondary" size="sm" onClick={onCopy}>
            Same rules as step 1
          </Button>
        </div>
      ) : null}

      {!hasAccount ? (
        <p className="text-[12.5px] text-muted">
          Link or create an account to set this phase&apos;s rules.
        </p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            {funded ? null : (
              <LimitField
                id={id('target')}
                label="Profit target"
                value={draft.rules.target}
                unit={draft.rules.targetUnit}
                start={start}
                error={e('target')}
                onChange={(target) => setRules({ target })}
                onUnit={(targetUnit) => setRules({ targetUnit })}
              />
            )}
            <LimitField
              id={id('daily')}
              label="Daily loss limit"
              value={draft.rules.dailyLoss}
              unit={draft.rules.dailyLossUnit}
              start={start}
              error={e('daily')}
              onChange={(dailyLoss) => setRules({ dailyLoss })}
              onUnit={(dailyLossUnit) => setRules({ dailyLossUnit })}
            />
            <LimitField
              id={id('drawdown')}
              label="Max drawdown"
              value={draft.rules.maxDrawdown}
              unit={draft.rules.maxDrawdownUnit}
              start={start}
              error={e('drawdown')}
              onChange={(maxDrawdown) => setRules({ maxDrawdown })}
              onUnit={(maxDrawdownUnit) => setRules({ maxDrawdownUnit })}
            />
            <Field id={id('type')} label="Drawdown type">
              {(p) => (
                <SelectField
                  {...p}
                  value={draft.rules.drawdownType}
                  onChange={(ev) =>
                    setRules({
                      drawdownType: ev.target.value as DrawdownType,
                    })
                  }
                >
                  {DRAWDOWN_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {drawdownLabel(t)}
                    </option>
                  ))}
                </SelectField>
              )}
            </Field>
            {draft.rules.drawdownType === 'static' ? null : (
              <>
                <Field id={id('floor-mode')} label="Drawdown floor">
                  {(p) => (
                    <SelectField
                      {...p}
                      value={draft.rules.floorMode}
                      onChange={(ev) =>
                        setRules({
                          floorMode: ev.target.value as 'start' | 'fixed',
                        })
                      }
                    >
                      <option value="start">The starting balance</option>
                      <option value="fixed">A fixed level</option>
                    </SelectField>
                  )}
                </Field>
                {draft.rules.floorMode === 'fixed' ? (
                  <Field
                    id={id('floor')}
                    label="Floor balance"
                    error={e('floor')}
                  >
                    {(p) => (
                      <input
                        {...p}
                        inputMode="decimal"
                        value={draft.rules.floor}
                        onChange={(ev) => setRules({ floor: ev.target.value })}
                        className={INPUT}
                      />
                    )}
                  </Field>
                ) : null}
              </>
            )}
            <Field
              id={id('min-days')}
              label="Minimum trading days"
              error={e('min-days')}
            >
              {(p) => (
                <input
                  {...p}
                  inputMode="numeric"
                  value={draft.rules.minDays}
                  onChange={(ev) => setRules({ minDays: ev.target.value })}
                  className={INPUT}
                />
              )}
            </Field>
            {funded ? null : (
              <Field id={id('period')} label="Period">
                {(p) => (
                  <SelectField
                    {...p}
                    value={draft.rules.period}
                    onChange={(ev) =>
                      setRules({ period: ev.target.value as 'none' | 'days' })
                    }
                  >
                    <option value="none">No time limit</option>
                    <option value="days">A number of days</option>
                  </SelectField>
                )}
              </Field>
            )}
            {!funded && draft.rules.period === 'days' ? (
              <Field
                id={id('period-days')}
                label="Period in days"
                error={e('period-days')}
              >
                {(p) => (
                  <input
                    {...p}
                    inputMode="numeric"
                    value={draft.rules.periodDays}
                    onChange={(ev) => setRules({ periodDays: ev.target.value })}
                    className={INPUT}
                  />
                )}
              </Field>
            ) : null}
            <Field
              id={id('consistency')}
              label="Best-day consistency (%)"
              error={e('consistency')}
              help="The best day's share of the profit, at most. Blank for no rule."
            >
              {(p) => (
                <input
                  {...p}
                  inputMode="decimal"
                  value={draft.rules.consistency}
                  onChange={(ev) => setRules({ consistency: ev.target.value })}
                  className={INPUT}
                />
              )}
            </Field>
          </div>
        </>
      )}
    </fieldset>
  );
}

const FIELD_OF: Record<keyof RuleErrors, string> = {
  target: 'target',
  dailyLoss: 'daily',
  maxDrawdown: 'drawdown',
  floor: 'floor',
  minDays: 'min-days',
  periodDays: 'period-days',
  consistency: 'consistency',
};

/** A challenge's form, in a dialog: a new one, or `challenge` to edit. */
export function ChallengeForm({
  challenge,
  onClose,
}: {
  challenge?: Challenge;
  onClose(): void;
}): React.JSX.Element {
  const ids = useId();
  const accounts = useAccounts().data ?? [];
  const challenges = useChallenges().data ?? [];
  const prefs = usePrefs().data;
  const createChallenge = useCreateChallenge();
  const updateChallenge = useUpdateChallenge();
  const removeChallenge = useRemoveChallenge();
  const createAccount = useCreateAccount();
  const updateAccount = useUpdateAccount();
  const [name, setName] = useState(challenge?.name ?? '');
  const [firm, setFirm] = useState(challenge?.firm ?? '');
  const [steps, setSteps] = useState<'1' | '2'>(
    challenge ? (String(challenge.steps) as '1' | '2') : '1',
  );
  const [phase, setPhase] = useState<Challenge['phase']>(
    challenge?.phase ?? 'evaluation',
  );
  // A breach is final: the form never offers it, and a breached challenge has
  // no status or phase to change.
  const breached = challenge?.status === 'breached';
  const [status, setStatus] = useState<'active' | 'passed'>(
    challenge?.status === 'passed' ? 'passed' : 'active',
  );
  const [strategyIds, setStrategyIds] = useState<string[]>(
    challenge?.strategyIds ?? [],
  );
  const [broker, setBroker] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [evalFee, setEvalFee] = useState(feeText(challenge?.evaluationFee));
  const [actFee, setActFee] = useState(feeText(challenge?.activationFee));
  const [draft, setDraft] = useState(() => initialPhases(challenge, accounts));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failed, setFailed] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [busy, setBusy] = useState(false);
  // What a save has made so far, so a retry after a failure part way links it
  // instead of making it twice: each created account by quantity index and
  // step, and each challenge written.
  const made = useRef({
    accounts: new Map<string, string>(),
    challenges: new Set<number>(),
  });
  const strategies = (useStrategies().data ?? []).filter(
    (st) => st.status === 'active' || strategyIds.includes(st.id),
  );

  const shown: ChallengeStep[] =
    steps === '1' ? ['step-1', 'funded'] : [...STEPS];
  const id = (n: string) => `${ids}-${n}`;
  // The broker fills the accounts this form creates. Quantity makes the same
  // challenge again, each with its own new accounts, so it is offered only on
  // a new challenge whose phases make new accounts and link no existing one.
  const makesAccounts = shown.some((st) => draft[st].link === 'new');
  const quantityShown =
    !challenge &&
    makesAccounts &&
    shown.every((st) => draft[st].link === 'new' || draft[st].link === 'none');

  async function save() {
    const next: [string, string][] = []; // in the order the fields sit
    if (!name.trim()) next.push([id('name'), 'Give the challenge a name.']);
    if (!firm.trim()) next.push([id('firm'), 'Name the firm.']);
    const count = quantityShown ? Number(quantity.trim()) : 1;
    if (
      quantityShown &&
      !(/^\d+$/.test(quantity.trim()) && count >= 1 && count <= MAX_QUANTITY)
    )
      next.push([
        id('quantity'),
        `Enter a whole number from 1 to ${MAX_QUANTITY}.`,
      ]);
    const feeError = (text: string, field: string) => {
      if (text.trim() !== '' && cents(text) === null)
        next.push([id(field), 'Enter an amount of zero or more.']);
    };
    feeError(evalFee, 'eval-fee');
    feeError(actFee, 'act-fee');

    const built = new Map<
      ChallengeStep,
      { start: Cents; rules: ReturnType<typeof rulesFromDraft> }
    >();
    for (const step of shown) {
      const d = draft[step];
      const pid = (n: string) => `${ids}-${step}-${n}`;
      if (d.link === 'none') continue;
      let start: Cents;
      if (d.link === 'new') {
        if (!d.newName.trim())
          next.push([pid('new-name'), 'Give the account a name.']);
        const balance = cents(d.newBalance);
        if (balance === null || balance <= 0)
          next.push([pid('new-balance'), 'Enter a balance above zero.']);
        start = balance ?? 0;
      } else {
        start =
          accounts.find((a) => a.id === d.link)?.startingBalance ??
          cents(d.newBalance) ??
          0;
      }
      const result = rulesFromDraft(d.rules, {
        phase: step === 'funded' ? 'funded' : 'evaluation',
        firm: firm.trim(),
        start,
      });
      if ('errors' in result)
        for (const [key, message] of Object.entries(result.errors))
          next.push([pid(FIELD_OF[key as keyof RuleErrors]), message]);
      built.set(step, { start, rules: result });
    }
    setErrors(Object.fromEntries(next));
    setFailed(false);
    if (next.length > 0) {
      // The first in page order: fields sit in the order they were checked,
      // except the name and firm which come first in the form already.
      focusField(next[0]![0]);
      return;
    }

    setBusy(true);
    try {
      for (let i = 0; i < count; i++) {
        if (made.current.challenges.has(i)) continue;
        // The first keeps the names typed; the rest are "name 2", "name 3".
        const suffix = i === 0 ? '' : ` ${i + 1}`;
        const phases: Challenge['phases'] = [];
        for (const step of shown) {
          const d = draft[step];
          const entry = {
            step,
            ...(d.startDate && { startDate: d.startDate }),
          };
          const b = built.get(step);
          if (!b || !('rules' in b.rules)) {
            phases.push(entry);
            continue;
          }
          if (d.link === 'new') {
            const key = `${i}:${step}`;
            let accountId = made.current.accounts.get(key);
            if (accountId === undefined) {
              const created = await createAccount.mutateAsync({
                name: `${d.newName.trim()}${suffix}`,
                broker: broker.trim() || firm.trim(),
                type: step === 'funded' ? 'prop-funded' : 'prop-evaluation',
                currency: prefs?.baseCurrency ?? 'USD',
                startingBalance: b.start,
                status: 'active',
                propRules: b.rules.rules,
              });
              accountId = created.id;
              made.current.accounts.set(key, accountId);
            }
            phases.push({ ...entry, accountId });
          } else {
            await updateAccount.mutateAsync({
              id: d.link,
              patch: { propRules: b.rules.rules },
            });
            phases.push({ ...entry, accountId: d.link });
          }
        }
        const fields = {
          name: `${name.trim()}${suffix}`,
          firm: firm.trim(),
          steps: Number(steps) as 1 | 2,
          phases,
          evaluationFee: cents(evalFee) ?? undefined,
          activationFee: cents(actFee) ?? undefined,
          strategyIds,
        };
        if (!challenge)
          await createChallenge.mutateAsync({ ...fields, phase, status });
        else if (breached)
          // A breach locks its phase and status: only the rest is saved, and
          // the reason it was given stays.
          await updateChallenge.mutateAsync({
            id: challenge.id,
            patch: fields,
          });
        else
          await updateChallenge.mutateAsync({
            id: challenge.id,
            patch: { ...fields, phase, status, failureReason: undefined },
          });
        made.current.challenges.add(i);
      }
      onClose();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  // Accounts another challenge of the workspace already links: they can't be linked twice.
  const elsewhere = new Map<string, string>();
  for (const other of challenges)
    if (other.id !== challenge?.id)
      for (const p of other.phases)
        if (p.accountId) elsewhere.set(p.accountId, other.name);

  const taken = (step: ChallengeStep) =>
    new Set(
      shown
        .filter((s) => s !== step)
        .map((s) => draft[s].link)
        .filter((l) => l !== 'none' && l !== 'new'),
    );

  return (
    <>
      <SettingsDialog
        open
        wide
        onClose={onClose}
        title={challenge ? 'Edit challenge' : 'New challenge'}
        description="A challenge is one or two evaluation steps, then the funded phase. Each phase has its own account and rules."
      >
        <form
          noValidate
          onSubmit={(ev) => {
            ev.preventDefault();
            void save();
          }}
          className="grid gap-4"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              id={id('name')}
              label="Challenge name"
              error={errors[id('name')]}
            >
              {(p) => (
                <input
                  {...p}
                  value={name}
                  autoFocus
                  onChange={(ev) => setName(ev.target.value)}
                  className={INPUT}
                />
              )}
            </Field>
            <Field id={id('firm')} label="Firm" error={errors[id('firm')]}>
              {(p) => (
                <input
                  {...p}
                  value={firm}
                  onChange={(ev) => setFirm(ev.target.value)}
                  className={INPUT}
                />
              )}
            </Field>
          </div>
          {makesAccounts ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                id={id('broker')}
                label="Broker"
                help="Fills the broker of each account this form creates. Blank uses the firm."
              >
                {(p) => (
                  <input
                    {...p}
                    value={broker}
                    onChange={(ev) => setBroker(ev.target.value)}
                    className={INPUT}
                  />
                )}
              </Field>
              {quantityShown ? (
                <Field
                  id={id('quantity')}
                  label="Quantity"
                  error={errors[id('quantity')]}
                  help={`Makes this many of the same challenge, named "${name.trim() || 'name'}", "${name.trim() || 'name'} 2" and so on, each with its own new accounts. 1 to ${MAX_QUANTITY}.`}
                >
                  {(p) => (
                    <input
                      {...p}
                      inputMode="numeric"
                      value={quantity}
                      onChange={(ev) => setQuantity(ev.target.value)}
                      className={INPUT}
                    />
                  )}
                </Field>
              ) : null}
            </div>
          ) : null}
          <fieldset>
            <legend className={LABEL}>Strategies</legend>
            {strategies.length === 0 ? (
              <p className="text-[12.5px] text-muted">
                No strategies yet. Create one in Strategies, then attach it
                here.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {strategies.map((st) => (
                  <label
                    key={st.id}
                    className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-control border border-line px-3 text-[13px] font-medium transition-colors duration-200 has-[:checked]:border-accent/45 has-[:checked]:bg-accent-soft/60 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent pointer-coarse:min-h-11"
                  >
                    <input
                      type="checkbox"
                      checked={strategyIds.includes(st.id)}
                      onChange={(ev) =>
                        setStrategyIds((all) =>
                          ev.target.checked
                            ? [...all, st.id]
                            : all.filter((x) => x !== st.id),
                        )
                      }
                      className="peer sr-only"
                    />
                    <Check
                      size={14}
                      weight="bold"
                      aria-hidden="true"
                      className="hidden text-accent-ink peer-checked:block"
                    />
                    {st.name}
                  </label>
                ))}
              </div>
            )}
          </fieldset>
          <div className="flex flex-wrap gap-x-6 gap-y-3">
            <div>
              <span className={LABEL}>Steps</span>
              <Segmented<'1' | '2'>
                label="Steps"
                value={steps}
                coarseTargets
                onChange={setSteps}
                options={[
                  { value: '1', label: '1 step' },
                  { value: '2', label: '2 steps' },
                ]}
              />
            </div>
            {breached ? null : (
              <>
                <div>
                  <span className={LABEL}>Phase</span>
                  <Segmented<Challenge['phase']>
                    label="Phase"
                    value={phase}
                    coarseTargets
                    onChange={setPhase}
                    options={[
                      { value: 'evaluation', label: 'Evaluation' },
                      { value: 'funded', label: 'Funded' },
                    ]}
                  />
                </div>
                <div>
                  <span className={LABEL}>Status</span>
                  <Segmented<'active' | 'passed'>
                    label="Status"
                    value={status}
                    coarseTargets
                    onChange={setStatus}
                    options={[
                      { value: 'active', label: 'Active' },
                      { value: 'passed', label: 'Passed' },
                    ]}
                  />
                </div>
              </>
            )}
          </div>
          {breached ? (
            <p className="flex items-start gap-2.5 rounded-[10px] bg-sunken px-3 py-2.5 text-[13px] leading-[1.5] text-muted">
              <Info size={16} aria-hidden="true" className="mt-px flex-none" />
              <span>
                A breach is final. This challenge stays in Breached, so its
                phase and status can&apos;t change.
              </span>
            </p>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              id={id('eval-fee')}
              label="Evaluation fee"
              error={errors[id('eval-fee')]}
            >
              {(p) => (
                <input
                  {...p}
                  inputMode="decimal"
                  value={evalFee}
                  onChange={(ev) => setEvalFee(ev.target.value)}
                  className={INPUT}
                />
              )}
            </Field>
            <Field
              id={id('act-fee')}
              label="Activation fee"
              error={errors[id('act-fee')]}
            >
              {(p) => (
                <input
                  {...p}
                  inputMode="decimal"
                  value={actFee}
                  onChange={(ev) => setActFee(ev.target.value)}
                  className={INPUT}
                />
              )}
            </Field>
          </div>

          {shown.map((step) => (
            <PhaseFields
              key={step}
              step={step}
              idp={ids}
              draft={draft[step]}
              accounts={accounts}
              taken={taken(step)}
              elsewhere={elsewhere}
              errors={errors}
              onChange={(next) => setDraft((d) => ({ ...d, [step]: next }))}
              onCopy={
                step === 'step-2'
                  ? () =>
                      setDraft((d) => ({
                        ...d,
                        'step-2': {
                          ...d['step-2'],
                          rules: { ...d['step-1'].rules },
                        },
                      }))
                  : undefined
              }
            />
          ))}

          <div aria-live="polite">
            {failed ? (
              <p className="text-[12.5px] font-medium text-loss">
                Couldn&apos;t save that. Try again.
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {challenge ? (
              <Button
                variant="ghost"
                onClick={() => setDeleting(true)}
                disabled={busy}
                className="text-loss!"
              >
                Delete challenge
              </Button>
            ) : null}
            <span className="ml-auto flex gap-2">
              <Button variant="secondary" onClick={onClose} disabled={busy}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy}>
                {challenge ? 'Save challenge' : 'Create challenge'}
              </Button>
            </span>
          </div>
        </form>
      </SettingsDialog>
      <ConfirmDialog
        open={deleting}
        title={`Delete ${challenge?.name ?? 'this challenge'}?`}
        body="Its accounts and their trades stay. Only the challenge, its status and its fees are removed."
        confirmLabel="Delete"
        danger
        onConfirm={async () => {
          if (challenge) await removeChallenge.mutateAsync(challenge.id);
          onClose();
        }}
        onClose={() => setDeleting(false)}
      />
    </>
  );
}
