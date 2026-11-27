// Serves the repo on this machine for looking at Latecup's pages, with a copy of the feed and
// a stand-in for the report form. Nothing here is published (the folder starts with _).
//
//   node _tools/latecup-pages/serve.mjs [--port 8717] [--feed <folder with manifest.json>] [--log <file>] [--root <folder>]
//
//   http://localhost:8717/latecup/                        the page on the live feed (reads only)
//   http://localhost:8717/latecup/?feed=/__feed/          the page on the folder given with --feed
//   ...&now=2026-11-28T03:40:00Z                          with a fixed clock
//
// A page opened on localhost never posts to the real form: map.js sends reports, confirmations,
// ratings, fixes and new cafés to /__report on its own origin, and this server keeps each one
// (GET /__report lists them as JSON, DELETE /__report forgets them). The ?feed= and ?now=
// overrides work on localhost only; the live page takes neither from its address.
// --root serves another copy of the site (an older checkout, to compare the two side by side).
import { createServer } from 'node:http';
import { readFileSync, statSync, appendFileSync } from 'node:fs';
import { dirname, join, normalize, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const arg = (name) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : null; };
const ROOT = arg('--root') ? resolve(arg('--root')) : join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PORT = +(arg('--port') || 8717), FEED = arg('--feed') ? resolve(arg('--feed')) : null, LOG = arg('--log');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.xml': 'application/xml', '.txt': 'text/plain; charset=utf-8', '.ico': 'image/x-icon' };
const FIELDS = { 'entry.416204548': 'type', 'entry.1281919753': 'place_id', 'entry.2034522100': 'place_name', 'entry.1615506675': 'note', 'entry.68838780': 'app' };
const reports = [];

const file = (base, rel) => { // a file under base, or null; never above it, and nothing whose name starts with a dot
  try {
    const path = normalize(join(base, decodeURIComponent(rel)));
    if ((path !== base && !path.startsWith(base + '/')) || /(^|\/)\./.test(path.slice(base.length))) return null;
    return statSync(path).isDirectory() ? (statSync(join(path, 'index.html')), join(path, 'index.html')) : path;
  } catch { return null; }
};
createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost'), send = (code, type, body) => { res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store' }); res.end(req.method === 'HEAD' ? undefined : body); };
  if (url.pathname === '/__report') {
    if (req.method === 'POST') {
      let body = '';
      req.on('data', (c) => { body += c; if (body.length > 1e5) req.destroy(); });
      req.on('end', () => {
        const row = { at: new Date().toISOString() };
        for (const [k, v] of new URLSearchParams(body)) row[FIELDS[k] || k] = v;
        reports.push(row); console.log('report', JSON.stringify(row));
        if (LOG) appendFileSync(LOG, JSON.stringify(row) + '\n');
        send(200, 'text/plain; charset=utf-8', 'kept on this machine\n');
      });
      return;
    }
    if (req.method === 'DELETE') { reports.length = 0; return send(200, 'text/plain; charset=utf-8', 'forgotten\n'); }
    return send(200, 'application/json; charset=utf-8', JSON.stringify(reports));
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(405, 'text/plain; charset=utf-8', 'no\n');
  const feed = url.pathname.startsWith('/__feed/');
  if (feed && !FEED) return send(404, 'text/plain; charset=utf-8', 'start the server with --feed <folder>\n');
  const path = feed ? file(FEED, url.pathname.slice(8)) : file(ROOT, url.pathname);
  if (!path) return send(404, 'text/plain; charset=utf-8', 'not found\n');
  if (!feed && !url.pathname.endsWith('/') && path.endsWith('/index.html') && !url.pathname.endsWith('index.html')) { res.writeHead(301, { location: url.pathname + '/' + url.search }); return res.end(); }
  send(200, TYPES[extname(path)] || 'application/octet-stream', readFileSync(path));
}).listen(PORT, '127.0.0.1', () => console.log(`http://localhost:${PORT}/latecup/${FEED ? '?feed=/__feed/' : ''}  (reports stay here${LOG ? ', in ' + LOG : ''})`));
