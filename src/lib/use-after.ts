import { useEffect, useState } from 'react';

/**
 * True once `active` has been true for `ms` without a break; false at once
 * when it ends. For a wait worth a word only when it is long.
 */
export function useAfter(active: boolean, ms: number): boolean {
  const [late, setLate] = useState(false);
  useEffect(() => {
    if (!active) return;
    const timer = setTimeout(() => setLate(true), ms);
    return () => {
      clearTimeout(timer);
      setLate(false);
    };
  }, [active, ms]);
  return active && late;
}
