import type { Metadata } from 'next';
import {
  READ_P,
  ReadPage,
  ReadSection,
} from '@/components/marketing/read-page';

export const metadata: Metadata = {
  title: 'Privacy',
  description: 'What happens to the files you drop on Keel in this release.',
};

export default function PrivacyPage() {
  return (
    <ReadPage
      title="Privacy"
      lede="Draft, as of 20 November 2026. It describes how this release works, and it will change when accounts arrive."
    >
      <ReadSection id="files" title="Your files stay on this device">
        <p className={READ_P}>
          When you drop a CSV or Excel file on Keel, it is read in your browser.
          The trades built from it are stored in IndexedDB, a database inside
          your browser, on this device. Nothing is uploaded.
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
          Because the data lives in your browser, clearing this site&apos;s data
          in your browser settings removes it.
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
