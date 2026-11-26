// Link chips (spec §5.6, B34): a trade or a day in the line of text, drawn as
// a small chip that opens its page. A chip stores an id (a trade's) or a date
// (a day's) and nothing else: what it shows is read when it is drawn, so a
// note holds no money and a Privacy setting reaches the chip.
import { Node } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { DayChipView, TradeChipView } from '../link-chip-view';

const TRADE_ID = /^[\w.:-]{1,80}$/;

/** A real calendar date written YYYY-MM-DD. */
export function isDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false;
  const d = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export const TradeLink = Node.create({
  name: 'tradeLink',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return { tradeId: { default: null } };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-keel-trade-link]',
        getAttrs: (el) => {
          const id = el.getAttribute('data-trade-id') ?? '';
          return TRADE_ID.test(id) ? { tradeId: id } : false;
        },
      },
    ];
  },
  renderHTML({ node }) {
    return [
      'span',
      {
        'data-keel-trade-link': '',
        'data-trade-id': String(node.attrs.tradeId ?? ''),
      },
      'Trade',
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(TradeChipView);
  },
});

export const DayLink = Node.create({
  name: 'dayLink',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return { date: { default: null } };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-keel-day-link]',
        getAttrs: (el) => {
          const date = el.getAttribute('data-day') ?? '';
          return isDate(date) ? { date } : false;
        },
      },
    ];
  },
  renderHTML({ node }) {
    return [
      'span',
      {
        'data-keel-day-link': '',
        'data-day': String(node.attrs.date ?? ''),
      },
      String(node.attrs.date ?? 'Day'),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(DayChipView);
  },
});
