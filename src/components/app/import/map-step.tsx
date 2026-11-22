'use client';

import {
  ArrowLeft,
  ArrowRight,
  Check,
  Columns,
  SlidersHorizontal,
  Warning,
} from '@phosphor-icons/react/dist/ssr';
import {
  useId,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import { CARD, CARD_PAD, CardHeader } from '@/components/app/dashboard/shared';
import { buttonClasses } from '@/components/ui/button-styles';
import { IconTile } from '@/components/ui/icon-tile';
import { Segmented } from '@/components/ui/segmented';
import { useImportContext, useUpdateUserAccount } from '@/data/query/hooks';
import { useImportPlan } from '@/data/query/derived';
import { missingFields, REQUIRED_FIELDS } from '@/domain/import/mapping';
import { parseDecimal } from '@/domain/import/numbers';
import { unknownRoots } from '@/domain/import/unknown-symbols';
import type { Account } from '@/domain/types';
import type { ImportFile } from '@/lib/decode';
import {
  columnLetter,
  FIELD_HINT,
  ISSUE_REASON,
  FIELD_LABEL,
  FIELD_ORDER,
  type FieldKey,
} from './fields';
import {
  timeColumn,
  withColumn,
  withKind,
  withOptions,
  type MapState,
} from './mapping-state';
import { NewAccountForm } from './new-account-form';
import { fileSummary } from './upload-step';
import { SelectField } from './select-field';
import { HELP, INPUT, LABEL } from './styles';
import { TimeZoneField } from './time-zone-field';

const ICON = { 'aria-hidden': true } as const;
const NEW_ACCOUNT = '__new';

const POINT_TICK = 0.01;

/** A point value the way a person writes it: 25,000. */
function showPoint(value: number): string {
  return value.toLocaleString('en-US', { maximumFractionDigits: 8 });
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;
}

/** Step 2: how to read the file, and which column holds what. */
export function MapStep({
  file,
  accounts,
  accountId,
  onAccount,
  state,
  onState,
  save,
  onSave,
  onBack,
  onContinue,
}: {
  file: ImportFile;
  /** The active accounts of My workspace. */
  accounts: readonly Account[];
  accountId: string | null;
  onAccount: (id: string) => void;
  state: MapState;
  onState: Dispatch<SetStateAction<MapState | null>>;
  save: boolean;
  onSave: (save: boolean) => void;
  onBack: () => void;
  onContinue: () => void;
}) {
  const ids = useId();
  const { parsed } = file;
  const { mapping } = state;
  const account = accounts.find((a) => a.id === accountId);
  const [creating, setCreating] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      Object.entries(mapping.overrides).map(([k, v]) => [
        k,
        showPoint(v.pointValue),
      ]),
    ),
  );
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const updateAccount = useUpdateUserAccount();

  const update = (fn: (s: MapState) => MapState) =>
    onState((s) => (s ? fn(s) : s));

  const missing = missingFields(mapping);
  const valid = missing.length === 0;
  const showCreate = creating || accounts.length === 0;

  const known = useImportContext(accountId ?? undefined).data?.overrides;
  const roots = useMemo(
    () => unknownRoots(parsed, mapping, known ?? {}),
    [parsed, mapping, known],
  );
  const unpriced = roots.filter((r) => mapping.overrides[r.key] === undefined);

  // The plan reads the file with these settings: here, only to say what it would skip.
  // No file or account yet: null, which stays pending without a spinner.
  const plan = useImportPlan(
    valid && accountId
      ? { parsed, mapping, accountId, fileName: file.name }
      : null,
  ).data;

  const headers = parsed.headers;
  const sample = (index: number | undefined): string[] =>
    index === undefined
      ? []
      : parsed.rows
          .map((r) => r.cells[index] ?? '')
          .filter((c) => c !== '')
          .slice(0, 3);
  // Three values when they are short; long ones (timestamps) show two, then one.
  const fit = (values: string[]): string[] => {
    const out: string[] = [];
    let width = 0;
    for (const v of values) {
      if (out.length > 0 && width + v.length > 40) break;
      out.push(v);
      width += v.length;
    }
    return out;
  };

  const dateColumn = timeColumn(mapping);
  const dateSample = sample(dateColumn)[0];
  const used = new Set(Object.values(mapping.columns));
  const unused = headers
    .map((h, i) => ({ h, i }))
    .filter(({ i }) => !used.has(i));

  const rows = FIELD_ORDER[mapping.kind] as readonly FieldKey[];
  const required = new Set<string>(REQUIRED_FIELDS[mapping.kind]);
  const columns = mapping.columns as Record<string, number | undefined>;
  const matchedCount = state.matched.filter(
    (f) => columns[f] !== undefined,
  ).length;

  function setPoint(key: string, text: string) {
    setDrafts((d) => ({ ...d, [key]: text }));
    const n = parseDecimal(text, '.');
    update((s) => {
      const overrides = { ...s.mapping.overrides };
      if (n !== null && n > 0)
        overrides[key] = { pointValue: n, tickSize: POINT_TICK };
      else delete overrides[key];
      return withOptions(s, { overrides });
    });
  }

  async function next() {
    setSaveError(false);
    if (save && account) {
      setSaving(true);
      try {
        await updateAccount.mutateAsync({
          id: account.id,
          patch: { importMapping: { ...mapping, headers: [...headers] } },
        });
      } catch {
        setSaving(false);
        setSaveError(true);
        return;
      }
      setSaving(false);
    }
    onContinue();
  }

  const issues = plan?.issues ?? [];
  const first = issues[0];

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[340px_minmax(0,1fr)]">
      <section
        className={`${CARD} ${CARD_PAD}`}
        aria-labelledby={`${ids}-read`}
      >
        <CardHeader
          icon={SlidersHorizontal}
          tone="accent"
          headingId={`${ids}-read`}
          title="How to read the file"
          className="mb-3.5"
        />
        <div className="grid gap-4">
          <div>
            <label htmlFor={`${ids}-account`} className={LABEL}>
              Account
            </label>
            <SelectField
              id={`${ids}-account`}
              value={showCreate ? NEW_ACCOUNT : (accountId ?? '')}
              onChange={(e) => {
                if (e.target.value === NEW_ACCOUNT) setCreating(true);
                else {
                  setCreating(false);
                  onAccount(e.target.value);
                }
              }}
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
              <option value={NEW_ACCOUNT}>New account</option>
            </SelectField>
            <p className={HELP}>
              Imports always land in My workspace, never in the sample.
            </p>
            {showCreate ? (
              <NewAccountForm
                onCreated={(a) => {
                  setCreating(false);
                  onAccount(a.id);
                }}
                onCancel={
                  accounts.length > 0 ? () => setCreating(false) : undefined
                }
              />
            ) : null}
          </div>

          <div>
            <span className={LABEL}>Each row is</span>
            <Segmented
              label="Each row is"
              className="w-full [&>label]:flex-1 [&>label]:justify-center"
              coarseTargets
              value={mapping.kind}
              onChange={(kind) => update((s) => withKind(s, parsed, kind))}
              options={[
                { value: 'fills', label: 'Fill' },
                { value: 'closed-trades', label: 'Closed trade' },
              ]}
            />
            <p className={HELP}>
              {mapping.kind === 'fills'
                ? 'One execution per row. Keel pairs them into trades.'
                : 'One round trip per row, with an entry and an exit.'}
            </p>
          </div>

          <TimeZoneField
            label="Times in the file are in"
            value={mapping.sourceTimeZone}
            onChange={(sourceTimeZone) =>
              update((s) => withOptions(s, { sourceTimeZone }))
            }
          />

          <div>
            <span className={LABEL}>Dates are written</span>
            <Segmented
              label="Date order"
              className="w-full [&>label]:flex-1 [&>label]:justify-center"
              coarseTargets
              value={mapping.dateOrder}
              onChange={(dateOrder) =>
                update((s) => withOptions(s, { dateOrder }))
              }
              options={[
                { value: 'mdy', label: 'Month first' },
                { value: 'dmy', label: 'Day first' },
                { value: 'ymd', label: 'Year first' },
              ]}
            />
            <p className={HELP}>
              {dateSample
                ? `Your file has ${dateSample}. A wrong order makes rows get skipped.`
                : 'A wrong order makes rows get skipped.'}
            </p>
          </div>

          <div>
            <span className={LABEL}>Decimal mark</span>
            <Segmented
              label="Decimal mark"
              className="w-full [&>label]:flex-1 [&>label]:justify-center"
              coarseTargets
              value={mapping.decimal}
              onChange={(decimal) => update((s) => withOptions(s, { decimal }))}
              options={[
                { value: '.', label: 'Point' },
                { value: ',', label: 'Comma' },
              ]}
            />
            <p className={HELP}>
              {mapping.decimal === '.'
                ? 'Prices read like 6,241.50.'
                : 'Prices read like 6.241,50.'}
            </p>
          </div>

          {account ? (
            <label className="flex min-h-9 cursor-pointer items-start gap-2.5 text-[13.5px] leading-snug text-text pointer-coarse:min-h-11">
              <input
                type="checkbox"
                checked={save}
                onChange={(e) => onSave(e.target.checked)}
                className="mt-0.5 size-4 shrink-0 accent-accent"
              />
              Save this mapping for {account.name}
            </label>
          ) : null}
        </div>
      </section>

      <section
        className={`${CARD} px-5 pt-[18px] pb-0`}
        aria-labelledby={`${ids}-match`}
      >
        <CardHeader
          icon={Columns}
          tone="accent"
          headingId={`${ids}-match`}
          title="Match your columns"
          after={
            <span className="text-[12.5px] text-faint">
              {state.usedSaved
                ? 'Filled in from your saved mapping.'
                : `Keel matched ${matchedCount} of ${rows.length} fields. Check them before you preview.`}
            </span>
          }
        />
        <p className="mt-1.5 text-[12px] text-faint">
          {file.name}: {fileSummary(file)}
        </p>
        {state.usedSaved && account ? (
          <p className="mt-3 flex items-center gap-2 rounded-control bg-accent-soft px-3 py-2 text-[13px] font-medium text-accent-ink">
            <Check {...ICON} size={15} weight="bold" className="shrink-0" />
            Using your saved mapping for {account.name}.
          </p>
        ) : null}

        <div className="mt-2 overflow-x-auto">
          <table className="w-full table-fixed border-collapse text-[13.5px]">
            <colgroup>
              <col className="w-[44%] md:w-[22%]" />
              <col className="w-[56%] md:w-[28%]" />
              <col className="hidden md:table-column" />
              <col className="w-[44px] md:w-[92px]" />
            </colgroup>
            <thead>
              <tr className="text-left text-[12.5px] font-medium text-faint">
                <th scope="col" className="h-9 pr-3 font-medium">
                  Keel field
                </th>
                <th scope="col" className="h-9 pr-3 font-medium">
                  Column in your file
                </th>
                <th
                  scope="col"
                  className="hidden h-9 pr-3 font-medium md:table-cell"
                >
                  First values
                </th>
                <th scope="col" className="h-9 text-right font-medium">
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((field) => {
                const label = FIELD_LABEL[field];
                const index = columns[field];
                const isRequired = required.has(field);
                const isMatched =
                  index !== undefined && state.matched.includes(field);
                const values = fit(sample(index));
                return (
                  <tr key={field} className="border-t border-line align-middle">
                    <th
                      scope="row"
                      className="py-2 pr-3 text-left align-middle font-normal"
                    >
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <b className="font-semibold text-text">{label}</b>
                        {isRequired ? (
                          <span className="rounded-[5px] bg-sunken px-1.5 text-[11.5px] font-medium text-muted">
                            Required
                          </span>
                        ) : null}
                      </span>
                      {FIELD_HINT[field] ? (
                        <span className="block text-[12px] leading-snug text-faint">
                          {FIELD_HINT[field]}
                        </span>
                      ) : null}
                      {values.length > 0 ? (
                        <span className="mt-0.5 block truncate font-mono text-[12px] text-faint md:hidden">
                          {values.slice(0, 2).join(', ')}
                        </span>
                      ) : null}
                    </th>
                    <td className="py-2 pr-3">
                      <SelectField
                        aria-label={`${label} column`}
                        value={index === undefined ? '' : String(index)}
                        onChange={(e) =>
                          update((s) =>
                            withColumn(
                              s,
                              parsed,
                              field,
                              e.target.value === ''
                                ? undefined
                                : Number(e.target.value),
                            ),
                          )
                        }
                        className={`h-8 text-[13px] ${index === undefined && !isRequired ? 'border-transparent bg-sunken text-faint shadow-none' : ''}`}
                      >
                        <option value="">
                          {isRequired ? 'Choose a column' : 'Do not import'}
                        </option>
                        {headers.map((h, i) => (
                          <option key={i} value={i}>
                            {columnLetter(i)}: {h || '(no name)'}
                          </option>
                        ))}
                      </SelectField>
                    </td>
                    <td className="hidden py-2 pr-3 md:table-cell">
                      <span className="flex min-w-0 flex-nowrap gap-1 overflow-hidden">
                        {values.map((v, i) => (
                          <span
                            key={i}
                            className="inline-flex h-[22px] max-w-full items-center rounded-[6px] bg-sunken px-[7px] font-mono text-[12px] font-medium text-muted"
                          >
                            <span className="truncate">{v}</span>
                          </span>
                        ))}
                      </span>
                    </td>
                    <td className="py-2 text-right">
                      <StatusCell
                        state={
                          index === undefined
                            ? isRequired
                              ? 'missing'
                              : 'skipped'
                            : isMatched
                              ? 'matched'
                              : 'mapped'
                        }
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {unused.length > 0 ? (
          <p className="mt-3 text-[12.5px] leading-snug text-faint">
            Columns Keel is not using:{' '}
            {unused.map(({ h, i }) => h || columnLetter(i)).join(', ')}.
          </p>
        ) : null}

        <div aria-live="polite">
          {first ? (
            <p className="mt-3 flex items-start gap-2.5 rounded-control bg-warn-soft px-3.5 py-3 text-[13px] leading-snug text-text">
              <Warning
                {...ICON}
                size={17}
                className="mt-px shrink-0 text-warn"
              />
              <span>
                <b className="font-semibold">
                  {plural(issues.length, 'row')} of{' '}
                  {plural(parsed.rows.length, 'row')} would be skipped
                </b>{' '}
                with these settings. The first is row {first.rowIndex}: the{' '}
                {FIELD_LABEL[first.field].toLowerCase()} &quot;{first.value}
                &quot; {ISSUE_REASON[first.code]}.
                {first.code === 'time-unparseable'
                  ? ' Check the date order and the time zone.'
                  : ''}
              </span>
            </p>
          ) : null}
        </div>

        {roots.map((root) => {
          const draft = drafts[root.key] ?? '';
          const bad =
            draft.trim() !== '' && mapping.overrides[root.key] === undefined;
          const inputId = `${ids}-pv-${root.key}`;
          return (
            <div
              key={root.key}
              role="group"
              aria-label={`Point value for ${root.key}`}
              className="mt-3.5 grid items-center gap-3 rounded-[12px] bg-sunken px-4 py-3.5 sm:grid-cols-[28px_1fr_240px]"
            >
              <IconTile icon={Warning} tone="warn" className="hidden sm:grid" />
              <div>
                <p className="text-[14px] font-semibold text-text">
                  {root.key} is not in Keel&apos;s point-value list
                </p>
                <p className="mt-0.5 text-[12.5px] leading-snug text-muted">
                  {plural(root.rows, 'row')} trade{root.rows === 1 ? 's' : ''}{' '}
                  <span className="font-mono">{root.symbols.join(', ')}</span>.
                  Enter the dollars one full point is worth, so Keel can work
                  out P&amp;L. Keel remembers it next time.
                </p>
              </div>
              <div>
                <label htmlFor={inputId} className={LABEL}>
                  {root.key} point value
                </label>
                <div className="relative">
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-faint"
                  >
                    $
                  </span>
                  <input
                    id={inputId}
                    inputMode="decimal"
                    value={draft}
                    onChange={(e) => setPoint(root.key, e.target.value)}
                    aria-invalid={bad || undefined}
                    aria-describedby={bad ? `${inputId}-err` : undefined}
                    className={`${INPUT} pr-16 pl-7 font-semibold`}
                  />
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-[12.5px] text-faint"
                  >
                    per 1.00
                  </span>
                </div>
                {bad ? (
                  <p
                    id={`${inputId}-err`}
                    className="mt-1.5 text-[12.5px] font-medium text-loss"
                  >
                    Enter a number above zero, like 25,000.
                  </p>
                ) : null}
              </div>
            </div>
          );
        })}

        <div className="-mx-5 mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-b-card border-t border-line bg-surface-1 px-5 py-3.5">
          <button
            type="button"
            onClick={onBack}
            className={buttonClasses('ghost')}
          >
            <ArrowLeft {...ICON} size={16} />
            Back
          </button>
          <div
            aria-live="polite"
            className="min-w-0 flex-1 basis-[220px] text-[12.5px] leading-snug text-faint"
          >
            {!valid ? (
              <p>
                Map these to continue:{' '}
                {missing.map((f) => FIELD_LABEL[f as FieldKey]).join(', ')}.
              </p>
            ) : (
              <p>
                Required fields are all{' '}
                {matchedCount >= required.size ? 'matched' : 'mapped'}.
                {unpriced.length > 0
                  ? ' Unknown symbols must have a point value before you confirm.'
                  : ''}
              </p>
            )}
            {saveError ? (
              <p className="mt-1 font-medium text-loss">
                Couldn&apos;t save the mapping for {account?.name}. Untick Save
                to go on without it.
              </p>
            ) : null}
            {!account ? <p>Choose or create an account to continue.</p> : null}
          </div>
          <button
            type="button"
            onClick={next}
            disabled={!valid || !account || saving}
            className={`${buttonClasses('primary')} ml-auto disabled:cursor-default disabled:opacity-45`}
          >
            Preview {plural(parsed.rows.length, 'row')}
            <ArrowRight {...ICON} size={16} />
          </button>
        </div>
      </section>
    </div>
  );
}

function StatusCell({
  state,
}: {
  state: 'matched' | 'mapped' | 'missing' | 'skipped';
}) {
  const text = {
    matched: 'Matched',
    mapped: 'Mapped',
    missing: 'Needs a column',
    skipped: 'Skipped',
  }[state];
  const tone =
    state === 'matched'
      ? 'bg-accent-soft text-accent'
      : state === 'missing'
        ? 'bg-warn-soft text-warn'
        : state === 'mapped'
          ? 'bg-sunken text-text'
          : 'text-faint';
  return (
    <span
      className={`inline-flex items-center justify-end gap-1.5 ${state === 'skipped' ? 'text-faint' : 'text-muted'}`}
    >
      {state === 'skipped' ? null : (
        <span
          className={`grid size-[22px] place-items-center rounded-full ${tone}`}
        >
          {state === 'missing' ? (
            <Warning {...ICON} size={13} />
          ) : (
            <Check {...ICON} size={12} weight="bold" />
          )}
        </span>
      )}
      <span className="sr-only md:not-sr-only md:text-[12.5px]">{text}</span>
    </span>
  );
}
