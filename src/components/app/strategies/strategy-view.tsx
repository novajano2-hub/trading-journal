'use client';

import { useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import {
  Archive,
  ChartBar,
  ChartLineUp,
  CheckSquare,
  ListBullets,
  ListChecks,
  PencilSimple,
} from '@phosphor-icons/react/dist/ssr';
import { FigureText } from '@/components/product/figure-text';
import { Button } from '@/components/ui/button';
import { buttonClasses } from '@/components/ui/button-styles';
import { Chip } from '@/components/ui/chip';
import { IconTile } from '@/components/ui/icon-tile';
import { MetricTip } from '@/components/ui/metric-tip';
import type { MetricId } from '@/content/metric-definitions';
import { useStrategy, useUpdateStrategy } from '@/data/query/hooks';
import type { RuleStat } from '@/domain/metrics/rules';
import type { Rule, RuleGroup, Strategy } from '@/domain/types';
import { FigureSourceContext, useDisplay } from '@/lib/display';
import { plural } from '@/lib/format';
import { CARD, CardHeader, Caption, signTone } from '../dashboard/shared';
import {
  ASSET_LABEL,
  SHOW_WHEN_CHIP,
  iconOf,
  pctText,
  pfText,
} from './strategy-style';
import { EquityLine } from './equity-line';
import {
  ArchiveFailed,
  LeftOutNote,
  NoStrategy,
  StrategyError,
  StrategySkeleton,
} from './strategy-states';
import { useStrategyData, type StrategyFigures } from './use-strategy-figures';

const PAD = 'px-5 pt-[18px] pb-4';
const TH =
  'px-2.5 py-2 text-left text-[12.5px] font-medium whitespace-nowrap text-faint first:pl-0 last:pr-0';
const TD = 'px-2.5 py-2.5 align-middle first:pl-0 last:pr-0';

function Head({
  id,
  basis,
  children,
}: {
  id: MetricId;
  basis: 'net' | 'gross';
  children: string;
}) {
  return (
    <th scope="col" className={TH}>
      <MetricTip id={id} basis={basis}>
        {children}
      </MetricTip>
    </th>
  );
}

const LOSERS_ONLY = (
  <span
    className="text-faint"
    title="Losers only: this rule applies only to losing trades"
  >
    Losers
  </span>
);

/** One rule's cells, as the table and the stacked card both show them. */
function ruleCells(
  st: RuleStat,
  rule: Rule,
  display: ReturnType<typeof useDisplay>,
): {
  rate: React.ReactNode;
  followed: React.ReactNode;
  broken: React.ReactNode;
  winRate: React.ReactNode;
  pf: React.ReactNode;
  followedNet: number;
  brokenNet: number;
} {
  const kept = display.figure(
    display.ofTrades(st.keptTradeIds, st.followedNet),
  );
  const broken = display.figure(
    display.ofTrades(st.brokenTradeIds, st.brokenNet),
  );
  const r = st.kept + st.broken === 0 ? null : st.kept / (st.kept + st.broken);
  const losersOnly = rule.showWhen === 'loser';
  return {
    rate:
      r === null ? (
        <span className="text-faint">Not checked yet</span>
      ) : (
        <span className="block">
          <span className="flex items-baseline gap-2 whitespace-nowrap">
            <b className="font-semibold">{pctText(r)}</b>
            <span className="text-[12.5px] text-faint">
              {st.kept} of {st.kept + st.broken}
            </span>
          </span>
          <span
            aria-hidden="true"
            className="mt-1 block h-1.5 w-full max-w-[104px] overflow-hidden rounded-full bg-sunken"
          >
            <i
              className="block h-full rounded-full bg-accent"
              style={{ width: `${r * 100}%` }}
            />
          </span>
        </span>
      ),
    followed:
      st.kept === 0 ? (
        <span className="text-faint">None</span>
      ) : (
        <FigureText f={kept} />
      ),
    broken:
      st.broken === 0 ? (
        <span className="text-faint">Never broken</span>
      ) : (
        <FigureText f={broken} />
      ),
    // A losers-only rule is kept only on losing trades: a win rate or profit factor of them says nothing.
    winRate: losersOnly ? LOSERS_ONLY : pctText(st.followedWinRate, 1),
    pf: losersOnly ? LOSERS_ONLY : pfText(st.followedProfitFactor),
    followedNet: st.followedNet,
    brokenNet: st.brokenNet,
  };
}

function Fig({
  id,
  label,
  basis,
  children,
  tone = '',
}: {
  id: MetricId;
  label: string;
  basis: 'net' | 'gross';
  children: React.ReactNode;
  tone?: string;
}): React.JSX.Element {
  return (
    <div className="min-w-0">
      <span className="block text-[12px] text-faint">
        <MetricTip id={id} basis={basis}>
          {label}
        </MetricTip>
      </span>
      <span className={`block text-[14px] tabular-nums ${tone}`}>
        {children}
      </span>
    </div>
  );
}

function RuleChips({
  rule,
  costly,
}: {
  rule: Rule;
  costly: boolean;
}): React.JSX.Element {
  return (
    <>
      {rule.showWhen !== 'always' ? (
        <Chip tone="warn" className="ml-2">
          {SHOW_WHEN_CHIP[rule.showWhen]}
        </Chip>
      ) : null}
      {costly ? (
        <Chip tone="warn" className="ml-2">
          Costliest
        </Chip>
      ) : null}
    </>
  );
}

function RuleTable({
  f,
  basis,
}: {
  f: StrategyFigures;
  basis: 'net' | 'gross';
}): React.JSX.Element {
  const display = useDisplay();
  const byId = new Map(f.rules.map((r) => [r.ruleId, r]));
  // The costliest rule is the one whose broken trades lost the most, when it lost anything.
  // A losers-only rule is graded on losers alone, so its broken trades always lost: it never takes the flag.
  const losersOnly = new Set(
    f.strategy.groups.flatMap((g) =>
      g.rules.filter((r) => r.showWhen === 'loser').map((r) => r.id),
    ),
  );
  const costliest = f.rules.reduce<RuleStat | undefined>(
    (worst, r) =>
      !losersOnly.has(r.ruleId) && r.brokenNet < (worst?.brokenNet ?? 0)
        ? r
        : worst,
    undefined,
  );
  const costly = (rule: Rule) =>
    costliest?.ruleId === rule.id && f.rules.length > 1;
  const groupRate = (g: RuleGroup): number | null => {
    const rows = g.rules.flatMap((r) => byId.get(r.id) ?? []);
    const kept = rows.reduce((n, r) => n + r.kept, 0);
    const broken = rows.reduce((n, r) => n + r.broken, 0);
    return kept + broken === 0 ? null : kept / (kept + broken);
  };
  const groupLine = (g: RuleGroup) => {
    const rate = groupRate(g);
    return (
      <>
        <b className="font-semibold text-text">{g.title}</b> {g.rules.length}{' '}
        {plural(g.rules.length, 'rule')}
        {rate !== null ? (
          <span className="ml-3 tabular-nums">{pctText(rate)} kept</span>
        ) : null}
      </>
    );
  };

  return (
    <>
      {/* Under sm there is no room for six columns: one card per rule. */}
      <ul aria-label="Rules, one card each" className="mt-2 sm:hidden">
        {f.strategy.groups.map((g) => (
          <li key={g.id}>
            <p className="rounded-[8px] bg-sunken/70 px-2.5 py-1.5 text-[12.5px] text-muted">
              {groupLine(g)}
            </p>
            <ul>
              {g.rules.map((rule) => {
                const c = ruleCells(byId.get(rule.id)!, rule, display);
                return (
                  <li
                    key={rule.id}
                    className="flex flex-col gap-2.5 border-b border-line/70 py-3 text-[13.5px]"
                  >
                    <span className="font-medium text-text">
                      {rule.text}
                      <RuleChips rule={rule} costly={costly(rule)} />
                    </span>
                    <div
                      data-line=""
                      className="grid grid-cols-[1fr_1fr_1fr] gap-x-3"
                    >
                      <Fig
                        basis={basis}
                        id="rule-follow-rate"
                        label="Follow rate"
                      >
                        {c.rate}
                      </Fig>
                      <Fig
                        basis={basis}
                        id="rule-followed-pnl"
                        label="P&L when followed"
                        tone={signTone(c.followedNet)}
                      >
                        {c.followed}
                      </Fig>
                      <Fig
                        basis={basis}
                        id="rule-cost-broken"
                        label="Cost when broken"
                        tone={signTone(c.brokenNet)}
                      >
                        {c.broken}
                      </Fig>
                    </div>
                    <div data-line="" className="grid grid-cols-2 gap-x-3">
                      <Fig
                        basis={basis}
                        id="rule-followed-win-rate"
                        label="Win rate kept"
                      >
                        {c.winRate}
                      </Fig>
                      <Fig basis={basis} id="rule-followed-pf" label="PF kept">
                        {c.pf}
                      </Fig>
                    </div>
                  </li>
                );
              })}
            </ul>
          </li>
        ))}
      </ul>

      <div
        role="region"
        aria-label="Rules, scrolls sideways"
        tabIndex={0}
        className="mt-2 overflow-x-auto outline-offset-2 focus-visible:outline-2 focus-visible:outline-accent max-sm:hidden"
      >
        <table
          aria-label="Rules"
          className="w-full min-w-[600px] text-[13.5px]"
        >
          <thead>
            <tr className="border-b border-line">
              <th scope="col" className={TH}>
                Rule
              </th>
              <Head basis={basis} id="rule-follow-rate">
                Follow rate
              </Head>
              <Head basis={basis} id="rule-followed-pnl">
                P&amp;L when followed
              </Head>
              <Head basis={basis} id="rule-cost-broken">
                Cost when broken
              </Head>
              <Head basis={basis} id="rule-followed-win-rate">
                Win rate kept
              </Head>
              <Head basis={basis} id="rule-followed-pf">
                PF kept
              </Head>
            </tr>
          </thead>
          {f.strategy.groups.map((g: RuleGroup) => (
            <tbody key={g.id}>
              <tr className="bg-sunken/70">
                <th
                  scope="rowgroup"
                  colSpan={6}
                  className="rounded-[8px] px-2.5 py-1.5 text-left text-[12.5px] font-normal text-muted"
                >
                  {groupLine(g)}
                </th>
              </tr>
              {g.rules.map((rule) => {
                const c = ruleCells(byId.get(rule.id)!, rule, display);
                return (
                  <tr key={rule.id} className="border-b border-line/70">
                    <td className={`${TD} min-w-[190px] font-medium text-text`}>
                      {rule.text}
                      <RuleChips rule={rule} costly={costly(rule)} />
                    </td>
                    <td className={`${TD} tabular-nums`}>{c.rate}</td>
                    <td
                      className={`${TD} tabular-nums ${signTone(c.followedNet)}`}
                    >
                      {c.followed}
                    </td>
                    <td
                      className={`${TD} tabular-nums ${signTone(c.brokenNet)}`}
                    >
                      {c.broken}
                    </td>
                    <td className={`${TD} tabular-nums`}>{c.winRate}</td>
                    <td className={`${TD} tabular-nums`}>{c.pf}</td>
                  </tr>
                );
              })}
            </tbody>
          ))}
        </table>
      </div>
    </>
  );
}

function Stat({
  label,
  value,
  sub,
  tone = '',
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: string;
}) {
  return (
    <div className="min-w-0 border-b border-line/70 py-3 odd:pr-4 even:border-l even:pl-4 [&:nth-last-child(-n+2)]:border-b-0">
      <span className="block text-[12px] text-faint">{label}</span>
      <b
        className={`mt-0.5 block text-[18px] font-semibold tracking-[-0.02em] tabular-nums ${tone}`}
      >
        {value}
      </b>
      {sub ? <small className="text-[12px] text-faint">{sub}</small> : null}
    </div>
  );
}

function Header({
  s,
  tradeCount,
  leftOut,
}: {
  s: Strategy;
  tradeCount: number;
  leftOut: number;
}): React.JSX.Element {
  const update = useUpdateStrategy();
  const Glyph = iconOf(s);
  const archived = s.status === 'archived';
  return (
    <section
      aria-labelledby="strategy-h"
      className={`${CARD} flex flex-wrap items-center gap-x-4 gap-y-3 px-[22px] py-4`}
    >
      <IconTile
        icon={Glyph}
        tone="accent"
        className="!size-9 !rounded-[10px]"
      />
      <div className="min-w-0 flex-[1_1_260px]">
        <h2
          id="strategy-h"
          className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[20px] leading-[1.25] font-semibold tracking-[-0.03em] text-text"
        >
          {s.name}
          <Chip tone={archived ? 'warn' : 'neutral'}>
            {archived ? 'Archived' : 'Active'}
          </Chip>
        </h2>
        {s.description ? (
          <p className="mt-0.5 text-[14px] leading-[1.5] text-muted">
            {s.description}
          </p>
        ) : null}
      </div>
      {s.assetClasses.length > 0 ? (
        <ul aria-label="Asset classes" className="flex flex-wrap gap-1.5">
          {s.assetClasses.map((a) => (
            <li key={a}>
              <Chip>{ASSET_LABEL[a]}</Chip>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="flex flex-wrap items-center gap-2 lg:ml-auto">
        <Link
          href={`/app/strategies/${encodeURIComponent(s.id)}/edit`}
          className={buttonClasses('secondary')}
        >
          <PencilSimple size={16} aria-hidden="true" />
          Edit strategy
        </Link>
        <Button
          variant="secondary"
          disabled={update.isPending}
          onClick={() =>
            update.mutate({
              id: s.id,
              patch: { status: archived ? 'active' : 'archived' },
            })
          }
        >
          <Archive size={16} aria-hidden="true" />
          {archived ? 'Unarchive' : 'Archive'}
        </Button>
        <Link
          href={`/app/trades?strategy=${encodeURIComponent(s.id)}`}
          className={buttonClasses('primary')}
        >
          <ListBullets size={16} aria-hidden="true" />
          View {tradeCount} {plural(tradeCount, 'trade')}
        </Link>
      </div>
      <LeftOutNote count={leftOut} className="basis-full" />
      {update.isError ? (
        <ArchiveFailed
          name={s.name}
          archiving={update.variables?.patch.status === 'archived'}
          className="basis-full"
        />
      ) : null}
    </section>
  );
}

function StrategyBody({
  s,
  f,
  basis,
}: {
  s: Strategy;
  f: StrategyFigures;
  basis: 'net' | 'gross';
}): React.JSX.Element {
  // Read inside the provider, so every figure knows its trades.
  const display = useDisplay();
  const { summary } = f;
  const avgWin =
    summary.avgWin === null
      ? null
      : display.figure(display.meanOfTrades(f.winIds, summary.avgWin));
  const drawdown = display.figure(display.ofTrades(f.drawdownIds, -f.drawdown));
  const pnl = display.figure(display.ofTrades(f.closedIds, f.pnl));
  const expectancy = display.figure(
    display.meanOfTrades(f.closedIds, summary.expectancy ?? 0),
  );
  const broken = display.figure(display.ofTrades(f.broken.ids, f.broken.pnl));

  return (
    <div className="flex min-w-0 flex-col gap-4 px-5 pt-1 pb-5 lg:pt-0">
      <Link
        href="/app/strategies"
        className="inline-flex min-h-8 w-fit items-center rounded-chip text-[13px] font-semibold text-accent-ink outline-offset-2 hover:text-accent-hover focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:min-h-11 lg:hidden"
      >
        Back to strategies
      </Link>
      <Header s={s} tradeCount={f.tradeCount} leftOut={f.leftOut} />
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_390px]">
        <div className="flex min-w-0 flex-col gap-4">
          <section aria-labelledby="rules-h" className={`${CARD} ${PAD}`}>
            <CardHeader
              icon={ListChecks}
              tone="accent"
              headingId="rules-h"
              title="Rules"
              after={
                <Caption>
                  Each rule is read on the trades its show-when fits.
                </Caption>
              }
            />
            {s.groups.every((g) => g.rules.length === 0) ? (
              <p className="mt-3 text-[14px] text-muted">
                No rules yet.{' '}
                <Link
                  href={`/app/strategies/${encodeURIComponent(s.id)}/edit`}
                  className="font-semibold text-accent-ink hover:text-accent-hover"
                >
                  Add some
                </Link>{' '}
                to grade your trades against them.
              </p>
            ) : (
              <RuleTable f={f} basis={basis} />
            )}
          </section>

          <section aria-labelledby="equity-h" className={`${CARD} ${PAD}`}>
            <CardHeader
              icon={ChartLineUp}
              tone="accent"
              headingId="equity-h"
              title="Equity"
              after={
                <Caption>
                  Cumulative {basis} P&amp;L of this strategy, by close date
                </Caption>
              }
              end={
                <b
                  className={`text-[15px] font-semibold tabular-nums ${signTone(f.pnl)}`}
                >
                  <FigureText f={pnl} />
                </b>
              }
            />
            <div className="mt-3">
              {f.equity.length >= 3 ? (
                <EquityLine f={f} />
              ) : (
                <p className="py-6 text-[14px] text-faint">
                  The line starts with the first closed trade.
                </p>
              )}
            </div>
          </section>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <section aria-labelledby="stats-h" className={`${CARD} ${PAD}`}>
            <CardHeader
              icon={ChartBar}
              tone="accent"
              headingId="stats-h"
              title="Stats"
              end={<Caption>all time</Caption>}
            />
            <div className="mt-2 grid grid-cols-2">
              <Stat
                label={<MetricTip id="pnl" basis={basis} />}
                value={<FigureText f={pnl} />}
                tone={signTone(f.pnl)}
                sub={`${summary.closedCount} closed, ${summary.openCount} open`}
              />
              <Stat
                label={<MetricTip id="win-rate" basis={basis} />}
                value={pctText(summary.winRate, 1)}
                sub={`${summary.wins} won, ${summary.losses} lost`}
              />
              <Stat
                label={<MetricTip id="profit-factor" basis={basis} />}
                value={pfText(summary.profitFactor)}
                sub={
                  avgWin === null ? undefined : (
                    <>
                      avg win <FigureText f={avgWin!} />
                    </>
                  )
                }
              />
              <Stat
                label={<MetricTip id="expectancy" basis={basis} />}
                value={
                  summary.expectancy === null ? (
                    'None'
                  ) : (
                    <FigureText f={expectancy} />
                  )
                }
                tone={signTone(summary.expectancy ?? 0)}
                sub="per trade"
              />
              <Stat
                label={<MetricTip id="rule-adherence" basis={basis} />}
                value={pctText(f.adherence, 1)}
                sub="of rule checks kept"
              />
              <Stat
                label={<MetricTip id="broken-rules-cost" basis={basis} />}
                value={
                  f.broken.ids.length === 0 ? 'None' : <FigureText f={broken} />
                }
                tone={signTone(f.broken.pnl)}
                sub={`on ${f.broken.ids.length} ${plural(f.broken.ids.length, 'trade')}`}
              />
              <Stat
                label={<MetricTip id="max-drawdown" basis={basis} />}
                value={f.drawdown === 0 ? 'None' : <FigureText f={drawdown} />}
                tone={f.drawdown === 0 ? '' : 'text-loss'}
                sub="closed-trade equity"
              />
              <Stat
                label={<MetricTip id="win-streak" basis={basis} />}
                value={`${f.streaks.maxWin} ${plural(f.streaks.maxWin, 'win')}`}
                sub={`longest losing run ${f.streaks.maxLoss}`}
              />
            </div>
          </section>

          <section aria-labelledby="checklist-h" className={`${CARD} ${PAD}`}>
            <CardHeader
              icon={CheckSquare}
              tone="accent"
              headingId="checklist-h"
              title="Checklist"
              end={
                <Caption>
                  {s.checklist.length} {plural(s.checklist.length, 'item')}
                </Caption>
              }
            />
            <p className="mt-2 text-[12.5px] leading-[1.45] text-faint">
              Ticked before each entry. Each item is its own yes or no on the
              trade.
            </p>
            {s.checklist.length === 0 ? (
              <p className="mt-3 text-[14px] text-muted">No checklist items.</p>
            ) : (
              <ul className="mt-2">
                {s.checklist.map((text, i) => (
                  <li
                    key={`${i}-${text}`}
                    className="flex min-h-[42px] items-center gap-3 border-b border-line/70 text-[14px] font-medium last:border-b-0"
                  >
                    <span
                      aria-hidden="true"
                      className="size-[18px] flex-none rounded-[6px] border border-line-2 bg-surface-1 shadow-[var(--shadow-chip)]"
                    />
                    {text}
                  </li>
                ))}
              </ul>
            )}
            <Link
              href={`/app/strategies/${encodeURIComponent(s.id)}/edit`}
              className="mt-2 inline-flex min-h-8 items-center gap-1.5 rounded-chip text-[13px] font-semibold text-accent-ink outline-offset-2 hover:text-accent-hover focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:min-h-11"
            >
              Edit the checklist
            </Link>
          </section>
        </div>
      </div>
    </div>
  );
}

/** One strategy: its rules with what each is worth, its stats, equity and checklist. */
export function StrategyView({ id }: { id: string }): React.JSX.Element {
  const found = useStrategy(id);
  const { data, error } = useStrategyData();
  const queryClient = useQueryClient();

  const failure = error ?? found.error;
  if (failure)
    return (
      <StrategyError
        error={failure}
        onRetry={() => void queryClient.resetQueries({ queryKey: ['keel'] })}
      />
    );
  if (found.isPending || !data)
    return <StrategySkeleton label="Loading the strategy" rows={2} />;
  const f = data.figures.get(id);
  if (!found.data || !f) return <NoStrategy />;

  return (
    <FigureSourceContext.Provider value={data.source}>
      <StrategyBody s={found.data} f={f} basis={data.basis} />
    </FigureSourceContext.Provider>
  );
}
