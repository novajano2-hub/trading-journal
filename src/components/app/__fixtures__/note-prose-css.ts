// Test-only: puts `note-prose.css` in the document, so a test can ask the
// styles themselves what size a heading is or whether a ticked item is crossed
// out (happy-dom resolves `var()` and the cascade). Vitest drops CSS imports,
// so nothing else would load it. Returns the way to take it out again.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export function loadNoteProseCss(): () => void {
  const css = readFileSync(
    join(process.cwd(), 'src/components/app/notes/note-prose.css'),
    'utf8',
  );
  const style = document.createElement('style');
  style.setAttribute('data-test', 'note-prose');
  style.textContent = css;
  document.head.append(style);
  return () => style.remove();
}
