'use client';

import { useReducedMotion } from 'motion/react';
import { Slot, Tooltip } from 'radix-ui';
import type { ComponentProps, ReactElement } from 'react';

/**
 * Slots the trigger's props onto the control, minus the tooltip's
 * `aria-describedby`. Radix describes the open trigger by its tip, and here
 * the tip is the control's own name, so a screen reader would say it twice.
 * (The control's own description, if it has one, stays: it is on the child.)
 */
function Undescribed(props: ComponentProps<typeof Slot.Root>) {
  const rest = { ...props };
  delete rest['aria-describedby'];
  return <Slot.Root {...rest} />;
}

/**
 * Names a rail's glyph beside it: on hover and on keyboard focus (a native
 * `title` shows on neither focus nor touch, and lags behind the pointer). The
 * tip sits on Radix Tooltip, like the metric tips, in the same card and reveal.
 * Wrap the rail in a `Tooltip.Provider` so moving from one glyph to the next
 * skips the delay. The control keeps its own accessible name, and the tip must
 * say the same (it is not announced as a description as well).
 */
export function RailTip({
  label,
  side = 'right',
  children,
}: {
  label: string;
  side?: 'right' | 'bottom';
  /** The one control the tip names. */
  children: ReactElement;
}): React.JSX.Element {
  const reduced = useReducedMotion();
  const motion = reduced
    ? ''
    : 'data-[state=closed]:animate-tip-out data-[state=delayed-open]:animate-tip-in data-[state=instant-open]:animate-tip-in';
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <Undescribed>{children}</Undescribed>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          side={side}
          sideOffset={8}
          collisionPadding={12}
          className={`z-50 origin-(--radix-tooltip-content-transform-origin) rounded-control border border-line bg-surface-1 px-2.5 py-1.5 text-[12.5px] leading-[1.45] font-medium whitespace-nowrap text-muted shadow-[var(--shadow)] ${motion}`}
        >
          {label}
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

/** The provider a rail's tips share. */
export function RailTips({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <Tooltip.Provider delayDuration={200} skipDelayDuration={400}>
      {children}
    </Tooltip.Provider>
  );
}
