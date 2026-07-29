import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

if (existsSync('.env')) {
  process.loadEnvFile('.env');
}

const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const productionEnv = {
  ...process.env,
  NODE_ENV: 'production',
  PORT: process.env.FRONTEND_PORT || '7075',
  BASE_PATH: process.env.BASE_PATH || '/',
  APP_ROOT: process.cwd(),
  // Building static files never needs a TLS listener. Nginx terminates HTTPS
  // after deployment.
  USE_HTTPS: 'false',
};

const deploymentDomain =
  process.env.EXPO_PUBLIC_DOMAIN ||
  (process.env.APP_URL
    ? new URL(process.env.APP_URL).host
    : 'mwmcrm.voicemeetme.net');

const mobileProductionEnv = {
  ...productionEnv,
  BASE_PATH: '/mobile-app',
  EXPO_PUBLIC_DOMAIN: deploymentDomain,
};

for (const [label, args, env = productionEnv] of [
  ['type-check', ['run', 'typecheck'], productionEnv],
  ['API build', ['--filter', '@workspace/api-server', 'build'], productionEnv],
  ['admin build', ['--filter', '@workspace/fieldforce-admin', 'build'], productionEnv],
  ['mobile build', ['--filter', '@workspace/fieldforce-mobile', 'build'], mobileProductionEnv],
]) {
  console.log(`\n==> ${label}`);
  const result = spawnSync(pnpm, args, {
    stdio: 'inherit',
    env,
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

console.log('\nProduction build complete:');
console.log('  API:   artifacts/api-server/dist/index.mjs');
console.log('  Admin: artifacts/fieldforce-admin/dist/public');
console.log('  Mobile: artifacts/fieldforce-mobile/static-build');
