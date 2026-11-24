'use client';

import { useState } from 'react';

/**
 * A control's own copy of a value the address holds (the batch G pattern,
 * as the Columns chooser keeps it). Next delivers a `history.replaceState`
 * write a beat later, in a transition: a control that reads the address
 * alone shows the old value until then, and a second click builds on it and
 * drops the first. The copy changes at once on `set` and follows the
 * address whenever `key`, the address's own text for the value, changes.
 */
export function useAddressCopy<T>(
  value: T,
  key: string,
): [T, (next: T) => void] {
  const [copy, setCopy] = useState({ key, value });
  const synced = copy.key === key;
  if (!synced) setCopy({ key, value });
  return [synced ? copy.value : value, (next) => setCopy({ key, value: next })];
}
