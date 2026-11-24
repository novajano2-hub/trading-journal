'use client';

import { CaretDown, Check } from '@phosphor-icons/react/dist/ssr';
import { DropdownMenu } from 'radix-ui';

export interface MenuSelectOption {
  value: string;
  label: string;
}

/** The field look: a 32px control, its caret trailing, the hairline firming on hover and while open. */
export const MENU_SELECT_FIELD =
  'inline-flex h-8 max-w-48 min-w-0 cursor-pointer items-center gap-1.5 rounded-control border border-line bg-surface-1 pr-2 pl-2.5 text-[13.5px] font-medium text-text transition-[border-color] duration-200 ease-(--ease-glide) hover:border-accent/35 data-[state=open]:border-accent/35 disabled:cursor-default disabled:opacity-60 pointer-coarse:h-11';

const ITEM =
  'relative flex min-h-9 cursor-pointer items-center rounded-[8px] py-1.5 pr-3 pl-8 text-[13.5px] text-text select-none data-highlighted:bg-sunken data-disabled:cursor-default data-disabled:text-faint pointer-coarse:min-h-11';

/**
 * A single choice from a short list, as the app's dropdown (the account
 * switcher's and the Display menu's Radix menu) and not a native select, so
 * its list wears the app's own surface. The button's name is the label and the
 * choice ("Cross-analyse by, Side"). Enter, Space or the arrow keys open it,
 * the arrows and typing move, Enter picks and closes, Escape closes with focus
 * back on the button.
 */
export function MenuSelect({
  label,
  value,
  onChange,
  options,
  disabled = false,
  align = 'start',
  triggerClassName = MENU_SELECT_FIELD,
}: {
  /** The control's name, spoken before the choice. */
  label: string;
  value: string;
  onChange(value: string): void;
  options: readonly MenuSelectOption[];
  disabled?: boolean;
  align?: 'start' | 'end';
  /** Replaces the field look, for a control that sits in a toolbar of its own. */
  triggerClassName?: string;
}): React.JSX.Element {
  const current = options.find((o) => o.value === value) ?? options[0];
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        disabled={disabled}
        aria-label={`${label}, ${current?.label ?? ''}`}
        className={triggerClassName}
      >
        <span className="min-w-0 truncate">{current?.label}</span>
        <CaretDown
          size={12}
          weight="bold"
          aria-hidden="true"
          className="flex-none text-faint"
        />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align={align}
          sideOffset={6}
          collisionPadding={12}
          aria-label={label}
          className="z-[60] max-h-(--radix-dropdown-menu-content-available-height) min-w-44 origin-(--radix-dropdown-menu-content-transform-origin) overflow-y-auto rounded-[12px] border border-line bg-surface-1 p-1.5 text-text shadow-[var(--shadow)] outline-none motion-safe:data-[state=closed]:animate-tip-out motion-safe:data-[state=open]:animate-pop-in"
        >
          <DropdownMenu.RadioGroup value={value} onValueChange={onChange}>
            {options.map((o) => (
              <DropdownMenu.RadioItem
                key={o.value}
                value={o.value}
                className={ITEM}
              >
                <DropdownMenu.ItemIndicator className="absolute left-2 inline-flex">
                  <Check
                    size={16}
                    aria-hidden="true"
                    className="text-accent-ink"
                  />
                </DropdownMenu.ItemIndicator>
                {o.label}
              </DropdownMenu.RadioItem>
            ))}
          </DropdownMenu.RadioGroup>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
