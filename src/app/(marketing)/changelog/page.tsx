import type { Metadata } from 'next';
import { ReadPage } from '@/components/marketing/read-page';
import { CHANGELOG, CHANGELOG_AS_OF } from '@/content/changelog';

export const metadata: Metadata = {
  title: 'Changelog',
  description: 'What Keel does today, in plain statements.',
};

export default function ChangelogPage() {
  return (
    <ReadPage
      title="Changelog"
      lede={`What has shipped, newest first. Everything here is true as of ${CHANGELOG_AS_OF}.`}
    >
      <ol className="m-0 mt-12 max-w-[68ch] list-none p-0 md:mt-16">
        {CHANGELOG.map((e) => (
          <li key={e.title} className="border-t-2 border-ink py-8">
            <h2 className="font-display text-[30px] leading-none font-black uppercase md:text-[36px]">
              {e.title}
            </h2>
            <p className="mt-4 text-[17px] leading-[1.6] font-medium">
              {e.body}
            </p>
          </li>
        ))}
      </ol>
    </ReadPage>
  );
}
