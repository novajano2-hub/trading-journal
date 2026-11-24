'use client';

import { useActiveWorkspace } from '@/data/query/hooks';

/**
 * Sample figures are always labelled while the sample workspace is active. From
 * `sm` it is quiet words beside the controls; below `sm` (`badge`) a small
 * neutral pill beside the page title.
 */
export function SampleLabel({
  badge = false,
}: {
  badge?: boolean;
}): React.JSX.Element | null {
  const workspace = useActiveWorkspace().data;
  if (workspace?.kind !== 'sample') return null;
  return badge ? (
    <span className="inline-flex h-5 flex-none items-center rounded-full bg-sunken px-2 text-[11.5px] font-[550] whitespace-nowrap text-muted sm:hidden">
      <span aria-hidden="true">Sample</span>
      <span className="sr-only">Sample data. Not a real account.</span>
    </span>
  ) : (
    <span className="flex-none px-1 text-[12.5px] font-medium whitespace-nowrap text-faint max-sm:hidden">
      <span aria-hidden="true">Sample data</span>
      <span className="sr-only">Sample data. Not a real account.</span>
    </span>
  );
}
