import { describe, expect, it } from 'vitest'
import { tracks } from './catalog'
import { recommend, searchTracks } from './recommendations'

describe('personal recommendations', () => {
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
