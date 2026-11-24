import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  CheckCircle,
  SealCheck,
  Star,
  XCircle,
} from '@phosphor-icons/react/dist/ssr';
import { Chip } from '@/components/ui/chip';
import type { TradeRulesSummary } from '@/data/dashboard';
import type { TagInfo, TradeStatus } from '@/data/trade-rows';

/** "a and b", "a, b and c". */
function listOf(items: readonly string[]): string {
  if (items.length < 2) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/** The "+n" that stands for the names after the first: its words are in the title and for a screen reader. */
function More({ rest }: { rest: readonly string[] }): React.JSX.Element {
  return (
    <Chip className="flex-none tabular-nums">
      <span aria-hidden="true">+{rest.length}</span>
      <span className="sr-only">and {listOf(rest)}</span>
    </Chip>
  );
}

/** The strategy names: the first, then "+n". */
export function StrategiesCell({
  names,
}: {
  names: readonly string[];
}): React.JSX.Element {
  const [first, ...rest] = names;
  if (first === undefined) return <span className="text-faint">None</span>;
  return (
    <span
      title={names.join(', ')}
      className="flex min-w-0 items-center gap-1.5"
    >
      <span className="min-w-0 truncate">{first}</span>
      {rest.length > 0 ? <More rest={rest} /> : null}
    </span>
  );
}

/**
 * A tag as its category's colour tints it: the chip's ground and hairline are
 * the colour at low strength, the name stays in ink so it reads on both themes.
 */
export function TagChip({ tag }: { tag: TagInfo }): React.JSX.Element {
  return (
    <span
      title={tag.name}
      style={{
        backgroundColor: `color-mix(in srgb, ${tag.color} 16%, transparent)`,
        boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${tag.color} 38%, transparent)`,
      }}
      className="inline-flex h-[22px] max-w-[100px] min-w-0 items-center rounded-full px-2 text-xs font-[550] text-text"
    >
      <span className="truncate">{tag.name}</span>
    </span>
  );
}

/** A mistake as a chip in the warn tone. */
function MistakeChip({ name }: { name: string }): React.JSX.Element {
  return (
    <Chip tone="warn" className="max-w-[100px] min-w-0">
      <span title={name} className="truncate">
        {name}
      </span>
    </Chip>
  );
}

/**
 * The first of the trade's mistakes (a warn chip) and other tags (each in its
 * category's colour), mistakes first, then "+n" for the rest.
 */
export function TagsCell({
  tags,
  mistakes = [],
}: {
  tags: readonly TagInfo[];
  mistakes?: readonly string[];
}): React.JSX.Element {
  const all = [
    ...mistakes.map((name) => ({ name, tag: undefined })),
    ...tags.map((tag) => ({ name: tag.name, tag })),
  ];
  const [first, ...rest] = all;
  if (first === undefined) return <span className="text-faint">None</span>;
  const names = rest.map((t) => t.name);
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      {first.tag ? (
        <TagChip tag={first.tag} />
      ) : (
        <MistakeChip name={first.name} />
      )}
      {rest.length > 0 ? (
        <span title={names.join(', ')} className="flex-none">
          <More rest={names} />
        </span>
      ) : null}
    </span>
  );
}

/**
 * The tags as one count chip ("1 tag", "3 tags"), in the marigold mistake
 * treatment when any is a mistake. Every name stays for a screen reader; no tag
 * is a faint "None".
 */
export function TagCountCell({
  tags,
  mistakes = [],
}: {
  tags: readonly TagInfo[];
  mistakes?: readonly string[];
}): React.JSX.Element {
  const names = [...mistakes, ...tags.map((t) => t.name)];
  if (names.length === 0) return <span className="text-faint">None</span>;
  return (
    <Chip
      tone={mistakes.length > 0 ? 'warn' : 'neutral'}
      className="flex-none tabular-nums"
    >
      <span aria-hidden="true">
        {names.length} {names.length === 1 ? 'tag' : 'tags'}
      </span>
      <span className="sr-only">
        {mistakes.length > 0 ? 'Tags, with a mistake: ' : 'Tags: '}
        {listOf(names)}
      </span>
    </Chip>
  );
}

/** The first mistake in a warn chip, then "+n". */
export function MistakesCell({
  names,
}: {
  names: readonly string[];
}): React.JSX.Element | null {
  const [first, ...rest] = names;
  if (first === undefined) return null;
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <Chip tone="warn" className="max-w-[88px] min-w-0">
        <span title={first} className="truncate">
          {first}
        </span>
      </Chip>
      {rest.length > 0 ? (
        <span title={rest.join(', ')} className="flex-none">
          <More rest={rest} />
        </span>
      ) : null}
    </span>
  );
}

/** Kept, broken or not graded, as the dashboard's recent trades say it. */
export function RulesCell({
  rules,
}: {
  rules: TradeRulesSummary;
}): React.JSX.Element {
  if (rules.kind === 'ungraded')
    return <span className="text-faint">Not graded</span>;
  if (rules.kind === 'kept')
    return (
      <span className="flex items-center gap-1.5 text-muted">
        <CheckCircle
          size={16}
          weight="fill"
          aria-hidden="true"
          className="flex-none text-gain-fill"
        />
        <span>
          <span className="tabular-nums">{rules.kept}</span> of{' '}
          <span className="tabular-nums">{rules.checked}</span>
          <span className="sr-only"> rules kept</span>
        </span>
      </span>
    );
  const broken = rules.checked - rules.kept;
  return (
    <span
      title={rules.broken.join(', ') || undefined}
      className="flex items-center gap-1.5"
    >
      <XCircle
        size={16}
        weight="fill"
        aria-hidden="true"
        className="flex-none text-loss-fill"
      />
      <span className="font-semibold text-loss">
        <span className="tabular-nums">{broken}</span> broken
      </span>
      {rules.broken.length > 0 ? (
        <span className="sr-only">: {listOf(rules.broken)}</span>
      ) : null}
    </span>
  );
}

/** Five stars, the rating's filled; "None" without one. */
export function RatingCell({
  rating,
}: {
  rating: number | undefined;
}): React.JSX.Element {
  if (rating === undefined) return <span className="text-faint">None</span>;
  return (
    <span
      role="img"
      aria-label={`${rating} of 5`}
      className="inline-flex gap-px"
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          size={10}
          weight={n <= rating ? 'fill' : 'regular'}
          aria-hidden="true"
          className={n <= rating ? 'text-accent' : 'text-line-2'}
        />
      ))}
    </span>
  );
}

/** A seal with a check when reviewed, a dashed circle when not; both say it in words. */
export function ReviewedCell({
  reviewed,
}: {
  reviewed: boolean;
}): React.JSX.Element {
  return reviewed ? (
    <span className="inline-grid place-items-center text-accent">
      <SealCheck size={18} weight="fill" aria-hidden="true" />
      <span className="sr-only">Reviewed</span>
    </span>
  ) : (
    <span className="inline-grid place-items-center">
      <span
        aria-hidden="true"
        className="inline-block size-[15px] rounded-full border-[1.5px] border-dashed border-line-2"
      />
      <span className="sr-only">Not reviewed</span>
    </span>
  );
}

/** The instrument cell's link to the trade, carrying the log's filters (the whole query) so the trade page can return to them. */
export function TradeLink({
  id,
  children,
}: {
  id: string;
  children: React.ReactNode;
}): React.JSX.Element {
  const search = useSearchParams().toString();
  return (
    <Link
      href={`/app/trades/${encodeURIComponent(id)}${search ? `?${search}` : ''}`}
      className="inline-flex min-w-0 rounded-chip underline-offset-4 outline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-accent"
    >
      {children}
    </Link>
  );
}

/**
 * A trade's outcome as a pill. Win, Loss and Breakeven stay neutral, like the
 * side chip: they name a result, not signed money, so gain and loss ink is
 * left to the amounts. Open is the accent.
 */
export function StatusChip({
  status,
}: {
  status: TradeStatus;
}): React.JSX.Element {
  return <Chip tone={status === 'Open' ? 'accent' : 'neutral'}>{status}</Chip>;
}
