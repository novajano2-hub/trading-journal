import { createElement } from 'react';
import type { WidgetKey, WidgetSettings } from '@/domain/types';
import { ProgressCard } from '../progress-card';
import { WidgetPlaceholder } from './frame';
import { CHART_RENDER } from './charts';
import { LIST_RENDER } from './lists';
import { SCORE_RENDER } from './score';
import { UPPER_RENDER } from './upper';

/**
 * What draws a widget. It is rendered as a component (`<Render settings=…/>`),
 * so it may call hooks; it reads its data from the page through
 * `useWidgetValue` and draws one root with `data-widget` set to its key.
 */
export type WidgetRender = (props: {
  settings?: WidgetSettings;
}) => React.JSX.Element;

/** A widget not built yet: its frame, with a skeleton for a body. */
function placeholder(widgetKey: WidgetKey): WidgetRender {
  return function Placeholder() {
    return createElement(WidgetPlaceholder, { widgetKey });
  };
}

/**
 * The renderer of every widget in the catalogue. The progress tracker is 6A's
 * card, which draws its own, so it is not framed again; the upper widgets are
 * `upper.tsx`'s, and the lower ones hold their place until they are built.
 */
export const WIDGET_RENDER: Record<WidgetKey, WidgetRender> = {
  // Upper
  ...UPPER_RENDER,
  // Lower
  ...SCORE_RENDER,
  ...CHART_RENDER,
  ...LIST_RENDER,
  calendar: placeholder('calendar'),
  'calendar-mini': placeholder('calendar-mini'),
  'calendar-adv': placeholder('calendar-adv'),
  progress: () => createElement(ProgressCard),
  year: placeholder('year'),
};
