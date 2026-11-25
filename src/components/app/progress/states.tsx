// No 'use client': the page prerenders the skeleton as its Suspense fallback.
import { CARD, CARD_PAD } from '../dashboard/shared';

function Bar({ className }: { className: string }): React.JSX.Element {
  return <span className={`block rounded-chip bg-sunken ${className}`} />;
}

/** The tracker's shape while its data loads: the tiles and the three cards, without figures. */
export function ProgressSkeleton(): React.JSX.Element {
  return (
    <div
      role="status"
      aria-label="Loading your progress tracker"
      className="flex flex-col gap-4 px-5 pt-0.5 pb-7"
    >
      <div aria-hidden="true" className="grid gap-4 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className={`${CARD} min-h-[124px] px-5 py-4`}>
            <Bar className="h-3 w-24" />
            <Bar className="mt-4 h-7 w-20" />
          </div>
        ))}
      </div>
      <div
        aria-hidden="true"
        className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_400px] xl:items-start"
      >
        <div
          className={`${CARD} ${CARD_PAD} min-h-[320px] xl:col-start-2 xl:row-span-2 xl:row-start-1`}
        >
          <Bar className="h-3.5 w-16" />
          {[0, 1, 2, 3, 4].map((i) => (
            <Bar key={i} className="mt-5 h-3.5 w-full" />
          ))}
        </div>
        <div
          className={`${CARD} ${CARD_PAD} min-h-[250px] xl:col-start-1 xl:row-start-1`}
        >
          <Bar className="h-3.5 w-20" />
          <Bar className="mt-6 h-[170px] w-full rounded-control" />
        </div>
        <div
          className={`${CARD} ${CARD_PAD} min-h-[300px] xl:col-start-1 xl:row-start-2`}
        >
          <Bar className="h-3.5 w-14" />
          {[0, 1, 2, 3].map((i) => (
            <Bar key={i} className="mt-5 h-3.5 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}
