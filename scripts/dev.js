const { spawn } = require('node:child_process');

const npmCli = process.env.npm_execpath;
if (!npmCli) {
  console.error('Run this launcher with `npm run dev`.');
  process.exit(1);
}

console.log('Starting backend and frontend. Press Ctrl+C to stop both.');

const children = ['dev:backend', 'dev:frontend'].map((script) =>
  spawn(process.execPath, [npmCli, 'run', script], { stdio: 'inherit' })
);

let stopping = false;

function stopChildren(signal) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (child.exitCode === null && !child.killed) child.kill(signal);
  }
}

for (const child of children) {
  child.on('error', (error) => {
    console.error('Failed to start a development server:', error);
    process.exitCode = 1;
    stopChildren('SIGTERM');
  });

  child.on('close', (code) => {
    if (!stopping) {
      process.exitCode = code === 0 ? 1 : code ?? 1;
      stopChildren('SIGTERM');
    }
  });
}

process.on('SIGINT', () => stopChildren('SIGINT'));
process.on('SIGTERM', () => stopChildren('SIGTERM'));
