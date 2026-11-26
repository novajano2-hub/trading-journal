'use client';

import { useReducedMotion } from 'motion/react';
import { Tooltip } from 'radix-ui';
import type { ReactElement } from 'react';

/**
 * Names a rail's glyph beside it: on hover and on keyboard focus (a native
 * `title` shows on neither focus nor touch, and lags behind the pointer). The
 * tip sits on Radix Tooltip, like the metric tips, in the same card and reveal.
 * Wrap the rail in a `Tooltip.Provider` so moving from one glyph to the next
 * skips the delay. The control keeps its own accessible name.
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
      <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
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
