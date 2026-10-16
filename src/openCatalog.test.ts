import { afterEach, describe, expect, it, vi } from 'vitest'
import { allowsDownload, findReleases, releaseTracks, type CatalogRelease } from './openCatalog'

const release: CatalogRelease = {
  id: 'test-release',
  title: 'Open Sounds',
  artist: 'Open Artist',
  cover: 'https://archive.org/services/img/test-release',
}
afterEach(() => vi.unstubAllGlobals())

describe('public music catalog', () => {
  it('queries real pagination and reports the count returned by the source', async () => {
    const fetcher = vi.fn(
      async (_input: URL | RequestInfo, _options?: RequestInit) =>
        new Response(
          JSON.stringify({
            response: {
              numFound: 340,
              docs: [
                { identifier: 'real-release', title: ['Night', 'Sessions'], creator: 'Artist' },
                { identifier: '../bad' },
              ],
            },
          }),
        ),
    )
    vi.stubGlobal('fetch', fetcher)
    const result = await findReleases('ambient', 3)
    expect(result.total).toBe(340)
    expect(result.releases.map((item) => item.id)).toEqual(['real-release'])
    const url = new URL(String(fetcher.mock.calls[0][0]))
    expect(url.hostname).toBe('archive.org')
    expect(url.searchParams.get('page')).toBe('3')
    expect(url.searchParams.get('q')).toContain('collection:netlabels')
  })
  it('imports full MP3s with attribution while excluding private and unsafe files', () => {
    const result = releaseTracks(release, {
      metadata: {
        creator: 'Artist',
        subject: ['ambient'],
        licenseurl: 'https://creativecommons.org/licenses/by/4.0/',
      },
      files: [
        { name: '01 track.mp3', title: 'A Real Song', length: '1:02:03' },
        { name: 'hidden.mp3', private: 'true' },
        { name: 'cover.jpg' },
        { name: '../private.mp3' },
      ],
    })
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      title: 'A Real Song',
      duration: 3723,
      source: 'archive',
      downloadAllowed: true,
    })
    expect(result[0].audio).toBe('https://archive.org/download/test-release/01%20track.mp3')
    expect(result[0].sourceUrl).toBe('https://archive.org/details/test-release')
  })
  it('does not treat unknown licenses or a lookalike domain as download permission', () => {
    expect(allowsDownload('https://creativecommons.org/licenses/by-nc-sa/4.0/')).toBe(true)
    expect(allowsDownload('https://creativecommons.org/publicdomain/zero/1.0/')).toBe(true)
    expect(allowsDownload('https://creativecommons.org.evil.example/licenses/by/4.0/')).toBe(false)
    expect(allowsDownload('All rights reserved')).toBe(false)
    expect(
      releaseTracks(release, { metadata: {}, files: [{ name: 'song.mp3' }] })[0].downloadAllowed,
    ).toBe(false)
    expect(() => releaseTracks(release, { is_dark: true, files: [{ name: 'song.mp3' }] })).toThrow(
      'ограничен',
    )
  })
  it('keeps one MP3 quality per recording instead of recommending the same song twice', () => {
    const result = releaseTracks(release, {
      files: [
        { name: 'song_64kb.mp3' },
        { name: 'song.mp3' },
        { name: 'other_64kb.mp3' },
        { name: 'other_128kb.mp3' },
        { name: 'only_64kb.mp3' },
      ],
    })
    expect(result.map((track) => track.id.split(':').at(-1))).toEqual([
      'song.mp3',
      'other_128kb.mp3',
      'only_64kb.mp3',
    ])
  })
})
