import { preferenceWeights, preferenceTags, type TasteOptions } from './musicTaste'
import type { Mood, Track } from './catalog'
import { CATALOG_PAGE_SIZE, findReleases, loadRelease } from './openCatalog'

export interface WaveCursor {
  page: number
  offset: number
  tokens?: Record<string, string>
}
interface WaveOptions {
  tracks: Track[]
  liked: string[]
  history: string[]
  mood: Mood
  preferences?: TasteOptions
}

export function waveQuery({ tracks, liked, history, mood, preferences }: WaveOptions): string {
  const moods: Record<Mood, string> = {
    all: '',
    chill: 'chill',
    focus: 'ambient',
    energy: 'electronic',
    night: 'downtempo',
  }
  if (mood !== 'all') return moods[mood]
  const genres: Record<string, string> = {
    Электроника: 'electronic',
    Эмбиент: 'ambient',
    Джаз: 'jazz',
    Классика: 'classical',
    Хаус: 'house',
    Рок: 'rock',
    'Лоу-фай': 'lofi',
    'Дрим-поп': 'dream pop',
    Вейв: 'downtempo',
    Чилл: 'chill',
    Фонк: 'electronic',
  }
  const scores = new Map<string, number>()
  const weights = preferenceWeights(tracks, liked, history, preferences)
  for (const track of tracks) {
    const weight = weights.get(track.id) || 0
    if (weight <= 0) continue
    const tags = [track.genre, ...preferenceTags(track, preferences)]
    for (const tag of new Set(tags)) {
      const query = genres[tag]
      if (query) scores.set(query, (scores.get(query) || 0) + weight)
    }
  }
  return [...scores].sort((a, b) => b[1] - a[1])[0]?.[0] || ''
}

/** Discover full tracks automatically, continuing through releases on later calls.
 * Known IDs are excluded, and a release contributes at most two tracks per batch. */
export async function discoverWave({
  query,
  mood,
  knownIds,
  cursor = { page: 1, offset: 0 },
  signal,
}: {
  query: string
  mood: Mood
  knownIds: Set<string>
  cursor?: WaveCursor
  signal: AbortSignal
}): Promise<{ tracks: Track[]; cursor: WaveCursor; hasMore: boolean }> {
  const requestSignal = AbortSignal.any([signal, AbortSignal.timeout(22000)])
  const next = { ...cursor }
  const found: Track[] = []
  const seen = new Set(knownIds)
  let scanned = 0
  let readable = 0
  let failed = 0
  let hasMore = true
  let result = await findReleases(query, next.page, requestSignal)
  while (found.length < 12 && scanned < 12 && hasMore) {
    requestSignal.throwIfAborted()
    const releases = result.releases.slice(next.offset, next.offset + 3)
    if (!releases.length) {
      if (!result.releases.length) {
        hasMore = false
        break
      }
      if (next.page * CATALOG_PAGE_SIZE >= result.total) {
        hasMore = false
        break
      }
      next.page++
      next.offset = 0
      result = await findReleases(query, next.page, requestSignal)
      continue
    }
    const albums = await Promise.allSettled(
      releases.map((release) => loadRelease(release, requestSignal)),
    )
    requestSignal.throwIfAborted()
    for (const album of albums) {
      if (album.status === 'rejected') {
        failed++
        continue
      }
      readable++
      const fresh = album.value
        .filter((track) => !seen.has(track.id) && (mood === 'all' || track.moods.includes(mood)))
        .slice(0, Math.min(2, 12 - found.length))
      for (const track of fresh) {
        seen.add(track.id)
        found.push(track)
      }
    }
    scanned += releases.length
    next.offset += releases.length
    hasMore = next.offset < result.releases.length || next.page * CATALOG_PAGE_SIZE < result.total
  }
  if (failed && !readable)
    throw new Error('Не удалось загрузить релизы для волны. Попробуй ещё раз.')
  return { tracks: found, cursor: next, hasMore }
}
