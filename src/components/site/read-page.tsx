import type { ReactNode } from 'react';

const FRAME = 'mx-auto max-w-[1280px] px-5 sm:px-10';

/** Read-page chrome: a headline, a lede, then whatever the page sets in the column. */
export function ReadPage({
  title,
  lede,
  children,
}: {
  title: string;
  lede?: ReactNode;
  children: ReactNode;
}) {
  return (
    <main className={`${FRAME} pt-16 pb-28`}>
      <h1 className="max-w-[18ch] text-[clamp(36px,calc(2.6vw+16px),52px)] leading-[1.06] font-semibold tracking-[-0.032em] text-balance motion-safe:animate-rise">
        {title}
      </h1>
      {lede ? (
        <div
          className="mt-5 max-w-[60ch] text-lg leading-[1.6] text-muted motion-safe:animate-rise"
          style={{ animationDelay: '60ms' }}
        >
          {lede}
        </div>
      ) : null}
      {children}
    </main>
  );
}

/** The reading measure: about 68 characters of body text. */
export const READ_P = 'max-w-[68ch] text-[16.5px] leading-[1.7]';

/** One headed block of a read page. */
export function ReadSection({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className="scroll-mt-24 border-t border-line-2 pt-10 mt-14 first-of-type:mt-12"
    >
      <h2
        id={`${id}-title`}
        className="text-[26px] leading-[1.15] font-semibold tracking-[-0.03em]"
      >
        {title}
      </h2>
      <div className="mt-4 flex flex-col gap-4">{children}</div>
    </section>
  );
}
