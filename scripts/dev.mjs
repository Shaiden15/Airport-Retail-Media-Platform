import { spawn } from 'node:child_process';

// Runs api and web dev servers together and stops both on Ctrl+C
const npmCli = process.env.npm_execpath;
if (!npmCli) {
  console.error('Run this through npm: npm run dev');
  process.exit(1);
}

const children = ['apps/api', 'apps/web'].map((workspace) =>
  spawn(process.execPath, [npmCli, 'run', 'dev', '--workspace', workspace], { stdio: 'inherit' }),
);

const stop = () => children.forEach((child) => child.kill());
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
children.forEach((child) => child.on('exit', (code) => code && stop()));
