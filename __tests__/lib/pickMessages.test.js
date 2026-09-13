import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  pickMessages,
  ROOT_NAMESPACES,
  ROUTE_NAMESPACE_SETS,
} from '@/lib/pickMessages';
import messages from '@/messages/en.json';

describe('pickMessages', () => {
  it('keeps only the requested top-level namespaces', () => {
    const input = { a: { x: 1 }, b: { y: 2 }, c: { z: 3 } };
    expect(pickMessages(input, ['a', 'c'])).toEqual({ a: { x: 1 }, c: { z: 3 } });
  });

  it('keeps a nested subtree at its original path', () => {
    const input = { a: { keep: { x: 1 }, drop: { y: 2 } } };
    expect(pickMessages(input, ['a.keep'])).toEqual({ a: { keep: { x: 1 } } });
  });

  it('merges sibling subtrees of the same parent', () => {
    const input = { a: { one: 1, two: 2, three: 3 } };
    expect(pickMessages(input, ['a.one', 'a.three'])).toEqual({ a: { one: 1, three: 3 } });
  });

  it('does not let a narrower path shrink an ancestor already taken whole', () => {
    const input = { a: { one: 1, two: 2 } };
    expect(pickMessages(input, ['a', 'a.one'])).toEqual({ a: { one: 1, two: 2 } });
  });

  // Order must not matter. withRoot() emits the root paths FIRST, so the real
  // lists look like ['student.gate', ..., 'student'] — with a naive build the
  // ancestor finds a partial object already in place and leaves it, shipping
  // two of student's subtrees and MISSING_MESSAGE for every other one.
  it('takes the ancestor whole even when a descendant is listed first', () => {
    const input = { a: { one: 1, two: 2 } };
    expect(pickMessages(input, ['a.one', 'a'])).toEqual({ a: { one: 1, two: 2 } });
  });

  it('keeps every subtree of a namespace declared whole after a narrow sibling', () => {
    const input = { s: { gate: 1, favorites: 2, login: 3, account: 4 } };
    expect(pickMessages(input, ['s.gate', 's.favorites', 's'])).toEqual({
      s: { gate: 1, favorites: 2, login: 3, account: 4 },
    });
  });

  it('skips paths the catalog does not have, rather than throwing', () => {
    // A typo must not take a page down — the completeness test below is what
    // catches it, at build time rather than in a user's browser.
    expect(pickMessages({ a: 1 }, ['a', 'missing', 'a.b.c'])).toEqual({ a: 1 });
  });

  it('every declared route path exists in en.json', () => {
    for (const { dir, namespaces } of ROUTE_NAMESPACE_SETS) {
      for (const path of namespaces) {
        const resolved = path
          .split('.')
          .reduce((acc, key) => (acc == null ? undefined : acc[key]), messages);
        expect(resolved, `"${path}" (set: ${dir || 'root'}) is not in en.json`).toBeDefined();
      }
    }
  });
});

// --- Completeness -----------------------------------------------------------
// Scan each route tree's entry files, follow every import that lands in a
// client bundle, and assert the route's declared namespace set covers every
// useTranslations() literal reachable from it.
//
// This is the safety net for the per-route split (#564). The provider REPLACES
// inherited messages rather than merging (use-intl IntlProvider), so a subtree
// that forgets a namespace gets a runtime MISSING_MESSAGE in the browser, not
// a build error. This test is what turns that into a failing build instead.
//
// All 96 useTranslations() call sites pass a string literal, so a regex is
// sufficient; if a dynamic namespace is ever introduced this scan goes blind
// to it and the prod `missing-message` canary becomes the only guard.

const srcDir = join(process.cwd(), 'src');
const localeDir = join(srcDir, 'app', '[locale]');

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...walk(full));
    else if (/\.(js|jsx)$/.test(entry)) out.push(full);
  }
  return out;
}

function resolveModulePath(base) {
  for (const candidate of [
    base,
    `${base}.js`,
    `${base}.jsx`,
    join(base, 'index.js'),
    join(base, 'index.jsx'),
  ]) {
    try {
      if (statSync(candidate).isFile()) return candidate;
    } catch {
      // not this candidate
    }
  }
  return null;
}

function resolveImport(fromFile, specifier) {
  if (specifier.startsWith('@/')) return resolveModulePath(join(srcDir, specifier.slice(2)));
  if (specifier.startsWith('.')) return resolveModulePath(join(join(fromFile, '..'), specifier));
  return null; // external package
}

function importsOf(code, file) {
  const re = /(?:import|export)\s[^;]*?from\s+['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g;
  const out = [];
  let m;
  while ((m = re.exec(code)) !== null) out.push(m[1] || m[2]);
  return out.map((spec) => resolveImport(file, spec)).filter(Boolean);
}

function namespacesInFile(code) {
  const re = /useTranslations\(\s*['"]([^'"]+)['"]\s*\)/g;
  const out = [];
  let m;
  while ((m = re.exec(code)) !== null) out.push(m[1]);
  return out;
}

function isClientModule(code) {
  const head = code.trimStart();
  return head.startsWith("'use client'") || head.startsWith('"use client"');
}

const read = (file) => {
  try {
    return readFileSync(file, 'utf8');
  } catch {
    return null;
  }
};

// Namespaces reachable from `entries` through modules that end up in a client
// bundle: an entry that is itself 'use client', or anything a client module
// imports (the directive travels with whatever imports the module — e.g.
// ListingCard.js has no directive of its own but is pulled in by
// SavedListings.js).
function clientNamespacesFrom(entries) {
  const used = new Map(); // namespace -> first file seen
  const visited = new Set();

  function visitClient(file) {
    if (visited.has(file)) return;
    visited.add(file);
    const code = read(file);
    if (code == null) return;
    for (const ns of namespacesInFile(code)) if (!used.has(ns)) used.set(ns, file);
    for (const dep of importsOf(code, file)) visitClient(dep);
  }

  // Server modules don't ship, but their client imports do — walk through them.
  const serverSeen = new Set();
  function visitServer(file) {
    if (serverSeen.has(file) || visited.has(file)) return;
    serverSeen.add(file);
    const code = read(file);
    if (code == null) return;
    if (isClientModule(code)) {
      visitClient(file);
      return;
    }
    for (const dep of importsOf(code, file)) visitServer(dep);
  }

  entries.forEach(visitServer);
  return used;
}

const ROUTE_FILE = /\/(page|layout|template|default|error|loading|not-found)\.jsx?$/;

function entryFiles({ dir, exclude = [], rootLayoutOnly = false }) {
  if (rootLayoutOnly) return [join(localeDir, 'layout.js')];
  const base = join(localeDir, dir);
  return walk(base)
    .filter((f) => ROUTE_FILE.test(f))
    .filter((f) => !exclude.some((ex) => f.startsWith(join(localeDir, ex) + '/')));
}

// A declared path covers a used namespace when it IS that namespace or an
// ancestor of it: declaring 'student' covers useTranslations('student.chat').
const covers = (declared, used) => used === declared || used.startsWith(`${declared}.`);

describe('per-route namespace completeness', () => {
  for (const set of ROUTE_NAMESPACE_SETS) {
    const label = set.dir || 'root layout (shared chrome)';
    it(`${label} declares every namespace its client components use`, () => {
      const used = clientNamespacesFrom(entryFiles(set));
      const missing = [...used.entries()]
        .filter(([ns]) => !set.namespaces.some((d) => covers(d, ns)))
        .map(([ns, file]) => `"${ns}" (e.g. ${file.replace(`${process.cwd()}/`, '')})`);
      expect(
        missing,
        `Route "${label}" is missing namespaces from its set in src/lib/pickMessages.js. ` +
          `The provider REPLACES inherited messages, so these would be MISSING_MESSAGE ` +
          `in the browser: ${missing.join(', ')}`,
      ).toEqual([]);
    });
  }

  // Checking the declared LIST is not enough: it says a namespace is covered
  // without proving pickMessages actually emits it. That gap shipped a real
  // bug — withRoot() lists 'student.gate' before 'student', and the build
  // skipped the ancestor because a partial object was already in place, so
  // STUDENT_NAMESPACES resolved to 2 of student's 15 subtrees while this
  // suite stayed green. Assert against the OUTPUT.
  for (const set of ROUTE_NAMESPACE_SETS) {
    const label = set.dir || 'root layout (shared chrome)';
    it(`${label} resolves every used namespace in the picked catalog`, () => {
      const picked = pickMessages(messages, set.namespaces);
      const unresolved = [...clientNamespacesFrom(entryFiles(set)).entries()]
        .filter(([ns]) => {
          const node = ns.split('.').reduce((acc, key) => (acc == null ? undefined : acc[key]), picked);
          return node === undefined;
        })
        .map(([ns, file]) => `"${ns}" (e.g. ${file.replace(`${process.cwd()}/`, '')})`);
      expect(
        unresolved,
        `Route "${label}" declares these but pickMessages does not emit them: ${unresolved.join(', ')}`,
      ).toEqual([]);
    });
  }

  // The root set is duplicated beneath every per-route provider, so anything
  // unnecessary here is paid on every page twice over.
  it('the root set stays minimal', () => {
    expect(ROOT_NAMESPACES.length).toBeLessThanOrEqual(6);
    const bytes = Buffer.byteLength(JSON.stringify(pickMessages(messages, ROOT_NAMESPACES)));
    expect(bytes, `root message set is ${bytes} bytes; keep it under 4 KB`).toBeLessThan(4096);
  });
});
