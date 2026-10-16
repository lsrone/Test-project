import { describe, expect, it } from 'vitest'
import { tracks } from './catalog'
import { recommend, searchTracks } from './recommendations'
import { type Track } from './catalog'
const audioTrack = ({
  id,
  title,
  channel,
}: {
  id: string
  title: string
  channel: string
}): Track => ({
  ...tracks[0],
  id: `archive:test:${id}.mp3`,
  title,
  artist: channel,
  source: 'archive',
  genre: 'Независимая музыка',
  tags: [],
  audio: `https://archive.org/download/test/${id}.mp3`,
})
import { preferenceWeights } from './musicTaste'

describe('personal recommendations', () => {
  it('uses chosen search results, related discoveries and skips instead of treating every cached audio result as a taste signal', () => {
    const seed = audioTrack({
      id: 'seed0000001',
      title: 'Artist - Night wave',
      channel: 'Artist - Topic',
    })
    const sameArtist = audioTrack({
      id: 'same0000001',
      title: 'Artist - New wave',
      channel: 'Artist',
    })
    const related = {
      ...audioTrack({ id: 'more0000001', title: 'New artist - Evening', channel: 'New artist' }),
      recommendationSeed: seed.id,
    }
    const unrelated = audioTrack({ id: 'else0000001', title: 'Unrelated', channel: 'Someone' })
    const catalog = [unrelated, seed, sameArtist, related]
    const choices = [{ trackId: seed.id, query: 'night wave', count: 1 }]
    const options = {
      choices,
      listening: { [sameArtist.id]: { seconds: 8, plays: 0, completions: 0, skips: 4 } },
    }
    const result = recommend(catalog, [], [seed.id], 'all', options)
    expect(result[0].id).toBe(related.id)
    expect(result.findIndex((t) => t.id === unrelated.id)).toBeLessThan(
      result.findIndex((t) => t.id === sameArtist.id),
    )
    expect(preferenceWeights(catalog, [], [], { choices }).get(seed.id)).toBeGreaterThan(0)
    expect(preferenceWeights(catalog, [], [], { choices }).get(unrelated.id)).toBe(0)
    expect(recommend([{ ...seed, source: 'youtube', audio: '' }], [seed.id], [])).toEqual([])
    expect(new Set(result.map((t) => t.id)).size).toBe(catalog.length)
  })
  it('learns from likes and prioritizes an unheard track in the preferred genre', () => {
    const ranked = recommend(tracks, ['neon-dreams'], ['neon-dreams'])
    expect(ranked[0].id).toBe('blue-hour')
    expect(ranked.findIndex((t) => t.id === 'blue-hour')).toBeLessThan(
      ranked.findIndex((t) => t.id === 'neon-dreams'),
    )
    expect(new Set(ranked.map((t) => t.id)).size).toBe(tracks.length)
  })
  it('respects the selected mood while retaining the personalized ranking', () => {
    const ranked = recommend(tracks, ['slow-motion'], [], 'focus')
    expect(ranked[0].id).toBe('slow-motion')
    expect(ranked.length).toBe(4)
    expect(ranked.every((t) => t.moods.includes('focus'))).toBe(true)
  })
  it('can rank a new catalog without stored listening data', () => {
    expect(recommend([], [], [])).toEqual([])
    expect(recommend(tracks, ['deleted-track'], ['deleted-track'])).toHaveLength(tracks.length)
  })
  it('personalizes 128 tracks without duplicates and filters the full collection by mood', () => {
    const catalog = Array.from({ length: 128 }, (_, index) => ({
      ...tracks[index % tracks.length],
      id: `scale-${index}`,
      title: `Scale track ${index}`,
    }))
    const recent = ['scale-1', 'scale-7']
    const ranked = recommend(catalog, ['scale-1'], recent)
    expect(ranked).toHaveLength(128)
    expect(new Set(ranked.map((track) => track.id)).size).toBe(128)
    expect(ranked[0].genre).toBe('Эмбиент')
    expect(recent).not.toContain(ranked[0].id)
    const focused = recommend(catalog, ['scale-1'], recent, 'focus')
    expect(focused).toHaveLength(64)
    expect(focused.every((track) => track.moods.includes('focus'))).toBe(true)
  })
})

describe('catalog search', () => {
  it('matches a title and artist together, regardless of case or whitespace', () => {
    expect(searchTracks(tracks, '  BLUE   polar ')).toEqual([tracks[0]])
  })
  it('finds Cyrillic genres and returns an empty result for a missing track', () => {
    expect(searchTracks(tracks, 'ЭМБИЕНТ').map((t) => t.id)).toEqual(['weightless', 'somewhere'])
    expect(searchTracks(tracks, 'несуществующий трек')).toEqual([])
  })
  it('finds music by the mood shown in the application', () => {
    expect(searchTracks(tracks, 'Зарядиться').map((t) => t.id)).toEqual(['neon-dreams', 'momentum'])
  })
})
