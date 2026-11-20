import Link from 'next/link';

/** A 26px rounded square in ink with a K, plus the wordmark. */
export function BrandMark({ className = '' }: { className?: string }) {
  return (
    <Link
      href="/"
      className={`inline-flex items-center gap-2.5 text-[18px] font-semibold tracking-[-0.02em] text-text no-underline ${className}`}
    >
      <span
        aria-hidden="true"
        className="grid size-[26px] place-items-center rounded-[7px] bg-text text-[14px] font-semibold tracking-normal text-bg"
      >
        K
      </span>
      Keel
    </Link>
  );
}
