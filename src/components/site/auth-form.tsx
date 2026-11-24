import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { buttonClasses } from '@/components/ui/button-styles';

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
    <form className="mt-7 flex flex-col gap-3" noValidate>
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
        className="mt-1 h-11! w-full text-[15px]! disabled:cursor-not-allowed"
      >
        {login ? 'Log in' : 'Create account'}
      </Button>
      <Link
        href="/app/dashboard"
        className={`${buttonClasses('secondary')} h-11! w-full text-[15px]! no-underline`}
      >
        Open the sample workspace
      </Link>
    </form>
  );
}

/**
 * The whole login or signup page: one centred column, about 400px, holding
 * the title, the one-line note, the form and its two actions, then the way to
 * the other page centred under it.
 */
export function AuthPage({ mode }: { mode: 'login' | 'signup' }) {
  const login = mode === 'login';
  return (
    <main className="flex flex-1 flex-col items-center px-5 pt-2 pb-10 sm:pt-6">
      <div className="w-full max-w-[400px] rounded-card border border-line bg-surface-1 px-6 pt-8 pb-7 shadow-[var(--shadow-card)] sm:px-8 motion-safe:animate-rise">
        <h1 className="text-center text-[26px] leading-[1.15] font-semibold tracking-[-0.03em] text-balance">
          {login ? 'Log in to Keel' : 'Create your Keel account'}
        </h1>
        <p
          id="auth-note"
          className="mx-auto mt-2.5 max-w-[34ch] text-center text-[14px] leading-[1.55] text-muted"
        >
          {AUTH_CLOSED}
        </p>
        <AuthForm mode={mode} />
      </div>
      <p className="mt-6 text-center text-[14.5px] text-muted">
        {login ? 'New to Keel? ' : 'Already have an account? '}
        <Link
          href={login ? '/signup' : '/login'}
          className="inline-flex min-h-11 items-center font-semibold text-accent-ink"
        >
          {login ? 'Sign up' : 'Log in'}
        </Link>
      </p>
    </main>
  );
}
