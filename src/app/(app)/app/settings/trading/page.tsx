import type { Metadata } from 'next';
import { TradingSettings } from '@/components/app/settings/trading';

export const metadata: Metadata = { title: 'Trading settings' };

export default function TradingSettingsPage() {
  return <TradingSettings />;
}
