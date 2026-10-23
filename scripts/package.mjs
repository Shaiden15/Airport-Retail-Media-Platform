import { execFileSync } from 'node:child_process';
import { mkdirSync, statSync } from 'node:fs';

// Builds the submission zip from the committed tree so files sit at the zip root
const OUT = 'release/dwellcast-submission.zip';
const FORBIDDEN = [/(^|\/)node_modules\//, /(^|\/)dist\//, /(^|\/)\.env$/, /\.sqlite$/, /opengrep-results\.json$/];
const REQUIRED = ['README.md', 'package.json', 'REQUIREMENTS_TRACEABILITY.md', '.env.example'];

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();

const dirty = git('status', '--porcelain');
if (dirty) console.warn('package: warning, uncommitted changes are NOT included:\n' + dirty);

const files = git('ls-tree', '-r', '--name-only', 'HEAD').split('\n');
const bad = files.filter((f) => FORBIDDEN.some((re) => re.test(f)));
const missing = REQUIRED.filter((f) => !files.includes(f));
if (bad.length || missing.length) {
  if (bad.length) console.error('package: forbidden files committed:\n  ' + bad.join('\n  '));
  if (missing.length) console.error('package: required files missing:\n  ' + missing.join('\n  '));
  process.exit(1);
}

mkdirSync('release', { recursive: true });
git('archive', '--format=zip', `--output=${OUT}`, 'HEAD');
const sizeKb = Math.round(statSync(OUT).size / 1024);
const topLevel = [...new Set(files.map((f) => f.split('/')[0]))].sort();
console.log(`package: ${OUT} (${sizeKb} KB, ${files.length} files, commit ${git('rev-parse', '--short', 'HEAD')})`);
console.log('zip root: ' + topLevel.join(', '));
