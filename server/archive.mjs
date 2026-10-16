import { EnvHttpProxyAgent } from 'undici'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

const agent = new EnvHttpProxyAgent()
const ID = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,254}$/
const blocked = (value) => value === true || value === 'true'
export function archiveHost(value) {
  const url = new URL(value)
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    (url.port && url.port !== '443') ||
    !(url.hostname === 'archive.org' || url.hostname.endsWith('.archive.org'))
  )
    throw Error('Недопустимый адрес источника.')
  return url
}
export function archiveFetch(input, options = {}) {
  const { timeoutMs = 15000, ...init } = options
  const signal = AbortSignal.any([
    ...(options.signal ? [options.signal] : []),
    ...(timeoutMs ? [AbortSignal.timeout(timeoutMs)] : []),
  ])
  return fetch(input, { ...init, signal, dispatcher: agent })
}
export function createArchiveApi({ fetcher = archiveFetch } = {}) {
  const cache = new Map()
  const pending = new Map()
  const reply = (res, status, data) => {
    res.statusCode = status
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.setHeader('Cache-Control', 'no-store')
    res.end(JSON.stringify(data))
  }
  async function follow(input, options = {}) {
    let url = archiveHost(input)
    for (let i = 0; i < 5; i++) {
      const response = await fetcher(url, { ...options, redirect: 'manual' })
      if (![301, 302, 303, 307, 308].includes(response.status)) return response
      await response.body?.cancel()
      const location = response.headers.get('location')
      if (!location) break
      url = archiveHost(new URL(location, url))
    }
    throw Error('Источник не ответил.')
  }
  async function json(url) {
    const key = url.href
    if (cache.get(key)?.expires > Date.now()) return cache.get(key).data
    if (pending.has(key)) return pending.get(key)
    const task = (async () => {
      const response = await follow(url)
      if (!response.ok) {
        await response.body?.cancel()
        throw Error('Каталог сейчас недоступен. Попробуй ещё раз.')
      }
      const data = await response.json()
      if (cache.size >= 100) cache.delete(cache.keys().next().value)
      cache.set(key, { data, expires: Date.now() + 120000 })
      return data
    })()
    pending.set(key, task)
    try {
      return await task
    } finally {
      pending.delete(key)
    }
  }
  async function stream(req, res, url, type) {
    const range = req.headers.range
    if (range && !/^bytes=(\d+-\d*|-\d+)$/.test(range))
      return reply(res, 416, { message: 'Неверная позиция аудио.' })
    const controller = new AbortController()
    const close = () => {
      if (!res.writableEnded) controller.abort()
    }
    res.once('close', close)
    const timer = setTimeout(() => controller.abort(), 15000)
    try {
      const upstream = await follow(url, {
        method: req.method,
        headers: { 'Accept-Encoding': 'identity', ...(range ? { Range: range } : {}) },
        signal: controller.signal,
        timeoutMs: 0,
      })
      clearTimeout(timer)
      const mime = upstream.headers.get('content-type') || ''
      if (
        ![200, 206, 416].includes(upstream.status) ||
        (upstream.status !== 416 &&
          !(type === 'audio'
            ? /^(audio\/|application\/octet-stream)/i.test(mime)
            : /^image\//i.test(mime)))
      ) {
        await upstream.body?.cancel()
        throw Error('Этот файл сейчас недоступен. Выбери другой трек.')
      }
      res.statusCode = upstream.status
      res.setHeader('Content-Type', type === 'audio' ? 'audio/mpeg' : mime)
      res.setHeader(
        'Cache-Control',
        type === 'audio' ? 'private, no-store' : 'public, max-age=3600',
      )
      res.setHeader('Accept-Ranges', 'bytes')
      for (const name of ['content-length', 'content-range']) {
        const value = upstream.headers.get(name)
        if (value) res.setHeader(name, value)
      }
      if (req.method === 'HEAD' || !upstream.body) {
        await upstream.body?.cancel()
        res.end()
        return
      }
      await pipeline(Readable.fromWeb(upstream.body), res)
    } finally {
      clearTimeout(timer)
      res.off('close', close)
    }
  }
  return async (req, res, next) => {
    const request = new URL(req.url || '/', 'http://localhost')
    if (!request.pathname.startsWith('/api/archive/')) return next()
    if (!['GET', 'HEAD'].includes(req.method))
      return reply(res, 405, { message: 'Разрешены GET и HEAD.' })
    try {
      if (request.pathname === '/api/archive/search') {
        const query = request.searchParams.get('q') || ''
        const page = Number(request.searchParams.get('page') || 1)
        if (query.length > 600 || !Number.isInteger(page) || page < 1 || page > 10000)
          return reply(res, 400, { message: 'Неверный запрос каталога.' })
        const url = new URL('https://archive.org/advancedsearch.php')
        url.search = new URLSearchParams({
          q: `collection:netlabels AND mediatype:audio AND NOT access-restricted-item:true AND (${query || '*:*'})`,
          output: 'json',
          rows: '24',
          page: String(page),
          'sort[]':
            request.searchParams.get('sort[]') === 'downloads desc'
              ? 'downloads desc'
              : 'publicdate desc',
        }).toString()
        for (const name of ['identifier', 'title', 'creator', 'year', 'licenseurl'])
          url.searchParams.append('fl[]', name)
        return reply(res, 200, await json(url))
      }
      const match = /^\/api\/archive\/(metadata|artwork)\/([A-Za-z0-9_.-]+)$/.exec(request.pathname)
      if (match && ID.test(match[2])) {
        if (match[1] === 'metadata')
          return reply(res, 200, await json(new URL(`https://archive.org/metadata/${match[2]}`)))
        await stream(req, res, `https://archive.org/services/img/${match[2]}`, 'image')
        return
      }
      if (request.pathname === '/api/archive/audio') {
        const id = request.searchParams.get('release') || '',
          file = request.searchParams.get('file') || ''
        if (
          !ID.test(id) ||
          !/\.mp3$/i.test(file) ||
          file.length > 1200 ||
          file.includes('\\') ||
          file.includes('\0') ||
          file.split('/').some((part) => !part || part === '.' || part === '..')
        )
          return reply(res, 400, { message: 'Неверная ссылка на аудио.' })
        const data = await json(new URL(`https://archive.org/metadata/${id}`))
        const details = data.metadata || {}
        const item = data.files?.find((item) => item.name === file)
        if (
          blocked(data.is_dark) ||
          blocked(details.is_dark) ||
          blocked(details['access-restricted-item']) ||
          !item ||
          blocked(item.private)
        )
          return reply(res, 403, { message: 'Этот файл ограничен источником.' })
        await stream(
          req,
          res,
          `https://archive.org/download/${id}/${file.split('/').map(encodeURIComponent).join('/')}`,
          'audio',
        )
        return
      }
      return reply(res, 404, { message: 'Такого запроса каталога нет.' })
    } catch {
      if (res.headersSent) res.destroy()
      else
        reply(res, 502, {
          message: 'Не удалось связаться с аудиокаталогом. Проверь интернет или повтори запрос.',
        })
    }
  }
}
export function archivePlugin() {
  return {
    name: 'volna-audio-catalog',
    configureServer(server) {
      server.middlewares.use(createArchiveApi())
    },
    configurePreviewServer(server) {
      server.middlewares.use(createArchiveApi())
    },
  }
}
