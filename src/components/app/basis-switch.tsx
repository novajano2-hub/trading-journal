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
      className="flex-none pointer-coarse:[&>label]:inline-flex pointer-coarse:[&>label]:min-h-11 pointer-coarse:[&>label]:items-center"
    />
  );
}
