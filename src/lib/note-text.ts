// Plain text out of a stored note (Tiptap JSON), for search and previews.

interface Node {
  type?: unknown;
  text?: unknown;
  content?: unknown;
}

const isNode = (v: unknown): v is Node => typeof v === 'object' && v !== null;
const kids = (n: Node): Node[] =>
  Array.isArray(n.content) ? n.content.filter(isNode) : [];

function inline(n: Node): string {
  return kids(n)
    .map((c) =>
      c.type === 'hardBreak' ? '\n' : typeof c.text === 'string' ? c.text : '',
    )
    .join('');
}

function collect(n: Node, out: string[]): void {
  const children = kids(n);
  if (children.some((c) => c.type === 'text' || c.type === 'hardBreak')) {
    out.push(inline(n));
    return;
  }
  for (const c of children) collect(c, out);
}

/** The plain text of a Tiptap JSON doc, one line per block. */
export function docText(doc: unknown): string {
  if (!isNode(doc)) return '';
  const lines: string[] = [];
  collect(doc, lines);
  return lines.filter((l) => l.length > 0).join('\n');
}

/** The doc's text on one line, cut to `max` characters with an ellipsis. */
export function docExcerpt(doc: unknown, max: number): string {
  const flat = docText(doc).replace(/\s+/g, ' ').trim();
  if (flat.length <= max) return flat;
  return `${flat.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}
