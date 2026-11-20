import { SAMPLE_EXECUTIONS } from '@/content/landing-sample';

const TIME_ZONE = 'America/New_York';
const HEADERS = ['Date/Time', 'Symbol', 'Buy/Sell', 'Quantity', 'Price'];

/** 'YYYY-MM-DD HH:MM:SS' on the exchange clock, as a broker export prints it. */
function wallClock(iso: string): string {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(new Date(iso))
      .map((x) => [x.type, x.value]),
  );
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`;
}

/**
 * The sample week's fills as the broker CSV they would have been exported
 * from. The landing page's import preview and `e2e/fixtures/sample-fills.csv`
 * are both this text, so the data lives only in `SAMPLE_EXECUTIONS`.
 */
export function sampleFillsCsv(): string {
  const rows = SAMPLE_EXECUTIONS.map((e) =>
    [
      wallClock(e.time),
      e.symbol,
      e.side === 'buy' ? 'Buy' : 'Sell',
      String(e.qty),
      e.price.toFixed(2),
    ].join(','),
  );
  return [HEADERS.join(','), ...rows].join('\n') + '\n';
}
