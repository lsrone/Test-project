import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowDownToLine,
  ArrowRight,
  AudioLines,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Compass,
  FileUp,
  Headphones,
  Heart,
  Home,
  ListMusic,
  Library,
  LoaderCircle,
  Maximize2,
  MoreHorizontal,
  Music2,
  Pause,
  Play,
  Plus,
  Radio,
  Repeat2,
  RefreshCw,
  Search,
  Settings2,
  Shuffle,
  SkipBack,
  SkipForward,
  Sparkles,
  Volume1,
  Volume2,
  VolumeX,
  Waves,
  X,
  Youtube,
} from 'lucide-react'
import {
  initialPlaylists,
  moods,
  playlists,
  tracks as demoTracks,
  type Mood,
  type Playlist,
  type Track,
} from './catalog'
import { recommend, searchTracks } from './recommendations'
import { prependNewTracks, migrateNewestFirst } from './library'
import { type SearchChoice, type ListeningStat } from './musicTaste'
import { useListening } from './useListening'
import { useStoredState } from './storage'
import { YouTubeLibrary } from './YouTubeLibrary'
import { WaveParticles } from './WaveParticles'
import { isPortable, youtubeUrl, youtubeTrack, type YouTubeVideo } from './youtube'
import OpenLibrary from './OpenLibrary'
import { useWave } from './useWave'
import { LibraryImport } from './LibraryImport'
import {
  persistLibraryImport,
  prepareLibraryImport,
  type ImportOptions,
  type LibraryFile,
} from './libraryImport'
import {
  downloadTrack,
  listSavedTracks,
  removeSavedTrack,
  savedAudio,
  type SavedTrack,
} from './offline'

type Page =
  | 'home'
  | 'browse'
  | 'radio'
  | 'liked'
  | 'history'
  | 'playlist'
  | 'search'
  | 'youtube'
  | 'downloads'
  | 'import'
type Route = { page: Page; playlistId?: string }
type InstallEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: string }>
}
const time = (seconds: number) =>
  `${Math.floor((seconds || 0) / 60)}:${String(Math.floor((seconds || 0) % 60)).padStart(2, '0')}`

function Artwork({
  kind,
  className = '',
  title,
  image,
}: {
  kind: string
  className?: string
  title?: string
  image?: string
}) {
  return (
    <div className={`artwork art-${kind} ${className}`} aria-hidden="true">
      {image && (
        <img
          className="remote-artwork"
          src={image}
          alt=""
          loading="lazy"
          onError={(event) => {
            event.currentTarget.style.display = 'none'
          }}
        />
      )}
      <div className="art-texture" />
      <div className="art-object" />
      <div className="art-orbit" />
      <span className="art-brand">
        <AudioLines size={15} /> VOLNA SELECT
      </span>
      {title && <span className="art-title">{title}</span>}
      <span className="art-caption">SOUND FOR YOUR STATE OF MIND</span>
    </div>
  )
}

export default function App() {
  useState(() => {
    migrateNewestFirst()
    return true
  })
  const [routes, setRoutes] = useState<Route[]>([{ page: 'home' }])
  const [routeIndex, setRouteIndex] = useState(0)
  const route = routes[routeIndex]
  const page = route.page
  const [query, setQuery] = useState('')
  const [searchSource, setSearchSource] = useState<'youtube' | 'library'>('youtube')
  const [tab, setTab] = useState('Все')
  const [mood, setMood] = useState<Mood>('all')
  const [liked, setLiked] = useStoredState<string[]>('volna.liked', [])
  const [history, setHistory] = useStoredState<string[]>('volna.history', [])
  const [searchChoices, setSearchChoices] = useStoredState<SearchChoice[]>(
    'volna.search-choices',
    [],
  )
  const [listening, setListening] = useStoredState<Record<string, ListeningStat>>(
    'volna.listening',
    {},
  )
  const [myPlaylists, setMyPlaylists] = useStoredState<Playlist[]>(
    'volna.playlists',
    initialPlaylists,
  )
  const personalPlaylistIds = useMemo(
    () =>
      myPlaylists.flatMap((playlist) => {
        const defaults = initialPlaylists.find((item) => item.id === playlist.id)?.tracks || []
        return playlist.tracks.filter((id) => !defaults.includes(id))
      }),
    [myPlaylists],
  )
  const [onlineTracks, setOnlineTracks] = useStoredState<Track[]>('volna.online-tracks', [])
  const tracks = useMemo(() => [...onlineTracks, ...demoTracks], [onlineTracks])
  const byId = (id: string) => tracks.find((track) => track.id === id)!
  const [currentId, setCurrentId] = useStoredState('volna.current', demoTracks[0].id)
  const [catalogQuery, setCatalogQuery] = useState('')
  const [youtubeQuery, setYoutubeQuery] = useState('')
  const [saved, setSaved] = useState<SavedTrack[] | null>(null)
  const [download, setDownload] = useState<{ id: string; loaded: number; total: number } | null>(
    null,
  )
  const [audioOverride, setAudioOverride] = useState<{ id: string; src: string } | null>(null)
  const downloadController = useRef<AbortController | null>(null)
  const playbackRequest = useRef(0)
  const offlineUrls = useRef(new Map<string, string>())
  const [volume, setVolume] = useStoredState('volna.volume', 0.7)
  const [queue, setQueue] = useState(
    tracks.filter((track) => track.source !== 'yandex').map((t) => t.id),
  )
  const [waveActive, setWaveActive] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [duration, setDuration] = useState(48)
  const [shuffle, setShuffle] = useState(false)
  const [repeat, setRepeat] = useState(false)
  const [queueOpen, setQueueOpen] = useState(false)
  const [nowPlaying, setNowPlaying] = useState(false)
  const [dialog, setDialog] = useState<'create' | 'about' | 'add' | null>(null)
  const [newPlaylistName, setNewPlaylistName] = useState('')
  const [menuTrack, setMenuTrack] = useState<string | null>(null)
  const [addTrack, setAddTrack] = useState<string | null>(null)
  const [toast, setToast] = useState('')
  const [installEvent, setInstallEvent] = useState<InstallEvent | null>(null)
  const [youtubeError, setYoutubeError] = useState('')
  const [youtubeNotice, setYoutubeNotice] = useState('')
  const playbackController = useRef<AbortController | null>(null)
  const youtubeSearchQueue = useRef(false)
  const audio = useRef<HTMLAudioElement>(null)
  const search = useRef<HTMLInputElement>(null)
  const autoplay = useRef(false)
  const main = useRef<HTMLElement>(null)
  const current = tracks.find((t) => t.id === currentId) ?? demoTracks[0]
  useListening(current.id, audio, (id, delta) =>
    setListening((previous) => {
      const old = previous[id] || { seconds: 0, plays: 0, completions: 0, skips: 0 }
      return {
        ...previous,
        [id]: {
          seconds: old.seconds + delta.seconds,
          plays: old.plays + delta.plays,
          completions: old.completions + delta.completions,
          skips: old.skips + delta.skips,
        },
      }
    }),
  )
  const isYouTube = current.source === 'youtube'
  const effectiveAudio =
    current.source === 'yandex'
      ? undefined
      : audioOverride?.id === current.id
        ? audioOverride.src
        : isYouTube
          ? undefined
          : current.source === 'archive' &&
              (saved === null || saved.some((item) => item.id === current.id))
            ? undefined
            : current.audio
  const recommended = useMemo(
    () =>
      recommend(tracks, liked, history, mood, {
        choices: searchChoices,
        listening,
        playlistIds: personalPlaylistIds,
      }),
    [tracks, liked, history, mood, searchChoices, listening, personalPlaylistIds],
  )
  const selectedPlaylist = [...playlists, ...myPlaylists].find((p) => p.id === route.playlistId)
  const searchResults = useMemo(() => searchTracks(tracks, query), [tracks, query])

  function importTracks(items: Track[]) {
    if (!items.length) return
    setOnlineTracks((previous) => prependNewTracks(previous, items))
  }
  const wave = useWave({
    // Imported metadata is retained in the library; wave discovery still needs playable audio.
    enabled: page === 'radio' || waveActive,
    tracks,
    liked,
    history,
    mood,
    onImport: importTracks,
    preferences: {
      choices: searchChoices,
      listening,
      playlistIds: personalPlaylistIds,
    },
  })
  const waveRecommended = useMemo(() => {
    const fresh = new Set(wave.batch.mood === mood ? wave.batch.ids : [])
    const discoveries = recommended.filter((track) => fresh.has(track.id))
    const rest = recommended.filter((track) => !fresh.has(track.id))
    const ranked = [...discoveries, ...rest]
    const unheard = ranked.filter((track) => !history.slice(0, 3).includes(track.id))
    return (unheard.length >= 4 ? unheard : ranked).slice(0, 24)
  }, [recommended, wave.batch, mood, history])

  // Newly discovered music goes next, without restarting the current song.
  useEffect(() => {
    if (!waveActive) return
    setQueue((previous) => {
      const index = previous.indexOf(current.id)
      const past = index >= 0 ? previous.slice(0, index + 1) : [current.id]
      const pastIds = new Set(past)
      const fresh = (wave.batch.mood === mood ? wave.batch.ids : []).filter(
        (id) => !pastIds.has(id),
      )
      const freshIds = new Set(fresh)
      const remaining = previous.slice(index + 1).filter((id) => {
        const track = tracks.find((item) => item.id === id)
        return (
          track &&
          !pastIds.has(id) &&
          !freshIds.has(id) &&
          (mood === 'all' || track.moods.includes(mood))
        )
      })
      return [...past, ...fresh, ...remaining]
    })
  }, [wave.batch, waveActive, mood])

  useEffect(() => {
    if (
      !waveActive ||
      wave.loading ||
      wave.error ||
      !wave.hasMore ||
      wave.loadedMood !== mood ||
      !wave.batch.ids.length
    )
      return
    if (!wave.batch.ids.some((id) => queue.includes(id))) return
    const index = queue.indexOf(current.id)
    const nextDiscoveries = queue.slice(index + 1).filter((id) => wave.batch.ids.includes(id))
    if (nextDiscoveries.length <= 3) void wave.refresh()
  }, [
    current.id,
    queue,
    waveActive,
    wave.loading,
    wave.error,
    wave.hasMore,
    wave.loadedMood,
    wave.batch,
    mood,
    wave.refresh,
  ])
  useEffect(() => {
    const previous = audioOverride?.src
    return () => {
      if (previous?.startsWith('blob:') && ![...offlineUrls.current.values()].includes(previous))
        URL.revokeObjectURL(previous)
    }
  }, [audioOverride?.src])
  function openCatalog(text = '') {
    setCatalogQuery(text)
    navigate('browse')
  }
  function importLibrary(file: LibraryFile, options: ImportOptions) {
    const result = prepareLibraryImport(file, options, onlineTracks, myPlaylists, liked)
    persistLibraryImport(result)
    setOnlineTracks(result.onlineTracks)
    setMyPlaylists(result.playlists)
    setLiked(result.liked)
    return result
  }
  function openYouTube(text = '') {
    setYoutubeQuery(text)
    navigate('youtube')
  }

  useEffect(() => {
    let active = true
    void listSavedTracks()
      .then((items) => {
        if (!active) return
        setSaved(items)
        if (items.length) importTracks(items.map((item) => item.track))
      })
      .catch(() => {
        if (active) setSaved([])
      })
    return () => {
      active = false
      downloadController.current?.abort()
      offlineUrls.current.forEach((url) => URL.revokeObjectURL(url))
    }
  }, [])

  async function saveTrack(track: Track) {
    if (downloadController.current) {
      notify('Сначала дождись текущего скачивания или отмени его.')
      return
    }
    const controller = new AbortController()
    downloadController.current = controller
    setDownload({ id: track.id, loaded: 0, total: 0 })
    try {
      const entry = await downloadTrack(track, controller.signal, (progress) =>
        setDownload({ id: track.id, ...progress }),
      )
      setSaved((previous) => [...(previous || []).filter((item) => item.id !== track.id), entry])
      notify(`${track.title} сохранён для офлайн-прослушивания`)
    } catch (cause) {
      if (controller.signal.aborted) notify('Скачивание отменено')
      else
        notify(
          cause instanceof Error && cause.name !== 'TypeError'
            ? cause.message
            : 'Источник не разрешил загрузку или нет связи. Попробуй другой трек.',
        )
    } finally {
      setDownload(null)
      downloadController.current = null
    }
  }
  async function deleteDownload(track: Track) {
    try {
      await removeSavedTrack(track.id)
      setSaved((previous) => (previous || []).filter((item) => item.id !== track.id))
      const url = offlineUrls.current.get(track.id)
      if (url && current.id !== track.id) URL.revokeObjectURL(url)
      offlineUrls.current.delete(track.id)
      notify('Копия на устройстве удалена')
    } catch {
      notify('Не удалось удалить копию. Попробуй ещё раз.')
    }
  }

  function navigate(next: Page, playlistId?: string) {
    setRoutes((previous) => [...previous.slice(0, routeIndex + 1), { page: next, playlistId }])
    setRouteIndex(routeIndex + 1)
    setMenuTrack(null)
    main.current?.scrollTo({ top: 0, behavior: 'smooth' })
  }
  function notify(message: string) {
    setToast(message)
  }
  function toggleLike(id: string) {
    setLiked((previous) =>
      previous.includes(id) ? previous.filter((item) => item !== id) : [id, ...previous],
    )
  }
  async function playTrack(track: Track, list?: string[], fromWave = false) {
    if (!track) return
    playbackController.current?.abort()
    if (track.source === 'youtube' && isPortable()) {
      window.open(track.sourceUrl, '_blank', 'noopener,noreferrer')
      return
    }
    if (track.source === 'yandex') {
      playbackRequest.current++
      setWaveActive(false)
      audio.current?.pause()
      setYoutubeError('')
      setNowPlaying(false)
      const text = `${track.artist} ${track.title}`.slice(0, 120)
      if (isPortable())
        window.open(
          `https://www.youtube.com/results?search_query=${encodeURIComponent(text)}`,
          '_blank',
          'noopener,noreferrer',
        )
      else openYouTube(text)
      return
    }
    setWaveActive(fromWave)
    youtubeSearchQueue.current = false
    const request = ++playbackRequest.current
    setYoutubeError('')
    let selected = track
    let source = track.audio
    setYoutubeNotice('')
    if (track.source === 'youtube' && track.youtubeId) {
      autoplay.current = false
      audio.current?.pause()
      setAudioOverride(null)
      importTracks([track])
      setCurrentId(track.id)
      setProgress(0)
      setDuration(0)
      setPlaying(false)
      setLoading(true)
      const controller = new AbortController()
      playbackController.current = controller
      try {
        const params = new URLSearchParams({
          id: track.youtubeId,
          title: track.title.slice(0, 160),
          artist: track.artist.slice(0, 120),
        })
        const response = await fetch(`/api/youtube/resolve?${params}`, {
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30000)]),
        })
        const data = await response.json()
        if (request !== playbackRequest.current) return
        if (!response.ok) throw new Error(data.message || 'Аудио этой записи недоступно.')
        if (data.replacement) {
          selected = { ...youtubeTrack(data), duration: data.duration || 0 }
          importTracks([selected])
          setYoutubeNotice('Включена другая доступная запись того же трека.')
          setQueue((previous) => [
            ...new Set(previous.map((id) => (id === track.id ? selected.id : id))),
          ])
        }
        if (data.duration > 0) {
          selected = { ...selected, duration: data.duration }
          importTracks([selected])
        }
        source = `/api/youtube/audio?id=${encodeURIComponent(selected.youtubeId || '')}`
        setDuration(data.duration || 0)
      } catch (error) {
        if (request === playbackRequest.current && !controller.signal.aborted) {
          setLoading(false)
          setPlaying(false)
          setYoutubeError(
            error instanceof Error && error.name === 'TimeoutError'
              ? 'Источник не ответил вовремя. Попробуй другую запись.'
              : error instanceof Error
                ? error.message
                : 'Источник аудио недоступен.',
          )
        }
        return
      }
    }
    if (track.source === 'archive') {
      try {
        let local = offlineUrls.current.get(track.id)
        if (!local) {
          const blob = await savedAudio(track.id)
          if (blob) {
            local = URL.createObjectURL(blob)
            offlineUrls.current.set(track.id, local)
          }
        }
        if (local) source = local
      } catch {
        /* Online playback remains available when local storage is blocked. */
      }
    }
    if (request !== playbackRequest.current) return
    autoplay.current = true
    if (list?.length)
      setQueue([
        ...new Set(
          list
            .filter((id) => byId(id)?.source !== 'yandex')
            .map((id) => (id === track.id ? selected.id : id)),
        ),
      ])
    setAudioOverride({ id: selected.id, src: source })
    if (current.id === selected.id && effectiveAudio === source) {
      if (audio.current?.error) audio.current.load()
      void audio.current?.play().catch(() => {
        setLoading(false)
        notify('Не удалось воспроизвести трек. Попробуй ещё раз.')
      })
    } else setCurrentId(selected.id)
  }
  function togglePlayback() {
    if (!audio.current) return
    if (playing) audio.current.pause()
    else if (
      effectiveAudio &&
      !youtubeError &&
      audio.current.readyState > 0 &&
      !audio.current.error
    ) {
      setYoutubeError('')
      void audio.current.play().catch(() => {
        setLoading(false)
        notify('Не удалось продолжить воспроизведение. Попробуй ещё раз.')
      })
    } else playTrack(current, undefined, waveActive)
  }
  function nextTrack(direction = 1) {
    if (direction === -1 && progress > 3) {
      seek(0)
      return
    }
    const candidates = queue.filter((id) =>
      tracks.some((t) => t.id === id && t.source !== 'yandex'),
    )
    if (!candidates.length) return
    const index = candidates.indexOf(current.id)
    const next =
      shuffle && candidates.length > 1
        ? candidates.filter((id) => id !== current.id)[
            Math.floor(Math.random() * (candidates.length - 1))
          ]
        : candidates[(index + direction + candidates.length) % candidates.length]
    if (next === current.id && audio.current) {
      audio.current.currentTime = 0
      void audio.current.play()
    } else playTrack(byId(next), undefined, waveActive)
  }
  function playCollection(ids: string[]) {
    if (ids.length) playTrack(byId(ids[0]), ids)
  }
  function startWave() {
    if (page !== 'radio') navigate('radio')
    if (waveRecommended.length)
      void playTrack(
        waveRecommended[0],
        waveRecommended.map((track) => track.id),
        true,
      )
  }
  function recordSearchChoice(trackId: string, query = '') {
    setSearchChoices((previous) =>
      [
        {
          trackId,
          query,
          count: (previous.find((choice) => choice.trackId === trackId)?.count || 0) + 1,
        },
        ...previous.filter((choice) => choice.trackId !== trackId),
      ].slice(0, 100),
    )
  }
  function playYouTube(video: YouTubeVideo, results: YouTubeVideo[] = [video], query = '') {
    recordSearchChoice(`youtube:${video.id}`, query)
    setWaveActive(false)
    playbackRequest.current++
    if (isPortable()) {
      window.open(youtubeUrl(video.id), '_blank', 'noopener,noreferrer')
      notify('Открываем YouTube. Встроенный плеер доступен в серверной версии Volna.')
      return
    }
    const items = results.map(youtubeTrack)
    importTracks(items)
    void playTrack(
      youtubeTrack(video),
      items.map((track) => track.id),
    )
    youtubeSearchQueue.current = true
  }
  function extendYouTubeQueue(items: YouTubeVideo[]) {
    if (
      !youtubeSearchQueue.current ||
      !isYouTube ||
      !items.some((item) => item.id === current.youtubeId)
    )
      return
    const more = items.map(youtubeTrack)
    importTracks(more)
    setQueue((previous) => [...new Set([...previous, ...more.map((item) => item.id)])])
  }
  function saveYouTube(video: YouTubeVideo, playlist = false, query = '') {
    const track = youtubeTrack(video)
    importTracks([track])
    if (playlist || !liked.includes(track.id)) recordSearchChoice(track.id, query)
    if (playlist) {
      setAddTrack(track.id)
      setDialog('add')
    } else toggleLike(track.id)
  }
  function seek(seconds: number) {
    if (audio.current && Number.isFinite(audio.current.duration))
      audio.current.currentTime = seconds
    setProgress(seconds)
  }
  function createPlaylist(event: React.SyntheticEvent) {
    event.preventDefault()
    const title = newPlaylistName.trim()
    if (!title) return
    const playlist: Playlist = {
      id: `custom-${crypto.randomUUID?.() ?? Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, '0')).join('')}`,
      title,
      description: 'Твоя личная коллекция',
      artwork: 'blue',
      color: '#477bf4',
      tracks: [],
    }
    setMyPlaylists((previous) => [...previous, playlist])
    setNewPlaylistName('')
    setDialog(null)
    navigate('playlist', playlist.id)
    notify('Плейлист создан. Добавь в него любимую музыку.')
  }
  function addToPlaylist(id: string) {
    if (!addTrack) return
    setMyPlaylists((previous) =>
      previous.map((p) =>
        p.id === id && !p.tracks.includes(addTrack)
          ? { ...p, tracks: [addTrack, ...p.tracks.filter((trackId) => trackId !== addTrack)] }
          : p,
      ),
    )
    setDialog(null)
    setAddTrack(null)
    notify('Трек добавлен в плейлист')
  }
  async function install() {
    if (location.protocol === 'file:' || document.documentElement.dataset.portable === 'true') {
      notify(
        'Этот HTML уже работает автономно. Для установки приложения открой серверную версию Volna.',
      )
      return
    }
    if (installEvent) {
      await installEvent.prompt()
      const choice = await installEvent.userChoice
      if (choice.outcome === 'accepted') setInstallEvent(null)
    } else notify('В меню браузера выбери «Установить приложение» или «На экран Домой».')
  }

  useEffect(() => {
    if (!autoplay.current || !audio.current) return
    setProgress(0)
    setLoading(true)
    void audio.current.play().catch(() => {
      setLoading(false)
      notify('Не удалось включить музыку. Нажми воспроизведение ещё раз.')
    })
  }, [current.id, effectiveAudio])
  useEffect(() => {
    if (audio.current) audio.current.volume = Math.min(1, Math.max(0, volume))
  }, [volume])
  useEffect(() => {
    if (!toast) return
    const timeout = setTimeout(() => setToast(''), 4200)
    return () => clearTimeout(timeout)
  }, [toast])
  useEffect(() => {
    const handler = (event: Event) => {
      event.preventDefault()
      setInstallEvent(event as InstallEvent)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement
      if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
        event.preventDefault()
        search.current?.focus()
        return
      }
      if (target.matches('input, textarea, button, select') || target.isContentEditable) return
      if (event.code === 'Space' && !dialog) {
        event.preventDefault()
        togglePlayback()
      }
      if (event.key === 'Escape') {
        setDialog(null)
        setNowPlaying(false)
        setQueueOpen(false)
        setMenuTrack(null)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  })
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setDialog(null)
        setNowPlaying(false)
        setMenuTrack(null)
      }
    }
    window.addEventListener('keydown', escape)
    return () => window.removeEventListener('keydown', escape)
  }, [])

  useEffect(() => {
    if (!dialog && !nowPlaying) return
    const previousFocus = document.activeElement as HTMLElement | null
    const panel = document.querySelector<HTMLElement>(nowPlaying ? '.now-playing-screen' : '.modal')
    if (!panel) return
    const selector = 'button:not([disabled]), input:not([disabled]), [tabindex="0"]'
    const first =
      panel.querySelector<HTMLElement>('input') ?? panel.querySelector<HTMLElement>(selector)
    first?.focus()
    const trapFocus = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return
      const controls = [...panel.querySelectorAll<HTMLElement>(selector)]
      const first = controls[0]
      const last = controls[controls.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last?.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first?.focus()
      }
    }
    panel.addEventListener('keydown', trapFocus)
    return () => {
      panel.removeEventListener('keydown', trapFocus)
      previousFocus?.focus()
    }
  }, [dialog, nowPlaying])

  useEffect(() => {
    if (!('mediaSession' in navigator)) return
    navigator.mediaSession.metadata = new MediaMetadata({
      title: current.title,
      artist: current.artist,
      album: isYouTube ? 'YouTube' : 'Volna Originals',
      artwork: [{ src: '/app-icon-512.png', sizes: '512x512', type: 'image/png' }],
    })
    navigator.mediaSession.playbackState = playing ? 'playing' : 'paused'
    navigator.mediaSession.setActionHandler(
      'play',
      () => void playTrack(current, undefined, waveActive),
    )
    navigator.mediaSession.setActionHandler('pause', () => audio.current?.pause())
    navigator.mediaSession.setActionHandler('previoustrack', () => nextTrack(-1))
    navigator.mediaSession.setActionHandler('nexttrack', () => nextTrack(1))
    navigator.mediaSession.setActionHandler('seekto', (details) => {
      if (details.seekTime !== undefined) seek(details.seekTime)
    })
    return () => {
      for (const action of ['play', 'pause', 'previoustrack', 'nexttrack', 'seekto'] as const)
        navigator.mediaSession.setActionHandler(action, null)
    }
  }, [current.id, playing, shuffle, repeat, queue, waveActive])

  function renderTrackRows(items: Track[], showNumber = true) {
    return (
      <div className="track-list">
        {items.map((track, index) => (
          <div
            className={`track-row ${current.id === track.id && playing ? 'is-playing' : ''}`}
            key={track.id}
          >
            {showNumber && (
              <span className="track-number">
                {current.id === track.id && playing ? (
                  <span className="equalizer">
                    <i />
                    <i />
                    <i />
                  </span>
                ) : (
                  String(index + 1).padStart(2, '0')
                )}
              </span>
            )}
            <button
              className="track-cover"
              onClick={() =>
                playTrack(
                  track,
                  items.map((t) => t.id),
                  page === 'radio',
                )
              }
              aria-label={
                track.source === 'yandex'
                  ? `Найти ${track.title} на YouTube`
                  : `Слушать ${track.title}`
              }
            >
              <Artwork kind={track.artwork} image={track.artworkUrl} />
              <span>
                {track.source === 'yandex' ? (
                  <Search size={18} />
                ) : current.id === track.id && playing ? (
                  <AudioLines size={20} />
                ) : (
                  <Play size={18} fill="currentColor" />
                )}
              </span>
            </button>
            <button
              className="track-info"
              onClick={() =>
                playTrack(
                  track,
                  items.map((t) => t.id),
                  page === 'radio',
                )
              }
            >
              <strong>{track.title}</strong>
              <span>{track.artist}</span>
            </button>
            <span className="track-genre">{track.genre}</span>
            <button
              className={`icon-button like-button ${liked.includes(track.id) ? 'active' : ''}`}
              aria-label={
                liked.includes(track.id)
                  ? `Убрать ${track.title} из избранного`
                  : `Добавить ${track.title} в избранное`
              }
              onClick={() => toggleLike(track.id)}
            >
              <Heart size={17} fill={liked.includes(track.id) ? 'currentColor' : 'none'} />
            </button>
            {track.source === 'archive' &&
              (download?.id === track.id ? (
                <button
                  className="icon-button download-button downloading"
                  aria-label={`Отменить скачивание ${track.title}`}
                  onClick={() => downloadController.current?.abort()}
                >
                  <LoaderCircle size={17} className="spinner" />
                </button>
              ) : saved?.some((item) => item.id === track.id) ? (
                <button
                  className="icon-button download-button downloaded"
                  aria-label={`Удалить офлайн-копию ${track.title}`}
                  title="Скачано на устройство"
                  onClick={() => void deleteDownload(track)}
                >
                  <Check size={18} />
                </button>
              ) : (
                <button
                  className="icon-button download-button"
                  disabled={!track.downloadAllowed}
                  aria-label={`Скачать ${track.title} для офлайн`}
                  title={
                    track.downloadAllowed
                      ? 'Сохранить на устройстве'
                      : 'Нет подтверждённых условий скачивания. См. источник.'
                  }
                  onClick={() => void saveTrack(track)}
                >
                  <ArrowDownToLine size={17} />
                </button>
              ))}
            <span className="track-duration">{track.duration ? time(track.duration) : '—'}</span>
            <div className="track-actions">
              <button
                className="icon-button"
                aria-label={`Действия с ${track.title}`}
                onClick={() => setMenuTrack(menuTrack === track.id ? null : track.id)}
              >
                <MoreHorizontal size={20} />
              </button>
              {menuTrack === track.id && (
                <>
                  <button
                    className="menu-dismiss"
                    aria-label="Закрыть меню трека"
                    onClick={() => setMenuTrack(null)}
                  />
                  <div className="context-menu">
                    {track.sourceUrl && (
                      <a href={track.sourceUrl} target="_blank" rel="noopener noreferrer">
                        Источник и условия
                      </a>
                    )}
                    {track.source !== 'yandex' && (
                      <button
                        onClick={() => {
                          setQueue((previous) => [...previous, track.id])
                          setMenuTrack(null)
                          notify('Трек добавлен в очередь')
                        }}
                      >
                        <ListMusic size={16} /> В очередь
                      </button>
                    )}
                    <button
                      onClick={() => {
                        setAddTrack(track.id)
                        setMenuTrack(null)
                        setDialog('add')
                      }}
                    >
                      <Plus size={16} /> В плейлист
                    </button>
                    {selectedPlaylist &&
                      myPlaylists.some((playlist) => playlist.id === selectedPlaylist.id) && (
                        <button
                          onClick={() => {
                            setMyPlaylists((previous) =>
                              previous.map((p) =>
                                p.id === selectedPlaylist.id
                                  ? { ...p, tracks: p.tracks.filter((id) => id !== track.id) }
                                  : p,
                              ),
                            )
                            setMenuTrack(null)
                          }}
                        >
                          <X size={16} /> Удалить из плейлиста
                        </button>
                      )}
                  </div>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    )
  }
  function renderPlaylistCard(playlist: Playlist) {
    return (
      <article className="playlist-card" key={playlist.id}>
        <div className="playlist-art-wrap">
          <button
            className="playlist-art-button"
            onClick={() => navigate('playlist', playlist.id)}
            aria-label={`Открыть ${playlist.title}`}
          >
            <Artwork kind={playlist.artwork} title={playlist.label || playlist.title} />
          </button>
          <button
            className="card-play"
            aria-label={`Слушать плейлист ${playlist.title}`}
            onClick={() => playCollection(playlist.tracks)}
          >
            <Play size={21} fill="currentColor" />
          </button>
        </div>
        <button className="playlist-name" onClick={() => navigate('playlist', playlist.id)}>
          {playlist.title}
        </button>
        <p>{playlist.description}</p>
      </article>
    )
  }
  const pageTitles: Record<Page, string> = {
    home: 'Главная',
    browse: 'Каталог',
    radio: 'Моя волна',
    liked: 'Любимые треки',
    history: 'Недавно слушал',
    playlist: 'Плейлист',
    search: 'Поиск',
    youtube: 'YouTube',
    downloads: 'Скачанное',
    import: 'Перенос библиотеки',
  }
  const playlistScore = (playlist: Playlist) =>
    playlist.tracks.reduce(
      (sum, id) =>
        sum +
        (tracks.length - recommended.findIndex((track) => track.id === id)) +
        (liked.includes(id) ? 6 : 0),
      0,
    ) / playlist.tracks.length
  const visiblePlaylists =
    tab === 'Новинки'
      ? [...playlists].reverse().slice(0, 5)
      : tab === 'Плейлисты'
        ? myPlaylists
        : tab === 'Для тебя'
          ? [...playlists].sort((a, b) => playlistScore(b) - playlistScore(a)).slice(0, 5)
          : playlists.slice(0, 5)
  const collectionTracks =
    page === 'liked'
      ? liked.map(byId).filter(Boolean)
      : page === 'downloads'
        ? (saved || []).map((item) => item.track)
        : page === 'history'
          ? history.map(byId).filter(Boolean)
          : (selectedPlaylist?.tracks ?? []).map(byId).filter(Boolean)

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <button className="brand" onClick={() => navigate('home')} aria-label="Volna — главная">
          <span className="brand-symbol">
            <i />
            <i />
            <i />
            <i />
          </span>
          <span>
            volna<span className="brand-dot">.</span>
          </span>
        </button>
        <div className="sidebar-caption">ТВОЯ МУЗЫКАЛЬНАЯ ВСЕЛЕННАЯ</div>
        <nav className="primary-nav" aria-label="Основная навигация">
          {(
            [
              { id: 'home', icon: Home, label: 'Главная' },
              { id: 'browse', icon: Compass, label: 'Каталог' },
              { id: 'radio', icon: Radio, label: 'Моя волна' },
              { id: 'youtube', icon: Youtube, label: 'YouTube' },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              className={page === item.id ? 'nav-item selected' : 'nav-item'}
              onClick={() => navigate(item.id)}
            >
              <item.icon size={20} strokeWidth={1.7} />
              <span>{item.label}</span>
              {item.id === 'radio' && <Sparkles size={13} className="nav-sparkle" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-section-title">МОЯ КОЛЛЕКЦИЯ</div>
        <nav className="collection-nav" aria-label="Медиатека">
          <button
            className={`nav-item ${page === 'import' ? 'selected' : ''}`}
            onClick={() => navigate('import')}
          >
            <FileUp size={20} strokeWidth={1.7} />
            <span>Перенести библиотеку</span>
          </button>
          <button
            className={`nav-item ${page === 'downloads' ? 'selected' : ''}`}
            onClick={() => navigate('downloads')}
          >
            <ArrowDownToLine size={20} strokeWidth={1.7} />
            <span>Скачанное</span>
            {Boolean(saved?.length) && <small>{saved!.length}</small>}
          </button>
          <button
            className={`nav-item ${page === 'liked' ? 'selected' : ''}`}
            onClick={() => navigate('liked')}
          >
            <Heart size={20} strokeWidth={1.7} />
            <span>Любимые треки</span>
            {liked.length > 0 && <small>{liked.length}</small>}
          </button>
          <button
            className={`nav-item ${page === 'history' ? 'selected' : ''}`}
            onClick={() => navigate('history')}
          >
            <Clock3 size={20} strokeWidth={1.7} />
            <span>Недавно слушал</span>
          </button>
        </nav>
        <div className="sidebar-section-title playlist-heading">
          ПЛЕЙЛИСТЫ
          <button
            className="icon-button"
            aria-label="Создать плейлист"
            onClick={() => setDialog('create')}
          >
            <Plus size={17} />
          </button>
        </div>
        <div className="sidebar-playlists">
          {myPlaylists.map((playlist) => (
            <button
              key={playlist.id}
              className={`sidebar-playlist ${route.playlistId === playlist.id ? 'selected-playlist' : ''}`}
              onClick={() => navigate('playlist', playlist.id)}
            >
              <Artwork kind={playlist.artwork} />
              <span>
                <strong>{playlist.title}</strong>
                <small>Плейлист · {playlist.tracks.length} треков</small>
              </span>
            </button>
          ))}
        </div>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <span className="note-icon">
              <Headphones size={23} />
            </span>
            <strong>Хорошо быть на своей волне</strong>
            <p>
              Музыка под любой момент.
              <br />И немного больше.
            </p>
            <button onClick={() => setDialog('about')}>
              Знакомься с Volna <ArrowRight size={15} />
            </button>
          </div>
          <button className="install-link" onClick={() => void install()}>
            <ArrowDownToLine size={16} /> Установить приложение
          </button>
        </div>
      </aside>

      <div className="workspace">
        <header className="topbar">
          <div className="history-controls">
            <button
              className="icon-button"
              aria-label="Назад"
              disabled={routeIndex === 0}
              onClick={() => setRouteIndex((i) => i - 1)}
            >
              <ChevronLeft size={21} />
            </button>
            <button
              className="icon-button"
              aria-label="Вперёд"
              disabled={routeIndex === routes.length - 1}
              onClick={() => setRouteIndex((i) => i + 1)}
            >
              <ChevronRight size={21} />
            </button>
          </div>
          <span className="topbar-page">{pageTitles[page]}</span>
          <div className="search-box">
            <Search size={18} />
            <input
              ref={search}
              aria-label="Поиск музыки"
              placeholder={
                page === 'search' && searchSource === 'library'
                  ? 'Поиск в библиотеке'
                  : 'Поиск на YouTube'
              }
              maxLength={120}
              value={query}
              onFocus={() => {
                if (query && page !== 'search') navigate('search')
              }}
              onChange={(event) => {
                setQuery(event.target.value)
                if (page !== 'search') navigate('search')
              }}
            />
            {query ? (
              <button
                aria-label="Очистить поиск"
                onClick={() => {
                  setQuery('')
                  search.current?.focus()
                }}
              >
                <X size={15} />
              </button>
            ) : (
              <kbd>⌘ K</kbd>
            )}
          </div>
        </header>

        <main ref={main} className={`main-content ${queueOpen ? 'with-queue' : ''}`}>
          {page === 'import' && (
            <LibraryImport
              onImport={importLibrary}
              onOpen={(playlistId) => navigate(playlistId ? 'playlist' : 'liked', playlistId)}
            />
          )}
          {page === 'youtube' && (
            <YouTubeLibrary
              initialQuery={youtubeQuery}
              onPlay={playYouTube}
              onResults={extendYouTubeQueue}
              onSave={saveYouTube}
              liked={liked}
            />
          )}
          {page === 'browse' && (
            <OpenLibrary
              key={catalogQuery}
              initialQuery={catalogQuery}
              savedTracks={onlineTracks.filter((track) => track.source === 'archive')}
              onImport={importTracks}
              onPlay={playTrack}
              renderTracks={renderTrackRows}
              onYouTube={openYouTube}
            />
          )}
          {page === 'home' && (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">ТВОЙ САУНДТРЕК НА СЕГОДНЯ</div>
                  <h1>
                    {
                      <>
                        Хороший день начинается с музыки<span className="heading-dot">.</span>
                      </>
                    }
                  </h1>
                  <p>С возвращением. Давай найдём твой ритм.</p>
                </div>
                <span className="date-badge">
                  <span /> ТВОЙ МОМЕНТ. ТВОЯ МУЗЫКА.
                </span>
              </div>
              <div className="feed-tabs" role="tablist" aria-label="Разделы ленты">
                <button className="catalog-tab" onClick={() => openCatalog()}>
                  Онлайн-каталог <ArrowRight size={13} />
                </button>
                {['Все', 'Для тебя', 'Новинки', 'Плейлисты'].map((name) => (
                  <button
                    key={name}
                    role="tab"
                    aria-selected={tab === name}
                    onClick={() => setTab(name)}
                    className={tab === name ? 'active' : ''}
                  >
                    {name === 'Для тебя' && <Sparkles size={14} />}
                    {name}
                  </button>
                ))}
              </div>
              <section className="hero" aria-label="Персональная волна">
                <div className="hero-photograph" />
                <div className="hero-grain" />
                <div className="hero-content">
                  <div className="hero-label">
                    <Sparkles size={14} /> НАСТРОЕНО НА ТЕБЯ
                  </div>
                  <h2>
                    Поймай свою
                    <br />
                    <span>волну.</span>
                  </h2>
                  <p>Твои любимые треки и открытия, которые попадут в самое сердце.</p>
                  <div className="hero-buttons">
                    <button className="primary-button" onClick={startWave}>
                      <Play size={17} fill="currentColor" /> Слушать мою волну
                    </button>
                    <button
                      className="hero-more"
                      aria-label="Открыть онлайн-каталог"
                      onClick={() => openCatalog()}
                    >
                      <ArrowRight size={20} />
                    </button>
                  </div>
                  <div className="hero-footer">
                    <span className="mini-signal">
                      <i />
                      <i />
                      <i />
                      <i />
                    </span>{' '}
                    Меняется вместе с тобой
                  </div>
                </div>
                <div className="hero-orb">
                  <span className="orb-ring ring-one" />
                  <span className="orb-ring ring-two" />
                  <span className="orb-ring ring-three" />
                  <Waves size={95} strokeWidth={0.8} />
                  <span className="orb-label">
                    YOUR DAILY
                    <br />
                    <b>FREQUENCY</b>
                  </span>
                </div>
                <span className="hero-edition">VOLNA PERSONAL SERIES — 001</span>
              </section>
              <section className="section recommendations-section">
                <div className="section-heading">
                  <div>
                    <h2>
                      {tab === 'Новинки' ? (
                        'Свежий звук'
                      ) : tab === 'Плейлисты' ? (
                        'Твоя коллекция'
                      ) : (
                        <>
                          Собрано для тебя <Sparkles size={18} />
                        </>
                      )}
                    </h2>
                    <p>
                      {tab === 'Плейлисты'
                        ? 'Музыка, которую хочется оставить рядом'
                        : 'Вдохновлено твоим вкусом. Дополнено открытиями.'}
                    </p>
                  </div>
                  <button className="text-button" onClick={() => navigate('browse')}>
                    Смотреть всё <ChevronRight size={16} />
                  </button>
                </div>
                <div className="playlist-grid">{visiblePlaylists.map(renderPlaylistCard)}</div>
              </section>
              <div className="home-lower-grid">
                <section className="section picked-section">
                  <div className="section-heading">
                    <div>
                      <h2>Тебе может понравиться</h2>
                      <p>Стоит только нажать play</p>
                    </div>
                    <button
                      className="icon-button"
                      aria-label="Все рекомендации"
                      onClick={() => navigate('radio')}
                    >
                      <ArrowRight size={19} />
                    </button>
                  </div>
                  {renderTrackRows(waveRecommended.slice(0, 4))}
                </section>
                <section className="section mood-section">
                  <div className="section-heading">
                    <div>
                      <h2>Как ты сегодня?</h2>
                      <p>Для любого состояния души</p>
                    </div>
                    <Settings2 size={17} />
                  </div>
                  <div className="mood-grid">
                    {moods.map((item) => (
                      <button
                        className={`mood-card mood-${item.id}`}
                        key={item.id}
                        onClick={() => {
                          setMood(item.id)
                          navigate('radio')
                        }}
                      >
                        <span className="mood-symbol">{item.emoji}</span>
                        <span>
                          <strong>{item.title}</strong>
                          <small>{item.subtitle}</small>
                        </span>
                        <ArrowRight size={16} />
                      </button>
                    ))}
                  </div>
                </section>
              </div>
              <div className="page-footer">
                <span className="footer-brand">
                  <AudioLines size={15} /> На одной волне с тобой.
                </span>
                <span>Музыка делает момент.</span>
              </div>
            </>
          )}

          {page === 'radio' && (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">
                    <Sparkles size={13} /> ПЕРСОНАЛЬНЫЕ РЕКОМЕНДАЦИИ
                  </div>
                  <h1>
                    Только твоя волна<span className="heading-dot">.</span>
                  </h1>
                  <p>Отмечай любимое — и каждый следующий трек будет ближе.</p>
                </div>
              </div>
              <div className={`radio-banner ${waveActive && playing ? 'wave-animating' : ''}`}>
                <WaveParticles active={waveActive && playing} />
                <div className="radio-visual">
                  <Radio size={68} strokeWidth={1} />
                  <div className="radio-circle" />
                </div>
                <div>
                  <span className="eyebrow">МУЗЫКА, КОТОРАЯ ЧУВСТВУЕТ</span>
                  <h2>Настроимся на тебя</h2>
                  <p>Рекомендации учитывают избранное, историю и твоё настроение.</p>
                  <button className="primary-button" onClick={startWave}>
                    <Play size={17} fill="currentColor" /> Включить волну
                  </button>
                </div>
              </div>
              <div className="mood-filters">
                <button className={mood === 'all' ? 'active' : ''} onClick={() => setMood('all')}>
                  Любое настроение
                </button>
                {moods.map((item) => (
                  <button
                    key={item.id}
                    className={mood === item.id ? 'active' : ''}
                    onClick={() => setMood(item.id)}
                  >
                    {item.emoji} {item.title}
                  </button>
                ))}
              </div>
              <div className="section-heading">
                <div>
                  <h2>Твоя следующая находка</h2>
                  <p>
                    {waveRecommended.length} треков ·{' '}
                    {wave.source === 'youtube'
                      ? 'на основе твоих находок'
                      : 'открытия из открытого каталога'}
                  </p>
                </div>
                <button
                  className="text-button wave-refresh"
                  disabled={wave.loading}
                  onClick={() => void wave.refresh()}
                >
                  <RefreshCw size={15} className={wave.loading ? 'spinner' : ''} /> Обновить волну
                </button>
              </div>
              <div
                className={`wave-status ${wave.error ? 'wave-error' : ''}`}
                role={wave.error ? 'alert' : 'status'}
                aria-live="polite"
              >
                {wave.loading ? (
                  <>
                    <LoaderCircle size={17} className="spinner" />
                    <span>Ищем новые треки для твоей волны…</span>
                  </>
                ) : wave.error ? (
                  <>
                    <span>{wave.error} Сейчас доступны ранее загруженные и встроенные треки.</span>
                  </>
                ) : (
                  wave.loadedMood === mood && (
                    <>
                      <Sparkles size={17} />
                      <span>
                        {wave.batch.ids.length
                          ? `${wave.batch.ids.length} новых треков. Во время прослушивания очередь пополняется автоматически.`
                          : wave.hasMore
                            ? 'Свежих треков в этой подборке пока нет. Обнови волну, чтобы продолжить поиск.'
                            : 'Пока новых треков нет. Выбери другое настроение или попробуй позже.'}
                      </span>
                    </>
                  )
                )}
              </div>
              {renderTrackRows(waveRecommended)}
              <div className="recommendation-note">
                <Sparkles size={18} />
                <span>
                  Учитываем твои находки из поиска, избранное, прослушивания и пропуски. Новые
                  открытия чередуются с любимой музыкой.
                </span>
              </div>
            </>
          )}

          {page === 'search' && (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">НОВАЯ МУЗЫКА УЖЕ БЛИЗКО</div>
                  <h1>
                    {query ? 'Вот что нашлось' : 'Найди свой звук'}
                    <span className="heading-dot">.</span>
                  </h1>
                  <p>
                    {searchSource === 'youtube'
                      ? 'Ищи треки и исполнителей на YouTube.'
                      : 'Ищи среди добавленных треков и скачанной музыки.'}
                  </p>
                </div>
              </div>
              <div className="search-online-actions">
                <div
                  className="search-source-tabs"
                  role="tablist"
                  aria-label="Источник поиска"
                  onKeyDown={(event) => {
                    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
                    event.preventDefault()
                    const index =
                      event.key === 'Home'
                        ? 0
                        : event.key === 'End'
                          ? 1
                          : searchSource === 'youtube'
                            ? 1
                            : 0
                    setSearchSource(index === 0 ? 'youtube' : 'library')
                    event.currentTarget.querySelectorAll('button')[index]?.focus()
                  }}
                >
                  <button
                    id="search-youtube-tab"
                    role="tab"
                    aria-controls="search-results"
                    aria-selected={searchSource === 'youtube'}
                    tabIndex={searchSource === 'youtube' ? 0 : -1}
                    onClick={() => setSearchSource('youtube')}
                  >
                    <Youtube size={16} /> YouTube
                  </button>
                  <button
                    id="search-library-tab"
                    role="tab"
                    aria-controls="search-results"
                    aria-selected={searchSource === 'library'}
                    tabIndex={searchSource === 'library' ? 0 : -1}
                    onClick={() => setSearchSource('library')}
                  >
                    <Library size={16} /> В библиотеке
                  </button>
                </div>
                <button className="text-button" onClick={() => openCatalog(query)}>
                  Онлайн-каталог <ArrowRight size={16} />
                </button>
              </div>
              <div
                id="search-results"
                role="tabpanel"
                aria-labelledby={
                  searchSource === 'youtube' ? 'search-youtube-tab' : 'search-library-tab'
                }
              >
                {searchSource === 'youtube' ? (
                  <YouTubeLibrary
                    compact
                    initialQuery={query}
                    onPlay={playYouTube}
                    onResults={extendYouTubeQueue}
                    onSave={saveYouTube}
                    liked={liked}
                  />
                ) : (
                  <>
                    {!query && (
                      <div className="search-suggestions">
                        {['Электроника', 'Лоу-фай', 'Эмбиент', 'Хаус'].map((item) => (
                          <button key={item} onClick={() => setQuery(item)}>
                            <Search size={15} />
                            {item}
                          </button>
                        ))}
                      </div>
                    )}
                    {searchResults.length ? (
                      <>
                        <div className="section-heading">
                          <h2>Треки</h2>
                          <span className="muted">{searchResults.length} найдено</span>
                        </div>
                        {renderTrackRows(searchResults)}
                      </>
                    ) : (
                      <div className="empty-state">
                        <Search size={44} strokeWidth={1} />
                        <h2>Кажется, здесь пока тихо</h2>
                        <p>Попробуй другое название или найди что-то по жанру.</p>
                        <button className="primary-button" onClick={() => setQuery('')}>
                          Показать весь каталог
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </>
          )}

          {(page === 'liked' ||
            page === 'history' ||
            page === 'playlist' ||
            page === 'downloads') && (
            <>
              <div className={`collection-hero collection-${page}`}>
                <div className="collection-art">
                  {page === 'downloads' ? (
                    <ArrowDownToLine size={74} strokeWidth={1} />
                  ) : page === 'liked' ? (
                    <Heart size={74} fill="currentColor" strokeWidth={1} />
                  ) : page === 'history' ? (
                    <Clock3 size={74} strokeWidth={1} />
                  ) : (
                    <Artwork
                      kind={selectedPlaylist?.artwork ?? 'blue'}
                      title={selectedPlaylist?.title}
                    />
                  )}
                </div>
                <div className="collection-description">
                  <div className="eyebrow">
                    {page === 'history' ? 'ТВОИ МУЗЫКАЛЬНЫЕ МОМЕНТЫ' : 'ТВОЯ КОЛЛЕКЦИЯ'}
                  </div>
                  <h1>
                    {page === 'playlist'
                      ? (selectedPlaylist?.title ?? 'Плейлист')
                      : pageTitles[page]}
                  </h1>
                  <p>
                    {page === 'downloads'
                      ? 'Копии на этом устройстве. Можно слушать без интернета.'
                      : page === 'liked'
                        ? 'Всё, что попало в самое сердце.'
                        : page === 'history'
                          ? 'Всегда приятно вернуться к хорошему.'
                          : selectedPlaylist?.description}
                  </p>
                  <div className="collection-meta">
                    {collectionTracks.length} треков<span>·</span>
                    {time(collectionTracks.reduce((sum, t) => sum + t.duration, 0))}
                  </div>
                </div>
              </div>
              <div className="collection-controls">
                {page === 'liked' && (
                  <button className="text-button" onClick={() => navigate('import')}>
                    <FileUp size={18} />
                    Перенести библиотеку
                  </button>
                )}
                {page === 'liked' && (
                  <button className="text-button" onClick={() => navigate('downloads')}>
                    <ArrowDownToLine size={18} />
                    Скачанное
                  </button>
                )}
                <button
                  className="large-play"
                  disabled={!collectionTracks.length}
                  aria-label="Слушать коллекцию"
                  onClick={() => playCollection(collectionTracks.map((t) => t.id))}
                >
                  <Play size={24} fill="currentColor" />
                </button>
                <button
                  className={`icon-button ${shuffle ? 'active' : ''}`}
                  aria-label="Перемешать коллекцию"
                  onClick={() => {
                    setShuffle(!shuffle)
                    notify(
                      shuffle
                        ? 'Порядок воспроизведения восстановлен'
                        : 'Случайный порядок включён',
                    )
                  }}
                >
                  <Shuffle size={24} />
                </button>
                {page === 'playlist' && (
                  <button
                    className="text-button"
                    onClick={() => {
                      navigate('search')
                      search.current?.focus()
                    }}
                  >
                    <Plus size={17} /> Добавить треки
                  </button>
                )}
                <span className="muted collection-track-label">
                  {collectionTracks.length} треков
                </span>
              </div>
              {page === 'downloads' && (
                <div className="offline-explanation">
                  <ArrowDownToLine size={19} />
                  <span>
                    {saved?.length || 0} треков ·{' '}
                    {(
                      (saved || []).reduce((size, item) => size + item.size, 0) /
                      1024 /
                      1024
                    ).toFixed(1)}{' '}
                    МБ на устройстве. Сохраняем полные файлы, а не только обложки. Удалить копию
                    можно кнопкой с галочкой рядом с треком.
                  </span>
                </div>
              )}
              {collectionTracks.length ? (
                <>
                  <div className="table-heading">
                    <span>#</span>
                    <span>НАЗВАНИЕ</span>
                    <span>ЖАНР</span>
                    <Clock3 size={15} />
                  </div>
                  {renderTrackRows(collectionTracks)}
                </>
              ) : (
                <div className="empty-state">
                  {page === 'liked' ? (
                    <Heart size={44} strokeWidth={1} />
                  ) : (
                    <Music2 size={44} strokeWidth={1} />
                  )}
                  <h2>
                    {page === 'downloads'
                      ? 'Пока ничего не скачано'
                      : page === 'liked'
                        ? 'Здесь будет твоя любимая музыка'
                        : page === 'history'
                          ? 'Начни свою музыкальную историю'
                          : 'Начало чего-то хорошего'}
                  </h2>
                  <p>
                    {page === 'downloads'
                      ? 'Открой релиз в онлайн-каталоге и нажми стрелку скачивания рядом с разрешённым треком.'
                      : page === 'liked'
                        ? 'Нажимай на сердечко рядом с треком — он останется здесь.'
                        : 'Открой каталог и найди треки, которые захочется слушать снова.'}
                  </p>
                  <button className="primary-button" onClick={() => navigate('browse')}>
                    Открыть музыку <ArrowRight size={17} />
                  </button>
                </div>
              )}
            </>
          )}
        </main>
      </div>

      {queueOpen && (
        <aside className="queue-panel">
          <div className="queue-heading">
            <h2>Очередь</h2>
            <button
              className="icon-button"
              aria-label="Закрыть очередь"
              onClick={() => setQueueOpen(false)}
            >
              <X size={19} />
            </button>
          </div>
          <div className="eyebrow">СЕЙЧАС ИГРАЕТ</div>
          <div className="queue-current">
            <Artwork kind={current.artwork} image={current.artworkUrl} />
            <div>
              <strong>{current.title}</strong>
              <span>{current.artist}</span>
            </div>
            <AudioLines size={20} />
          </div>
          <div className="queue-next-title">
            <span className="eyebrow">ДАЛЬШЕ</span>
            <button
              className="text-button"
              onClick={() => {
                setWaveActive(false)
                youtubeSearchQueue.current = false
                setQueue([current.id])
              }}
            >
              Очистить
            </button>
          </div>
          <div className="queue-list">
            {queue.slice(queue.indexOf(current.id) + 1).map((id, index) => (
              <div className="queue-track" key={`${id}-${index}`}>
                <button onClick={() => playTrack(byId(id), undefined, waveActive)}>
                  <Artwork kind={byId(id).artwork} image={byId(id).artworkUrl} />
                  <span>
                    <strong>{byId(id).title}</strong>
                    <small>{byId(id).artist}</small>
                  </span>
                </button>
                <button
                  className="icon-button"
                  aria-label={`Убрать ${byId(id).title} из очереди`}
                  onClick={() =>
                    setQueue((previous) =>
                      previous.filter((_, i) => i !== previous.indexOf(current.id) + 1 + index),
                    )
                  }
                >
                  <X size={15} />
                </button>
              </div>
            ))}
            {queue.length <= 1 && (
              <p className="queue-empty">Добавь треки через меню ··· рядом с названием.</p>
            )}
          </div>
        </aside>
      )}

      {(youtubeError || youtubeNotice) && (
        <div className="audio-source-message" role={youtubeError ? 'alert' : 'status'}>
          <span>{youtubeError || youtubeNotice}</span>
          {youtubeError && (
            <button
              className="text-button"
              onClick={() => openYouTube(`${current.artist} ${current.title}`.slice(0, 120))}
            >
              Другая запись <Search size={15} />
            </button>
          )}
          <button
            className="icon-button"
            aria-label="Закрыть сообщение плеера"
            onClick={() => {
              setYoutubeError('')
              setYoutubeNotice('')
            }}
          >
            <X size={16} />
          </button>
        </div>
      )}
      <footer className="player" aria-label="Музыкальный плеер">
        <div className="player-track">
          <button
            className="player-cover"
            aria-label="Открыть экран воспроизведения"
            onClick={() => setNowPlaying(true)}
          >
            <Artwork kind={current.artwork} image={current.artworkUrl} />
            <Maximize2 size={17} />
          </button>
          <div className="player-track-info">
            <strong>{current.title}</strong>
            <span>{current.artist}</span>
          </div>
          <button
            className={`icon-button ${liked.includes(current.id) ? 'active' : ''}`}
            aria-label="Любимый текущий трек"
            aria-pressed={liked.includes(current.id)}
            onClick={() => toggleLike(current.id)}
          >
            <Heart size={19} fill={liked.includes(current.id) ? 'currentColor' : 'none'} />
          </button>
          <button
            className="icon-button player-add-playlist"
            aria-label="Добавить текущий трек в плейлист"
            onClick={() => {
              setAddTrack(current.id)
              setDialog('add')
            }}
          >
            <Plus size={18} />
          </button>
        </div>
        <div className="player-center">
          <div className="playback-controls">
            <button
              className={`icon-button ${shuffle ? 'active dot-active' : ''}`}
              aria-label="Случайный порядок"
              aria-pressed={shuffle}
              onClick={() => setShuffle(!shuffle)}
            >
              <Shuffle size={17} />
            </button>
            <button
              className="icon-button"
              aria-label="Предыдущий трек"
              onClick={() => nextTrack(-1)}
            >
              <SkipBack size={20} fill="currentColor" />
            </button>
            <button
              className="play-pause"
              aria-label={playing ? 'Пауза' : 'Воспроизвести'}
              onClick={togglePlayback}
            >
              {loading ? (
                <LoaderCircle size={21} className="spinner" />
              ) : playing ? (
                <Pause size={20} fill="currentColor" />
              ) : (
                <Play size={20} fill="currentColor" />
              )}
            </button>
            <button
              className="icon-button"
              aria-label="Следующий трек"
              onClick={() => nextTrack(1)}
            >
              <SkipForward size={20} fill="currentColor" />
            </button>
            <button
              className={`icon-button ${repeat ? 'active dot-active' : ''}`}
              aria-label="Повтор трека"
              aria-pressed={repeat}
              onClick={() => setRepeat(!repeat)}
            >
              <Repeat2 size={18} />
              {repeat && <span className="repeat-one">1</span>}
            </button>
          </div>
          <div className="progress-row">
            <span>{time(progress)}</span>
            <input
              className="range progress-range"
              type="range"
              aria-label="Позиция воспроизведения"
              min="0"
              max={duration || 48}
              disabled={isYouTube && !duration}
              step="0.1"
              value={Math.min(progress, duration || 48)}
              style={
                { '--progress': `${(progress / (duration || 48)) * 100}%` } as React.CSSProperties
              }
              onChange={(event) => {
                const value = Number(event.target.value)
                seek(value)
              }}
            />
            <span>{time(duration)}</span>
          </div>
        </div>
        <div className="player-right">
          <span className="audio-quality">{isYouTube ? 'YouTube' : 'HQ'}</span>
          <button
            className={`icon-button ${queueOpen ? 'active' : ''}`}
            aria-label="Очередь воспроизведения"
            aria-pressed={queueOpen}
            onClick={() => setQueueOpen(!queueOpen)}
          >
            <ListMusic size={19} />
          </button>
          <div className="volume-control">
            <button
              className="icon-button"
              aria-label={volume === 0 ? 'Включить звук' : 'Выключить звук'}
              onClick={() => setVolume(volume > 0 ? 0 : 0.7)}
            >
              {volume === 0 ? (
                <VolumeX size={19} />
              ) : volume < 0.5 ? (
                <Volume1 size={19} />
              ) : (
                <Volume2 size={19} />
              )}
            </button>
            <input
              className="range volume-range"
              type="range"
              aria-label="Громкость"
              min="0"
              max="1"
              step="0.01"
              value={volume}
              style={{ '--progress': `${volume * 100}%` } as React.CSSProperties}
              onChange={(event) => setVolume(Number(event.target.value))}
            />
          </div>
          <button
            className="icon-button fullscreen-button"
            aria-label="Полный экран плеера"
            onClick={() => setNowPlaying(true)}
          >
            <Maximize2 size={17} />
          </button>
        </div>
      </footer>

      <nav className="mobile-nav" aria-label="Мобильная навигация">
        <button className={page === 'youtube' ? 'active' : ''} onClick={() => navigate('youtube')}>
          <Youtube size={21} />
          <span>YouTube</span>
        </button>
        <button className={page === 'home' ? 'active' : ''} onClick={() => navigate('home')}>
          <Home size={21} />
          <span>Главная</span>
        </button>
        <button
          className={page === 'search' ? 'active' : ''}
          onClick={() => {
            navigate('search')
            search.current?.focus()
          }}
        >
          <Search size={21} />
          <span>Поиск</span>
        </button>
        <button className={page === 'radio' ? 'active' : ''} onClick={() => navigate('radio')}>
          <Radio size={21} />
          <span>Моя волна</span>
        </button>
        <button
          className={page === 'liked' || page === 'downloads' ? 'active' : ''}
          onClick={() => navigate('liked')}
        >
          <Heart size={21} />
          <span>Коллекция</span>
        </button>
      </nav>

      {nowPlaying && (
        <div
          className="now-playing-screen"
          role="dialog"
          aria-modal="true"
          aria-label="Сейчас играет"
        >
          <button
            className="now-close icon-button"
            aria-label="Свернуть плеер"
            onClick={() => setNowPlaying(false)}
          >
            <ChevronDown size={27} />
          </button>
          <div className="eyebrow">
            <AudioLines size={15} /> НА ТВОЕЙ ВОЛНЕ
          </div>
          <Artwork
            kind={current.artwork}
            image={current.artworkUrl}
            title={current.title.toUpperCase()}
          />
          <h2>{current.title}</h2>
          <p>{current.artist}</p>
          <button
            className={`now-like icon-button ${liked.includes(current.id) ? 'active' : ''}`}
            aria-label="Избранное в плеере"
            onClick={() => toggleLike(current.id)}
          >
            <Heart fill={liked.includes(current.id) ? 'currentColor' : 'none'} />
          </button>
          <div className="now-time">
            {time(progress)} <span> / {time(duration)}</span>
          </div>
          <div className="now-controls">
            <button
              className="icon-button"
              aria-label="Предыдущий в полном экране"
              onClick={() => nextTrack(-1)}
            >
              <SkipBack size={26} fill="currentColor" />
            </button>
            <button
              className="play-pause"
              aria-label={playing ? 'Пауза в полном экране' : 'Воспроизвести в полном экране'}
              onClick={togglePlayback}
            >
              {playing ? (
                <Pause size={27} fill="currentColor" />
              ) : (
                <Play size={27} fill="currentColor" />
              )}
            </button>
            <button
              className="icon-button"
              aria-label="Следующий в полном экране"
              onClick={() => nextTrack(1)}
            >
              <SkipForward size={26} fill="currentColor" />
            </button>
          </div>
        </div>
      )}

      {dialog && (
        <div
          className="modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setDialog(null)
          }}
        >
          <section className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
            <button
              className="modal-close icon-button"
              aria-label="Закрыть диалог"
              onClick={() => setDialog(null)}
            >
              <X size={21} />
            </button>
            {dialog === 'create' ? (
              <>
                <div className="modal-icon">
                  <ListMusic size={29} />
                </div>
                <div className="eyebrow">МУЗЫКА, КОТОРАЯ ОБЪЕДИНЯЕТ</div>
                <h2 id="modal-title">Новый плейлист</h2>
                <p>У каждой истории есть свой саундтрек. Как назовём твой?</p>
                <form onSubmit={createPlaylist}>
                  <label htmlFor="playlist-name">Название</label>
                  <input
                    autoFocus
                    id="playlist-name"
                    placeholder="Например, воскресенье без планов"
                    maxLength={60}
                    required
                    value={newPlaylistName}
                    onChange={(event) => setNewPlaylistName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') createPlaylist(event)
                    }}
                  />
                  <button
                    type="button"
                    onClick={createPlaylist}
                    className="primary-button"
                    disabled={!newPlaylistName.trim()}
                  >
                    <Plus size={17} />
                    Создать плейлист
                  </button>
                </form>
              </>
            ) : dialog === 'add' ? (
              <>
                <div className="modal-icon">
                  <Plus size={27} />
                </div>
                <h2 id="modal-title">Сохранить в плейлист</h2>
                <p>{addTrack ? byId(addTrack)?.title : ''} останется рядом</p>
                <div className="add-playlist-list">
                  {myPlaylists.map((playlist) => (
                    <button key={playlist.id} onClick={() => addToPlaylist(playlist.id)}>
                      <Artwork kind={playlist.artwork} />
                      <span>
                        {playlist.title}
                        <small>{playlist.tracks.length} треков</small>
                      </span>
                      {playlist.tracks.includes(addTrack ?? '') ? (
                        <Check size={18} />
                      ) : (
                        <Plus size={18} />
                      )}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <>
                <div className="modal-icon">
                  <Waves size={31} />
                </div>
                <div className="eyebrow">ПРИЯТНО ПОЗНАКОМИТЬСЯ</div>
                <h2 id="modal-title">Это твоя Volna.</h2>
                <p>
                  Музыкальное приложение с персональными подборками, плейлистами и музыкой под
                  настроение.
                </p>
                <div className="about-details">
                  <span>
                    <Music2 size={18} />
                    Онлайн-каталог и 8 встроенных демотреков
                  </span>
                  <span>
                    <Sparkles size={18} />
                    Рекомендации на основе твоего вкуса
                  </span>
                  <span>
                    <Heart size={18} />
                    Коллекция хранится на твоём устройстве
                  </span>
                  <span>
                    <ArrowDownToLine size={18} />
                    Установка и прослушивание офлайн
                  </span>
                </div>
                <p className="about-fine-print">
                  Встроенный каталог демонстрационный. Поиск YouTube доступен после подключения API.
                  Коллекция сохраняется на устройстве. Пробел — воспроизведение и пауза.
                </p>
                <button className="primary-button" onClick={() => setDialog(null)}>
                  Поймать волну <ArrowRight size={17} />
                </button>
              </>
            )}
          </section>
        </div>
      )}
      {toast && (
        <div className="toast" role="status">
          <span className="toast-icon">
            <Check size={17} />
          </span>
          {toast}
          <button
            className="icon-button"
            aria-label="Закрыть уведомление"
            onClick={() => setToast('')}
          >
            <X size={16} />
          </button>
        </div>
      )}
      {download && (
        <div className="download-status" role="status">
          <ArrowDownToLine size={20} />
          <div>
            <strong>Сохраняем {byId(download.id)?.title}</strong>
            <span>
              {(download.loaded / 1024 / 1024).toFixed(1)} МБ
              {download.total > 0 ? ` из ${(download.total / 1024 / 1024).toFixed(1)} МБ` : ''}
            </span>
            <div className="download-progress">
              <i
                style={{
                  width: download.total
                    ? `${Math.min(100, (download.loaded / download.total) * 100)}%`
                    : '30%',
                }}
              />
            </div>
          </div>
          <button
            className="icon-button"
            aria-label="Отменить текущее скачивание"
            onClick={() => downloadController.current?.abort()}
          >
            <X size={17} />
          </button>
        </div>
      )}
      <audio
        ref={audio}
        src={effectiveAudio}
        preload="metadata"
        onTimeUpdate={() => {
          if (effectiveAudio) setProgress(audio.current?.currentTime ?? 0)
        }}
        onLoadedMetadata={() => {
          if (effectiveAudio) setDuration(audio.current?.duration || current.duration)
        }}
        onPlay={() => {
          if (!effectiveAudio) {
            audio.current?.pause()
            return
          }
          setPlaying(true)
          setHistory((previous) =>
            [current.id, ...previous.filter((id) => id !== current.id)].slice(0, 50),
          )
        }}
        onPlaying={() => {
          setLoading(false)
        }}
        onWaiting={() => {
          if (playing) setLoading(true)
        }}
        onPause={() => {
          setPlaying(false)
          setLoading(false)
        }}
        onEnded={() => {
          if (repeat && audio.current) {
            audio.current.currentTime = 0
            void audio.current.play()
          } else if (queue.length > 1) nextTrack()
          else setPlaying(false)
        }}
        onError={() => {
          setPlaying(false)
          setLoading(false)
          if (isYouTube)
            setYoutubeError(
              'Аудио этой записи недоступно. Выбери другую запись или попробуй ещё раз.',
            )
          else notify('Аудиофайл недоступен. Попробуй другой трек.')
        }}
      />
    </div>
  )
}
