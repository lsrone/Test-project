import { afterEach, describe, expect, it, vi } from 'vitest'
import { tracks } from './catalog'
import { discoverWave, waveQuery } from './wave'

afterEach(() => vi.unstubAllGlobals())

function provider(failMetadata = false) {
  const fetcher = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input))
    if (url.pathname === '/advancedsearch.php') {
      const page = Number(url.searchParams.get('page'))
      return new Response(
        JSON.stringify({
          response: {
            numFound: 48,
            docs: Array.from({ length: 24 }, (_, n) => ({
              identifier: `wave-${page}-${n}`,
              title: `Album ${page}-${n}`,
            })),
          },
        }),
      )
    }
    if (failMetadata) return new Response('{}', { status: 503 })
    return new Response(
      JSON.stringify({
        metadata: { creator: url.pathname.split('/').pop(), subject: 'ambient' },
        files: Array.from({ length: 4 }, (_, n) => ({
          name: `track-${n}.mp3`,
          title: `Track ${n}`,
          length: '3:42',
        })),
      }),
    )
  })
  vi.stubGlobal('fetch', fetcher)
  return fetcher
}
const options = () => ({
  query: '',
  mood: 'all' as const,
  knownIds: new Set<string>(),
  signal: new AbortController().signal,
})

describe('wave discovery', () => {
  it('uses selected mood or learned genre instead of a fixed demo playlist', () => {
    expect(waveQuery({ tracks, liked: [], history: [], mood: 'all' })).toBe('')
    expect(waveQuery({ tracks, liked: ['somewhere'], history: ['blue-hour'], mood: 'all' })).toBe(
      'ambient',
    )
    expect(waveQuery({ tracks, liked: ['blue-hour'], history: [], mood: 'focus' })).toBe('ambient')
  })

  it('learns musical styles from the explicitly selected search query when source genre is unknown', () => {
    const track = {
      ...tracks[0],
      genre: 'Независимая музыка',
      title: 'Unknown style',
      artist: 'New Artist',
      tags: [],
    }
    expect(
      waveQuery({
        tracks: [track],
        liked: [],
        history: [],
        mood: 'all',
        preferences: { choices: [{ trackId: track.id, query: 'jazz saxophone', count: 1 }] },
      }),
    ).toBe('jazz')
    expect(
      waveQuery({
        tracks: [track],
        liked: [],
        history: [],
        mood: 'all',
        preferences: { choices: [] },
      }),
    ).toBe('')
  })

  it('discovers diverse full tracks and continues without repeated IDs', async () => {
    provider()
    const first = await discoverWave(options())
    expect(first.tracks).toHaveLength(12)
    expect(new Set(first.tracks.map((track) => track.album)).size).toBe(6)
    expect(first.tracks.every((track) => track.duration === 222)).toBe(true)
    const second = await discoverWave({
      ...options(),
      knownIds: new Set(first.tracks.map((track) => track.id)),
      cursor: first.cursor,
    })
    expect(second.tracks).toHaveLength(12)
    expect(
      second.tracks.some((track) => first.tracks.some((previous) => previous.id === track.id)),
    ).toBe(false)
    expect(second.cursor.offset).toBeGreaterThan(first.cursor.offset)
  })

  it('crosses catalogue page boundaries and keeps the batch bounded', async () => {
    const fetcher = provider()
    const result = await discoverWave({ ...options(), cursor: { page: 1, offset: 23 } })
    expect(result.tracks).toHaveLength(12)
    expect(result.tracks[0].id).toContain('wave-1-23')
    expect(result.tracks.at(-1)?.id).toContain('wave-2-')
    expect(result.cursor.page).toBe(2)
    expect(
      fetcher.mock.calls.some(([input]) => new URL(String(input)).searchParams.get('page') === '2'),
    ).toBe(true)
  })

  it('reports inaccessible releases and honors cancelled requests', async () => {
    provider(true)
    await expect(discoverWave(options())).rejects.toThrow('Не удалось загрузить релизы')
    const controller = new AbortController()
    controller.abort()
    await expect(discoverWave({ ...options(), signal: controller.signal })).rejects.toMatchObject({
      name: 'AbortError',
    })
  })
})
