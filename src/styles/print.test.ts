import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

// The print sheet is CSS, which no component test runs. These hold its rules
// to what the print layout needs; the e2e spec prints for real (`emulateMedia`).

const strip = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');
const raw = readFileSync('src/styles/print.css', 'utf8');
const css = strip(raw);
const theme = strip(readFileSync('src/styles/theme.css', 'utf8'));

/** The text between the braces of every `@media print` block, comments gone. */
function printBlocks(): string {
  const out: string[] = [];
  let at = css.indexOf('@media print');
  while (at !== -1) {
    const open = css.indexOf('{', at);
    let depth = 0;
    let i = open;
    for (; i < css.length; i++) {
      if (css[i] === '{') depth++;
      if (css[i] === '}' && --depth === 0) break;
    }
    out.push(css.slice(open + 1, i));
    at = css.indexOf('@media print', i);
  }
  return out.join('\n');
}

/** The declarations of the rule whose selector list includes `selector`. */
function declarationsOf(block: string, selector: string): string {
  for (const [, selectors = '', body = ''] of block.matchAll(
    /([^{}]+)\{([^{}]*)\}/g,
  ))
    if (selectors.split(',').some((s) => s.trim() === selector)) return body;
  return '';
}

test('globals.css brings the print sheet in', () => {
  expect(readFileSync('src/app/globals.css', 'utf8')).toMatch(
    /@import ['"]\.\.\/styles\/print\.css['"];/,
  );
});

test('the sheet says it is shared with the note PDF', () => {
  expect(raw).toMatch(/note/i);
  expect(raw).toMatch(/6B/);
});

test('the app chrome does not print: the pinned rows and what is marked to hide', () => {
  const block = printBlocks();
  const hidden = declarationsOf(block, '[data-pinned]');
  expect(hidden).toMatch(/display:\s*none\s*!important/);
  expect(declarationsOf(block, "[data-print='hide']")).toMatch(
    /display:\s*none\s*!important/,
  );
});

test('the page itself is never hidden', () => {
  const block = printBlocks();
  for (const selector of ['main', '#content', "[data-print='keep']"])
    expect(declarationsOf(block, selector), selector).not.toMatch(
      /display:\s*none/,
    );
});

test('a row, and what is marked to keep together, stays on one page', () => {
  const block = printBlocks();
  expect(declarationsOf(block, 'tr')).toMatch(/break-inside:\s*avoid/);
  expect(declarationsOf(block, "[data-print='keep']")).toMatch(
    /break-inside:\s*avoid/,
  );
});

test('a header repeated on the next page keeps its label: the sort button prints as plain text', () => {
  expect(declarationsOf(printBlocks(), 'th button')).toMatch(
    /display:\s*contents/,
  );
});

test('paper is white and prints its colours: no shadows, the swatches and tones kept', () => {
  const block = printBlocks();
  expect(declarationsOf(block, 'html')).toMatch(/print-color-adjust:\s*exact/);
  expect(declarationsOf(block, 'html')).toMatch(
    /background:\s*#fff\s*!important/,
  );
  expect(declarationsOf(block, 'body')).toMatch(
    /background:\s*#fff\s*!important/,
  );
  expect(block).toMatch(/box-shadow:\s*none\s*!important/);
});

test('the page has its margins and a footer with the page count, on any paper', () => {
  expect(css).toMatch(/@page\s*\{[^}]*margin:/);
  // No size: the user's paper, A4 or Letter, stays theirs.
  expect(css).not.toMatch(/@page\s*\{[^}]*(?:^|[;{\s])size\s*:/);
  expect(css).toMatch(/@bottom-left\s*\{[^}]*content:\s*['"]Keel['"]/);
  expect(css).toMatch(
    /@bottom-right\s*\{[^}]*counter\(page\)[^}]*counter\(pages\)/,
  );
});

test('print is always light: the graphite tokens are declared for screens only', () => {
  expect(theme).toMatch(
    /@media not print\s*\{\s*:root\[data-theme='dark'\]\s*\{/,
  );
  // Nothing else in the theme carries the dark set outside that block.
  expect(theme.match(/:root\[data-theme='dark'\]/g)).toHaveLength(1);
});
