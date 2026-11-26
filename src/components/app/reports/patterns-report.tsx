'use client';

import { Pulse, Warning } from '@phosphor-icons/react/dist/ssr';
import { useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { usePatterns } from '@/data/query/hooks';
import { PATTERNS } from '@/domain/patterns';
import { BreakdownCards } from './breakdown-report';
import { ReportScope, ReportSkeleton, State } from './report-scope';
import type { ReportData } from './use-report-data';

/** The longest pattern name: the chart's axis labels run that long, so "Switched sides, green" and "Switched sides, red" differ. */
const LONGEST_NAME = Math.max(...PATTERNS.map((p) => p.name.length));

/** The caption says how a trade is counted: B24 (TradeZella's layout is unknown). */
const CAPTION =
  "A trade counts under each of its patterns; a day pattern counts that day's trades";

function PatternsBody({ data }: { data: ReportData }): React.JSX.Element {
  const patterns = usePatterns();
  const queryClient = useQueryClient();
  const options = useMemo(() => ({ patterns: patterns.data }), [patterns.data]);
  if (patterns.isError)
    return (
      <State
        role="alert"
        icon={Warning}
        title="The patterns couldn't load."
        actions={
          <Button
            variant="secondary"
            onClick={() =>
              void queryClient.resetQueries({ queryKey: ['keel'] })
            }
          >
            Try again
          </Button>
        }
      />
    );
  // The breakdown reads where the patterns fired: until they are read it has nothing to count.
  if (!patterns.data) return <ReportSkeleton />;
  return (
    <BreakdownCards
      data={data}
      report="patterns"
      by="pattern"
      options={options}
      chartLabel="Net P&L by pattern"
      tableName="Patterns summary"
      rowTitle="Pattern"
      plural="Patterns"
      title="By pattern"
      caption={CAPTION}
      crossAnalysis={false}
      phoneRows
      tiltMaxChars={LONGEST_NAME}
      tradesTip="pattern-trades"
      whenEmpty={
        <State
          icon={Pulse}
          title="No patterns have fired in these trades."
          body="Patterns are read from your fills: how long a trade was held, how it was entered and closed, and how the day went. A trade or day that matches one counts here."
        />
      }
    />
  );
}

/**
 * Reports, Patterns (spec §5.5, B24): one row per pattern that fired, on Keel's
 * breakdown anatomy (the chart, the best and worst, the table). A trade counts
 * under each of its patterns, so one with two is in both rows; a day pattern
 * counts that day's trades. TradeZella's layout for it is unknown, so there is
 * no cross-analysis and no chart of its own.
 */
export function PatternsView(): React.JSX.Element {
  return (
    <ReportScope testId="reports-patterns">
      {(data) => <PatternsBody data={data} />}
    </ReportScope>
  );
}
