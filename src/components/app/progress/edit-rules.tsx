'use client';

import { Clock, Info, Plus, Trash } from '@phosphor-icons/react/dist/ssr';
import {
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from 'react';
import { Button } from '@/components/ui/button';
import { MorphDialog } from '@/components/ui/morph-dialog';
import { Segmented } from '@/components/ui/segmented';
import { useRoutineToday } from '@/data/query/derived';
import {
  usePrefs,
  useResetTracker,
  useSaveTracker,
  useTracker,
} from '@/data/query/hooks';
import { versionOn } from '@/domain/tracker/defaults';
import type {
  CustomRule,
  Tracker,
  TrackerStage,
  TrackerVersion,
  Weekdays,
} from '@/domain/types';
import { ConfirmDialog } from '../confirm-dialog';
import { STAGE_NAME } from './rule-label';

const MON_TO_FRI: Weekdays = [false, true, true, true, true, true, false];
/** Monday first for display; the data is Sunday first. */
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;
const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const STAGES: { stage: TrackerStage; note: string }[] = [
  { stage: 'prepare', note: 'Before the open' },
  { stage: 'trade', note: 'While the market is open' },
  { stage: 'reflect', note: "Checked against the day's trades" },
];
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const DECIMAL = /^\d+(\.\d{1,2})?$/;

/** The form's state: inputs are text, so a half-typed value is never lost. */
interface Draft {
  days: Weekdays;
  startBy: { on: boolean; time: string };
  hours: { on: boolean; from: string; to: string };
  strategy: boolean;
  stop: boolean;
  perTrade: { on: boolean; unit: 'amount' | 'percent'; text: string };
  perDay: { on: boolean; text: string };
  custom: CustomRule[];
}

const num = (n: number): string => String(Number(n.toFixed(2)));

function toDraft(v: TrackerVersion): Draft {
  const b = v.builtIn;
  return {
    days: [...v.tradingDays] as Weekdays,
    startBy: { ...b.startBy },
    hours: { ...b.hours },
    strategy: b.strategy.on,
    stop: b.stop.on,
    perTrade: {
      on: b.lossPerTrade.on,
      unit: b.lossPerTrade.unit,
      text:
        b.lossPerTrade.unit === 'amount'
          ? num(b.lossPerTrade.value / 100)
          : num(b.lossPerTrade.value * 100),
    },
    perDay: { on: b.lossPerDay.on, text: num(b.lossPerDay.amount / 100) },
    custom: v.custom.map((c) => ({ ...c, days: [...c.days] as Weekdays })),
  };
}

type Errors = Partial<
  Record<'startBy' | 'hoursFrom' | 'hoursTo' | 'perTrade' | 'perDay', string>
>;

const TIME_ERROR = 'Use a time as HH:mm.';
const ORDER_ERROR = 'The start must be before the end.';

function validate(d: Draft): Errors {
  const e: Errors = {};
  if (d.startBy.on && !HHMM.test(d.startBy.time)) e.startBy = TIME_ERROR;
  if (d.hours.on) {
    if (!HHMM.test(d.hours.from)) e.hoursFrom = TIME_ERROR;
    if (!HHMM.test(d.hours.to)) e.hoursTo = TIME_ERROR;
    if (!e.hoursFrom && !e.hoursTo && d.hours.from >= d.hours.to)
      e.hoursFrom = ORDER_ERROR;
  }
  if (d.perTrade.on) {
    const n = DECIMAL.test(d.perTrade.text) ? Number(d.perTrade.text) : NaN;
    if (d.perTrade.unit === 'amount') {
      if (!(n > 0)) e.perTrade = 'Enter an amount above 0.';
    } else if (!(n > 0 && n <= 100)) {
      e.perTrade = 'Enter a percent above 0, up to 100.';
    }
  }
  if (d.perDay.on) {
    const n = DECIMAL.test(d.perDay.text) ? Number(d.perDay.text) : NaN;
    if (!(n > 0)) e.perDay = 'Enter an amount above 0.';
  }
  return e;
}

/** The draft as a version's rules; a switched-off field that isn't valid keeps its saved value. */
function toRules(d: Draft, prev: TrackerVersion): Omit<TrackerVersion, 'from'> {
  const b = prev.builtIn;
  const tradeN = Number(d.perTrade.text);
  const dayN = Number(d.perDay.text);
  const tradeOk =
    DECIMAL.test(d.perTrade.text) &&
    tradeN > 0 &&
    (d.perTrade.unit === 'amount' || tradeN <= 100);
  const dayOk = DECIMAL.test(d.perDay.text) && dayN > 0;
  const time = (t: string, fallback: string) => (HHMM.test(t) ? t : fallback);
  return {
    tradingDays: [...d.days] as Weekdays,
    builtIn: {
      startBy: {
        on: d.startBy.on,
        time: time(d.startBy.time, b.startBy.time),
      },
      hours: {
        on: d.hours.on,
        from: time(d.hours.from, b.hours.from),
        to: time(d.hours.to, b.hours.to),
      },
      strategy: { on: d.strategy },
      stop: { on: d.stop },
      lossPerTrade: {
        on: d.perTrade.on,
        unit: d.perTrade.unit,
        value: !tradeOk
          ? b.lossPerTrade.value
          : d.perTrade.unit === 'amount'
            ? Math.round(tradeN * 100)
            : Number((tradeN / 100).toFixed(4)),
      },
      lossPerDay: {
        on: d.perDay.on,
        amount: dayOk ? Math.round(dayN * 100) : b.lossPerDay.amount,
      },
    },
    custom: d.custom.map((c) => ({ ...c, days: [...c.days] as Weekdays })),
  };
}

/** "GMT-5": the zone's offset right now. */
function gmtOffset(timeZone: string): string {
  try {
    return (
      new Intl.DateTimeFormat('en-US', {
        timeZone,
        timeZoneName: 'shortOffset',
      })
        .formatToParts(new Date())
        .find((p) => p.type === 'timeZoneName')?.value ?? timeZone
    );
  } catch {
    return timeZone;
  }
}

function currencySymbol(currency: string): string {
  try {
    return (
      new Intl.NumberFormat('en-US', { style: 'currency', currency })
        .formatToParts(0)
        .find((p) => p.type === 'currency')?.value ?? currency
    );
  } catch {
    return currency;
  }
}

const FIELD =
  'h-9 rounded-[8px] border border-line-2 bg-surface-1 px-2.5 text-[13.5px] tabular-nums text-text focus-visible:outline-2 focus-visible:outline-accent disabled:bg-sunken disabled:text-faint pointer-coarse:h-11 aria-[invalid=true]:border-loss';

function Switch({
  on,
  label,
  onChange,
}: {
  on: boolean;
  label: string;
  onChange(on: boolean): void;
}): React.JSX.Element {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className="group relative h-6 w-10 flex-none rounded-full bg-line-2 transition-colors duration-200 before:absolute before:-inset-x-1 before:-inset-y-2.5 before:content-[''] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent aria-checked:bg-accent"
    >
      <span className="absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow-[var(--shadow-chip)] motion-safe:transition-transform motion-safe:duration-200 group-aria-checked:translate-x-4" />
    </button>
  );
}

/** 00:00 to 23:45 in quarter hours: Keel's step (TradeZella's is unknown). */
const TIMES = Array.from(
  { length: 96 },
  (_, i) =>
    `${String(Math.floor(i / 4)).padStart(2, '0')}:${String((i % 4) * 15).padStart(2, '0')}`,
);

/** A 24-hour time select; a saved time off the quarter hour stays pickable. */
function TimeField({
  label,
  value,
  disabled,
  error,
  errorId,
  onChange,
}: {
  label: string;
  value: string;
  disabled: boolean;
  error: string | undefined;
  errorId: string;
  onChange(v: string): void;
}): React.JSX.Element {
  const options = TIMES.includes(value) ? TIMES : [...TIMES, value].sort();
  return (
    <span className="relative inline-flex">
      <select
        aria-label={label}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        disabled={disabled}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`${FIELD} w-[88px] appearance-none pr-7`}
      >
        {options.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
      <Clock
        size={14}
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-faint"
      />
    </span>
  );
}

function DayPills({
  label,
  days,
  onChange,
  compact,
  className = '',
}: {
  label: string;
  days: Weekdays;
  onChange(days: Weekdays): void;
  compact?: boolean;
  className?: string;
}): React.JSX.Element {
  return (
    <span
      role="group"
      aria-label={label}
      className={`flex ${compact ? 'gap-[3px] pointer-coarse:col-span-2' : 'mb-3 flex-wrap gap-1.5'} ${className}`}
    >
      {DAY_ORDER.map((i) => {
        const toggle = () => {
          const next = [...days] as Weekdays;
          next[i] = !next[i];
          onChange(next);
        };
        if (!compact)
          return (
            <button
              key={i}
              type="button"
              aria-pressed={days[i]}
              aria-label={DAY_SHORT[i]}
              onClick={toggle}
              className={`h-9 min-w-14 rounded-full px-3.5 text-[13.5px] font-medium pointer-coarse:h-11 focus-visible:outline-2 focus-visible:outline-accent ${
                days[i]
                  ? 'bg-accent-soft font-semibold text-accent-ink'
                  : 'border border-line-2 text-muted'
              }`}
            >
              {DAY_SHORT[i]}
            </button>
          );
        // Compact: a 24px chip. On a coarse pointer the button is the 44px
        // target (the row's full width shared by seven) and the chip sits in it.
        return (
          <button
            key={i}
            type="button"
            aria-pressed={days[i]}
            aria-label={DAY_SHORT[i]}
            onClick={toggle}
            className="group grid size-6 place-items-center focus-visible:outline-none pointer-coarse:h-11 pointer-coarse:min-w-11 pointer-coarse:flex-1 sm:pointer-coarse:w-11 sm:pointer-coarse:flex-none"
          >
            <span
              className={`grid size-6 place-items-center rounded-[6px] text-[11.5px] font-semibold group-focus-visible:outline-2 group-focus-visible:outline-accent ${
                days[i]
                  ? 'bg-accent-soft text-accent-ink'
                  : 'border border-line-2 text-faint'
              }`}
            >
              {DAY_SHORT[i]![0]}
            </span>
          </button>
        );
      })}
    </span>
  );
}

const ROW =
  'flex min-h-12 flex-wrap items-center gap-x-2.5 gap-y-1.5 border-t border-line/70 py-1 first-of-type:border-t-0';
const CUSTOM_ROW =
  'grid min-h-12 grid-cols-[1fr_auto] items-center gap-x-2.5 gap-y-1.5 border-t border-line/70 py-1.5 sm:flex sm:flex-wrap';
const NAME = 'text-sm font-medium';
const WORD = 'text-[13.5px] text-muted';
const ERROR = 'basis-full text-xs text-loss sm:pl-[50px]';
/** On a phone the controls drop under the name, in line with it. */
const CONTROLS =
  'contents max-sm:flex max-sm:basis-full max-sm:flex-wrap max-sm:items-center max-sm:gap-2.5 max-sm:pl-[50px]';

/**
 * One built-in rule: its switch, its name, and (when it has them) controls
 * and a field error. The switch's label is the rule's name.
 */
function BuiltInRow({
  on,
  label,
  onChange,
  controls,
  error,
}: {
  on: boolean;
  label: string;
  onChange(on: boolean): void;
  controls?: React.ReactNode;
  error?: { id: string; text: string | undefined };
}): React.JSX.Element {
  return (
    <div className={ROW}>
      <Switch on={on} label={label} onChange={onChange} />
      <span
        className={`${NAME} ${controls ? 'max-sm:basis-[calc(100%-50px)]' : ''} ${on ? '' : 'text-muted'}`}
      >
        {label}
      </span>
      {controls ? <div className={CONTROLS}>{controls}</div> : null}
      {error?.text ? (
        <p id={error.id} className={ERROR}>
          {error.text}
        </p>
      ) : null}
    </div>
  );
}

function DeleteButton({
  label,
  onClick,
  className = '',
}: {
  label: string;
  onClick(): void;
  className?: string;
}): React.JSX.Element {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={`grid size-8 place-items-center rounded-[8px] text-muted hover:bg-sunken focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:size-11 ${className}`}
    >
      <Trash size={16} aria-hidden="true" />
    </button>
  );
}

function SectionHead({
  id,
  title,
  note,
}: {
  id: string;
  title: string;
  note: string;
}): React.JSX.Element {
  return (
    <div className="mb-2.5 flex items-baseline gap-2.5">
      <h3 id={id} className="text-sm font-semibold">
        {title}
      </h3>
      <p className="text-[12.5px] text-faint">{note}</p>
    </div>
  );
}

/** The unsaved custom rule being typed in a stage. */
interface Pending {
  stage: TrackerStage;
  name: string;
  days: Weekdays;
}

const ruleNameOk = (name: string): boolean => {
  const n = name.trim().length;
  return n >= 1 && n <= 80;
};

function NewRule({
  pending,
  onChange,
  onAdd,
  onDiscard,
}: {
  pending: Pending;
  onChange(next: Pending): void;
  onAdd(): void;
  onDiscard(): void;
}): React.JSX.Element {
  const errorId = useId();
  const tooLong = pending.name.trim().length > 80;
  const ok = ruleNameOk(pending.name);
  return (
    <div className={CUSTOM_ROW}>
      <span aria-hidden="true" className="hidden w-10 flex-none sm:block" />
      <input
        type="text"
        autoFocus
        autoComplete="off"
        aria-label="New rule name"
        placeholder="Name the rule"
        aria-invalid={tooLong ? true : undefined}
        aria-describedby={tooLong ? errorId : undefined}
        value={pending.name}
        onChange={(e) => onChange({ ...pending, name: e.target.value })}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && ok) {
            e.preventDefault();
            onAdd();
          }
        }}
        className={`${FIELD} col-start-1 row-start-1 min-w-0 sm:flex-1`}
      />
      <DayPills
        label="Days for the new rule"
        days={pending.days}
        onChange={(days) => onChange({ ...pending, days })}
        compact
        className="col-start-1 row-start-2"
      />
      <Button
        size="sm"
        variant="secondary"
        disabled={!ok}
        onClick={onAdd}
        className="col-start-2 row-start-2 pointer-coarse:row-start-3"
      >
        Add
      </Button>
      <DeleteButton
        label="Discard the new rule"
        onClick={onDiscard}
        className="col-start-2 row-start-1"
      />
      {tooLong ? (
        <p id={errorId} className={`${ERROR} col-span-2`}>
          Use 80 characters or fewer.
        </p>
      ) : null}
    </div>
  );
}

/**
 * The Edit rules dialog: trading days, the built-in rules and custom rules by
 * stage, and Reset all progress. A save writes a version that counts from today
 * (the repository replaces one already dated today); earlier days keep the
 * rules they were scored with. Save stays off until something changes and
 * every field is valid. On a phone it is a full-height sheet.
 */
export function EditRules({
  open,
  onOpenChange,
  origin,
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
  origin: RefObject<HTMLElement | null>;
}): React.JSX.Element | null {
  const tracker = useTracker().data;
  const today = useRoutineToday();
  const prefs = usePrefs().data;
  if (!tracker || !today || !prefs) return null;
  return (
    <Dialogs
      open={open}
      onOpenChange={onOpenChange}
      origin={origin}
      tracker={tracker}
      today={today}
      timeZone={prefs.timeZone}
      currency={prefs.baseCurrency}
    />
  );
}

function Dialogs({
  open,
  onOpenChange,
  origin,
  tracker,
  today,
  timeZone,
  currency,
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
  origin: RefObject<HTMLElement | null>;
  tracker: Tracker;
  today: string;
  timeZone: string;
  currency: string;
}): React.JSX.Element {
  const current =
    versionOn(tracker, today) ?? tracker.versions[tracker.versions.length - 1]!;
  const base = useMemo(() => toDraft(current), [current]);
  const [draft, setDraft] = useState<Draft>(base);
  const [adding, setAdding] = useState<Pending | null>(null);
  const [asking, setAsking] = useState(false);
  const [failed, setFailed] = useState(false);
  const save = useSaveTracker();
  const reset = useResetTracker();
  const ids = useId();
  // Where focus goes once the control it was on has left: a stage's Add rule.
  const addButtons = useRef<Partial<Record<TrackerStage, HTMLButtonElement>>>(
    {},
  );
  const focusAfter = useRef<TrackerStage | null>(null);
  useLayoutEffect(() => {
    const stage = focusAfter.current;
    if (!stage) return;
    const button = addButtons.current[stage];
    if (!button) return;
    focusAfter.current = null;
    button.focus();
  });

  // Each opening starts from the rules in effect today.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setDraft(base);
      setAdding(null);
      setFailed(false);
    }
  }

  const errors = validate(draft);
  // A rule typed but not yet Added counts as a change, and Save includes it
  // when its name is valid (Keel's call).
  const typed = adding !== null && adding.name.trim().length > 0;
  const typedOk = adding !== null && ruleNameOk(adding.name);
  const valid = Object.keys(errors).length === 0 && (!typed || typedOk);
  const changed = typed || JSON.stringify(draft) !== JSON.stringify(base);
  const symbol = currencySymbol(currency);
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));
  const errId = (k: string) => `${ids}-${k}`;

  const onSave = async () => {
    setFailed(false);
    try {
      const withTyped: Draft =
        adding && typedOk
          ? {
              ...draft,
              custom: [
                ...draft.custom,
                {
                  id: crypto.randomUUID(),
                  name: adding.name.trim(),
                  stage: adding.stage,
                  days: adding.days,
                },
              ],
            }
          : draft;
      await save.mutateAsync({ rules: toRules(withTyped, current) });
      onOpenChange(false);
    } catch {
      setFailed(true);
    }
  };

  const customOf = (stage: TrackerStage) =>
    draft.custom.filter((c) => c.stage === stage);
  const dropCustom = (id: string, stage: TrackerStage) => {
    focusAfter.current = stage;
    set({ custom: draft.custom.filter((c) => c.id !== id) });
  };

  const footer = (
    <div className="flex items-center justify-end gap-2">
      {failed ? (
        <p role="alert" className="mr-auto text-[13px] text-loss">
          Couldn&apos;t save. Try again.
        </p>
      ) : null}
      <Button
        variant="secondary"
        onClick={() => onOpenChange(false)}
        className="max-sm:flex-1"
      >
        Cancel
      </Button>
      <Button
        disabled={!changed || !valid || save.isPending}
        onClick={() => void onSave()}
        className="max-sm:flex-1"
      >
        Save changes
      </Button>
    </div>
  );

  const customRows = (stage: TrackerStage) =>
    customOf(stage).map((c) => (
      <div key={c.id} className={CUSTOM_ROW}>
        <span aria-hidden="true" className="hidden w-10 flex-none sm:block" />
        <span className={`${NAME} col-start-1 min-w-0 sm:flex-1`}>
          {c.name}
        </span>
        <DayPills
          label={`Days for ${c.name}`}
          days={c.days}
          compact
          className="col-start-1"
          onChange={(days) =>
            set({
              custom: draft.custom.map((x) =>
                x.id === c.id ? { ...x, days } : x,
              ),
            })
          }
        />
        <DeleteButton
          label={`Delete ${c.name}`}
          onClick={() => dropCustom(c.id, c.stage)}
          className="col-start-2 row-start-1"
        />
      </div>
    ));

  const addRule = (stage: TrackerStage) =>
    adding?.stage === stage ? (
      <NewRule
        pending={adding}
        onChange={setAdding}
        onDiscard={() => {
          focusAfter.current = stage;
          setAdding(null);
        }}
        onAdd={() => {
          focusAfter.current = stage;
          set({
            custom: [
              ...draft.custom,
              {
                id: crypto.randomUUID(),
                name: adding.name.trim(),
                stage,
                days: adding.days,
              },
            ],
          });
          setAdding(null);
        }}
      />
    ) : (
      <div className="border-t border-line/70 pt-2 pb-3 sm:pl-[50px]">
        <button
          type="button"
          ref={(el) => {
            if (el) addButtons.current[stage] = el;
            else delete addButtons.current[stage];
          }}
          onClick={() =>
            setAdding({ stage, name: '', days: [...MON_TO_FRI] as Weekdays })
          }
          className="inline-flex h-[30px] items-center gap-[5px] rounded-chip text-[13px] font-semibold whitespace-nowrap text-accent-ink hover:underline focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:h-11"
        >
          <Plus size={14} aria-hidden="true" />
          Add rule
        </button>
      </div>
    );

  const headId = (s: string) => `${ids}-h-${s}`;
  const SECTION = 'border-b border-line pt-[18px] pb-1.5';

  return (
    <>
      <MorphDialog
        open={open}
        onOpenChange={onOpenChange}
        origin={origin}
        returnFocus={origin}
        title="Edit rules"
        description="The days you trade and the rules the tracker scores each day."
        size="sheet"
        footer={footer}
      >
        <p className="mt-1 flex items-center gap-2.5 rounded-[10px] bg-sunken px-4 py-2.5 text-[13px] leading-[1.5] text-muted">
          <Info size={16} aria-hidden="true" className="mt-px flex-none" />
          Changes count from today. Earlier days keep the rules they were scored
          with.
        </p>

        <section aria-labelledby={headId('days')} className={SECTION}>
          <SectionHead
            id={headId('days')}
            title="Trading days"
            note="Rules are scored only on these days."
          />
          <DayPills
            label="Trading days"
            days={draft.days}
            onChange={(days) => set({ days })}
          />
        </section>

        {STAGES.map(({ stage, note }) => (
          <section
            key={stage}
            aria-labelledby={headId(stage)}
            className={SECTION}
          >
            <SectionHead
              id={headId(stage)}
              title={STAGE_NAME[stage]}
              note={note}
            />

            {stage === 'prepare' ? (
              <BuiltInRow
                on={draft.startBy.on}
                label="Start the day note by"
                onChange={(on) => set({ startBy: { ...draft.startBy, on } })}
                error={{ id: errId('startBy'), text: errors.startBy }}
                controls={
                  <TimeField
                    label="Start by time"
                    value={draft.startBy.time}
                    disabled={!draft.startBy.on}
                    error={errors.startBy}
                    errorId={errId('startBy')}
                    onChange={(time) =>
                      set({ startBy: { ...draft.startBy, time } })
                    }
                  />
                }
              />
            ) : null}

            {stage === 'trade' ? (
              <BuiltInRow
                on={draft.hours.on}
                label="Trade only between"
                onChange={(on) => set({ hours: { ...draft.hours, on } })}
                error={{
                  id: errId(errors.hoursFrom ? 'hoursFrom' : 'hoursTo'),
                  text: errors.hoursFrom ?? errors.hoursTo,
                }}
                controls={
                  <>
                    <TimeField
                      label="Trading hours from"
                      value={draft.hours.from}
                      disabled={!draft.hours.on}
                      error={errors.hoursFrom}
                      errorId={errId('hoursFrom')}
                      onChange={(from) =>
                        set({ hours: { ...draft.hours, from } })
                      }
                    />
                    <span className={WORD}>and</span>
                    <TimeField
                      label="Trading hours to"
                      value={draft.hours.to}
                      disabled={!draft.hours.on}
                      error={errors.hoursTo}
                      errorId={errId('hoursTo')}
                      onChange={(to) => set({ hours: { ...draft.hours, to } })}
                    />
                    <span className={WORD}>{gmtOffset(timeZone)}</span>
                  </>
                }
              />
            ) : null}

            {stage === 'reflect' ? (
              <>
                <BuiltInRow
                  on={draft.strategy}
                  label="Every trade has a strategy"
                  onChange={(on) => set({ strategy: on })}
                />
                <BuiltInRow
                  on={draft.stop}
                  label="Every trade has a planned stop"
                  onChange={(on) => set({ stop: on })}
                />
                <BuiltInRow
                  on={draft.perTrade.on}
                  label="Keep every loss to"
                  onChange={(on) =>
                    set({ perTrade: { ...draft.perTrade, on } })
                  }
                  error={{ id: errId('perTrade'), text: errors.perTrade }}
                  controls={
                    <>
                      <Segmented
                        label="Per-trade loss unit"
                        options={[
                          { value: 'amount', label: symbol },
                          { value: 'percent', label: '%' },
                        ]}
                        value={draft.perTrade.unit}
                        disabled={!draft.perTrade.on}
                        coarseTargets
                        onChange={(unit) =>
                          set({ perTrade: { ...draft.perTrade, unit } })
                        }
                      />
                      <input
                        type="text"
                        inputMode="decimal"
                        autoComplete="off"
                        aria-label="Per-trade loss limit"
                        aria-invalid={errors.perTrade ? true : undefined}
                        aria-describedby={
                          errors.perTrade ? errId('perTrade') : undefined
                        }
                        disabled={!draft.perTrade.on}
                        value={draft.perTrade.text}
                        onChange={(e) =>
                          set({
                            perTrade: {
                              ...draft.perTrade,
                              text: e.target.value,
                            },
                          })
                        }
                        className={`${FIELD} w-[72px]`}
                      />
                      <span className={WORD}>or less</span>
                    </>
                  }
                />
                <BuiltInRow
                  on={draft.perDay.on}
                  label="Keep the day's loss to"
                  onChange={(on) => set({ perDay: { ...draft.perDay, on } })}
                  error={{ id: errId('perDay'), text: errors.perDay }}
                  controls={
                    <>
                      <span className="relative inline-flex">
                        <span
                          aria-hidden="true"
                          className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-[13.5px] text-faint"
                        >
                          {symbol}
                        </span>
                        <input
                          type="text"
                          inputMode="decimal"
                          autoComplete="off"
                          aria-label="Daily loss limit"
                          aria-invalid={errors.perDay ? true : undefined}
                          aria-describedby={
                            errors.perDay ? errId('perDay') : undefined
                          }
                          disabled={!draft.perDay.on}
                          value={draft.perDay.text}
                          onChange={(e) =>
                            set({
                              perDay: { ...draft.perDay, text: e.target.value },
                            })
                          }
                          className={`${FIELD} w-[88px] pl-6`}
                        />
                      </span>
                      <span className={WORD}>or less, across all accounts</span>
                    </>
                  }
                />
              </>
            ) : null}

            {customRows(stage)}
            {addRule(stage)}
          </section>
        ))}

        <section
          aria-labelledby={headId('reset')}
          className="flex items-center gap-6 pt-[18px] pb-1 max-sm:flex-col max-sm:items-start max-sm:gap-3"
        >
          <div>
            <h3 id={headId('reset')} className="text-sm font-semibold">
              Reset all progress
            </h3>
            <p className="mt-[3px] max-w-[52ch] text-[12.5px] leading-[1.5] text-muted">
              Clears streaks, history, ticks and custom rules, and starts the
              tracker again today. Trades, notes, moods and ratings stay. Closed
              days stay closed.
            </p>
          </div>
          <Button
            size="sm"
            variant="secondary"
            aria-haspopup="dialog"
            onClick={() => setAsking(true)}
            className="flex-none"
          >
            Reset progress
          </Button>
        </section>
      </MorphDialog>
      <ConfirmDialog
        open={asking}
        title="Reset all progress?"
        body="This clears streaks, history, ticks and custom rules, and restarts the tracker today. Your trades, notes, moods and ratings stay. It can't be undone."
        confirmLabel="Reset progress"
        danger
        onConfirm={async () => {
          await reset.mutateAsync();
          onOpenChange(false);
        }}
        onClose={() => setAsking(false)}
      />
    </>
  );
}
