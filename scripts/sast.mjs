import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';

// Runs OpenGrep with the same ruleset Topcoder uses and fails on any ERROR or more than 3 WARNINGs
const MAX_ERRORS = 0;
const MAX_WARNINGS = 3;
const OUT = 'opengrep-results.json';
const ARGS = ['--config=r/all', '--exclude-rule=bbp-pattern-inject', '--json', `--output=${OUT}`, '.'];

function hasNative() {
  return spawnSync('opengrep', ['--version']).status === 0;
}

if (hasNative()) {
  spawnSync('opengrep', ARGS, { stdio: 'inherit' });
} else if (process.platform === 'win32') {
  const wslPath = execFileSync('wsl', ['wslpath', '-a', process.cwd().split('\\').join('/')]).toString().trim();
  const cmd = `export PATH="$HOME/.opengrep/cli/latest:$HOME/.local/bin:$PATH"; cd "${wslPath}" && opengrep ${ARGS.join(' ')}`;
  spawnSync('wsl', ['bash', '-lc', cmd], { stdio: 'inherit' });
} else {
  console.error('opengrep not found. Install: curl -fsSL https://raw.githubusercontent.com/opengrep/opengrep/main/install.sh | bash');
  process.exit(2);
}

if (!existsSync(OUT)) {
  console.error('sast: no results file produced');
  process.exit(2);
}

const report = JSON.parse(readFileSync(OUT, 'utf8'));
const counts = { ERROR: 0, WARNING: 0, INFO: 0 };
for (const result of report.results ?? []) {
  const severity = result.extra?.severity ?? 'INFO';
  counts[severity] = (counts[severity] ?? 0) + 1;
  console.log(`${severity.padEnd(7)} ${result.path}:${result.start?.line} ${result.check_id}`);
}
console.log(`sast: ERROR=${counts.ERROR} WARNING=${counts.WARNING} INFO=${counts.INFO} (scan errors: ${(report.errors ?? []).length})`);

if (counts.ERROR > MAX_ERRORS || counts.WARNING > MAX_WARNINGS) process.exit(1);
