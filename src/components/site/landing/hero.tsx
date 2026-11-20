import Link from 'next/link';
import type { CSSProperties } from 'react';
import { AppWindow } from '@/components/product/app-window';
import { EquityChart } from '@/components/product/equity-chart';
import { KpiStrip } from '@/components/product/kpi-strip';
import { TradeDetailCard } from '@/components/product/trade-detail-card';
import { TradeRows } from '@/components/product/trade-rows';
import { formatMoney } from '@/lib/format';
import { SAMPLE_START, type SampleView } from '@/lib/landing/sample-view';
import { START_HREF } from '@/components/site/nav-links';

/** The rows in the window, newest first; the card opens the one that broke a rule. */
const ROW_SERIALS = [8, 6, 5];
const CARD_SERIAL = 6;

/*
 * The entrance, in milliseconds from first paint. Text steps in at 60ms, the
 * window rises, its figures count and the curve draws, then the trade card
 * slides in last. CSS plays it (no JS needed); the tickers count in JS.
 */
const T = {
  textStep: 60,
  window: 180,
  tickers: 300, // after hydration, which lands while the window rises
  curve: 420,
  card: 1100,
} as const;
const delay = (ms: number): CSSProperties => ({ animationDelay: `${ms}ms` });

const CTA =
  'inline-flex h-11 items-center rounded-control px-[18px] text-[15px] font-medium whitespace-nowrap no-underline transition-colors';

export function Hero({ view }: { view: SampleView }) {
  const bySerial = new Map(view.trades.map((t) => [t.serial, t]));
  const rows = ROW_SERIALS.flatMap((n) => bySerial.get(n) ?? []);
  const card = bySerial.get(CARD_SERIAL)!;
  const checks = view.checksFor(card);
  // One rule kept and the one broken, as the contract's card shows.
  const shown = [checks.find((c) => c.ok), checks.find((c) => !c.ok)].flatMap(
    (c) => (c ? [c] : []),
  );
  const end = SAMPLE_START + view.summary.netPnl;
  const series = [SAMPLE_START, ...view.equity.map((p) => p.equity)];

  return (
    <section
      aria-labelledby="hero-title"
      className="mx-auto grid max-w-[1280px] items-center gap-14 px-5 pt-14 pb-[88px] sm:px-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]"
    >
      <div>
        <h1
          id="hero-title"
          className="max-w-[11ch] text-[clamp(40px,calc(3.125vw+18px),58px)] leading-[1.04] font-semibold tracking-[-0.04em] motion-safe:animate-rise"
          style={delay(0)}
        >
          Find out what&apos;s working in your trading.
        </h1>
        <p
          className="mt-[22px] max-w-[40ch] text-lg leading-[1.55] text-muted motion-safe:animate-rise"
          style={delay(T.textStep)}
        >
          Import your fills, see every stat to the cent, and grade each trade
          against your own rules.
        </p>
        <div
          className="mt-8 flex flex-wrap gap-2.5 motion-safe:animate-rise"
          style={delay(T.textStep * 2)}
        >
          <Link
            href={START_HREF}
            className={`${CTA} bg-accent text-accent-fg hover:bg-accent-hover`}
          >
            Get started
          </Link>
          <a
            href="#how"
            className={`${CTA} border border-line-2 bg-surface-1 text-text hover:border-faint`}
          >
            See how it works
          </a>
        </div>
      </div>

      <div
        role="group"
        aria-label="Keel dashboard with a sample week"
        className="relative lg:mr-[clamp(-120px,calc((1280px_-_100vw)/2),0px)]"
      >
        <div
          className="motion-safe:animate-rise-window"
          style={delay(T.window)}
        >
          <AppWindow
            account="Futures (live)"
            range={view.weekLabel}
            basis="Net"
            meta={<span className="text-xs text-faint">Sample data</span>}
          >
            <KpiStrip summary={view.summary} tickerDelay={T.tickers / 1000} />
            <EquityChart
              series={series}
              delayMs={T.curve}
              label={`Equity curve, sample week, from ${formatMoney(SAMPLE_START)} to ${formatMoney(end)}`}
            />
            <TradeRows trades={rows} tags={view.tags} maxTags={1} />
          </AppWindow>
        </div>
        <div
          data-testid="hero-trade"
          className="relative z-10 -mt-3 ml-4 max-w-[300px] motion-safe:animate-slide-in lg:absolute lg:-bottom-14 lg:-left-6 lg:mt-0 lg:ml-0 lg:w-[300px] xl:-bottom-10 xl:-left-14"
          style={delay(T.card)}
        >
          <TradeDetailCard trade={card} checks={shown} />
        </div>
      </div>
    </section>
  );
}
