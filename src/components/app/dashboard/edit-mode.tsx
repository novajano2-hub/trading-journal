'use client';

// Edit mode of a dashboard template (spec 5.1, C2, C3, C6, C8, comp 02): the
// bar that replaces the top bar, the page of widget bars and add places
// (wide screens), and the full-height sheet of two lists (a phone). All three
// work on the draft the edit session holds; nothing is stored until Save.
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  DotsSixVertical,
  Plus,
  Trash,
  X,
} from '@phosphor-icons/react/dist/ssr';
import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from 'react';
import { Button } from '@/components/ui/button';
import { MorphDialog } from '@/components/ui/morph-dialog';
import { WIDGET_TITLES } from '@/content/dashboard-widgets';
import {
  addWidget,
  missingFrom,
  moveWidget,
  removeWidget,
  UPPER_LIMIT,
} from '@/domain/dashboard/templates';
import {
  isWidgetKey,
  WIDGETS,
  type WidgetSection,
} from '@/domain/dashboard/widgets';
import type { DashTemplate, WidgetKey, WidgetRef } from '@/domain/types';
import { usePhone } from '@/lib/use-phone';
import { useBarHeight } from '../use-bar-height';
import {
  NAME_LIMIT,
  useDashboardEdit,
  type DashboardEdit,
  type EditSession,
} from './edit-session';
import { WidgetPicker } from './widget-picker';
import { LowerGrid, UpperStrip, WidgetCell } from './widgets/layout';

const SECTIONS: Record<
  WidgetSection,
  { name: string; label: string; note: string }
> = {
  upper: {
    name: 'Upper section',
    label: 'Upper section widgets',
    note: 'Up to 5 figures',
  },
  lower: {
    name: 'Lower section',
    label: 'Lower section widgets',
    note: 'Charts, lists and calendars',
  },
};

const NAME_ERROR = `Name the template, up to ${NAME_LIMIT} characters.`;
const CONFLICT =
  'This template was changed somewhere else since you opened it. Save again to replace it with your version, or Cancel to keep the other one.';
const SAVE_ERROR = "Couldn't save the template. Try again.";

/** What a widget is called on its bar; a key this build does not know keeps its place as an unknown one. */
function titleOf(ref: WidgetRef): string {
  return isWidgetKey(ref.key) ? WIDGET_TITLES[ref.key] : 'Unknown widget';
}

/** A widget of the lower section that takes two thirds of the row (C4). */
function isWide(ref: WidgetRef): boolean {
  return isWidgetKey(ref.key) && WIDGETS[ref.key].size === 'wide';
}

/** The upper section's note: how many places it has left. */
function upperNote(count: number): string {
  const left = UPPER_LIMIT - count;
  return left <= 0
    ? `${SECTIONS.upper.note}; this one is full`
    : `${SECTIONS.upper.note}; ${left} ${left === 1 ? 'place' : 'places'} left`;
}

// ---------------------------------------------------------------------------
// What the controls do

interface DragState {
  section: WidgetSection;
  from: number;
  over: number;
}

/** The index of the widget bar under a point, if it is of `section`. */
function itemAt(
  x: number,
  y: number,
  section: WidgetSection,
): number | undefined {
  const el = document
    .elementFromPoint(x, y)
    ?.closest<HTMLElement>('[data-edit-item]');
  if (!el || el.dataset.section !== section) return undefined;
  const i = Number(el.dataset.index);
  return Number.isInteger(i) ? i : undefined;
}

/** The nearest ancestor that scrolls, else the window. */
function scrollerOf(el: HTMLElement | null): HTMLElement | Window {
  for (let n = el?.parentElement; n; n = n.parentElement) {
    const overflow = getComputedStyle(n).overflowY;
    if (
      (overflow === 'auto' || overflow === 'scroll') &&
      n.scrollHeight > n.clientHeight
    )
      return n;
  }
  return window;
}

/**
 * The moves of edit mode, on the draft: the arrows (C3), a drag by the grip,
 * and Remove. After each, focus stays where the keyboard was, and a polite
 * line says where the widget went.
 */
function useEditActions(
  edit: DashboardEdit,
  draft: DashTemplate,
  root: RefObject<HTMLElement | null>,
) {
  const [said, setSaid] = useState('');
  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef = useRef(drag);
  useLayoutEffect(() => {
    dragRef.current = drag;
  });
  const pointer = useRef({ x: 0, y: 0 });
  // Where focus goes once the draft has been redrawn.
  const after = useRef<(() => HTMLElement | null) | null>(null);

  useLayoutEffect(() => {
    const find = after.current;
    if (!find) return;
    after.current = null;
    find()?.focus();
  });

  const itemEl = (section: WidgetSection, key: string) =>
    [
      ...(root.current?.querySelectorAll<HTMLElement>('[data-edit-item]') ??
        []),
    ].find((el) => el.dataset.section === section && el.dataset.key === key) ??
    null;
  // The section's add place, or its heading when there is none (a full upper section).
  const placeEl = (section: WidgetSection) =>
    root.current?.querySelector<HTMLElement>(`[data-edit-slot="${section}"]`) ??
    root.current?.querySelector<HTMLElement>(
      `[data-edit-heading="${section}"]`,
    ) ??
    null;

  const move = (section: WidgetSection, index: number, delta: -1 | 1) => {
    const refs = draft[section];
    const ref = refs[index];
    const to = index + delta;
    if (!ref || to < 0 || to >= refs.length) return;
    edit.change((t) => moveWidget(t, section, index, to));
    after.current = () =>
      itemEl(section, ref.key)?.querySelector<HTMLElement>(
        `[data-action="${delta < 0 ? 'earlier' : 'later'}"]`,
      ) ?? null;
    setSaid(
      `${titleOf(ref)} moved to place ${to + 1} of ${refs.length} in the ${section} section.`,
    );
  };

  const remove = (section: WidgetSection, index: number) => {
    const refs = draft[section];
    const ref = refs[index];
    if (!ref) return;
    edit.change((t) => removeWidget(t, section, index));
    const next = refs[index + 1] ?? refs[index - 1];
    after.current = () =>
      (next &&
        itemEl(section, next.key)?.querySelector<HTMLElement>(
          '[data-action="remove"]',
        )) ||
      placeEl(section);
    setSaid(`${titleOf(ref)} removed from the ${section} section.`);
  };

  const add = (section: WidgetSection, key: WidgetKey) => {
    edit.change((t) => addWidget(t, section, { key }));
    setSaid(`${WIDGET_TITLES[key]} added to the ${section} section.`);
  };

  const finish = (commit: boolean) => {
    const d = dragRef.current;
    setDrag(null);
    if (!commit || !d || d.over === d.from) return;
    const ref = draft[d.section][d.from];
    if (!ref) return;
    edit.change((t) => moveWidget(t, d.section, d.from, d.over));
    after.current = () =>
      itemEl(d.section, ref.key)?.querySelector<HTMLElement>(
        '[data-action="earlier"]',
      ) ?? null;
    setSaid(
      `${titleOf(ref)} moved to place ${d.over + 1} of ${draft[d.section].length} in the ${d.section} section.`,
    );
  };

  // While a drag is on: Escape drops it, and the page scrolls when the pointer is near an edge.
  const dragging = drag !== null;
  useEffect(() => {
    if (!dragging) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDrag(null);
    };
    document.addEventListener('keydown', onKey);
    const scroller = scrollerOf(root.current);
    let frame = 0;
    const tick = () => {
      const d = dragRef.current;
      if (d) {
        const box =
          scroller instanceof Window
            ? { top: 0, bottom: window.innerHeight }
            : scroller.getBoundingClientRect();
        const y = pointer.current.y;
        const dy = y < box.top + 72 ? -14 : y > box.bottom - 72 ? 14 : 0;
        if (dy !== 0) {
          scroller.scrollBy?.(0, dy);
          const over = itemAt(pointer.current.x, y, d.section);
          if (over !== undefined && over !== d.over) setDrag({ ...d, over });
        }
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      document.removeEventListener('keydown', onKey);
      cancelAnimationFrame(frame);
    };
  }, [dragging, root]);

  /** Pointer handlers for the grip of the widget at `index` (C3). */
  const grip = (section: WidgetSection, index: number) => ({
    onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.currentTarget.setPointerCapture?.(e.pointerId);
      pointer.current = { x: e.clientX, y: e.clientY };
      setDrag({ section, from: index, over: index });
    },
    onPointerMove: (e: React.PointerEvent<HTMLElement>) => {
      const d = dragRef.current;
      if (!d || d.section !== section || d.from !== index) return;
      pointer.current = { x: e.clientX, y: e.clientY };
      const over = itemAt(e.clientX, e.clientY, section);
      if (over !== undefined && over !== d.over) setDrag({ ...d, over });
    },
    onPointerUp: () => finish(true),
    onPointerCancel: () => finish(false),
  });

  return { said, drag, move, remove, add, grip };
}

type Actions = ReturnType<typeof useEditActions>;

// ---------------------------------------------------------------------------
// The parts

const ICON_BUTTON =
  'inline-flex size-[30px] flex-none items-center justify-center rounded-[8px] text-muted hover:bg-surface-1 hover:text-text focus-visible:outline-2 focus-visible:outline-accent aria-disabled:opacity-40 aria-disabled:hover:bg-transparent aria-disabled:hover:text-muted pointer-coarse:size-11';

const SLOT =
  'flex flex-col items-center justify-center gap-1.5 rounded-card border-[1.5px] border-dashed border-line-2 bg-transparent text-[13.5px] font-semibold text-muted transition-colors duration-200 ease-(--ease-glide) hover:border-accent/45 hover:bg-accent-soft/50 hover:text-accent-ink focus-visible:outline-2 focus-visible:outline-accent';

/** What a widget's card is while the bar is over it: a few ghost lines, dimmed. */
function Ghost({
  section,
  wide,
}: {
  section: WidgetSection;
  wide: boolean;
}): React.JSX.Element {
  return (
    <div
      data-edit-body
      aria-hidden="true"
      className="pointer-events-none px-3.5 pt-3 pb-3.5 opacity-55"
    >
      {section === 'upper' ? (
        <>
          <div className="mt-2 h-2.5 w-3/5 rounded-[5px] bg-sunken" />
          <div className="mt-2 h-2.5 w-2/5 rounded-[5px] bg-sunken" />
        </>
      ) : (
        <div
          className={`rounded-control bg-sunken ${wide ? 'h-[120px]' : 'h-[110px]'}`}
        />
      )}
    </div>
  );
}

/**
 * One widget in edit mode: its bar (grip, Move earlier, Move later, Remove) and,
 * on a wide screen, its dimmed body (a card); on a phone only the bar (a row).
 * The arrows point sideways over cards and up and down over rows.
 */
function EditItem({
  variant,
  section,
  index,
  count,
  wref,
  actions,
}: {
  variant: 'card' | 'row';
  section: WidgetSection;
  index: number;
  count: number;
  wref: WidgetRef;
  actions: Actions;
}): React.JSX.Element {
  const title = titleOf(wref);
  const wide = section === 'lower' && isWide(wref);
  const { drag } = actions;
  const dragging = drag?.section === section && drag.from === index;
  const target =
    drag?.section === section && drag.over === index && drag.from !== index;
  const Earlier = variant === 'row' ? ArrowUp : ArrowLeft;
  const Later = variant === 'row' ? ArrowDown : ArrowRight;
  const Item = variant === 'row' ? 'li' : 'section';
  const move = (delta: -1 | 1) => actions.move(section, index, delta);
  return (
    <Item
      aria-label={title}
      data-edit-item=""
      data-section={section}
      data-index={index}
      data-key={wref.key}
      data-dragging={dragging ? 'true' : undefined}
      data-drop={target ? 'true' : undefined}
      className={`relative min-w-0 overflow-hidden border border-line bg-surface-1 ${
        variant === 'row'
          ? 'rounded-control shadow-[var(--shadow-chip)]'
          : 'rounded-card shadow-[var(--shadow-card)]'
      } ${dragging ? 'shadow-[var(--shadow)] outline-2 outline-offset-2 outline-accent' : ''} ${
        target ? 'outline-2 outline-offset-2 outline-dashed outline-accent' : ''
      }`}
    >
      <div
        className={`flex items-center gap-1.5 pr-2 pl-2.5 ${
          variant === 'row'
            ? 'h-12'
            : 'h-10 border-b border-line bg-sunken/60 pointer-coarse:h-12'
        }`}
      >
        <span
          data-edit-grip=""
          aria-hidden="true"
          title="Drag to move"
          {...actions.grip(section, index)}
          className="grid w-[22px] flex-none cursor-grab touch-none place-items-center self-stretch text-faint select-none active:cursor-grabbing"
        >
          <DotsSixVertical size={16} />
        </span>
        <b
          title={title}
          className={`min-w-0 flex-1 truncate font-semibold ${variant === 'row' ? 'text-[14px]' : 'text-[13.5px]'}`}
        >
          {title}
        </b>
        <button
          type="button"
          data-action="earlier"
          aria-label={`Move ${title} earlier`}
          title="Move earlier"
          aria-disabled={index === 0 ? 'true' : undefined}
          onClick={() => move(-1)}
          className={ICON_BUTTON}
        >
          <Earlier size={15} aria-hidden="true" />
        </button>
        <button
          type="button"
          data-action="later"
          aria-label={`Move ${title} later`}
          title="Move later"
          aria-disabled={index === count - 1 ? 'true' : undefined}
          onClick={() => move(1)}
          className={ICON_BUTTON}
        >
          <Later size={15} aria-hidden="true" />
        </button>
        <button
          type="button"
          data-action="remove"
          aria-label={`Remove ${title}`}
          title="Remove"
          onClick={() => actions.remove(section, index)}
          className={ICON_BUTTON}
        >
          <X size={15} aria-hidden="true" />
        </button>
      </div>
      {variant === 'card' ? <Ghost section={section} wide={wide} /> : null}
    </Item>
  );
}

/** Keys that stay with a widget as the list changes; a repeated one (a corrupt template) is told apart. */
function keysOf(refs: readonly WidgetRef[]): string[] {
  const seen = new Map<string, number>();
  return refs.map((r) => {
    const n = seen.get(r.key) ?? 0;
    seen.set(r.key, n + 1);
    return n === 0 ? r.key : `${r.key}#${n}`;
  });
}

/** The notes Save leaves: a blank name, a template changed elsewhere, a write that failed. */
function EditNotes({ session }: { session: EditSession }) {
  const note = 'text-[13px] leading-[1.5] text-loss';
  return (
    <>
      {session.nameError ? (
        <p role="alert" id={NAME_ERROR_ID} className={note}>
          {NAME_ERROR}
        </p>
      ) : null}
      {session.conflict ? (
        <p role="alert" className="text-[13px] leading-[1.5] text-text">
          {CONFLICT}
        </p>
      ) : null}
      {session.saveError ? (
        <p role="alert" className={note}>
          {SAVE_ERROR}
        </p>
      ) : null}
    </>
  );
}

const NAME_ERROR_ID = 'dashboard-edit-name-error';

/** The name field: takes focus when edit mode opens and when Save finds it blank. */
function NameField({
  edit,
  session,
  id,
  focusOnOpen,
  className,
}: {
  edit: DashboardEdit;
  session: EditSession;
  id: string;
  focusOnOpen: boolean;
  className: string;
}): React.JSX.Element {
  const field = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!focusOnOpen) return;
    field.current?.focus();
    field.current?.select();
  }, [focusOnOpen]);
  const { nameError } = session;
  useEffect(() => {
    if (nameError) field.current?.focus();
  }, [nameError]);
  return (
    <input
      ref={field}
      id={id}
      value={session.draft.name}
      maxLength={NAME_LIMIT}
      autoComplete="off"
      aria-invalid={nameError || undefined}
      aria-describedby={nameError ? NAME_ERROR_ID : undefined}
      onChange={(e) => edit.rename(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') void edit.save();
      }}
      className={className}
    />
  );
}

// ---------------------------------------------------------------------------
// The bar over a wide screen

/**
 * Edit mode's bar, which replaces the top bar on a wide screen (comp 02):
 * the name field, the move hint, Delete template (not on the last template),
 * Cancel and Save template. There is no reset: TradeZella has none.
 */
export function EditBar({
  edit,
  session,
}: {
  edit: DashboardEdit;
  session: EditSession;
}): React.JSX.Element {
  const fieldId = useId();
  const bar = useRef<HTMLElement>(null);
  useBarHeight(bar);
  return (
    <header
      ref={bar}
      data-pinned=""
      aria-label="Editing a dashboard template"
      className="sticky top-0 z-30 flex min-h-[68px] flex-wrap items-center gap-x-2.5 gap-y-1 bg-bg px-5 max-xl:py-2"
    >
      <h1 className="sr-only">Edit dashboard template</h1>
      <div className="flex items-center gap-2.5">
        <label htmlFor={fieldId} className="text-[13px] font-medium text-muted">
          Template name
        </label>
        <NameField
          edit={edit}
          session={session}
          id={fieldId}
          focusOnOpen
          className="h-[34px] w-[220px] rounded-control border border-line bg-surface-1 px-3 text-[14px] font-semibold text-text focus-visible:outline-2 focus-visible:outline-accent aria-invalid:border-loss pointer-coarse:h-11"
        />
      </div>
      <p className="text-[13px] text-muted max-xl:order-last max-xl:basis-full">
        Drag a widget, or use its arrows, to move it.
      </p>
      <div className="ml-auto flex items-center gap-2">
        {session.canDelete ? (
          <Button variant="ghost" onClick={edit.askDelete}>
            <Trash size={16} aria-hidden="true" />
            Delete template
          </Button>
        ) : null}
        <Button variant="secondary" onClick={edit.cancel}>
          Cancel
        </Button>
        <Button
          aria-busy={session.saving || undefined}
          onClick={() => void edit.save()}
        >
          Save template
        </Button>
      </div>
    </header>
  );
}

// ---------------------------------------------------------------------------
// The page over a wide screen

type Picking = { section: WidgetSection; origin: HTMLElement };

/**
 * Opens the picker from a place and puts focus somewhere that exists when it
 * closes: the place itself if it is still there (the upper strip's last one
 * goes with the fifth widget), else the section's heading.
 */
function usePicker(root: RefObject<HTMLElement | null>) {
  const [picking, setPicking] = useState<Picking | null>(null);
  const origin = useMemo<RefObject<HTMLElement | null>>(
    () => ({ current: picking?.origin ?? null }),
    [picking],
  );
  const returnFocus = useMemo<RefObject<HTMLElement | null>>(
    () => ({
      get current() {
        if (!picking) return null;
        if (picking.origin.isConnected) return picking.origin;
        return (
          root.current?.querySelector<HTMLElement>(
            `[data-edit-heading="${picking.section}"]`,
          ) ?? null
        );
      },
      set current(_) {},
    }),
    [picking, root],
  );
  return { picking, setPicking, origin, returnFocus };
}

function SectionHead({
  section,
  note,
}: {
  section: WidgetSection;
  note: string;
}): React.JSX.Element {
  return (
    <div className="mt-1 flex flex-wrap items-baseline gap-x-2.5">
      <h2
        tabIndex={-1}
        data-edit-heading={section}
        className="text-[15px] font-semibold outline-none"
      >
        {SECTIONS[section].name}
      </h2>
      <span className="text-[12.5px] text-faint">{note}</span>
    </div>
  );
}

/**
 * Edit mode's page on a wide screen (comp 02): the template's two sections as
 * the page lays them out, each widget a bar over a dimmed body, the dashed
 * places to add one, and the picker. The widgets themselves are not drawn
 * while editing.
 */
export function EditSurface({
  edit,
  session,
}: {
  edit: DashboardEdit;
  session: EditSession;
}): React.JSX.Element {
  const root = useRef<HTMLDivElement>(null);
  const { draft } = session;
  const actions = useEditActions(edit, draft, root);
  const { picking, setPicking, origin, returnFocus } = usePicker(root);
  const upperRoom =
    UPPER_LIMIT - draft.upper.length > 0 &&
    missingFrom(draft, 'upper').length > 0;
  const upperKeys = keysOf(draft.upper);
  const lowerKeys = keysOf(draft.lower);
  const open = (section: WidgetSection) => (e: React.MouseEvent<HTMLElement>) =>
    setPicking({ section, origin: e.currentTarget });
  return (
    <div
      ref={root}
      data-testid="dashboard-edit"
      className={`flex min-w-0 flex-col gap-4 px-5 pt-1 pb-5 lg:pt-0 ${actions.drag ? 'cursor-grabbing select-none' : ''}`}
    >
      <p role="status" className="sr-only">
        {actions.said}
      </p>
      <EditNotes session={session} />
      <SectionHead section="upper" note={upperNote(draft.upper.length)} />
      <UpperStrip label={SECTIONS.upper.label}>
        {draft.upper.map((wref, i) => (
          <WidgetCell key={upperKeys[i]} stretch={false}>
            <EditItem
              variant="card"
              section="upper"
              index={i}
              count={draft.upper.length}
              wref={wref}
              actions={actions}
            />
          </WidgetCell>
        ))}
        {upperRoom
          ? Array.from({ length: UPPER_LIMIT - draft.upper.length }, (_, i) => (
              <button
                key={`slot-${i}`}
                type="button"
                aria-haspopup="dialog"
                data-edit-slot="upper"
                onClick={open('upper')}
                className={`${SLOT} min-h-[128px]`}
              >
                <Plus size={18} aria-hidden="true" />
                Add a widget
                <small className="text-[12px] font-normal text-faint">
                  Upper section
                </small>
              </button>
            ))
          : null}
      </UpperStrip>
      <SectionHead section="lower" note={SECTIONS.lower.note} />
      <div role="group" aria-label={SECTIONS.lower.label}>
        <LowerGrid>
          {draft.lower.map((wref, i) => (
            <WidgetCell key={lowerKeys[i]} wide={isWide(wref)} stretch={false}>
              <EditItem
                variant="card"
                section="lower"
                index={i}
                count={draft.lower.length}
                wref={wref}
                actions={actions}
              />
            </WidgetCell>
          ))}
          {missingFrom(draft, 'lower').length > 0 ? (
            <button
              type="button"
              aria-haspopup="dialog"
              data-edit-slot="lower"
              onClick={open('lower')}
              className={`${SLOT} min-h-[150px]`}
            >
              <Plus size={18} aria-hidden="true" />
              Add a widget
              <small className="text-[12px] font-normal text-faint">
                Lower section
              </small>
            </button>
          ) : null}
        </LowerGrid>
      </div>
      {picking ? (
        <WidgetPicker
          section={picking.section}
          template={draft}
          origin={origin}
          returnFocus={returnFocus}
          onAdd={(key) => actions.add(picking.section, key)}
          onClose={() => setPicking(null)}
        />
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The sheet on a phone

/** One section of the sheet: its rows, then its add row. */
function SheetSection({
  section,
  draft,
  actions,
  onAdd,
}: {
  section: WidgetSection;
  draft: DashTemplate;
  actions: Actions;
  onAdd(e: React.MouseEvent<HTMLElement>): void;
}): React.JSX.Element {
  const refs = draft[section];
  const keys = keysOf(refs);
  const headId = useId();
  const room =
    (section === 'lower' || refs.length < UPPER_LIMIT) &&
    missingFrom(draft, section).length > 0;
  return (
    <section aria-labelledby={headId} className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline gap-x-2.5">
        <h3
          id={headId}
          tabIndex={-1}
          data-edit-heading={section}
          className="text-[15px] font-semibold outline-none"
        >
          {SECTIONS[section].name}
        </h3>
        <span className="text-[12.5px] text-faint">
          {section === 'upper' ? upperNote(refs.length) : SECTIONS.lower.note}
        </span>
      </div>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {refs.map((wref, i) => (
          <EditItem
            key={keys[i]}
            variant="row"
            section={section}
            index={i}
            count={refs.length}
            wref={wref}
            actions={actions}
          />
        ))}
      </ul>
      {room ? (
        <button
          type="button"
          aria-haspopup="dialog"
          data-edit-slot={section}
          onClick={onAdd}
          className={`${SLOT} min-h-[84px] py-3`}
        >
          <Plus size={18} aria-hidden="true" />
          Add a widget
          <small className="text-[12px] font-normal text-faint">
            {SECTIONS[section].name}
          </small>
        </button>
      ) : null}
    </section>
  );
}

function Sheet({
  edit,
  session,
}: {
  edit: DashboardEdit;
  session: EditSession;
}): React.JSX.Element {
  const root = useRef<HTMLDivElement>(null);
  const fieldId = useId();
  const { draft } = session;
  const actions = useEditActions(edit, draft, root);
  const { picking, setPicking, origin, returnFocus } = usePicker(root);
  const open = (section: WidgetSection) => (e: React.MouseEvent<HTMLElement>) =>
    setPicking({ section, origin: e.currentTarget });
  return (
    <>
      <MorphDialog
        open
        onOpenChange={(next) => {
          if (!next) edit.cancel();
        }}
        origin={edit.anchor}
        returnFocus={edit.anchor}
        title="Edit template"
        size="sheet"
        footer={
          <div className="flex flex-col gap-2">
            <EditNotes session={session} />
            <Button
              className="h-11 w-full text-[15px]"
              aria-busy={session.saving || undefined}
              onClick={() => void edit.save()}
            >
              Save template
            </Button>
            <Button
              variant="secondary"
              className="h-11 w-full text-[15px]"
              onClick={edit.cancel}
            >
              Cancel
            </Button>
            {session.canDelete ? (
              <Button
                variant="ghost"
                className="h-11 w-full"
                onClick={edit.askDelete}
              >
                <Trash size={16} aria-hidden="true" />
                Delete template
              </Button>
            ) : null}
          </div>
        }
      >
        <div ref={root} className="flex flex-col gap-5 pt-3 pb-2">
          <p role="status" className="sr-only">
            {actions.said}
          </p>
          <div className="rounded-card border border-line bg-surface-1 px-4 py-3.5 shadow-[var(--shadow-card)]">
            <label
              htmlFor={fieldId}
              className="mb-1.5 block text-[13px] font-medium text-muted"
            >
              Template name
            </label>
            <NameField
              edit={edit}
              session={session}
              id={fieldId}
              focusOnOpen={false}
              className="h-11 w-full rounded-control border border-line bg-surface-1 px-3 text-[15px] font-semibold text-text focus-visible:outline-2 focus-visible:outline-accent aria-invalid:border-loss"
            />
          </div>
          <SheetSection
            section="upper"
            draft={draft}
            actions={actions}
            onAdd={open('upper')}
          />
          <SheetSection
            section="lower"
            draft={draft}
            actions={actions}
            onAdd={open('lower')}
          />
        </div>
      </MorphDialog>
      {picking ? (
        <WidgetPicker
          section={picking.section}
          template={draft}
          origin={origin}
          returnFocus={returnFocus}
          onAdd={(key) => actions.add(picking.section, key)}
          onClose={() => setPicking(null)}
        />
      ) : null}
    </>
  );
}

/**
 * Edit mode on a phone: a full-height sheet of two lists, each row with
 * Move up, Move down and Remove, an add row opening the picker, and Save,
 * Cancel and Delete at the foot. Mount it once, beside the page.
 */
export function EditSheet(): React.JSX.Element | null {
  const edit = useDashboardEdit();
  const phone = usePhone();
  if (!edit?.session || !phone) return null;
  return <Sheet edit={edit} session={edit.session} />;
}
