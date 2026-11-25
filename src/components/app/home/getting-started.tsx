import { Check } from '@phosphor-icons/react/dist/ssr';
import Link from 'next/link';
import { CARD, CARD_PAD, CardHeader } from '@/components/app/dashboard/shared';
import { buttonClasses } from '@/components/ui/button-styles';
import { Chip } from '@/components/ui/chip';
import type { GettingStarted } from '@/data/getting-started';

type StepId = GettingStarted['steps'][number]['id'];

// Keel's call (TradeZella unknown): a done step 1 or 2 keeps its open line;
// the record shows only a done step 3's line changing.
/** Each step's words and where its button goes (K49). The labels are Keel's own. */
const COPY: Record<
  StepId,
  {
    title: string;
    line: string;
    /** A done step's line, when it differs from the open one. */
    doneLine?: string;
    button: string;
    href: `/app/${string}`;
  }
> = {
  prop: {
    title: 'Add your prop firm',
    line: "Set up your prop account and its rules. Automatic sync isn't live yet, so its trades come in by import.",
    button: 'Add account',
    href: '/app/settings/accounts?new=prop',
  },
  challenge: {
    title: 'Create your first challenge',
    line: 'Enter the profit target, drawdown and daily loss limit, and Keel tracks the evaluation day by day.',
    button: 'New challenge',
    href: '/app/prop-firms?new=challenge',
  },
  trade: {
    title: 'Add your first trade',
    line: 'Import a file from your broker or enter a trade by hand.',
    doneLine:
      'Add the trades from your challenge account the same way: import them or enter them by hand.',
    button: 'Add trade',
    href: '/app/trades/new',
  },
};

/**
 * The Get started card: "n of 3 complete" over a bar, then the three steps.
 * The first open step is the next one: its number is ringed and its button is
 * the filled one. A done step shows a green tick, a struck-through title and a green Done
 * chip, and no button. At 3 of 3 the card stays, with no dismiss (K51).
 */
export function GettingStartedCard({
  progress,
}: {
  progress: GettingStarted;
}): React.JSX.Element {
  const next = progress.steps.find((s) => !s.done)?.id;
  return (
    <section
      aria-labelledby="gs-heading"
      className={`${CARD} ${CARD_PAD} min-w-0`}
    >
      <CardHeader
        headingId="gs-heading"
        title="Get started"
        end={
          <span className="text-[12.5px] whitespace-nowrap text-faint tabular-nums">
            <b className="font-semibold text-text">{progress.done}</b> of{' '}
            {progress.total} complete
          </span>
        }
      />
      <p className="mt-1.5 max-w-[62ch] text-[13px] leading-normal text-muted">
        Follow your evaluation against its profit target and loss limits, from
        the first account to the last trade.
      </p>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={progress.total}
        aria-valuenow={progress.done}
        aria-label={`${progress.done} of ${progress.total} steps complete`}
        className="mt-2.5 h-1.5 overflow-hidden rounded-[3px] bg-accent-soft"
      >
        <div
          className="h-full rounded-[3px] bg-accent"
          style={{ width: `${(progress.done / progress.total) * 100}%` }}
        />
      </div>
      <ol className="mt-2">
        {progress.steps.map((s, i) => {
          const c = COPY[s.id];
          const isNext = s.id === next;
          return (
            <li
              key={s.id}
              aria-current={isNext ? 'step' : undefined}
              className="flex items-center gap-3.5 border-t border-line/70 py-4 first:border-t-0 max-sm:flex-wrap max-sm:items-start"
            >
              <span
                className={`grid size-[30px] flex-none place-items-center rounded-full text-[13.5px] font-semibold tabular-nums ${
                  s.done
                    ? 'bg-gain-soft text-gain'
                    : isNext
                      ? 'text-accent-ink ring-2 ring-accent ring-inset'
                      : 'text-muted ring-[1.5px] ring-line-2 ring-inset'
                }`}
              >
                {s.done ? (
                  <>
                    <Check size={15} weight="bold" aria-hidden="true" />
                    <span className="sr-only">Done:</span>
                  </>
                ) : (
                  i + 1
                )}
              </span>
              <div className="min-w-0 flex-1 max-sm:basis-[calc(100%-44px)]">
                <b
                  className={`block text-[14.5px] ${
                    s.done
                      ? 'font-medium text-faint line-through decoration-[1.5px]'
                      : 'font-semibold'
                  }`}
                >
                  {c.title}
                </b>
                <p
                  className={`mt-0.5 max-w-[62ch] text-[13px] leading-normal ${s.done ? 'text-faint' : 'text-muted'}`}
                >
                  {s.done && c.doneLine ? c.doneLine : c.line}
                </p>
              </div>
              {s.done ? (
                <Chip tone="gain" className="max-sm:ml-11">
                  Done
                </Chip>
              ) : (
                // Keel's call (TradeZella unknown): the record shows step 1
                // (next) filled and step 2 outlined, not which rule decides,
                // so the next step's button is the filled one.
                <Link
                  href={c.href}
                  className={`${buttonClasses(isNext ? 'primary' : 'secondary', 'sm')} no-underline max-sm:ml-11`}
                >
                  {c.button}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
