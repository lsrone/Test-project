import { describe, it, expect, vi } from 'vitest'
import { createYouTubeAudio } from './youtube-audio.mjs'
import { createYouTubeApi } from './youtube.mjs'
import { desktopFetch } from '../desktop/network.mjs'
import { Player, Utils } from 'youtubei.js'
import { evaluatePlayerScript } from './player-evaluator.mjs'

const id = '4xDzrJKXOOY'
const address = 'https://rr1.example.googlevideo.com/videoplayback?expire=9999999999'
const raw = (playabilityStatus = { status: 'OK' }) => ({
  playabilityStatus,
  videoDetails: {
    videoId: id,
    title: 'Song',
    author: 'Artist',
    lengthSeconds: '48',
    thumbnail: { thumbnails: [] },
  },
  streamingData: {
    adaptiveFormats: [
      {
        itag: 140,
        audioQuality: 'AUDIO_QUALITY_MEDIUM',
        mimeType: 'audio/mp4; codecs="mp4a.40.2"',
        bitrate: 128000,
        url: address,
      },
    ],
  },
})
async function invoke(api, path) {
  let result
  const response = {
    statusCode: 200,
    setHeader() {},
    end(body) {
      result = { status: this.statusCode, body: JSON.parse(body) }
    },
  }
  await api({ method: 'GET', url: path }, response, () => {
    throw Error('fallthrough')
  })
  return result
}
describe('real YouTube.js audio contracts', () => {
  it('uses real session, WEB request, parser and Format without loading player scripts for a direct audio URL', async () => {
    const calls = []
    const fetcher = async (input, options) => {
      const request = new Request(input, options)
      calls.push(request.url)
      if (request.url.includes('/youtubei/v1/player')) {
        const body = await request.json()
        expect(body.videoId).toBe(id)
        expect(body.context.client.clientName).toBe('WEB')
        // Missing playableInEmbed is not an explicit false/refusal.
        return Response.json(raw())
      }
      if (request.url.startsWith(address)) return new Response('0', { status: 206 })
      throw Error(`Unnecessary request: ${new URL(request.url).pathname}`)
    }
    const audio = createYouTubeAudio({ fetcher })
    const source = await audio.resolve(id)
    expect(source.url).toBe(address)
    expect(source.duration).toBe(48)
    expect(calls).toHaveLength(2)
    expect(calls.some((url) => url.includes('iframe_api'))).toBe(false)
  })
  it('honours explicit restrictions and separates login checks from track availability', async () => {
    for (const [status, code] of [
      [{ status: 'OK', playableInEmbed: false }, 'EMBED_BLOCKED'],
      [
        { status: 'LOGIN_REQUIRED', reason: 'Sign in to confirm you are not a bot' },
        'LOGIN_REQUIRED',
      ],
      [{ status: 'UNPLAYABLE', reason: 'Video unavailable' }, 'UNAVAILABLE'],
    ]) {
      const fetcher = vi.fn(async () => Response.json(raw(status)))
      const audio = createYouTubeAudio({ fetcher })
      await expect(audio.resolve(id)).rejects.toMatchObject({ code })
      expect(fetcher).toHaveBeenCalledTimes(1)
    }
  })
  it('returns actionable safe failure details and does not search replacements for transport failures', async () => {
    const search = vi.fn()
    for (const [fetcher, code, stage] of [
      [
        async () => new Response('private response with secret=never-leak', { status: 403 }),
        'HTTP',
        'metadata',
      ],
      [
        async () => {
          throw new TypeError('fetch failed', { cause: { code: 'ENOTFOUND', host: 'secret-host' } })
        },
        'NETWORK',
        'metadata',
      ],
    ]) {
      const api = createYouTubeApi({ fetcher, publicSearchService: search })
      const result = await invoke(api, `/api/youtube/resolve?id=${id}&title=Song&artist=Artist`)
      expect(result.status).toBe(503)
      expect(result.body.diagnostic).toMatchObject({ code, stage, videoId: id })
      expect(JSON.stringify(result)).not.toMatch(/never-leak|secret-host|private response/)
      expect(result.body.message).not.toContain('запретил')
    }
    expect(search).not.toHaveBeenCalled()
  })
  it('runs the actual Player.decipher processor contract in the isolated evaluator', async () => {
    Utils.Platform.shim.eval = evaluatePlayerScript
    const player = new Player('fixture', 1, {
      output: `
      var exportedVars = { nsigFunction: function(url, sp, sig) {
        class Params {
          constructor() { this.values = { n: 'transformed', [sp]: 'signed' } }
          get(key) { return this.values[key] }
          transform() {}
        }
        return new Params()
      } };
    `,
    })
    const cipher = new URLSearchParams({
      url: `${address}&n=input`,
      s: 'cipher',
      sp: 'signature',
    }).toString()
    const url = new URL(await player.decipher(undefined, cipher))
    expect(url.searchParams.get('n')).toBe('transformed')
    expect(url.searchParams.get('signature')).toBe('signed')
  })
  it('passes actual SDK POST bodies and Range headers to the Windows Chromium transport without cookies', async () => {
    const chromium = vi.fn(async (_url, options) => {
      expect(options.credentials).toBe('omit')
      expect(options.signal).toBeInstanceOf(AbortSignal)
      return Response.json({ ok: true })
    })
    const fetcher = desktopFetch(chromium)
    const request = new Request('https://www.youtube.com/youtubei/v1/player', { method: 'POST' })
    await fetcher(request, {
      body: '{"videoId":"4xDzrJKXOOY"}',
      headers: { 'Content-Type': 'application/json' },
    })
    const first = chromium.mock.calls[0]
    expect(first[0]).toBe(request.url)
    expect(first[1].method).toBe('POST')
    expect(new TextDecoder().decode(first[1].body)).toBe('{"videoId":"4xDzrJKXOOY"}')
    await fetcher(address, { headers: { Range: 'bytes=20-40' }, redirect: 'manual', timeoutMs: 0 })
    expect(chromium.mock.calls[1][1].headers.get('Range')).toBe('bytes=20-40')
    expect(chromium.mock.calls[1][1].redirect).toBe('manual')
  })
})
