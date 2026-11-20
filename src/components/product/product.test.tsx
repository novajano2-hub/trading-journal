import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';
import { getSampleView } from '@/lib/landing/sample-view';
import { BreakdownChart } from './breakdown-chart';
import { EquityChart } from './equity-chart';
import { KpiStrip } from './kpi-strip';
import { TradeDetailCard } from './trade-detail-card';
import { TradeRows } from './trade-rows';

describe('product previews render engine values', () => {
  const v = getSampleView();

  test('kpi strip carries the final strings for assistive tech', () => {
    const html = renderToStaticMarkup(<KpiStrip summary={v.summary} />);
    for (const s of ['+$1,236.00', '50.0%', '3.17', '+$154.50'])
      expect(html).toContain(`<span class="sr-only">${s}</span>`);
  });

  test('rows and detail card', () => {
    const last = v.trades.slice(-3).reverse();
    const rows = renderToStaticMarkup(
      <TradeRows trades={last} tags={v.tags} />,
    );
    expect(rows).toContain('20 Nov 10:15');
    expect(rows).toContain('Opening range break');
    expect(rows).toContain('−$275.00');
    const card = renderToStaticMarkup(
      <TradeDetailCard
        trade={v.trades[5]!}
        checks={[{ text: 'Stop stays put', ok: false }]}
      />,
    );
    expect(card).toContain('21,100.00');
    expect(card).toContain('21,086.50');
    expect(card).toContain('−$275.00');
  });

  test('charts render', () => {
    const eq = renderToStaticMarkup(
      <EquityChart
        series={[5_000_000, ...v.equity.map((p) => p.equity)]}
        label="Equity"
      />,
    );
    expect(eq).toContain('<path');
    const bars = renderToStaticMarkup(
      <BreakdownChart breakdowns={v.breakdowns} />,
    );
    expect(bars).toContain('+1,160');
    expect(bars).toContain('−$525.00');
  });
});
