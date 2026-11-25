'use client';

import { LockSimple } from '@phosphor-icons/react/dist/ssr';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useDayScores, useRoutineToday } from '@/data/query/derived';
import {
  useAccounts,
  useCashFlows,
  useDays,
  useFinishDay,
  usePrefs,
  useTrades,
} from '@/data/query/hooks';
import { LockedDayError } from '@/data/repository';
import { freezeDay } from '@/data/routine';
import { ConfirmDialog, ConfirmFailure } from '../confirm-dialog';
import { useDayFinished } from './day-lock';

const BODY =
  "Locks this day's rules, note, rating and screenshots. A closed day can't be reopened.";

/**
 * The foot of the review page's rules card. A scored day, today or earlier,
 * offers Close the day: it asks first, then stores the day's frozen rules and
 * inputs (K3). A closed day says when, in place of the button.
 */
export function FinishDay({
  date,
}: {
  date: string;
}): React.JSX.Element | null {
  const { finished, time } = useDayFinished(date);
  const today = useRoutineToday();
  const scores = useDayScores().data;
  const days = useDays().data;
  const trades = useTrades().data;
  const accounts = useAccounts().data;
  const flows = useCashFlows().data;
  const prefs = usePrefs().data;
  const finish = useFinishDay();
  const [asking, setAsking] = useState(false);

  if (finished)
    return (
      <div className="mt-3 flex items-start gap-2.5 rounded-[10px] bg-sunken px-3.5 py-3">
        <LockSimple
          size={18}
          aria-hidden="true"
          className="mt-px flex-none text-muted"
        />
        <div>
          <b className="block text-[13.5px] font-semibold">
            {time === undefined ? 'Closed' : `Closed at ${time}`}
          </b>
          <span className="mt-0.5 block text-[12.5px] leading-[1.5] text-muted">
            This day is locked. Its rules, note, rating and screenshots stay as
            they were.
          </span>
        </div>
      </div>
    );

  if (
    today === undefined ||
    date > today ||
    !scores ||
    scores.scoreOn(date).unscored !== undefined ||
    !days ||
    !trades ||
    !accounts ||
    !flows ||
    !prefs
  )
    return null;

  const confirm = async () => {
    const frozen = freezeDay(
      date,
      scores.tracker,
      days.find((d) => d.id === date),
      trades,
      accounts,
      flows,
      {
        timeZone: prefs.timeZone,
        baseCurrency: prefs.baseCurrency,
        now: new Date().toISOString(),
        today,
      },
    );
    try {
      await finish.mutateAsync({ date, frozen });
    } catch (e) {
      if (e instanceof LockedDayError)
        throw new ConfirmFailure('This day is already closed.');
      throw e;
    }
  };

  return (
    <div className="mt-3 border-t border-line pt-3.5">
      <Button
        variant="secondary"
        className="w-full"
        onClick={() => setAsking(true)}
      >
        <LockSimple size={16} aria-hidden="true" />
        Close the day
      </Button>
      <p className="mt-2 text-center text-[12.5px] leading-[1.5] text-faint">
        {BODY}
      </p>
      <ConfirmDialog
        open={asking}
        title="Close the day?"
        body={BODY}
        confirmLabel="Close the day"
        onConfirm={confirm}
        onClose={() => setAsking(false)}
      />
    </div>
  );
}
