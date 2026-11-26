'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { CalendarX } from '@phosphor-icons/react/dist/ssr';
import { buttonClasses } from '@/components/ui/button-styles';
import { StateGlyph } from '@/components/ui/state-glyph';
import { dayHref, dayQuery } from '@/lib/day-routes';

/** A day URL whose date isn't one: the plain page, with the way to today. */
export function BadDate({
  today,
}: {
  /** Not known until the routine's today loads. */
  today: string | undefined;
}): React.JSX.Element {
  const query = dayQuery(useSearchParams());
  return (
    <div className="mx-auto flex w-full max-w-[520px] flex-col items-center px-5 py-20 text-center sm:py-28">
      <StateGlyph icon={CalendarX} />
      <h2 className="mt-5 text-[17px] leading-snug font-semibold tracking-[-0.015em] text-balance">
        That isn&apos;t a date Keel can open.
      </h2>
      <p className="mt-2 text-[13.5px] leading-[1.5] text-muted">
        The address needs a real date, written year, month, day.
      </p>
      {today !== undefined ? (
        <Link
          href={dayHref(today, today, query)}
          className={`${buttonClasses('secondary')} mt-6`}
        >
          Go to today
        </Link>
      ) : null}
    </div>
  );
}
