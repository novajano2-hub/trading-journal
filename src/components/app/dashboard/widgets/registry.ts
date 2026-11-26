import { createElement } from 'react';
import type { WidgetKey, WidgetSettings } from '@/domain/types';
import { ProgressCard } from '../progress-card';
import { CALENDAR_RENDER } from './calendars';
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

/**
 * The renderer of every widget in the catalogue. The progress tracker is 6A's
 * card, which draws its own, so it is not framed again; the others draw their
 * frame (`WidgetFrame`) around their body.
 */
export const WIDGET_RENDER: Record<WidgetKey, WidgetRender> = {
  // Upper
  ...UPPER_RENDER,
  // Lower
  ...SCORE_RENDER,
  ...CHART_RENDER,
  ...LIST_RENDER,
  ...CALENDAR_RENDER,
  progress: () => createElement(ProgressCard),
};
