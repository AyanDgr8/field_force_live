module.exports = {
  apps: [
    {
      name: 'field_force_monitor_app',
      cwd: __dirname,
      script: 'pnpm',
      args: 'run start:production',
      interpreter: 'none',
      autorestart: true,
      restart_delay: 2000,
      max_restarts: 10,
      time: true,
      env: {
        NODE_ENV: 'production',
      },
    },
    {
      name: 'field_force_monitor_frontend',
      cwd: __dirname,
      script: 'pnpm',
      args: '--filter @workspace/fieldforce-admin run serve',
      interpreter: 'none',
      autorestart: true,
      restart_delay: 2000,
      max_restarts: 10,
      time: true,
      env: {
        NODE_ENV: 'production',
        PORT: '7075',
        BASE_PATH: '/',
        APP_ROOT: __dirname,
        // Nginx Proxy Manager terminates public TLS. Keep the internal
        // container-to-host connection on HTTP to avoid managing the same
        // certificate in both NPM and the Node/Vite process.
        USE_HTTPS: 'false',
        API_PROXY_TARGET: 'http://127.0.0.1:7070',
        API_PROXY_SECURE: 'false',
        MOBILE_APP_PROXY_TARGET: 'http://127.0.0.1:8081',
        VITE_ALLOWED_HOSTS: 'mwmcrm.voicemeetme.net,localhost,127.0.0.1',
      },
    },
    {
      name: 'field_force_mobile_app',
      cwd: __dirname,
      script: 'pnpm',
      args: '--filter @workspace/fieldforce-mobile run serve',
      interpreter: 'none',
      autorestart: true,
      restart_delay: 2000,
      max_restarts: 10,
      time: true,
      env: {
        NODE_ENV: 'production',
        PORT: '8081',
        BASE_PATH: '/mobile-app',
      },
    },
  ],
};
