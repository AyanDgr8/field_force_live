import fs from 'node:fs';
import path from 'path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, type Plugin } from 'vite';

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
const apiProxyTarget = process.env.API_PROXY_TARGET;
const mobileAppProxyTarget = process.env.MOBILE_APP_PROXY_TARGET;
const useHttps = process.env.USE_HTTPS === 'true';
const appRoot = process.env.APP_ROOT ?? process.cwd();
const mobilePort = process.env.MOBILE_PORT ?? '8081';
const fallbackMobileAppUrl = process.env.VITE_MOBILE_APP_URL ?? '';
const allowedHosts = (
  process.env.VITE_ALLOWED_HOSTS ??
  'mwmcrm.voicemeetme.net,localhost,127.0.0.1'
)
  .split(',')
  .map((host) => host.trim())
  .filter(Boolean);

const mobileAppUrlPlugin: Plugin = {
  name: 'fieldforce-mobile-app-url',
  configureServer(server) {
    server.middlewares.use('/__mobile-app-url', async (_req, res) => {
      let url = fallbackMobileAppUrl;

      try {
        const response = await fetch(`http://127.0.0.1:${mobilePort}`, {
          headers: {
            Accept: 'application/expo+json,application/json',
            'Expo-Platform': 'ios',
          },
          signal: AbortSignal.timeout(2_000),
        });

        if (response.ok) {
          const manifest = (await response.json()) as {
            extra?: {
              expoClient?: { hostUri?: string };
              expoGo?: { debuggerHost?: string };
            };
          };
          const hostUri =
            manifest.extra?.expoClient?.hostUri ??
            manifest.extra?.expoGo?.debuggerHost;
          // Metro can advertise a loopback address even though the dashboard
          // already has a LAN-safe fallback. Never turn that into a QR code:
          // 127.0.0.1/localhost would point a physical phone back to itself.
          const advertisedHost = hostUri?.split(':')[0];
          if (
            hostUri &&
            advertisedHost !== 'localhost' &&
            advertisedHost !== '127.0.0.1' &&
            advertisedHost !== '::1'
          ) {
            url = `exp://${hostUri}`;
          }
        }
      } catch {
        // Metro may still be starting. The page polls and will retry.
      }

      res.statusCode = url ? 200 : 503;
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'no-store');
      res.end(JSON.stringify({ url }));
    });
  },
};

function resolveCertificatePath(value: string | undefined, fallback: string) {
  const configuredPath = value ?? fallback;
  return path.isAbsolute(configuredPath)
    ? configuredPath
    : path.resolve(appRoot, configuredPath);
}

const https = useHttps
  ? {
      key: fs.readFileSync(
        resolveCertificatePath(process.env.SSL_KEY_PATH, 'ssl/privkey.pem'),
      ),
      cert: fs.readFileSync(
        resolveCertificatePath(process.env.SSL_CERT_PATH, 'ssl/fullchain.pem'),
      ),
    }
  : undefined;

const apiProxy = apiProxyTarget
  ? {
      '/api': {
        target: apiProxyTarget,
        changeOrigin: true,
        secure: process.env.API_PROXY_SECURE !== 'false',
      },
    }
  : undefined;

const mobileAppProxy = mobileAppProxyTarget
  ? {
      '/mobile-app': {
        target: mobileAppProxyTarget,
        changeOrigin: false,
      },
    }
  : undefined;

if (!basePath) {
  throw new Error(
    'BASE_PATH environment variable is required but was not provided.',
  );
}

export default defineConfig({
  base: basePath,
  plugins: [
    mobileAppUrlPlugin,
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
    strictPort: true,
    host: '0.0.0.0',
    allowedHosts,
    https,
    fs: {
      strict: true,
    },
    ...(apiProxy ? { proxy: apiProxy } : {}),
  },
  preview: {
    port,
    host: '0.0.0.0',
    allowedHosts,
    https,
    ...(apiProxy || mobileAppProxy
      ? { proxy: { ...apiProxy, ...mobileAppProxy } }
      : {}),
  },
});
