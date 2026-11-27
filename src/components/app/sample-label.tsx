'use client';

import { useActiveWorkspace } from '@/data/query/hooks';

/**
 * Sample figures are always labelled while the sample workspace is active. From
 * `sm` it is quiet words beside the controls; below `sm` (`badge`) a small
 * neutral pill beside the page title, which below 375px gives its room to the
 * title and stays as words for assistive tech. The pill does not transition:
 * with reduced motion every element gets a 0.01 ms transition (globals.css),
 * which keeps the old padding for a frame after the viewport crosses 375px.
 */
export function SampleLabel({
  badge = false,
}: {
  badge?: boolean;
}): React.JSX.Element | null {
  const workspace = useActiveWorkspace().data;
  if (workspace?.kind !== 'sample') return null;
  return badge ? (
    <span className="inline-flex h-5 flex-none items-center rounded-full bg-sunken px-2 text-[11.5px] font-[550] whitespace-nowrap text-muted transition-none max-[374.98px]:sr-only sm:hidden">
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
