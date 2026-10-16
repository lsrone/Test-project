import type { Track, Mood } from './catalog'
import type { WaveCursor } from './wave'
import { youtubeTrack, type YouTubeVideo } from './youtube'
import { artistOf } from './musicTaste'

export async function discoverPersonalWave({
  seeds,
  knownIds,
  mood,
  cursor = { page: 1, offset: 0 },
  signal,
}: {
  seeds: Track[]
  knownIds: Set<string>
  mood: Mood
  cursor?: WaveCursor
  signal: AbortSignal
}) {
  const timeout = AbortSignal.any([signal, AbortSignal.timeout(22000)])
  const next = { ...cursor, tokens: { ...(cursor.tokens || {}) } }
  const output: Track[] = [],
    seen = new Set(knownIds),
    perArtist = new Map<string, number>()
  let successes = 0,
    failures = 0
  async function get(url: string) {
    const response = await fetch(url, { signal: timeout })
    const data = await response.json()
    if (!response.ok || !Array.isArray(data.items))
      throw new Error('Рекомендации YouTube пока недоступны. Попробуй обновить волну.')
    successes++
    return data as { items: YouTubeVideo[]; nextPageToken?: string }
  }
  function append(items: YouTubeVideo[], seed: Track) {
    for (const video of items) {
      if (output.length >= 12) break
      if (!/^[A-Za-z0-9_-]{11}$/.test(video.id)) continue
      const track = youtubeTrack(video),
        artist = artistOf(track)
      if (seen.has(track.id) || (perArtist.get(artist) || 0) >= 3) continue
      if (mood !== 'all' && !track.moods.includes(mood)) track.moods = [...track.moods, mood]
      track.recommendationSeed = seed.id
      output.push(track)
      seen.add(track.id)
      perArtist.set(artist, (perArtist.get(artist) || 0) + 1)
    }
  }
  const moods: Record<Mood, string> = {
    all: 'music',
    chill: 'chill music',
    focus: 'ambient instrumental',
    energy: 'electronic phonk',
    night: 'wave night music',
  }
  for (let i = 0; i < Math.min(3, seeds.length) && output.length < 12; i++) {
    const seed = seeds[(cursor.offset + i) % seeds.length]
    if (mood === 'all')
      try {
        append((await get(`/api/youtube/related?id=${seed.youtubeId}`)).items, seed)
      } catch {
        failures++
      }
    if (output.length >= 12) break
    const query =
      `${artistOf(seed)} ${mood === 'all' && seed.tags?.length ? seed.tags[0] : moods[mood]}`.slice(
        0,
        120,
      )
    const pageToken = next.tokens[query]
    try {
      const params = new URLSearchParams({ q: query, ...(pageToken ? { pageToken } : {}) })
      const found = await get(`/api/youtube/search?${params}`)
      append(found.items, seed)
      next.tokens[query] = found.nextPageToken || ''
    } catch {
      failures++
      delete next.tokens[query]
    }
  }
  timeout.throwIfAborted()
  if (failures && !successes)
    throw new Error('Новые рекомендации не загрузились. Проверь доступ к YouTube и обнови волну.')
  next.offset = cursor.offset + 1
  return {
    tracks: output,
    cursor: next,
    hasMore: output.length > 0 || Object.values(next.tokens).some(Boolean),
  }
}
