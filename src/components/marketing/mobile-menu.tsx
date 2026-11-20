'use client';

import Link from 'next/link';
import { Menu, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { ProductMenu } from './product-menu';
import { PRIMARY_LINKS } from './nav-links';

export function MobileMenu() {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const close = () => setOpen(false);

  return (
    <div
      className="md:hidden"
      onKeyDown={(e) => {
        if (e.key === 'Escape' && open) {
          close();
          button.current?.focus();
        }
      }}
    >
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls="mobile-sheet"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded bg-navy px-4 font-display text-lg font-bold tracking-[0.06em] text-gold uppercase"
      >
        {open ? (
          <X aria-hidden="true" strokeWidth={1.75} className="size-5" />
        ) : (
          <Menu aria-hidden="true" strokeWidth={1.75} className="size-5" />
        )}
        Menu
      </button>
      <div
        id="mobile-sheet"
        hidden={!open}
        data-surface="navy"
        className="fixed inset-x-0 top-[88px] bottom-0 z-40 overflow-y-auto bg-navy px-4 py-6 text-stock"
      >
        <nav aria-label="Mobile" className="flex flex-col gap-1">
          <ProductMenu variant="inline" onNavigate={close} />
          {PRIMARY_LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              onClick={close}
              className="flex min-h-11 items-center font-display text-3xl font-bold tracking-[0.06em] text-stock uppercase no-underline"
            >
              {l.label}
            </Link>
          ))}
          <div className="mt-6 flex flex-col gap-3">
            <Link
              href="/login"
              onClick={close}
              className="flex min-h-12 items-center justify-center rounded border-2 border-stock font-display text-2xl font-bold tracking-[0.06em] text-stock uppercase no-underline"
            >
              Log in
            </Link>
            <Link
              href="/signup"
              onClick={close}
              className="flex min-h-12 items-center justify-center rounded bg-gold font-display text-2xl font-black tracking-[0.06em] text-navy uppercase no-underline"
            >
              Get started
            </Link>
          </div>
        </nav>
      </div>
    </div>
  );
}
