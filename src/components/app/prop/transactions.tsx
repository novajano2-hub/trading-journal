'use client';

import {
  ArrowCounterClockwise,
  Check,
  LinkSimple,
  PencilSimple,
  Plus,
  Prohibit,
  Trash,
} from '@phosphor-icons/react/dist/ssr';
import { useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import { DropdownMenu } from 'radix-ui';
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import { CARD } from '@/components/app/dashboard/shared';
import { ConfirmDialog } from '@/components/app/confirm-dialog';
import { writeParam } from '@/components/app/reports/use-report-data';
import { SelectField } from '@/components/app/import/select-field';
import { LABEL } from '@/components/app/import/styles';
import {
  MENU,
  MENU_ITEM,
  RowMenu,
  SettingsDialog,
  type MenuAction,
} from '@/components/app/settings/settings-ui';
import { FigureText } from '@/components/product/figure-text';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { ScrollFade } from '@/components/ui/scroll-fade';
import { Segmented } from '@/components/ui/segmented';
import { metricContextOf } from '@/data/metrics';
import {
  useChallenges,
  usePrefs,
  usePropTxns,
  useRemovePropTxn,
  useUpdatePropTxn,
} from '@/data/query/hooks';
import { shortDate } from '@/domain/prop/challenge';
import {
  TXN_CATEGORIES,
  TXN_CATEGORY_LABELS,
  TXN_STATUS_LABELS,
  TXN_STATUSES,
  TXN_VIEWS,
  txnsInView,
  type TxnView,
} from '@/domain/prop/transactions';
import { localDate } from '@/domain/time';
import type {
  Challenge,
  PropTxn,
  PropTxnCategory,
  PropTxnStatus,
  Trade,
} from '@/domain/types';
import { FigureSourceContext, useDisplay } from '@/lib/display';
import { usePhone } from '@/lib/use-phone';
import { StrategyError, StrategySkeleton } from '../strategies/strategy-states';
import { dateLabel } from './challenge-card';
import { AddRow, AddSheet, useNewTxn } from './txn-add';

const NO_TRADES: ReadonlyMap<string, Trade> = new Map();

const TH =
  'h-[34px] border-b border-line pr-2.5 text-left text-[12px] font-medium whitespace-nowrap text-faint last:pr-0';
const TD =
  'h-12 overflow-hidden border-b border-line/70 pr-2.5 text-ellipsis whitespace-nowrap last:pr-0';

const EMPTY: Record<TxnView, string> = {
  all: 'No transactions yet.',
  income: 'No income yet.',
  costs: 'No costs yet.',
  review: 'Nothing to review.',
};

const STATUS_ACTION: Record<PropTxnStatus, { label: string; icon: ReactNode }> =
  {
    'not-reviewed': {
      label: 'Mark as not reviewed',
      icon: <ArrowCounterClockwise size={16} />,
    },
    reviewed: { label: 'Mark as reviewed', icon: <Check size={16} /> },
    ignored: { label: 'Mark as ignored', icon: <Prohibit size={16} /> },
  };

/** What a row is called on its buttons: its description, else its category and day. */
const nameOf = (t: PropTxn): string =>
  t.description ?? `${TXN_CATEGORY_LABELS[t.category]} on ${shortDate(t.date)}`;

/** The day as the comp shows it ("18 Nov"), with the year only for another year than this one. */
const dayOf = (date: string, today: string): string =>
  date.slice(0, 4) === today.slice(0, 4) ? shortDate(date) : dateLabel(date);

/** Not reviewed is the quiet accent, reviewed the kept green, ignored an outline: the row no longer counts. */
function StatusChip({ status }: { status: PropTxnStatus }): React.JSX.Element {
  return (
    <Chip
      tone={
        status === 'reviewed'
          ? 'gain'
          : status === 'not-reviewed'
            ? 'accent'
            : 'neutral'
      }
      className={`px-2.5 ${status === 'ignored' ? 'bg-transparent! text-faint! ring-1 ring-line-2 ring-inset' : ''}`}
    >
      {TXN_STATUS_LABELS[status]}
    </Chip>
  );
}

/** The edit control beside a category: a pencil that opens the six categories, the row's own chosen. */
function CategoryEdit({
  label,
  value,
  onChange,
}: {
  label: string;
  value: PropTxnCategory;
  onChange(next: PropTxnCategory): void;
}): React.JSX.Element {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        aria-label={label}
        className="relative inline-grid size-6 flex-none place-items-center rounded-[7px] text-faint outline-offset-1 before:absolute before:-inset-1 before:content-[''] hover:bg-sunken hover:text-text focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:before:-inset-2.5"
      >
        <PencilSimple size={14} aria-hidden="true" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="start" sideOffset={4} className={MENU}>
          <DropdownMenu.RadioGroup
            value={value}
            onValueChange={(next) => onChange(next as PropTxnCategory)}
          >
            {TXN_CATEGORIES.map((c) => (
              <DropdownMenu.RadioItem
                key={c}
                value={c}
                className={`${MENU_ITEM} gap-2.5`}
              >
                <span
                  aria-hidden="true"
                  className="inline-grid size-4 flex-none place-items-center text-accent-ink"
                >
                  <DropdownMenu.ItemIndicator>
                    <Check size={14} weight="bold" />
                  </DropdownMenu.ItemIndicator>
                </span>
                {TXN_CATEGORY_LABELS[c]}
              </DropdownMenu.RadioItem>
            ))}
          </DropdownMenu.RadioGroup>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

/** What each row reads of a transaction, as it is shown on a wide screen and on a phone. */
function useRowFigures(t: PropTxn, today: string) {
  const display = useDisplay();
  const f = display.cash(t.amount, true);
  const ignored = t.status === 'ignored';
  return {
    ignored,
    day: dayOf(t.date, today),
    // The sign is the amount's, whatever the category (C60); an ignored row is faint, it counts for nothing.
    amountTone: ignored
      ? 'text-faint'
      : t.amount < 0
        ? 'text-loss'
        : 'text-gain',
    amount: <FigureText f={f} />,
  };
}

interface RowProps {
  t: PropTxn;
  today: string;
  challengeName: string | undefined;
  menu: ReactNode;
  onCategory(next: PropTxnCategory): void;
}

const None = (): React.JSX.Element => <span className="text-faint">None</span>;

function TableRow({
  t,
  today,
  challengeName,
  menu,
  onCategory,
}: RowProps): React.JSX.Element {
  const f = useRowFigures(t, today);
  return (
    <tr data-txn={t.id} {...(f.ignored && { 'data-ignored': 'true' })}>
      <td className={`${TD} text-muted`}>{f.day}</td>
      <td className={TD} title={t.description}>
        {t.description ?? <None />}
      </td>
      <td className={`${TD} text-muted`} title={t.firm}>
        {t.firm || <None />}
      </td>
      <td className={TD} title={challengeName}>
        {challengeName ?? <None />}
      </td>
      <td className={TD}>
        <span className="inline-flex items-center gap-1">
          {TXN_CATEGORY_LABELS[t.category]}
          <CategoryEdit
            label={`Edit the category of ${nameOf(t)}`}
            value={t.category}
            onChange={onCategory}
          />
        </span>
      </td>
      <td
        className={`${TD} text-right font-semibold tabular-nums ${f.amountTone}`}
      >
        {f.amount}
      </td>
      <td className={TD}>
        <StatusChip status={t.status} />
      </td>
      <td className={`${TD} text-right`}>
        <span data-menu-of={t.id} className="inline-flex">
          {menu}
        </span>
      </td>
    </tr>
  );
}

function PhoneRow({ t, today, menu, onCategory }: RowProps): React.JSX.Element {
  const f = useRowFigures(t, today);
  return (
    <li
      data-txn={t.id}
      {...(f.ignored && { 'data-ignored': 'true' })}
      className="flex items-center gap-1 border-t border-line/70 first:border-t-0"
    >
      <div className="flex min-h-[60px] min-w-0 flex-1 flex-col justify-center gap-1 py-2">
        <span
          data-line="1"
          className="flex min-w-0 items-baseline justify-between gap-3 text-[14px]"
        >
          <span className="min-w-0 truncate">{t.description ?? <None />}</span>
          <span
            className={`flex-none font-semibold tabular-nums ${f.amountTone}`}
          >
            {f.amount}
          </span>
        </span>
        <span
          data-line="2"
          className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-muted"
        >
          <span>{f.day}</span>
          {t.firm ? <span>{t.firm}</span> : null}
          <span className="inline-flex items-center gap-0.5">
            {TXN_CATEGORY_LABELS[t.category]}
            <CategoryEdit
              label={`Edit the category of ${nameOf(t)}`}
              value={t.category}
              onChange={onCategory}
            />
          </span>
          <StatusChip status={t.status} />
        </span>
      </div>
      <span data-menu-of={t.id} className="flex-none">
        {menu}
      </span>
    </li>
  );
}

/** Link a row to a challenge, or to none. */
function LinkChallenge({
  row,
  challenges,
  returnFocus,
  onClose,
}: {
  row: PropTxn;
  challenges: readonly Challenge[];
  returnFocus: RefObject<HTMLElement | null>;
  onClose(): void;
}): React.JSX.Element {
  const id = useId();
  const update = useUpdatePropTxn();
  const [challengeId, setChallengeId] = useState(row.challengeId ?? '');
  const [failed, setFailed] = useState(false);

  async function save() {
    setFailed(false);
    const picked = challenges.find((c) => c.id === challengeId);
    try {
      await update.mutateAsync({
        id: row.id,
        patch: {
          // Undefined clears the link. A row with no firm takes the challenge's; one with a firm keeps it.
          challengeId: picked?.id,
          ...(picked && !row.firm.trim() && { firm: picked.firm }),
        },
      });
      onClose();
    } catch {
      setFailed(true);
    }
  }

  return (
    <SettingsDialog
      open
      onClose={onClose}
      title="Link a challenge"
      description={nameOf(row)}
      returnFocus={returnFocus}
    >
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <label htmlFor={`${id}-challenge`} className={LABEL}>
          Challenge
        </label>
        <SelectField
          id={`${id}-challenge`}
          value={challengeId}
          onChange={(e) => setChallengeId(e.target.value)}
        >
          <option value="">None</option>
          {[...challenges]
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
        </SelectField>
        {failed ? (
          <p role="alert" className="mt-3 text-[13px] font-medium text-loss">
            Couldn&apos;t save that. Try again.
          </p>
        ) : null}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={update.isPending}>
            Save
          </Button>
        </div>
      </form>
    </SettingsDialog>
  );
}

/**
 * The Transactions tab (comp 07, C68): every fee, payout and other prop firm
 * money movement, newest first, in a table (two-line rows on a phone). The
 * filter is All, Income, Costs or To review (by the sign and the status, no
 * counts, C73). Add transaction opens an inline row at the top (a sheet on a
 * phone); a row's category has an edit control, and its menu sets the status
 * (an ignored row stays listed, faint, and counts for nothing), links a
 * challenge or deletes it for good after asking. Money is the base currency,
 * signed, whatever the unit (C72); Privacy still masks it.
 */
export function Transactions(): React.JSX.Element {
  const queryClient = useQueryClient();
  const txns = usePropTxns();
  const challenges = useChallenges();
  const prefs = usePrefs();
  const update = useUpdatePropTxn();
  const remove = useRemovePropTxn();
  const phone = usePhone();
  const wantsAdd = useSearchParams().get('add') === '1';
  const [view, setView] = useState<TxnView>('all');
  const [adding, setAdding] = useState(false);
  const [linking, setLinking] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const addOrigin = useRef<HTMLElement | null>(null);
  const refocusAdd = useRef(false);
  // A dialog opened from a row's menu hands focus back to that row's menu
  // button; if the row has gone, to the filter.
  const lastRow = useRef<string | null>(null);
  const returnFocus = useMemo<RefObject<HTMLElement | null>>(
    () => ({
      get current() {
        return (
          document.querySelector<HTMLElement>(
            `[data-menu-of="${lastRow.current}"] button[aria-haspopup="menu"]`,
          ) ??
          document.querySelector<HTMLElement>(
            '[role="radiogroup"][aria-label="Show"] input:checked',
          )
        );
      },
    }),
    [],
  );

  const today = prefs.data
    ? localDate(new Date().toISOString(), prefs.data.timeZone)
    : '';
  const knownFirms = useMemo(
    () => (txns.data ?? []).map((t) => t.firm),
    [txns.data],
  );
  const ctx = useMemo(
    () => (prefs.data ? metricContextOf(prefs.data) : null),
    [prefs.data],
  );
  const draft = useNewTxn({
    today,
    challenges: challenges.data ?? [],
    knownFirms,
  });

  // Focus goes back to the button that opened the row, once the row is gone.
  useEffect(() => {
    if (adding || !refocusAdd.current) return;
    refocusAdd.current = false;
    addOrigin.current?.focus();
  }, [adding]);

  // The dashboard's Add transaction arrives with `?add=1`: the row opens once
  // the profile is known (the row's date is today), and the address is cleaned
  // so a reload or Back does not open it again.
  const [openedByAddress, setOpenedByAddress] = useState(false);
  if (wantsAdd && !openedByAddress && today !== '') {
    setOpenedByAddress(true);
    draft.reset();
    setAdding(true);
  }
  useEffect(() => {
    if (openedByAddress) writeParam('add', null);
  }, [openedByAddress]);

  const error = txns.error ?? challenges.error ?? prefs.error;
  if (error)
    return (
      <StrategyError
        error={error}
        title="Your transactions couldn't load."
        onRetry={() => void queryClient.resetQueries({ queryKey: ['keel'] })}
      />
    );
  if (!txns.data || !challenges.data || !prefs.data || !ctx)
    return <StrategySkeleton label="Loading your transactions" />;

  const names = new Map(challenges.data.map((c) => [c.id, c.name]));
  const shown = txnsInView(txns.data, view);
  const rowOf = (id: string | null) =>
    id === null ? undefined : txns.data.find((t) => t.id === id);
  const linkingRow = rowOf(linking);
  const deletingRow = rowOf(deleting);

  const patch = (
    t: PropTxn,
    change: { status: PropTxnStatus } | { category: PropTxnCategory },
    said: string,
  ) => {
    setProblem(null);
    update.mutate(
      { id: t.id, patch: change },
      {
        onSuccess: () => setNotice(said),
        onError: () => setProblem("Couldn't save that. Try again."),
      },
    );
  };
  const setCategory = (t: PropTxn, next: PropTxnCategory) =>
    next === t.category
      ? undefined
      : patch(
          t,
          { category: next },
          `${nameOf(t)}: ${TXN_CATEGORY_LABELS[next]}.`,
        );
  const actionsOf = (t: PropTxn): MenuAction[] => [
    ...TXN_STATUSES.filter((s) => s !== t.status).map((s) => ({
      label: STATUS_ACTION[s].label,
      icon: STATUS_ACTION[s].icon,
      onSelect: () =>
        patch(t, { status: s }, `${nameOf(t)}: ${TXN_STATUS_LABELS[s]}.`),
    })),
    {
      label: 'Link a challenge',
      icon: <LinkSimple size={16} />,
      onSelect: () => {
        lastRow.current = t.id;
        setLinking(t.id);
      },
    },
    {
      label: 'Delete',
      icon: <Trash size={16} />,
      separated: true,
      onSelect: () => {
        lastRow.current = t.id;
        setDeleting(t.id);
      },
    },
  ];
  const rowProps = (t: PropTxn): RowProps => ({
    t,
    today,
    challengeName: t.challengeId ? names.get(t.challengeId) : undefined,
    menu: <RowMenu label={`Actions for ${nameOf(t)}`} actions={actionsOf(t)} />,
    onCategory: (next) => setCategory(t, next),
  });

  const openAdd = (e: React.MouseEvent<HTMLElement>) => {
    addOrigin.current = e.currentTarget;
    if (adding && !phone) {
      setAdding(false);
      return;
    }
    draft.reset();
    setAdding(true);
  };
  const closeAdd = () => {
    refocusAdd.current = true;
    setAdding(false);
  };
  const added = (row: PropTxn) => {
    // The new row is shown, even where a filter would hide it.
    if (txnsInView([row], view).length === 0) setView('all');
    setNotice('Transaction added.');
    closeAdd();
  };

  const rowForm = adding && !phone;
  const showTable = !phone && (shown.length > 0 || rowForm);

  return (
    // Prop money is the base currency, signed, whatever the display menu says
    // (C72): no percent base, so only Privacy changes it.
    <FigureSourceContext.Provider
      value={{ tradesById: NO_TRADES, ctx, pctBase: null }}
    >
      <div className={`${CARD} px-5 pt-[18px] pb-4`}>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2.5">
          <Segmented<TxnView>
            label="Show"
            value={view}
            options={TXN_VIEWS}
            coarseTargets
            onChange={setView}
          />
          <Button
            size="sm"
            variant="secondary"
            className="ml-auto"
            aria-expanded={phone ? undefined : adding}
            onClick={openAdd}
          >
            <Plus size={14} weight="bold" aria-hidden="true" />
            Add transaction
          </Button>
        </div>

        {problem ? (
          <p role="alert" className="mt-3 text-[13px] font-medium text-loss">
            {problem}
          </p>
        ) : null}

        {showTable ? (
          <ScrollFade className="mt-3">
            <table
              aria-label="Transactions"
              className="w-full min-w-[960px] table-fixed border-collapse text-[13.5px]"
            >
              <colgroup>
                <col style={{ width: 128 }} />
                <col style={{ width: '21%' }} />
                <col style={{ width: '14%' }} />
                <col style={{ width: '14%' }} />
                <col style={{ width: '15%' }} />
                <col style={{ width: '12%' }} />
                <col style={{ width: '13%' }} />
                <col style={{ width: 52 }} />
              </colgroup>
              <thead>
                <tr>
                  <th scope="col" className={TH}>
                    Date
                  </th>
                  <th scope="col" className={TH}>
                    Description
                  </th>
                  <th scope="col" className={TH}>
                    Firm
                  </th>
                  <th scope="col" className={TH}>
                    Challenge
                  </th>
                  <th scope="col" className={TH}>
                    Category
                  </th>
                  <th scope="col" className={`${TH} text-right`}>
                    Amount
                  </th>
                  <th scope="col" className={TH}>
                    Status
                  </th>
                  <th scope="col" className={TH}>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rowForm ? (
                  <AddRow api={draft} onSaved={added} onCancel={closeAdd} />
                ) : null}
                {shown.map((t) => (
                  <TableRow key={t.id} {...rowProps(t)} />
                ))}
              </tbody>
            </table>
          </ScrollFade>
        ) : null}

        {phone && shown.length > 0 ? (
          <ul aria-label="Transactions" className="mt-2">
            {shown.map((t) => (
              <PhoneRow key={t.id} {...rowProps(t)} />
            ))}
          </ul>
        ) : null}

        {shown.length === 0 && !rowForm ? (
          <p className="px-1 pt-6 pb-4 text-center text-[14px] text-muted">
            {EMPTY[view]}
          </p>
        ) : null}

        <p className="mt-3 text-[12.5px] leading-[1.45] text-muted">
          A negative amount is a cost and a positive one is income, whatever its
          category. Ignored rows stay listed and never count.
        </p>
        <p role="status" className="sr-only">
          {notice}
        </p>
      </div>

      {adding && phone ? (
        <AddSheet
          api={draft}
          origin={addOrigin}
          returnFocus={addOrigin}
          onSaved={added}
          onClose={() => setAdding(false)}
        />
      ) : null}
      {linkingRow ? (
        <LinkChallenge
          key={linkingRow.id}
          row={linkingRow}
          challenges={challenges.data}
          returnFocus={returnFocus}
          onClose={() => setLinking(null)}
        />
      ) : null}
      <ConfirmDialog
        open={deletingRow !== undefined}
        title="Delete this transaction?"
        body={`${deletingRow ? nameOf(deletingRow) : 'This transaction'} will be removed for good. This can't be undone.`}
        confirmLabel="Delete"
        danger
        returnFocus={returnFocus}
        onConfirm={async () => {
          if (deletingRow) await remove.mutateAsync(deletingRow.id);
          setNotice('Transaction deleted.');
        }}
        onClose={() => setDeleting(null)}
      />
    </FigureSourceContext.Provider>
  );
}
