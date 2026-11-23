'use client';

import { useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { DropdownMenu } from 'radix-ui';
import {
  DotsThree,
  Info,
  ListChecks,
  Plus,
} from '@phosphor-icons/react/dist/ssr';
import { FigureText } from '@/components/product/figure-text';
import { buttonClasses } from '@/components/ui/button-styles';
import { Chip } from '@/components/ui/chip';
import { IconTile } from '@/components/ui/icon-tile';
import { MetricTip } from '@/components/ui/metric-tip';
import { Segmented } from '@/components/ui/segmented';
import { useRemoveStrategy, useUpdateStrategy } from '@/data/query/hooks';
import type { Strategy } from '@/domain/types';
import { FigureSourceContext, useDisplay } from '@/lib/display';
import { plural } from '@/lib/format';
import { ConfirmDialog } from '../confirm-dialog';
import { CARD, signTone } from '../dashboard/shared';
import {
  ASSET_LABEL,
  deleteBody,
  iconOf,
  pctText,
  pfText,
} from './strategy-style';
import {
  ArchiveFailed,
  LeftOutNote,
  StateBlock,
  StrategyError,
  StrategySkeleton,
} from './strategy-states';
import { EquityLine } from './equity-line';
import {
  useStrategyData,
  type StrategyData,
  type StrategyFigures,
} from './use-strategy-figures';

type Status = Strategy['status'];

const MENU =
  'z-[60] min-w-[190px] origin-(--radix-dropdown-menu-content-transform-origin) rounded-[12px] border border-line bg-surface-1 p-1.5 text-text shadow-[var(--shadow)] outline-none motion-safe:data-[state=closed]:animate-tip-out motion-safe:data-[state=open]:animate-pop-in';
const MENU_ITEM =
  'flex min-h-9 cursor-pointer items-center rounded-[8px] px-2.5 text-[13.5px] outline-none data-[highlighted]:bg-sunken pointer-coarse:min-h-11';

const NEW_LINK = buttonClasses('primary');

function NewStrategyLink(): React.JSX.Element {
  return (
    <Link href="/app/strategies/new" className={NEW_LINK}>
      <Plus size={16} weight="bold" aria-hidden="true" />
      New strategy
    </Link>
  );
}

function Kpi({
  label,
  value,
  sub,
  tone = '',
  children,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="min-w-0 px-3 first:pl-0 max-lg:px-0">
      <span className="block text-[12.5px] text-faint">{label}</span>
      <b
        className={`mt-1 block text-[20px] leading-tight font-semibold tracking-[-0.02em] tabular-nums ${tone}`}
      >
        {value}
      </b>
      {sub ? (
        <small className="mt-1 block text-[12.5px] leading-[1.35] text-faint">
          {sub}
        </small>
      ) : null}
      {children}
    </div>
  );
}

/** The value span of every line drawn: the cards share it, so a small strategy reads small. */
function sharedRange(
  figures: readonly StrategyFigures[],
): { min: number; max: number } | undefined {
  const lines = figures.filter((f) => f.equity.length >= 3);
  if (lines.length < 2) return undefined;
  const all = lines.flatMap((f) => f.equity);
  return { min: Math.min(...all), max: Math.max(...all) };
}

function StrategyCard({
  f,
  range,
  basis,
  onArchive,
  onDelete,
}: {
  f: StrategyFigures;
  /** The scale every card's line shares. */
  range?: { min: number; max: number };
  basis: 'net' | 'gross';
  onArchive(): void;
  onDelete(): void;
}): React.JSX.Element {
  const display = useDisplay();
  const router = useRouter();
  const { strategy: s, summary } = f;
  const Glyph = iconOf(s);
  const rules = f.rules.length;
  const money = display.figure(display.ofTrades(f.closedIds, f.pnl));
  return (
    <article
      className={`${CARD} grid items-center gap-x-7 gap-y-5 px-[22px] py-[18px] lg:grid-cols-[minmax(0,286px)_minmax(0,1fr)_228px]`}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2.5">
          <IconTile icon={Glyph} tone="accent" />
          <h2 className="min-w-0 text-[17px] leading-snug font-semibold tracking-[-0.02em] text-text">
            <Link
              href={`/app/strategies/${encodeURIComponent(s.id)}`}
              className="rounded-chip outline-offset-2 hover:text-accent-ink focus-visible:outline-2 focus-visible:outline-accent"
            >
              {s.name}
            </Link>
          </h2>
        </div>
        {s.description ? (
          <p className="mt-2 max-w-[40ch] text-[14px] leading-[1.5] text-muted">
            {s.description}
          </p>
        ) : null}
        {s.assetClasses.length > 0 ? (
          <ul
            aria-label="Asset classes"
            className="mt-2.5 flex flex-wrap gap-1.5"
          >
            {s.assetClasses.map((a) => (
              <li key={a}>
                <Chip>{ASSET_LABEL[a]}</Chip>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3 lg:grid-cols-[.72fr_.74fr_1.2fr_1.06fr_1fr] lg:gap-x-0 lg:divide-x lg:divide-line">
        <Kpi
          label="Rules"
          value={rules}
          sub={`in ${s.groups.length} ${plural(s.groups.length, 'group')}`}
        />
        <Kpi
          label={<MetricTip id="trades" basis={basis} />}
          value={summary.closedCount}
          sub={
            summary.openCount > 0 ? `${summary.openCount} open` : 'none open'
          }
        />
        <Kpi
          label={<MetricTip id="pnl" basis={basis} />}
          value={<FigureText f={money} />}
          tone={signTone(f.pnl)}
          sub={`PF ${pfText(summary.profitFactor)}`}
        />
        <Kpi
          label={<MetricTip id="win-rate" basis={basis} />}
          value={pctText(summary.winRate, 1)}
          sub={`${summary.wins} won, ${summary.losses} lost`}
        />
        <Kpi
          label={<MetricTip id="rule-adherence" basis={basis} />}
          value={pctText(f.adherence)}
        >
          <div
            aria-hidden="true"
            className="mt-2 h-1.5 w-full max-w-[96px] overflow-hidden rounded-full bg-sunken"
          >
            <i
              className="block h-full rounded-full bg-accent"
              style={{ width: `${(f.adherence ?? 0) * 100}%` }}
            />
          </div>
        </Kpi>
      </div>

      <div className="flex flex-col gap-1.5 lg:border-l lg:border-line lg:pl-5">
        <div className="flex items-center justify-between">
          <Chip tone={s.status === 'archived' ? 'warn' : 'neutral'}>
            {s.status === 'archived' ? 'Archived' : 'Active'}
          </Chip>
          <DropdownMenu.Root>
            <DropdownMenu.Trigger
              aria-label={`More for ${s.name}`}
              className="inline-flex size-7 items-center justify-center rounded-[8px] border border-line text-muted outline-offset-2 hover:border-faint hover:text-text focus-visible:outline-2 focus-visible:outline-accent data-[state=open]:border-faint pointer-coarse:size-11"
            >
              <DotsThree size={16} weight="bold" aria-hidden="true" />
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                align="end"
                sideOffset={6}
                collisionPadding={12}
                className={MENU}
              >
                <DropdownMenu.Item
                  className={MENU_ITEM}
                  onSelect={() =>
                    router.push(
                      `/app/strategies/${encodeURIComponent(s.id)}/edit`,
                    )
                  }
                >
                  Edit
                </DropdownMenu.Item>
                <DropdownMenu.Item className={MENU_ITEM} onSelect={onArchive}>
                  {s.status === 'archived' ? 'Unarchive' : 'Archive'}
                </DropdownMenu.Item>
                <DropdownMenu.Item
                  className={`${MENU_ITEM} text-loss`}
                  onSelect={onDelete}
                >
                  Delete
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </div>
        {f.equity.length >= 3 ? (
          <EquityLine f={f} scale={range} readoutClassName="min-h-[34px]" />
        ) : (
          <p className="flex h-20 items-center text-[13px] text-faint">
            The line starts with the first closed trade.
          </p>
        )}
        <span className="text-[12px] text-faint">
          Cumulative {basis} P&amp;L by close
        </span>
      </div>
      <LeftOutNote count={f.leftOut} className="col-span-full -mt-1" />
    </article>
  );
}

/** Closed trades with no strategy, in the display unit (inside the figure source). */
function UnassignedNote({
  unassigned,
  basis,
}: {
  unassigned: StrategyData['unassigned'];
  basis: 'net' | 'gross';
}): React.JSX.Element | null {
  const display = useDisplay();
  if (unassigned.count === 0) return null;
  const pnl = display.figure(display.ofTrades(unassigned.ids, unassigned.pnl));
  return (
    <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1 px-1 text-[12.5px] text-muted">
      <Info size={15} aria-hidden="true" className="flex-none text-faint" />
      <span>
        {unassigned.count} closed{' '}
        {plural(unassigned.count, 'trade has', 'trades have')} no strategy,{' '}
        <FigureText f={pnl} /> {basis}.
      </span>
      <Link
        href="/app/trades?nostrat=1"
        className="font-semibold text-accent-ink hover:text-accent-hover"
      >
        Assign them in Trades
      </Link>
    </p>
  );
}

/** The strategies list: figures are all time, on the P&L basis, across all accounts. */
export function StrategiesView(): React.JSX.Element {
  const { data, error } = useStrategyData();
  const queryClient = useQueryClient();
  const update = useUpdateStrategy();
  const remove = useRemoveStrategy();
  const [status, setStatus] = useState<Status>('active');
  const [deleting, setDeleting] = useState<string | null>(null);

  if (error)
    return (
      <StrategyError
        error={error}
        onRetry={() => void queryClient.resetQueries({ queryKey: ['keel'] })}
      />
    );
  if (!data) return <StrategySkeleton label="Loading your strategies" />;

  const all = data.strategies;
  if (all.length === 0)
    return (
      <StateBlock
        visual={<IconTile icon={ListChecks} />}
        title="No strategies yet."
        body="A strategy is a set of rules you grade each trade against. Start from Entry, Exit, Risk and Management, and make them yours."
        actions={<NewStrategyLink />}
      />
    );

  const shown = all.filter((s) => s.status === status);
  const range = sharedRange(shown.map((s) => data.figures.get(s.id)!));
  const target = deleting ? all.find((s) => s.id === deleting) : undefined;
  const targetTrades = target ? data.figures.get(target.id)!.tradeCount : 0;
  const { unassigned } = data;

  return (
    <FigureSourceContext.Provider value={data.source}>
      <div className="flex min-w-0 flex-col gap-4 px-5 pt-1 pb-5 lg:pt-0">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Segmented
            label="Status"
            value={status}
            onChange={setStatus}
            coarseTargets
            options={[
              { value: 'active', label: 'Active' },
              { value: 'archived', label: 'Archived' },
            ]}
          />
          <span className="text-[12.5px] text-faint">
            Figures are all time, on {data.basis} P&amp;L, across all accounts.
          </span>
          <span className="ml-auto">
            <NewStrategyLink />
          </span>
        </div>

        {update.isError ? (
          <ArchiveFailed
            name={
              all.find((x) => x.id === update.variables?.id)?.name ??
              'The strategy'
            }
            archiving={update.variables?.patch.status === 'archived'}
          />
        ) : null}

        {shown.length === 0 ? (
          <p className="px-1 py-8 text-center text-[14.5px] text-muted">
            {status === 'active'
              ? 'No active strategies. Unarchive one, or start a new strategy.'
              : 'Nothing archived. Archive a strategy to set it aside without deleting it.'}
          </p>
        ) : (
          shown.map((s) => (
            <StrategyCard
              key={s.id}
              f={data.figures.get(s.id)!}
              range={range}
              basis={data.basis}
              onArchive={() =>
                update.mutate({
                  id: s.id,
                  patch: {
                    status: s.status === 'archived' ? 'active' : 'archived',
                  },
                })
              }
              onDelete={() => setDeleting(s.id)}
            />
          ))
        )}

        <UnassignedNote unassigned={unassigned} basis={data.basis} />
      </div>

      <ConfirmDialog
        open={target !== undefined}
        title={`Delete ${target?.name ?? 'this strategy'}?`}
        body={deleteBody(targetTrades)}
        confirmLabel="Delete"
        danger
        onConfirm={async () => {
          if (target) await remove.mutateAsync(target.id);
        }}
        onClose={() => setDeleting(null)}
      />
    </FigureSourceContext.Provider>
  );
}
