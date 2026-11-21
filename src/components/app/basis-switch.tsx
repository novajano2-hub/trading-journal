'use client';

import { Segmented } from '@/components/ui/segmented';
import { usePrefs, useTrades, useUpdatePrefs } from '@/data/query/hooks';
import type { PnlBasis } from '@/domain/types';

const OPTIONS = [
  { value: 'gross', label: 'Gross' },
  { value: 'net', label: 'Net' },
] as const;

/**
 * Gross or Net P&L, a user preference. A pending change shows at once. With
 * no trades in the workspace there is nothing to switch: it shows, faint.
 */
export function BasisSwitch(): React.JSX.Element {
  const saved = usePrefs().data?.pnlBasis;
  const noTrades = useTrades().data?.length === 0;
  const update = useUpdatePrefs();
  const pending = update.isPending ? update.variables.pnlBasis : undefined;
  return (
    <Segmented<PnlBasis>
      label="P&L basis"
      options={OPTIONS}
      value={pending ?? saved ?? 'net'}
      onChange={(pnlBasis) => update.mutate({ pnlBasis })}
      coarseTargets
      disabled={noTrades}
      className="flex-none"
    />
  );
}
