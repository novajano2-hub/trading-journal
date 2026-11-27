'use client';

import type { ReactNode } from 'react';
import type { AccountRow } from './accounts-list';
import { ChallengeCard } from './challenge-card';

/**
 * The Grid layout of the Accounts tab (C63): one card a challenge, two to a
 * row from `lg` and one on a phone. Each card carries its own row menu.
 */
export function PropView({
  rows,
  menuFor,
  onEdit,
  onMarkBreached,
  onMoveToFunded,
}: {
  rows: readonly AccountRow[];
  menuFor(row: AccountRow): ReactNode;
  onEdit(row: AccountRow): void;
  onMarkBreached(row: AccountRow): void;
  onMoveToFunded(row: AccountRow): void;
}): React.JSX.Element {
  return (
    <div className="grid min-w-0 gap-4 lg:grid-cols-2">
      {rows.map((row) => (
        <div key={row.c.id} data-menu-of={row.c.id} className="contents">
          <ChallengeCard
            challenge={row.c}
            check={row.check}
            started={row.started}
            menu={menuFor(row)}
            onEdit={() => onEdit(row)}
            onMarkBreached={() => onMarkBreached(row)}
            onMoveToFunded={() => onMoveToFunded(row)}
          />
        </div>
      ))}
    </div>
  );
}
