'use client';

import { Info } from '@phosphor-icons/react/dist/ssr';
import { useId, type ReactNode } from 'react';
import { MetricTip } from '@/components/ui/metric-tip';
import { WIDGET_TITLES } from '@/content/dashboard-widgets';
import type { MetricId } from '@/content/metric-definitions';
import { usePrefs } from '@/data/query/hooks';
import { WIDGETS } from '@/domain/dashboard/widgets';
import type { WidgetKey } from '@/domain/types';
import { CARD, CARD_PAD, Caption, CardHeader } from '../shared';
import { SkeletonBody } from './layout';

/**
 * The card every dashboard widget but the progress tracker (which draws its
 * own) sits in: its header with the metric's info tip, and a body that is the
 * widget's own, a skeleton while it loads or its no-data words.
 *
 * - A lower widget is a card with a heading, the tip beside it as an info
 *   glyph, an optional caption (the range) and `end` at the far right.
 * - An upper widget is a small card: its label is the tip, `end` (a count
 *   chip) at the right, then its figure.
 *
 * `data-widget` names the widget on its root, which is how the page and its
 * tests tell the widgets apart.
 */
export function WidgetFrame({
  widgetKey,
  title,
  caption,
  tip,
  end,
  state = 'ready',
  empty,
  children,
}: {
  widgetKey: WidgetKey;
  title: string;
  /** Beside the title of a lower widget: the range, or what the chart is by. */
  caption?: ReactNode;
  /** The definition its info tip shows. */
  tip: MetricId;
  /** At the header's far right: a count, a switch, an action. */
  end?: ReactNode;
  /** `loading` draws a skeleton and `empty` the no-data words, each in place of `children`. */
  state?: 'ready' | 'loading' | 'empty';
  /** What a widget with no data says; read when `state` is `empty`. */
  empty?: ReactNode;
  children?: ReactNode;
}): React.JSX.Element {
  const headingId = useId();
  const basis = usePrefs().data?.pnlBasis ?? 'net';
  const { section, size } = WIDGETS[widgetKey];
  const body =
    state === 'loading' ? (
      <SkeletonBody section={section} wide={size === 'wide'} />
    ) : state === 'empty' ? (
      <p
        className={
          section === 'upper'
            ? 'mt-2 text-[13.5px] leading-[1.45] text-muted'
            : 'flex flex-1 items-center justify-center px-2 py-10 text-center text-[13.5px] leading-[1.5] text-muted'
        }
      >
        {empty}
      </p>
    ) : (
      children
    );

  if (section === 'upper')
    return (
      <section
        data-widget={widgetKey}
        aria-labelledby={headingId}
        aria-busy={state === 'loading' || undefined}
        className={`${CARD} flex min-h-32 min-w-0 flex-col px-[18px] pt-4 pb-3.5 max-sm:min-h-0 max-sm:px-3.5 max-sm:pt-3.5 max-sm:pb-3`}
      >
        <div className="flex min-h-[22px] items-center gap-2">
          <MetricTip
            id={tip}
            basis={basis}
            className="text-[12.5px] text-faint"
          >
            <span id={headingId}>{title}</span>
          </MetricTip>
          {end !== undefined ? (
            <span className="ml-auto flex min-w-0 items-center">{end}</span>
          ) : null}
        </div>
        {body}
      </section>
    );

  return (
    <section
      data-widget={widgetKey}
      aria-labelledby={headingId}
      aria-busy={state === 'loading' || undefined}
      className={`${CARD} ${CARD_PAD} flex min-w-0 flex-col`}
    >
      <CardHeader
        headingId={headingId}
        title={title}
        after={
          <>
            <MetricTip
              id={tip}
              basis={basis}
              className="-ml-1.5 size-[22px] justify-center text-faint hover:text-muted"
            >
              <Info size={15} aria-hidden="true" />
              <span className="sr-only">About {title}</span>
            </MetricTip>
            {caption !== undefined ? <Caption>{caption}</Caption> : null}
          </>
        }
        end={end}
      />
      {body}
    </section>
  );
}

/**
 * A widget with nothing behind it yet: its title and tip, and a skeleton body.
 * The registry holds one for each widget until the widget itself is built.
 */
export function WidgetPlaceholder({
  widgetKey,
}: {
  widgetKey: WidgetKey;
}): React.JSX.Element {
  const { section, size, metric } = WIDGETS[widgetKey];
  return (
    <WidgetFrame
      widgetKey={widgetKey}
      title={WIDGET_TITLES[widgetKey]}
      tip={metric}
    >
      <SkeletonBody section={section} wide={size === 'wide'} />
    </WidgetFrame>
  );
}
