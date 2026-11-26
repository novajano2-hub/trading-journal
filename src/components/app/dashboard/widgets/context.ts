import { createContext, useContext } from 'react';
import type { WidgetDataResult } from '@/data/query/derived';
import type { MetricContext } from '@/domain/metrics/context';
import { FigureSourceContext } from '@/lib/display';
import type { WidgetValues } from '@/data/widget-data';

/**
 * What the page hands every widget under it: the series of the whole
 * template, computed once in the one currency the currency switch shows, and
 * the range in words. A widget reads its own part with `useWidgetValue`, so
 * fifteen widgets share one filtered trade set instead of filtering fifteen
 * times. (Money goes through `useDisplay`, whose figure source the page also
 * provides.)
 */
export interface WidgetPage extends WidgetDataResult {
  /** The date range as a short phrase, e.g. "1-20 Nov" or "all time". */
  caption: string;
}

export const WidgetPageContext = createContext<WidgetPage | null>(null);

/** The page's widget data; null outside the dashboard page. */
export function useWidgetPage(): WidgetPage | null {
  return useContext(WidgetPageContext);
}

/**
 * One widget's series, as `useWidgetData` computed it for the template. Absent
 * (undefined) outside the page, for a widget not in the template, and for one
 * whose series is not built.
 */
export function useWidgetValue<K extends keyof WidgetValues>(
  key: K,
): WidgetValues[K] | undefined {
  // `values` is typed loosely (any widget key, unknown); each built key holds its `WidgetValues` entry.
  return useWidgetPage()?.values[key] as WidgetValues[K] | undefined;
}

/**
 * The metrics context the page's figures are read in: the zone, the basis, the
 * breakeven range, the date range resolved, and the unit when it narrows the
 * trades. Undefined outside the page.
 */
export function useWidgetCtx(): MetricContext | undefined {
  return useContext(FigureSourceContext)?.ctx;
}
