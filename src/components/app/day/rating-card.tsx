'use client';

import { useState } from 'react';
import { useDays, useSetRating } from '@/data/query/hooks';
import { CARD, CARD_PAD, CardHeader } from '../dashboard/shared';
import { StarRadios } from '../routine/rating-row';

/**
 * The day rating (K31): how the day felt, one to five stars, on any day
 * with or without trades. It saves on a click and Clear takes it back. There
 * is no mood here: that lives on the Day view's cards.
 */
export function RatingCard({
  date,
  readOnly,
}: {
  date: string;
  readOnly: boolean;
}): React.JSX.Element {
  const rating = useDays().data?.find((d) => d.id === date)?.rating;
  const set = useSetRating();
  const [failed, setFailed] = useState(false);
  const write = (next: 1 | 2 | 3 | 4 | 5 | undefined) => {
    setFailed(false);
    set.mutate({ date, rating: next }, { onError: () => setFailed(true) });
  };
  return (
    <section
      aria-labelledby="day-rating-title"
      className={`${CARD} ${CARD_PAD}`}
    >
      <CardHeader headingId="day-rating-title" title="Day rating" />
      <div className="mt-2 flex items-center gap-3">
        <StarRadios
          rating={rating}
          disabled={readOnly}
          onChange={write}
          name="day-rating"
          label={`Day rating, ${rating === undefined ? 'none' : `${rating} of 5`}`}
        />
        {rating !== undefined && !readOnly ? (
          <button
            type="button"
            onClick={() => write(undefined)}
            className="ml-auto rounded-chip px-1.5 text-[13px] font-semibold text-accent-ink outline-offset-2 hover:text-accent-hover focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:min-h-11"
          >
            Clear
          </button>
        ) : null}
      </div>
      {failed ? (
        <p role="alert" className="mt-2 text-[13px] text-loss">
          Couldn&apos;t save that rating. Try again.
        </p>
      ) : null}
    </section>
  );
}
