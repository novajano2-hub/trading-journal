'use client';

import { Popover } from 'radix-ui';
import { useId, useRef, useState, type ReactNode, type Ref } from 'react';

const CHIP =
  'inline-flex h-[30px] max-w-48 flex-none items-center rounded-chip border px-[9px] text-[12.5px] whitespace-nowrap transition-colors duration-120 pointer-coarse:h-11 pointer-coarse:px-3';
const CHIP_IDLE =
  'border-line bg-surface-1 text-muted enabled:hover:border-line-2 enabled:hover:text-text data-[state=open]:border-line-2 data-[state=open]:text-text';
const CHIP_ON = 'border-accent-soft bg-accent-soft text-accent-ink';

const PANEL =
  'z-50 flex max-h-[min(600px,var(--radix-popover-content-available-height))] max-w-[calc(100vw-24px)] origin-(--radix-popover-content-transform-origin) flex-col rounded-control border border-line-2 bg-surface-1 text-text shadow-[var(--shadow-chip)] outline-none motion-safe:data-[state=closed]:animate-tip-out motion-safe:data-[state=open]:animate-pop-in';

const ROW =
  'flex min-h-9 cursor-pointer items-center gap-2.5 rounded-chip px-2 py-1 text-sm text-text hover:bg-sunken pointer-coarse:min-h-11';
const BOX = 'size-4 flex-none cursor-pointer accent-accent';
const GROUP_LABEL = 'px-2 pt-2 pb-1 text-xs text-faint';

/** A text or date field inside a filter popover. */
export const FIELD =
  'h-9 w-full min-w-0 rounded-control border border-line-2 bg-surface-1 px-2 text-text pointer-coarse:h-11';

/**
 * One chip and its popover. Enter or Space opens it, Escape closes it, and
 * focus goes back to the chip. While `disabled` it is the same chip, inert.
 */
export function FilterChip({
  label,
  title,
  active,
  disabled,
  onClear,
  triggerRef,
  wide = false,
  children,
}: {
  label: string;
  /** The popover's name, and the chip's description while it shows a value. */
  title: string;
  active: boolean;
  disabled?: boolean;
  onClear(): void;
  triggerRef?: Ref<HTMLButtonElement>;
  /** Room for a pair of date fields side by side. */
  wide?: boolean;
  children(close: () => void): ReactNode;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const descId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const look = `${CHIP} ${active ? CHIP_ON : CHIP_IDLE}`;
  const text = <span className="min-w-0 truncate">{label}</span>;

  // Going inert closes the popover, so it doesn't reopen by itself later.
  if (disabled && open) setOpen(false);
  if (disabled) {
    return (
      <button type="button" disabled aria-haspopup="dialog" className={look}>
        {text}
      </button>
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
        {text}
      </Popover.Trigger>
      {active ? (
        <span id={descId} hidden>
          {title}
        </span>
      ) : null}
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
              className="h-8 rounded-chip px-2.5 text-[13px] font-medium text-muted transition-colors duration-120 enabled:hover:bg-sunken enabled:hover:text-text disabled:opacity-50 pointer-coarse:h-11"
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
