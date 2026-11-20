'use client';

// Technique adapted from HorizonX Beacon Tabs, commercial licence: the active
// fill slides and scales to the chosen tab (cubic-bezier(0.23,1,0.32,1), 320ms).
// Rebuilt here for auto-width text tabs, with one shared indicator instead of
// per-tab fills.
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { glide } from '@/lib/motion';

export type TabOption<T extends string> = { value: T; label: string };

export const tabId = (base: string, value: string) => `${base}-tab-${value}`;
export const panelId = (base: string) => `${base}-panel`;

/** Horizontal tablist keys: arrows step and wrap, Home and End jump. Null leaves the key alone. */
export function nextTabIndex(
  key: string,
  index: number,
  count: number,
): number | null {
  switch (key) {
    case 'ArrowRight':
      return (index + 1) % count;
    case 'ArrowLeft':
      return (index - 1 + count) % count;
    case 'Home':
      return 0;
    case 'End':
      return count - 1;
    default:
      return null;
  }
}

interface Slot {
  left: number;
  width: number;
}

/**
 * Text tabs with roving focus. Selection follows focus, so the panel the tabs
 * control (id `panelId(id)`) always shows the focused tab.
 */
export function Tabs<T extends string>({
  id,
  label,
  options,
  value,
  onChange,
}: {
  id: string;
  label: string;
  options: readonly TabOption<T>[];
  value: T;
  onChange: (value: T) => void;
}) {
  const reduced = useReducedMotion();
  const listRef = useRef<HTMLDivElement>(null);
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const index = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );
  const slot = slots?.[index];

  // Tabs keep their size when selected, so slots only change when a tab
  // resizes (fonts arriving, zoom). The observer also delivers the first read.
  useEffect(() => {
    const tabs = [
      ...(listRef.current?.querySelectorAll<HTMLElement>('[role="tab"]') ?? []),
    ];
    const ro = new ResizeObserver(() =>
      setSlots(tabs.map((t) => ({ left: t.offsetLeft, width: t.offsetWidth }))),
    );
    for (const t of tabs) ro.observe(t);
    return () => ro.disconnect();
  }, [options.length]);

  function select(i: number, focus: boolean) {
    const next = options[i]!;
    if (next.value !== value) onChange(next.value);
    if (focus)
      listRef.current
        ?.querySelectorAll<HTMLElement>('[role="tab"]')
        [i]?.focus();
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.altKey || e.ctrlKey || e.metaKey) return; // browser shortcuts stay theirs
    const i = nextTabIndex(e.key, index, options.length);
    if (i === null) return;
    e.preventDefault();
    select(i, true);
  }

  return (
    <div className="-m-1 -mb-3 max-w-[calc(100%+8px)] overflow-x-auto p-1 pb-3 [scrollbar-width:none]">
      <div
        ref={listRef}
        role="tablist"
        aria-label={label}
        onKeyDown={onKeyDown}
        className="relative flex w-max rounded-[7px] bg-sunken p-0.5"
      >
        {slot ? (
          <motion.span
            aria-hidden="true"
            data-testid="tab-fill"
            layout={!reduced}
            transition={{ layout: reduced ? { duration: 0 } : glide }}
            className="absolute inset-y-0.5 bg-surface-1 shadow-[var(--shadow-chip)]"
            style={{ left: slot.left, width: slot.width, borderRadius: 5 }}
          />
        ) : null}
        {options.map((o, i) => {
          const active = i === index;
          return (
            <button
              key={o.value}
              type="button"
              role="tab"
              id={tabId(id, o.value)}
              aria-selected={active}
              aria-controls={panelId(id)}
              tabIndex={active ? 0 : -1}
              onClick={() => select(i, false)}
              className={`relative rounded-[5px] px-2 py-1 text-[13px] font-medium whitespace-nowrap transition-colors duration-300 ease-[var(--ease-glide)] sm:px-2.5 ${
                active
                  ? `text-text ${slot ? '' : 'bg-surface-1 shadow-[var(--shadow-chip)]'}`
                  : 'text-muted hover:text-text'
              }`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
