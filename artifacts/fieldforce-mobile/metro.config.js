const { getDefaultConfig } = require('expo/metro-config');
const http = require('http');

const config = getDefaultConfig(__dirname);

// react-native-maps extracts a temp android source tree during install.
// Metro tries to watch it and crashes when the tmp dir is cleaned up.
// Block the pattern so Metro ignores it entirely.
const { blockList } = config.resolver;
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const mapsPattern = new RegExp(
  escape(require('path').join('react-native-maps', '_tmp_')) + '.*',
);

config.resolver.blockList = blockList
  ? [blockList, mapsPattern].flat()
  : [mapsPattern];

// When Expo runs with --tunnel, the phone cannot necessarily reach the local
// API port directly. Proxy /api through Metro's tunnel so the phone and the
// localhost admin dashboard both use the same local API/database.
const originalEnhanceMiddleware = config.server?.enhanceMiddleware;
config.server = {
  ...config.server,
  enhanceMiddleware(metroMiddleware, metroServer) {
    const nextMiddleware = originalEnhanceMiddleware
      ? originalEnhanceMiddleware(metroMiddleware, metroServer)
      : metroMiddleware;

    return (req, res, next) => {
      if (!req.url?.startsWith('/api/')) {
        return nextMiddleware(req, res, next);
      }

      const apiPort = process.env.EXPO_PUBLIC_API_PORT || '7070';
      const proxyRequest = http.request(
        {
          hostname: '127.0.0.1',
          port: apiPort,
          path: req.url,
          method: req.method,
          headers: {
            ...req.headers,
            host: `127.0.0.1:${apiPort}`,
          },
        },
        (proxyResponse) => {
          res.writeHead(
            proxyResponse.statusCode || 502,
            proxyResponse.headers,
          );
          proxyResponse.pipe(res);
        },
      );

      proxyRequest.on('error', (error) => {
        if (!res.headersSent) {
          res.writeHead(502, { 'Content-Type': 'application/json' });
        }
        res.end(JSON.stringify({
          error: 'Local API proxy unavailable',
          detail: error.message,
        }));
      });

      req.pipe(proxyRequest);
    };
  },
};

module.exports = config;
