import { describe, expect, it } from 'vitest'
import {
  youtubeTrack,
  parseYouTubeId,
  trackSearchQuery,
  linkImportedTrack,
  youtubeLink,
  youtubeVideoId,
  matchYouTubeRecording,
} from './youtube'
import { isPlayable } from './audioSource'
import { parseLibraryFile, prepareLibraryImport } from './libraryImport'
describe('YouTube metadata and Yandex linking', () => {
  it('accepts actual YouTube addresses and rejects lookalike hosts and credentials', () => {
    expect(parseYouTubeId('https://music.youtube.com/watch?v=jfKfPfyJRdk')).toBe('jfKfPfyJRdk')
    expect(parseYouTubeId('https://youtu.be/jfKfPfyJRdk')).toBe('jfKfPfyJRdk')
    expect(parseYouTubeId('https://www.youtube.com/embed/jfKfPfyJRdk')).toBe('jfKfPfyJRdk')
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
    expect(isPlayable(record)).toBe(true)
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
    expect(isPlayable(reimport.onlineTracks[0])).toBe(true)
  })
  it('resolves only the requested artist and version; refuses covers, remixes and ambiguous titles', () => {
    const song = { artist: 'Northern Lights', title: 'Signal' }
    const remix = {
      id: 'remix000001',
      title: 'Northern Lights - Signal (Remix)',
      channel: 'Northern Lights',
    }
    const wrong = { id: 'wrong000001', title: 'Signal', channel: 'Someone Else' }
    const correct = {
      id: 'exact000001',
      title: 'Northern Lights — Signal (Official Audio)',
      channel: 'Northern Lights - Topic',
    }
    expect(matchYouTubeRecording(song, [remix, wrong, correct])).toEqual(correct)
    expect(matchYouTubeRecording(song, [remix, wrong])).toBeNull()
    expect(
      matchYouTubeRecording({ artist: 'A+B', title: 'Song' }, [
        { id: 'exact000001', title: 'A+B - Song', channel: 'A+B' },
      ]),
    ).not.toBeNull()
    const local = {
      ...youtubeTrack(correct),
      localAudio: { name: 'own.mp3', originalDuration: 0 },
      audio: 'local:one',
    }
    expect(youtubeVideoId(local)).toBeNull()
    expect(isPlayable(local)).toBe(true)
  })
})
