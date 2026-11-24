'use client';

import { SlidersHorizontal } from '@phosphor-icons/react/dist/ssr';
import {
  createContext,
  useContext,
  useId,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Button } from '@/components/ui/button';
import { useUpdatePrefs, usePrefs } from '@/data/query/hooks';
import { MorphDialog } from '@/components/ui/morph-dialog';
import { buttonClasses } from '@/components/ui/button-styles';

/**
 * The Overview's figures by group, in page order. A figure is stored as
 * `group:figure` (the same metric can sit in two groups). A group whose figures
 * are all hidden leaves the page. A test holds this list to what the page draws.
 */
export const FIGURE_GROUPS = [
  {
    id: 'key',
    title: 'Key figures',
    figures: [
      'pnl',
      'win-rate',
      'profit-factor',
      'expectancy',
      'avg-win',
      'avg-loss',
      'largest-win',
      'largest-loss',
      'max-drawdown',
      'win-streak',
      'loss-streak',
      'green-days',
      'sharpe',
      'sortino',
    ],
  },
  {
    id: 'gross-net',
    title: 'Gross to net',
    figures: ['gross-pnl', 'fees', 'net-pnl'],
  },
  {
    id: 'risk',
    title: 'Risk in R',
    figures: ['planned-r', 'realized-r', 'r-expectancy', 'no-stop'],
  },
  {
    id: 'days',
    title: 'Days and returns',
    figures: [
      'avg-green-day',
      'avg-red-day',
      'trades-per-day',
      'day-streaks',
      'longest-day',
      'net-roi',
    ],
  },
  {
    id: 'sides',
    title: 'Long and short',
    figures: ['trades', 'win-rate', 'pnl', 'profit-factor'],
  },
  {
    id: 'months',
    title: 'Months',
    figures: ['best-month', 'worst-month', 'avg-month'],
  },
  {
    id: 'trade-counts',
    title: 'Trade counts',
    figures: ['winners', 'losers', 'breakevens', 'open-trades'],
  },
  {
    id: 'day-counts',
    title: 'Day counts',
    figures: [
      'trading-days',
      'green-day-count',
      'red-day-count',
      'flat-day-count',
      'logged-days',
    ],
  },
  {
    id: 'day-figures',
    title: 'Day figures',
    figures: [
      'avg-daily-pnl',
      'avg-daily-win-loss',
      'largest-green-day',
      'largest-red-day',
      'avg-daily-volume',
      'avg-drawdown',
      'avg-drawdown-pct',
    ],
  },
  {
    id: 'hold',
    title: 'Hold time',
    figures: [
      'hold-time',
      'hold-time-wins',
      'hold-time-losses',
      'hold-time-breakevens',
    ],
  },
  {
    id: 'costs',
    title: 'Costs',
    figures: ['commissions', 'fill-fees'],
  },
] as const;

export type FigureGroupId = (typeof FIGURE_GROUPS)[number]['id'];

const keyOf = (group: string, figure: string) => `${group}:${figure}`;

/** Every figure's stored key. */
export function figureKeys(): string[] {
  return FIGURE_GROUPS.flatMap((g) => g.figures.map((f) => keyOf(g.id, f)));
}

type Choice =
  | { mode: 'page'; hidden: ReadonlySet<string> }
  /** In the dialog: `hidden` is the draft, and a figure draws as a row with a checkbox. */
  | {
      mode: 'list';
      hidden: ReadonlySet<string>;
      toggle(key: string): void;
    };

const ChoiceContext = createContext<Choice>({
  mode: 'page',
  hidden: new Set(),
});
const GroupContext = createContext<string>('');

/** What the figure `id` in the current group does here. */
export function useFigureSlot(id: string): {
  key: string;
  mode: 'page' | 'list';
  hidden: boolean;
  toggle(): void;
} {
  const choice = useContext(ChoiceContext);
  const group = useContext(GroupContext);
  const key = keyOf(group, id);
  return {
    key,
    mode: choice.mode,
    hidden: choice.hidden.has(key),
    toggle: () => {
      if (choice.mode === 'list') choice.toggle(key);
    },
  };
}

/**
 * A group of figures. On the page it draws `frame(children)` (the card), or
 * nothing when every one of its figures is hidden. In the choice dialog it is a
 * titled set of rows: `listChildren` where the page markup is not made of rows.
 */
export function FigureGroup({
  id,
  frame,
  listChildren,
  children,
}: {
  id: FigureGroupId;
  frame?(inner: ReactNode): ReactNode;
  listChildren?: ReactNode;
  children: ReactNode;
}): React.JSX.Element | null {
  const choice = useContext(ChoiceContext);
  const group = FIGURE_GROUPS.find((g) => g.id === id)!;
  if (choice.mode === 'list')
    return (
      <fieldset className="min-w-0 rounded-control border border-line px-3.5 pt-1 pb-2">
        <legend className="px-1.5 text-[13px] font-semibold text-text">
          {group.title}
        </legend>
        <GroupContext.Provider value={id}>
          {listChildren ?? children}
        </GroupContext.Provider>
      </fieldset>
    );
  if (group.figures.every((f) => choice.hidden.has(keyOf(id, f)))) return null;
  return (
    <GroupContext.Provider value={id}>
      {frame ? frame(children) : children}
    </GroupContext.Provider>
  );
}

/** One figure in the dialog: a checkbox, its label, and the value it shows now. */
export function ChoiceRow({
  figure,
  label,
  children,
}: {
  figure: string;
  label: ReactNode;
  /** The value, drawn as the page draws it. */
  children: ReactNode;
}): React.JSX.Element {
  const slot = useFigureSlot(figure);
  const labelId = useId();
  const valueId = useId();
  return (
    <label
      data-choice={slot.key}
      className="flex min-h-9 cursor-pointer items-center gap-2.5 border-b border-line/70 py-1.5 text-[13.5px] last:border-b-0 pointer-coarse:min-h-11"
    >
      <input
        type="checkbox"
        checked={!slot.hidden}
        onChange={slot.toggle}
        aria-labelledby={labelId}
        aria-describedby={valueId}
        className="size-4 flex-none accent-[var(--accent)]"
      />
      <span id={labelId} className="min-w-0 flex-1 text-muted">
        {label}
      </span>
      <span
        id={valueId}
        className="flex-none text-right font-semibold whitespace-nowrap tabular-nums text-text"
      >
        {children ?? <span className="font-medium text-faint">None</span>}
      </span>
    </label>
  );
}

/** The page's hidden figures, with a save that shows at once. */
export function useHiddenFigures(): ReadonlySet<string> {
  const prefs = usePrefs().data;
  const update = useUpdatePrefs();
  const pending = update.isPending
    ? update.variables?.overviewHidden
    : undefined;
  const hidden = pending ?? prefs?.overviewHidden;
  return new Set(hidden ?? []);
}

/** Draws the Overview's figures as the saved choice has them. */
export function ChoiceScope({
  children,
}: {
  children: ReactNode;
}): React.JSX.Element {
  const hidden = useHiddenFigures();
  return (
    <ChoiceContext.Provider value={{ mode: 'page', hidden }}>
      {children}
    </ChoiceContext.Provider>
  );
}

/**
 * "Choose figures": a dialog listing every figure with a checkbox and its value
 * now. `groups` are the Overview's own groups, drawn here as rows; Save keeps
 * the choice in the prefs, Cancel and Escape drop it.
 */
export function ChooseFigures({
  groups,
}: {
  groups: ReactNode;
}): React.JSX.Element {
  const saved = useHiddenFigures();
  const update = useUpdatePrefs();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<ReadonlySet<string>>(new Set());
  const [failed, setFailed] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);

  const toggle = (key: string) =>
    setDraft((d) => {
      const next = new Set(d);
      if (!next.delete(key)) next.add(key);
      return next;
    });

  return (
    <div className="flex justify-end">
      <button
        ref={trigger}
        type="button"
        onClick={() => {
          setDraft(new Set(saved));
          setFailed(false);
          setOpen(true);
        }}
        className={buttonClasses('secondary', 'sm')}
      >
        <SlidersHorizontal size={14} weight="bold" aria-hidden="true" />
        Choose figures
      </button>
      <MorphDialog
        open={open}
        onOpenChange={setOpen}
        origin={trigger}
        returnFocus={trigger}
        title="Choose figures"
        description="Tick the figures the Overview shows. Each shows its value now."
      >
        <ChoiceContext.Provider value={{ mode: 'list', hidden: draft, toggle }}>
          <div className="grid gap-4 sm:grid-cols-2">{groups}</div>
        </ChoiceContext.Provider>
        {failed ? (
          <p role="alert" className="mt-3 text-[13px] text-loss">
            Keel couldn&apos;t save this. Try again.
          </p>
        ) : null}
        <div className="sticky bottom-0 -mx-5 -mb-4 mt-4 flex justify-end gap-2 border-t border-line bg-surface-1 px-5 py-3">
          <Button variant="secondary" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={() =>
              update.mutate(
                { overviewHidden: [...draft] },
                {
                  onSuccess: () => setOpen(false),
                  onError: () => setFailed(true),
                },
              )
            }
          >
            Save
          </Button>
        </div>
      </MorphDialog>
    </div>
  );
}
