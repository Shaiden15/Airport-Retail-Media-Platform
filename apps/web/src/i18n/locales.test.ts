import { describe, expect, it } from 'vitest';
import en from './locales/en.json';
import hi from './locales/hi.json';

function keyPaths(value: unknown, prefix = ''): string[] {
  if (typeof value !== 'object' || value === null) return [prefix];
  return Object.entries(value).flatMap(([key, child]) => keyPaths(child, prefix ? `${prefix}.${key}` : key));
}

describe('locales', () => {
  it('second language covers every English key', () => {
    expect(keyPaths(hi).sort()).toEqual(keyPaths(en).sort());
  });

  it('has no empty translations', () => {
    const values = JSON.stringify(hi);
    expect(values).not.toMatch(/:""/);
  });
});
