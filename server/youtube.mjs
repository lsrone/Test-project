import { EnvHttpProxyAgent } from 'undici'
import { createPublicYouTubeSearch, ExpiredYouTubePage } from './public-youtube.mjs'

const agent = new EnvHttpProxyAgent()
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/

function proxyFetch(input, options = {}) {
  const signals = [AbortSignal.timeout(12000), options.signal, input?.signal].filter(Boolean)
  return globalThis.fetch(input, {
    ...options,
    dispatcher: agent,
    signal: AbortSignal.any(signals),
  })
}

function decodeTitle(value = '') {
  const entities = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>' }
  return String(value).replace(/&(#\d+|amp|quot|apos|lt|gt);/g, (match, entity) => {
    if (entity.startsWith('#')) {
      const code = Number(entity.slice(1))
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match
    }
    return entities[entity] ?? match
  })
}

export function createYouTubeApi({
  getApiKey = () => process.env.YOUTUBE_API_KEY,
  fetcher = proxyFetch,
  now = Date.now,
} = {}) {
  const cache = new Map()
  const publicSearch = createPublicYouTubeSearch({ fetcher, now })
  const reply = (res, status, data) => {
    res.statusCode = status
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.end(JSON.stringify(data))
  }

  return async (req, res, next) => {
    const request = new URL(req.url || '/', 'http://localhost')
    if (!request.pathname.startsWith('/api/youtube/')) return next()
    if (req.method !== 'GET') return reply(res, 405, { message: 'Разрешены только GET-запросы.' })
    const key = getApiKey()
    if (request.pathname === '/api/youtube/status')
      return reply(res, 200, { configured: true, mode: key ? 'official' : 'public' })
    if (request.pathname !== '/api/youtube/search')
      return reply(res, 404, { message: 'Такого запроса нет.' })
    const query = request.searchParams.get('q')?.trim() || ''
    const pageToken = request.searchParams.get('pageToken') || ''
    if (query.length < 2 || query.length > 120 || !/^[A-Za-z0-9_=-]{0,200}$/.test(pageToken)) {
      return reply(res, 400, { message: 'Введи от 2 до 120 символов для поиска.' })
    }
    const cacheKey = JSON.stringify([
      key ? 'official' : 'public',
      query.toLocaleLowerCase(),
      pageToken,
    ])
    const cached = cache.get(cacheKey)
    if (cached && cached.expires > now()) return reply(res, 200, cached.data)

    function remember(data) {
      if (cache.size >= 100) cache.delete(cache.keys().next().value)
      cache.set(cacheKey, { data, expires: now() + 15 * 60 * 1000 })
      return reply(res, 200, data)
    }

    if (!key) {
      try {
        return remember(await publicSearch(query, pageToken))
      } catch (error) {
        if (error instanceof ExpiredYouTubePage)
          return reply(res, 410, { message: 'Список устарел. Запусти поиск заново.' })
        return reply(res, 502, {
          message: 'Поиск YouTube сейчас недоступен. Попробуй позже или открой поиск на YouTube.',
        })
      }
    }

    const endpoint = new URL('https://www.googleapis.com/youtube/v3/search')
    endpoint.search = new URLSearchParams({
      part: 'snippet',
      type: 'video',
      videoCategoryId: '10',
      videoEmbeddable: 'true',
      videoSyndicated: 'true',
      safeSearch: 'moderate',
      maxResults: '12',
      q: query,
      key,
      ...(pageToken ? { pageToken } : {}),
    }).toString()
    try {
      const response = await fetcher(endpoint, { signal: AbortSignal.timeout(12000) })
      const body = await response.json()
      if (!response.ok) {
        const reason = body.error?.errors?.[0]?.reason
        if (reason === 'quotaExceeded' || reason === 'dailyLimitExceeded')
          return reply(res, 429, {
            message:
              'Дневная квота поиска YouTube закончилась. Открытие по ссылке по-прежнему доступно.',
          })
        if (reason === 'accessNotConfigured' || reason === 'keyInvalid' || response.status === 400)
          return reply(res, 503, {
            message: 'Проверь ключ и включение YouTube Data API v3 в Google Cloud.',
          })
        return reply(res, 502, {
          message: 'YouTube отклонил поиск. Проверь доступ к API и ограничения ключа.',
        })
      }
      const data = {
        items: (Array.isArray(body.items) ? body.items : [])
          .filter((item) => VIDEO_ID.test(item.id?.videoId))
          .map((item) => ({
            id: item.id.videoId,
            title: decodeTitle(item.snippet?.title),
            channel: decodeTitle(item.snippet?.channelTitle),
            thumbnail: `https://i.ytimg.com/vi/${item.id.videoId}/hqdefault.jpg`,
          })),
        nextPageToken: typeof body.nextPageToken === 'string' ? body.nextPageToken : undefined,
      }
      return remember(data)
    } catch {
      // Never return upstream URLs or exception messages: they can include the API key.
      return reply(res, 502, {
        message: 'Не удалось связаться с YouTube. Проверь интернет и доступ к www.googleapis.com.',
      })
    }
  }
}

export function youtubePlugin() {
  return {
    name: 'volna-youtube-api',
    configureServer(server) {
      server.middlewares.use(createYouTubeApi())
    },
    configurePreviewServer(server) {
      server.middlewares.use(createYouTubeApi())
    },
  }
}
