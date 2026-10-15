export interface YouTubeVideo {
  id: string
  title: string
  channel: string
  thumbnail?: string
}

export const isPortable = () =>
  location.protocol === 'file:' || document.documentElement.dataset.portable === 'true'

export function parseYouTubeId(value: string): string | null {
  const text = value.trim()
  const valid = (id: string | null) => (id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null)
  if (valid(text)) return text
  try {
    const url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`)
    if (!['https:', 'http:'].includes(url.protocol)) return null
    if (url.hostname === 'youtu.be') return valid(url.pathname.slice(1))
    if (
      ![
        'youtube.com',
        'www.youtube.com',
        'm.youtube.com',
        'music.youtube.com',
        'www.youtube-nocookie.com',
      ].includes(url.hostname)
    )
      return null
    if (url.pathname === '/watch') return valid(url.searchParams.get('v'))
    const match = /^\/(?:embed|shorts|live)\/([^/]+)\/?$/.exec(url.pathname)
    return match ? valid(match[1]) : null
  } catch {
    return null
  }
}

export const youtubeUrl = (id: string) =>
  `https://www.youtube.com/watch?v=${encodeURIComponent(id)}`
import type { Track } from './catalog'

export function youtubeTrack(video: YouTubeVideo): Track {
  if (!/^[A-Za-z0-9_-]{11}$/.test(video.id)) throw new Error('Некорректная ссылка YouTube')
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
    duration: 0,
    moods: [],
    sourceUrl: youtubeUrl(video.id),
    artworkUrl: `https://i.ytimg.com/vi/${video.id}/hqdefault.jpg`,
    downloadAllowed: false,
  }
}

export function youtubePlaybackError(code: number): string {
  if (code === 101 || code === 150)
    return 'Автор запретил воспроизведение этой записи в приложениях. Выбери другую запись или открой её на YouTube.'
  if (code === 100) return 'Видео удалено, закрыто или недоступно. Выбери другую запись.'
  if (code === 153)
    return 'YouTube не подтвердил источник плеера. Открой запись на YouTube или выбери другую.'
  if (code === 2) return 'Некорректная ссылка на видео. Выбери другую запись.'
  return 'YouTube не смог воспроизвести запись. Проверь подключение или выбери другую запись.'
}
