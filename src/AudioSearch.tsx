import { useEffect, useRef, useState, type ReactNode } from 'react'
import { LoaderCircle, RefreshCw, Search } from 'lucide-react'
import { findReleases, loadRelease, CATALOG_PAGE_SIZE, type CatalogRelease } from './openCatalog'
import type { Track } from './catalog'

export function AudioSearch({
  query,
  onImport,
  renderTracks,
}: {
  query: string
  onImport: (tracks: Track[]) => void
  renderTracks: (tracks: Track[], query: string) => ReactNode
}) {
  const [tracks, setTracks] = useState<Track[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [more, setMore] = useState(false)
  const [total, setTotal] = useState(0)
  const cursor = useRef({ page: 1, offset: 0, releases: [] as CatalogRelease[] })
  const request = useRef<AbortController | null>(null)
  const importRef = useRef(onImport)
  importRef.current = onImport
  async function load(reset = false) {
    request.current?.abort()
    const controller = new AbortController()
    request.current = controller
    setLoading(true)
    setError('')
    const next = reset
      ? { page: 1, offset: 0, releases: [] as CatalogRelease[] }
      : { ...cursor.current }
    try {
      if (!navigator.onLine) throw Error('Нет интернета. Открой библиотеку или скачанные треки.')
      const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(28000)])
      if (!next.releases.length || next.offset >= next.releases.length) {
        if (next.releases.length) next.page++
        const result = await findReleases(query, next.page, signal)
        next.releases = result.releases
        next.offset = 0
        setTotal(result.total)
        nextTotal.current = result.total
      }
      const albums = next.releases.slice(next.offset, next.offset + 4)
      const results = await Promise.allSettled(
        albums.map((release) => loadRelease(release, signal)),
      )
      signal.throwIfAborted()
      if (albums.length && results.every((result) => result.status === 'rejected'))
        throw Error('Не удалось загрузить треки. Повтори запрос или выбери другой жанр.')
      const items = results.flatMap((result) => (result.status === 'fulfilled' ? result.value : []))
      next.offset += albums.length
      cursor.current = next
      importRef.current(items)
      setTracks((previous) =>
        reset
          ? items
          : [...new Map([...previous, ...items].map((track) => [track.id, track])).values()],
      )
      setMore(
        next.offset < next.releases.length || next.page * CATALOG_PAGE_SIZE < nextTotal.current,
      )
    } catch (cause) {
      if (!controller.signal.aborted)
        setError(
          cause instanceof Error && cause.name === 'Error'
            ? cause.message
            : 'Нет связи с аудиокаталогом. Проверь интернет и повтори запрос.',
        )
    } finally {
      if (!controller.signal.aborted) setLoading(false)
    }
  }
  const nextTotal = useRef(0)
  useEffect(() => {
    request.current?.abort()
    setTracks([])
    setError('')
    setMore(false)
    setLoading(true)
    const timer = setTimeout(() => void load(true), 350)
    return () => {
      clearTimeout(timer)
      request.current?.abort()
    }
  }, [query])
  return (
    <section className="audio-search" aria-label="Результаты поиска аудио">
      <div className="section-heading">
        <div>
          <h2>Нашлось в аудиокаталоге</h2>
          <p>
            {total
              ? `${total.toLocaleString('ru')} релизов в источнике · ${tracks.length} треков загружено`
              : 'Internet Archive · полные аудиозаписи'}
          </p>
        </div>
        {loading && <LoaderCircle size={20} className="spinner" />}
      </div>
      <p className="catalog-scope">
        Независимая музыка из открытого каталога. Популярные коммерческие записи могут
        отсутствовать.
      </p>
      {error && (
        <div className="catalog-error" role="alert">
          <span>{error}</span>
          <button className="text-button" onClick={() => void load(tracks.length === 0)}>
            <RefreshCw size={16} />
            Повторить
          </button>
        </div>
      )}
      {renderTracks(tracks, query)}
      {!loading && !error && !tracks.length && (
        <div className="empty-state">
          <Search size={38} />
          <h2>Треки не найдены</h2>
          <p>Попробуй название исполнителя или жанр: ambient, jazz, electronic.</p>
        </div>
      )}
      {more && (
        <button
          className="primary-button catalog-load-more"
          disabled={loading}
          onClick={() => void load()}
        >
          {loading ? 'Загружаем…' : 'Загрузить ещё треки'}
        </button>
      )}
      {loading && !tracks.length && <p role="status">Ищем полные аудиозаписи…</p>}
    </section>
  )
}
