import type { Playlist, Track } from './catalog'

export interface ImportedSong {
  title: string
  artist: string
  album: string
  yandexId?: string
  albumId?: string
  liked: boolean
  playlists: string[]
}
export interface LibraryFile {
  title: string
  songs: ImportedSong[]
  duplicates: number
  skipped: number
}
export interface ImportOptions {
  title: string
  allLiked: boolean
  keepPlaylists: boolean
}
const clean = (value: unknown, limit = 300) =>
  typeof value === 'string' || typeof value === 'number'
    ? String(value)
        .replace(/[\u0000-\u001f]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, limit)
    : ''
const field = (value: string) =>
  value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, '')
const normalize = (value: string) =>
  value.normalize('NFKC').toLocaleLowerCase('ru').replace(/[;,]/g, ' ').replace(/\s+/g, ' ').trim()
const songKey = (song: Pick<ImportedSong, 'title' | 'artist' | 'album'>) =>
  [song.title, song.artist, song.album].map(normalize).join('\0')
function stableId(value: string) {
  let hash = 0xcbf29ce484222325n
  for (const char of value)
    hash = BigInt.asUintN(64, (hash ^ BigInt(char.codePointAt(0)!)) * 0x100000001b3n)
  return hash.toString(16)
}
const flag = (value: unknown) =>
  value === true || /^(1|true|yes|да|liked|любимое|избранное)$/i.test(clean(value))
const numericId = (value: unknown) =>
  /^\d{1,20}(?::\d+)?$/.test(clean(value)) ? clean(value).split(':')[0] : undefined
function columns(record: Record<string, unknown>) {
  const values = new Map(Object.entries(record).map(([key, value]) => [field(key), value]))
  return (...names: string[]) =>
    names
      .map((name) => values.get(field(name)))
      .find((value) => value !== undefined && value !== null && value !== '')
}
function person(value: unknown): string {
  if (Array.isArray(value)) return value.map(person).filter(Boolean).join(', ')
  if (value && typeof value === 'object') {
    const item = value as Record<string, unknown>
    return clean(item.name ?? item.title)
  }
  return clean(value)
}

function csvRows(input: string): string[][] {
  const first = input.split(/\r?\n/, 1)[0]
  const delimiter = [',', ';', '\t'].sort(
    (a, b) => first.split(b).length - first.split(a).length,
  )[0]
  const rows: string[][] = []
  let row: string[] = [],
    value = '',
    quoted = false
  for (let i = 0; i < input.length; i++) {
    const char = input[i]
    if (char === '"') {
      if (quoted && input[i + 1] === '"') {
        value += '"'
        i++
      } else quoted = !quoted
    } else if (!quoted && (char === delimiter || char === '\n' || char === '\r')) {
      row.push(value)
      value = ''
      if (char !== delimiter) {
        if (row.some((cell) => cell.trim())) rows.push(row)
        row = []
        if (char === '\r' && input[i + 1] === '\n') i++
        if (rows.length > 10001) throw new Error('В одном файле поддерживается до 10 000 треков.')
      }
    } else value += char
  }
  if (quoted) throw new Error('В CSV не закрыта кавычка. Проверь файл экспорта.')
  row.push(value)
  if (row.some((cell) => cell.trim())) rows.push(row)
  return rows
}

export function parseLibraryFile(input: string, filename: string): LibraryFile {
  if (input.length > 10 * 1024 * 1024) throw new Error('Файл слишком большой. Максимум — 10 МБ.')
  const source = input.replace(/^\ufeff/, '').trim()
  if (!source) throw new Error('Файл пуст. Выбери экспорт с названиями и исполнителями.')
  const songs: ImportedSong[] = []
  const seen = new Map<string, ImportedSong>()
  const seenIds = new Map<string, ImportedSong>()
  let skipped = 0,
    duplicates = 0,
    rows = 0
  let title = clean(filename.replace(/\.(csv|json)$/i, '')) || 'Из Яндекс Музыки'

  function add(raw: Record<string, unknown>, playlist = '', inheritedLike = false) {
    if (++rows > 10000) throw new Error('В одном файле поддерживается до 10 000 треков.')
    const nested =
      raw.track && typeof raw.track === 'object' ? (raw.track as Record<string, unknown>) : raw
    const get = columns(nested)
    const album = Array.isArray(nested.albums)
      ? (nested.albums[0] as Record<string, unknown> | undefined)
      : undefined
    const song: ImportedSong = {
      title: clean(
        get(
          'title',
          'track',
          'track name',
          'track title',
          'name',
          'название',
          'название трека',
          'трек',
        ),
      ),
      artist: person(
        get(
          'artist',
          'artists',
          'artist name',
          'artist names',
          'performer',
          'исполнитель',
          'исполнители',
        ),
      ),
      album: person(get('album', 'album name', 'альбом')) || clean(album?.title),
      yandexId: numericId(get('id', 'track id', 'yandex id', 'yandex track id') ?? raw.id),
      albumId: numericId(get('album id') ?? album?.id ?? raw.albumId),
      liked:
        inheritedLike ||
        flag(get('liked', 'favorite', 'favourite', 'is liked', 'избранное', 'любимое', 'лайк')) ||
        flag(raw.liked),
      playlists: [
        clean(get('playlist', 'playlist name', 'плейлист', 'название плейлиста')) || playlist,
      ].filter(Boolean),
    }
    if (!song.title || !song.artist) {
      skipped++
      return
    }
    const previous = (song.yandexId && seenIds.get(song.yandexId)) || seen.get(songKey(song))
    if (previous) {
      duplicates++
      previous.liked ||= song.liked
      previous.playlists = [...new Set([...previous.playlists, ...song.playlists])]
      previous.yandexId ||= song.yandexId
    } else {
      songs.push(song)
      seen.set(songKey(song), song)
    }
    if (song.yandexId) seenIds.set(song.yandexId, previous || song)
  }

  if (/\.json$/i.test(filename) || /^[\[{]/.test(source)) {
    let root: unknown
    try {
      root = JSON.parse(source)
    } catch {
      throw new Error('Не удалось прочитать JSON. Проверь формат файла.')
    }
    const visit = (value: unknown, playlist = '', liked = false, depth = 0) => {
      if (depth > 12) throw new Error('В JSON слишком много вложенных уровней.')
      if (Array.isArray(value)) {
        value.forEach((item) => visit(item, playlist, liked, depth + 1))
        return
      }
      if (!value || typeof value !== 'object') {
        skipped++
        return
      }
      const object = value as Record<string, unknown>
      const get = columns(object)
      if (
        object.track ||
        (get(
          'title',
          'track',
          'track name',
          'track title',
          'name',
          'название',
          'название трека',
          'трек',
        ) &&
          get(
            'artist',
            'artists',
            'artist name',
            'artist names',
            'performer',
            'исполнитель',
            'исполнители',
          ))
      ) {
        add(object, playlist, liked)
        return
      }
      const listTitle = clean(get('title', 'name', 'playlist name', 'название'))
      const children = Object.entries(object).filter(([key]) =>
        [
          'tracks',
          'items',
          'songs',
          'playlists',
          'library',
          'result',
          'likedtracks',
          'likes',
          'favorites',
          'favourites',
          'избранное',
          'треки',
          'плейлисты',
        ].includes(field(key)),
      )
      if (!children.length) {
        skipped++
        return
      }
      for (const [key, child] of children) {
        const kind = field(key)
        const favourite =
          liked || ['likedtracks', 'likes', 'favorites', 'favourites', 'избранное'].includes(kind)
        const group = ['tracks', 'items', 'songs', 'треки'].includes(kind)
          ? listTitle || playlist
          : playlist
        visit(child, group, favourite, depth + 1)
      }
    }
    visit(root)
    if (root && !Array.isArray(root) && typeof root === 'object')
      title = clean((root as Record<string, unknown>).title) || title
  } else {
    const [header, ...records] = csvRows(source)
    if (!header || !records.length) throw new Error('В CSV нужны заголовки и хотя бы один трек.')
    for (const record of records)
      add(Object.fromEntries(header.map((name, index) => [name, record[index] || ''])))
  }
  if (!songs.length)
    throw new Error(
      'Не нашёл треки с названиями и исполнителями. Файл только с ID треков не подходит: нужны полные метаданные.',
    )
  return { title, songs, skipped, duplicates }
}

export function prepareLibraryImport(
  file: LibraryFile,
  options: ImportOptions,
  onlineTracks: Track[],
  playlists: Playlist[],
  liked: string[],
) {
  const known = new Map(
    onlineTracks
      .filter((track) => track.source === 'yandex')
      .map((track) => [
        songKey({ title: track.title, artist: track.artist, album: track.album || '' }),
        track,
      ]),
  )
  const tracksById = new Map(onlineTracks.map((track) => [track.id, track]))
  const groups = new Map<string, string[]>()
  const favourites = new Set(liked)
  let added = 0
  const newIds: string[] = [],
    newFavourites: string[] = []
  for (const song of file.songs) {
    const key = songKey(song)
    const id = known.get(key)?.id || `yandex:${song.yandexId || `meta-${stableId(key)}`}`
    if (!tracksById.has(id)) {
      const track: Track = {
        id,
        title: song.title,
        artist: song.artist,
        album: song.album,
        genre: 'Из Яндекс Музыки',
        source: 'yandex',
        audio: '',
        duration: 0,
        cover: 'blue',
        artwork: 'blue',
        color: '#477bf4',
        moods: [],
        sourceUrl: song.yandexId
          ? `https://music.yandex.ru/${song.albumId ? `album/${song.albumId}/` : ''}track/${song.yandexId}`
          : `https://music.yandex.ru/search?text=${encodeURIComponent(`${song.artist} ${song.title}`)}`,
      }
      tracksById.set(id, track)
      newIds.push(id)
      known.set(key, track)
      added++
    }
    if ((song.liked || options.allLiked) && !favourites.has(id)) {
      newFavourites.push(id)
      favourites.add(id)
    }
    const names =
      options.keepPlaylists && song.playlists.length
        ? song.playlists
        : [clean(options.title) || file.title]
    for (const name of names) {
      const ids = groups.get(name) || []
      ids.push(id)
      groups.set(name, ids)
    }
  }
  const importedPlaylists: Playlist[] = [...groups].map(([name, ids]) => ({
    id: `yandex-playlist-${stableId(normalize(name))}`,
    title: name,
    description: 'Перенесено из Яндекс Музыки · поиск записей в аудиокаталоге',
    artwork: 'blue',
    color: '#477bf4',
    tracks: [...new Set(ids)],
  }))
  const result = new Map(playlists.map((playlist) => [playlist.id, playlist]))
  for (const playlist of importedPlaylists) {
    const previous = result.get(playlist.id)
    result.set(playlist.id, {
      ...playlist,
      tracks: [
        ...playlist.tracks.filter((id) => !previous?.tracks.includes(id)),
        ...(previous?.tracks || []),
      ],
    })
  }
  return {
    onlineTracks: [
      ...newIds.map((id) => tracksById.get(id)!),
      ...onlineTracks.map((track) => tracksById.get(track.id)!),
    ],
    playlists: [...result.values()],
    liked: [...newFavourites, ...liked],
    added,
    reused: file.songs.length - added,
    playlistCount: importedPlaylists.length,
    firstPlaylistId: importedPlaylists[0]?.id,
  }
}

export function persistLibraryImport(result: ReturnType<typeof prepareLibraryImport>) {
  const changes = [
    ['volna.online-tracks', result.onlineTracks],
    ['volna.playlists', result.playlists],
    ['volna.liked', result.liked],
  ] as const
  const old = new Map<string, string | null>()
  try {
    for (const [key] of changes) old.set(key, localStorage.getItem(key))
    for (const [key, value] of changes) localStorage.setItem(key, JSON.stringify(value))
  } catch {
    for (const [key, value] of old) {
      try {
        if (value === null) localStorage.removeItem(key)
        else localStorage.setItem(key, value)
      } catch {
        /* Keep the session usable even if storage has been disabled. */
      }
    }
    throw new Error(
      'Не удалось сохранить библиотеку. Проверь свободное место и разрешения хранилища браузера.',
    )
  }
}
