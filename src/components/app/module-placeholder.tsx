import { ArrowLeft } from '@phosphor-icons/react/dist/ssr';
import { StateGlyph } from '@/components/ui/state-glyph';
import { DashboardLink } from './dashboard-link';
import { navItem, type AppModuleId } from './nav';

/** A module's page until it is built: what it will do, and the way back, filters kept. No figures. */
export function ModulePlaceholder({
  module,
}: {
  module: Exclude<AppModuleId, 'dashboard' | 'import'>;
}): React.JSX.Element {
  const item = navItem(module);
  const notLive = item.group === 'not-live';
  const Glyph = item.icon;
  return (
    <div className="mx-auto w-full max-w-[560px] px-5 py-16 sm:py-24">
      <div className="flex flex-col items-center rounded-card border border-line bg-surface-1 px-6 pt-9 pb-7 text-center shadow-[var(--shadow-card)] sm:px-10">
        <StateGlyph icon={Glyph} />
        <h2 className="mt-5 text-[17px] leading-snug font-semibold tracking-[-0.015em] text-balance text-text">
          {`${item.label} isn't ${notLive ? 'live' : 'built'} yet.`}
        </h2>
        <p className="mt-2 text-[14.5px] leading-[1.6] text-pretty text-muted">
          {item.summary}
        </p>
        {item.reason ? (
          <p className="mt-1 text-[14.5px] leading-[1.6] text-pretty text-muted">
            {item.reason}
          </p>
        ) : null}
        <DashboardLink className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-control px-2 text-[14px] font-semibold text-accent-ink no-underline hover:underline">
          <ArrowLeft aria-hidden="true" size={16} />
          Back to the Dashboard
        </DashboardLink>
      </div>
    </div>
  );
}
