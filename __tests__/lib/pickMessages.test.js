import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { pickMessages, CLIENT_NAMESPACES } from '@/lib/pickMessages';
import messages from '@/messages/en.json';

describe('pickMessages', () => {
  it('keeps only the allow-listed top-level namespaces', () => {
    const input = { a: { x: 1 }, b: { y: 2 }, c: { z: 3 } };
    expect(pickMessages(input, ['a', 'c'])).toEqual({ a: { x: 1 }, c: { z: 3 } });
  });

  it('ignores allow-list entries not present in the catalog', () => {
    expect(pickMessages({ a: 1 }, ['a', 'missing'])).toEqual({ a: 1 });
  });

  it('every CLIENT_NAMESPACES entry exists in en.json', () => {
    for (const ns of CLIENT_NAMESPACES) {
      expect(messages, `en.json is missing top-level namespace "${ns}"`).toHaveProperty(ns);
    }
  });
});

// --- Allow-list completeness: scan 'use client' files and make sure every
// namespace they pass to useTranslations() is covered by CLIENT_NAMESPACES.
// This is the safety net for the #260 message-filtering optimization: if a
// client component starts using a new namespace and nobody updates the list,
// this fails instead of shipping a runtime MISSING_MESSAGE to users.

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

function clientNamespacesUsed() {
  const srcDir = join(process.cwd(), 'src');
  const used = new Map(); // topLevel -> file where first seen
  for (const file of walk(srcDir)) {
    const code = readFileSync(file, 'utf8');
    // A real client component declares the directive as its first statement.
    // Checking the trimmed start (not includes) avoids matching files that
    // merely mention 'use client' inside a comment or string.
    const head = code.trimStart();
    if (!head.startsWith("'use client'") && !head.startsWith('"use client"')) continue;
    const re = /useTranslations\(\s*['"]([^'"]+)['"]\s*\)/g;
    let m;
    while ((m = re.exec(code)) !== null) {
      const top = m[1].split('.')[0];
      if (!used.has(top)) used.set(top, file);
    }
  }
  return used;
}

describe('CLIENT_NAMESPACES completeness', () => {
  it('covers every namespace used by a client component', () => {
    const used = clientNamespacesUsed();
    const allow = new Set(CLIENT_NAMESPACES);
    const missing = [...used.entries()]
      .filter(([ns]) => !allow.has(ns))
      .map(([ns, file]) => `"${ns}" (e.g. ${file})`);
    expect(
      missing,
      `Client components use namespaces not in CLIENT_NAMESPACES (src/lib/pickMessages.js): ${missing.join(', ')}`,
    ).toEqual([]);
  });

  it('does not over-list namespaces no client component uses (keeps the trim tight)', () => {
    const used = clientNamespacesUsed();
    const unused = CLIENT_NAMESPACES.filter((ns) => !used.has(ns));
    expect(unused, `CLIENT_NAMESPACES lists namespaces no client component uses: ${unused.join(', ')}`).toEqual([]);
  });
});
