import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pkg = JSON.parse(fs.readFileSync('./package.json', 'utf-8'));
import http from 'http';
import https from 'https';

const DEFAULT_URL = 'http://192.168.188.168:8082';
const URL_FILE = path.resolve('.iobroker-url');

function readUrlFile(): string {
  try {
    const v = fs.readFileSync(URL_FILE, 'utf-8').trim();
    return v || DEFAULT_URL;
  } catch {
    return DEFAULT_URL;
  }
}

let proxyTarget = readUrlFile();

function ioBrokerDevPlugin(): Plugin {
  return {
    name: 'iobroker-dev-proxy',
    configureServer(server) {
      // Dynamic proxy for /socket.io – reads proxyTarget on every request
      server.middlewares.use('/socket.io', (req, res) => {
        const target = new URL(proxyTarget);
        const isHttps = target.protocol === 'https:';
        const lib = isHttps ? https : http;
        const port = target.port
          ? parseInt(target.port)
          : isHttps ? 443 : 80;

        const options: http.RequestOptions = {
          hostname: target.hostname,
          port,
          path: `/socket.io${req.url ?? ''}`,
          method: req.method,
          headers: {
            ...req.headers,
            host: target.host,
          },
        };

        const proxyReq = lib.request(options, (proxyRes) => {
          const headers = { ...proxyRes.headers };
          // Allow cross-origin in dev
          headers['access-control-allow-origin'] = '*';
          res.writeHead(proxyRes.statusCode ?? 200, headers);
          proxyRes.pipe(res, { end: true });
        });

        proxyReq.on('error', (err) => {
          if (!res.headersSent) {
            res.writeHead(502);
            res.end(`Proxy error: ${err.message}`);
          }
        });

        req.pipe(proxyReq, { end: true });
      });

      // Server-side iCal proxy – avoids CORS restrictions in the browser
      server.middlewares.use('/proxy/ical', (req, res) => {
        const rawUrl = new URL(req.url ?? '', 'http://localhost').searchParams.get('url');
        if (!rawUrl) { res.writeHead(400); res.end('Missing url parameter'); return; }
        try {
          const target = new URL(rawUrl);
          const lib = target.protocol === 'https:' ? https : http;
          const options: http.RequestOptions = {
            hostname: target.hostname,
            port: target.port || (target.protocol === 'https:' ? 443 : 80),
            path: target.pathname + target.search,
            method: 'GET',
            headers: {
              'User-Agent': 'Mozilla/5.0 (ioBroker-Aura)',
              'Accept': 'text/calendar, */*',
            },
          };
          const proxyReq = lib.request(options, (proxyRes) => {
            // Follow single redirect
            if ((proxyRes.statusCode === 301 || proxyRes.statusCode === 302) && proxyRes.headers.location) {
              const redir = new URL(proxyRes.headers.location);
              const rLib = redir.protocol === 'https:' ? https : http;
              rLib.get(proxyRes.headers.location, { headers: options.headers }, (rRes) => {
                res.writeHead(rRes.statusCode ?? 200, {
                  'Content-Type': rRes.headers['content-type'] ?? 'text/calendar; charset=utf-8',
                  'Access-Control-Allow-Origin': '*',
                });
                rRes.pipe(res, { end: true });
              }).on('error', (e) => { res.writeHead(502); res.end(e.message); });
              return;
            }
            res.writeHead(proxyRes.statusCode ?? 200, {
              'Content-Type': proxyRes.headers['content-type'] ?? 'text/calendar; charset=utf-8',
              'Access-Control-Allow-Origin': '*',
            });
            proxyRes.pipe(res, { end: true });
          });
          proxyReq.on('error', (e) => { if (!res.headersSent) { res.writeHead(502); res.end(e.message); } });
          proxyReq.end();
        } catch {
          res.writeHead(400); res.end('Invalid URL');
        }
      });

      // Endpoint to update the proxy target at runtime
      server.middlewares.use('/api/dev/set-iobroker-url', (req, res) => {
        if (req.method !== 'POST') { res.writeHead(405); res.end(); return; }
        let body = '';
        req.on('data', (d) => (body += d));
        req.on('end', () => {
          try {
            const { url } = JSON.parse(body);
            if (url) {
              proxyTarget = url;
              fs.writeFileSync(URL_FILE, url, 'utf-8');
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, target: proxyTarget }));
          } catch {
            res.writeHead(400); res.end('Bad request');
          }
        });
      });
    },
  };
}

// VITE_BASE is set to '/aura/' by the build:adapter script
const base = process.env.VITE_BASE ?? '/';

export default defineConfig({
  base,
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [react(), ioBrokerDevPlugin()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    // No proxy config needed – handled by the plugin middleware above
  },
  build: {
    outDir: 'www',
  },
});
