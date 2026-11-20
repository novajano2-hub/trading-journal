import type { ReactNode } from 'react';

/** Read-page chrome: headline, lede, then a measured column. No label above the heading. */
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
    <main className="px-4 pt-10 pb-24 md:px-14 md:pt-16 md:pb-36">
      <h1 className="feature-h1 max-w-[13em] font-display font-black uppercase">
        {title}
      </h1>
      {lede ? (
        <p className="mt-6 max-w-[34em] text-lg leading-[1.45] font-medium md:mt-8 md:text-[21px]">
          {lede}
        </p>
      ) : null}
      {children}
    </main>
  );
}

export const READ_H2 =
  'font-display text-[34px] leading-[0.95] font-black uppercase md:text-[44px]';
export const READ_P = 'max-w-[68ch] text-[17px] leading-[1.6] font-medium';

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
      className="scroll-mt-24 pt-14 md:pt-20"
    >
      <h2 id={`${id}-title`} className={READ_H2}>
        {title}
      </h2>
      <div className="mt-5 flex flex-col gap-4">{children}</div>
    </section>
  );
}
