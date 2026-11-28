'use client';

import { Check } from '@phosphor-icons/react/dist/ssr';
import { useMemo, useState } from 'react';
import { MorphDialog } from '@/components/ui/morph-dialog';
import { useAccounts, useApplyRule, useTrades } from '@/data/query/hooks';
import { ArchivedAccountError } from '@/data/repository';
import { withFeeRule } from '@/domain/rules/fee-rules';
import { ruleMatches, targetRulePatch } from '@/domain/rules/target-rules';
import type { FeeRule, TargetRule } from '@/domain/types';
import { useDisplay } from '@/lib/display';
import { formatCount, plural } from '@/lib/format';
import { FigureText } from '@/components/product/figure-text';
import {
  kindWord,
  listWords,
  RuleFooter,
  SideWords,
  feeHow,
  type FocusRef,
} from './rule-fields';

/** The rule being applied, with the kind that says which engine reads it. */
export type AppliedRule =
  { kind: 'target'; rule: TargetRule } | { kind: 'fee'; rule: FeeRule };

interface Counts {
  /** Trades the rule covers: its account, instrument and symbols. */
  matched: number;
  /** Of those, how many change with the box unticked, and ticked. */
  plain: number;
  over: number;
  /**
   * Of those, the trades a fee rule leaves alone, ticked or not: they settle
   * in another currency than the account's (a moved trade keeps its own, B6),
   * and the rule's amounts are in the account's (B201).
   */
  otherCurrency: number;
}

/**
 * Fill in logged trades (spec §5.3, B16, B57): what the rule does, the count
 * of trades it covers, the override box, and how many will change, read with
 * the same functions the write uses so the count is what the result will be.
 * A fee rule also says how many trades it leaves alone for their currency.
 * Ends in the toast line of its card, through `onDone`.
 */
export function ApplyRuleDialog({
  open,
  onOpenChange,
  origin,
  returnFocus,
  applying,
  onDone,
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
  origin: FocusRef;
  returnFocus: FocusRef;
  /** Kept by the card while the dialog closes, so its words hold. */
  applying: AppliedRule | null;
  /** The result line: the words with the count of trades changed. */
  onDone(message: string): void;
}): React.JSX.Element | null {
  const trades = useTrades().data;
  const accounts = useAccounts().data;
  const apply = useApplyRule();
  const display = useDisplay();
  const [override, setOverride] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  // Once Apply is pressed the numbers stay as they were: the write refreshes the trades under them.
  const [submitted, setSubmitted] = useState(false);
  const [held, setHeld] = useState<Counts | null>(null);
  const [was, setWas] = useState(false);
  if (open !== was) {
    setWas(open);
    if (open) {
      setOverride(false);
      setFailed(null);
      setSubmitted(false);
      setHeld(null);
    }
  }

  const rule = applying?.rule;
  const account = accounts?.find((a) => a.id === rule?.accountId);
  const live = useMemo((): Counts | null => {
    if (!open || !applying || !trades || !account) return null;
    const matched = trades.filter((t) => ruleMatches(applying.rule, t));
    const changes = (over: boolean) =>
      matched.filter((t) =>
        applying.kind === 'target'
          ? targetRulePatch(t, applying.rule, over) !== undefined
          : withFeeRule(t, applying.rule, {
              override: over,
              accountCurrency: account.currency,
            }) !== undefined,
      ).length;
    return {
      matched: matched.length,
      plain: changes(false),
      over: changes(true),
      otherCurrency:
        applying.kind === 'fee'
          ? matched.filter((t) => t.pnlCurrency !== account.currency).length
          : 0,
    };
  }, [open, applying, trades, account]);
  if (open && !submitted && live && live !== held) setHeld(live);

  if (!applying || !rule) return null;
  const counts = held;
  const archived = account?.status === 'archived';
  const will = counts ? (override ? counts.over : counts.plain) : null;
  const targets = applying.kind === 'target';
  const noun = (n: number) => `${formatCount(n)} ${plural(n, 'trade')}`;
  const currency = account?.currency ?? 'USD';
  const where =
    rule.symbols.length > 0
      ? `in ${account?.name ?? 'its account'} on ${listWords(rule.symbols)}`
      : `in ${account?.name ?? 'its account'}`;

  const confirm = async () => {
    if (will === null || will === 0 || archived) return;
    setSubmitted(true);
    setFailed(null);
    try {
      const changed = await apply.mutateAsync({
        kind: applying.kind,
        id: rule.id,
        override,
      });
      onOpenChange(false);
      onDone(
        changed === 0
          ? 'No trades changed.'
          : `Changed ${noun(changed)}. Each change is logged in Logs.`,
      );
    } catch (e) {
      setSubmitted(false);
      setFailed(
        e instanceof ArchivedAccountError
          ? 'An archived account is read-only, so nothing was changed.'
          : "Couldn't apply the rule. Nothing was changed. Try again.",
      );
    }
  };

  return (
    <MorphDialog
      open={open}
      onOpenChange={onOpenChange}
      origin={origin}
      returnFocus={returnFocus}
      size="compact"
      title="Fill in logged trades with this rule?"
      footer={
        <RuleFooter
          onCancel={() => onOpenChange(false)}
          label={
            apply.isPending
              ? 'Filling in...'
              : will && !archived
                ? `Fill in ${noun(will)}`
                : 'Fill in trades'
          }
          disabled={!will || archived}
          busy={apply.isPending}
          onConfirm={() => void confirm()}
        />
      }
    >
      <div className="pt-1">
        <p className="text-[13.5px] leading-[1.5] text-pretty text-muted">
          {applying.kind === 'target' ? (
            <>
              {applying.rule.target ? (
                <SideWords
                  role="target"
                  side={applying.rule.target}
                  currency={currency}
                  display={display}
                  form="plain"
                />
              ) : null}
              {applying.rule.target && applying.rule.stop ? ', ' : ''}
              {applying.rule.stop ? (
                <SideWords
                  role="stop"
                  side={applying.rule.stop}
                  currency={currency}
                  display={display}
                  form="plain"
                  lowerCase={applying.rule.target !== undefined}
                />
              ) : null}
              .
            </>
          ) : (
            <>
              <FigureText
                f={display.cash(applying.rule.commission, false, currency)}
              />{' '}
              commission and{' '}
              <FigureText
                f={display.cash(applying.rule.fee, false, currency)}
              />{' '}
              fee, {feeHow(applying.rule).toLowerCase()}.
            </>
          )}{' '}
          {counts
            ? `It matches ${
                rule.symbols.length > 0
                  ? noun(counts.matched)
                  : `${formatCount(counts.matched)} ${kindWord(rule.assetClass)} ${plural(counts.matched, 'trade')}`
              } ${where}, manual trades included.`
            : 'Counting the trades it matches...'}
        </p>
        <label className="mt-3.5 flex cursor-pointer items-start gap-2.5 rounded-[10px] border border-line px-3 py-3 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent">
          <span className="relative mt-px flex-none">
            <input
              type="checkbox"
              checked={override}
              onChange={(e) => setOverride(e.currentTarget.checked)}
              className="peer absolute inset-0 size-full cursor-pointer opacity-0"
            />
            <span
              aria-hidden="true"
              className={`grid size-4 place-items-center rounded-[5px] border text-accent-fg shadow-[var(--shadow-chip)] transition-colors duration-200 ease-(--ease-glide) motion-reduce:transition-none ${override ? 'border-accent bg-accent' : 'border-line-2 bg-surface-1'}`}
            >
              {override ? <Check size={11} weight="bold" /> : null}
            </span>
          </span>
          <span>
            <b className="block text-[13.5px] font-semibold">
              {targets
                ? 'Replace targets and stops already set'
                : 'Replace commissions and fees already set'}
            </b>
            <small className="mt-0.5 block text-[12.5px] leading-[1.45] text-muted">
              {targets
                ? 'Left unticked, only trades with no targets or stops get them.'
                : 'Left unticked, only trades with no costs on any execution get them.'}
            </small>
          </span>
        </label>
        <p aria-live="polite" className="mt-3.5 text-[14px]">
          {archived ? (
            <span className="text-muted">
              {account?.name} is archived, so its trades cannot change.
            </span>
          ) : will === null ? (
            <span className="text-muted">
              Counting the trades it changes...
            </span>
          ) : will === 0 ? (
            <span className="text-muted">No trade will change.</span>
          ) : (
            <>
              <b className="font-semibold">{noun(will)}</b> will change. Each
              change is logged in Logs.
            </>
          )}
          {!archived && counts && counts.otherCurrency > 0 ? (
            <span className="mt-1 block text-[13px] text-muted">
              {noun(counts.otherCurrency)} settled in another currency{' '}
              {counts.otherCurrency === 1 ? 'is' : 'are'} left as{' '}
              {counts.otherCurrency === 1 ? 'it is' : 'they are'}.
            </span>
          ) : null}
        </p>
        {failed ? (
          <p role="alert" className="mt-3 text-[13px] font-medium text-loss">
            {failed}
          </p>
        ) : null}
      </div>
    </MorphDialog>
  );
}
