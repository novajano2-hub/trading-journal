import { format, parse } from 'date-fns';
import { localDate } from '@/domain/time';
import type { JournalEntry, Trade } from '@/domain/types';
import { SAMPLE_WORKSPACE } from '../workspaces';
import {
  DAY_MS,
  NY,
  dayLabel,
  mondayOf,
  nyIso,
  parseYmd,
  ymd,
} from './calendar';
import { DAILY_REVIEW_BODY } from '@/content/note-templates';
import {
  PHRASES,
  bullets,
  doc,
  heading,
  paragraph,
  type TiptapNode,
} from './content';
import type { Random } from './random';

const WS = SAMPLE_WORKSPACE.id;

// ---- journal ----------------------------------------------------------------

function money(cents: number): string {
  const abs = Math.abs(Math.round(cents / 100));
  const s = String(abs).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${cents < 0 ? '-' : '+'}$${s}`;
}
const picks = (rng: Random, xs: readonly string[], n: number): string[] => {
  const pool = [...xs];
  const out: string[] = [];
  while (out.length < n && pool.length > 0)
    out.push(...pool.splice(rng.int(0, pool.length - 1), 1));
  return out;
};

/** The trades by the New York date they opened. */
function tradesByDay(trades: readonly Trade[]): Map<string, Trade[]> {
  const byDay = new Map<string, Trade[]>();
  for (const t of trades) {
    const d = localDate(t.openedAt, NY);
    byDay.set(d, [...(byDay.get(d) ?? []), t]);
  }
  return byDay;
}

function daySummary(day: readonly Trade[]): string {
  const closed = day.filter((t) => t.status === 'closed');
  const net = closed.reduce((s, t) => s + t.net, 0);
  const w = closed.filter((t) => t.net > 0).length;
  return `${day.length} trades, ${w} won and ${closed.length - w} did not. Net ${money(net)} after costs.`;
}

/** Pre-market plans, weekly recaps and trade notes (kind `trade-note`), on the generator's main stream. */
export function writeJournal(
  rng: Random,
  trades: readonly Trade[],
  days: readonly string[],
  lastDay: string,
): JournalEntry[] {
  const journal: JournalEntry[] = [];
  let serial = 0;
  const nextId = () => `sample-journal-${String(++serial).padStart(4, '0')}`;
  const add = (
    e: Omit<JournalEntry, 'id' | 'workspaceId' | 'tags'>,
  ): JournalEntry => {
    const entry: JournalEntry = {
      id: nextId(),
      workspaceId: WS,
      ...e,
      tags: [],
    };
    journal.push(entry);
    return entry;
  };

  const byDay = tradesByDay(trades);

  for (const date of days) {
    const day = byDay.get(date);
    if (!day) continue;
    if (date === days[0] || rng.chance(0.75)) {
      add({
        kind: 'pre-market',
        date,
        title: `Plan for ${dayLabel(date)}`,
        body: doc(
          heading('Market view'),
          paragraph(rng.pick(PHRASES.marketView)),
          heading('Plan'),
          bullets(picks(rng, PHRASES.planItems, 3)),
          heading('Risk'),
          paragraph(rng.pick(PHRASES.riskNotes)),
        ),
        linkedTradeIds: [],
        updatedAt: nyIso(date, 8, 40 + rng.int(0, 15)),
      });
    }
    if (date === lastDay || rng.chance(0.88)) {
      // Plan 4 wrote a daily review here. Its draws and its id stay, so the
      // stream and every later entry (and the trades' notes) are unchanged;
      // the daily notes now come from the template, in `writeDailyNotes`.
      picks(rng, PHRASES.wentWell, 2);
      picks(rng, PHRASES.toImprove, 2);
      rng.pick(PHRASES.lessons);
      rng.int(0, 25);
      nextId();
    }
  }

  // Weekly recaps, one for each completed week.
  const weeks = new Map<string, string[]>();
  for (const d of days)
    weeks.set(mondayOf(d), [...(weeks.get(mondayOf(d)) ?? []), d]);
  for (const [monday, wdays] of weeks) {
    const friday = ymd(parseYmd(monday) + 4 * DAY_MS);
    if (!wdays.includes(friday)) continue;
    const wt = wdays.flatMap((d) => byDay.get(d) ?? []);
    const closed = wt.filter((t) => t.status === 'closed');
    if (closed.length === 0) continue;
    const net = closed.reduce((s, t) => s + t.net, 0);
    const wins = closed.filter((t) => t.net > 0).length;
    const best = closed.reduce((a, b) => (b.net > a.net ? b : a));
    const worst = closed.reduce((a, b) => (b.net < a.net ? b : a));
    add({
      kind: 'weekly-recap',
      date: friday,
      title: `Week of ${dayLabel(monday, false)}`,
      body: doc(
        heading('The week in numbers'),
        paragraph(
          `${closed.length} closed trades, ${Math.round((wins / closed.length) * 100)}% winners, net ${money(net)}.`,
        ),
        bullets([
          `Best trade: ${best.instrument.symbol} ${best.direction}, ${money(best.net)}.`,
          `Worst trade: ${worst.instrument.symbol} ${worst.direction}, ${money(worst.net)}.`,
        ]),
        heading('Next week'),
        bullets(picks(rng, PHRASES.weeklyFocus, 2)),
      ),
      linkedTradeIds: [...new Set([best.id, worst.id])],
      updatedAt: nyIso(friday, 17, 30 + rng.int(0, 20)),
    });
  }

  // About 40 trade notes: the biggest results, then a random spread.
  const closed = trades.filter((t) => t.status === 'closed');
  const ranked = [...closed].sort((a, b) => b.net - a.net);
  const chosen = new Set<Trade>([...ranked.slice(0, 8), ...ranked.slice(-8)]);
  const rest = closed.filter((t) => !chosen.has(t));
  while (chosen.size < 40 && rest.length > 0)
    chosen.add(rest.splice(rng.int(0, rest.length - 1), 1)[0]!);
  for (const t of trades.filter((x) => chosen.has(x))) {
    const when = t.closedAt ?? t.openedAt;
    const note = add({
      kind: 'trade-note',
      date: localDate(when, NY),
      // As the repository titles a trade's note: the symbol, then the day it opened.
      title: `${t.instrument.symbol} : ${format(parse(localDate(t.openedAt, NY), 'yyyy-MM-dd', new Date(0)), 'd MMM yyyy')}`,
      body: doc(
        paragraph(`Thesis: ${rng.pick(PHRASES.thesis)}`),
        paragraph(`Execution: ${rng.pick(PHRASES.execution)}`),
        paragraph(
          `Result: ${money(t.net)} net. ${rng.pick(PHRASES.lessonsTrade)}`,
        ),
      ),
      linkedTradeIds: [t.id],
      updatedAt: new Date(
        Date.parse(when) + rng.int(10, 90) * 60_000,
      ).toISOString(),
    });
    t.noteId = note.id;
  }
  return journal;
}

/**
 * A copy of the template with each empty paragraph filled: under a prompt
 * heading from `answers[heading]`, in a section with no prompts from
 * `answers[section title]`.
 */
function fillPrompts(
  node: TiptapNode,
  answers: Readonly<Record<string, string>>,
  section = '',
): TiptapNode {
  const textOf = (n: TiptapNode | undefined) =>
    (n?.content ?? []).map((c) => c.text ?? '').join('');
  const title =
    node.type === 'details'
      ? textOf(node.content?.find((c) => c.type === 'detailsSummary'))
      : section;
  let label = title;
  const content = node.content?.map((child) => {
    if (child.type === 'heading') label = textOf(child);
    const answer = answers[label];
    if (child.type === 'paragraph' && !child.content && answer !== undefined)
      return paragraph(answer);
    return fillPrompts(child, answers, title);
  });
  return content ? { ...node, content } : { ...node };
}

const DAILY_NOTE_DAYS = 20;

/** Daily review notes for the last 20 trading days, from the daily template with short filled-in text. */
export function writeDailyNotes(
  rng: Random,
  trades: readonly Trade[],
  days: readonly string[],
): JournalEntry[] {
  const byDay = tradesByDay(trades);
  const traded = days.filter((d) => byDay.has(d)).slice(-DAILY_NOTE_DAYS);
  return traded.map((date) => {
    const day = byDay.get(date)!;
    const roots = [...new Set(day.map((t) => t.instrument.root))];
    const body = fillPrompts(DAILY_REVIEW_BODY, {
      Watchlist: `${roots.join(', ')}.`,
      'News and events': rng.pick(PHRASES.news),
      Bias: rng.pick(PHRASES.marketView),
      Levels: rng.pick(PHRASES.levels),
      'Game plan': rng.pick(PHRASES.planItems),
      'Session log': daySummary(day),
      'How the day went': rng.pick(PHRASES.lessons),
      'What worked': rng.pick(PHRASES.wentWell),
      "What didn't": rng.pick(PHRASES.toImprove),
      'One thing to do better': rng.pick(PHRASES.weeklyFocus),
    });
    return {
      id: `sample-daily-${date}`,
      workspaceId: WS,
      kind: 'daily-review',
      date,
      title: `Daily review, ${dayLabel(date)}`,
      body,
      linkedTradeIds: day.map((t) => t.id),
      tags: [],
      updatedAt: nyIso(date, 16, 30 + rng.int(0, 25)),
    };
  });
}

/**
 * Short daily reviews for dates the routine stamps a note on that have none:
 * the daily template with its first prompts filled in. Ids start `routine-note-`.
 */
export function writeRoutineNotes(
  rng: Random,
  trades: readonly Trade[],
  dates: readonly string[],
): JournalEntry[] {
  const byDay = tradesByDay(trades);
  return dates.map((date) => {
    const day = byDay.get(date) ?? [];
    const roots = [...new Set(day.map((t) => t.instrument.root))];
    const body = fillPrompts(DAILY_REVIEW_BODY, {
      Watchlist: `${roots.join(', ')}.`,
      'Game plan': rng.pick(PHRASES.planItems),
      'Session log': daySummary(day),
    });
    return {
      id: `routine-note-${date}`,
      workspaceId: WS,
      kind: 'daily-review',
      date,
      title: `Daily review, ${dayLabel(date)}`,
      body,
      linkedTradeIds: day.map((t) => t.id),
      tags: [],
      updatedAt: nyIso(date, 16, 30 + rng.int(0, 25)),
    };
  });
}
