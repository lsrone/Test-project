import { Innertube, Player, Utils, YT } from 'youtubei.js'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { evaluatePlayerScript } from './player-evaluator.mjs'

import { AudioSourceError, AudioUnavailable, audioFailure } from './audio-errors.mjs'
export { AudioUnavailable } from './audio-errors.mjs'

const ID = /^[A-Za-z0-9_-]{11}$/
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
  let playerLoading
  async function transport(input, options) {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url)
    const stage = url.hostname.endsWith('.googlevideo.com')
      ? 'audio'
      : /\/s\/player\/|\/iframe_api/.test(url.pathname)
        ? 'player'
        : 'metadata'
    try {
      const response = await fetcher(input, options)
      if (!response.ok && stage !== 'audio') {
        await response.body?.cancel()
        throw new AudioSourceError('HTTP', stage, { httpStatus: response.status })
      }
      return response
    } catch (error) {
      throw audioFailure(error, stage)
    }
  }
  async function player(yt) {
    if (yt.session.player) return yt.session.player
    if (!playerLoading)
      playerLoading = Player.create(undefined, transport).catch((error) => {
        playerLoading = undefined
        throw audioFailure(error, 'player')
      })
    yt.session.player = await playerLoading
    return yt.session.player
  }
  async function youtube() {
    if (!client)
      client = (
        getClient
          ? getClient()
          : Innertube.create({
              lang: 'ru',
              location: 'US',
              retrieve_player: false,
              retrieve_innertube_config: false,
              generate_session_locally: true,
              enable_session_cache: false,
              enable_safety_mode: true,
              fetch: transport,
            })
      ).catch((error) => {
        client = undefined
        throw error
      })
    return client
  }
  async function follow(url, options) {
    for (let i = 0; i < 4; i++) {
      const response = await transport(mediaURL(url), { ...options, redirect: 'manual' })
      if (![301, 302, 303, 307, 308].includes(response.status)) return response
      await response.body?.cancel()
      const location = response.headers.get('location')
      if (!location) break
      url = new URL(location, url).href
    }
    throw new AudioUnavailable('Источник аудио не ответил.')
  }
  async function information(yt, id) {
    let response
    try {
      response = await yt.actions.execute('/player', {
        videoId: id,
        client: 'WEB',
        playbackContext: {
          contentPlaybackContext: { signatureTimestamp: yt.session.player?.signature_timestamp },
        },
      })
    } catch (error) {
      throw audioFailure(error, 'metadata')
    }
    const raw = response.data?.playerResponse || response.data
    const status = raw?.playabilityStatus
    if (status?.status === 'LOGIN_REQUIRED')
      throw new AudioSourceError('LOGIN_REQUIRED', 'metadata', { providerStatus: status.status })
    if (status?.status !== 'OK')
      throw new AudioUnavailable(undefined, 'UNAVAILABLE', { providerStatus: status?.status })
    // YouTube.js coerces a missing playableInEmbed to false. Only an explicit
    // provider refusal is a restriction; absence of the field is not one.
    if (status.playableInEmbed === false)
      throw new AudioUnavailable(
        'Автор запретил воспроизведение этой записи в приложениях.',
        'EMBED_BLOCKED',
      )
    return new YT.VideoInfo(
      [{ ...response, data: raw }],
      yt.actions,
      Utils.generateRandomString(16),
    )
  }
  async function resolve(id) {
    if (!ID.test(id)) throw new AudioUnavailable('Некорректная ссылка на запись.')
    const cached = cache.get(id)
    if (cached && cached.expires > Date.now()) return cached
    if (pending.has(id)) return pending.get(id)
    const operation = (async () => {
      const yt = await youtube()
      let info = await information(yt, id)
      const formatsFor = (info) =>
        (info.streaming_data?.adaptive_formats || [])
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
      let formats = formatsFor(info)
      let format = formats[0]
      const requiresPlayer = (item) =>
        item &&
        (item.signature_cipher ||
          item.cipher ||
          (item.url && new URL(item.url).searchParams.has('n')))
      if (!info.basic_info?.is_live && requiresPlayer(format) && !yt.session.player) {
        await player(yt)
        // Ciphered WEB responses depend on the current signature timestamp.
        info = await information(yt, id)
        formats = formatsFor(info)
        format = formats[0]
      }
      if (!formats.length || info.basic_info?.is_live)
        throw new AudioUnavailable(
          'YouTube не предоставил доступный аудиопоток для этой записи.',
          'NO_AUDIO',
        )
      Utils.Platform.shim.eval = evaluatePlayerScript
      let url
      try {
        const decipher = requiresPlayer(format) ? await player(yt) : yt.session.player
        url = mediaURL(await format.decipher(decipher))
      } catch (error) {
        if (error instanceof AudioSourceError) throw error
        throw new AudioSourceError('PLAYER_SCRIPT', 'player')
      }
      const probe = await follow(url.href, {
        headers: { Range: 'bytes=0-0', 'Accept-Encoding': 'identity' },
      })
      await probe.body?.cancel()
      if (!probe.ok) throw new AudioSourceError('HTTP', 'audio', { httpStatus: probe.status })
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
        throw new AudioSourceError('HTTP', 'audio', { httpStatus: upstream.status })
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
