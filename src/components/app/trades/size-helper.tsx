'use client';

import { Percent } from '@phosphor-icons/react/dist/ssr';
import { Popover } from 'radix-ui';
import { useId, useState } from 'react';

const SHARES = [25, 50, 75, 100] as const;

/** The quantity that is `share` percent of `position`, to four decimals, so 33.5% of 6 is 2.01 and not 2.0100000000000002. */
export function shareOf(position: number, share: number): number {
  return Math.round(((position * share) / 100) * 1e4) / 1e4;
}

/**
 * A level's size helper (B12): a small button in the quantity field that takes
 * a share of the position, from 1 to 100 percent, and hands back the quantity
 * it is worth. The caller puts the quantity in the field.
 */
export function SizeHelper({
  position,
  onPick,
  disabled = false,
  label = 'Fill from a share of the position',
}: {
  position: number;
  onPick(qty: number): void;
  disabled?: boolean;
  /** The button's name, for a row that needs its own. */
  label?: string;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [bad, setBad] = useState(false);
  const errorId = useId();

  const pick = (share: number) => {
    onPick(shareOf(position, share));
    setOpen(false);
  };
  return (
    <Popover.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setText('');
          setBad(false);
        }
      }}
    >
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={label}
          disabled={disabled}
          className="grid size-7 flex-none place-items-center rounded-[7px] text-muted outline-offset-2 hover:bg-sunken hover:text-text focus-visible:outline-2 focus-visible:outline-accent disabled:pointer-events-none disabled:opacity-40 pointer-coarse:size-11"
        >
          <Percent size={15} aria-hidden="true" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={6}
          collisionPadding={12}
          className="z-[60] w-[232px] origin-(--radix-popover-content-transform-origin) rounded-[12px] border border-line bg-surface-1 p-3 text-text shadow-[var(--shadow)] outline-none motion-safe:data-[state=closed]:animate-tip-out motion-safe:data-[state=open]:animate-pop-in"
        >
          <p className="text-[12.5px] font-medium text-muted">
            Share of the position
          </p>
          <div className="mt-2 grid grid-cols-4 gap-1.5">
            {SHARES.map((share) => (
              <button
                key={share}
                type="button"
                onClick={() => pick(share)}
                className="h-8 rounded-[8px] border border-line-2 bg-surface-1 text-[13px] font-semibold tabular-nums outline-offset-2 hover:border-faint focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:h-11"
              >
                {share}%
              </button>
            ))}
          </div>
          <form
            className="mt-2.5 flex items-center gap-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              const n = Number(text.replace(/[,\s%]/g, ''));
              if (
                text.trim() === '' ||
                !Number.isFinite(n) ||
                n < 1 ||
                n > 100
              ) {
                setBad(true);
                return;
              }
              pick(n);
            }}
          >
            <input
              type="text"
              inputMode="decimal"
              aria-label="Other share, percent"
              aria-invalid={bad || undefined}
              aria-describedby={bad ? errorId : undefined}
              placeholder="Other, %"
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setBad(false);
              }}
              className="h-8 min-w-0 flex-1 rounded-[8px] border border-line-2 bg-surface-1 px-2.5 text-[13px] font-medium tabular-nums outline-none placeholder:text-faint hover:border-faint focus-visible:border-accent aria-invalid:border-loss pointer-coarse:h-11"
            />
            <button
              type="submit"
              className="h-8 rounded-[8px] px-2.5 text-[13px] font-semibold text-accent-ink outline-offset-2 hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:h-11"
            >
              Fill
            </button>
          </form>
          {bad ? (
            <p
              id={errorId}
              role="alert"
              className="mt-1.5 text-[12.5px] font-medium text-loss"
            >
              Enter a share from 1 to 100.
            </p>
          ) : null}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
