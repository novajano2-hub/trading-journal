import type { Metadata } from 'next';
import { ReadPage } from '@/components/site/read-page';
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
      <ol className="m-0 mt-14 max-w-[68ch] list-none p-0">
        {CHANGELOG.map((e) => (
          <li key={e.title} className="border-t border-line-2 py-8">
            <h2 className="text-[22px] leading-[1.2] font-semibold tracking-[-0.025em]">
              {e.title}
            </h2>
            <p className="mt-3 text-[16.5px] leading-[1.7] text-muted">
              {e.body}
            </p>
          </li>
        ))}
      </ol>
    </ReadPage>
  );
}
