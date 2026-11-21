import Link from 'next/link';

/**
 * The K tile and the wordmark. The tile is the logo, so its Keel Ultramarine
 * is fixed rather than read from the accent token: it is the same blue on
 * every surface and in both themes, lit from its top edge.
 */
export function BrandMark({
  href = '/',
  className = '',
  onClick,
}: {
  href?: string;
  className?: string;
  onClick?(): void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={`inline-flex items-center gap-2.5 text-[19px] font-[650] tracking-[-0.03em] text-text no-underline ${className}`}
    >
      <span
        aria-hidden="true"
        className="grid size-7 flex-none place-items-center rounded-[8px] bg-[#2b35af] bg-[linear-gradient(160deg,#3843c6,#1f278c)] text-[15px] font-bold tracking-[-0.02em] text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.22),0_2px_6px_-1px_rgb(43_53_175/0.45)]"
      >
        K
      </span>
      Keel
    </Link>
  );
}
