'use client';

import type { RefObject } from 'react';
import { ConfirmDialog } from '@/components/app/confirm-dialog';
import { useUpdateChallenge } from '@/data/query/hooks';
import type { ChallengeCheck } from '@/domain/prop/challenge';
import type { Challenge } from '@/domain/types';
import { phaseName, shownPhase } from './challenge-card';

/**
 * Move a challenge to its funded phase, after asking: Plan 5's pass action
 * (`status: 'active'`, `phase: 'funded'`). The evaluation's results stay
 * viewable. The Accounts tab's row menu and the details page both open it;
 * `row` is the challenge asked about, and the dialog is closed without one.
 */
export function MoveToFunded({
  row,
  returnFocus,
  onMoved,
  onClose,
}: {
  row: { c: Challenge; check: ChallengeCheck } | undefined;
  returnFocus?: RefObject<HTMLElement | null>;
  /** Called once the challenge has moved, before the dialog closes. */
  onMoved?(): void;
  onClose(): void;
}): React.JSX.Element {
  const update = useUpdateChallenge();
  return (
    <ConfirmDialog
      open={row !== undefined}
      title={`Move ${row?.c.name ?? 'this challenge'} to funded?`}
      body={`${
        row
          ? phaseName(row.c, shownPhase(row.c, row.check)?.step ?? 'step-1')
          : 'The evaluation'
      } passes and its results stay viewable. The challenge moves to its funded phase.`}
      confirmLabel="Move to funded"
      {...(returnFocus && { returnFocus })}
      onConfirm={async () => {
        if (!row) return;
        await update.mutateAsync({
          id: row.c.id,
          patch: { status: 'active', phase: 'funded' },
        });
        onMoved?.();
      }}
      onClose={onClose}
    />
  );
}
