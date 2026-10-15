import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseLibraryFile, prepareLibraryImport, persistLibraryImport } from './libraryImport'

afterEach(() => vi.unstubAllGlobals())
const options = { title: 'Моя коллекция', allLiked: false, keepPlaylists: true }

describe('Yandex CSV and JSON library import', () => {
  it('reads BOM, semicolons, escaped quotes and merges favourites across duplicate playlist rows', () => {
    const file = parseLibraryFile(
      '\ufeffНазвание;Исполнитель;Альбом;Плейлист;Избранное;ID\r\n"Звук; ""Ночь""";Группа;Альбом;Ночь;false;42\r\n"Звук; ""Ночь""";Группа;Альбом;Дорога;да;42\r\n;Без названия;;;;',
      'yandex.csv',
    )
    expect(file.songs).toHaveLength(1)
    expect(file.songs[0]).toMatchObject({
      title: 'Звук; "Ночь"',
      artist: 'Группа',
      liked: true,
      yandexId: '42',
      playlists: ['Ночь', 'Дорога'],
    })
    expect(file.duplicates).toBe(1)
    expect(file.skipped).toBe(1)
  })
  it('reads tab separated exports and quoted newlines without evaluating text', () => {
    const file = parseLibraryFile(
      'Track\tArtist\tAlbum\n"Line one\nline two"\t"Artist, Guest"\tAlbum',
      'music.csv',
    )
    expect(file.songs[0]).toMatchObject({ title: 'Line one line two', artist: 'Artist, Guest' })
  })
  it('reads nested API track objects, artist arrays, albums and likedTracks', () => {
    const track = {
      id: 123,
      title: 'A song',
      artists: [{ name: 'Artist' }, { name: 'Guest' }],
      albums: [{ id: 99, title: 'Album' }],
    }
    const file = parseLibraryFile(
      JSON.stringify({
        result: {
          playlists: [{ title: 'В дорогу', tracks: [{ track }] }],
          likedTracks: [{ track }],
        },
      }),
      'yandex.json',
    )
    expect(file.songs).toHaveLength(1)
    expect(file.songs[0]).toMatchObject({
      title: 'A song',
      artist: 'Artist, Guest',
      album: 'Album',
      albumId: '99',
      yandexId: '123',
      playlists: ['В дорогу'],
      liked: true,
    })
  })
  it('rejects malformed files and ID-only exports before creating a collection', () => {
    expect(() => parseLibraryFile('{bad', 'export.json')).toThrow('JSON')
    expect(() => parseLibraryFile('Title,Artist\n"Unclosed,Artist', 'export.csv')).toThrow(
      'кавычка',
    )
    expect(() => parseLibraryFile('{"tracks":[{"id":123,"albumId":99}]}', 'export.json')).toThrow(
      'полные метаданные',
    )
    expect(() => parseLibraryFile('', 'export.csv')).toThrow('пуст')
  })
  it('imports 128 songs idempotently and preserves playlists, favourites and source links', () => {
    const rows = Array.from(
      { length: 128 },
      (_, n) =>
        `${1000 + n},Song ${n},Artist ${n % 5},Album,${n % 2 ? 'Ночь' : 'Дорога'},${n % 2 === 0}`,
    )
    const file = parseLibraryFile(
      `ID,Title,Artist,Album,Playlist,Liked\n${rows.join('\n')}`,
      'export.csv',
    )
    const first = prepareLibraryImport(file, options, [], [], ['existing-like'])
    expect(first.added).toBe(128)
    expect(first.playlistCount).toBe(2)
    expect(first.liked).toHaveLength(65)
    expect(first.onlineTracks[0].sourceUrl).toBe('https://music.yandex.ru/track/1000')
    const again = prepareLibraryImport(
      file,
      options,
      first.onlineTracks,
      first.playlists,
      first.liked,
    )
    expect(again.added).toBe(0)
    expect(again.reused).toBe(128)
    expect(again.onlineTracks).toHaveLength(128)
    expect(again.playlists).toHaveLength(2)
    expect(new Set(again.playlists.flatMap((playlist) => playlist.tracks)).size).toBe(128)
    expect(again.liked).toEqual(first.liked)
  })
  it('restores the previous library if a storage write fails halfway through import', () => {
    const values = new Map([
      ['volna.online-tracks', 'old-tracks'],
      ['volna.playlists', 'old-playlists'],
      ['volna.liked', 'old-likes'],
    ])
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      removeItem: (key: string) => values.delete(key),
      setItem: (key: string, value: string) => {
        if (key === 'volna.playlists' && value !== 'old-playlists')
          throw new DOMException('Quota exceeded', 'QuotaExceededError')
        values.set(key, value)
      },
    })
    const file = parseLibraryFile('Title,Artist\nSong,Artist', 'export.csv')
    const result = prepareLibraryImport(file, options, [], [], [])
    expect(() => persistLibraryImport(result)).toThrow('Не удалось сохранить')
    expect(Object.fromEntries(values)).toEqual({
      'volna.online-tracks': 'old-tracks',
      'volna.playlists': 'old-playlists',
      'volna.liked': 'old-likes',
    })
  })
})
