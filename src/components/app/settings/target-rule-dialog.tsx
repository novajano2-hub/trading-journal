'use client';

import { useId, useMemo, useRef, useState } from 'react';
import { MorphDialog } from '@/components/ui/morph-dialog';
import {
  useAccounts,
  usePrefs,
  useSaveTargetRule,
  useTrades,
} from '@/data/query/hooks';
import {
  ruleAssetOf,
  targetRuleError,
  unitsForRule,
  type RuleAsset,
} from '@/domain/rules/target-rules';
import type { TargetRule } from '@/domain/types';
import { useDisplay } from '@/lib/display';
import {
  blankSide,
  draftOf,
  Field,
  FIELD_HINT,
  FieldSelect,
  INSTRUMENTS,
  kindWord,
  readSide,
  RuleFooter,
  RuleLevelsBox,
  SymbolsInput,
  type DraftSide,
  type FocusRef,
  type RowError,
} from './rule-fields';

/**
 * A new target and stop rule, or (with `rule`) one being edited (spec §5.3).
 * It opens with TradeZella's defaults: nothing chosen, each side one level at
 * 100% and not set. The unit selects wait for the instrument; Create waits
 * for an account, an instrument and a level.
 */
export function TargetRuleDialog({
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
  rule?: TargetRule;
}): React.JSX.Element {
  const ids = useId();
  const form = useRef<HTMLFormElement>(null);
  const accounts = useAccounts().data;
  const trades = useTrades().data;
  const baseCurrency = usePrefs().data?.baseCurrency ?? 'USD';
  const display = useDisplay();
  const save = useSaveTargetRule();

  const [accountId, setAccountId] = useState('');
  const [asset, setAsset] = useState<RuleAsset | ''>('');
  const [symbols, setSymbols] = useState<string[]>([]);
  const [target, setTarget] = useState<DraftSide>(blankSide);
  const [stop, setStop] = useState<DraftSide>(blankSide);
  const [attempted, setAttempted] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  // Each opening starts from the rule, or from the defaults.
  const [was, setWas] = useState(false);
  if (open !== was) {
    setWas(open);
    if (open) {
      setAccountId(rule?.accountId ?? '');
      setAsset(rule?.assetClass ?? '');
      setSymbols(rule?.symbols ?? []);
      setTarget(draftOf(rule?.target));
      setStop(draftOf(rule?.stop));
      setAttempted(false);
      setFailed(null);
    }
  }

  const choices = (accounts ?? [])
    .filter((a) => a.status === 'active' || a.id === rule?.accountId)
    .sort((a, b) => a.name.localeCompare(b.name));
  const account = (accounts ?? []).find((a) => a.id === accountId);
  const currency = account?.currency ?? baseCurrency;

  // The symbols this account has traded in this kind of instrument, offered as the user types.
  const suggestions = useMemo(() => {
    if (!open || !trades || accountId === '' || asset === '') return [];
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
  }, [open, trades, accountId, asset]);

  const chooseAsset = (next: RuleAsset) => {
    const units = unitsForRule(next);
    const fit = (d: DraftSide): DraftSide =>
      units.includes(d.unit) ? d : { ...d, unit: 'price' };
    setAsset(next);
    setTarget(fit(target));
    setStop(fit(stop));
  };

  const read = { target: readSide(target), stop: readSide(stop) };
  const errors: Record<string, Record<number, RowError>> = {
    target: read.target.errors,
    stop: read.stop.errors,
  };
  const hasLevel = [target, stop].some((d) =>
    d.rows.some((r) => r.value.trim() !== ''),
  );
  const ready = accountId !== '' && asset !== '' && hasLevel;
  // While Create waits, a line says what for, and is its description.
  const waiting =
    accountId === '' && asset === ''
      ? 'Choose an account and an instrument.'
      : accountId === ''
        ? 'Choose an account.'
        : asset === ''
          ? 'Choose an instrument.'
          : !hasLevel
            ? 'Enter a target or a stop level.'
            : null;
  const reasonId = waiting ? `${ids}-waiting` : undefined;
  const masked = display.unit === 'privacy';

  const submit = async () => {
    if (!ready) return;
    const invalid = (['target', 'stop'] as const).flatMap((role) =>
      Object.entries(errors[role]!).map(([key, e]) => ({
        field: `${role}-${key}-${e.field}`,
      })),
    );
    setAttempted(true);
    setFailed(null);
    const first = invalid[0];
    if (first) {
      form.current
        ?.querySelector<HTMLElement>(`[data-field="${first.field}"]`)
        ?.focus();
      return;
    }
    const input = {
      accountId,
      assetClass: asset,
      symbols,
      ...(read.target.side ? { target: read.target.side } : {}),
      ...(read.stop.side ? { stop: read.stop.side } : {}),
    };
    const problem = targetRuleError(input);
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

  const hint =
    asset === ''
      ? 'Leave it empty to cover every symbol of the instrument in this account.'
      : `Leave it empty to cover every ${kindWord(asset)} symbol in this account.`;

  return (
    <MorphDialog
      open={open}
      onOpenChange={onOpenChange}
      origin={origin}
      returnFocus={returnFocus}
      size="medium"
      title={rule ? 'Edit target and stop rule' : 'New target and stop rule'}
      description="Fills targets and stops on matching trades as they are imported."
      footer={
        <RuleFooter
          onCancel={() => onOpenChange(false)}
          label={rule ? 'Save rule' : 'Create'}
          disabled={!ready}
          busy={save.isPending}
          formId={`${ids}-form`}
          reasonId={reasonId}
        />
      }
    >
      <form
        ref={form}
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
              onChange={(v) => chooseAsset(v as RuleAsset)}
            />
          </Field>
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
            <p className={FIELD_HINT}>{hint}</p>
          </Field>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 max-sm:grid-cols-1">
          <RuleLevelsBox
            role="target"
            draft={target}
            asset={asset}
            currency={currency}
            masked={masked}
            display={display}
            errors={attempted ? errors.target! : null}
            onChange={setTarget}
          />
          <RuleLevelsBox
            role="stop"
            draft={stop}
            asset={asset}
            currency={currency}
            masked={masked}
            display={display}
            errors={attempted ? errors.stop! : null}
            onChange={setStop}
          />
        </div>
        {waiting ? (
          <p id={`${ids}-waiting`} className={`${FIELD_HINT} mt-2.5`}>
            {waiting}
          </p>
        ) : null}
        <p className={`${FIELD_HINT} mt-2.5`}>
          A share becomes a quantity of each trade&apos;s largest position,
          rounded down. The last level takes what is left.
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
