// @vitest-environment happy-dom
import { cleanup, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { renderApp } from './__fixtures__/render-app';
import { FirstRunGate, WelcomeGuard } from './first-run-gate';
import { clearFirstRun, writeFirstRun } from './welcome/survey-model';

vi.mock('next/navigation', () => import('./__fixtures__/navigation'));

beforeEach(clearFirstRun);
afterEach(cleanup);

const child = <p>The page</p>;
const FINISHED = {
  finished: true,
  draft: {
    experience: '1-3',
    capital: ['prop'],
    broker: 'Other',
    instruments: ['futures'],
    goals: ['journal'],
    heardFrom: 'friend',
  },
};

test('the gate sends a new browser to welcome from any app route, the sample link included', async () => {
  for (const url of ['/app/dashboard', '/app', '/app/trades']) {
    const { unmount } = renderApp(<FirstRunGate>{child}</FirstRunGate>, {
      url,
    });
    await waitFor(() => expect(window.location.pathname).toBe('/app/welcome'));
    expect(screen.queryByText('The page')).toBeNull();
    unmount();
  }
});

test('until the prefs load the gate shows a loading page, not a blank app, and goes nowhere', () => {
  renderApp(<FirstRunGate>{child}</FirstRunGate>, { url: '/app/dashboard' });
  expect(screen.getByRole('status', { name: 'Loading Keel' })).toBeTruthy();
  expect(screen.queryByText('The page')).toBeNull();
  expect(window.location.pathname).toBe('/app/dashboard');
});

test('after the survey every app route shows Home, and Home shows its page', async () => {
  writeFirstRun(FINISHED);
  const other = renderApp(<FirstRunGate>{child}</FirstRunGate>, {
    url: '/app/dashboard',
  });
  // Home itself is where it ends up; the page that was asked for never showed.
  await waitFor(() => expect(window.location.pathname).toBe('/app/home'));
  other.unmount();

  renderApp(<FirstRunGate>{child}</FirstRunGate>, { url: '/app/home' });
  expect(await screen.findByText('The page')).toBeTruthy();
  expect(window.location.pathname).toBe('/app/home');
});

test('an onboarded user passes the gate', async () => {
  const done = {
    onboarding: { status: 'done' as const, at: '2026-11-20T15:00:00.000Z' },
  };
  const { repo } = renderApp(<FirstRunGate>{null}</FirstRunGate>, {
    url: '/app/dashboard',
  });
  await repo.prefs.update(done);
  cleanup();
  renderApp(<FirstRunGate>{child}</FirstRunGate>, {
    url: '/app/dashboard',
    repository: repo,
  });
  expect(await screen.findByText('The page')).toBeTruthy();
  expect(window.location.pathname).toBe('/app/dashboard');
});

test('if the prefs can not be read, the gate shows the page instead of trapping the user', async () => {
  const { repo } = renderApp(<FirstRunGate>{null}</FirstRunGate>, {
    url: '/app/dashboard',
  });
  cleanup();
  repo.prefs.get = async () => {
    throw new Error('no storage');
  };
  renderApp(<FirstRunGate>{child}</FirstRunGate>, {
    url: '/app/dashboard',
    repository: repo,
  });
  expect(await screen.findByText('The page')).toBeTruthy();
  expect(window.location.pathname).toBe('/app/dashboard');
});

test('WelcomeGuard sends an onboarded user on a welcome page to /app', async () => {
  const { repo } = renderApp(<WelcomeGuard>{null}</WelcomeGuard>, {
    url: '/app/welcome',
  });
  await repo.prefs.update({
    onboarding: { status: 'done', at: '2026-11-20T15:00:00.000Z' },
  });
  cleanup();
  renderApp(<WelcomeGuard>{child}</WelcomeGuard>, {
    url: '/app/welcome/2',
    repository: repo,
  });
  await waitFor(() => expect(window.location.pathname).toBe('/app'));
  expect(screen.queryByText('The page')).toBeNull();
});

test('WelcomeGuard sends a finished survey on a welcome page to Home, and lets a new user through', async () => {
  writeFirstRun(FINISHED);
  const finished = renderApp(<WelcomeGuard>{child}</WelcomeGuard>, {
    url: '/app/welcome/3',
  });
  await waitFor(() => expect(window.location.pathname).toBe('/app/home'));
  expect(screen.queryByText('The page')).toBeNull();
  finished.unmount();

  clearFirstRun();
  renderApp(<WelcomeGuard>{child}</WelcomeGuard>, { url: '/app/welcome/3' });
  expect(await screen.findByText('The page')).toBeTruthy();
  expect(window.location.pathname).toBe('/app/welcome/3');
});
