import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  ArrowRight,
  ChevronLeft,
  CircleAlert,
  ExternalLink,
  Globe2,
  LoaderCircle,
  Play,
  Search,
} from 'lucide-react'
import { CATALOG_PAGE_SIZE, findReleases, loadRelease, type CatalogRelease } from './openCatalog'
import type { Track } from './catalog'

interface Props {
  initialQuery?: string
  savedTracks: Track[]
  onImport: (tracks: Track[]) => void
  onPlay: (track: Track, queue: string[]) => void
  renderTracks: (tracks: Track[]) => ReactNode
}

export default function OpenLibrary({
  initialQuery = '',
  savedTracks,
  onImport,
  onPlay,
  renderTracks,
}: Props) {
  const [query, setQuery] = useState(initialQuery)
  const [activeQuery, setActiveQuery] = useState(initialQuery)
  const [releases, setReleases] = useState<CatalogRelease[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<CatalogRelease | null>(null)
  const [selectedTracks, setSelectedTracks] = useState<Track[]>([])
  const [albumLoading, setAlbumLoading] = useState(false)
  const [albumError, setAlbumError] = useState('')
  const searchRequest = useRef<AbortController | null>(null)
  const lastSearch = useRef({ query: initialQuery, page: 1 })
  const albumRequest = useRef<AbortController | null>(null)
  const importTracks = useRef(onImport)
  importTracks.current = onImport

  async function search(text: string, nextPage = 1) {
    lastSearch.current = { query: text, page: nextPage }
    searchRequest.current?.abort()
    const controller = new AbortController()
    searchRequest.current = controller
    setLoading(true)
    setError('')
    setSelected(null)
    try {
      const result = await findReleases(text, nextPage, controller.signal)
      if (controller.signal.aborted) return
      setReleases((previous) =>
        nextPage === 1
          ? result.releases
          : [
              ...previous,
              ...result.releases.filter(
                (item) => !previous.some((existing) => existing.id === item.id),
              ),
            ],
      )
      setTotal(result.total)
      setPage(nextPage)
      setActiveQuery(text)
    } catch (cause) {
      if (!controller.signal.aborted)
        setError(
          cause instanceof Error && cause.name !== 'TypeError'
            ? cause.message
            : 'Нет связи с онлайн-каталогом. Проверь интернет и доступ к archive.org. Встроенные треки остаются доступны офлайн.',
        )
    } finally {
      if (!controller.signal.aborted) setLoading(false)
    }
  }

  useEffect(() => {
    void search(initialQuery)
    return () => {
      searchRequest.current?.abort()
      albumRequest.current?.abort()
    }
  }, [initialQuery])

  async function open(release: CatalogRelease) {
    albumRequest.current?.abort()
    const controller = new AbortController()
    albumRequest.current = controller
    setSelected(release)
    setSelectedTracks([])
    setAlbumLoading(true)
    setAlbumError('')
    try {
      const items = await loadRelease(release, controller.signal)
      if (controller.signal.aborted) return
      importTracks.current(items)
      setSelectedTracks(items)
    } catch (cause) {
      if (!controller.signal.aborted)
        setAlbumError(
          cause instanceof Error && cause.name !== 'TypeError'
            ? cause.message
            : 'Не удалось загрузить треки релиза. Проверь соединение или выбери другой.',
        )
    } finally {
      if (!controller.signal.aborted) setAlbumLoading(false)
    }
  }

  return (
    <div className="open-library">
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            <Globe2 size={13} /> ОТКРЫТАЯ МУЗЫКАЛЬНАЯ ВСЕЛЕННАЯ
          </div>
          <h1>
            Новые музыкальные миры<span className="heading-dot">.</span>
          </h1>
          <p>Полные записи независимых музыкантов. Ищи, открывай релизы и собирай своё.</p>
        </div>
        <span className="catalog-provider">INTERNET ARCHIVE</span>
      </div>
      <form
        className="catalog-search"
        onSubmit={(event) => {
          event.preventDefault()
          void search(query)
        }}
      >
        <Search size={20} />
        <input
          aria-label="Поиск в онлайн-каталоге"
          placeholder="Исполнитель, альбом, жанр или название"
          maxLength={120}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              void search(query)
            }
          }}
        />
        <button
          className="primary-button"
          disabled={loading}
          type="button"
          onClick={() => void search(query)}
        >
          {loading ? <LoaderCircle size={16} className="spinner" /> : <ArrowRight size={17} />}
          <span>Найти музыку</span>
        </button>
      </form>
      <div className="catalog-genres">
        {[
          { title: 'Все релизы', q: '' },
          { title: 'Электроника', q: 'electronic' },
          { title: 'Эмбиент', q: 'ambient' },
          { title: 'Джаз', q: 'jazz' },
          { title: 'Рок', q: 'rock' },
          { title: 'Классика', q: 'classical' },
        ].map((genre) => (
          <button
            key={genre.title}
            className={activeQuery === genre.q ? 'active' : ''}
            onClick={() => {
              setQuery(genre.q)
              void search(genre.q)
            }}
          >
            {genre.title}
          </button>
        ))}
      </div>
      <div className="catalog-scope">
        <Globe2 size={17} />
        <span>Полные релизы независимых артистов из открытого каталога Internet Archive.</span>
      </div>
      {error && (
        <div className="catalog-error" role="alert">
          <CircleAlert size={20} />
          <div>
            <strong>Каталог сейчас недоступен</strong>
            <p>{error}</p>
          </div>
          <button
            className="text-button"
            onClick={() => void search(lastSearch.current.query, lastSearch.current.page)}
          >
            Повторить
          </button>
        </div>
      )}
      {selected && (
        <section className="catalog-release-details">
          <button
            className="text-button"
            onClick={() => {
              albumRequest.current?.abort()
              setSelected(null)
            }}
          >
            <ChevronLeft size={16} />К релизам
          </button>
          <div className="catalog-release-heading">
            <img
              src={selected.cover}
              alt=""
              onError={(event) => {
                event.currentTarget.style.visibility = 'hidden'
              }}
            />
            <div>
              <div className="eyebrow">ПОЛНЫЙ РЕЛИЗ</div>
              <h2>{selected.title}</h2>
              <p>{selected.artist}</p>
              <span>
                {selectedTracks.length ? `${selectedTracks.length} треков` : selected.year}
              </span>
              <div className="catalog-release-actions">
                <button
                  className="primary-button"
                  disabled={!selectedTracks.length}
                  onClick={() =>
                    onPlay(
                      selectedTracks[0],
                      selectedTracks.map((track) => track.id),
                    )
                  }
                >
                  <Play size={16} fill="currentColor" />
                  Слушать релиз
                </button>
                <a
                  href={`https://archive.org/details/${selected.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Источник и условия <ExternalLink size={13} />
                </a>
              </div>
            </div>
          </div>
          {albumLoading && (
            <div className="catalog-loading" role="status">
              <LoaderCircle className="spinner" size={22} />
              Загружаем треки…
            </div>
          )}
          {albumError && (
            <div className="catalog-error" role="alert">
              <CircleAlert size={19} />
              <span>{albumError}</span>
              <button className="text-button" onClick={() => void open(selected)}>
                Повторить
              </button>
            </div>
          )}
          {renderTracks(selectedTracks)}
        </section>
      )}
      {!selected && (
        <>
          <div className="section-heading">
            <div>
              <h2>{activeQuery ? `Результаты: ${activeQuery}` : 'Новые релизы'}</h2>
              <p>
                {total
                  ? `${total.toLocaleString('ru')} релизов в источнике · загружено ${releases.length}`
                  : 'Живой каталог независимой музыки'}
              </p>
            </div>
            {loading && <LoaderCircle size={18} className="spinner" />}
          </div>
          <div className="catalog-grid">
            {releases.map((release) => (
              <article className="catalog-card" key={release.id}>
                <button
                  className="catalog-cover"
                  onClick={() => void open(release)}
                  aria-label={`Открыть релиз ${release.title}`}
                >
                  <img
                    src={release.cover}
                    alt=""
                    loading="lazy"
                    onError={(event) => {
                      event.currentTarget.style.visibility = 'hidden'
                    }}
                  />
                  <span>
                    <Play size={23} fill="currentColor" />
                  </span>
                </button>
                <button className="catalog-card-title" onClick={() => void open(release)}>
                  {release.title}
                </button>
                <p>{release.artist}</p>
              </article>
            ))}
          </div>
          {!loading && !error && !releases.length && (
            <div className="empty-state">
              <Search size={42} />
              <h2>В открытом каталоге ничего не нашлось</h2>
              <p>
                Попробуй другое имя или жанр. В каталоге независимая музыка; коммерческие записи
                могут отсутствовать.
              </p>
            </div>
          )}
          {page * CATALOG_PAGE_SIZE < total && (
            <button
              className="catalog-load-more primary-button"
              disabled={loading}
              onClick={() => void search(activeQuery, page + 1)}
            >
              {loading ? <LoaderCircle size={16} className="spinner" /> : <span>+</span>}Загрузить
              следующие релизы
            </button>
          )}
          {loading && !releases.length && (
            <div className="catalog-loading" role="status">
              <LoaderCircle size={25} className="spinner" />
              Открываем онлайн-каталог…
            </div>
          )}
        </>
      )}
      {error && savedTracks.length > 0 && (
        <section className="section">
          <div className="section-heading">
            <div>
              <h2>Ранее открытые треки</h2>
              <p>Сохранена информация о треках; для воспроизведения нужен интернет.</p>
            </div>
          </div>
          {renderTracks(savedTracks)}
        </section>
      )}
      <div className="catalog-bottom-note">
        <span>
          Записи воспроизводятся с серверов Internet Archive. Доступность и условия определяет
          источник.
        </span>
      </div>
    </div>
  )
}
