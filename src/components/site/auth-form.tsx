import Link from 'next/link';
import { Button } from '@/components/ui/button';

export const AUTH_CLOSED =
  'Accounts open with the app release. Until then, sign-up is closed.';

const INPUT =
  'block h-11 w-full rounded-control border border-line-2 bg-surface-1 px-3.5 text-[15px] text-text shadow-[0_1px_1px_rgb(18_22_51/0.04)] disabled:cursor-not-allowed disabled:opacity-50';

function Field({
  id,
  label,
  help,
  type,
  autoComplete,
  minLength,
}: {
  id: string;
  label: string;
  help: string;
  type: string;
  autoComplete: string;
  minLength?: number;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium">
        {label}
      </label>
      <input
        id={id}
        name={id}
        type={type}
        autoComplete={autoComplete}
        required
        disabled
        minLength={minLength}
        aria-describedby={`${id}-help ${id}-error`}
        className={INPUT}
      />
      <p id={`${id}-help`} className="mt-1.5 text-[13px] leading-5 text-muted">
        {help}
      </p>
      {/* The error slot: held open so a message never moves the form. */}
      <p
        id={`${id}-error`}
        aria-live="polite"
        className="min-h-5 text-[13px] leading-5 text-loss"
      />
    </div>
  );
}

/** Real fields, honest, disabled button: accounts do not exist until the app release. */
function AuthForm({ mode }: { mode: 'login' | 'signup' }) {
  const login = mode === 'login';
  return (
    <form
      className="mt-9 flex max-w-[448px] flex-col gap-3 rounded-card bg-surface-1 p-6 shadow-[var(--shadow-card)] sm:p-8"
      noValidate
    >
      <p id="auth-note" className="text-sm leading-[1.55] text-muted">
        {AUTH_CLOSED}
      </p>
      <Field
        id="email"
        label="Email"
        help="The address you sign in with."
        type="email"
        autoComplete="email"
      />
      <Field
        id="password"
        label="Password"
        help={login ? 'Your account password.' : 'At least 8 characters.'}
        type="password"
        autoComplete={login ? 'current-password' : 'new-password'}
        minLength={login ? undefined : 8}
      />
      <Button
        type="submit"
        disabled
        aria-describedby="auth-note"
        className="mt-2 h-11! w-full text-[15px]! font-medium! disabled:cursor-not-allowed"
      >
        {login ? 'Log in' : 'Create account'}
      </Button>
      <Link
        href="/app/dashboard"
        className="inline-flex min-h-11 items-center self-start text-[15px] font-medium text-accent-ink"
      >
        Open the sample workspace
      </Link>
    </form>
  );
}

/** The whole login or signup page: headline, form, and the way to the other one. */
export function AuthPage({ mode }: { mode: 'login' | 'signup' }) {
  const login = mode === 'login';
  return (
    <main className="mx-auto max-w-[1280px] px-5 pt-16 pb-28 sm:px-10">
      <h1 className="text-[clamp(36px,calc(2.6vw+16px),52px)] leading-[1.06] font-semibold tracking-[-0.032em] motion-safe:animate-rise">
        {login ? 'Log in' : 'Sign up'}
      </h1>
      <AuthForm mode={mode} />
      <p className="mt-9 text-[15px] text-muted">
        {login ? 'New to Keel? ' : 'Already have an account? '}
        <Link
          href={login ? '/signup' : '/login'}
          className="font-medium text-accent-ink"
        >
          {login ? 'Sign up' : 'Log in'}
        </Link>
      </p>
    </main>
  );
}
