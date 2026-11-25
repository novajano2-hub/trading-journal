// @vitest-environment happy-dom
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { MotionGlobalConfig } from 'motion/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { renderApp } from '../__fixtures__/render-app';
import { STEPS } from '@/content/onboarding';
import { SurveyStep } from './survey-step';
import { WelcomeView } from './welcome-view';
import { clearFirstRun, readFirstRun } from './survey-model';

vi.mock('next/navigation', () => import('../__fixtures__/navigation'));
MotionGlobalConfig.skipAnimations = true;

beforeEach(clearFirstRun);
afterEach(cleanup);

const at = (step: string) =>
  renderApp(<SurveyStep step={step} />, { url: `/app/welcome/${step}` });
const click = (el: Element) => fireEvent.click(el);
const cont = () => screen.getByRole('button', { name: 'Continue' });

test('the welcome has one way on, to step 1, and shows no steps list or footnote', async () => {
  renderApp(<WelcomeView />, { url: '/app/welcome' });
  expect(screen.getByRole('heading', { name: 'Welcome to Keel' })).toBeTruthy();
  expect(screen.queryByRole('list')).toBeNull();
  expect(screen.queryByText(/stays in this browser/)).toBeNull();
  click(screen.getByRole('button', { name: 'Get started' }));
  expect(window.location.pathname).toBe('/app/welcome/1');
});

test('the survey has six steps, and Continue stays disabled until the step is answered', async () => {
  expect(STEPS).toHaveLength(6);
  at('1');
  expect(
    await screen.findByRole('heading', { name: STEPS[0]!.title }),
  ).toBeTruthy();
  expect(screen.getByText('Step 1 of 6')).toBeTruthy();
  expect(screen.getByRole('progressbar', { name: 'Step 1 of 6' })).toBeTruthy();
  expect((cont() as HTMLButtonElement).disabled).toBe(true);
  click(screen.getByRole('radio', { name: '1 to 3 years' }));
  expect((cont() as HTMLButtonElement).disabled).toBe(false);
  click(cont());
  expect(window.location.pathname).toBe('/app/welcome/2');
  expect(readFirstRun().draft.experience).toBe('1-3');
});

test('Back appears from step 2', async () => {
  const first = at('1');
  await screen.findByRole('radiogroup');
  expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
  first.unmount();

  // Step 2 is open once step 1 has its answer.
  click((at('1'), await screen.findByRole('radio', { name: '3 to 5 years' })));
  cleanup();
  at('2');
  click(await screen.findByRole('button', { name: 'Back' }));
  expect(window.location.pathname).toBe('/app/welcome/1');
});

test('not yet and the other capital choices clear each other', async () => {
  click((at('1'), await screen.findByRole('radio', { name: '3 to 5 years' })));
  cleanup();
  at('2');
  const own = await screen.findByRole('checkbox', { name: 'My own money' });
  const prop = screen.getByRole('checkbox', { name: "A prop firm's money" });
  const notYet = screen.getByRole('checkbox', { name: 'Not yet' });
  click(own);
  click(prop);
  expect((own as HTMLInputElement).checked).toBe(true);
  expect((prop as HTMLInputElement).checked).toBe(true);
  click(notYet);
  expect((own as HTMLInputElement).checked).toBe(false);
  expect((prop as HTMLInputElement).checked).toBe(false);
  expect((notYet as HTMLInputElement).checked).toBe(true);
  click(prop);
  expect((notYet as HTMLInputElement).checked).toBe(false);
  expect(readFirstRun().draft.capital).toEqual(['prop']);
});

test('a reload mid-survey resumes the answers', async () => {
  click(
    (at('1'), await screen.findByRole('radio', { name: 'More than 5 years' })),
  );
  cleanup();
  // The reload: the page mounts again, and the answer is back.
  at('1');
  const radio = await screen.findByRole('radio', { name: 'More than 5 years' });
  expect((radio as HTMLInputElement).checked).toBe(true);
  expect(sessionStorage.getItem('keel:first-run')).toContain('5-plus');
});

test('a step whose earlier steps are unanswered goes to the first unanswered one', async () => {
  at('4');
  await waitFor(() => expect(window.location.pathname).toBe('/app/welcome/1'));
  cleanup();
  at('nope');
  await waitFor(() => expect(window.location.pathname).toBe('/app/welcome/1'));
});

test('the broker step filters as you type, and Other opens nothing more', async () => {
  at('1');
  click(await screen.findByRole('radio', { name: '1 to 3 years' }));
  cleanup();
  at('2');
  click(await screen.findByRole('checkbox', { name: 'My own money' }));
  cleanup();
  at('3');
  const box = await screen.findByRole('combobox', { name: 'Main broker' });
  fireEvent.change(box, { target: { value: 'inter' } });
  const options = screen.getAllByRole('option');
  // Other and None yet are offered whatever is typed.
  expect(options.map((o) => o.textContent)).toEqual([
    'Interactive Brokers',
    'Other',
    'None yet',
  ]);
  expect((cont() as HTMLButtonElement).disabled).toBe(true);
  click(options[0]!);
  expect((cont() as HTMLButtonElement).disabled).toBe(false);
  expect(readFirstRun().draft.broker).toBe('Interactive Brokers');
});

test('a broker that is not listed can still be answered with Other', async () => {
  at('1');
  click(await screen.findByRole('radio', { name: '1 to 3 years' }));
  cleanup();
  at('2');
  click(await screen.findByRole('checkbox', { name: 'My own money' }));
  cleanup();
  at('3');
  const box = await screen.findByRole('combobox', { name: 'Main broker' });
  fireEvent.change(box, { target: { value: 'zzz no such broker' } });
  expect(screen.getByText(/No broker matches/)).toBeTruthy();
  const options = screen.getAllByRole('option');
  expect(options.map((o) => o.textContent)).toEqual(['Other', 'None yet']);
  expect((cont() as HTMLButtonElement).disabled).toBe(true);
  click(options[0]!);
  expect((cont() as HTMLButtonElement).disabled).toBe(false);
  expect(readFirstRun().draft.broker).toBe('Other');
});

test("step 4 lists the instruments in TradeZella's order", async () => {
  const { writeFirstRun } = await import('./survey-model');
  writeFirstRun({
    finished: false,
    draft: { experience: '1-3', capital: ['prop'], broker: 'Other' },
  });
  at('4');
  await screen.findByRole('group');
  expect(
    screen
      .getAllByRole('checkbox')
      .map((c) => (c as HTMLInputElement).labels?.[0]?.textContent),
  ).toEqual([
    'Stocks',
    'Options',
    'Forex',
    'Crypto',
    'Futures',
    'CFDs',
    'Other',
  ]);
});

test('step 6 Other asks for a few words, and Continue waits for them', async () => {
  // Steps 1 to 5 answered.
  const { writeFirstRun } = await import('./survey-model');
  writeFirstRun({
    finished: false,
    draft: {
      experience: '1-3',
      capital: ['prop'],
      broker: 'Other',
      instruments: ['futures'],
      goals: ['journal'],
    },
  });
  at('6');
  click(await screen.findByRole('radio', { name: 'Other' }));
  const text = screen.getByRole('textbox', { name: 'Please say where' });
  expect((cont() as HTMLButtonElement).disabled).toBe(true);
  fireEvent.change(text, { target: { value: 'A podcast' } });
  expect((cont() as HTMLButtonElement).disabled).toBe(false);
  click(cont());
  expect(readFirstRun().finished).toBe(true);
  expect(window.location.pathname).toBe('/app/home');
});
