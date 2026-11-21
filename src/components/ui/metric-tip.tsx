'use client';

// Technique adapted from HorizonX Signal Tooltip, commercial licence: the
// tooltip reveal (rises 6px while scaling up from .92 over 250ms). Rebuilt on
// Radix Tooltip in Keel tokens; the trigger is the metric's own label, and the
// button cluster, tones and signal mark are dropped.
import { useRef, useState, type ReactNode } from 'react';
import { Tooltip } from 'radix-ui';
import { useReducedMotion } from 'motion/react';
import { metricDefinition, type MetricId } from '@/content/metric-definitions';
import type { PnlBasis } from '@/domain/types';

/**
 * The metric's label as a button. Hover, focus and tap open its definition;
 * Escape closes it. Never place it inside another button.
 */
export function MetricTip({
  id,
  basis,
  children,
  className = '',
}: {
  id: MetricId;
  basis: PnlBasis;
  /** The visible label. Defaults to the definition's own label. */
  children?: ReactNode;
  className?: string;
}): React.JSX.Element {
  const { label, definition } = metricDefinition(id, basis);
  const [open, setOpen] = useState(false);
  const reduced = useReducedMotion();
  const pointer = useRef('');
  const motion = reduced
    ? ''
    : 'data-[state=closed]:animate-tip-out data-[state=delayed-open]:animate-tip-in data-[state=instant-open]:animate-tip-in';

  return (
    <Tooltip.Provider delayDuration={150}>
      <Tooltip.Root open={open} onOpenChange={setOpen}>
        <Tooltip.Trigger asChild>
          <button
            type="button"
            data-metric-tip={id}
            onPointerDown={(e) => {
              pointer.current = e.pointerType;
            }}
            onClick={() => {
              // A mouse already has hover; Radix closes on its click. The
              // toggle is for touch, where there is no hover to open it.
              if (pointer.current !== 'mouse') setOpen((o) => !o);
              pointer.current = '';
            }}
            className={`relative inline-flex cursor-help items-center rounded-chip underline decoration-line-2 decoration-dotted underline-offset-4 outline-offset-2 hover:decoration-faint focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:min-h-11 pointer-coarse:after:absolute pointer-coarse:after:-inset-x-2 pointer-coarse:after:inset-y-0 pointer-coarse:after:content-[''] ${className}`}
          >
            {children ?? label}
          </button>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            side="top"
            sideOffset={8}
            collisionPadding={12}
            className={`z-50 max-w-[280px] origin-(--radix-tooltip-content-transform-origin) rounded-control border border-line-2 bg-surface-1 px-3 py-2 text-xs font-medium leading-[1.4] text-muted shadow-[var(--shadow-chip)] ${motion}`}
          >
            {definition}
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}
