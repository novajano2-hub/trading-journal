import type { Metadata } from 'next';
import { AppLanding } from '@/components/app/home/landing';

export const metadata: Metadata = { title: 'Keel' };

/** The landing (K56): it sends the visitor to Home or the Dashboard once it knows the checklist. */
export default function AppPage() {
  return <AppLanding />;
}
