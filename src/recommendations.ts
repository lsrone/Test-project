import { moods, type Mood, type Track } from './catalog'

/** An explainable local ranking: likes teach genre affinity, plays add a lighter signal.
 * Recent tracks lose priority so the next discovery is actually something different. */
export function recommend(
  catalog: Track[],
  liked: string[],
  history: string[],
  mood: Mood = 'all',
): Track[] {
  const affinity = new Map<string, number>()
  for (const id of liked) {
    const track = catalog.find((t) => t.id === id)
    if (track) affinity.set(track.genre, (affinity.get(track.genre) ?? 0) + 4)
  }
  for (const id of history.slice(0, 20)) {
    const track = catalog.find((t) => t.id === id)
    if (track) affinity.set(track.genre, (affinity.get(track.genre) ?? 0) + 0.5)
  }
  return catalog
    .filter((t) => mood === 'all' || t.moods.includes(mood))
    .map((track, i) => ({
      track,
      score:
        (affinity.get(track.genre) ?? 0) +
        (liked.includes(track.id) ? 1 : 0) -
        (history.slice(0, 3).includes(track.id) ? 3 : 0) -
        i * 0.01,
    }))
    .sort((a, b) => b.score - a.score)
    .map((item) => item.track)
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
