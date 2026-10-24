import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, extname } from 'node:path';

// Pre-submission hygiene checks: em dashes, TODOs, real brand names, multi-line comments
const ROOT = process.cwd();
const SKIP_DIRS = new Set(['node_modules', 'dist', 'coverage', 'release', '.git', 'playwright-report', 'test-results', 'aodb-samples']);
const TEXT_EXT = new Set(['.ts', '.tsx', '.js', '.mjs', '.json', '.md', '.css', '.html', '.yml', '.yaml', '.csv', '.xml', '.env', '.example', '']);
const CODE_EXT = new Set(['.ts', '.tsx', '.js', '.mjs']);
const SELF = new Set(['scripts/sweep.mjs', 'scripts/sweep.test.mjs', 'scripts/brand-blocklist.json', 'package-lock.json']);

// Brand names are proper nouns: match the exact spelling or ALL CAPS, so colour words like indigo do not trip it
const brands = JSON.parse(readFileSync(join(ROOT, 'scripts/brand-blocklist.json'), 'utf8')).flatMap((b) => [b, b.toUpperCase()]);
const TODO_MARKERS = ['TODO', 'FIXME', 'XXX'];

const isWordChar = (ch) => ch !== '' && ((ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || (ch >= '0' && ch <= '9'));

// Plain substring search with word boundaries, avoiding dynamic regular expressions
function findBrand(line) {
  for (const brand of brands) {
    let from = 0;
    for (let at = line.indexOf(brand, from); at !== -1; at = line.indexOf(brand, from)) {
      if (!isWordChar(line.charAt(at - 1)) && !isWordChar(line.charAt(at + brand.length))) return line.slice(at, at + brand.length);
      from = at + 1;
    }
  }
  return null;
}

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) yield* walk(full);
    else yield full;
  }
}

export function checkText(path, text) {
  const findings = [];
  const isCode = CODE_EXT.has(extname(path));
  text.split('\n').forEach((line, index) => {
    const at = `${path}:${index + 1}`;
    if (line.includes('\u2014')) findings.push(`${at} em dash`);
    if (isCode && TODO_MARKERS.some((marker) => line.includes(marker))) findings.push(`${at} TODO marker`);
    const brand = findBrand(line);
    if (brand) findings.push(`${at} real brand name "${brand}"`);
  });
  if (isCode) {
    for (const match of text.matchAll(/^[ \t]*\/\*[\s\S]*?\*\//gm)) {
      if (match[0].includes('\n')) {
        const line = text.slice(0, match.index).split('\n').length;
        findings.push(`${path}:${line} multi-line comment block`);
      }
    }
  }
  return findings;
}

function main() {
  const findings = [];
  for (const full of walk(ROOT)) {
    const rel = relative(ROOT, full).split('\\').join('/');
    if (SELF.has(rel) || !TEXT_EXT.has(extname(full))) continue;
    findings.push(...checkText(rel, readFileSync(full, 'utf8')));
  }
  if (findings.length) {
    console.error(`sweep: ${findings.length} finding(s)`);
    findings.forEach((f) => console.error(`  ${f}`));
    process.exit(1);
  }
  console.log('sweep: clean');
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('\\').join('/').split('/').pop())) main();
