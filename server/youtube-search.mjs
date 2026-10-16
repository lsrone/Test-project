import { EnvHttpProxyAgent } from 'undici'
import { createPublicYouTubeSearch, ExpiredYouTubePage } from './public-youtube.mjs'
const agent = new EnvHttpProxyAgent()
function publicFetch(input, options = {}) {
  const { timeoutMs = 15000, ...init } = options
  return fetch(input, {
    ...init,
    credentials: 'omit',
    dispatcher: agent,
    signal: AbortSignal.any([
      ...(options.signal ? [options.signal] : []),
      ...(timeoutMs ? [AbortSignal.timeout(timeoutMs)] : []),
    ]),
  })
}
export function createYouTubeSearchApi({
  fetcher = publicFetch,
  searchService,
  now = Date.now,
} = {}) {
  const search = searchService || createPublicYouTubeSearch({ fetcher, now })
  const cache = new Map(),
    pending = new Map()
  function reply(res, status, data) {
    res.statusCode = status
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.setHeader('Cache-Control', 'no-store')
    res.end(JSON.stringify(data))
  }
  return async (req, res, next) => {
    const url = new URL(req.url || '/', 'http://localhost')
    if (!url.pathname.startsWith('/api/youtube/')) return next()
    if (req.method !== 'GET') return reply(res, 405, { message: 'Разрешён только поиск.' })
    if (url.pathname !== '/api/youtube/search')
      return reply(res, 404, { message: 'Такого запроса нет.' })
    const query = (url.searchParams.get('q') || '').trim(),
      page = url.searchParams.get('pageToken') || ''
    if (query.length < 2 || query.length > 120 || !/^[A-Za-z0-9_-]{0,100}$/.test(page))
      return reply(res, 400, { message: 'Введи от 2 до 120 символов.' })
    const key = JSON.stringify([query.toLocaleLowerCase(), page])
    try {
      if (cache.get(key)?.expires > now()) return reply(res, 200, cache.get(key).data)
      if (!pending.has(key)) pending.set(key, search(query, page))
      const data = await pending.get(key)
      if (cache.size >= 100) cache.delete(cache.keys().next().value)
      cache.set(key, { data, expires: now() + 600000 })
      return reply(res, 200, data)
    } catch (error) {
      return reply(res, error instanceof ExpiredYouTubePage ? 410 : 502, {
        message:
          error instanceof ExpiredYouTubePage
            ? 'Результаты устарели. Начни поиск заново.'
            : 'Не удалось получить результаты YouTube. Повтори запрос или открой поиск в браузере.',
      })
    } finally {
      pending.delete(key)
    }
  }
}
export function youtubeSearchPlugin() {
  return {
    name: 'volna-youtube-metadata',
    configureServer(server) {
      server.middlewares.use(createYouTubeSearchApi())
    },
    configurePreviewServer(server) {
      server.middlewares.use(createYouTubeSearchApi())
    },
  }
}
