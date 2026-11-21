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
  inset,
}: {
  trades: readonly Trade[];
  tags: readonly Tag[];
  /** Show only the most telling tags per row, mistakes first. */
  maxTags?: number;
  /**
   * Keep clear of a card floating over the left edge at lg and up: the list
   * starts past it, and between lg and xl the time column steps aside.
   */
  inset?: boolean;
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
    <ul
      className={`mr-4 text-[13px] tnum ${inset ? 'ml-4 lg:ml-[272px] xl:ml-[244px]' : 'ml-4'}`}
    >
      {trades.map((t) => (
        <li
          key={t.id}
          className={`grid grid-cols-[92px_52px_1fr_auto] items-center gap-2 border-t border-line py-2.5 whitespace-nowrap first:border-t-0 sm:grid-cols-[96px_64px_60px_1fr_92px] ${inset ? 'lg:max-xl:grid-cols-[minmax(0,1fr)_92px] xl:grid-cols-[64px_60px_minmax(0,1fr)_92px]' : ''}`}
        >
          <span className={`text-muted ${inset ? 'lg:hidden' : ''}`}>
            {shortTime(t.openedAt)}
          </span>
          <span
            className={`font-semibold tracking-[0.01em] ${inset ? 'lg:max-xl:hidden' : ''}`}
          >
            {t.instrument.symbol}
          </span>
          <span className={inset ? 'lg:max-xl:hidden' : ''}>
            <SideChip side={t.direction} />
          </span>
          <span className="flex min-w-0 flex-wrap gap-1 max-sm:hidden">
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
