'use client';

import { Check, Plus, Warning } from '@phosphor-icons/react/dist/ssr';
import { Chip } from '@/components/ui/chip';
import { MetricTip } from '@/components/ui/metric-tip';
import {
  STYLE_LABEL,
  TEMPLATE_AUTHOR,
  exampleStats,
  type StrategyTemplate,
} from '@/content/strategy-templates';
import { formatRatio, plural } from '@/lib/format';
import { CARD } from '../dashboard/shared';
import { ASSET_LABEL, pctText } from './strategy-style';

/**
 * A template's cover: its inline SVG, drawn in the app's tokens so it follows
 * the theme. Hand it a size; the drawing fills the width. Decorative: the
 * caller names it when it stands alone.
 */
export function TemplateCover({
  t,
  className = '',
}: {
  t: StrategyTemplate;
  className?: string;
}): React.JSX.Element {
  return (
    <span
      aria-hidden="true"
      className={`block overflow-hidden [&>svg]:block [&>svg]:h-auto [&>svg]:w-full ${className}`}
      // Keel's own drawing, a constant of the app: never the trader's text.
      dangerouslySetInnerHTML={{ __html: t.cover }}
    />
  );
}

const STYLE_CHIP =
  'inline-flex h-[22px] items-center rounded-full px-2 text-xs font-[550] text-muted shadow-[inset_0_0_0_1px_var(--line-2)]';

/**
 * The styles (outlined) then the asset classes (filled) a template covers. A
 * list on a card; `plain` is spans only, for inside a button.
 */
export function TemplateChips({
  t,
  className = '',
  plain = false,
}: {
  t: StrategyTemplate;
  className?: string;
  plain?: boolean;
}): React.JSX.Element {
  const chips = [
    ...t.styles.map((s) => (
      <span key={s} className={STYLE_CHIP}>
        {STYLE_LABEL[s]}
      </span>
    )),
    ...t.assetClasses.map((a) => <Chip key={a}>{ASSET_LABEL[a]}</Chip>),
  ];
  const box = `flex flex-wrap gap-1.5 ${className}`;
  return plain ? (
    <span className={box}>{chips}</span>
  ) : (
    <ul aria-label="Style and asset classes" className={box}>
      {chips.map((c) => (
        <li key={c.key}>{c}</li>
      ))}
    </ul>
  );
}

function Fig({
  label,
  value,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className="min-w-0 px-4 first:pl-0 max-sm:px-0 sm:[&:not(:first-child)]:border-l sm:[&:not(:first-child)]:border-line">
      <dt className="flex items-center text-[12.5px] whitespace-nowrap text-faint pointer-coarse:min-h-11">
        {label}
      </dt>
      <dd className="text-[20px] leading-[1.4] font-semibold tracking-[-0.03em] whitespace-nowrap tabular-nums">
        {value}
      </dd>
    </div>
  );
}

/**
 * One template on the Templates tab: its name and chips, three figures read
 * from its example trades (and said to be theirs), its cover, and "+" to add a
 * copy. `added` marks a template the trader has already copied; "+" still
 * adds another.
 */
export function TemplateCard({
  t,
  added,
  pending,
  failed,
  onAdd,
}: {
  t: StrategyTemplate;
  added: boolean;
  pending: boolean;
  failed: boolean;
  onAdd(): void;
}): React.JSX.Element {
  const s = exampleStats(t);
  const headingId = `template-${t.id}`;
  return (
    <article
      aria-labelledby={headingId}
      className={`${CARD} grid items-center gap-x-7 gap-y-5 px-[22px] py-[18px] max-sm:px-4 max-sm:py-4 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)_236px]`}
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <h2
            id={headingId}
            className="text-[17px] leading-snug font-semibold tracking-[-0.02em] text-text"
          >
            {t.name}
          </h2>
          <span className="text-[12.5px] font-medium text-faint">
            by {TEMPLATE_AUTHOR}
          </span>
          {added ? (
            <Chip>
              <Check size={12} weight="bold" aria-hidden="true" />
              Added
            </Chip>
          ) : null}
        </div>
        <p className="mt-2 max-w-[40ch] text-[14px] leading-[1.5] text-muted">
          {t.description}
        </p>
        <TemplateChips t={t} className="mt-2.5" />
      </div>

      <div className="min-w-0">
        <p className="mb-1.5 text-[12.5px] text-muted">
          From its{' '}
          <b className="font-semibold text-text">
            {s.trades} example {plural(s.trades, 'trade')}
          </b>
          , not your own
        </p>
        <dl className="grid grid-cols-3">
          <Fig
            label={
              <MetricTip id="win-rate" basis="net">
                Win rate
              </MetricTip>
            }
            value={pctText(s.winRate, 1)}
          />
          <Fig label="Example trades" value={s.trades} />
          <Fig
            label={
              <MetricTip id="avg-win-loss" basis="net">
                Avg win/loss
              </MetricTip>
            }
            value={s.winLoss === null ? 'None' : formatRatio(s.winLoss)}
          />
        </dl>
      </div>

      <div className="relative max-sm:order-first">
        <div role="img" aria-label={`${t.name} cover`}>
          <TemplateCover t={t} className="rounded-[10px] border border-line" />
        </div>
        <button
          type="button"
          onClick={onAdd}
          disabled={pending}
          aria-busy={pending || undefined}
          aria-label={`Add a copy of ${t.name} to My strategies`}
          title="Add a copy"
          className="absolute top-2 right-2 grid size-8 place-items-center rounded-[9px] border border-line-2 bg-surface-1 text-text shadow-[var(--shadow-chip)] outline-offset-2 transition-colors duration-200 ease-(--ease-glide) hover:border-faint focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-default disabled:opacity-60 pointer-coarse:size-11"
        >
          <Plus size={15} weight="bold" aria-hidden="true" />
        </button>
      </div>

      <div aria-live="polite" className="col-span-full -mt-2 empty:hidden">
        {failed ? (
          <p
            role="alert"
            className="flex items-center gap-1.5 text-[13px] text-text"
          >
            <Warning size={14} aria-hidden="true" className="text-muted" />
            Couldn&apos;t add a copy of {t.name}. Try again.
          </p>
        ) : null}
      </div>
    </article>
  );
}
