import { useCallback, useEffect, useRef, useState } from 'react'
import type { Mood, Track } from './catalog'
import { discoverWave, waveQuery, type WaveCursor } from './wave'
import { useStoredState } from './storage'

export function useWave(options: {
  enabled: boolean
  tracks: Track[]
  liked: string[]
  history: string[]
  mood: Mood
  onImport: (tracks: Track[]) => void
}) {
  const snapshot = useRef(options)
  snapshot.current = options
  const active = useRef<{ controller: AbortController; mood: Mood } | null>(null)
  const [storedCursors, setStoredCursors] = useStoredState<Record<string, WaveCursor>>(
    'volna.wave-cursors',
    {},
  )
  const cursors = useRef(new Map<string, WaveCursor>(Object.entries(storedCursors)))
  const [batch, setBatch] = useState<{ ids: string[]; mood: Mood }>({ ids: [], mood: 'all' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [hasMore, setHasMore] = useState(true)
  const [loadedMood, setLoadedMood] = useState<Mood | null>(null)

  const refresh = useCallback(async () => {
    const current = snapshot.current
    if (active.current?.mood === current.mood && !active.current.controller.signal.aborted) return
    active.current?.controller.abort()
    const controller = new AbortController()
    active.current = { controller, mood: current.mood }
    setLoading(true)
    setError('')
    const query = waveQuery(current)
    const key = `${current.mood}:${query}`
    try {
      if (!navigator.onLine) throw new Error('Нет интернета. В волне остаются треки на устройстве.')
      const result = await discoverWave({
        query,
        mood: current.mood,
        knownIds: new Set(current.tracks.map((track) => track.id)),
        cursor: cursors.current.get(key),
        signal: controller.signal,
      })
      if (controller.signal.aborted) return
      cursors.current.set(key, result.cursor)
      setStoredCursors((previous) => ({ ...previous, [key]: result.cursor }))
      current.onImport(result.tracks)
      setBatch({ ids: result.tracks.map((track) => track.id), mood: current.mood })
      setHasMore(result.hasMore)
      setLoadedMood(current.mood)
    } catch (cause) {
      if (!controller.signal.aborted) {
        setLoadedMood(current.mood)
        setError(
          cause instanceof Error && cause.name === 'Error'
            ? cause.message
            : 'Новые треки не загрузились. Проверь интернет и доступ к archive.org, затем нажми «Обновить волну».',
        )
      }
    } finally {
      if (active.current?.controller === controller) {
        active.current = null
        setLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    if (options.enabled) void refresh()
  }, [options.enabled, options.mood, refresh])
  useEffect(() => () => active.current?.controller.abort(), [])

  return { batch, loading, error, hasMore, loadedMood, refresh }
}
