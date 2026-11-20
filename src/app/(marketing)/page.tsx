import { ClosingSection } from '@/components/marketing/landing/closing';
import { LoopSection } from '@/components/marketing/landing/loop';
import { PropRulesSection } from '@/components/marketing/landing/prop-rules';
import { QuestionsSection } from '@/components/marketing/landing/questions';
import { RackSection } from '@/components/marketing/landing/rack';
import { SampleWeekSection } from '@/components/marketing/landing/sample-week';
import { TicketSlotDrop } from '@/components/marketing/ticket-slot-drop';
import { getSampleView } from '@/lib/landing/sample-view';

export default function MarketingHome() {
  const view = getSampleView();
  return (
    <main className="overflow-x-clip">
      <section
        aria-labelledby="hero-title"
        className="hero-grid px-4 pt-7 pb-16 md:px-14 md:pt-12 xl:min-h-[calc(100svh-88px)] xl:pt-[62px] xl:pb-14"
      >
        <div className="[grid-area:intro]">
          <h1
            id="hero-title"
            className="hero-title font-display leading-[0.86] font-black tracking-[-0.01em]"
          >
            <span className="block">FILE EVERY TRADE.</span>{' '}
            <span className="block">FIND THE PATTERN.</span>
          </h1>
          <p className="mt-6 max-w-[34em] text-lg leading-[1.45] font-medium md:mt-[35px] md:text-[21px]">
            Keel turns your broker’s fills into trade tickets, stamped with your
            setup, your mistakes and whether you kept your rules.
          </p>
        </div>
        <TicketSlotDrop sample={view.heroTickets} />
      </section>
      <LoopSection trades={view.trades} />
      <RackSection />
      <SampleWeekSection view={view} />
      <PropRulesSection prop={view.prop} days={view.days} />
      <QuestionsSection />
      <ClosingSection />
    </main>
  );
}
