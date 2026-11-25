'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ACTION_BUTTON, Actions, WelcomeCard } from './frame';

const WHAT = [
  {
    title: 'About your trading',
    line: 'Six quick questions: how long, with whose capital, where and what you trade.',
  },
  {
    title: 'Your home',
    line: 'Three steps to get your first trades into Keel.',
  },
] as const;

/** The welcome (comp 10): what happens next, and one way on [inv-1 001]. */
export function WelcomeView(): React.JSX.Element {
  const router = useRouter();
  return (
    <WelcomeCard>
      <h1 className="text-center text-[26px] leading-[1.15] font-semibold tracking-[-0.03em] text-balance">
        Welcome to Keel
      </h1>
      <p className="mt-2 text-center text-sm leading-[1.55] text-pretty text-muted">
        A few questions about how you trade. It takes about a minute.
      </p>
      <ol className="mt-[22px] border-t border-line">
        {WHAT.map((item) => (
          <li
            key={item.title}
            className="grid gap-0.5 border-b border-line py-[13px]"
          >
            <b className="text-sm font-semibold">{item.title}</b>
            <span className="text-[13px] leading-[1.5] text-muted">
              {item.line}
            </span>
          </li>
        ))}
      </ol>
      <Actions>
        <Button
          className={`flex-1 ${ACTION_BUTTON}`}
          onClick={() => router.push('/app/welcome/1')}
        >
          Get started
        </Button>
      </Actions>
      <p className="mt-3.5 text-center text-[12.5px] leading-normal text-faint">
        Everything stays in this browser.
      </p>
    </WelcomeCard>
  );
}
