'use client';

import Link from 'next/link';
import { List, X } from '@phosphor-icons/react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { enter, exit } from '@/lib/motion';
import { CTA_PRIMARY, CTA_SECONDARY } from './cta';
import { LOGIN_HREF, PRIMARY_LINKS, START_HREF } from './nav-links';
import { ProductMenu } from './product-menu';

export function MobileMenu() {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Crossing into the desktop layout hides this menu: close it so the scroll lock can't stick.
  useEffect(() => {
    const lg = matchMedia('(min-width: 1024px)');
    const onChange = (e: MediaQueryListEvent) => {
      if (e.matches) setOpen(false);
    };
    lg.addEventListener('change', onChange);
    return () => lg.removeEventListener('change', onChange);
  }, []);

  const close = () => setOpen(false);
  const row =
    'flex min-h-12 items-center rounded-control px-2 text-2xl font-medium text-text no-underline hover:bg-sunken';

  return (
    <div
      className="lg:hidden"
      // Focus must not slide on under the sheet (WCAG 2.4.11): leaving it closes it.
      onBlur={(e) => {
        const next = e.relatedTarget as Node | null;
        if (open && next && !e.currentTarget.contains(next)) close();
      }}
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
        className={`${CTA_SECONDARY} h-11 cursor-pointer gap-2 px-3.5 text-[14.5px]`}
      >
        {open ? (
          <X aria-hidden="true" size={18} />
        ) : (
          <List aria-hidden="true" size={18} />
        )}
        Menu
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            id="mobile-sheet"
            initial={reduced ? false : { opacity: 0, x: '100%' }}
            animate={{
              opacity: 1,
              x: 0,
              transition: reduced ? { duration: 0 } : enter,
            }}
            exit={{
              opacity: 0,
              x: reduced ? 0 : '100%',
              transition: reduced ? { duration: 0 } : exit,
            }}
            className="fixed inset-x-0 top-[var(--header-h)] bottom-0 z-40 overflow-y-auto bg-bg px-5 py-6"
          >
            <nav aria-label="Mobile" className="flex flex-col gap-1">
              <ProductMenu variant="inline" onNavigate={close} />
              {PRIMARY_LINKS.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  onClick={close}
                  className={row}
                >
                  {l.label}
                </Link>
              ))}
              <div className="mt-6 flex flex-col gap-3">
                <Link
                  href={LOGIN_HREF}
                  onClick={close}
                  className={`${CTA_SECONDARY} h-12 text-[15px]`}
                >
                  Log in
                </Link>
                <Link
                  href={START_HREF}
                  onClick={close}
                  className={`${CTA_PRIMARY} h-12 text-[15px]`}
                >
                  Get started
                </Link>
              </div>
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
