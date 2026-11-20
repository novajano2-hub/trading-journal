const TONE = {
  sell: 'text-sell',
  ink: 'text-ink',
} as const;

const SIZE = {
  md: 'border-[3px] px-3 pt-[5px] pb-[3px] text-2xl -outline-offset-[7px] md:text-[30px]',
  sm: 'border-[2.5px] px-2.5 pt-1 pb-0.5 text-xl -outline-offset-[6px] md:text-2xl',
} as const;

/**
 * A rubber-stamp impression: a double rule, condensed caps, uneven ink.
 * Place and rotate it with `className`; the ink multiplies into the paper below.
 */
export function RubberStamp({
  children,
  tone = 'sell',
  size = 'md',
  className = '',
}: {
  children: string;
  tone?: keyof typeof TONE;
  size?: keyof typeof SIZE;
  className?: string;
}) {
  return (
    <span
      className={`rubber-stamp pointer-events-none inline-block rounded-[3px] border-current font-display leading-none font-black tracking-[0.08em] whitespace-nowrap uppercase outline-[1.5px] outline-current outline-solid ${SIZE[size]} ${TONE[tone]} ${className}`}
    >
      {children}
    </span>
  );
}
