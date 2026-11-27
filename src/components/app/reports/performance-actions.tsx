'use client';

import { FilePdf } from '@phosphor-icons/react/dist/ssr';
import { Button } from '@/components/ui/button';
import { Segmented } from '@/components/ui/segmented';
import { useUpdatePrefs } from '@/data/query/hooks';
import type { PnlBasis } from '@/domain/types';

/**
 * The row above Performance's charts: the P&L basis, Gross or Net (the same
 * saved choice as the top bar's menu, so the two always agree), and Export PDF
 * beside it. Export PDF hands the page to the browser's print dialog, whose
 * Save as PDF writes the file: the print sheet (`styles/print.css`) lays the
 * page out as a report, with its own header, so the row itself is left off
 * the paper.
 */
export function PerformanceActions({
  basis,
}: {
  basis: PnlBasis;
}): React.JSX.Element {
  const update = useUpdatePrefs();
  // A choice shows at once, ahead of its write, as the top bar's menu does.
  const shown = update.isPending
    ? (update.variables?.pnlBasis ?? basis)
    : basis;
  return (
    <div
      data-print="hide"
      className="flex flex-wrap items-center justify-end gap-2"
    >
      <Segmented
        label="P&L"
        options={[
          { value: 'gross', label: 'Gross' },
          { value: 'net', label: 'Net' },
        ]}
        value={shown}
        onChange={(pnlBasis) => update.mutate({ pnlBasis })}
        coarseTargets
      />
      <Button variant="secondary" onClick={() => window.print()}>
        <FilePdf size={16} aria-hidden="true" className="text-faint" />
        Export PDF
      </Button>
    </div>
  );
}
