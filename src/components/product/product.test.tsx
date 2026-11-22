import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';
import { getSampleView } from '@/lib/landing/sample-view';
import { BreakdownChart, barHeight } from './breakdown-chart';
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
      <TradeRows trades={last} tags={v.tags} categories={v.tagCategories} />,
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
      <BreakdownChart rows={v.breakdowns.net.hour} label="Net P&L by hour" />,
    );
    expect(bars).toContain('+1,160');
    expect(bars).toMatch(/aria-describedby="([^"]+)"/);
    expect(bars).toMatch(
      /<dl id="[^"]+" class="sr-only"><div><dt>09:00<\/dt><dd>[^<]+<\/dd>/,
    );
    expect(bars).toContain('role="img" aria-label="Net P&amp;L by hour"');
  });

  test('ticker counts from zero, with the final copy beside it for CSS', () => {
    const html = renderToStaticMarkup(<KpiStrip summary={v.summary} />);
    // The counter starts at zero; CSS shows the final copy instead when
    // motion is reduced or JS never runs.
    expect(html).toMatch(/class="ticker-count[^"]*">\$0\.00</);
    expect(html).toMatch(/class="ticker-final[^"]*">\+\$1,236\.00</);
    expect(html).toContain('<noscript>');
  });

  test('bar slots persist by index and zero keeps a zero height', () => {
    expect(barHeight(0, 100)).toBe(0);
    expect(barHeight(1, 100000)).toBe(2);
    expect(barHeight(-100, 100)).toBe(190);
    const html = renderToStaticMarkup(
      <BreakdownChart rows={v.breakdowns.net.hour} label="x" />,
    );
    // hour tab has 7 slots, 3 of which are zero but still rendered
    expect(html.match(/<i class="block w-full/g)).toHaveLength(7);
    // Rendered finished: the tallest bar shows in full, a zero bar not at all.
    expect(html).toContain('style="transform:none"');
    expect(html).toContain('transform:translateY(190px)');
  });

  test('rows can show just the most telling tag, mistakes first', () => {
    const six = v.trades.find((t) => t.serial === 6)!;
    const all = renderToStaticMarkup(
      <TradeRows trades={[six]} tags={v.tags} categories={v.tagCategories} />,
    );
    expect(all).toContain('Breakout');
    expect(all).toContain('Impatient');
    const one = renderToStaticMarkup(
      <TradeRows
        trades={[six]}
        tags={v.tags}
        categories={v.tagCategories}
        maxTags={1}
      />,
    );
    expect(one).toContain('Moved stop');
    expect(one).not.toContain('Breakout');
  });

  test('the entrance curve is drawn by CSS, with its delay', () => {
    const eq = renderToStaticMarkup(
      <EquityChart series={[1, 2]} label="x" delayMs={420} />,
    );
    expect(eq).toContain('pathLength="1"');
    expect(eq).toContain('motion-safe:animate-draw');
    expect(eq).toContain('animation-delay:420ms');
  });
});
