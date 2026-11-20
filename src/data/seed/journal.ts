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
import { FOLDERS, PHRASES, bullets, doc, heading, paragraph } from './content';
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

export function writeJournal(
  rng: Random,
  trades: readonly Trade[],
  days: readonly string[],
  lastDay: string,
): JournalEntry[] {
  const journal: JournalEntry[] = [];
  const add = (e: Omit<JournalEntry, 'id' | 'workspaceId'>): JournalEntry => {
    const entry: JournalEntry = {
      id: `sample-journal-${String(journal.length + 1).padStart(4, '0')}`,
      workspaceId: WS,
      ...e,
    };
    journal.push(entry);
    return entry;
  };

  const byDay = new Map<string, Trade[]>();
  for (const t of trades) {
    const d = localDate(t.openedAt, NY);
    byDay.set(d, [...(byDay.get(d) ?? []), t]);
  }

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
        folder: FOLDERS.plan,
        updatedAt: nyIso(date, 8, 40 + rng.int(0, 15)),
      });
    }
    if (date === lastDay || rng.chance(0.88)) {
      const closed = day.filter((t) => t.status === 'closed');
      const net = closed.reduce((s, t) => s + t.net, 0);
      const w = closed.filter((t) => t.net > 0).length;
      add({
        kind: 'daily-review',
        date,
        title: `Daily review, ${dayLabel(date)}`,
        body: doc(
          heading('Summary'),
          paragraph(
            `${day.length} trades, ${w} won and ${closed.length - w} did not. Net ${money(net)} after costs.`,
          ),
          heading('What went well'),
          bullets(picks(rng, PHRASES.wentWell, 2)),
          heading('To improve'),
          bullets(picks(rng, PHRASES.toImprove, 2)),
          heading('Takeaway'),
          paragraph(rng.pick(PHRASES.lessons)),
        ),
        linkedTradeIds: day.map((t) => t.id),
        folder: FOLDERS.daily,
        updatedAt: nyIso(date, 16, 30 + rng.int(0, 25)),
      });
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
      folder: FOLDERS.weekly,
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
      kind: 'note',
      date: localDate(when, NY),
      title: `${t.instrument.symbol} ${t.direction}, ${money(t.net)}`,
      body: doc(
        paragraph(`Thesis: ${rng.pick(PHRASES.thesis)}`),
        paragraph(`Execution: ${rng.pick(PHRASES.execution)}`),
        paragraph(
          `Result: ${money(t.net)} net. ${rng.pick(PHRASES.lessonsTrade)}`,
        ),
      ),
      linkedTradeIds: [t.id],
      folder: FOLDERS.note,
      updatedAt: new Date(
        Date.parse(when) + rng.int(10, 90) * 60_000,
      ).toISOString(),
    });
    t.noteId = note.id;
  }
  return journal;
}
