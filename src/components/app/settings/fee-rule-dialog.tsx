'use client';

import { useId, useMemo, useState } from 'react';
import { MorphDialog } from '@/components/ui/morph-dialog';
import { Segmented } from '@/components/ui/segmented';
import {
  useAccounts,
  usePrefs,
  useSaveFeeRule,
  useTrades,
} from '@/data/query/hooks';
import { toCents } from '@/domain/money';
import { feeRuleError } from '@/domain/rules/fee-rules';
import { ruleAssetOf, type RuleAsset } from '@/domain/rules/target-rules';
import type { FeeRule } from '@/domain/types';
import { useDisplay } from '@/lib/display';
import { FieldError, focusField } from './settings-ui';
import {
  currencySymbol,
  Field,
  FIELD_BOX,
  FIELD_HINT,
  FieldSelect,
  INSTRUMENTS,
  RuleFooter,
  SymbolsInput,
  Switch,
  type FocusRef,
} from './rule-fields';
import { parseNumber } from '../trades/levels-block';

/** "1.29" for a field: whole cents as dollars, two places. */
const amountText = (cents: number): string => (cents / 100).toFixed(2);

/** The cents a typed amount comes to, or null when it is not an amount of zero or more. */
function centsOf(text: string): number | null {
  const n = parseNumber(text);
  return n === null || n < 0 ? null : toCents(n);
}

/** The comp's "Charge" and "On" choices run the full width, each option an equal share. */
const FULL = 'w-full [&>label]:flex-1 [&>label]:justify-center';

/**
 * A new commission and fee rule, or (with `rule`) one being edited (spec
 * §5.3). It opens with TradeZella's defaults: All symbols on, per execution,
 * on every execution, 0.00 and 0.00.
 */
export function FeeRuleDialog({
  open,
  onOpenChange,
  origin,
  returnFocus,
  rule,
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
  origin: FocusRef;
  returnFocus: FocusRef;
  /** Absent: a new rule. */
  rule?: FeeRule;
}): React.JSX.Element {
  const ids = useId();
  const accounts = useAccounts().data;
  const trades = useTrades().data;
  const baseCurrency = usePrefs().data?.baseCurrency ?? 'USD';
  const display = useDisplay();
  const save = useSaveFeeRule();

  const [accountId, setAccountId] = useState('');
  const [asset, setAsset] = useState<RuleAsset | ''>('');
  const [all, setAll] = useState(true);
  const [symbols, setSymbols] = useState<string[]>([]);
  const [mode, setMode] = useState<FeeRule['mode']>('per-execution');
  const [applyOn, setApplyOn] = useState<FeeRule['applyOn']>('all');
  const [commission, setCommission] = useState('0.00');
  const [fee, setFee] = useState('0.00');
  const [attempted, setAttempted] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [was, setWas] = useState(false);
  if (open !== was) {
    setWas(open);
    if (open) {
      setAccountId(rule?.accountId ?? '');
      setAsset(rule?.assetClass ?? '');
      setAll(rule ? rule.symbols.length === 0 : true);
      setSymbols(rule?.symbols ?? []);
      setMode(rule?.mode ?? 'per-execution');
      setApplyOn(rule?.applyOn ?? 'all');
      setCommission(amountText(rule?.commission ?? 0));
      setFee(amountText(rule?.fee ?? 0));
      setAttempted(false);
      setFailed(null);
    }
  }

  const choices = (accounts ?? [])
    .filter((a) => a.status === 'active' || a.id === rule?.accountId)
    .sort((a, b) => a.name.localeCompare(b.name));
  const account = (accounts ?? []).find((a) => a.id === accountId);
  const currency = account?.currency ?? baseCurrency;
  const masked = display.unit === 'privacy';

  const suggestions = useMemo(() => {
    if (!open || all || !trades || accountId === '' || asset === '') return [];
    return [
      ...new Set(
        trades
          .filter(
            (t) =>
              t.accountId === accountId && ruleAssetOf(t.instrument) === asset,
          )
          .map((t) => t.instrument.root.toUpperCase()),
      ),
    ].sort();
  }, [open, all, trades, accountId, asset]);

  const ready = accountId !== '' && asset !== '' && (all || symbols.length > 0);
  // Under Privacy the amounts are hidden and can't be typed, so a new rule
  // would save amounts nobody chose: Create waits, and the hint says why.
  const hiddenNew = masked && !rule;
  const hintId = `${ids}-privacy`;
  const waiting =
    accountId === '' && asset === ''
      ? 'Choose an account and an instrument.'
      : accountId === ''
        ? 'Choose an account.'
        : asset === ''
          ? 'Choose an instrument.'
          : !all && symbols.length === 0
            ? 'Name a symbol, or turn All symbols on.'
            : null;
  const reasonId = waiting ? `${ids}-waiting` : hiddenNew ? hintId : undefined;
  const errors = {
    commission: centsOf(commission) === null,
    fee: centsOf(fee) === null,
  };

  const submit = async () => {
    if (!ready || hiddenNew) return;
    setAttempted(true);
    setFailed(null);
    const c = centsOf(commission);
    const f = centsOf(fee);
    if (c === null || f === null) {
      focusField(c === null ? `${ids}-commission` : `${ids}-fee`);
      return;
    }
    const input = {
      accountId,
      assetClass: asset,
      symbols: all ? [] : symbols,
      mode,
      applyOn,
      commission: c,
      fee: f,
    };
    const problem = feeRuleError(input);
    if (problem) {
      setFailed(problem);
      return;
    }
    try {
      await save.mutateAsync({ ...(rule ? { id: rule.id } : {}), rule: input });
      onOpenChange(false);
    } catch {
      setFailed("Couldn't save the rule. Try again.");
    }
  };

  /** A money field: the currency's sign, the amount; hidden and not edited under Privacy. */
  const money = (
    id: string,
    label: string,
    text: string,
    set: (v: string) => void,
    bad: boolean,
  ) => {
    const cents = centsOf(text);
    return (
      <Field label={label} id={id}>
        <div className={FIELD_BOX}>
          {masked ? null : (
            <span aria-hidden="true" className="text-faint">
              {currencySymbol(currency)}
            </span>
          )}
          <input
            id={id}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            aria-invalid={attempted && bad ? true : undefined}
            aria-describedby={
              [masked ? hintId : '', attempted && bad ? `${id}-error` : '']
                .filter(Boolean)
                .join(' ') || undefined
            }
            readOnly={masked}
            title={masked ? 'Hidden by Privacy' : undefined}
            value={
              masked ? display.cash(cents ?? 0, false, currency).text : text
            }
            onChange={(e) => set(e.target.value)}
            className="h-full min-w-0 flex-1 bg-transparent tabular-nums outline-none! read-only:text-muted"
          />
        </div>
        {attempted && bad ? (
          <FieldError id={`${id}-error`}>
            Enter an amount of zero or more.
          </FieldError>
        ) : null}
      </Field>
    );
  };

  return (
    <MorphDialog
      open={open}
      onOpenChange={onOpenChange}
      origin={origin}
      returnFocus={returnFocus}
      size="medium"
      title={
        rule ? 'Edit commission and fee rule' : 'New commission and fee rule'
      }
      description="Fills costs on matching executions as they are imported."
      footer={
        <RuleFooter
          onCancel={() => onOpenChange(false)}
          label={rule ? 'Save rule' : 'Create'}
          disabled={!ready || hiddenNew}
          busy={save.isPending}
          formId={`${ids}-form`}
          reasonId={reasonId}
        />
      }
    >
      <form
        id={`${ids}-form`}
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div className="grid grid-cols-2 gap-x-4 gap-y-3.5 max-sm:grid-cols-1">
          <Field label="Account">
            <FieldSelect
              label="Account"
              value={accountId}
              placeholder="Choose an account"
              empty={accounts ? 'No active account' : undefined}
              options={choices.map((a) => ({ value: a.id, label: a.name }))}
              onChange={setAccountId}
            />
          </Field>
          <Field label="Instrument">
            <FieldSelect
              label="Instrument"
              value={asset}
              placeholder="Choose an instrument"
              options={INSTRUMENTS}
              onChange={(v) => setAsset(v as RuleAsset)}
            />
          </Field>
          <div className="col-span-full flex min-h-10 items-center gap-3">
            <span className="flex-1 text-[13.5px] font-medium text-text">
              All symbols
            </span>
            <Switch checked={all} onChange={setAll} label="All symbols" />
          </div>
          {all ? null : (
            <Field
              label="Symbols"
              id={`${ids}-symbols`}
              className="col-span-full"
            >
              <SymbolsInput
                id={`${ids}-symbols`}
                symbols={symbols}
                onChange={setSymbols}
                suggestions={suggestions}
              />
              <p className={FIELD_HINT}>
                Name each symbol the rule covers. Turn All symbols on to cover
                every one.
              </p>
            </Field>
          )}
          <Field label="Charge" className="col-span-full">
            <Segmented<FeeRule['mode']>
              label="Charge"
              className={FULL}
              coarseTargets
              value={mode}
              onChange={setMode}
              options={[
                { value: 'per-contract', label: 'Per contract' },
                { value: 'per-execution', label: 'Per execution' },
              ]}
            />
          </Field>
          <Field label="On" className="col-span-full">
            <Segmented<FeeRule['applyOn']>
              label="On"
              className={FULL}
              coarseTargets
              value={applyOn}
              onChange={setApplyOn}
              options={[
                { value: 'all', label: 'Every execution' },
                { value: 'entry', label: 'Entries' },
                { value: 'exit', label: 'Exits' },
              ]}
            />
          </Field>
          {money(
            `${ids}-commission`,
            'Commission',
            commission,
            setCommission,
            errors.commission,
          )}
          {money(`${ids}-fee`, 'Fee', fee, setFee, errors.fee)}
        </div>
        {masked ? (
          <p id={hintId} className={FIELD_HINT}>
            Amounts are hidden by Privacy. Turn it off to edit them.
          </p>
        ) : null}
        {waiting ? (
          <p id={`${ids}-waiting`} className={`${FIELD_HINT} mt-2.5`}>
            {waiting}
          </p>
        ) : null}
        <p className={`${FIELD_HINT} mt-2.5`}>
          {account
            ? `In the account's currency, ${account.currency}.`
            : "In the account's currency."}{' '}
          Per contract multiplies by each execution&apos;s quantity.
        </p>
        {failed ? (
          <p role="alert" className="mt-3 text-[13px] font-medium text-loss">
            {failed}
          </p>
        ) : null}
      </form>
    </MorphDialog>
  );
}
