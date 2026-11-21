import type { ReactNode } from 'react';
import type { Icon } from '@phosphor-icons/react';
import { IconTile, type TileTone } from '@/components/ui/icon-tile';

/** The app's card surface, for a shot that needs the card without a header. */
export const CARD =
  'min-w-0 rounded-card border border-line bg-surface-1 shadow-[var(--shadow-card)]';

/**
 * One of the app's dashboard cards, for a product shot: white, 16px, a
 * brand-tinted shadow, and a header of icon tile and title. The title is a
 * label, not a heading, so a shot never adds to the page outline.
 */
export function ProductCard({
  icon,
  tone = 'neutral',
  title,
  meta,
  children,
  className = '',
}: {
  icon: Icon;
  tone?: TileTone;
  title: string;
  /** Quiet text at the right of the header. */
  meta?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`${CARD} ${className}`}>
      <div className="flex items-center gap-2.5 px-4 pt-3.5">
        <IconTile icon={icon} tone={tone} />
        <p className="text-sm font-semibold tracking-[-0.015em]">{title}</p>
        {meta ? (
          <span className="ml-auto text-xs text-faint">{meta}</span>
        ) : null}
      </div>
      {children}
    </div>
  );
}
