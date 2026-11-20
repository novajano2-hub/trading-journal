import { RubberStamp } from './rubber-stamp';

const FIELD =
  'mt-2 block min-h-12 w-full rounded-[3px] border-2 border-ink bg-stock px-3 text-[17px] font-medium text-ink';

/** Real fields, honest button: accounts do not exist until the app release. */
export function AuthForm({ mode }: { mode: 'login' | 'signup' }) {
  const login = mode === 'login';
  return (
    <form
      className="ticket-stock mt-10 flex max-w-md flex-col gap-6 rounded-[3px] p-6 text-ink md:p-8"
      aria-describedby="auth-note"
    >
      <div>
        <label htmlFor="email" className="text-[17px] font-bold">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className={`${FIELD}`}
        />
      </div>
      <div>
        <label htmlFor="password" className="text-[17px] font-bold">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete={login ? 'current-password' : 'new-password'}
          required
          minLength={login ? undefined : 8}
          className={`${FIELD}`}
        />
      </div>
      {/* Closed until the app release: an uninked button on card stock, its rule
          dashed as everything not-yet is in this world, stamped with when it opens. */}
      <button
        type="submit"
        disabled
        aria-disabled="true"
        aria-describedby="auth-note"
        className="flex min-h-14 w-full flex-col items-center justify-center gap-2.5 rounded border-2 border-navy bg-navy px-6 py-3 font-display text-[26px] leading-none font-black tracking-[0.05em] text-stock uppercase aria-disabled:cursor-not-allowed aria-disabled:border-dashed aria-disabled:bg-stock aria-disabled:pt-3.5 aria-disabled:text-ink/80"
      >
        {login ? 'Log in' : 'Create account'}
        {/* The note below already says this; the stamp is for the eye. */}
        <span aria-hidden="true" className="flex">
          <RubberStamp tone="ink" size="xs" className="-rotate-[2deg]">
            Opens with app release
          </RubberStamp>
        </span>
      </button>
      <p id="auth-note" className="m-0 text-[15px] leading-[1.5] font-medium">
        Accounts open with the app release. Until then, everything runs in your
        browser.
      </p>
    </form>
  );
}
