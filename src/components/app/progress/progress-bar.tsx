/**
 * The accent progress bar: a soft track under a gradient fill, one track
 * colour in both themes. `percent` is 0 to 100. Extra props (an `aria-*`
 * set, a `role`) land on the track.
 */
export function ProgressBar({
  percent,
  className = '',
  ...rest
}: {
  percent: number;
  className?: string;
} & Omit<
  React.HTMLAttributes<HTMLSpanElement>,
  'className'
>): React.JSX.Element {
  const width = Math.min(100, Math.max(0, percent));
  return (
    <span
      {...rest}
      className={`relative block h-1.5 overflow-hidden rounded-[3px] bg-accent-soft [[data-theme=dark]_&]:bg-line ${className}`}
    >
      <i
        className="absolute inset-y-0 left-0 rounded-[3px] bg-[linear-gradient(90deg,color-mix(in_srgb,var(--accent)_78%,#fff),var(--accent))]"
        style={{ width: `${width}%` }}
      />
    </span>
  );
}
