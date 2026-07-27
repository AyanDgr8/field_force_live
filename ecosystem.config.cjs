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
  ],
};
