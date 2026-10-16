import { describe, expect, it, vi } from 'vitest'
import { createYouTubeSearchApi } from './youtube-search.mjs'

function providerResponse(next = false) {
  const contents = [
    {
      itemSectionRenderer: {
        contents: [
          {
            videoRenderer: {
              videoId: next ? '4xDzrJKXOOY' : 'jfKfPfyJRdk',
              title: { runs: [{ text: next ? 'Second mix' : 'Jazz & chill' }] },
              thumbnail: {
                thumbnails: [{ url: 'https://i.ytimg.com/test.jpg', width: 320, height: 180 }],
              },
              ownerText: { runs: [{ text: 'Music channel' }] },
              lengthText: { simpleText: '48:00' },
            },
          },
        ],
      },
    },
  ]
  if (next)
    return {
      onResponseReceivedCommands: [
        { appendContinuationItemsAction: { continuationItems: contents } },
      ],
    }
  return {
    contents: {
      twoColumnSearchResultsRenderer: {
        primaryContents: {
          sectionListRenderer: {
            contents: [
              ...contents,
              {
                continuationItemRenderer: {
                  continuationEndpoint: {
                    commandMetadata: { webCommandMetadata: { apiUrl: '/youtubei/v1/search' } },
                    continuationCommand: {
                      token: 'fixture-next-page',
                      request: 'CONTINUATION_REQUEST_TYPE_SEARCH',
                    },
                  },
                },
              },
            ],
          },
        },
      },
    },
  }
}

async function call(middleware, url: string) {
  let result: { status: number; body: any }
  const response = {
    statusCode: 200,
    setHeader: vi.fn(),
    end: (body: string) => {
      result = { status: response.statusCode, body: JSON.parse(body) }
    },
  }
  await middleware({ url, method: 'GET' }, response, () => {
    throw new Error('Unexpected route')
  })
  return result!
}

describe('GitHub YouTube.js public search integration', () => {
  it('parses real provider-shaped responses, follows continuations, and caches without a user key', async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL, options?: RequestInit) => {
      const request = new Request(input, options)
      expect(new URL(request.url).hostname).toBe('www.youtube.com')
      expect(new URL(request.url).pathname).toBe('/youtubei/v1/search')
      expect(request.headers.get('Authorization')).toBeNull()
      const body = await request.json()
      expect(body.context.user.enableSafetyMode).toBe(true)
      if (!body.continuation) expect(body.query).toBe('jazz')
      else expect(body.continuation).toBe('fixture-next-page')
      return new Response(JSON.stringify(providerResponse(Boolean(body.continuation))), {
        headers: { 'Content-Type': 'application/json' },
      })
    })
    let clock = 1000
    const middleware = createYouTubeSearchApi({ fetcher, now: () => clock })
    const first = await call(middleware, '/api/youtube/search?q=jazz')
    expect(first.status).toBe(200)
    expect(first.body.items).toEqual([
      {
        id: 'jfKfPfyJRdk',
        title: 'Jazz & chill',
        channel: 'Music channel',
        thumbnail: 'https://i.ytimg.com/vi/jfKfPfyJRdk/hqdefault.jpg',
        duration: 2880,
      },
    ])
    expect(first.body.nextPageToken).toMatch(/^public-/)
    expect(await call(middleware, '/api/youtube/search?q=jazz')).toEqual(first)
    expect(fetcher).toHaveBeenCalledTimes(1)
    const second = await call(
      middleware,
      `/api/youtube/search?q=jazz&pageToken=${first.body.nextPageToken}`,
    )
    expect(second.status).toBe(200)
    expect(second.body.items[0].id).toBe('4xDzrJKXOOY')
    expect(second.body.nextPageToken).toBeUndefined()
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(
      (await call(middleware, `/api/youtube/search?q=other&pageToken=${first.body.nextPageToken}`))
        .status,
    ).toBe(410)
    clock += 15 * 60 * 1000 + 1
    expect(
      (await call(middleware, `/api/youtube/search?q=jazz&pageToken=${first.body.nextPageToken}`))
        .status,
    ).toBe(410)
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('rejects invalid input and expired or invented continuation tokens without provider calls', async () => {
    const fetcher = vi.fn()
    const middleware = createYouTubeSearchApi({ fetcher })
    expect((await call(middleware, '/api/youtube/search?q=x')).status).toBe(400)
    expect(
      (await call(middleware, '/api/youtube/search?q=jazz&pageToken=public-unknown')).status,
    ).toBe(410)
    expect((await call(middleware, '/api/youtube/audio?id=jfKfPfyJRdk')).status).toBe(404)
    expect(fetcher).not.toHaveBeenCalled()
  })
})
