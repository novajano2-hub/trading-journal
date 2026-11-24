import type { Metadata } from 'next';
import { AccountsSettings } from '@/components/app/settings/accounts';

export const metadata: Metadata = { title: 'Accounts settings' };

export default function AccountsSettingsPage() {
  return <AccountsSettings />;
}
