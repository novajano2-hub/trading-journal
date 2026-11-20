'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronDown } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { MODULES } from '@/content/modules';

const NAV_TEXT =
  'font-display text-[21px] font-bold tracking-[0.06em] uppercase';

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
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const items = MODULES.filter((m) => m.hasPage);

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

  const popover = variant === 'popover';

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
        className={`${NAV_TEXT} inline-flex min-h-11 cursor-pointer items-center gap-1.5 ${popover ? '' : 'w-full justify-between text-3xl'}`}
      >
        Product
        <ChevronDown
          aria-hidden="true"
          strokeWidth={1.75}
          className={`size-5 transition-transform duration-200 ease-out ${open ? 'rotate-180' : ''}`}
        />
      </button>
      <div
        id={panelId}
        hidden={!open}
        className={
          popover
            ? 'absolute top-full left-0 z-30 mt-3 w-[340px] rounded-md bg-stock p-2 text-navy shadow-[0_2px_4px_rgba(21,26,45,0.18),0_18px_30px_-14px_rgba(21,26,45,0.6)]'
            : 'pb-3'
        }
      >
        <ul className="m-0 list-none p-0">
          {items.map((m) => (
            <li key={m.slug}>
              <Link
                data-item
                href={`/features/${m.slug}`}
                onClick={() => {
                  setOpen(false);
                  onNavigate?.();
                }}
                className={`block rounded px-3 py-2 no-underline ${popover ? 'text-navy hover:bg-gold' : 'text-stock hover:bg-white/10'}`}
              >
                <span className="block font-display text-xl leading-tight font-bold tracking-[0.06em] uppercase">
                  {m.name}
                </span>
                <span className="block text-[14px] leading-snug font-medium">
                  {m.oneLine}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
