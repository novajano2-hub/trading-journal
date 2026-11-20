import { Accordion } from '@/components/ui/accordion';
import { SectionHeading } from './section-heading';

const answer = (text: string) => <p className="max-w-[62ch]">{text}</p>;

const QUESTIONS = [
  {
    value: 'brokers',
    title: 'Which brokers work?',
    content: answer(
      'Any export with time, symbol, side, quantity and price columns. Direct broker sync is on the roadmap.',
    ),
  },
  {
    value: 'data',
    title: 'Where does my data go?',
    content: answer(
      'Nowhere yet. Import opens with the app release, and the privacy page says how your files are handled.',
    ),
  },
  {
    value: 'cost',
    title: 'What does it cost?',
    content: answer('Pricing will be announced before accounts open.'),
  },
  {
    value: 'prop',
    title: 'Does it handle prop firm accounts?',
    content: answer(
      'Yes. Enter the rules from your evaluation and Keel tracks them after every trade.',
    ),
  },
] as const;

/** "Questions": four honest answers, one open at a time. */
export function Faq() {
  return (
    <section
      aria-labelledby="faq-title"
      className="mx-auto max-w-[1280px] px-5 py-28 sm:px-10"
    >
      <SectionHeading id="faq-title" title="Questions" />
      <div className="mt-10 max-w-[820px]">
        <Accordion items={QUESTIONS} defaultValue="brokers" />
      </div>
    </section>
  );
}
