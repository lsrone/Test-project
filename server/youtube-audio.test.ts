import { describe, it, expect, vi } from 'vitest'
import { createServer } from 'node:http'
import { createYouTubeAudio, mediaURL } from './youtube-audio.mjs'
import { evaluatePlayerScript } from './player-evaluator.mjs'
import { sameRecording } from './music-matching.mjs'
import { createYouTubeApi } from './youtube.mjs'

const address = 'https://rr1.example.googlevideo.com/videoplayback?expire=9999999999'
function info(overrides = {}) {
  return {
    session: { player: {} },
    getBasicInfo: async () => ({
      playability_status: { status: 'OK', embeddable: true },
      basic_info: { duration: 48 },
      streaming_data: {
        adaptive_formats: [
          {
            has_audio: true,
            has_video: false,
            mime_type: 'audio/mp4',
            bitrate: 128000,
            decipher: async () => address,
          },
        ],
      },
      ...overrides,
    }),
  }
}
describe('audio transport without video', () => {
  it('proxies an actual partial response, preserves seeking headers and bounds redirect destinations', async () => {
    const fetcher = vi.fn(
      async (_url, options) =>
        new Response(options.headers.Range === 'bytes=0-0' ? '0' : '2345', {
          status: 206,
          headers: {
            'Content-Type': 'audio/mp4',
            'Content-Range':
              options.headers.Range === 'bytes=0-0' ? 'bytes 0-0/10' : 'bytes 2-5/10',
            'Content-Length': options.headers.Range === 'bytes=0-0' ? '1' : '4',
          },
        }),
    )
    const service = createYouTubeAudio({ fetcher, getClient: async () => info() })
    const server = createServer((req, res) => {
      void service.stream(req, res, 'jfKfPfyJRdk').catch(() => {
        res.statusCode = 500
        res.end()
      })
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    try {
      const response = await fetch(`http://127.0.0.1:${(server.address() as any).port}`, {
        headers: { Range: 'bytes=2-5' },
      })
      expect(response.status).toBe(206)
      expect(await response.text()).toBe('2345')
      expect(response.headers.get('content-range')).toBe('bytes 2-5/10')
      expect((await service.resolve('jfKfPfyJRdk')).duration).toBe(48)
      expect(fetcher).toHaveBeenCalledTimes(2)
      for (const url of [
        'http://rr1.googlevideo.com/x',
        'https://googlevideo.com.evil.example/x',
        'https://127.0.0.1/x',
        'https://user:pass@rr1.googlevideo.com/x',
      ])
        expect(() => mediaURL(url)).toThrow()
    } finally {
      server.closeAllConnections()
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
  })
  it('rejects restricted/DRM/video-only formats and private-network redirects', async () => {
    for (const overrides of [
      { playability_status: { status: 'LOGIN_REQUIRED' } },
      { playability_status: { status: 'OK', embeddable: false } },
      {
        streaming_data: {
          adaptive_formats: [{ has_audio: true, has_video: true, mime_type: 'video/mp4' }],
        },
      },
      {
        streaming_data: {
          adaptive_formats: [
            {
              has_audio: true,
              has_video: false,
              mime_type: 'audio/mp4',
              drm_families: ['WIDEVINE'],
            },
          ],
        },
      },
    ]) {
      const fetcher = vi.fn()
      await expect(
        createYouTubeAudio({ fetcher, getClient: async () => info(overrides) }).resolve(
          'jfKfPfyJRdk',
        ),
      ).rejects.toThrow()
      expect(fetcher).not.toHaveBeenCalled()
    }
    const fetcher = vi.fn(
      async () =>
        new Response(null, { status: 302, headers: { Location: 'https://127.0.0.1/private' } }),
    )
    await expect(
      createYouTubeAudio({ fetcher, getClient: async () => info() }).resolve('jfKfPfyJRdk'),
    ).rejects.toThrow()
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
  it('evaluates only isolated player results without host APIs or dynamic code', () => {
    expect(
      evaluatePlayerScript({ output: "return {n:'transformed',sig:'signed',extra:'discard'}" }),
    ).toEqual({ n: 'transformed', sig: 'signed' })
    expect(
      evaluatePlayerScript({ output: 'return {n:typeof process,sig:typeof require}' }),
    ).toEqual({ n: 'undefined', sig: 'undefined' })
    expect(() => evaluatePlayerScript({ output: "return Function('return process')()" })).toThrow()
  })
  it('only substitutes a matching available recording and reports the changed source', async () => {
    const resolve = vi.fn(async (id) => {
      if (id === 'jfKfPfyJRdk') {
        const { AudioUnavailable } = await import('./youtube-audio.mjs')
        throw new AudioUnavailable('restricted')
      }
      return { duration: 180 }
    })
    const api = createYouTubeApi({
      audioService: { resolve },
      publicSearchService: async () => ({
        items: [
          { id: 'xxxxxxxxxxx', title: 'Another song', channel: 'Artist' },
          { id: 'yyyyyyyyyyy', title: 'Artist - Song remix', channel: 'Artist' },
          { id: '4xDzrJKXOOY', title: 'Artist - Song (official audio)', channel: 'Artist - Topic' },
        ],
      }),
    })
    let body: any
    const res = {
      statusCode: 200,
      setHeader: () => {},
      end: (text) => {
        body = JSON.parse(text)
      },
    }
    await api(
      { url: '/api/youtube/resolve?id=jfKfPfyJRdk&title=Song&artist=Artist', method: 'GET' },
      res,
      () => {},
    )
    expect(res.statusCode).toBe(200)
    expect(body).toMatchObject({
      id: '4xDzrJKXOOY',
      replacement: true,
      duration: 180,
      audio: '/api/youtube/audio?id=4xDzrJKXOOY',
    })
    expect(resolve.mock.calls.map((args) => args[0])).toEqual(['jfKfPfyJRdk', '4xDzrJKXOOY'])
    expect(sameRecording('Song', 'Artist', { title: 'Song', channel: 'Other' })).toBe(false)
  })
})
