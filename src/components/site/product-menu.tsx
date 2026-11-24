'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CaretDown } from '@phosphor-icons/react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useEffect, useId, useRef, useState } from 'react';
import { MODULES } from '@/content/modules';
import { enter, exit } from '@/lib/motion';
import { Chip } from '@/components/ui/chip';
import { MODULE_ICONS } from './module-icons';

export function ProductMenu({
  variant,
  onNavigate,
}: {
  variant: 'popover' | 'inline';
  onNavigate?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const [seenPath, setSeenPath] = useState(pathname);
  if (seenPath !== pathname) {
    setSeenPath(pathname);
    setOpen(false);
  }
  const reduced = useReducedMotion();
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const items = MODULES.filter((m) => m.hasPage);
  const popover = variant === 'popover';

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  const links = () =>
    Array.from(
      root.current?.querySelectorAll<HTMLAnchorElement>('[data-item]') ?? [],
    );

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape' && open) {
      e.stopPropagation();
      setOpen(false);
      button.current?.focus();
      return;
    }
    if (!open) return;
    const list = links();
    const i = list.indexOf(document.activeElement as HTMLAnchorElement);
    let next: number | null = null;
    if (e.key === 'ArrowDown') next = i < 0 ? 0 : (i + 1) % list.length;
    else if (e.key === 'ArrowUp')
      next = i < 0 ? list.length - 1 : (i - 1 + list.length) % list.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = list.length - 1;
    if (next !== null) {
      e.preventDefault();
      list[next]?.focus();
    }
  };

  const list = (
    <ul
      className={`m-0 grid list-none gap-1 p-0 ${popover ? 'grid-cols-2' : 'grid-cols-1'}`}
    >
      {items.map((m) => {
        const planned = m.status === 'in-development';
        const Glyph = MODULE_ICONS[m.slug];
        return (
          <li key={m.slug}>
            <Link
              data-item
              href={`/features/${m.slug}`}
              onClick={() => {
                setOpen(false);
                onNavigate?.();
              }}
              className="flex h-full gap-3 rounded-control p-3 text-text no-underline transition-colors duration-200 ease-(--ease-glide) hover:bg-sunken"
            >
              {/* A plain glyph at text size; a planned module's is fainter. */}
              <Glyph
                size={18}
                aria-hidden="true"
                className={`mt-px flex-none ${planned ? 'text-faint' : 'text-muted'}`}
              />
              <span className="min-w-0">
                <span className="flex flex-wrap items-center gap-2 text-[14.5px] font-medium">
                  {m.name}
                  {planned && <Chip>In development</Chip>}
                </span>
                <span className="mt-0.5 block text-[13px] leading-snug text-muted">
                  {m.oneLine}
                </span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );

  return (
    <div
      ref={root}
      onKeyDown={onKeyDown}
      onBlur={(e) => {
        if (open && !root.current?.contains(e.relatedTarget as Node | null))
          setOpen(false);
      }}
      className={popover ? 'relative' : 'w-full'}
    >
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        className={`inline-flex min-h-11 cursor-pointer items-center gap-1 rounded-control transition-colors hover:text-text ${open ? 'text-text' : 'text-muted'} ${popover ? 'text-[14.5px]' : 'w-full justify-between px-2 text-2xl font-medium text-text'}`}
      >
        Product
        <CaretDown
          aria-hidden="true"
          size={popover ? 14 : 20}
          className={`transition-transform duration-(--dur-enter) ease-(--ease-enter) ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {popover ? (
        <AnimatePresence>
          {open && (
            <motion.div
              id={panelId}
              data-product-panel
              initial={reduced ? false : { opacity: 0, y: 4 }}
              animate={{
                opacity: 1,
                y: 0,
                transition: reduced ? { duration: 0 } : enter,
              }}
              exit={{
                opacity: 0,
                y: reduced ? 0 : 4,
                transition: reduced ? { duration: 0 } : exit,
              }}
              className="absolute top-full left-0 z-30 mt-2 w-[640px] rounded-card border border-line bg-surface-1 p-2 shadow-[var(--shadow)]"
            >
              {list}
            </motion.div>
          )}
        </AnimatePresence>
      ) : (
        <div id={panelId} hidden={!open} className="pb-3">
          {list}
        </div>
      )}
    </div>
  );
}
