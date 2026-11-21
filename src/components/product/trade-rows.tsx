import type { Tag, TagCategory, Trade } from '@/domain/types';
import { formatPnl } from '@/lib/format';
import { shortTime } from '@/lib/time-format';
import { Chip, SideChip } from '@/components/ui/chip';

/** Which tag a compact row shows first: the mistake, then the setup. */
const TAG_ORDER: readonly TagCategory[] = [
  'mistake',
  'setup',
  'emotion',
  'custom',
];

/**
 * A trade list in the app's recent-trades layout: time, symbol, a neutral
 * side chip (the word carries it), tags with mistakes in marigold, signed net.
 */
export function TradeRows({
  trades,
  tags,
  maxTags,
}: {
  trades: readonly Trade[];
  tags: readonly Tag[];
  /** Show only the most telling tags per row, mistakes first. */
  maxTags?: number;
}) {
  const byId = new Map(tags.map((t) => [t.id, t]));
  const shown = (t: Trade) =>
    t.tagIds
      .flatMap((id) => {
        const tag = byId.get(id);
        return tag ? [tag] : [];
      })
      .sort(
        (a, b) => TAG_ORDER.indexOf(a.category) - TAG_ORDER.indexOf(b.category),
      )
      .slice(0, maxTags);
  return (
    <ul className="mx-4 text-[13px] tnum">
      {trades.map((t) => (
        <li
          key={t.id}
          className="grid grid-cols-[92px_52px_1fr_auto] items-center gap-2 border-t border-line py-2.5 whitespace-nowrap first:border-t-0 sm:grid-cols-[96px_64px_60px_1fr_92px]"
        >
          <span className="text-muted">{shortTime(t.openedAt)}</span>
          <span className="font-semibold tracking-[0.01em]">
            {t.instrument.symbol}
          </span>
          <span>
            <SideChip side={t.direction} />
          </span>
          <span className="flex flex-wrap gap-1 max-sm:hidden">
            {shown(t).map((tag) => (
              <Chip
                key={tag.id}
                tone={tag.category === 'mistake' ? 'warn' : 'neutral'}
              >
                {tag.name}
              </Chip>
            ))}
          </span>
          <span
            className={`text-right font-medium ${t.net > 0 ? 'text-gain' : t.net < 0 ? 'text-loss' : ''}`}
          >
            {formatPnl(t.net, t.pnlCurrency)}
          </span>
        </li>
      ))}
    </ul>
  );
}
