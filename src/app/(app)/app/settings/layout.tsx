import { SettingsFrame } from '@/components/app/settings/settings-frame';

/**
 * Settings: the sections down the left (a row under `lg`), the open one beside
 * them, the menu collapsing with the sidebar. The global filters don't show
 * here.
 */
export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <SettingsFrame>{children}</SettingsFrame>;
}
