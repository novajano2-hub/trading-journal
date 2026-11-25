'use client';

import { Check } from '@phosphor-icons/react/dist/ssr';
import { motion, useReducedMotion } from 'motion/react';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  BROKERS,
  CAPITAL,
  EXPERIENCE,
  GOALS,
  HEARD,
  HEARD_OTHER,
  INSTRUMENTS,
  STEPS,
  SURVEY_SECTION,
  type Choice,
} from '@/content/onboarding';
import { useHydrated } from '@/lib/use-hydrated';
import { enter } from '@/lib/motion';
import { ACTION_BUTTON, Actions, WelcomeCard } from './frame';
import {
  firstUnanswered,
  isAnswered,
  readFirstRun,
  STEP_COUNT,
  toggle,
  toggleCapital,
  writeFirstRun,
  type Draft,
} from './survey-model';

const ROW =
  'flex cursor-pointer items-center gap-3 rounded-[10px] border px-4 text-[14.5px] outline-offset-2 transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent pointer-coarse:min-h-12';
const OFF =
  'border-line-2 bg-surface-1 font-medium shadow-[var(--shadow-chip)] hover:border-faint';
const ON = 'border-accent/55 bg-accent-soft font-semibold text-accent-ink';

/** One option as a real radio or checkbox, drawn as the comp's row or tile. */
function Option({
  type,
  name,
  choice,
  checked,
  onChange,
  tile = false,
}: {
  type: 'radio' | 'checkbox';
  name: string;
  choice: Choice;
  checked: boolean;
  onChange(): void;
  tile?: boolean;
}): React.JSX.Element {
  return (
    <label
      className={`${ROW} ${checked ? ON : OFF} ${tile ? 'h-[52px] gap-2.5 px-3.5' : choice.line ? 'py-3' : 'min-h-[52px]'}`}
    >
      <span
        aria-hidden="true"
        className={`grid flex-none place-items-center border ${type === 'radio' ? 'size-[18px] rounded-full' : 'size-[18px] rounded-md'} ${checked ? 'border-accent bg-accent' : 'border-line-2 bg-surface-1'}`}
      >
        {checked ? (
          type === 'radio' ? (
            <span className="size-1.5 rounded-full bg-white" />
          ) : (
            <Check size={12} weight="bold" className="text-white" />
          )
        ) : null}
      </span>
      <input
        type={type}
        name={name}
        checked={checked}
        onChange={onChange}
        className="sr-only"
      />
      <span className="min-w-0">
        {choice.label}
        {choice.line ? (
          <span
            className={`mt-0.5 block text-[13px] leading-[1.45] font-normal ${checked ? 'text-accent-ink' : 'text-muted'}`}
          >
            {choice.line}
          </span>
        ) : null}
      </span>
    </label>
  );
}

/** The broker step: a type-ahead over Keel's list, one choice [inv-1 004]. */
function BrokerBox({
  labelledBy,
  value,
  onPick,
}: {
  labelledBy: string;
  value: string | undefined;
  onPick(broker: string | undefined): void;
}): React.JSX.Element {
  const id = useId();
  const [text, setText] = useState(value ?? '');
  const [typed, setTyped] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const needle = text.trim().toLowerCase();
  // A picked broker shows the whole list again when the field opens.
  const matches =
    typed && needle
      ? BROKERS.filter((b) => b.toLowerCase().includes(needle))
      : BROKERS;
  const pick = (broker: string) => {
    setText(broker);
    setTyped(false);
    setOpen(false);
    onPick(broker);
  };
  return (
    <div className="relative">
      <input
        role="combobox"
        aria-label="Main broker"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        aria-autocomplete="list"
        aria-activedescendant={
          open && matches[active] ? `${id}-${active}` : undefined
        }
        aria-describedby={labelledBy}
        value={text}
        placeholder="Search brokers"
        autoComplete="off"
        spellCheck={false}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onChange={(e) => {
          setText(e.target.value);
          setTyped(true);
          setOpen(true);
          setActive(0);
          // Editing the text drops the choice until one is picked again.
          if (value !== undefined) onPick(undefined);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setOpen(true);
            setActive((i) => Math.min(i + 1, matches.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((i) => Math.max(i - 1, 0));
          } else if (e.key === 'Enter' && open && matches[active]) {
            e.preventDefault();
            pick(matches[active]);
          } else if (e.key === 'Escape' && open) {
            e.preventDefault();
            setOpen(false);
          }
        }}
        className="block h-11 w-full rounded-[10px] border border-line-2 bg-surface-1 px-3.5 text-[14.5px] text-text shadow-[var(--shadow-chip)] outline-none placeholder:text-faint hover:border-faint focus-visible:border-accent focus-visible:shadow-[0_0_0_3px_var(--accent-soft)]"
      />
      {open ? (
        <ul
          id={`${id}-list`}
          role="listbox"
          aria-label="Brokers"
          className="absolute inset-x-0 top-[calc(100%+4px)] z-20 max-h-60 overflow-y-auto rounded-[10px] border border-line bg-surface-1 p-1 shadow-[var(--shadow)]"
        >
          {matches.length === 0 ? (
            <li
              role="presentation"
              className="px-3 py-2 text-[13px] text-muted"
            >
              No broker matches. Choose Other if yours isn&apos;t listed.
            </li>
          ) : (
            matches.map((b, i) => (
              <li
                key={b}
                id={`${id}-${i}`}
                role="option"
                aria-selected={b === value}
                // Keep focus in the field, so picking doesn't close the list first.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(b)}
                onMouseMove={() => setActive(i)}
                className={`flex min-h-9 cursor-pointer items-center rounded-lg px-3 text-[14px] pointer-coarse:min-h-11 ${i === active ? 'bg-sunken' : ''} ${b === value ? 'font-semibold text-accent-ink' : ''}`}
              >
                {b}
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}

function Progress({ n }: { n: number }): React.JSX.Element {
  const reduced = useReducedMotion();
  return (
    <>
      <div className="mb-2 flex justify-between text-[12.5px] text-faint">
        <span>
          Step {n} of {STEP_COUNT}
        </span>
        <span>{SURVEY_SECTION}</span>
      </div>
      <div
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={STEP_COUNT}
        aria-valuenow={n}
        aria-label={`Step ${n} of ${STEP_COUNT}`}
        className="relative mb-[26px] h-1.5 overflow-hidden rounded-[3px] bg-accent-soft"
      >
        <motion.i
          className="absolute inset-y-0 left-0 rounded-[3px] bg-accent"
          initial={false}
          animate={{ width: `${(n / STEP_COUNT) * 100}%` }}
          transition={reduced ? { duration: 0 } : enter}
        />
      </div>
    </>
  );
}

function Step({ step }: { step: string }): React.JSX.Element | null {
  const router = useRouter();
  const heading = useId();
  const [state, setState] = useState(readFirstRun);
  const draft = state.draft;
  const n = /^[1-6]$/.test(step) ? Number(step) : 0;
  const reach = firstUnanswered(draft);
  // Keel's call (TradeZella unknown): a bad step, or one whose earlier steps are
  // unanswered, goes to the first unanswered step.
  const ok = n >= 1 && n <= reach;
  useEffect(() => {
    if (!ok) router.replace(`/app/welcome/${reach}`);
  }, [ok, reach, router]);
  if (!ok) return null;

  const set = (patch: Draft) => {
    const next = { ...state, draft: { ...state.draft, ...patch } };
    writeFirstRun(next);
    setState(next);
  };
  const content = STEPS[n - 1]!;
  const answered = isAnswered(n, draft);
  const cont = () => {
    if (n < STEP_COUNT) {
      router.push(`/app/welcome/${n + 1}`);
      return;
    }
    writeFirstRun({ ...state, finished: true });
    router.push('/app/home');
  };

  let body: React.ReactNode;
  let group: 'radiogroup' | 'group' = 'group';
  if (n === 1) {
    group = 'radiogroup';
    body = EXPERIENCE.map((c) => (
      <Option
        key={c.id}
        type="radio"
        name="experience"
        choice={c}
        checked={draft.experience === c.id}
        onChange={() => set({ experience: c.id })}
      />
    ));
  } else if (n === 2) {
    body = CAPITAL.map((c) => (
      <Option
        key={c.id}
        type="checkbox"
        name="capital"
        choice={c}
        checked={!!draft.capital?.includes(c.id)}
        onChange={() => set({ capital: toggleCapital(draft.capital, c.id) })}
      />
    ));
  } else if (n === 3) {
    body = (
      <BrokerBox
        labelledBy={heading}
        value={draft.broker}
        onPick={(broker) => set({ broker })}
      />
    );
  } else if (n === 4) {
    body = INSTRUMENTS.map((c) => (
      <Option
        key={c.id}
        type="checkbox"
        name="instruments"
        choice={c}
        tile
        checked={!!draft.instruments?.includes(c.id)}
        onChange={() => set({ instruments: toggle(draft.instruments, c.id) })}
      />
    ));
  } else if (n === 5) {
    body = GOALS.map((c) => (
      <Option
        key={c.id}
        type="checkbox"
        name="goals"
        choice={c}
        checked={!!draft.goals?.includes(c.id)}
        onChange={() => set({ goals: toggle(draft.goals, c.id) })}
      />
    ));
  } else {
    group = 'radiogroup';
    body = (
      <>
        {HEARD.map((c) => (
          <Option
            key={c.id}
            type="radio"
            name="heard"
            choice={c}
            checked={draft.heardFrom === c.id}
            onChange={() => set({ heardFrom: c.id })}
          />
        ))}
        {draft.heardFrom === HEARD_OTHER ? (
          <input
            aria-label="Please say where"
            placeholder="Please say where"
            value={draft.heardFromOther ?? ''}
            onChange={(e) => set({ heardFromOther: e.target.value })}
            autoComplete="off"
            className="mt-1 block h-11 w-full rounded-[10px] border border-line-2 bg-surface-1 px-3.5 text-[14.5px] text-text shadow-[var(--shadow-chip)] outline-none placeholder:text-faint hover:border-faint focus-visible:border-accent focus-visible:shadow-[0_0_0_3px_var(--accent-soft)]"
          />
        ) : null}
      </>
    );
  }

  return (
    <WelcomeCard>
      <Progress n={n} />
      <h1
        id={heading}
        className="text-center text-[26px] leading-[1.15] font-semibold tracking-[-0.03em] text-balance"
      >
        {content.title}
      </h1>
      <p className="mt-2 text-center text-sm leading-[1.55] text-pretty text-muted">
        {content.lede}
      </p>
      <div
        role={n === 3 ? undefined : group}
        aria-labelledby={n === 3 ? undefined : heading}
        className={`mt-6 ${n === 4 ? 'grid grid-cols-2 gap-2' : 'flex flex-col gap-2'}`}
      >
        {body}
      </div>
      <Actions>
        {n > 1 ? (
          <Button
            variant="secondary"
            className={`w-[104px] ${ACTION_BUTTON}`}
            onClick={() => router.push(`/app/welcome/${n - 1}`)}
          >
            Back
          </Button>
        ) : null}
        <Button
          disabled={!answered}
          className={`flex-1 ${ACTION_BUTTON}`}
          onClick={cont}
        >
          Continue
        </Button>
      </Actions>
    </WelcomeCard>
  );
}

/**
 * One survey step, `step` being the route's step segment. The answers come from
 * the browser session (K55), which the server can't read, so the step draws
 * after hydration, from the same state the user left.
 */
export function SurveyStep({ step }: { step: string }): React.JSX.Element {
  const hydrated = useHydrated();
  return hydrated ? <Step step={step} /> : <WelcomeCard busy />;
}
