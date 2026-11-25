'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ACTION_BUTTON, Actions, WelcomeCard } from './frame';

/** The welcome (comp 10): a headline, a tagline and one way on, no fields [inv-1 001]. */
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
      <Actions>
        <Button
          className={`flex-1 ${ACTION_BUTTON}`}
          onClick={() => router.push('/app/welcome/1')}
        >
          Get started
        </Button>
      </Actions>
    </WelcomeCard>
  );
}
