import type { Tag, Trade } from '@/domain/types';
import { formatPnl } from '@/lib/format';
import { shortTime } from '@/lib/ticket-format';
import { Chip, SideChip } from '@/components/ui/chip';

/** A trade list in the product's row layout: time, symbol, side, tags, signed net. */
export function TradeRows({
  trades,
  tags,
}: {
  trades: readonly Trade[];
  tags: readonly Tag[];
}) {
  const byId = new Map(tags.map((t) => [t.id, t]));
  return (
    <ul className="border-t border-line font-mono text-[12.5px]">
      {trades.map((t) => (
        <li
          key={t.id}
          className="grid grid-cols-[80px_60px_1fr_80px] items-center gap-2 border-t border-line px-3.5 py-2.5 first:border-t-0 sm:grid-cols-[96px_70px_64px_1fr_92px]"
        >
          <span className="text-faint">{shortTime(t.openedAt)}</span>
          <span>{t.instrument.symbol}</span>
          <span>
            <SideChip side={t.direction} />
          </span>
          <span className="flex flex-wrap gap-1 font-sans max-sm:hidden">
            {t.tagIds.flatMap((id) => {
              const tag = byId.get(id);
              return tag
                ? [
                    <Chip
                      key={id}
                      tone={tag.category === 'mistake' ? 'loss' : 'neutral'}
                    >
                      {tag.name}
                    </Chip>,
                  ]
                : [];
            })}
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
