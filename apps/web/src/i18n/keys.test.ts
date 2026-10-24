import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import en from './locales/en.json';

const SRC = fileURLToPath(new URL('..', import.meta.url));

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? files(full) : full.endsWith('.tsx') || full.endsWith('.ts') ? [full] : [];
  });
}

function flatten(value: unknown, prefix = ''): string[] {
  if (typeof value !== 'object' || value === null) return [prefix];
  return Object.entries(value).flatMap(([k, v]) => flatten(v, prefix ? `${prefix}.${k}` : k));
}

// Literal keys passed to t('...'); template keys are covered by the role and segment groups in the locale files
const KEY_PATTERN = /\bt\(\s*'([a-z0-9]+(?:\.[A-Za-z0-9-]+)+)'/g;

describe('translation keys', () => {
  it('every literal key used in the UI exists in the English locale', () => {
    const known = new Set(flatten(en));
    const missing = new Set<string>();
    for (const file of files(SRC)) {
      if (file.endsWith('.test.ts')) continue;
      for (const match of readFileSync(file, 'utf8').matchAll(KEY_PATTERN)) {
        const key = match[1] ?? '';
        if (!known.has(key)) missing.add(key);
      }
    }
    expect([...missing].sort()).toEqual([]);
  });
});
