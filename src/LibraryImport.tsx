import { useRef, useState } from 'react'
import {
  ArrowRight,
  Check,
  FileJson,
  FileUp,
  Heart,
  ListMusic,
  LoaderCircle,
  Music2,
  X,
} from 'lucide-react'
import {
  decodeLibraryText,
  parseLibraryFile,
  type TextImportOrder,
  type ImportOptions,
  type LibraryFile,
} from './libraryImport'

export function LibraryImport({
  onImport,
  onOpen,
}: {
  onImport: (
    file: LibraryFile,
    options: ImportOptions,
  ) => { added: number; reused: number; playlistCount: number; firstPlaylistId?: string }
  onOpen: (playlistId?: string) => void
}) {
  const input = useRef<HTMLInputElement>(null)
  const readVersion = useRef(0)
  const [file, setFile] = useState<LibraryFile | null>(null)
  const [filename, setFilename] = useState('')
  const [title, setTitle] = useState('')
  const [allLiked, setAllLiked] = useState(false)
  const [keepPlaylists, setKeepPlaylists] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState<ReturnType<typeof onImport> | null>(null)
  const [textOrder, setTextOrder] = useState<TextImportOrder>('artist-title')
  const rawText = useRef('')

  async function read(selected: File) {
    const version = ++readVersion.current
    setBusy(false)
    setError('')
    setFile(null)
    setDone(null)
    if (!/\.(csv|json|txt|tsv)$/i.test(selected.name)) {
      setError('Выбери TXT, CSV, TSV или JSON. Документ Word сначала сохрани как обычный TXT.')
      return
    }
    if (selected.size > 10 * 1024 * 1024) {
      setError('Файл слишком большой. Максимум — 10 МБ.')
      return
    }
    setBusy(true)
    try {
      const text = decodeLibraryText(await selected.arrayBuffer())
      if (version !== readVersion.current) return
      rawText.current = text
      const data = parseLibraryFile(text, selected.name, textOrder)
      setFile(data)
      setTitle(data.title)
      setFilename(selected.name)
      setAllLiked(/liked|favorite|favourite|любим|избран|нрав/i.test(selected.name))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось прочитать файл.')
    } finally {
      if (version === readVersion.current) setBusy(false)
    }
  }

  return (
    <div className="library-import">
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            <FileUp size={14} /> ТВОЯ МУЗЫКА ОСТАЁТСЯ С ТОБОЙ
          </div>
          <h1>
            Забери любимое с собой<span className="heading-dot">.</span>
          </h1>
          <p>Перенеси библиотеку или свой список исполнителей и треков.</p>
        </div>
        <span className="import-format">TXT / CSV / JSON</span>
      </div>
      {done ? (
        <section className="import-success" role="status">
          <span className="import-success-icon">
            <Check size={34} />
          </span>
          <h2>Библиотека уже здесь</h2>
          <p>
            Добавлено {done.added} треков · уже были в библиотеке: {done.reused} · плейлистов:{' '}
            {done.playlistCount}
          </p>
          <button className="primary-button" onClick={() => onOpen(done.firstPlaylistId)}>
            Открыть перенесённую коллекцию <ArrowRight size={17} />
          </button>
          <button
            className="text-button"
            onClick={() => {
              setDone(null)
              setFile(null)
            }}
          >
            Перенести ещё один файл
          </button>
        </section>
      ) : (
        <>
          <section
            className="import-dropzone"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault()
              const selected = event.dataTransfer.files[0]
              if (selected) void read(selected)
            }}
          >
            <div className="import-file-icon">
              <FileJson size={35} strokeWidth={1.3} />
            </div>
            <h2>Сначала выбери файл экспорта</h2>
            <p>
              Плейлисты, названия, исполнители и избранное.
              <br />
              До 10 000 записей, максимум 10 МБ.
            </p>
            <input
              ref={input}
              type="file"
              accept=".txt,.tsv,.csv,.json,application/json,text/csv,text/plain,text/tab-separated-values"
              aria-label="Файл экспорта Яндекс Музыки"
              onChange={(event) => {
                const selected = event.target.files?.[0]
                if (selected) void read(selected)
                event.target.value = ''
              }}
            />
            <button
              className="primary-button"
              disabled={busy}
              onClick={() => input.current?.click()}
            >
              {busy ? <LoaderCircle className="spinner" size={17} /> : <FileUp size={17} />}{' '}
              {busy ? 'Читаем файл…' : 'Выбрать TXT, CSV или JSON'}
            </button>
            <small>Можно перетащить файл сюда. Он обрабатывается на устройстве.</small>
          </section>
          {error && (
            <div className="import-error" role="alert">
              <span>{error}</span>
              <button
                className="icon-button"
                aria-label="Закрыть ошибку импорта"
                onClick={() => setError('')}
              >
                <X size={16} />
              </button>
            </div>
          )}
          {file && (
            <section className="import-preview" aria-label="Предпросмотр библиотеки">
              <div className="section-heading">
                <div>
                  <div className="eyebrow">ГОТОВО К ПЕРЕНОСУ</div>
                  <h2>{filename}</h2>
                </div>
              </div>
              <div className="import-stats">
                <span>
                  <Music2 size={19} />
                  <b>{file.songs.length}</b> треков
                </span>
                <span>
                  <ListMusic size={19} />
                  <b>{new Set(file.songs.flatMap((song) => song.playlists)).size || 1}</b>{' '}
                  плейлистов
                </span>
                <span>
                  <Heart size={19} />
                  <b>{file.songs.filter((song) => song.liked).length}</b> отметок «Любимое»
                </span>
              </div>
              {(file.duplicates > 0 || file.skipped > 0) && (
                <p className="import-cleanup">
                  Объединено повторов: {file.duplicates}. Пропущено записей без метаданных:{' '}
                  {file.skipped}.
                </p>
              )}
              {file.textLayout && (
                <label className="import-title">
                  Порядок полей в текстовом списке
                  <select
                    aria-label="Порядок полей в TXT"
                    value={textOrder}
                    onChange={(event) => {
                      const order = event.target.value as TextImportOrder
                      setTextOrder(order)
                      try {
                        setFile(parseLibraryFile(rawText.current, filename, order))
                        setError('')
                      } catch (cause) {
                        setError(
                          cause instanceof Error ? cause.message : 'Не удалось прочитать список.',
                        )
                      }
                    }}
                  >
                    <option value="artist-title">Исполнитель — Название</option>
                    <option value="title-artist">Название — Исполнитель</option>
                  </select>
                </label>
              )}
              <label className="import-title">
                Название коллекции
                <input
                  aria-label="Название перенесённой коллекции"
                  value={title}
                  maxLength={200}
                  onChange={(event) => setTitle(event.target.value)}
                />
              </label>
              <label className="import-option">
                <input
                  type="checkbox"
                  checked={keepPlaylists}
                  onChange={(event) => setKeepPlaylists(event.target.checked)}
                />{' '}
                Сохранить плейлисты из файла
              </label>
              <label className="import-option">
                <input
                  type="checkbox"
                  checked={allLiked}
                  onChange={(event) => setAllLiked(event.target.checked)}
                />{' '}
                Добавить все треки в «Любимые треки»
              </label>
              <div className="import-song-preview">
                {file.songs.slice(0, 8).map((song, index) => (
                  <div key={index}>
                    <span>{String(index + 1).padStart(2, '0')}</span>
                    <div>
                      <strong>{song.title}</strong>
                      <small>
                        {song.artist}
                        {song.album ? ` · ${song.album}` : ''}
                      </small>
                    </div>
                    {song.liked && <Heart size={15} />}
                  </div>
                ))}
              </div>
              {file.songs.length > 8 && (
                <p className="import-more">И ещё {file.songs.length - 8} треков</p>
              )}
              <button
                className="primary-button"
                disabled={!title.trim()}
                onClick={() => {
                  try {
                    setError('')
                    setDone(onImport(file, { title, allLiked, keepPlaylists }))
                  } catch (cause) {
                    setError(
                      cause instanceof Error ? cause.message : 'Не удалось сохранить библиотеку.',
                    )
                  }
                }}
              >
                <FileUp size={17} /> Перенести {file.songs.length} треков
              </button>
            </section>
          )}
          <div className="import-explanation">
            <Music2 size={20} />
            <div>
              <strong>Твоя коллекция — в Volna</strong>
              <p>
                Переносятся списки и избранное. Нажми воспроизведение рядом с треком — Volna
                подберёт запись YouTube. Если точного совпадения нет, выбери её вручную. Аудиофайлы
                и подписка Яндекс Музыки не переносятся; для прослушивания нужен интернет.
              </p>
            </div>
          </div>
          <details className="import-help">
            <summary>Какие файлы подходят</summary>
            <p>
              TXT: один трек на строку в формате «Исполнитель — Название». Например: КИНО — Звезда
              по имени Солнце. Поддерживаются обычный дефис с пробелами, тире, точка с запятой и
              табуляция. Если название указано первым, поменяй порядок полей в предпросмотре.
              Поддерживаются UTF-8, UTF-16 и Windows-1251.
            </p>
            <p>
              CSV с колонками «Название», «Исполнитель», «Альбом», «Плейлист», «Избранное» или
              title, artist, album, playlist, liked. Поддерживаются запятая, точка с запятой,
              табуляция и поля в кавычках.
            </p>
            <p>
              JSON со списком tracks, playlists или likedTracks; трек должен содержать title и
              artist либо artists. Поддерживается вложенное поле track из экспортов API. Файл только
              с числовыми ID не содержит названий и не подходит.
            </p>
          </details>
        </>
      )}
    </div>
  )
}
