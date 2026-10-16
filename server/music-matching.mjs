const noise = new Set([
  'official',
  'audio',
  'video',
  'lyric',
  'lyrics',
  'music',
  'topic',
  'vevo',
  'feat',
  'ft',
  'hd',
  'hq',
  '4k',
  '8k',
  'клип',
  'видео',
  'текст',
  'песня',
])
const versions = [
  'remix',
  'cover',
  'live',
  'slowed',
  'nightcore',
  'instrumental',
  'karaoke',
  'ремикс',
  'кавер',
  'speedup',
]
const tokens = (value) =>
  String(value)
    .normalize('NFKC')
    .toLocaleLowerCase()
    .match(/[\p{L}\p{N}]+/gu)
    ?.filter((word) => word.length > 1 && !noise.has(word) && !/^(19|20)\d{2}$/.test(word)) || []
export function sameRecording(title, artist, candidate) {
  const author = new Set(tokens(artist)),
    name = new Set(tokens(title).filter((word) => !author.has(word)))
  const combined = new Set(tokens(`${candidate.title} ${candidate.channel}`))
  const candidateName = new Set(tokens(candidate.title).filter((word) => !author.has(word)))
  if (!name.size || !author.size) return false
  if (
    versions.some(
      (version) => combined.has(version) !== new Set(tokens(`${title} ${artist}`)).has(version),
    )
  )
    return false
  return (
    candidateName.size > 0 &&
    [...candidateName].filter((word) => name.has(word)).length / candidateName.size >= 0.8 &&
    [...name].filter((word) => combined.has(word)).length / name.size >= 0.8 &&
    [...author].filter((word) => combined.has(word)).length / author.size >= 0.6
  )
}
