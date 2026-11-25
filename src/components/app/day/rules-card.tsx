'use client';

import { ArrowRight } from '@phosphor-icons/react/dist/ssr';
import Link from 'next/link';
import { useState } from 'react';
import { useDayScores } from '@/data/query/derived';
import { useDays, usePrefs, useSetTick } from '@/data/query/hooks';
import { versionOn } from '@/domain/tracker/defaults';
import { dayLabel } from '@/lib/time-format';
import { CARD, CARD_PAD, HEADER_LINK, CardHeader } from '../dashboard/shared';
import { DayRules } from '../progress/day-rules';

/**
 * The day's rules (K20): the mark and name of each, and the start rule's
 * time. A date before the tracker, a non-trading day and a day with no rules
 * say so; a future date has no card at all.
 */
export function RulesCard({
  date,
  today,
  foot,
}: {
  date: string;
  today: string;
  /** What closes the card on a scored day: the review page's Close the day. */
  foot?: React.ReactNode;
}): React.JSX.Element | null {
  const scores = useDayScores().data;
  const days = useDays().data;
  const prefs = usePrefs().data;
  const setTick = useSetTick();
  const [failed, setFailed] = useState(false);
  if (date > today || !scores || !prefs) return null;

  const score = scores.scoreOn(date);
  const { tracker } = scores;
  // A finished day reads its own frozen rules (K3).
  const version =
    days?.find((d) => d.id === date)?.locked?.version ??
    versionOn(tracker, date) ??
    tracker.versions[tracker.versions.length - 1]!;

  let body: React.ReactNode;
  if (score.unscored === 'before-start')
    body = `Not tracked yet. The tracker started on ${dayLabel(tracker.startedOn)}.`;
  else if (score.unscored === 'not-trading-day') body = 'Not a trading day.';
  else if (score.active === 0)
    body = 'No rules apply this day. Turn some on in the Progress tracker.';
  else
    body = (
      <DayRules
        score={score}
        version={version}
        readOnly={score.finished}
        detail="names"
        currency={prefs.baseCurrency}
        onTick={(ruleId, ticked) => {
          setFailed(false);
          setTick.mutate(
            { date, ruleId, ticked },
            { onError: () => setFailed(true) },
          );
        }}
      />
    );

  return (
    <section
      aria-labelledby="day-rules-title"
      className={`${CARD} ${CARD_PAD}`}
    >
      <CardHeader
        headingId="day-rules-title"
        title={date === today ? "Today's rules" : 'Rules'}
        end={
          <Link href="/app/progress" className={HEADER_LINK}>
            Progress tracker
            <ArrowRight size={13} aria-hidden="true" className="ml-1" />
          </Link>
        }
      />
      {typeof body === 'string' ? (
        <p className="mt-3 text-[13.5px] leading-[1.5] text-muted">{body}</p>
      ) : (
        body
      )}
      {failed ? (
        <p role="alert" className="mt-2 text-[13px] text-loss">
          Couldn&apos;t save that tick. Try again.
        </p>
      ) : null}
      {score.unscored === undefined ? foot : null}
    </section>
  );
}
