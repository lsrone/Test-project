import { describe, expect, it } from 'vitest'
import {
  youtubeTrack,
  parseYouTubeId,
  trackSearchQuery,
  linkImportedTrack,
  youtubeLink,
} from './youtube'
import { isPlayable } from './audioSource'
import { parseLibraryFile, prepareLibraryImport } from './libraryImport'
describe('YouTube metadata and Yandex linking', () => {
  it('accepts actual YouTube addresses and rejects lookalike hosts and credentials', () => {
    expect(parseYouTubeId('https://music.youtube.com/watch?v=jfKfPfyJRdk')).toBe('jfKfPfyJRdk')
    expect(parseYouTubeId('https://youtu.be/jfKfPfyJRdk')).toBe('jfKfPfyJRdk')
    for (const url of [
      'https://youtube.com.evil.example/watch?v=jfKfPfyJRdk',
      'https://user:pass@youtube.com/watch?v=jfKfPfyJRdk',
      'javascript:alert(1)',
    ])
      expect(parseYouTubeId(url)).toBeNull()
  })
  it('builds precise search queries without a duplicated artist while preserving remix versions', () => {
    expect(
      trackSearchQuery({ artist: 'supwel', title: 'supwel - deja vu (chill, wave vibe)' }),
    ).toBe('supwel deja vu (chill, wave vibe)')
    expect(trackSearchQuery({ artist: 'ØDEN - Topic', title: 'Blink' })).toBe('ØDEN Blink')
    expect(trackSearchQuery({ artist: 'SNIZOV', title: 'ЗАВЯЗЫВАЙ (REMIX)' })).toBe(
      'SNIZOV ЗАВЯЗЫВАЙ (REMIX)',
    )
  })
  it('links a selected recording without losing imported IDs, likes, playlists, original metadata or reimport compatibility', () => {
    const file = parseLibraryFile(
      'Название;Исполнитель;id;liked;playlist\nBlink;ØDEN;123;true;Любимое',
      'export.csv',
    )
    const options = { title: 'Из Яндекса', allLiked: false, keepPlaylists: true }
    const original = prepareLibraryImport(file, options, [], [], [])
    const record = youtubeTrack({
      id: 'jfKfPfyJRdk',
      title: 'ØDEN — Blink',
      channel: 'ØDEN - Topic',
    })
    expect(isPlayable(record)).toBe(false)
    const linked = linkImportedTrack(original.onlineTracks, 'yandex:123', record)
    expect(linked[0]).toMatchObject({
      id: 'yandex:123',
      title: 'Blink',
      artist: 'ØDEN',
      source: 'yandex',
      audio: '',
      youtubeId: 'jfKfPfyJRdk',
      sourceUrl: 'https://music.yandex.ru/track/123',
    })
    const reimport = prepareLibraryImport(file, options, linked, original.playlists, original.liked)
    expect(reimport.added).toBe(0)
    expect(reimport.liked).toEqual(original.liked)
    expect(reimport.playlists).toEqual(original.playlists)
    expect(youtubeLink(reimport.onlineTracks[0])).toBe(
      'https://www.youtube.com/watch?v=jfKfPfyJRdk',
    )
  })
})
