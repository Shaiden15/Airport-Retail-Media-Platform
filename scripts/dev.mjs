import { spawn, spawnSync } from 'node:child_process';

// Runs api and web dev servers together and stops both on Ctrl+C
const npmCli = process.env.npm_execpath;
if (!npmCli) {
  console.error('Run this through npm: npm run dev');
  process.exit(1);
}

const children = ['apps/api', 'apps/web'].map((workspace) =>
  spawn(process.execPath, [npmCli, 'run', 'dev', '--workspace', workspace], { stdio: 'inherit' }),
);

// On Windows killing npm leaves its node grandchildren holding the ports, so end the whole tree
const killTree = (child) => {
  if (!child.pid) return;
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  else child.kill('SIGTERM');
};

let stopping = false;
const stop = () => {
  if (stopping) return;
  stopping = true;
  children.forEach(killTree);
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
children.forEach((child) => child.on('exit', (code) => code && stop()));
