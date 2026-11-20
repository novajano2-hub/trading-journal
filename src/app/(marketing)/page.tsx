import type { Metadata } from 'next';
import { Closing } from '@/components/site/landing/closing';
import { Definitions } from '@/components/site/landing/definitions';
import { Faq } from '@/components/site/landing/faq';
import { Hero } from '@/components/site/landing/hero';
import { HowItWorks } from '@/components/site/landing/how-it-works';
import { ImportSection } from '@/components/site/landing/import-section';
import { PlanBento } from '@/components/site/landing/plan-bento';
import { ReportsDemo } from '@/components/site/landing/reports-demo';
import { getSampleView } from '@/lib/landing/sample-view';

export const metadata: Metadata = {
  title: { absolute: 'Keel' },
  description:
    'Import your fills, see every stat to the cent, and grade each trade against your own rules.',
};

export default function MarketingHome() {
  const view = getSampleView();
  return (
    <main data-smooth-scroll className="overflow-x-clip">
      <Hero view={view} />
      <HowItWorks view={view} />
      <ReportsDemo view={view} />
      <PlanBento view={view} />
      <Definitions />
      <ImportSection />
      <Faq />
      <Closing />
    </main>
  );
}
