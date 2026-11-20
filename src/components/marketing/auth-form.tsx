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
      <button
        type="submit"
        disabled
        className="min-h-14 rounded bg-navy px-6 py-3 font-display text-[26px] leading-none font-black tracking-[0.05em] text-stock uppercase opacity-60"
      >
        {login ? 'Log in' : 'Create account'}
      </button>
      <p id="auth-note" className="m-0 text-[15px] leading-[1.5] font-medium">
        Accounts open with the app release. Until then, everything runs in your
        browser.
      </p>
    </form>
  );
}
