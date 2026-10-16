import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ExternalLink, LoaderCircle, RefreshCw, Search } from 'lucide-react'
import type { Track } from './catalog'
import { parseYouTubeId, youtubeTrack, youtubeSearchUrl, type YouTubeVideo } from './youtube'
export function YouTubeSearch({
  query,
  onImport,
  renderTracks,
}: {
  query: string
  onImport: (tracks: Track[]) => void
  renderTracks: (tracks: Track[], query: string) => ReactNode
}) {
  const [tracks, setTracks] = useState<Track[]>([]),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(''),
    [next, setNext] = useState<string | undefined>()
  const request = useRef<AbortController | null>(null),
    importRef = useRef(onImport)
  importRef.current = onImport
  const portable =
    location.protocol === 'file:' || document.documentElement.dataset.portable === 'true'
  async function load(pageToken?: string) {
    request.current?.abort()
    const controller = new AbortController()
    request.current = controller
    setLoading(true)
    setError('')
    try {
      if (!navigator.onLine) throw Error('Нет интернета. Сохранённые ссылки остаются в библиотеке.')
      const response = await fetch(
        `/api/youtube/search?${new URLSearchParams({ q: query.trim(), ...(pageToken ? { pageToken } : {}) })}`,
        { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(22000)]) },
      )
      const data = await response.json()
      if (!response.ok) throw Error(data.message || 'YouTube сейчас недоступен.')
      if (!Array.isArray(data.items)) throw Error('Не удалось прочитать ответ YouTube.')
      const items = (data.items as YouTubeVideo[])
        .filter((item) => parseYouTubeId(item.id))
        .map(youtubeTrack)
      controller.signal.throwIfAborted()
      importRef.current(items)
      setTracks((old) => [
        ...new Map([...(pageToken ? old : []), ...items].map((item) => [item.id, item])).values(),
      ])
      setNext(typeof data.nextPageToken === 'string' ? data.nextPageToken : undefined)
    } catch (cause) {
      if (!controller.signal.aborted)
        setError(
          cause instanceof Error && cause.name === 'Error'
            ? cause.message
            : 'Нет связи с YouTube. Повтори запрос или открой поиск в браузере.',
        )
    } finally {
      if (!controller.signal.aborted) setLoading(false)
    }
  }
  useEffect(() => {
    request.current?.abort()
    setTracks([])
    setError('')
    setNext(undefined)
    setLoading(false)
    const id = parseYouTubeId(query.trim())
    if (id) {
      const item = youtubeTrack({ id, title: 'Запись YouTube', channel: 'Добавлено по ссылке' })
      setTracks([item])
      importRef.current([item])
      return
    }
    if (query.trim().length < 2 || portable) return
    const timer = setTimeout(() => void load(), 350)
    return () => {
      clearTimeout(timer)
      request.current?.abort()
    }
  }, [query, portable])
  return (
    <section className="youtube-search" aria-label="Результаты поиска YouTube">
      <div className="section-heading">
        <div>
          <h2>Нашлось на YouTube</h2>
          <p>
            {tracks.length
              ? `${tracks.length} записей загружено`
              : 'Поиск по названиям и исполнителям'}
          </p>
        </div>
        {loading && <LoaderCircle size={20} className="spinner" />}
      </div>
      <p className="catalog-scope">
        Нажми на запись — она откроется в нижнем плеере Volna. Некоторые авторы запрещают
        встраивание; для них можно выбрать другую запись.
      </p>
      {query.trim().length >= 2 && (
        <a
          className="text-button youtube-browser-search"
          href={youtubeSearchUrl(query)}
          target="_blank"
          rel="noopener noreferrer"
        >
          Открыть поиск на YouTube <ExternalLink size={15} />
        </a>
      )}
      {error && (
        <div className="catalog-error" role="alert">
          <span>{error}</span>
          <button className="text-button" onClick={() => void load()}>
            <RefreshCw size={16} />
            Повторить поиск
          </button>
        </div>
      )}
      {portable && (
        <p className="catalog-scope">
          В автономном HTML поиск YouTube открывается в браузере. Список результатов доступен в
          приложении Windows.
        </p>
      )}
      {renderTracks(tracks, query)}
      {!loading && !error && !tracks.length && !portable && (
        <div className="empty-state">
          <Search size={38} />
          <h2>{query.trim().length < 2 ? 'Что хочешь найти?' : 'Записи не найдены'}</h2>
          <p>Введи исполнителя и название трека или вставь ссылку YouTube.</p>
        </div>
      )}
      {next && (
        <button
          className="primary-button catalog-load-more"
          disabled={loading}
          onClick={() => void load(next)}
        >
          {loading ? 'Ищем…' : 'Загрузить ещё записи'}
        </button>
      )}
      {loading && !tracks.length && <p role="status">Ищем на YouTube…</p>}
    </section>
  )
}
