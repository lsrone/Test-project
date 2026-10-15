import { readdir, readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import path from 'node:path'

async function files(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const nested = await Promise.all(
    entries.map((entry) =>
      entry.isDirectory()
        ? files(path.join(directory, entry.name))
        : path.join(directory, entry.name),
    ),
  )
  return nested.flat().filter((file) => !file.endsWith('sw.js'))
}
const assets = await files('dist')
const hash = createHash('sha256')
for (const file of assets) hash.update(await readFile(file))
const cacheName = `volna-${hash.digest('hex').slice(0, 12)}`
const paths = ['/', ...assets.map((file) => '/' + file.split(path.sep).slice(1).join('/'))]
const source = `
const CACHE = ${JSON.stringify(cacheName)};
const ASSETS = ${JSON.stringify(paths)};
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('volna-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(new URL(request.url).pathname);
    const range = request.headers.get('range');
    if (cached && range) {
      const data = await cached.arrayBuffer();
      const match = /^bytes=(\\d+)-(\\d*)$/.exec(range);
      if (match) {
        const start = Number(match[1]);
        const end = match[2] ? Math.min(Number(match[2]), data.byteLength - 1) : data.byteLength - 1;
        if (start > end || start >= data.byteLength) return new Response(null, { status: 416, headers: { 'Content-Range': 'bytes */' + data.byteLength } });
        return new Response(data.slice(start, end + 1), { status: 206, headers: { 'Content-Type': cached.headers.get('Content-Type') || 'audio/mpeg', 'Content-Range': 'bytes ' + start + '-' + end + '/' + data.byteLength, 'Content-Length': String(end - start + 1), 'Accept-Ranges': 'bytes' } });
      }
    }
    if (request.mode === 'navigate') {
      try { return await fetch(request); } catch { return (await cache.match('/index.html')) || (await cache.match('/')); }
    }
    return cached || fetch(request);
  })());
});
`
await writeFile('dist/sw.js', source)
console.log(`Offline cache: ${paths.length} assets (${cacheName})`)
