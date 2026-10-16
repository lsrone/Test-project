import { it, expect } from 'vitest'
import { prependNewTracks, migrateNewestFirst } from './library'
import { tracks } from './catalog'
it('puts genuinely new additions first, updates metadata and keeps existing order on replay', () => {
  const previous = [tracks[0], tracks[1]],
    updated = { ...tracks[0], title: 'Updated' }
  expect(prependNewTracks(previous, [tracks[2], updated]).map((t) => t.id)).toEqual([
    tracks[2].id,
    tracks[0].id,
    tracks[1].id,
  ])
  expect(prependNewTracks(previous, [updated])[0].title).toBe('Updated')
  expect(prependNewTracks(previous, [tracks[1]]).map((t) => t.id)).toEqual(
    previous.map((t) => t.id),
  )
})
it('migrates an existing append-ordered library once without losing favourites or playlist membership', () => {
  const values = new Map([
    ['volna.liked', '["older","newer"]'],
    ['volna.online-tracks', '[{"id":"older"},{"id":"newer"}]'],
    ['volna.playlists', '[{"id":"custom","tracks":["older","newer"]}]'],
  ])
  const storage = {
    getItem: (key: string) => values.get(key) || null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  }
  migrateNewestFirst(storage)
  expect(JSON.parse(values.get('volna.liked')!)).toEqual(['newer', 'older'])
  expect(JSON.parse(values.get('volna.playlists')!)[0].tracks).toEqual(['newer', 'older'])
  migrateNewestFirst(storage)
  expect(JSON.parse(values.get('volna.liked')!)).toEqual(['newer', 'older'])
})
it('keeps a user audio attachment when the same YouTube metadata is fetched again', () => {
  const local = {
    ...tracks[0],
    id: 'youtube:jfKfPfyJRdk',
    source: 'youtube' as const,
    audio: 'local:youtube:jfKfPfyJRdk',
    localAudio: { name: 'mine.mp3', originalDuration: 180 },
  }
  const incoming = {
    ...local,
    audio: '',
    localAudio: undefined,
    duration: 180,
    title: 'Refreshed metadata',
  }
  const result = prependNewTracks([local], [incoming])[0]
  expect(result).toMatchObject({
    audio: local.audio,
    duration: 48,
    localAudio: local.localAudio,
    title: 'Refreshed metadata',
  })
})
