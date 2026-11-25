import type { Metadata } from 'next';
import { WelcomeView } from '@/components/app/welcome/welcome-view';

export const metadata: Metadata = {
  title: 'Welcome',
  robots: { index: false },
};

export default function WelcomePage() {
  return <WelcomeView />;
}
