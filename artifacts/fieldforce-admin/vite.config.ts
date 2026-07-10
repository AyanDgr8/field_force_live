import path from 'path';
import fs from 'node:fs';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

import runtimeErrorOverlay from '@replit/vite-plugin-runtime-error-modal';

const rawPort = process.env.PORT;

if (!rawPort) {
  throw new Error(
    'PORT environment variable is required but was not provided.',
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const basePath = process.env.BASE_PATH;

if (!basePath) {
  throw new Error(
    'BASE_PATH environment variable is required but was not provided.',
  );
}

const apiProxyTarget = process.env.API_PROXY_TARGET;
const useHttps = process.env.USE_HTTPS === 'true';
const appRoot = process.env.APP_ROOT
  ? path.resolve(process.env.APP_ROOT)
  : path.resolve(import.meta.dirname, '../..');
const httpsOptions = useHttps
  ? {
      key: fs.readFileSync(
        path.resolve(appRoot, process.env.SSL_KEY_PATH ?? 'ssl/privkey.pem'),
      ),
      cert: fs.readFileSync(
        path.resolve(appRoot, process.env.SSL_CERT_PATH ?? 'ssl/fullchain.pem'),
      ),
    }
  : undefined;

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    tailwindcss(),
    runtimeErrorOverlay(),
    ...(process.env.NODE_ENV !== 'production' &&
    process.env.REPL_ID !== undefined
      ? [
          await import('@replit/vite-plugin-cartographer').then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, '..'),
            }),
          ),
          await import('@replit/vite-plugin-dev-banner').then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
      '@assets': path.resolve(
        import.meta.dirname,
        '..',
        '..',
        'attached_assets',
      ),
    },
    dedupe: ['react', 'react-dom'],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, 'dist/public'),
    emptyOutDir: true,
  },
  server: {
    port,
    https: httpsOptions,
    strictPort: true,
    host: '0.0.0.0',
    allowedHosts: true,
    fs: {
      strict: true,
    },
    // The generated API client requests relative `/api/...` paths. In deployment a
    // router forwards those to the api-server; locally nothing does, so opt in by
    // pointing API_PROXY_TARGET at the running api-server.
    ...(apiProxyTarget
      ? {
          proxy: {
            '/api': {
              target: apiProxyTarget,
              changeOrigin: true,
              secure: process.env.API_PROXY_SECURE !== 'false',
            },
          },
        }
      : {}),
  },
  preview: {
    port,
    https: httpsOptions,
    host: '0.0.0.0',
    allowedHosts: true,
  },
});
