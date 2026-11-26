// No 'use client': the page prerenders its skeleton, which lays out the same grids.
import type { ReactNode } from 'react';

/** A grey bar: a skeleton's stand-in for a word, a figure or a block. */
export function Bar({ className }: { className: string }): React.JSX.Element {
  return <span className={`block rounded-chip bg-sunken ${className}`} />;
}

/**
 * The upper strip: two columns on a phone (an odd last widget takes the full
 * row), three from `md`, five from `lg`.
 */
export function UpperStrip({
  children,
}: {
  children: ReactNode;
}): React.JSX.Element {
  return (
    <div
      role="group"
      aria-label="Figures"
      data-grid="upper"
      className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4 lg:grid-cols-5 max-md:[&>:last-child:nth-child(odd)]:col-span-2"
    >
      {children}
    </div>
  );
}

/**
 * The lower grid: one column, two from `md`, three from `xl`, packed densely
 * so the widgets after a wide one stack beside it (a wide widget spans two
 * columns and, from `xl`, two rows).
 */
export function LowerGrid({
  children,
}: {
  children: ReactNode;
}): React.JSX.Element {
  return (
    <div
      data-grid="lower"
      className="grid grid-flow-dense grid-cols-1 gap-3 md:grid-cols-2 md:gap-4 xl:grid-cols-3"
    >
      {children}
    </div>
  );
}

/**
 * One grid cell. It stretches the card in it to the cell's height, so the
 * cards of a row are as tall as the tallest, whatever the card draws.
 */
export function WidgetCell({
  wide = false,
  children,
}: {
  /** The advanced and the yearly calendar (C4). */
  wide?: boolean;
  children: ReactNode;
}): React.JSX.Element {
  return (
    <div
      className={`flex min-w-0 flex-col *:grow ${wide ? 'md:col-span-2 xl:row-span-2' : ''}`}
    >
      {children}
    </div>
  );
}

/**
 * What a widget's body is while its data loads: the figure and its line for
 * a small widget, lines and a plot block for a large one. Decorative.
 */
export function SkeletonBody({
  section,
  wide = false,
}: {
  section: 'upper' | 'lower';
  wide?: boolean;
}): React.JSX.Element {
  if (section === 'upper')
    return (
      <div aria-hidden="true" data-skeleton className="mt-2 flex flex-col">
        <Bar className="h-6 w-28 max-w-full" />
        <Bar className="mt-3 h-1.5 w-full rounded-[3px]" />
        <Bar className="mt-3 h-3 w-3/4" />
      </div>
    );
  return (
    <div
      aria-hidden="true"
      data-skeleton
      className="mt-4 flex flex-1 flex-col gap-3"
    >
      <Bar className="h-3.5 w-full" />
      <Bar className="h-3.5 w-4/5" />
      <Bar className="h-3.5 w-3/5" />
      <Bar
        className={`flex-1 rounded-control ${wide ? 'min-h-[260px]' : 'min-h-[140px]'}`}
      />
    </div>
  );
}
