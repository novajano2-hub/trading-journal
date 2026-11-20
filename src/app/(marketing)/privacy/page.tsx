import type { Metadata } from 'next';
import Link from 'next/link';
import { READ_P, ReadPage, ReadSection } from '@/components/site/read-page';

export const metadata: Metadata = {
  title: 'Privacy',
  description: 'What happens to files you bring to Keel in this release.',
};

export default function PrivacyPage() {
  return (
    <ReadPage
      title="Privacy"
      lede="Draft, as of 20 November 2026. It describes how this release works, and it will change when accounts arrive."
    >
      <ReadSection id="files" title="Your files stay on this device">
        <p className={READ_P}>
          File import opens with the app release. When it does, your browser
          reads the file on this device and nothing is uploaded.
        </p>
        <p className={READ_P}>
          A file saved earlier in this browser stays in IndexedDB on this device
          until you remove it on the import page or clear this site&apos;s data.
          Only CSV or text files are accepted.
        </p>
      </ReadSection>
      <ReadSection id="accounts" title="Accounts">
        <p className={READ_P}>
          There are no accounts in this release. The login and signup pages do
          not collect or send anything.
        </p>
      </ReadSection>
      <ReadSection id="remove" title="Removing your data">
        <p className={READ_P}>
          Remove the file with &ldquo;Remove file&rdquo; on{' '}
          <Link
            href="/app/import"
            className="font-medium text-accent-ink underline"
          >
            /app/import
          </Link>
          , or clear this site&apos;s data in your browser settings. Because the
          file lives only in your browser, either one removes it.
        </p>
      </ReadSection>
      <ReadSection id="later" title="What will change">
        <p className={READ_P}>
          Accounts and any storage outside your device are not part of this
          release. If they are added, this page will be updated before they are.
        </p>
      </ReadSection>
    </ReadPage>
  );
}
