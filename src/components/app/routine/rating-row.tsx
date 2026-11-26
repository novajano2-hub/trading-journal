'use client';

import { Star } from '@phosphor-icons/react/dist/ssr';

type Stars = 1 | 2 | 3 | 4 | 5;

/**
 * Five stars as a radio group. Choosing a star saves it. `label` names the
 * group ("Rating: 4 of 5"); `name` keeps two groups on a page apart.
 */
export function StarRadios({
  rating,
  disabled,
  onChange,
  name,
  label,
}: {
  rating: number | undefined;
  disabled: boolean;
  onChange(next: Stars): void;
  name: string;
  label: string;
}): React.JSX.Element {
  return (
    <div role="radiogroup" aria-label={label} className="flex gap-0.5">
      {([1, 2, 3, 4, 5] as const).map((n) => (
        <label
          key={n}
          className={`group relative grid size-7 place-items-center rounded-[8px] pointer-coarse:size-11 ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
        >
          <input
            type="radio"
            name={name}
            aria-label={`${n} ${n === 1 ? 'star' : 'stars'}`}
            checked={rating === n}
            disabled={disabled}
            onChange={() => onChange(n)}
            className="peer sr-only"
          />
          <Star
            size={20}
            weight={rating !== undefined && n <= rating ? 'fill' : 'regular'}
            aria-hidden="true"
            className={`${rating !== undefined && n <= rating ? 'text-accent' : 'text-line-2'} ${disabled ? '' : 'group-hover:text-accent/70'}`}
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 rounded-[8px] peer-focus-visible:outline-2 peer-focus-visible:outline-accent"
          />
        </label>
      ))}
    </div>
  );
}

/**
 * Five stars as a radio group: "Rating: 4 of 5". Choosing a star saves it; Clear
 * takes it back. The row wraps rather than hang past its card: on a phone with a
 * coarse pointer the stars are 44px targets (228px for five), too wide to share
 * a line with the label and "5 of 5", so they take a line of their own under them.
 */
export function RatingRow({
  rating,
  disabled,
  onChange,
}: {
  rating: number | undefined;
  disabled: boolean;
  onChange(next: Stars | undefined): void;
}): React.JSX.Element {
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 border-t border-line pt-3">
      <span className="w-[84px] flex-none text-[12.5px] text-faint max-sm:w-[72px] pointer-coarse:max-sm:w-auto pointer-coarse:max-sm:flex-1">
        Rating
      </span>
      <div className="pointer-coarse:max-sm:order-last pointer-coarse:max-sm:basis-full">
        <StarRadios
          rating={rating}
          disabled={disabled}
          onChange={onChange}
          name="trade-rating"
          label={`Rating: ${rating === undefined ? 'none' : `${rating} of 5`}`}
        />
      </div>
      <span
        aria-hidden="true"
        className="text-[12.5px] whitespace-nowrap text-muted"
      >
        {rating === undefined ? 'Not rated' : `${rating} of 5`}
      </span>
      {rating !== undefined && !disabled ? (
        <button
          type="button"
          onClick={() => onChange(undefined)}
          className="ml-auto rounded-chip px-1.5 text-[12.5px] font-medium text-faint outline-offset-2 hover:text-text focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:min-h-11"
        >
          Clear
        </button>
      ) : null}
    </div>
  );
}
