import { SECTION, AFTER_HEAD, SectionHead } from './section-head';

/** Four straight answers. Nothing here promises more than this release does. */
const QUESTIONS = [
  {
    q: 'Which brokers work?',
    a: 'Any broker whose export is a CSV with five columns, time, symbol, side, quantity and price, can be previewed today. Direct sync is on the roadmap.',
  },
  {
    q: 'Where does my data go?',
    a: 'It stays in your browser in this release.',
  },
  {
    q: 'What does it cost?',
    a: 'To be announced.',
  },
  {
    q: 'Which markets?',
    a: 'Stocks, options, futures, forex and crypto.',
  },
] as const;

export function QuestionsSection() {
  return (
    <section aria-labelledby="questions-title" className={SECTION}>
      <SectionHead id="questions-title" title="Questions from the floor." />
      <dl className={`m-0 border-b-[1.5px] border-ink ${AFTER_HEAD}`}>
        {QUESTIONS.map(({ q, a }) => (
          <div
            key={q}
            className="grid gap-x-16 gap-y-2 border-t-[1.5px] border-ink pt-5 pb-7 md:pt-6 md:pb-9 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]"
          >
            <dt className="font-display text-[28px] leading-[0.95] font-black uppercase md:text-[36px]">
              {q}
            </dt>
            <dd className="m-0 max-w-[34em] text-lg leading-[1.45] font-medium md:text-[21px] xl:pt-1">
              {a}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
