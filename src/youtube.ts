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
      : valid(/^\/(?:shorts|live)\/([^/]+)\/?$/.exec(url.pathname)?.[1] || null)
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
