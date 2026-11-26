'use client';

import { HandCoins, Plus } from '@phosphor-icons/react/dist/ssr';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { writeParam } from '@/components/app/reports/use-report-data';
import { Button } from '@/components/ui/button';
import { ChallengeForm } from './challenge-form';
import { LogPayout } from './log-payout';

export type PropTab = 'dashboard' | 'accounts' | 'transactions';

const TABS: readonly { key: PropTab; label: string; href: string }[] = [
  { key: 'dashboard', label: 'Dashboard', href: '/app/prop-firms' },
  { key: 'accounts', label: 'Accounts', href: '/app/prop-firms/accounts' },
  {
    key: 'transactions',
    label: 'Transactions',
    href: '/app/prop-firms/transactions',
  },
];

const TAB =
  'inline-flex h-10 flex-none items-center border-b-2 px-3.5 text-[13.5px] whitespace-nowrap no-underline outline-offset-[-2px] focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:h-11';

/**
 * The Prop firms pages' head: the three tabs (Dashboard, Accounts,
 * Transactions), each a route and none with a count (C73), and Log payout and
 * New challenge beside them on every tab; the page's own content follows in
 * `children`. Home's second step links here with `?new=challenge`: the form
 * opens, and the param leaves the address so a reload or Back doesn't reopen
 * it. Render inside `<Suspense>`: it reads the address.
 */
export function PropTabs({
  active,
  children,
}: {
  active: PropTab;
  children: ReactNode;
}): React.JSX.Element {
  // Read from the router's params, not window.location: on a client navigation
  // the address is written after this page renders.
  const params = useSearchParams();
  const [creating, setCreating] = useState(
    () => params.get('new') === 'challenge',
  );
  const [paying, setPaying] = useState(false);
  // The payout dialog grows from its button and hands focus back to it.
  const payButton = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (params.get('new') === 'challenge') writeParam('new', null);
  }, [params]);

  return (
    <div className="flex min-w-0 flex-col gap-4 px-5 pt-1 pb-5 lg:pt-0">
      <div className="flex flex-wrap items-end gap-x-2.5 gap-y-3">
        <nav
          aria-label="Prop firms"
          className="flex min-w-0 flex-1 gap-0.5 overflow-x-auto border-b border-line max-sm:basis-full [scrollbar-width:none]"
        >
          {TABS.map((t) => (
            <Link
              key={t.key}
              href={t.href}
              aria-current={t.key === active ? 'page' : undefined}
              className={`${TAB} -mb-px ${
                t.key === active
                  ? 'border-accent font-semibold text-text'
                  : 'border-transparent font-medium text-muted hover:text-text'
              }`}
            >
              {t.label}
            </Link>
          ))}
        </nav>
        <div className="flex gap-2 pb-1.5 max-sm:w-full max-sm:*:flex-1">
          <Button
            variant="secondary"
            onClick={(e) => {
              payButton.current = e.currentTarget;
              setPaying(true);
            }}
          >
            <HandCoins size={16} aria-hidden="true" />
            Log payout
          </Button>
          <Button onClick={() => setCreating(true)}>
            <Plus size={16} weight="bold" aria-hidden="true" />
            New challenge
          </Button>
        </div>
      </div>
      {children}
      {creating ? <ChallengeForm onClose={() => setCreating(false)} /> : null}
      {paying ? (
        <LogPayout
          origin={payButton}
          returnFocus={payButton}
          onClose={() => setPaying(false)}
        />
      ) : null}
    </div>
  );
}
