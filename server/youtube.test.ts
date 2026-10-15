import { describe, expect, it, vi } from 'vitest'
import { createYouTubeApi } from './youtube.mjs'

async function call(middleware, url: string) {
  let response: { status: number; body: any }
  const res = {
    statusCode: 200,
    setHeader: vi.fn(),
    end: (body: string) => {
      response = { status: res.statusCode, body: JSON.parse(body) }
    },
  }
  await middleware({ url, method: 'GET' }, res, () => {
    throw new Error('Unexpected fallthrough')
  })
  return response!
}

describe('YouTube API gateway', () => {
  it('offers public search without requiring credentials or making a status network request', async () => {
    const fetcher = vi.fn()
    const middleware = createYouTubeApi({ getApiKey: () => undefined, fetcher })
    expect((await call(middleware, '/api/youtube/status')).body).toEqual({
      configured: true,
      mode: 'public',
    })
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('keeps public search failures readable without exposing transport details', async () => {
    const middleware = createYouTubeApi({
      getApiKey: () => undefined,
      fetcher: async () => {
        throw new Error('private transport details')
      },
    })
    const result = await call(middleware, '/api/youtube/search?q=jazz')
    expect(result.status).toBe(502)
    expect(result.body.message).toContain('Поиск YouTube сейчас недоступен')
    expect(JSON.stringify(result)).not.toContain('private transport details')
  })

  it('requests embeddable music, paginates, and caches without exposing credentials', async () => {
    const fetcher = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            items: [
              {
                id: { videoId: 'jfKfPfyJRdk' },
                snippet: { title: 'Jazz &amp; chill', channelTitle: 'Music' },
              },
              { id: { videoId: '<script>' }, snippet: {} },
            ],
            nextPageToken: 'CAwQAA',
          }),
          { status: 200 },
        ),
    )
    const middleware = createYouTubeApi({ getApiKey: () => 'unit-test-placeholder', fetcher })
    const first = await call(middleware, '/api/youtube/search?q=jazz')
    expect(first.status).toBe(200)
    expect(first.body.items).toEqual([
      {
        id: 'jfKfPfyJRdk',
        title: 'Jazz & chill',
        channel: 'Music',
        thumbnail: 'https://i.ytimg.com/vi/jfKfPfyJRdk/hqdefault.jpg',
      },
    ])
    expect(JSON.stringify(first.body)).not.toContain('unit-test-placeholder')
    const url = fetcher.mock.calls[0][0] as URL
    expect(url.origin).toBe('https://www.googleapis.com')
    expect(url.searchParams.get('videoEmbeddable')).toBe('true')
    expect(url.searchParams.get('videoCategoryId')).toBe('10')
    await call(middleware, '/api/youtube/search?q=jazz')
    expect(fetcher).toHaveBeenCalledTimes(1)
    await call(middleware, '/api/youtube/search?q=jazz&pageToken=CAwQAA')
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect((fetcher.mock.calls[1][0] as URL).searchParams.get('pageToken')).toBe('CAwQAA')
  })

  it('explains quota exhaustion and hides transport errors with credential URLs', async () => {
    const quota = createYouTubeApi({
      getApiKey: () => 'unit-test-placeholder',
      fetcher: async () =>
        new Response(JSON.stringify({ error: { errors: [{ reason: 'quotaExceeded' }] } }), {
          status: 403,
        }),
    })
    expect((await call(quota, '/api/youtube/search?q=jazz')).status).toBe(429)
    const broken = createYouTubeApi({
      getApiKey: () => 'unit-test-placeholder',
      fetcher: async () => {
        throw new Error('https://example.com?key=unit-test-placeholder')
      },
    })
    const result = await call(broken, '/api/youtube/search?q=jazz')
    expect(result.status).toBe(502)
    expect(JSON.stringify(result)).not.toContain('unit-test-placeholder')
  })
})
