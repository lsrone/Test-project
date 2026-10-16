import { Innertube, Utils } from 'youtubei.js'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { evaluatePlayerScript } from './player-evaluator.mjs'

const ID = /^[A-Za-z0-9_-]{11}$/
export class AudioUnavailable extends Error {}
export function mediaURL(value) {
  const url = new URL(value)
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    (url.port && url.port !== '443') ||
    !url.hostname.endsWith('.googlevideo.com')
  )
    throw new AudioUnavailable('Недопустимый адрес аудиоисточника.')
  return url
}

export function createYouTubeAudio({ fetcher, getClient } = {}) {
  let client
  const cache = new Map()
  const pending = new Map()
  async function youtube() {
    if (!client)
      client = (
        getClient
          ? getClient()
          : Innertube.create({
              lang: 'ru',
              location: 'US',
              retrieve_player: true,
              retrieve_innertube_config: false,
              generate_session_locally: true,
              enable_session_cache: false,
              enable_safety_mode: true,
              fetch: fetcher,
            })
      ).catch((error) => {
        client = undefined
        throw error
      })
    return client
  }
  async function follow(url, options) {
    for (let i = 0; i < 4; i++) {
      const response = await fetcher(mediaURL(url), { ...options, redirect: 'manual' })
      if (![301, 302, 303, 307, 308].includes(response.status)) return response
      await response.body?.cancel()
      const location = response.headers.get('location')
      if (!location) break
      url = new URL(location, url).href
    }
    throw new AudioUnavailable('Источник аудио не ответил.')
  }
  async function resolve(id) {
    if (!ID.test(id)) throw new AudioUnavailable('Некорректная ссылка на запись.')
    const cached = cache.get(id)
    if (cached && cached.expires > Date.now()) return cached
    if (pending.has(id)) return pending.get(id)
    const operation = (async () => {
      const yt = await youtube()
      let info
      try {
        info = await yt.getBasicInfo(id, { client: 'ANDROID' })
      } catch (error) {
        if (error?.info?.status && error.info.status !== 'OK')
          throw new AudioUnavailable(
            'Эта запись недоступна. Можно подобрать другую доступную запись.',
          )
        throw error
      }
      if (info.playability_status?.status !== 'OK' || info.playability_status?.embeddable === false)
        throw new AudioUnavailable(
          'Эта запись ограничена источником. Можно подобрать другую доступную запись.',
        )
      const formats = (info.streaming_data?.adaptive_formats || [])
        .filter(
          (format) =>
            format.has_audio &&
            !format.has_video &&
            /^audio\/(mp4|webm)/.test(format.mime_type || '') &&
            !format.drm_families?.length &&
            !format.drm_track_type &&
            !format.fair_play_key_uri,
        )
        .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))
      if (!formats.length || info.basic_info?.is_live)
        throw new AudioUnavailable('Источник не предоставил доступный аудиопоток для этой записи.')
      Utils.Platform.shim.eval = evaluatePlayerScript
      const format = formats[0]
      const url = mediaURL(await format.decipher(yt.session.player))
      const probe = await follow(url.href, {
        headers: { Range: 'bytes=0-0', 'Accept-Encoding': 'identity' },
      })
      await probe.body?.cancel()
      if (!probe.ok)
        throw new AudioUnavailable(
          'Аудио этой записи сейчас недоступно. Можно подобрать другую запись.',
        )
      const value = {
        url: url.href,
        mime: format.mime_type,
        duration: info.basic_info?.duration || 0,
        expires: Math.min(
          Date.now() + 90000,
          Number(url.searchParams.get('expire') || Infinity) * 1000 - 30000,
        ),
      }
      if (cache.size >= 100) cache.delete(cache.keys().next().value)
      cache.set(id, value)
      return value
    })()
    pending.set(id, operation)
    try {
      return await operation
    } finally {
      pending.delete(id)
    }
  }
  async function stream(req, res, id) {
    const range = req.headers?.range
    if (range && !/^bytes=(\d+-\d*|-\d+)$/.test(range)) {
      res.statusCode = 416
      res.end()
      return
    }
    const source = await resolve(id)
    const controller = new AbortController()
    const disconnect = () => {
      if (!res.writableEnded) controller.abort()
    }
    res.once('close', disconnect)
    const timeout = setTimeout(() => controller.abort(), 12000)
    try {
      const upstream = await follow(source.url, {
        method: req.method,
        headers: { 'Accept-Encoding': 'identity', ...(range ? { Range: range } : {}) },
        signal: controller.signal,
        timeoutMs: 0,
      })
      clearTimeout(timeout)
      if (![200, 206, 416].includes(upstream.status)) {
        cache.delete(id)
        await upstream.body?.cancel()
        throw new AudioUnavailable('Аудио этой записи сейчас недоступно. Выбери другую запись.')
      }
      res.statusCode = upstream.status
      res.setHeader('Content-Type', source.mime)
      res.setHeader('Cache-Control', 'private, no-store')
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
      clearTimeout(timeout)
      res.off('close', disconnect)
    }
  }
  return { resolve, stream }
}
