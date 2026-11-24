import { SettingsNav } from '@/components/app/settings/settings-nav';

/**
 * Settings: the sections down the left (a row under `lg`), the open one beside
 * them. The global filters don't show here.
 */
export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 px-5 pt-1 pb-16 lg:grid-cols-[180px_minmax(0,1fr)] lg:pt-0">
      <SettingsNav />
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4">
        {children}
      </div>
    </div>
  );
}
