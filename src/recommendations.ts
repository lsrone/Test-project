import { isPlayable } from './audioSource'
import { moods, type Mood, type Track } from './catalog'
import { artistOf, preferenceWeights, preferenceTags, type TasteOptions } from './musicTaste'

/** An explainable local ranking: likes teach genre affinity, plays add a lighter signal.
 * Recent tracks lose priority so the next discovery is actually something different. */
export function recommend(
  catalog: Track[],
  liked: string[],
  history: string[],
  mood: Mood = 'all',
  options: TasteOptions = {},
): Track[] {
  const weights = preferenceWeights(catalog, liked, history, options)
  const genres = new Map<string, number>(),
    artists = new Map<string, number>(),
    tags = new Map<string, number>()
  for (const track of catalog) {
    const weight = weights.get(track.id) || 0
    if (!weight) continue
    const artist = artistOf(track)
    artists.set(artist, (artists.get(artist) || 0) + weight)
    if (!['YouTube', 'Из Яндекс Музыки'].includes(track.genre))
      genres.set(track.genre, (genres.get(track.genre) || 0) + weight)
    for (const tag of preferenceTags(track, options)) tags.set(tag, (tags.get(tag) || 0) + weight)
  }
  const ranked = catalog
    .filter(isPlayable)
    .filter((t) => mood === 'all' || t.moods.includes(mood))
    .map((track, i) => ({
      track,
      score:
        (genres.get(track.genre) ?? 0) +
        (artists.get(artistOf(track)) || 0) * 1.1 +
        preferenceTags(track, options).reduce((sum, tag) => sum + (tags.get(tag) || 0) * 0.45, 0) +
        (weights.get(track.recommendationSeed || '') || 0) * 0.8 +
        (liked.includes(track.id) ? 1 : 0) -
        (history.slice(0, 3).includes(track.id) ? 18 : 0) -
        Math.min(options.listening?.[track.id]?.skips || 0, 5) * 4 +
        (!history.includes(track.id) && !liked.includes(track.id) ? 1 : 0) -
        i * 0.01,
    }))
    .sort((a, b) => b.score - a.score)
    .map((item) => item.track)
  const result: Track[] = []
  while (ranked.length) {
    const last = result.length ? artistOf(result[result.length - 1]) : ''
    const candidate = ranked.slice(0, 12).findIndex((track) => artistOf(track) !== last)
    result.push(...ranked.splice(candidate >= 0 ? candidate : 0, 1))
  }
  return result
}

export function searchTracks(catalog: Track[], query: string): Track[] {
  const words = query.trim().toLocaleLowerCase('ru').split(/\s+/).filter(Boolean)
  return catalog.filter((track) => {
    const moodNames = moods
      .filter((mood) => track.moods.includes(mood.id))
      .map((mood) => mood.title)
      .join(' ')
    return words.every((word) =>
      `${track.title} ${track.artist} ${track.genre} ${moodNames}`
        .toLocaleLowerCase('ru')
        .includes(word),
    )
  })
}
