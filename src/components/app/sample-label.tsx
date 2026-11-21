'use client';

import { useActiveWorkspace } from '@/data/query/hooks';

/** Sample figures are always labelled: shown while the sample workspace is active, as quiet words beside the controls. */
export function SampleLabel(): React.JSX.Element | null {
  const workspace = useActiveWorkspace().data;
  if (workspace?.kind !== 'sample') return null;
  return (
    <span className="flex-none px-1 text-[12.5px] font-medium whitespace-nowrap text-faint">
      <span aria-hidden="true">Sample data</span>
      <span className="sr-only">Sample data. Not a real account.</span>
    </span>
  );
}
