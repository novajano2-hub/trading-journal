import type { Metadata } from 'next';
import { AppShell } from '@/components/app/app-shell';
import { FirstRunGate, GateLoading } from '@/components/app/first-run-gate';
import { DataProvider } from '@/data/query/provider';

export const metadata: Metadata = { robots: { index: false } };

/*
 * `[data-surface='app']` switches theme.css to the app's tokens on <html> via
 * :has(), so Radix portals and the page ground follow it. `data-shell` marks
 * the one with the pinned bar (and a phone's tab bar) that the page's scroll
 * padding keeps focus clear of: the welcome pages share the tokens, not that.
 */
export default function AppGroupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // `--tab-bar`: how much of a phone's foot the tab bar takes, kept clear by the page.
    <div
      data-surface="app"
      data-shell=""
      className="flex flex-1 flex-col [--tab-bar:0px] max-sm:[--tab-bar:calc(56px+env(safe-area-inset-bottom))]"
    >
      <DataProvider>
        <FirstRunGate
          fallback={
            <AppShell>
              <GateLoading />
            </AppShell>
          }
        >
          <AppShell>{children}</AppShell>
        </FirstRunGate>
      </DataProvider>
    </div>
  );
}
