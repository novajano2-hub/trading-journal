import type { Metadata } from 'next';
import { READ_P, ReadPage, ReadSection } from '@/components/site/read-page';
import { Chip } from '@/components/ui/chip';

export const metadata: Metadata = {
  title: 'Terms',
  description: 'Draft terms for the current Keel release.',
};

export default function TermsPage() {
  return (
    <ReadPage
      title="Terms"
      lede="This is a draft. It has not been reviewed by a lawyer and is not yet a binding agreement."
    >
      <Chip tone="loss" className="mt-6 h-7 px-3 text-[13px]">
        Draft
      </Chip>
      <ReadSection id="what" title="What Keel is">
        <p className={READ_P}>
          Keel is a trading journal. It organises and measures trades you give
          it. It does not place trades and it does not give investment advice.
        </p>
      </ReadSection>
      <ReadSection id="results" title="Your results">
        <p className={READ_P}>
          Figures are calculated from the files you provide. Check them against
          your broker&apos;s records before relying on them.
        </p>
      </ReadSection>
      <ReadSection id="status" title="Status of this document">
        <p className={READ_P}>
          Final terms will be published before accounts open, and this page will
          be replaced by them.
        </p>
      </ReadSection>
    </ReadPage>
  );
}
