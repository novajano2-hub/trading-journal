// Builds a static copy of Keel for GitHub Pages into out/.
//
//   npm run build:pages                      served at the host's root
//   PAGES_BASE_PATH=/keel npm run build:pages    served under /keel
//
// Keel keeps its data in the visitor's browser, so a static export is enough.
// What a static export cannot do is serve a page whose address holds an id
// made at runtime (/app/trades/<id>, /app/day/<date>): there is no file for it.
// So, for the length of the build only:
//
//   1. each dynamic page without generateStaticParams gets one, returning a
//      placeholder, and the files are put back afterwards;
//   2. out/404.html becomes a loader. GitHub Pages serves it, at the address
//      asked for, for every path that has no file. It finds the placeholder
//      page for that address, swaps the real id in for the placeholder, and
//      writes the result over itself, so the app opens on the id in the URL.
//
// Nothing under src/ is changed for normal builds; the placeholder export only
// ever exists inside this script's build.

import { spawn } from 'node:child_process';
import { readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const APP_DIR = 'src/app';
const OUT_DIR = 'out';
const PAGE_FILE = /^page\.(tsx|ts|jsx|js)$/;
const base = (process.env.PAGES_BASE_PATH ?? '').replace(/\/+$/, '');

/** The placeholder a param gets in the prerendered page: unlike an id, it cannot occur by chance. */
const tokenOf = (param) => `__keel_${param}__`;

/** Every page file under src/app, with the URL segments it serves (route groups dropped). */
function pages(dir = APP_DIR, segments = []) {
  const found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      const isGroup = /^\(.*\)$/.test(entry.name);
      found.push(
        ...pages(path, isGroup ? segments : [...segments, entry.name]),
      );
    } else if (PAGE_FILE.test(entry.name)) {
      found.push({ file: path, segments });
    }
  }
  return found;
}

const params = (segments) =>
  segments.flatMap((s) => {
    if (/^\[\.\.\.|^\[\[\.\.\./.test(s)) {
      throw new Error(`build-pages: catch-all segment ${s} is not supported`);
    }
    const m = /^\[(.+)\]$/.exec(s);
    return m ? [m[1]] : [];
  });

const dynamicPages = pages().filter((p) => params(p.segments).length > 0);

/** Pages that need the placeholder export, and their source as it was. */
const patched = [];
for (const page of dynamicPages) {
  const source = readFileSync(page.file, 'utf8');
  if (/generateStaticParams/.test(source)) continue;
  const entry = params(page.segments)
    .map((p) => `${JSON.stringify(p)}: ${JSON.stringify(tokenOf(p))}`)
    .join(', ');
  patched.push({ ...page, source });
  writeFileSync(
    page.file,
    `${source}\nexport function generateStaticParams() {\n  return [{ ${entry} }];\n}\n`,
  );
}

let restored = false;
function restore() {
  if (restored) return;
  restored = true;
  for (const p of patched) writeFileSync(p.file, p.source);
}
process.on('exit', restore);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => process.exit(1));

/** The routes the loader serves: static segments as text, params as null, most specific first. */
const routes = patched
  .map((p) => {
    const names = [];
    const pattern = p.segments.map((s) => {
      const m = /^\[(.+)\]$/.exec(s);
      if (!m) return s;
      names.push(m[1]);
      return null;
    });
    const placeholder = p.segments
      .map((s) => {
        const m = /^\[(.+)\]$/.exec(s);
        return m ? tokenOf(m[1]) : s;
      })
      .join('/');
    return { pattern, names, file: `/${placeholder}.html` };
  })
  .sort(
    (a, b) =>
      b.pattern.filter((s) => s !== null).length -
      a.pattern.filter((s) => s !== null).length,
  );

/**
 * The redirects next.config.ts declares. A static export has no server to run
 * them (the config drops them for this build), so the loader repeats them.
 */
async function configRedirects() {
  delete process.env.GITHUB_PAGES; // the config as normal builds see it
  const loadConfig = createRequire(import.meta.url)(
    'next/dist/server/config',
  ).default;
  const config = await loadConfig('phase-production-build', process.cwd());
  return ((await config.redirects?.()) ?? []).map((r) => {
    const plain = (s) => !/[:*(){}?]/.test(s);
    if (r.has || r.missing || !plain(r.source) || !plain(r.destination)) {
      throw new Error(
        `build-pages: redirect ${r.source} needs more than the loader does (plain paths only)`,
      );
    }
    return { from: r.source, to: r.destination };
  });
}

/** What GitHub Pages serves for a path with no file: pages-404.html with the routes it needs. */
async function loaderPage() {
  const redirects = await configRedirects();
  const data = JSON.stringify({ base, routes, redirects });
  const page = readFileSync(
    new URL('./pages-404.html', import.meta.url),
    'utf8',
  );
  if (page.split('__KEEL_PAGES__').length !== 2) {
    throw new Error(
      'build-pages: pages-404.html needs __KEEL_PAGES__ exactly once',
    );
  }
  return page.replace('__KEEL_PAGES__', () => data);
}

/**
 * The loader swaps ids into the page's script data only. A placeholder anywhere
 * else in a prerendered page (the title, an attribute) would stay a placeholder.
 */
function assertPlaceholdersOnlyInScripts() {
  for (const r of routes) {
    const html = readFileSync(join(OUT_DIR, r.file), 'utf8');
    const outside = html.replace(/<script[\s\S]*?<\/script>/g, '');
    if (/__keel_[A-Za-z0-9_]+__/.test(outside)) {
      throw new Error(
        `build-pages: a placeholder shows outside the scripts of ${r.file}`,
      );
    }
  }
}

function run(cmd, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: 'inherit', env });
    child.on('error', reject);
    child.on('exit', (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`${cmd} ${args.join(' ')} exited ${code}`)),
    );
  });
}

try {
  rmSync(OUT_DIR, { recursive: true, force: true });
  await run('npx', ['next', 'build'], {
    ...process.env,
    GITHUB_PAGES: 'true',
    PAGES_BASE_PATH: base,
    NEXT_TELEMETRY_DISABLED: '1',
  });
} finally {
  restore();
}

assertPlaceholdersOnlyInScripts();
writeFileSync(join(OUT_DIR, '404.html'), await loaderPage());
writeFileSync(join(OUT_DIR, '.nojekyll'), '');
console.log(
  `build-pages: wrote ${OUT_DIR}/ for "${base || '/'}" with ${routes.length} dynamic route(s):`,
);
for (const r of routes) console.log(`  ${r.file}`);
