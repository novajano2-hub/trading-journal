// Testing Library's default async timeout (1000 ms) is too tight when several
// sessions load the machine. Only DOM-environment test files load the library.
if (typeof document !== 'undefined') {
  const { configure } = await import('@testing-library/react');
  configure({ asyncUtilTimeout: 5000 });
}

export {};
