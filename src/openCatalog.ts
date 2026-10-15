import type { Mood, Track } from './catalog'

export const CATALOG_PAGE_SIZE = 24
export interface CatalogRelease {
  id: string
  title: string
  artist: string
  year?: string
  license?: string
  cover: string
}
export interface CatalogResults {
  releases: CatalogRelease[]
  total: number
}
const text = (value: unknown): string =>
  Array.isArray(value)
    ? value.map(text).filter(Boolean).join(', ')
    : typeof value === 'string' || typeof value === 'number'
      ? String(value)
      : ''
const identifier = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.-]{0,254}$/.test(value)
export function allowsDownload(license: string): boolean {
  try {
    const url = new URL(license)
    return (
      ['http:', 'https:'].includes(url.protocol) &&
      ['creativecommons.org', 'www.creativecommons.org'].includes(url.hostname) &&
      /^\/(?:licenses\/(?:by(?:-sa|-nd|-nc|-nc-sa|-nc-nd)?)\/\d\.\d\/?|publicdomain\/(?:zero|mark)\/\d\.\d\/?)$/.test(
        url.pathname,
      )
    )
  } catch {
    return false
  }
}
const parseDuration = (value: unknown) => {
  const parts = text(value).split(':').map(Number)
  if (!parts.length || parts.length > 3 || parts.some((n) => !Number.isFinite(n) || n < 0)) return 0
  return parts.reduce((result, part) => result * 60 + part, 0)
}

async function readJson(url: URL, signal?: AbortSignal) {
  const response = await fetch(url, {
    signal: AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(18000)]),
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
  })
  if (!response.ok)
    throw new Error(
      response.status === 429
        ? 'Каталог занят. Подожди немного и повтори запрос.'
        : 'Источник не смог загрузить каталог. Попробуй ещё раз.',
    )
  return response.json()
}

/** The public Internet Archive catalog is queried on demand, without a private API key.
 * Music stays on the original host; no audio is bundled or rehosted by this adapter. */
export async function findReleases(
  query: string,
  page = 1,
  signal?: AbortSignal,
): Promise<CatalogResults> {
  const words = query
    .slice(0, 120)
    .replace(/[+\-&|!(){}\[\]^"~*?:\\/]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  const search = [
    'collection:netlabels',
    'mediatype:audio',
    'NOT access-restricted-item:true',
    ...(words.length ? [`(${words.join(' AND ')})`] : []),
  ].join(' AND ')
  const url = new URL('https://archive.org/advancedsearch.php')
  url.search = new URLSearchParams({
    q: search,
    output: 'json',
    rows: String(CATALOG_PAGE_SIZE),
    page: String(Math.max(1, Math.floor(page))),
    'sort[]': words.length ? 'downloads desc' : 'publicdate desc',
  }).toString()
  for (const field of ['identifier', 'title', 'creator', 'year', 'licenseurl'])
    url.searchParams.append('fl[]', field)
  const data = await readJson(url, signal)
  if (!Array.isArray(data.response?.docs))
    throw new Error('Источник вернул неподдерживаемый ответ.')
  return {
    total: Number(data.response.numFound) || 0,
    releases: data.response.docs
      .filter((item: { identifier?: unknown }) => identifier(item.identifier))
      .map((item: Record<string, unknown>) => ({
        id: item.identifier as string,
        title: text(item.title) || text(item.identifier),
        artist: text(item.creator) || 'Независимый релиз',
        year: text(item.year),
        license: text(item.licenseurl),
        cover: `https://archive.org/services/img/${item.identifier}`,
      })),
  }
}

export function releaseTracks(release: CatalogRelease, metadata: Record<string, unknown>): Track[] {
  const details = (metadata.metadata ?? {}) as Record<string, unknown>
  if (
    details['access-restricted-item'] === 'true' ||
    details['access-restricted-item'] === true ||
    details.is_dark === true ||
    metadata.is_dark === true
  )
    throw new Error('Этот релиз ограничен источником и недоступен для воспроизведения.')
  const tags = text(details.subject).toLowerCase()
  const genre = tags.includes('ambient')
    ? 'Эмбиент'
    : tags.includes('jazz')
      ? 'Джаз'
      : tags.includes('classical')
        ? 'Классика'
        : tags.includes('house')
          ? 'Хаус'
          : tags.includes('rock')
            ? 'Рок'
            : tags.includes('electro')
              ? 'Электроника'
              : 'Независимая музыка'
  const mood: Mood[] = /ambient|jazz|classical|piano|chill/.test(tags)
    ? ['focus', 'chill']
    : ['energy', 'night']
  const files = Array.isArray(metadata.files) ? (metadata.files as Record<string, unknown>[]) : []
  return files
    .filter(
      (file) =>
        typeof file.name === 'string' &&
        /\.mp3$/i.test(file.name) &&
        file.private !== 'true' &&
        file.private !== true &&
        !file.name.split('/').some((part) => part === '..' || part === '.'),
    )
    .map((file) => {
      const name = file.name as string
      return {
        id: `archive:${release.id}:${name}`,
        title: text(file.title) || name.replace(/\.mp3$/i, '').replace(/_/g, ' '),
        artist: text(file.artist) || text(file.creator) || text(details.creator) || release.artist,
        genre,
        cover: 'coast',
        artwork: 'coast',
        color: '#7fadb5',
        audio: `https://archive.org/download/${encodeURIComponent(release.id)}/${name.split('/').map(encodeURIComponent).join('/')}`,
        duration: parseDuration(file.length || file.duration),
        moods: mood,
        source: 'archive' as const,
        sourceUrl: `https://archive.org/details/${release.id}`,
        artworkUrl: release.cover,
        album: release.title,
        license: text(details.licenseurl) || release.license,
        downloadAllowed: allowsDownload(text(details.licenseurl) || release.license || ''),
      }
    })
}

export async function loadRelease(release: CatalogRelease, signal?: AbortSignal): Promise<Track[]> {
  if (!identifier(release.id)) throw new Error('Неверная ссылка на релиз.')
  const data = await readJson(new URL(`https://archive.org/metadata/${release.id}`), signal)
  const tracks = releaseTracks(release, data)
  if (!tracks.length)
    throw new Error(
      'В этом релизе нет доступных MP3. Выбери другой релиз или открой его на сайте источника.',
    )
  return tracks
}
