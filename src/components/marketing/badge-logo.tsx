import Link from 'next/link';

export function BadgeLogo({ className = '' }: { className?: string }) {
  return (
    <Link
      href="/"
      aria-label="Keel home"
      className={`relative flex h-16 w-[118px] flex-col items-center justify-center rounded-lg bg-stock text-navy no-underline shadow-[0_2px_0_rgba(21,26,45,0.25),0_8px_18px_-8px_rgba(21,26,45,0.5)] ${className}`}
    >
      <span
        aria-hidden="true"
        className="absolute top-1.5 h-[5px] w-[26px] rounded-[3px] bg-[#aeb6c2]"
      />
      <span
        aria-hidden="true"
        className="mt-1.5 font-display text-4xl leading-none font-black tracking-[0.02em]"
      >
        KEL
      </span>
      <span
        aria-hidden="true"
        className="text-[11px] leading-none font-bold tracking-[0.24em]"
      >
        KEEL
      </span>
    </Link>
  );
}
