'use client';

import { Receipt } from '@phosphor-icons/react/dist/ssr';
import { Stat, StatCard, useMoney } from './overview-stat';
import type { ReportData } from './use-report-data';

/** Overview: the commissions and the fees of the fills, as separate totals. */
export function OverviewCosts({
  data,
}: {
  data: ReportData;
}): React.JSX.Element {
  const c = data.partition.costs;
  const money = useMoney(data);
  return (
    <StatCard group="costs" title="Costs" icon={Receipt}>
      <Stat id="commissions" data={data}>
        {money(c.commissions, false)}
      </Stat>
      <Stat id="fill-fees" data={data}>
        {money(c.fees, false)}
      </Stat>
    </StatCard>
  );
}
