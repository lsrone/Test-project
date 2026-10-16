import type { Track, Mood } from './catalog'

export interface SearchChoice {
  trackId: string
  query: string
  count: number
}
export interface ListeningStat {
  seconds: number
  plays: number
  completions: number
  skips: number
}
export interface TasteOptions {
  choices?: SearchChoice[]
  listening?: Record<string, ListeningStat>
  playlistIds?: string[]
}
export const identity = (value: string) =>
  value
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/\s*[-–—]?\s*(topic|vevo|official)\b/gi, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
export function artistOf(track: Track) {
  const prefix = track.title.split(/\s[-–—]\s/)[0]
  return identity(
    track.source === 'youtube' && prefix !== track.title && prefix.length < 50
      ? prefix
      : track.artist,
  )
}
const styles: [RegExp, string, Mood[]][] = [
  [/lo[ -]?fi|лоу.?фай/i, 'Лоу-фай', ['chill', 'focus']],
  [/ambient|эмбиент/i, 'Эмбиент', ['chill', 'focus', 'night']],
  [/phonk|фонк/i, 'Фонк', ['energy', 'night']],
  [/\bwave\b|dream.?pop/i, 'Вейв', ['chill', 'night']],
  [/jazz|джаз/i, 'Джаз', ['chill', 'focus']],
  [/house|хаус/i, 'Хаус', ['energy']],
  [/chill|relax|спокой/i, 'Чилл', ['chill', 'night']],
  [/rock|рок/i, 'Рок', ['energy']],
  [/hip.?hop|\brap\b|рэп/i, 'Хип-хоп', ['energy']],
  [/electro|электро/i, 'Электроника', ['energy', 'night']],
]
export function musicalTags(text: string) {
  const found = styles.filter(([pattern]) => pattern.test(text))
  return {
    tags: found.map(([, tag]) => tag),
    moods: [...new Set(found.flatMap(([, , moods]) => moods))],
  }
}
export function preferenceTags(track: Track, options: TasteOptions = {}) {
  const query = options.choices?.find((choice) => choice.trackId === track.id)?.query || ''
  return [
    ...new Set([
      ...(track.tags || []),
      ...musicalTags(`${track.genre} ${track.title} ${track.artist} ${query}`).tags,
    ]),
  ]
}
export function preferenceWeights(
  catalog: Track[],
  liked: string[],
  history: string[],
  options: TasteOptions = {},
) {
  const weights = new Map<string, number>()
  const add = (id: string, score: number) => weights.set(id, (weights.get(id) || 0) + score)
  liked.forEach((id) => add(id, 8))
  options.playlistIds?.forEach((id) => add(id, 3))
  options.choices?.forEach((choice, index) =>
    add(choice.trackId, (3 + Math.log2(1 + choice.count)) / (1 + index * 0.12)),
  )
  history.slice(0, 30).forEach((id, index) => add(id, 1.5 / (1 + index * 0.15)))
  for (const [id, stat] of Object.entries(options.listening || {}))
    add(id, Math.log2(1 + stat.plays) + stat.completions * 2 - Math.min(stat.skips, 5) * 3)
  return new Map(catalog.map((track) => [track.id, weights.get(track.id) || 0]))
}
