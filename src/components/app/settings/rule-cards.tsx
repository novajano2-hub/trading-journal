'use client';

import { Info, Plus, X } from '@phosphor-icons/react/dist/ssr';
import { useRef, useState, type ReactNode } from 'react';
import { ConfirmDialog } from '@/components/app/confirm-dialog';
import { CARD, Caption, CardHeader } from '@/components/app/dashboard/shared';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { ScrollFade } from '@/components/ui/scroll-fade';
import {
  useAccounts,
  useFeeRules,
  usePrefs,
  useRemoveFeeRule,
  useRemoveTargetRule,
  useTargetRules,
} from '@/data/query/hooks';
import type { Account, FeeRule, TargetRule } from '@/domain/types';
import { useDisplay, type Display } from '@/lib/display';
import { formatCount, plural } from '@/lib/format';
import { usePhone } from '@/lib/use-phone';
import { ApplyRuleDialog, type AppliedRule } from './apply-rule-dialog';
import { FeeRuleDialog } from './fee-rule-dialog';
import {
  CostWords,
  feeHow,
  instrumentLabel,
  listWords,
  SideWords,
} from './rule-fields';
import { RowMenu, TD as TD_BASE, TH, type MenuAction } from './settings-ui';
import { TargetRuleDialog } from './target-rule-dialog';

const TD = `${TD_BASE} h-auto py-2.5`;

/** What a card needs to say about one rule, in both of its layouts. */
interface RuleLines {
  /** The table's summary cell: the first line and the one under it. */
  first: ReactNode;
  second?: ReactNode;
  /** A phone's two lines under the account, where the words are shorter. */
  phoneFirst: ReactNode;
  phoneSecond?: ReactNode;
}

interface Row<R> {
  rule: R;
  account: Account | undefined;
}

/** One kind of rule as a card: its table (two-line rows on a phone), Add rule, and a result line. */
function RuleCard<R extends TargetRule | FeeRule>({
  headingId,
  title,
  addFor,
  column,
  empty,
  status,
  rules,
  accounts,
  phone,
  lines,
  menuKind,
  actions,
  onAdd,
  result,
  onDismiss,
}: {
  headingId: string;
  title: string;
  /** The words an Add rule button carries for a screen reader: "for targets and stops". */
  addFor: string;
  column: string;
  empty: string;
  status: 'pending' | 'error' | 'success';
  rules: readonly R[] | undefined;
  accounts: readonly Account[] | undefined;
  phone: boolean;
  lines(row: Row<R>): RuleLines;
  menuKind: string;
  actions(rule: R, account: Account | undefined): MenuAction[];
  onAdd(from: HTMLElement): void;
  result: string | undefined;
  onDismiss(): void;
}): React.JSX.Element {
  const rows: Row<R>[] | undefined =
    rules && accounts
      ? rules.map((rule) => ({
          rule,
          account: accounts.find((a) => a.id === rule.accountId),
        }))
      : undefined;
  const nameOf = (r: Row<R>) => r.account?.name ?? 'Unknown account';
  const symbolsOf = (r: R) =>
    r.symbols.length > 0 ? listWords(r.symbols) : 'all symbols';
  const menu = (r: Row<R>) => (
    <RowMenu
      label={`Actions for ${nameOf(r)}, ${instrumentLabel(r.rule.assetClass)}, ${symbolsOf(r.rule)}, ${menuKind}`}
      actions={actions(r.rule, r.account)}
    />
  );

  return (
    <section
      aria-labelledby={headingId}
      className={`${CARD} overflow-hidden pt-[18px] pb-2`}
    >
      <CardHeader
        className="px-5"
        headingId={headingId}
        title={title}
        after={
          rows && rows.length > 0 ? (
            <Caption>
              {formatCount(rows.length)} {plural(rows.length, 'rule')}
            </Caption>
          ) : null
        }
        end={
          <Button
            variant="secondary"
            size="sm"
            onClick={(e) => onAdd(e.currentTarget)}
          >
            <Plus size={15} weight="bold" aria-hidden="true" />
            Add rule<span className="sr-only"> for {addFor}</span>
          </Button>
        }
      />

      {result ? (
        <div
          role="status"
          aria-label="Result"
          className="mx-5 mt-3 flex items-start gap-3 rounded-control border border-line bg-surface-1 py-2.5 pr-2 pl-4 text-[13.5px] text-text shadow-[var(--shadow-chip)]"
        >
          <p className="min-w-0 flex-1 pt-0.5 text-pretty">{result}</p>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={onDismiss}
            className="grid size-7 flex-none place-items-center rounded-chip text-muted hover:bg-sunken focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:size-11"
          >
            <X size={14} aria-hidden="true" />
          </button>
        </div>
      ) : null}

      {status === 'error' ? (
        <p role="alert" className="px-5 pt-3 pb-3 text-[13.5px] text-muted">
          Keel couldn&apos;t read your rules. Reload the page to try again.
        </p>
      ) : !rows ? (
        <p role="status" className="px-5 pt-3 pb-3 text-[13.5px] text-muted">
          Loading your rules...
        </p>
      ) : rows.length === 0 ? (
        <p className="px-5 pt-3 pb-3 text-[13.5px] text-muted">{empty}</p>
      ) : phone ? (
        <ul aria-labelledby={headingId} className="mt-1.5 px-5">
          {rows.map((r) => {
            const l = lines(r);
            return (
              <li
                key={r.rule.id}
                className="flex items-center gap-3 border-t border-line py-2.5"
              >
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <span
                    data-line="1"
                    className="flex min-w-0 items-baseline gap-2 text-[14px]"
                  >
                    <b className="flex-none font-semibold text-text">
                      {nameOf(r)}
                    </b>
                    <span className="min-w-0 text-[12.5px] text-muted">
                      {instrumentLabel(r.rule.assetClass)},{' '}
                      {r.rule.symbols.length > 0
                        ? listWords(r.rule.symbols)
                        : 'all symbols'}
                    </span>
                  </span>
                  <span
                    data-line="2"
                    className="flex flex-wrap gap-x-3 gap-y-0.5 text-[12.5px] text-muted"
                  >
                    <span>{l.phoneFirst}</span>
                    {l.phoneSecond ? <span>{l.phoneSecond}</span> : null}
                  </span>
                </div>
                {menu(r)}
              </li>
            );
          })}
        </ul>
      ) : (
        <ScrollFade className="mt-2">
          <table
            aria-labelledby={headingId}
            className="w-full min-w-[640px] table-fixed border-collapse text-[13.5px]"
          >
            <colgroup>
              <col className="w-[22%]" />
              <col className="w-[14%]" />
              <col className="w-[18%]" />
              <col />
              <col className="w-[68px]" />
            </colgroup>
            <thead>
              <tr>
                <th scope="col" className={TH}>
                  Account
                </th>
                <th scope="col" className={TH}>
                  Instrument
                </th>
                <th scope="col" className={TH}>
                  Symbols
                </th>
                <th scope="col" className={TH}>
                  {column}
                </th>
                <th scope="col" className={`${TH} text-right`}>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const l = lines(r);
                return (
                  <tr key={r.rule.id}>
                    <td className={`${TD} font-semibold text-text`}>
                      <span className="line-clamp-2">{nameOf(r)}</span>
                    </td>
                    <td className={TD}>{instrumentLabel(r.rule.assetClass)}</td>
                    <td className={TD}>
                      {r.rule.symbols.length > 0 ? (
                        <span className="flex flex-wrap gap-1">
                          {r.rule.symbols.map((s) => (
                            <Chip key={s}>{s}</Chip>
                          ))}
                        </span>
                      ) : (
                        <span className="text-muted">All symbols</span>
                      )}
                    </td>
                    <td className={TD}>
                      <span className="block leading-5">{l.first}</span>
                      {l.second ? (
                        <span className="mt-px block text-[12.5px] leading-4 text-faint">
                          {l.second}
                        </span>
                      ) : null}
                    </td>
                    <td className={`${TD} text-right`}>{menu(r)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </ScrollFade>
      )}
    </section>
  );
}

const targetLines = (
  { rule, account }: Row<TargetRule>,
  display: Display,
): RuleLines => {
  const currency = account?.currency ?? 'USD';
  const side = (role: 'target' | 'stop', form: 'full' | 'compact') => {
    const s = role === 'target' ? rule.target : rule.stop;
    return s ? (
      <SideWords
        role={role}
        side={s}
        currency={currency}
        display={display}
        form={form}
      />
    ) : null;
  };
  // Targets first; a rule with only a stop has that as its first line.
  const full = [side('target', 'full'), side('stop', 'full')].filter(Boolean);
  const short = [side('target', 'compact'), side('stop', 'compact')].filter(
    Boolean,
  );
  return {
    first: full[0],
    second: full[1],
    phoneFirst: short[0],
    phoneSecond: short[1],
  };
};

const feeLines = (
  { rule, account }: Row<FeeRule>,
  display: Display,
): RuleLines => {
  const words = (
    <CostWords
      rule={rule}
      currency={account?.currency ?? 'USD'}
      display={display}
    />
  );
  return {
    first: words,
    second: feeHow(rule),
    phoneFirst: words,
    phoneSecond: feeHow(rule),
  };
};

/**
 * Settings > Trading's default rules (spec §5.3): the note that both kinds
 * fill in trades as they are imported, then a card for each kind. Every rule
 * has a menu: Apply to existing trades, Edit, Delete.
 */
export function RuleCards(): React.JSX.Element | null {
  // Money is shown through Display, so nothing is drawn until the preferences are read: Privacy must never flash a figure.
  return usePrefs().data ? <RuleCardsBody /> : null;
}

function RuleCardsBody(): React.JSX.Element {
  const targets = useTargetRules();
  const fees = useFeeRules();
  const accounts = useAccounts().data;
  const removeTarget = useRemoveTargetRule();
  const removeFee = useRemoveFeeRule();
  const display = useDisplay();
  const phone = usePhone();

  // What each dialog shows is kept while it closes, so its words hold.
  const [targetForm, setTargetForm] = useState<{
    open: boolean;
    rule?: TargetRule;
  }>({ open: false });
  const [feeForm, setFeeForm] = useState<{ open: boolean; rule?: FeeRule }>({
    open: false,
  });
  const [applying, setApplying] = useState<AppliedRule | null>(null);
  const [applyOpen, setApplyOpen] = useState(false);
  const [deleting, setDeleting] = useState<AppliedRule | null>(null);
  const [results, setResults] = useState<{ target?: string; fee?: string }>({});
  // The button a dialog grew from, and where focus goes back.
  const from = useRef<HTMLElement | null>(null);

  const openApply = (el: HTMLElement | null, rule: AppliedRule) => {
    from.current = el;
    setApplying(rule);
    setApplyOpen(true);
  };

  return (
    <>
      <p className="flex items-start gap-2 px-0.5 pt-0.5 text-[13px] leading-[1.5] text-muted">
        <Info
          size={16}
          aria-hidden="true"
          className="mt-px flex-none text-muted"
        />
        <span>
          Both kinds of rule below fill in trades as you import them. Trades
          already in Keel, and trades you add by hand, change only when you use
          Apply to existing trades on a rule.
        </span>
      </p>

      <RuleCard<TargetRule>
        headingId="target-rules-heading"
        title="Targets and stops"
        addFor="targets and stops"
        column="Levels"
        empty="No rules yet. A rule fills targets and stops on matching trades as you import them."
        status={targets.status}
        rules={targets.data}
        accounts={accounts}
        phone={phone}
        lines={(row) => targetLines(row, display)}
        menuKind="targets and stops"
        actions={(rule) => [
          {
            label: 'Apply to existing trades',
            onSelect: (el) => openApply(el, { kind: 'target', rule }),
          },
          {
            label: 'Edit',
            onSelect: (el) => {
              from.current = el;
              setTargetForm({ open: true, rule });
            },
          },
          {
            label: 'Delete',
            danger: true,
            onSelect: () => setDeleting({ kind: 'target', rule }),
          },
        ]}
        onAdd={(el) => {
          from.current = el;
          setTargetForm({ open: true });
        }}
        result={results.target}
        onDismiss={() => setResults((r) => ({ ...r, target: undefined }))}
      />

      <RuleCard<FeeRule>
        headingId="fee-rules-heading"
        title="Commissions and fees"
        addFor="commissions and fees"
        column="Costs"
        empty="No rules yet. A rule fills commissions and fees on matching executions as you import them."
        status={fees.status}
        rules={fees.data}
        accounts={accounts}
        phone={phone}
        lines={(row) => feeLines(row, display)}
        menuKind="commissions and fees"
        actions={(rule) => [
          {
            label: 'Apply to existing trades',
            onSelect: (el) => openApply(el, { kind: 'fee', rule }),
          },
          {
            label: 'Edit',
            onSelect: (el) => {
              from.current = el;
              setFeeForm({ open: true, rule });
            },
          },
          {
            label: 'Delete',
            danger: true,
            onSelect: () => setDeleting({ kind: 'fee', rule }),
          },
        ]}
        onAdd={(el) => {
          from.current = el;
          setFeeForm({ open: true });
        }}
        result={results.fee}
        onDismiss={() => setResults((r) => ({ ...r, fee: undefined }))}
      />

      <TargetRuleDialog
        open={targetForm.open}
        onOpenChange={(open) => setTargetForm((f) => ({ ...f, open }))}
        origin={from}
        returnFocus={from}
        rule={targetForm.rule}
      />
      <FeeRuleDialog
        open={feeForm.open}
        onOpenChange={(open) => setFeeForm((f) => ({ ...f, open }))}
        origin={from}
        returnFocus={from}
        rule={feeForm.rule}
      />
      <ApplyRuleDialog
        open={applyOpen}
        onOpenChange={setApplyOpen}
        origin={from}
        returnFocus={from}
        applying={applying}
        onDone={(message) =>
          setResults((r) => ({
            ...r,
            [applying?.kind ?? 'target']: message,
          }))
        }
      />
      <ConfirmDialog
        open={deleting !== null}
        title="Delete this rule?"
        body={
          deleting?.kind === 'fee'
            ? 'Trades the rule has already filled keep the commissions and fees it gave them. It stops filling trades as you import them.'
            : 'Trades the rule has already filled keep the targets and stops it gave them. It stops filling trades as you import them.'
        }
        confirmLabel="Delete rule"
        danger
        onConfirm={async () => {
          if (!deleting) return;
          if (deleting.kind === 'fee')
            await removeFee.mutateAsync(deleting.rule.id);
          else await removeTarget.mutateAsync(deleting.rule.id);
        }}
        onClose={() => setDeleting(null)}
      />
    </>
  );
}
