import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';

if (existsSync('.env')) {
  process.loadEnvFile('.env');
}

const entrypoint = path.resolve('artifacts/api-server/dist/index.mjs');
if (!existsSync(entrypoint)) {
  console.error(
    'Production API build is missing. Run `pnpm run build:production` first.',
  );
  process.exit(1);
}

const child = spawn(
  process.execPath,
  ['--enable-source-maps', entrypoint],
  {
    stdio: 'inherit',
    env: {
      ...process.env,
      NODE_ENV: 'production',
      PORT: process.env.API_PORT || '7070',
      // Nginx owns public HTTPS by default. Set PRODUCTION_USE_HTTPS=true only
      // when Node directly owns the certificate and public HTTPS port.
      USE_HTTPS: process.env.PRODUCTION_USE_HTTPS || 'false',
      APP_ROOT: process.cwd(),
    },
  },
);

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal));
}

child.on('error', (error) => {
  console.error('Failed to start the production API:', error);
  process.exitCode = 1;
});

child.on('exit', (code, signal) => {
  process.exitCode = code ?? (signal ? 0 : 1);
});
