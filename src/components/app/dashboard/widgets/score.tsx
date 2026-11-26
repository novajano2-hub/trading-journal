'use client';

import type { ReactNode } from 'react';
import { RadarChart, type RadarAxis } from '@/components/charts/radar-chart';
import { FigureText } from '@/components/product/figure-text';
import { WIDGET_TITLES } from '@/content/dashboard-widgets';
import { WIDGETS } from '@/domain/dashboard/widgets';
import type { ScorePart, ScorePartResult } from '@/domain/metrics/score';
import { useDisplay, type Display } from '@/lib/display';
import { useWidgetPage, useWidgetValue } from './context';
import { WidgetFrame } from './frame';
import type { WidgetRender } from './registry';
import { sentenceCase } from './text';

/**
 * The Edge score widget (#23, C20 to C26): a radar of the six parts, the
 * total, its band in words and a neutral track with a marker. Keel's own name
 * and words. It draws no money, so no money hue; the radar is the accent (a
 * measure against a standard). It reads money whatever the display unit is, so
 * it never narrows: only a ratio of money amounts is hidden under Privacy.
 */

/** The total with up to two decimals and no trailing zero: 63.73, 63.7, 64. */
export function scoreText(n: number): string {
  return String(Math.round(n * 100) / 100);
}

export const BANDS = [
  { word: 'Weak', from: 0, to: 40 },
  { word: 'Building', from: 40, to: 70 },
  { word: 'Strong', from: 70, to: 100 },
] as const;

/** The band a total falls in: Weak under 40, Building from 40, Strong from 70. */
export function bandOf(total: number): (typeof BANDS)[number] {
  return total >= 70 ? BANDS[2] : total >= 40 ? BANDS[1] : BANDS[0];
}

/** The parts, clockwise from the top of the radar. */
const PARTS: { key: ScorePart; label: string }[] = [
  { key: 'winRate', label: 'Win rate' },
  { key: 'profitFactor', label: 'Profit factor' },
  { key: 'winLoss', label: 'Win to loss' },
  { key: 'recovery', label: 'Recovery' },
  { key: 'drawdown', label: 'Drawdown' },
  { key: 'consistency', label: 'Consistency' },
];

const NO_PROFIT = 'Nothing won in this range, so no edge is shown.';
const NO_LOSSES = 'Nothing was lost in this range, so it scores full marks.';

/** What a part is made of, or why it scores as it does, in plain words. */
function wordsOf(
  key: ScorePart,
  p: ScorePartResult,
  display: Display,
): ReactNode {
  if (p.why === 'no-profit') return NO_PROFIT;
  if (p.why === 'no-losses') return NO_LOSSES;
  if (p.why === 'no-drawdown')
    return 'No drawdown in this range, so there is nothing to recover from. It adds nothing to the score, and the radar draws it full.';
  if (p.why === 'net-loss')
    return 'The range lost money, so consistency scores 0.';
  const ratio = (v: number) => <FigureText f={display.ratio(v)} />;
  switch (key) {
    case 'winRate':
      return p.raw === null ? (
        'No decided trade yet, so it scores 0.'
      ) : (
        <>Win rate {p.raw.toFixed(1)}%, where 60% scores full marks.</>
      );
    case 'profitFactor':
      return p.raw === null ? (
        'No figure to score, so it scores 0.'
      ) : (
        <>Profit factor {ratio(p.raw)}.</>
      );
    case 'winLoss':
      return p.raw === null ? (
        'No figure to score, so it scores 0.'
      ) : (
        <>Average win to loss {ratio(p.raw)}.</>
      );
    case 'recovery':
      return p.raw === null ? (
        'No figure to score, so it scores 0.'
      ) : (
        <>Net P&amp;L is {ratio(p.raw)} times the max drawdown.</>
      );
    case 'drawdown':
      return p.raw === null
        ? 'No high to measure the fall against, so it scores 0.'
        : p.raw === 0
          ? 'No fall from a high in this range.'
          : `Max drawdown ${p.raw.toFixed(1)}% of the high.`;
    case 'consistency':
      return p.raw === null
        ? 'Net P&L is zero, so consistency scores 0.'
        : `The trades' results spread by ${(p.raw * 100).toFixed(0)}% of the net P&L.`;
  }
}

/** The total's place on a neutral 0 to 100 track, with the bands named in words. */
function ScoreTrack({ total }: { total: number }): React.JSX.Element {
  const band = bandOf(total);
  const place = `${Math.min(100, Math.max(0, total))}%`;
  return (
    <div className="min-w-0 flex-1 pb-0.5">
      <div
        role="img"
        aria-label={`${scoreText(total)} of 100, in the ${band.word.toLowerCase()} band (${band.from} to ${band.to})`}
        className="relative h-1.5 rounded-[3px] bg-line"
      >
        <i
          aria-hidden="true"
          className="absolute inset-y-0 left-0 rounded-[3px] bg-[color-mix(in_srgb,var(--accent)_55%,var(--surface-1))]"
          style={{ width: place }}
        />
        {[40, 70].map((at) => (
          <s
            key={at}
            aria-hidden="true"
            className="absolute -top-0.5 -bottom-0.5 w-px bg-surface-1"
            style={{ left: `${at}%` }}
          />
        ))}
        <b
          data-marker=""
          aria-hidden="true"
          className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-accent bg-surface-1 shadow-[var(--shadow-chip)]"
          style={{ left: place }}
        />
      </div>
      <div
        data-scale=""
        aria-hidden="true"
        className="relative mt-1.5 h-4 text-[11px] text-faint"
      >
        {(
          [
            ['0', 0, ''],
            ['Weak', 20, '-translate-x-1/2'],
            ['40', 40, '-translate-x-1/2'],
            ['Building', 55, '-translate-x-1/2'],
            ['70', 70, '-translate-x-1/2'],
            ['Strong', 85, '-translate-x-1/2'],
            ['100', 100, '-translate-x-full'],
          ] as const
        ).map(([text, at, shift]) => (
          <span
            key={text}
            className={`absolute top-0 ${shift}`}
            style={{ left: `${at}%` }}
          >
            {text}
          </span>
        ))}
      </div>
    </div>
  );
}

/** The score of the closed trades the filters match, as a card. */
export function Score(): React.JSX.Element {
  const result = useWidgetValue('score');
  const page = useWidgetPage();
  const display = useDisplay();
  const frame = (
    props: Partial<Parameters<typeof WidgetFrame>[0]>,
  ): React.JSX.Element => (
    <WidgetFrame
      widgetKey="score"
      title={WIDGET_TITLES.score}
      tip={WIDGETS.score.metric}
      caption={page ? sentenceCase(page.caption) : undefined}
      {...props}
    />
  );
  if (result === undefined || !page) return frame({ state: 'loading' });
  if (result === null)
    return frame({
      state: 'empty',
      empty: 'The Edge score needs at least one closed trade.',
    });

  const band = bandOf(result.total);
  const total = scoreText(result.total);
  const axes: RadarAxis[] = PARTS.map(({ key, label }) => {
    const part = result.parts[key];
    return {
      key,
      label,
      // The radar draws a part at its plotted value: recovery with no drawdown is full, though it counts 0.
      value: part.plotted,
      text: (
        <>
          <b className="font-semibold text-text tabular-nums">
            {scoreText(part.score)} of 100
          </b>
          . {wordsOf(key, part, display)}
        </>
      ),
    };
  });
  const ranked = PARTS.map(({ key, label }) => ({
    label,
    score: result.parts[key].score,
  })).sort((a, b) => b.score - a.score);
  const label = `Edge score ${total} of 100, ${band.word}, ${page.caption}. Strongest part ${ranked[0]!.label.toLowerCase()}, ${scoreText(ranked[0]!.score)}; weakest ${ranked[ranked.length - 1]!.label.toLowerCase()}, ${scoreText(ranked[ranked.length - 1]!.score)}.`;

  return frame({
    children: (
      <div className="mt-1 flex flex-1 flex-col">
        <RadarChart
          axes={axes}
          label={label}
          caption="Edge score parts, each out of 100"
        />
        <div className="mt-auto flex items-end gap-3.5 border-t border-line pt-3">
          <div className="flex flex-col">
            <span className="text-[30px] leading-none font-semibold tracking-[-0.04em] tabular-nums">
              {total}
            </span>
            <span className="mt-1.5 text-[12.5px] text-muted">{band.word}</span>
          </div>
          <ScoreTrack total={result.total} />
        </div>
      </div>
    ),
  });
}

export const SCORE_RENDER: { score: WidgetRender } = { score: Score };
