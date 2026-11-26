'use client';

import { useEffect, useState } from 'react';

/**
 * A control's own copy of a value the address holds (the batch G pattern,
 * as the Columns chooser keeps it). Next delivers a `history.replaceState`
 * write a beat later, in a transition: a control that reads the address
 * alone shows the old value until then, and a second click builds on it and
 * drops the first. The copy changes at once on `set` and follows the
 * address whenever `key`, the address's own text for the value, changes.
 *
 * Back and Forward (`popstate`) drop the copy too. Next can skip an
 * intermediate address it was handed in quick succession, so the address
 * can come back to the very text the copy was made under and `key` never
 * changes: the copy would then outlive the history entry it belonged to.
 */
export function useAddressCopy<T>(
  value: T,
  key: string,
): [T, (next: T) => void] {
  const [copy, setCopy] = useState({ key, value });
  const synced = copy.key === key;
  if (!synced) setCopy({ key, value });
  useEffect(() => {
    // A key no address text can equal, so the address wins until the next set.
    const drop = () => setCopy((c) => ({ key: '\0', value: c.value }));
    window.addEventListener('popstate', drop);
    return () => window.removeEventListener('popstate', drop);
  }, []);
  return [synced ? copy.value : value, (next) => setCopy({ key, value: next })];
}
