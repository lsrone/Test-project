import { initialPlaylists, type Track, type Playlist } from './catalog'

export function migrateNewestFirst(storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>) {
  const marker = 'volna.library-order-v2'
  try {
    const store = storage || localStorage
    if (store.getItem(marker) === 'newest-first') return
    const keys = ['volna.liked', 'volna.online-tracks', 'volna.playlists']
    const before = keys.map((key) => store.getItem(key))
    const values = before.map((value) => (value ? JSON.parse(value) : null))
    if (values.some((value) => value !== null && !Array.isArray(value))) return
    const after = values.map((value, index) => {
      if (!value) return null
      if (index !== 2) return JSON.stringify([...value].reverse())
      return JSON.stringify(
        value.map((playlist: Playlist) => {
          const original = initialPlaylists.find((item) => item.id === playlist.id)?.tracks || []
          const ids = Array.isArray(playlist.tracks) ? playlist.tracks : []
          return {
            ...playlist,
            tracks: [...ids.filter((id: string) => !original.includes(id))]
              .reverse()
              .concat(ids.filter((id: string) => original.includes(id))),
          }
        }),
      )
    })
    try {
      after.forEach((value, index) => {
        if (value !== null) store.setItem(keys[index], value)
      })
      store.setItem(marker, 'newest-first')
    } catch {
      before.forEach((value, index) => {
        try {
          if (value === null) store.removeItem(keys[index])
          else store.setItem(keys[index], value)
        } catch {
          /* Keep readable data if storage is unavailable. */
        }
      })
    }
  } catch {
    /* Blocked storage must not prevent starting the player. */
  }
}

export function prependNewTracks(previous: Track[], incoming: Track[]): Track[] {
  const updates = new Map(incoming.map((track) => [track.id, track]))
  const known = new Set(previous.map((track) => track.id))
  return [...updates.values()]
    .filter((track) => !known.has(track.id))
    .concat(
      previous.map((track) => {
        const update = updates.get(track.id)
        if (!update) return track
        // Refreshing remote metadata must not detach the user's local audio file.
        return track.localAudio && !update.localAudio
          ? {
              ...update,
              localAudio: track.localAudio,
              audio: track.audio,
              duration: track.duration,
            }
          : update
      }),
    )
}
