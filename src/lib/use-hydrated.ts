import { useSyncExternalStore } from 'react';

const noSubscribe = () => () => {};
/** False on the server and while hydrating, true afterwards. */
export const useHydrated = () =>
  useSyncExternalStore(
    noSubscribe,
    () => true,
    () => false,
  );
