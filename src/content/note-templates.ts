// The built-in note templates' bodies, as Tiptap JSON. A prompt is a small
// heading over an empty paragraph to write in; the daily review's sections
// are collapsible (`details`).

interface Node {
  type: string;
  attrs?: Record<string, unknown>;
  content?: Node[];
  text?: string;
}

const text = (t: string): Node => ({ type: 'text', text: t });
const empty = (): Node => ({ type: 'paragraph' });
const prompt = (label: string): Node[] => [
  { type: 'heading', attrs: { level: 3 }, content: [text(label)] },
  empty(),
];
const section = (title: string, content: Node[]): Node => ({
  type: 'details',
  attrs: { open: true },
  content: [
    { type: 'detailsSummary', content: [text(title)] },
    { type: 'detailsContent', content },
  ],
});
const doc = (...content: Node[]): Node => ({ type: 'doc', content });

export const DAILY_REVIEW_BODY: Node = doc(
  section('Preparation', [
    ...prompt('Watchlist'),
    ...prompt('News and events'),
    ...prompt('Bias'),
    ...prompt('Levels'),
    ...prompt('Game plan'),
  ]),
  section('Session log', [empty()]),
  section('End of day', [
    ...prompt('How the day went'),
    ...prompt('What worked'),
    ...prompt("What didn't"),
    ...prompt('One thing to do better'),
  ]),
);

export const PRE_MARKET_BODY: Node = doc(
  ...prompt('Bias'),
  ...prompt('Levels'),
  ...prompt('Setups to watch'),
  ...prompt('Risk for the day'),
);

export const WEEKLY_RECAP_BODY: Node = doc(
  ...prompt('The week in numbers'),
  ...prompt('Best and worst trade'),
  ...prompt('Rules broken'),
  ...prompt('Focus for next week'),
);

// Keel's three daily templates (K32). Each mirrors the shape of a kind of
// day note, in Keel's own words: a plan before the open, one note for the
// whole day, and a short check-in while the session runs.

export const DAILY_PLAN_BODY: Node = doc(
  ...prompt('What I will trade'),
  ...prompt('Levels that matter'),
  ...prompt('If this, then that'),
  ...prompt('Where I stop for the day'),
);

export const DAILY_FULL_BODY: Node = doc(
  section('Before the open', [
    ...prompt('Watchlist'),
    ...prompt('Levels'),
    ...prompt('Plan'),
  ]),
  section('During the session', [empty()]),
  section('After the close', [
    ...prompt('How it went'),
    ...prompt('What to repeat'),
    ...prompt('What to change'),
  ]),
);

export const DAILY_CHECKIN_BODY: Node = doc(
  ...prompt('How I feel right now'),
  ...prompt('Am I following the plan?'),
  ...prompt('What I am seeing'),
  ...prompt('Next step'),
);
