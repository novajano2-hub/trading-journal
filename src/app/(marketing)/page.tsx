import type { Metadata } from 'next';
import { Hero } from '@/components/site/landing/hero';
import { HowItWorks } from '@/components/site/landing/how-it-works';
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
    </main>
  );
}
