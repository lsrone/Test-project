import { createServer } from 'node:http'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { extname, resolve, sep } from 'node:path'
import { createArchiveApi } from './archive.mjs'
import { createYouTubeSearchApi } from './youtube-search.mjs'

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg',
}
const CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' data: blob: https://archive.org https://*.archive.org https://i.ytimg.com; media-src 'self' blob: https://archive.org https://*.archive.org; connect-src 'self' https://archive.org https://*.archive.org; frame-src 'none'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'"

export async function startAppServer({
  root,
  port = 28741,
  catalogApi = createArchiveApi(),
  youtubeApi = createYouTubeSearchApi(),
}) {
  const directory = resolve(root)
  let origin
  const server = createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('Content-Security-Policy', CSP)
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
    const fail = (status, message) => {
      res.statusCode = status
      res.end(message)
    }
    if (
      req.headers.host !== new URL(origin).host ||
      (req.headers.origin && req.headers.origin !== origin)
    ) {
      return fail(403, 'Forbidden origin')
    }
    const serve = async () => {
      if (!['GET', 'HEAD'].includes(req.method)) return fail(405, 'Method not allowed')
      let pathname
      try {
        pathname = decodeURIComponent(new URL(req.url || '/', origin).pathname)
      } catch {
        return fail(400, 'Invalid path')
      }
      if (
        pathname.includes('\\') ||
        pathname.split('/').some((part) => part.startsWith('.')) ||
        pathname.includes('\0')
      )
        return fail(403, 'Forbidden path')
      const file = resolve(directory, `.${pathname === '/' ? '/index.html' : pathname}`)
      if (!file.startsWith(directory + sep)) return fail(403, 'Forbidden path')
      let info
      try {
        info = await stat(file)
      } catch {
        return fail(404, 'File not found')
      }
      if (!info.isFile()) return fail(404, 'File not found')
      res.setHeader('Content-Type', MIME[extname(file)] || 'application/octet-stream')
      res.setHeader('Cache-Control', 'no-cache')
      res.setHeader('Accept-Ranges', 'bytes')
      let start = 0,
        end = info.size - 1
      if (req.headers.range) {
        const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range)
        if (!range || (!range[1] && !range[2])) {
          res.setHeader('Content-Range', `bytes */${info.size}`)
          return fail(416, 'Invalid range')
        }
        if (range[1]) {
          start = Number(range[1])
          if (range[2]) end = Math.min(Number(range[2]), end)
        } else start = Math.max(0, info.size - Number(range[2]))
        if (!Number.isSafeInteger(start) || start > end || start < 0) {
          res.setHeader('Content-Range', `bytes */${info.size}`)
          return fail(416, 'Invalid range')
        }
        res.statusCode = 206
        res.setHeader('Content-Range', `bytes ${start}-${end}/${info.size}`)
      }
      res.setHeader('Content-Length', Math.max(0, end - start + 1))
      if (req.method === 'HEAD' || !info.size) return res.end()
      const stream = createReadStream(file, { start, end })
      stream.on('error', () => res.destroy())
      res.on('close', () => stream.destroy())
      stream.pipe(res)
    }
    try {
      await youtubeApi(req, res, () =>
        catalogApi(req, res, () => {
          void serve().catch(() => fail(500, 'Unable to read file'))
        }),
      )
    } catch {
      fail(500, 'Request failed')
    }
  })
  await new Promise((accept, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', accept)
  })
  origin = `http://127.0.0.1:${server.address().port}`
  return {
    origin,
    server,
    close: () =>
      new Promise((accept, reject) => {
        server.closeAllConnections()
        server.close((error) => (error ? reject(error) : accept()))
      }),
  }
}
