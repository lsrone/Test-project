import { useEffect, useRef, useState } from 'react'
import {
  ArrowRight,
  CircleAlert,
  ExternalLink,
  Heart,
  Link2,
  LoaderCircle,
  Play,
  Plus,
  Search,
  X,
  Youtube,
} from 'lucide-react'
import { isPortable, parseYouTubeId, type YouTubeVideo } from './youtube'

interface Results {
  items: YouTubeVideo[]
  nextPageToken?: string
}

export function YouTubeLibrary({
  onPlay,
  initialQuery = '',
  compact = false,
  onSave,
  liked = [],
  onResults,
}: {
  onPlay: (video: YouTubeVideo, results?: YouTubeVideo[], query?: string) => void
  onSave?: (video: YouTubeVideo, playlist?: boolean, query?: string) => void
  liked?: string[]
  onResults?: (items: YouTubeVideo[]) => void
  initialQuery?: string
  compact?: boolean
}) {
  const [query, setQuery] = useState(initialQuery)
  const [searchedQuery, setSearchedQuery] = useState('')
  const [configured, setConfigured] = useState<boolean | null>(null)
  const [results, setResults] = useState<Results>({ items: [] })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const request = useRef<AbortController | null>(null)
  const automaticQuery = useRef('')

  useEffect(() => {
    if (results.items.length) onResults?.(results.items)
  }, [results.items])

  useEffect(() => setQuery(initialQuery), [initialQuery])

  useEffect(() => {
    request.current?.abort()
    setLoading(false)
    if (compact) {
      setResults({ items: [] })
      setSearchedQuery('')
      setError('')
    }
    if (!configured || initialQuery.trim().length < 2 || isPortable()) return
    if (!compact && automaticQuery.current === initialQuery) return
    const timer = setTimeout(
      () => {
        automaticQuery.current = initialQuery
        void find(initialQuery)
      },
      compact ? 350 : 0,
    )
    return () => {
      clearTimeout(timer)
      request.current?.abort()
    }
  }, [configured, initialQuery, compact])

  useEffect(() => {
    const controller = new AbortController()
    if (isPortable()) {
      setConfigured(false)
      return
    }
    const timeout = setTimeout(() => {
      setConfigured(false)
      controller.abort()
    }, 6000)
    void fetch('/api/youtube/status', { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error()
        return response.json()
      })
      .then((data) => setConfigured(data.configured === true))
      .catch(() => {
        if (!controller.signal.aborted) setConfigured(false)
      })
      .finally(() => clearTimeout(timeout))
    return () => {
      clearTimeout(timeout)
      controller.abort()
      request.current?.abort()
    }
  }, [])

  async function find(text: string, pageToken?: string) {
    request.current?.abort()
    setLoading(false)
    const videoId = parseYouTubeId(text)
    if (videoId) {
      setError('')
      onPlay({ id: videoId, title: 'Музыка с YouTube', channel: 'Открыто по ссылке' })
      return
    }
    if (text.trim().length < 2) {
      setError('Введи название, исполнителя или ссылку на YouTube.')
      return
    }
    if (isPortable()) {
      window.open(
        `https://www.youtube.com/results?search_query=${encodeURIComponent(text.trim())}`,
        '_blank',
        'noopener,noreferrer',
      )
      return
    }
    if (!configured) {
      setError('Поиск приложения недоступен. Можно открыть YouTube или вставить ссылку на видео.')
      return
    }
    const controller = new AbortController()
    request.current = controller
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams({ q: text.trim(), ...(pageToken ? { pageToken } : {}) })
      const response = await fetch(`/api/youtube/search?${params}`, { signal: controller.signal })
      const data = await response.json()
      if (controller.signal.aborted) return
      if (!response.ok)
        throw new Error(data.message || 'YouTube сейчас недоступен. Попробуй ещё раз.')
      if (!Array.isArray(data.items)) throw new Error('Не удалось прочитать ответ YouTube.')
      setResults((previous) => ({
        items: pageToken
          ? [
              ...previous.items,
              ...data.items.filter(
                (item: YouTubeVideo) => !previous.items.some((video) => video.id === item.id),
              ),
            ]
          : data.items,
        nextPageToken: data.nextPageToken,
      }))
      setSearchedQuery(text.trim())
    } catch (cause) {
      if (!controller.signal.aborted)
        setError(cause instanceof Error ? cause.message : 'Не удалось загрузить результаты.')
    } finally {
      if (!controller.signal.aborted) setLoading(false)
    }
  }

  return (
    <div className="youtube-library">
      {!compact && (
        <>
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                <Youtube size={14} /> БОЛЬШЕ МУЗЫКАЛЬНЫХ ОТКРЫТИЙ
              </div>
              <h1>
                Весь мир звучит<span className="heading-dot">.</span>
              </h1>
              <p>Ищи музыку на YouTube или включай любимое по ссылке.</p>
            </div>
            <span className="youtube-source">
              <Youtube size={17} /> YouTube
            </span>
          </div>
          <section className="youtube-search-hero">
            <div className="youtube-hero-icon">
              <Youtube size={37} strokeWidth={1.3} />
            </div>
            <div>
              <h2>Что хочется послушать?</h2>
              <p>Концерты, новые релизы, длинные миксы и музыка под настроение.</p>
            </div>
            <form
              onSubmit={(event) => {
                event.preventDefault()
                void find(query)
              }}
            >
              <div className="youtube-input">
                <Search size={19} />
                <input
                  aria-label="Поиск на YouTube или ссылка"
                  value={query}
                  maxLength={120}
                  placeholder="Исполнитель, трек или ссылка на YouTube"
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      void find(query)
                    }
                  }}
                />
                <button
                  className="primary-button"
                  disabled={loading || configured === null}
                  type="button"
                  onClick={() => void find(query)}
                >
                  {loading ? (
                    <LoaderCircle size={16} className="spinner" />
                  ) : (
                    <ArrowRight size={17} />
                  )}
                  <span>{isPortable() ? 'Открыть YouTube' : 'Найти'}</span>
                </button>
              </div>
            </form>
            <div className="youtube-search-tags">
              {['lofi hip hop', 'jazz café', 'ambient music', 'indie live'].map((tag) => (
                <button
                  key={tag}
                  onClick={() => {
                    setQuery(tag)
                    void find(tag)
                  }}
                >
                  {tag}
                </button>
              ))}
            </div>
          </section>
        </>
      )}
      {loading && (
        <div className="youtube-search-loading" role="status">
          <LoaderCircle size={18} className="spinner" />
          {results.items.length ? 'Загружаем ещё…' : 'Ищем на YouTube…'}
        </div>
      )}
      {error && (
        <div className="youtube-message" role="alert">
          <CircleAlert size={19} />
          <span>{error}</span>
          <button
            className="icon-button"
            aria-label="Закрыть сообщение YouTube"
            onClick={() => setError('')}
          >
            <X size={16} />
          </button>
        </div>
      )}
      {configured === false && !error && (
        <div className="youtube-connection-note">
          <Link2 size={19} />
          <div>
            <strong>Начни со ссылки на любимую музыку</strong>
            <p>
              {isPortable()
                ? 'Откроем её на YouTube. Аудиоплеер и поиск доступны в серверной версии приложения.'
                : 'Поиск приложения сейчас недоступен. Открой поиск на YouTube или вставь ссылку на видео для встроенного плеера.'}
            </p>
          </div>
        </div>
      )}
      {(error || configured === false) && (
        <a
          className="source-link"
          href={`https://www.youtube.com/results?search_query=${encodeURIComponent(query.trim() || 'music')}`}
          target="_blank"
          rel="noreferrer"
        >
          <ExternalLink size={16} /> Открыть поиск на YouTube
        </a>
      )}
      {searchedQuery && (
        <section className="section">
          <div className="section-heading">
            <div>
              <h2>Нашлось на YouTube</h2>
              <p>По запросу «{searchedQuery}»</p>
            </div>
            <span className="muted">{results.items.length} видео</span>
          </div>
          {results.items.length ? (
            <ol
              className="youtube-results"
              aria-label="Результаты поиска YouTube"
              aria-busy={loading}
            >
              {results.items.map((video, index) => (
                <li className="youtube-result" key={video.id}>
                  <span className="youtube-result-number" aria-hidden="true">
                    {index + 1}
                  </span>
                  <button
                    className="youtube-result-art"
                    aria-label={`Включить ${video.title}`}
                    onClick={() => onPlay(video, results.items, searchedQuery)}
                  >
                    <img
                      src={video.thumbnail}
                      alt=""
                      loading="lazy"
                      onError={(event) => {
                        event.currentTarget.style.visibility = 'hidden'
                      }}
                    />
                    <span>
                      <Play size={24} fill="currentColor" />
                    </span>
                    <small>
                      <Youtube size={15} />
                    </small>
                  </button>
                  <div className="youtube-result-info">
                    <button
                      className="youtube-result-title"
                      onClick={() => onPlay(video, results.items, searchedQuery)}
                    >
                      {video.title}
                    </button>
                    <p>{video.channel}</p>
                  </div>
                  <div className="youtube-result-actions">
                    {onSave && (
                      <>
                        <button
                          className={`icon-button ${liked.includes(`youtube:${video.id}`) ? 'active' : ''}`}
                          aria-label={`${liked.includes(`youtube:${video.id}`) ? 'Убрать' : 'Добавить'} ${video.title} ${liked.includes(`youtube:${video.id}`) ? 'из избранного' : 'в избранное'}`}
                          aria-pressed={liked.includes(`youtube:${video.id}`)}
                          onClick={() => onSave(video, false, searchedQuery)}
                        >
                          <Heart
                            size={17}
                            fill={liked.includes(`youtube:${video.id}`) ? 'currentColor' : 'none'}
                          />
                        </button>
                        <button
                          className="icon-button"
                          aria-label={`Добавить ${video.title} в плейлист`}
                          onClick={() => onSave(video, true, searchedQuery)}
                        >
                          <Plus size={17} />
                        </button>
                      </>
                    )}
                    <button
                      className="youtube-result-play icon-button"
                      aria-label={`Слушать ${video.title}`}
                      onClick={() => onPlay(video, results.items, searchedQuery)}
                    >
                      <Play size={18} fill="currentColor" />
                    </button>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <div className="empty-state">
              <Search size={40} />
              <h2>Такой музыки пока не нашлось</h2>
              <p>Попробуй другое название или имя исполнителя.</p>
            </div>
          )}
          {results.nextPageToken && (
            <button
              className="youtube-load-more primary-button"
              disabled={loading || configured === null}
              onClick={() => void find(searchedQuery, results.nextPageToken)}
            >
              {loading ? <LoaderCircle size={16} className="spinner" /> : <PlusIcon />} Показать ещё
            </button>
          )}
        </section>
      )}
      {!searchedQuery && !loading && (
        <div className="youtube-empty-hint">
          <HeadphoneMark />
          <h2>Музыки хватит на любую волну</h2>
          <p>
            {isPortable()
              ? 'Введи название или вставь ссылку — откроем музыку на YouTube.'
              : 'Введи название, исполнителя или вставь ссылку на видео, чтобы начать.'}
          </p>
        </div>
      )}
      <p className="youtube-fine-print">
        Воспроизводим аудио без видео. Доступность записей зависит от источника и региона; нужен
        интернет.
      </p>
    </div>
  )
}

function PlusIcon() {
  return <span aria-hidden="true">+</span>
}
function HeadphoneMark() {
  return <Youtube size={44} strokeWidth={1} />
}
