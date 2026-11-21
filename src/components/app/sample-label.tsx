'use client';

import { Chip } from '@/components/ui/chip';
import { useActiveWorkspace } from '@/data/query/hooks';

/** Sample figures are always labelled: shown while the sample workspace is active. */
export function SampleLabel(): React.JSX.Element | null {
  const workspace = useActiveWorkspace().data;
  if (workspace?.kind !== 'sample') return null;
  return (
    <Chip className="flex-none whitespace-nowrap">
      <span aria-hidden="true">Sample data</span>
      <span className="sr-only">Sample data. Not a real account.</span>
    </Chip>
  );
}
