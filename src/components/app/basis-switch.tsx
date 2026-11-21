'use client';

import { Segmented } from '@/components/ui/segmented';
import { usePrefs, useUpdatePrefs } from '@/data/query/hooks';
import type { PnlBasis } from '@/domain/types';

const OPTIONS = [
  { value: 'gross', label: 'Gross' },
  { value: 'net', label: 'Net' },
] as const;

/** Gross or Net P&L, a user preference. A pending change shows at once. */
export function BasisSwitch(): React.JSX.Element {
  const saved = usePrefs().data?.pnlBasis;
  const update = useUpdatePrefs();
  const pending = update.isPending ? update.variables.pnlBasis : undefined;
  return (
    <Segmented<PnlBasis>
      label="P&L basis"
      options={OPTIONS}
      value={pending ?? saved ?? 'net'}
      onChange={(pnlBasis) => update.mutate({ pnlBasis })}
      coarseTargets
      className="flex-none"
    />
  );
}
