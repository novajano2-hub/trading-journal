import { createElement } from 'react';
import type { WidgetKey, WidgetSettings } from '@/domain/types';
import { ProgressCard } from '../progress-card';
import { WidgetPlaceholder } from './frame';

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
 * card, which draws its own, so it is not framed again; the others hold their
 * place until the upper and the lower widgets replace them.
 */
export const WIDGET_RENDER: Record<WidgetKey, WidgetRender> = {
  // Upper
  'net-pnl': placeholder('net-pnl'),
  'balance-pnl': placeholder('balance-pnl'),
  'trade-win': placeholder('trade-win'),
  'profit-factor': placeholder('profit-factor'),
  'day-win': placeholder('day-win'),
  'win-loss-ratio': placeholder('win-loss-ratio'),
  expectancy: placeholder('expectancy'),
  'day-streak': placeholder('day-streak'),
  'trade-streak': placeholder('trade-streak'),
  streaks: placeholder('streaks'),
  'max-drawdown': placeholder('max-drawdown'),
  'avg-drawdown': placeholder('avg-drawdown'),
  // Lower
  score: placeholder('score'),
  'cum-pnl': placeholder('cum-pnl'),
  'win-avg': placeholder('win-avg'),
  'trade-time': placeholder('trade-time'),
  'trade-duration': placeholder('trade-duration'),
  'daily-pnl': placeholder('daily-pnl'),
  'daily-cum': placeholder('daily-cum'),
  recent: placeholder('recent'),
  calendar: placeholder('calendar'),
  balance: placeholder('balance'),
  drawdown: placeholder('drawdown'),
  challenge: placeholder('challenge'),
  'calendar-mini': placeholder('calendar-mini'),
  'calendar-adv': placeholder('calendar-adv'),
  progress: () => createElement(ProgressCard),
  report: placeholder('report'),
  year: placeholder('year'),
};
