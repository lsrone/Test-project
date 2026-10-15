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
