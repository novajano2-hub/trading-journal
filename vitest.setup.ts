// Testing Library's default async timeout (1000 ms) is too tight when several
// sessions load the machine. Only DOM-environment test files load the library.
if (typeof document !== 'undefined') {
  const { configure } = await import('@testing-library/react');
  configure({ asyncUtilTimeout: 5000 });
  // KaTeX refuses to draw in quirks mode, which is what a bare happy-dom
  // document reports; the app's pages have a doctype. It checks once, when it
  // loads, so this has to be set before any test file imports it.
  Object.defineProperty(document, 'compatMode', {
    configurable: true,
    get: () => 'CSS1Compat',
  });
}

export {};
