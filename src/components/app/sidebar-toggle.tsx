'use client';

import { SidebarSimple } from '@phosphor-icons/react/dist/ssr';
import { useEffect, useRef } from 'react';
import { RailTip, RailTips } from './rail-tip';
import { useSidebarState } from './use-sidebar-state';

/**
 * The toggle that was just pressed has left the page (the sidebar and the
 * rail are two trees), so the one that replaces it takes focus: a keyboard
 * keeps its place, and a screen reader hears the new state. Set by a press
 * that was not a pointer's (a keyboard or assistive click has no click count;
 * a mouse or touch tap has no need of focus, and would see a tooltip pinned
 * open), spent by the next toggle to mount.
 */
let handoff = false;

const TOGGLE =
  'inline-flex flex-none cursor-pointer items-center justify-center transition-[background-color,border-color,color] duration-200 ease-(--ease-glide) pointer-coarse:size-11';

/** `head` is the sidebar's own (comp 01) and the rail's (comp 10); `bar` is Home's, in the top bar. */
const LOOK = {
  head: 'size-8 rounded-[9px] text-faint hover:bg-surface-1/60 hover:text-text',
  bar: 'size-[34px] rounded-control border border-line bg-surface-1 text-muted hover:border-line-2 hover:text-text max-lg:hidden',
} as const;

/**
 * Collapse or expand the sidebar. Its name and `aria-expanded` follow the
 * state; a tooltip names it on hover and focus.
 */
export function SidebarToggle({
  collapsed,
  onToggle,
  variant = 'head',
  className = '',
}: {
  collapsed: boolean;
  onToggle(): void;
  variant?: keyof typeof LOOK;
  className?: string;
}): React.JSX.Element {
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!handoff) return;
    handoff = false;
    button.current?.focus();
  }, []);
  const label = collapsed ? 'Expand the sidebar' : 'Collapse the sidebar';
  return (
    <RailTip label={label} side={variant === 'bar' ? 'bottom' : 'right'}>
      <button
        ref={button}
        type="button"
        aria-label={label}
        aria-expanded={!collapsed}
        onClick={(e) => {
          handoff = e.detail === 0;
          // A press that moves nothing must not leave the next mount to claim it.
          setTimeout(() => (handoff = false), 1000);
          onToggle();
        }}
        className={`${TOGGLE} ${LOOK[variant]} ${className}`}
      >
        <SidebarSimple size={18} aria-hidden="true" />
      </button>
    </RailTip>
  );
}

/**
 * Home's way back. A collapsed Home has no rail at all (the content centres),
 * so its top bar carries the toggle, as TradeZella's menu button does at the
 * bar's start. From `lg`; below it the drawer's button serves.
 */
export function HomeSidebarToggle(): React.JSX.Element | null {
  const { collapsed, toggle } = useSidebarState();
  if (!collapsed) return null;
  return (
    <RailTips>
      <SidebarToggle
        collapsed
        onToggle={toggle}
        variant="bar"
        className="mr-1"
      />
    </RailTips>
  );
}
