import type { Track } from './catalog'
import { musicalTags } from './musicTaste'
export interface YouTubeVideo {
  id: string
  title: string
  channel: string
  duration?: number
}
export function parseYouTubeId(value: string): string | null {
  const valid = (id: string | null) => (id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null)
  if (valid(value)) return value
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return null
    if (url.hostname === 'youtu.be') return valid(url.pathname.slice(1))
    if (
      !['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com'].includes(
        url.hostname,
      )
    )
      return null
    return url.pathname === '/watch'
      ? valid(url.searchParams.get('v'))
      : valid(/^\/(?:shorts|live|embed)\/([^/]+)\/?$/.exec(url.pathname)?.[1] || null)
  } catch {
    return null
  }
}
export const youtubeUrl = (id: string) =>
  `https://www.youtube.com/watch?v=${encodeURIComponent(id)}`
export function youtubeLink(track: Track): string | null {
  const id =
    parseYouTubeId(track.youtubeId || '') ||
    (track.source === 'youtube'
      ? parseYouTubeId(track.id.replace(/^youtube:/, '')) || parseYouTubeId(track.sourceUrl || '')
      : null)
  return id ? youtubeUrl(id) : null
}
export function youtubeVideoId(track?: Track): string | null {
  if (!track || track.localAudio) return null
  const link = youtubeLink(track)
  return link ? parseYouTubeId(link) : null
}

export function youtubePlaybackError(code: number): string {
  if (code === 101 || code === 150)
    return 'Автор запретил встраивание этой записи. Выбери другую запись кнопкой «Другая запись».'
  if (code === 100) return 'Эта запись удалена или закрыта. Можно подобрать другую запись.'
  if (code === 153)
    return 'YouTube не подтвердил источник плеера. Повтори запуск в приложении Volna.'
  if (code === 2) return 'Некорректная ссылка YouTube. Выбери другую запись.'
  return 'YouTube не смог запустить запись. Проверь подключение или выбери другую запись.'
}

// Resolve only a close artist/title match. A remix or a different performer
// must never silently replace an imported song.
export function matchYouTubeRecording(
  track: Pick<Track, 'artist' | 'title'>,
  videos: YouTubeVideo[],
) {
  const normalize = (text: string) =>
    text
      .normalize('NFKC')
      .toLocaleLowerCase()
      .replace(/ё/g, 'е')
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim()
  const artist = normalize(track.artist.replace(/\s*[-–—]\s*(?:Topic|тема)$/i, ''))
  const title = normalize(track.title)
  if (!artist || !title) return null
  const versions =
    /\b(remix|cover|live|slowed|sped|nightcore|instrumental|karaoke|rework)\b|ремикс|кавер|концерт|минус/iu
  const candidates = videos.filter((video) => {
    if (!parseYouTubeId(video.id)) return false
    if (!versions.test(track.title) && versions.test(video.title)) return false
    let name = video.title
      .replace(
        /\((?:official\s*)?(?:audio|music\s*video|video|lyric(?:s|\s*video)?)(?:\s*\d{4})?\)/gi,
        '',
      )
      .replace(/\[(?:official\s*)?(?:audio|music\s*video|video|lyrics?)\]/gi, '')
    const prefix = new RegExp(
      '^' + track.artist.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*[-–—:]\\s*',
      'i',
    )
    const hasPrefix = prefix.test(name)
    if (hasPrefix) name = name.replace(prefix, '')
    const channel = normalize(video.channel.replace(/\s*[-–—]\s*(?:Topic|тема)$/i, ''))
    return normalize(name) === title && (channel === artist || hasPrefix)
  })
  return candidates[0] || null
}
export function trackSearchQuery(track: Pick<Track, 'title' | 'artist'>): string {
  const artist = track.artist.replace(/\s*[-–—]\s*(?:Topic|тема)$/i, '').trim()
  const prefix = track.title.split(/\s*[-–—:]\s+/)[0]
  const title =
    prefix.toLocaleLowerCase() === artist.toLocaleLowerCase()
      ? track.title.slice(prefix.length).replace(/^\s*[-–—:]\s*/, '')
      : track.title
  return `${artist} ${title}`.replace(/\s+/g, ' ').trim().slice(0, 120)
}
export function youtubeTrack(video: YouTubeVideo): Track {
  if (!parseYouTubeId(video.id)) throw Error('Некорректный ID YouTube')
  const taste = musicalTags(`${video.title} ${video.channel}`)
  return {
    id: `youtube:${video.id}`,
    youtubeId: video.id,
    source: 'youtube',
    title: video.title,
    artist: video.channel,
    genre: 'YouTube',
    cover: 'blue',
    artwork: 'blue',
    color: '#5485ff',
    audio: '',
    duration: Math.max(0, Number(video.duration) || 0),
    moods: taste.moods,
    tags: taste.tags,
    sourceUrl: youtubeUrl(video.id),
    artworkUrl: `https://i.ytimg.com/vi/${video.id}/hqdefault.jpg`,
    downloadAllowed: false,
  }
}
export const youtubeSearchUrl = (query: string) =>
  `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`
export function linkImportedTrack(previous: Track[], targetId: string, video: Track) {
  if (!youtubeLink(video)) throw Error('Некорректная запись YouTube')
  return previous.map((track) =>
    track.id === targetId
      ? {
          ...track,
          youtubeId: parseYouTubeId(youtubeLink(video)!)!,
          tags: [...new Set([...(track.tags || []), ...(video.tags || [])])],
        }
      : track,
  )
}
