'use client';

import { FigureText } from '@/components/product/figure-text';
import { Chip } from '@/components/ui/chip';
import { MetricTip } from '@/components/ui/metric-tip';
import type { MetricId } from '@/content/metric-definitions';
import { usePrefs } from '@/data/query/hooks';
import {
  PATTERNS,
  type PatternDef,
  type PatternHit,
  type PatternId,
} from '@/domain/patterns';
import { useDisplay } from '@/lib/display';
import { formatDuration, formatMinutes, formatQty, plural } from '@/lib/format';

/** B25: a pattern's tone is a word, never a colour (green and red stay for money). */
export const TONE_WORDS: Record<PatternDef['tone'], string> = {
  helps: 'Helps',
  hurts: 'Hurts',
  neutral: 'Neutral',
};

const BY_ID = new Map<PatternId, PatternDef>(PATTERNS.map((p) => [p.id, p]));

/** A pattern's definition; ids come only from `PATTERNS`, so it is always there. */
export const patternDef = (id: PatternId): PatternDef => BY_ID.get(id)!;

/** The tone word in a neutral chip. */
export function ToneChip({
  tone,
}: {
  tone: PatternDef['tone'];
}): React.JSX.Element {
  return (
    <span data-tone={tone} className="inline-flex flex-none">
      <Chip>{TONE_WORDS[tone]}</Chip>
    </span>
  );
}

/** A mean to one decimal, a whole number without the ".0": 7.3, 5. */
const mean = (n: number): string => String(Number(n.toFixed(1)));

/**
 * Keel's sentence for one pattern that fired, from the figures the pattern
 * carries (money in cents, durations in ms). Every amount goes through the
 * display, so Privacy hides it and a screen reader hears "hidden amount".
 */
export function PatternSentence({
  hit,
}: {
  hit: PatternHit;
}): React.JSX.Element {
  const display = useDisplay();
  const f = hit.figures;
  const n = (key: string): number => f[key] ?? 0;
  // A loss or a level reads unsigned; a day's net carries its sign.
  const cash = (cents: number) => <FigureText f={display.cash(cents, false)} />;
  const net = (cents: number) => <FigureText f={display.cash(cents, true)} />;
  const dur = formatDuration;
  const units = (qty: number) => `${formatQty(qty)} ${plural(qty, 'unit')}`;

  switch (hit.id) {
    case 'held-longer':
      return (
        <>
          Held {dur(n('holdMs'))}. 75% of your{' '}
          {n('win') === 1 ? 'wins' : 'losses'} in the past 60 days closed within{' '}
          {dur(n('limitMs'))}.
        </>
      );
    case 'long-loss-hold':
      return (
        <>
          Held {dur(n('holdMs'))}, longer than half of your losses in the past
          60 days (they closed within {dur(n('limitMs'))}). It lost{' '}
          {cash(n('loss'))}, more than the average loss of {cash(n('avgLoss'))}.
        </>
      );
    case 'loss-after-loss':
      return (
        <>
          {n('gapMs') === 0
            ? 'Entered as a losing trade closed.'
            : `Entered ${dur(n('gapMs'))} after a losing trade closed.`}{' '}
          That trade lost {cash(n('priorLoss'))}.
        </>
      );
    case 'added-to-position':
      return (
        <>
          Opened in {n('entries')} entries, {units(n('volume'))} in all.
        </>
      );
    case 'exited-in-parts':
      return <>Closed in {n('exits')} exits.</>;
    case 'large-size':
      return (
        <>
          Size {units(n('volume'))}. 75% of your trades in the past 60 days were{' '}
          {units(n('limit'))} or smaller.
        </>
      );
    case 'losses-outweighed':
      return (
        <>
          You won {Math.round(n('winRate') * 100)}% of your trades, but the
          average loss, {cash(n('avgLoss'))}, was at least twice the average
          win, {cash(n('avgWin'))}. The day closed at {net(n('net'))}.
        </>
      );
    case 'switched-sides-red':
    case 'switched-sides-green':
      return (
        <>
          Changed side {n('changes')} times in one symbol across {n('trades')}{' '}
          trades. The day closed at {net(n('net'))}.
        </>
      );
    case 'one-strong-trade':
      return (
        <>
          One trade, a win of {n('r').toFixed(2)}R. The day closed at{' '}
          {net(n('net'))}.
        </>
      );
    case 'low-return':
      return (
        <>
          {n('trades')} trades closed the day at {net(n('net'))}, under half
          your average green day of {cash(n('avgGreenNet'))} in the past 60
          days.
        </>
      );
    case 'sized-up-after-wins':
      return (
        <>
          After {n('streak')} wins in a row you went from{' '}
          {units(n('previousSize'))} to {units(n('size'))} and lost{' '}
          {cash(n('loss'))}, more than your average loss of {cash(n('avgLoss'))}
          .
        </>
      );
    case 'more-trades':
      return (
        <>
          {n('trades')} trades, against a daily average of {mean(n('average'))}{' '}
          in the past 60 days.
        </>
      );
    case 'waited-then-won':
      return (
        <>
          The first entry came {formatMinutes(n('waitMinutes'))} after the
          session started. The day closed at {net(n('net'))}.
        </>
      );
    case 'quick-reentries':
      return (
        <>
          {n('trades')} trades entered within a minute of a loss, and they lost{' '}
          {cash(n('loss'))} together.
        </>
      );
    case 'rushed-red-day':
      return (
        <>
          {n('trades')} trades, held {dur(n('medianHoldMs'))} and{' '}
          {dur(n('medianGapMs'))} apart, as medians. The day closed at{' '}
          {net(n('net'))}.
        </>
      );
    case 'busier-than-green':
      return (
        <>
          {n('trades')} trades, against an average of {mean(n('average'))} on
          green days in the past 60 days.
        </>
      );
  }
}

/**
 * The patterns that fired, one row each: the name (with its definition), the
 * tone word in a chip and the sentence with the figures. A list for a
 * popover or a sheet; it adds no heading of its own.
 */
export function PatternList({
  hits,
}: {
  hits: readonly PatternHit[];
}): React.JSX.Element {
  const basis = usePrefs().data?.pnlBasis ?? 'net';
  return (
    <ul className="m-0 list-none p-0">
      {hits.map((hit) => {
        const def = patternDef(hit.id);
        return (
          <li
            key={hit.id}
            className="border-t border-line/70 px-4 pt-2.5 pb-[11px] first:border-t-0"
          >
            <div className="flex items-center gap-2">
              <span className="min-w-0 flex-1 text-[13.5px] font-semibold text-text">
                <MetricTip
                  id={`pattern-${hit.id}` as MetricId}
                  basis={basis}
                  className="text-left"
                >
                  {def.name}
                </MetricTip>
              </span>
              <ToneChip tone={def.tone} />
            </div>
            <p className="mt-[3px] text-[13px] leading-[1.5] text-muted">
              <PatternSentence hit={hit} />
            </p>
          </li>
        );
      })}
    </ul>
  );
}
