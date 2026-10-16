import type { Track } from './catalog'

export const isPlayable = (track?: Track): boolean =>
  !!track &&
  !!track.audio &&
  (!!track.localAudio || (track.source !== 'youtube' && track.source !== 'yandex'))

// Canonical URLs stay in saved metadata. A running server proxies only Archive resources.
export function archiveResource(value: string): string {
  if (
    typeof location === 'undefined' ||
    typeof document === 'undefined' ||
    !['http:', 'https:'].includes(location.protocol) ||
    document.documentElement.dataset.portable === 'true'
  )
    return value
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.hostname !== 'archive.org') return value
    if (url.pathname === '/advancedsearch.php') return `/api/archive/search${url.search}`
    const metadata = /^\/metadata\/([A-Za-z0-9_.-]+)$/.exec(url.pathname)
    if (metadata) return `/api/archive/metadata/${metadata[1]}`
    const cover = /^\/services\/img\/([A-Za-z0-9_.-]+)$/.exec(url.pathname)
    if (cover) return `/api/archive/artwork/${cover[1]}`
    const audio = /^\/download\/([^/]+)\/(.+)$/.exec(url.pathname)
    if (audio)
      return `/api/archive/audio?${new URLSearchParams({ release: decodeURIComponent(audio[1]), file: decodeURIComponent(audio[2]) })}`
  } catch {
    /* Leave invalid source metadata to the normal playback error. */
  }
  return value
}
