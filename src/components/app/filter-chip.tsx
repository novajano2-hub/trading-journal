'use client';

import type { Icon } from '@phosphor-icons/react';
import { CaretDown } from '@phosphor-icons/react/dist/ssr';
import { Popover } from 'radix-ui';
import { useId, useRef, useState, type ReactNode, type Ref } from 'react';

/** A white control on the canvas: a hairline edge, a breath of shadow, and a caret. */
const CHIP =
  'inline-flex h-8 max-w-52 flex-none items-center gap-1.5 rounded-control border pr-2.5 pl-3 text-[13.5px] whitespace-nowrap transition-[border-color,color] duration-200 ease-(--ease-glide) pointer-coarse:h-11 pointer-coarse:px-3.5';
const CHIP_LIVE =
  'border-line bg-surface-1 shadow-[0_1px_1px_rgb(18_22_51/0.04)] enabled:hover:border-accent/35 enabled:hover:text-text data-[state=open]:border-accent/35 data-[state=open]:text-text';
/** At rest the chip names its filter; once set, it reads as the value, in ink. */
const CHIP_IDLE = `${CHIP_LIVE} font-medium text-muted`;
const CHIP_ON = `${CHIP_LIVE} font-semibold text-text`;
const CHIP_UNAVAILABLE =
  'cursor-default border-dashed border-line-2 bg-transparent font-medium text-faint';

const PANEL =
  'z-50 flex max-h-[min(600px,var(--radix-popover-content-available-height))] max-w-[calc(100vw-24px)] origin-(--radix-popover-content-transform-origin) flex-col overflow-hidden rounded-[12px] border border-line bg-surface-1 text-text shadow-[var(--shadow)] outline-none motion-safe:data-[state=closed]:animate-tip-out motion-safe:data-[state=open]:animate-pop-in';

const ROW =
  'flex min-h-9 cursor-pointer items-center gap-2.5 rounded-[8px] px-2 py-1 text-[13.5px] text-text hover:bg-sunken pointer-coarse:min-h-11';
const BOX = 'size-4 flex-none cursor-pointer accent-accent';
const GROUP_LABEL = 'px-2 pt-2 pb-1 text-[12px] font-medium text-faint';

/**
 * A text or date field inside a filter popover. Its focus ring hugs the
 * border: the global 3px offset would run into the popover's edge. Marked
 * important to beat that global rule, which sits outside Tailwind's layers.
 */
export const FIELD =
  'h-9 w-full min-w-0 rounded-[8px] border border-line-2 bg-surface-1 px-2 text-text focus-visible:outline-offset-0! pointer-coarse:h-11';

/**
 * One chip and its popover. Enter or Space opens it, Escape closes it, and
 * focus goes back to the chip. While `disabled` it is the same chip, inert.
 * With `unavailableNote` it keeps its tab stop, reads faint and opens nothing.
 */
export function FilterChip({
  label,
  title,
  active,
  disabled,
  unavailableNote,
  onClear,
  triggerRef,
  wide = false,
  icon: Lead,
  alwaysSet = false,
  children,
}: {
  label: string;
  /** The popover's name, and the chip's description while it shows a value. */
  title: string;
  active: boolean;
  disabled?: boolean;
  /** The id of a note saying why there is nothing to filter. */
  unavailableNote?: string;
  onClear(): void;
  triggerRef?: Ref<HTMLButtonElement>;
  /** Room for a pair of date fields side by side. */
  wide?: boolean;
  /** A glyph before the label, in the accent. */
  icon?: Icon;
  /**
   * The label is always a value (the date range in force, "All time" at
   * rest), so the chip reads as set even when nothing is filtered.
   */
  alwaysSet?: boolean;
  children(close: () => void): ReactNode;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const descId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const look = `${CHIP} ${active || alwaysSet ? CHIP_ON : CHIP_IDLE}`;
  const lead = (faint: boolean) =>
    Lead ? (
      <Lead
        size={15}
        aria-hidden="true"
        className={`flex-none ${faint ? '' : 'text-accent-ink'}`}
      />
    ) : null;
  const caret = (
    <CaretDown size={13} aria-hidden="true" className="flex-none text-faint" />
  );
  const text = <span className="min-w-0 truncate">{label}</span>;

  const titleNote = active ? (
    <span id={descId} hidden>
      {title}
    </span>
  ) : null;

  // Going inert closes the popover, so it doesn't reopen by itself later.
  if ((disabled || unavailableNote) && open) setOpen(false);
  if (disabled) {
    return (
      <button type="button" disabled aria-haspopup="dialog" className={look}>
        {lead(false)}
        {text}
        {caret}
      </button>
    );
  }
  if (unavailableNote) {
    return (
      <>
        <button
          ref={triggerRef}
          type="button"
          aria-disabled="true"
          aria-describedby={
            active ? `${descId} ${unavailableNote}` : unavailableNote
          }
          className={`${CHIP} ${CHIP_UNAVAILABLE}`}
        >
          {lead(true)}
          {text}
        </button>
        {titleNote}
      </>
    );
  }

  const close = () => setOpen(false);
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        ref={triggerRef}
        aria-describedby={active ? descId : undefined}
        className={look}
      >
        {lead(false)}
        {text}
        {caret}
      </Popover.Trigger>
      {titleNote}
      <Popover.Portal>
        <Popover.Content
          ref={panel}
          aria-label={title}
          align="start"
          sideOffset={6}
          collisionPadding={12}
          onOpenAutoFocus={(e) => {
            // A single choice opens on the chosen option, as a radio group does.
            const chosen = panel.current?.querySelector<HTMLInputElement>(
              'input[type="radio"]:checked',
            );
            if (chosen) {
              e.preventDefault();
              chosen.focus();
            }
          }}
          className={`${PANEL} ${wide ? 'w-[300px]' : 'w-64'}`}
        >
          <div className="min-h-0 overflow-y-auto p-1.5">{children(close)}</div>
          <div className="flex flex-none justify-end border-t border-line p-1.5">
            <button
              type="button"
              disabled={!active}
              onClick={() => {
                onClear();
                close();
              }}
              className="h-8 rounded-[8px] px-2.5 text-[13px] font-semibold text-accent-ink transition-colors duration-200 enabled:hover:bg-accent-soft disabled:text-faint disabled:opacity-60 pointer-coarse:h-11"
            >
              Clear
            </button>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

/** A single choice: native radios, so arrow keys move through them. */
export function RadioRows<T extends string>({
  legend,
  options,
  value,
  onChange,
}: {
  legend: string;
  options: readonly { value: T; label: string }[];
  value: T | undefined;
  onChange(value: T): void;
}): React.JSX.Element {
  const name = useId();
  return (
    <fieldset className="flex flex-col">
      <legend className="sr-only">{legend}</legend>
      {options.map((o) => (
        <label key={o.value} className={ROW}>
          <input
            type="radio"
            name={name}
            checked={o.value === value}
            onChange={() => onChange(o.value)}
            className={BOX}
          />
          {o.label}
        </label>
      ))}
    </fieldset>
  );
}

/** Any number of choices, as checkboxes. The legend shows when it names a group of several. */
export function CheckRows({
  legend,
  legendVisible = false,
  items,
  selected,
  onToggle,
}: {
  legend: string;
  legendVisible?: boolean;
  items: readonly { id: string; label: ReactNode }[];
  selected: readonly string[];
  onToggle(id: string): void;
}): React.JSX.Element {
  return (
    <fieldset className="flex flex-col">
      <legend className={legendVisible ? GROUP_LABEL : 'sr-only'}>
        {legend}
      </legend>
      {items.map((item) => (
        <label key={item.id} className={ROW}>
          <input
            type="checkbox"
            checked={selected.includes(item.id)}
            onChange={() => onToggle(item.id)}
            className={BOX}
          />
          {item.label}
        </label>
      ))}
    </fieldset>
  );
}
