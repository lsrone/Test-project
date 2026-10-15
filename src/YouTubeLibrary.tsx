import { useEffect, useRef, useState } from 'react'
import {
  ArrowRight,
  CircleAlert,
  ExternalLink,
  Link2,
  LoaderCircle,
  Play,
  Search,
  X,
  Youtube,
} from 'lucide-react'
import { isPortable, parseYouTubeId, youtubeUrl, type YouTubeVideo } from './youtube'

interface Results {
  items: YouTubeVideo[]
  nextPageToken?: string
}

export function YouTubeLibrary({
  onPlay,
  initialQuery = '',
}: {
  onPlay: (video: YouTubeVideo) => void
  initialQuery?: string
}) {
  const [query, setQuery] = useState(initialQuery)
  const [searchedQuery, setSearchedQuery] = useState('')
  const [configured, setConfigured] = useState<boolean | null>(null)
  const [results, setResults] = useState<Results>({ items: [] })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const request = useRef<AbortController | null>(null)

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
    request.current?.abort()
    const controller = new AbortController()
    request.current = controller
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams({ q: text.trim(), ...(pageToken ? { pageToken } : {}) })
      const response = await fetch(`/api/youtube/search?${params}`, { signal: controller.signal })
      const data = await response.json()
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
              maxLength={500}
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
              {loading ? <LoaderCircle size={16} className="spinner" /> : <ArrowRight size={17} />}
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
                ? 'Откроем её на YouTube. Встроенный плеер и поиск доступны в серверной версии приложения.'
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
            <div className="youtube-results">
              {results.items.map((video) => (
                <article className="youtube-result" key={video.id}>
                  <button
                    className="youtube-result-art"
                    aria-label={`Включить ${video.title}`}
                    onClick={() => onPlay(video)}
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
                  <button className="youtube-result-title" onClick={() => onPlay(video)}>
                    {video.title}
                  </button>
                  <p>{video.channel}</p>
                </article>
              ))}
            </div>
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
      {!searchedQuery && (
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
        Видео воспроизводятся официальным плеером YouTube. Доступность зависит от автора и региона;
        нужен интернет.
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

export function YouTubePlayer({ video, onClose }: { video: YouTubeVideo; onClose: () => void }) {
  return (
    <aside className="youtube-dock" aria-label="Плеер YouTube">
      <div className="youtube-dock-heading">
        <Youtube size={19} />
        <span>
          <strong>{video.title}</strong>
          <small>{video.channel}</small>
        </span>
        <button className="icon-button" aria-label="Закрыть плеер YouTube" onClick={onClose}>
          <X size={19} />
        </button>
      </div>
      <iframe
        key={video.id}
        title={`YouTube: ${video.title}`}
        src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(video.id)}?autoplay=1&playsinline=1&rel=0`}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
      />
      <a href={youtubeUrl(video.id)} target="_blank" rel="noopener noreferrer">
        Открыть на YouTube <ExternalLink size={12} />
      </a>
    </aside>
  )
}
