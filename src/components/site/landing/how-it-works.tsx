import type { ReactNode } from 'react';
import {
  ArrowRight,
  ChartBar,
  Check,
  ListChecks,
  Tag,
  UploadSimple,
  X,
} from '@phosphor-icons/react/dist/ssr';
import type { Icon } from '@phosphor-icons/react';
import { Chip } from '@/components/ui/chip';
import { SectionHeading } from './section-heading';
import { guessColumns, type PreviewField } from '@/domain/import/guess-columns';
import { formatPnl } from '@/lib/format';
import type { SampleView } from '@/lib/landing/sample-view';

/** A typical broker export's header row, as the importer would read it. */
const EXPORT_HEADERS = ['Date/Time', 'Symbol', 'Buy/Sell', 'Quantity', 'Price'];
const KEEL_COLUMN: Record<PreviewField, string> = {
  time: 'Time',
  symbol: 'Symbol',
  side: 'Side',
  qty: 'Quantity',
  price: 'Price',
};
/** The trade the journal and review fragments come from: it broke a rule. */
const STEP_SERIAL = 6;

const FRAG = 'mt-[18px] flex flex-wrap gap-1.5';
const MAP_CHIP =
  'inline-flex h-6 items-center gap-1.5 rounded-chip border border-line bg-surface-1 px-2 text-xs';

function Step({
  icon: StepIcon,
  title,
  children,
  fragment,
}: {
  icon: Icon;
  title: string;
  children: ReactNode;
  fragment: ReactNode;
}) {
  return (
    <li>
      <span className="grid size-10 place-items-center rounded-control bg-accent-soft text-accent-ink">
        <StepIcon size={20} aria-hidden="true" />
      </span>
      <h3 className="mt-3.5 text-lg font-semibold tracking-[-0.015em]">
        {title}
      </h3>
      <p className="mt-1.5 text-[14.5px] leading-[1.55] text-muted">
        {children}
      </p>
      {fragment}
    </li>
  );
}

export function HowItWorks({ view }: { view: SampleView }) {
  // Only the columns the importer renames: "Symbol to Symbol" says nothing.
  const mapping = (
    Object.entries(guessColumns(EXPORT_HEADERS)) as [PreviewField, number][]
  )
    .map(([field, i]) => ({ from: EXPORT_HEADERS[i]!, to: KEEL_COLUMN[field] }))
    .filter((m) => m.from !== m.to);
  const trade = view.trades.find((t) => t.serial === STEP_SERIAL)!;
  const tags = trade.tagIds.flatMap((id) => {
    const tag = view.tags.find((t) => t.id === id);
    return tag ? [tag] : [];
  });
  const checks = view.checksFor(trade);
  const kept = checks.filter((c) => c.ok).length;
  const broken = checks.length - kept;
  const best = view.breakdowns.net.hour.reduce((a, b) =>
    b.pnl > a.pnl ? b : a,
  );

  return (
    <section
      id="how"
      aria-labelledby="how-title"
      className="scroll-mt-16 border-y border-line bg-surface-1 py-28"
    >
      <div className="mx-auto max-w-[1280px] px-5 sm:px-10">
        <SectionHeading
          id="how-title"
          title="Keel does the logging. You do the review."
        />
        <ol className="mt-14 grid gap-x-10 gap-y-12 sm:grid-cols-2 lg:grid-cols-4">
          <Step
            icon={UploadSimple}
            title="Import"
            fragment={
              <ul aria-label="Column mapping" className={FRAG}>
                {mapping.map((m) => (
                  <li key={m.from} className={MAP_CHIP}>
                    {m.from}
                    <ArrowRight
                      size={12}
                      className="text-faint"
                      aria-hidden="true"
                    />
                    <span className="sr-only"> to </span>
                    {m.to}
                  </li>
                ))}
              </ul>
            }
          >
            Drop your broker&apos;s CSV export. Fills become trades, fees
            included.
          </Step>
          <Step
            icon={Tag}
            title="Journal"
            fragment={
              <ul aria-label="Tags" className={FRAG}>
                {tags.map((t) => (
                  <li key={t.id}>
                    <Chip tone={t.category === 'mistake' ? 'loss' : 'neutral'}>
                      {t.name}
                    </Chip>
                  </li>
                ))}
              </ul>
            }
          >
            Tag the setup, the mistake and how you felt, right on the trade.
          </Step>
          <Step
            icon={ListChecks}
            title="Review"
            fragment={
              <p className={FRAG}>
                <Chip tone="gain" className="h-6 px-[9px] font-medium">
                  <Check size={12} aria-hidden="true" />
                  {kept} kept
                </Chip>
                <Chip tone="loss" className="h-6 px-[9px] font-medium">
                  <X size={12} aria-hidden="true" />
                  {broken} broken
                </Chip>
              </p>
            }
          >
            Every rule of your strategy marked kept or broken.
          </Step>
          <Step
            icon={ChartBar}
            title="Improve"
            fragment={
              <p className={FRAG}>
                <span className={MAP_CHIP}>
                  Best hour <span className="font-mono">{best.label}</span>
                  <b className="font-mono font-medium text-gain">
                    {formatPnl(best.pnl)}
                  </b>
                </span>
              </p>
            }
          >
            Reports show which hours, setups and habits pay.
          </Step>
        </ol>
      </div>
    </section>
  );
}
