import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
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

      // Server-side iframe proxy – strips X-Frame-Options so pages can be embedded
      server.middlewares.use('/proxy', (req, res) => {
        const rawUrl = new URL(req.url ?? '', 'http://localhost').searchParams.get('url');
        if (!rawUrl) { res.writeHead(400); res.end('Missing url parameter'); return; }
        try {
          const target = new URL(rawUrl);
          if (!['http:', 'https:'].includes(target.protocol)) { res.writeHead(400); res.end('Only http/https'); return; }
          const lib = target.protocol === 'https:' ? https : http;
          const stripHeaders = new Set([
            'x-frame-options', 'content-security-policy', 'x-content-type-options',
            'x-xss-protection', 'cross-origin-resource-policy',
            'cross-origin-embedder-policy', 'cross-origin-opener-policy',
          ]);
          const fwdHeaders: Record<string, string> = {
            'Accept': req.headers['accept'] as string || 'text/html,*/*',
            'Accept-Language': req.headers['accept-language'] as string || 'en',
            'User-Agent': 'Mozilla/5.0 (ioBroker-Aura)',
          };
          for (const k of ['content-type', 'content-length']) {
            if (req.headers[k]) fwdHeaders[k.split('-').map((p: string) => p[0].toUpperCase() + p.slice(1)).join('-')] = req.headers[k] as string;
          }
          const proxyReq = lib.request({
            hostname: target.hostname,
            port: target.port || (target.protocol === 'https:' ? 443 : 80),
            path: target.pathname + target.search,
            method: req.method || 'GET',
            timeout: 15000,
            headers: fwdHeaders,
            rejectUnauthorized: false,
          } as http.RequestOptions, (proxyRes) => {
            if ((proxyRes.statusCode === 301 || proxyRes.statusCode === 302) && proxyRes.headers.location) {
              const abs = new URL(proxyRes.headers.location, rawUrl).toString();
              const rh: Record<string, string | string[]> = {};
              for (const [k, v] of Object.entries(proxyRes.headers)) {
                if (!stripHeaders.has(k.toLowerCase()) && v !== undefined) rh[k] = v as string | string[];
              }
              rh['location'] = `/proxy?url=${encodeURIComponent(abs)}`;
              res.writeHead(proxyRes.statusCode!, rh);
              res.end();
              return;
            }
            const outHeaders: Record<string, string | string[]> = {};
            for (const [k, v] of Object.entries(proxyRes.headers)) {
              if (!stripHeaders.has(k.toLowerCase()) && v !== undefined) outHeaders[k] = v as string | string[];
            }
            res.writeHead(proxyRes.statusCode ?? 200, outHeaders);
            proxyRes.pipe(res, { end: true });
          });
          proxyReq.on('timeout', () => { proxyReq.destroy(); if (!res.headersSent) { res.writeHead(504); res.end('Proxy timeout'); } });
          proxyReq.on('error', (e) => { if (!res.headersSent) { res.writeHead(502); res.end(e.message); } });
          req.pipe(proxyReq, { end: true });
        } catch {
          res.writeHead(400); res.end('Invalid URL');
        }
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
  plugins: [react(), ioBrokerDevPlugin()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      // Proxy socket.io (HTTP polling + WebSocket) to ioBroker
      '/socket.io': {
        target: proxyTarget,
        ws: true,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'www',
    // Split heavy libs into separate chunks so the browser can download them in
    // parallel and so a code change in one widget does not bust caches for the
    // whole vendor bundle. Keeps initial payload smaller for slow mobile/VPN
    // clients.
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('/echarts/') || id.includes('/echarts-for-react/') || id.includes('/zrender/')) return 'echarts';
          if (id.includes('/recharts/') || id.includes('/d3-')) return 'recharts';
          if (id.includes('/react-grid-layout/') || id.includes('/react-resizable/') || id.includes('/react-draggable/')) return 'grid';
          if (id.includes('/ical.js/')) return 'ical';
          if (id.includes('/dompurify/')) return 'dompurify';
          if (id.includes('/lucide-react/')) return 'lucide';
          if (id.includes('/react-router') || id.includes('/@remix-run/')) return 'router';
          if (id.includes('/react-dom/') || id.includes('/scheduler/')) return 'react-dom';
          if (id.includes('/react/') || id.includes('/zustand/')) return 'react';
          return undefined;
        },
      },
    },
    // Raise the chunk-size warning threshold a bit since echarts on its own is
    // already ~700 KB — splitting more aggressively would just churn requests.
    chunkSizeWarningLimit: 900,
  },
});
