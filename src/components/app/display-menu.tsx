'use client';

import { CaretDown, Check, EyeSlash } from '@phosphor-icons/react/dist/ssr';
import { DropdownMenu } from 'radix-ui';
import { useId } from 'react';
import { usePrefs, useTrades, useUpdatePrefs } from '@/data/query/hooks';
import type { DisplayUnit, PnlBasis } from '@/domain/types';

const UNITS: readonly { value: DisplayUnit; name: string; short: string }[] = [
  { value: 'dollar', name: 'Dollar', short: '$' },
  { value: 'percent', name: 'Percentage', short: '%' },
  { value: 'privacy', name: 'Privacy', short: '' },
  { value: 'r', name: 'R-multiple', short: 'R' },
  { value: 'ticks', name: 'Ticks', short: 'ticks' },
  { value: 'pips', name: 'Pips', short: 'pips' },
  { value: 'points', name: 'Points', short: 'pts' },
];
const BASES: readonly { value: PnlBasis; name: string }[] = [
  { value: 'net', name: 'Net' },
  { value: 'gross', name: 'Gross' },
];

const ITEM =
  'relative flex min-h-9 cursor-pointer items-center rounded-[8px] py-1.5 pr-3 pl-8 text-[13.5px] text-text select-none data-highlighted:bg-sunken data-disabled:cursor-default data-disabled:text-faint pointer-coarse:min-h-11';
const LABEL = 'px-2 pt-2 pb-1 text-[12px] font-medium text-faint';
const TRIGGER =
  'inline-flex h-[34px] flex-none items-center gap-1.5 rounded-control border border-line bg-surface-1 pr-2 pl-3 text-[13.5px] font-medium whitespace-nowrap text-text shadow-[0_1px_1px_rgb(18_22_51/0.04)] transition-[border-color] duration-200 ease-(--ease-glide) hover:border-accent/35 data-[state=open]:border-accent/35 pointer-coarse:h-11 pointer-coarse:pl-3.5';

function Indicator(): React.JSX.Element {
  return (
    <DropdownMenu.ItemIndicator className="absolute left-2 inline-flex">
      <Check size={16} aria-hidden="true" className="text-accent-ink" />
    </DropdownMenu.ItemIndicator>
  );
}

/**
 * How every figure shows, and which P&L it is: one button for the top bar,
 * naming the pair ("Net, $"; Privacy is a crossed eye beside "Net"), and a
 * menu with two radio groups, "Show as" (the unit) and "P&L" (Net or Gross).
 * Both are saved preferences; a pending change shows at once. With no trades
 * in the workspace there is no P&L to choose: its group reads faint and
 * changes nothing, while the unit still can.
 */
export function DisplayMenu(): React.JSX.Element {
  const prefs = usePrefs().data;
  const noTrades = useTrades().data?.length === 0;
  const update = useUpdatePrefs();
  const pending = update.isPending ? update.variables : undefined;
  const unit = pending?.displayUnit ?? prefs?.displayUnit ?? 'dollar';
  const basis = pending?.pnlBasis ?? prefs?.pnlBasis ?? 'net';
  const unitLabel = useId();
  const basisLabel = useId();
  const current = UNITS.find((u) => u.value === unit) ?? UNITS[0]!;
  const basisName = BASES.find((b) => b.value === basis)?.name ?? 'Net';

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        aria-label={`Display: ${current.name}, ${basisName} P&L`}
        className={TRIGGER}
      >
        {unit === 'privacy' ? (
          <>
            {basisName}
            <EyeSlash
              size={15}
              weight="bold"
              aria-hidden="true"
              className="-mr-0.5 flex-none text-muted"
            />
          </>
        ) : (
          `${basisName}, ${current.short}`
        )}
        <CaretDown
          size={12}
          weight="bold"
          aria-hidden="true"
          className="flex-none text-faint"
        />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          collisionPadding={12}
          className="z-[60] max-h-(--radix-dropdown-menu-content-available-height) min-w-52 origin-(--radix-dropdown-menu-content-transform-origin) overflow-y-auto rounded-[12px] border border-line bg-surface-1 p-1.5 text-text shadow-[var(--shadow)] outline-none motion-safe:data-[state=closed]:animate-tip-out motion-safe:data-[state=open]:animate-pop-in"
        >
          <DropdownMenu.Label id={unitLabel} className={LABEL}>
            Show as
          </DropdownMenu.Label>
          <DropdownMenu.RadioGroup
            aria-labelledby={unitLabel}
            value={unit}
            onValueChange={(v) =>
              update.mutate({ displayUnit: v as DisplayUnit })
            }
          >
            {UNITS.map((u) => (
              <DropdownMenu.RadioItem
                key={u.value}
                value={u.value}
                onSelect={(e) => e.preventDefault()}
                className={ITEM}
              >
                <Indicator />
                {u.name}
              </DropdownMenu.RadioItem>
            ))}
          </DropdownMenu.RadioGroup>
          <DropdownMenu.Separator className="-mx-1.5 my-1.5 h-px bg-line" />
          <DropdownMenu.Label id={basisLabel} className={LABEL}>
            P&amp;L
          </DropdownMenu.Label>
          <DropdownMenu.RadioGroup
            aria-labelledby={basisLabel}
            aria-disabled={noTrades || undefined}
            value={basis}
            onValueChange={(v) => update.mutate({ pnlBasis: v as PnlBasis })}
          >
            {BASES.map((b) => (
              <DropdownMenu.RadioItem
                key={b.value}
                value={b.value}
                disabled={noTrades}
                onSelect={(e) => e.preventDefault()}
                className={ITEM}
              >
                <Indicator />
                {b.name}
              </DropdownMenu.RadioItem>
            ))}
          </DropdownMenu.RadioGroup>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
