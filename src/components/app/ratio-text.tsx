'use client';

import { FigureText } from '@/components/product/figure-text';
import { useDisplay } from '@/lib/display';

/**
 * A ratio of money amounts (profit factor, average win to loss) as the page
 * shows it: the number, or dots with a screen-reader "hidden ratio" under
 * Privacy; "None" when there is no ratio to show. Read inside the view's
 * `FigureSourceContext.Provider`, like every figure.
 */
export function RatioText({
  value,
  digits,
}: {
  value: number | null;
  digits?: number;
}): React.JSX.Element {
  const display = useDisplay();
  if (value === null) return <>None</>;
  return <FigureText f={display.ratio(value, digits)} />;
}
