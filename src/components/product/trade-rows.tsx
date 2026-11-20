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

/** A trade list in the product's row layout: time, symbol, side, tags, signed net. */
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
    <ul className="border-t border-line font-mono text-[12.5px]">
      {trades.map((t) => (
        <li
          key={t.id}
          className="grid grid-cols-[96px_48px_1fr_auto] items-center gap-2 border-t border-line px-3.5 py-2.5 whitespace-nowrap first:border-t-0 sm:grid-cols-[96px_70px_64px_1fr_92px]"
        >
          <span className="text-faint">{shortTime(t.openedAt)}</span>
          <span>{t.instrument.symbol}</span>
          <span>
            <SideChip side={t.direction} />
          </span>
          <span className="flex flex-wrap gap-1 font-sans max-sm:hidden">
            {shown(t).map((tag) => (
              <Chip
                key={tag.id}
                tone={tag.category === 'mistake' ? 'loss' : 'neutral'}
              >
                {tag.name}
              </Chip>
            ))}
          </span>
          <span
            className={`text-right ${t.net > 0 ? 'text-gain' : t.net < 0 ? 'text-loss' : ''}`}
          >
            {formatPnl(t.net, t.pnlCurrency)}
          </span>
        </li>
      ))}
    </ul>
  );
}
