'use client';

import { Stat, StatCard, useMoney } from './overview-stat';
import type { ReportData } from './use-report-data';

/**
 * Overview: the commissions and the fees of the fills, and the swap, as
 * separate totals. Swap is signed as the files give it (a charge is negative)
 * and reads None while no closed trade carries one.
 */
export function OverviewCosts({
  data,
}: {
  data: ReportData;
}): React.JSX.Element {
  const c = data.partition.costs;
  const money = useMoney(data);
  return (
    <StatCard group="costs" title="Costs">
      <Stat id="commissions" data={data}>
        {money(c.commissions === 0 ? 0 : -c.commissions)}
      </Stat>
      <Stat id="fill-fees" data={data}>
        {money(c.fees === 0 ? 0 : -c.fees)}
      </Stat>
      <Stat id="swap" data={data}>
        {money(c.swap)}
      </Stat>
    </StatCard>
  );
}
