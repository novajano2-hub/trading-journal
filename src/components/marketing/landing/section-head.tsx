import type { ReactNode } from 'react';

/** Section rhythm: the same gap above every story heading, a smaller one below. */
export const SECTION = 'px-4 pt-24 md:px-14 md:pt-36';
export const AFTER_HEAD = 'mt-10 md:mt-16';

/** A story heading and its lede. The heading carries itself: no label above it. */
export function SectionHead({
  id,
  title,
  children,
  className = '',
}: {
  id: string;
  title: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <h2
        id={id}
        className="landing-h2 max-w-[13em] font-display font-black uppercase"
      >
        {title}
      </h2>
      {children ? (
        <p className="mt-5 max-w-[34em] text-lg leading-[1.45] font-medium md:mt-6 md:text-[21px]">
          {children}
        </p>
      ) : null}
    </div>
  );
}
