import { spawn } from 'node:child_process';

const port = process.env.PORT || '8081';
const retryDelayMs = 2_500;
let child = null;
let stopping = false;
let attempt = 0;

function startTunnel() {
  attempt += 1;
  const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';

  child = spawn(
    pnpm,
    ['exec', 'expo', 'start', '--port', port, '--tunnel'],
    {
      stdio: 'inherit',
      env: process.env,
    },
  );

  child.on('error', (error) => {
    console.error('Unable to launch Expo tunnel:', error);
  });

  child.on('exit', (code, signal) => {
    child = null;

    if (stopping || signal === 'SIGINT' || signal === 'SIGTERM' || code === 0) {
      process.exitCode = 0;
      return;
    }

    console.warn(
      `Expo tunnel stopped (exit ${code ?? 'unknown'}). ` +
      `Retrying in ${retryDelayMs / 1000}s — attempt ${attempt + 1}…`,
    );
    setTimeout(startTunnel, retryDelayMs);
  });
}

function stop(signal) {
  stopping = true;
  if (child && child.exitCode === null) child.kill(signal);
}

process.on('SIGINT', () => stop('SIGINT'));
process.on('SIGTERM', () => stop('SIGTERM'));

startTunnel();
