import type { ReactNode } from 'react';

/** The page's section title and its one sentence of support. */
export function SectionHeading({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <>
      <h2
        id={id}
        className="max-w-[20ch] text-[clamp(2rem,1.6rem+1.6vw,2.625rem)] leading-[1.08] font-semibold tracking-[-0.028em] text-balance"
      >
        {title}
      </h2>
      {children ? (
        <p className="mt-4 max-w-[56ch] text-[17px] leading-[1.6] text-muted">
          {children}
        </p>
      ) : null}
    </>
  );
}
