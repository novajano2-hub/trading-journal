import { ArrowLeft } from '@phosphor-icons/react/dist/ssr';
import { IconTile } from '@/components/ui/icon-tile';
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
  return (
    <div className="mx-auto flex w-full max-w-[520px] flex-col items-center px-5 py-20 text-center sm:py-28">
      <IconTile icon={item.icon} tone={notLive ? 'faint' : 'neutral'} />
      <h2 className="mt-5 text-[16px] leading-snug font-medium text-text text-balance">
        {`${item.label} isn't ${notLive ? 'live' : 'built'} yet.`}
      </h2>
      <p className="mt-2 text-[15px] leading-[1.6] text-muted text-pretty">
        {item.summary}
      </p>
      {item.reason ? (
        <p className="mt-1 text-[15px] leading-[1.6] text-muted text-pretty">
          {item.reason}
        </p>
      ) : null}
      <DashboardLink className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-control px-2 text-[15px] font-medium text-accent-ink no-underline hover:underline">
        <ArrowLeft aria-hidden="true" size={16} />
        Back to the Dashboard
      </DashboardLink>
    </div>
  );
}
