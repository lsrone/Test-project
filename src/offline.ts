import { archiveResource } from './audioSource'
import type { Track } from './catalog'

export interface SavedTrack {
  id: string
  track: Track
  size: number
  savedAt: number
}
export interface DownloadProgress {
  loaded: number
  total: number
}
let database: Promise<IDBDatabase> | undefined

function openDatabase(): Promise<IDBDatabase> {
  if (!database)
    database = new Promise<IDBDatabase>((resolve, reject) => {
      try {
        const request = indexedDB.open('volna-offline', 1)
        request.onupgradeneeded = () => {
          request.result.createObjectStore('audio', { keyPath: 'id' })
          request.result.createObjectStore('tracks', { keyPath: 'id' })
        }
        request.onsuccess = () => resolve(request.result)
        request.onerror = () =>
          reject(
            new Error(
              'Хранилище устройства недоступно. Открой приложение в обычной вкладке браузера.',
            ),
          )
        request.onblocked = () =>
          reject(new Error('Хранилище занято другой вкладкой. Закрой её и попробуй снова.'))
      } catch {
        reject(
          new Error('Сохранение недоступно в этом предпросмотре. Открой Volna.html в браузере.'),
        )
      }
    }).catch((error) => {
      database = undefined
      throw error
    })
  return database
}

function requestValue<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function complete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () =>
      reject(new Error('Не удалось сохранить трек. Возможно, на устройстве закончилось место.'))
    transaction.onabort = () =>
      reject(new Error('Сохранение отменено: проверь свободное место на устройстве.'))
  })
}

export async function listSavedTracks(): Promise<SavedTrack[]> {
  const db = await openDatabase()
  return requestValue(db.transaction('tracks').objectStore('tracks').getAll())
}

export async function savedAudio(id: string): Promise<Blob | null> {
  const db = await openDatabase()
  const record = await requestValue<{ id: string; blob: Blob } | undefined>(
    db.transaction('audio').objectStore('audio').get(id),
  )
  return record?.blob ?? null
}

export async function removeSavedTrack(id: string): Promise<void> {
  const db = await openDatabase()
  const transaction = db.transaction(['audio', 'tracks'], 'readwrite')
  transaction.objectStore('audio').delete(id)
  transaction.objectStore('tracks').delete(id)
  await complete(transaction)
}

export async function saveLocalAudio(track: Track, file: File): Promise<SavedTrack> {
  if (!['youtube', 'yandex'].includes(track.source || ''))
    throw new Error('Выбери трек из перенесённой коллекции или поиска YouTube.')
  if (!/\.(mp3|m4a|ogg|wav|flac)$/i.test(file.name) || !file.size)
    throw new Error('Выбери непустой аудиофайл MP3, M4A, OGG, WAV или FLAC.')
  if (file.size > 250 * 1024 * 1024) throw new Error('Для одного трека поддерживается до 250 МБ.')
  const db = await openDatabase()
  const estimate = await navigator.storage?.estimate?.()
  if (estimate?.quota && file.size > estimate.quota - (estimate.usage || 0))
    throw new Error('На устройстве не хватает места для этого файла.')
  const url = URL.createObjectURL(file)
  const probe = document.createElement('audio')
  let duration: number
  try {
    duration = await new Promise<number>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(Error('Не удалось прочитать аудиофайл. Попробуй MP3.')),
        12000,
      )
      probe.onloadedmetadata = () => {
        clearTimeout(timer)
        if (Number.isFinite(probe.duration) && probe.duration > 0) resolve(probe.duration)
        else reject(Error('Не удалось определить длительность аудиофайла.'))
      }
      probe.onerror = () => {
        clearTimeout(timer)
        reject(Error('Файл повреждён или его формат не поддерживается. Попробуй MP3.'))
      }
      probe.preload = 'metadata'
      probe.src = url
    })
  } finally {
    probe.onloadedmetadata = null
    probe.onerror = null
    probe.removeAttribute('src')
    probe.load()
    URL.revokeObjectURL(url)
  }
  const updated: Track = {
    ...track,
    audio: `local:${track.id}`,
    duration,
    localAudio: {
      name: file.name,
      originalDuration: track.localAudio?.originalDuration ?? track.duration,
    },
  }
  const entry = { id: track.id, track: updated, size: file.size, savedAt: Date.now() }
  const transaction = db.transaction(['audio', 'tracks'], 'readwrite')
  transaction.objectStore('audio').put({ id: track.id, blob: file })
  transaction.objectStore('tracks').put(entry)
  await complete(transaction)
  return entry
}

export async function downloadTrack(
  track: Track,
  signal: AbortSignal,
  onProgress: (progress: DownloadProgress) => void,
): Promise<SavedTrack> {
  if (track.source !== 'archive' || !track.downloadAllowed)
    throw new Error('Для этого трека нет подтверждённых условий офлайн-сохранения.')
  // Fail before fetching if this preview/browser cannot store the audio.
  const db = await openDatabase()
  const response = await fetch(archiveResource(track.audio), {
    signal,
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
  })
  if (!response.ok || response.type === 'opaque')
    throw new Error('Источник не разрешил скачать аудио. Попробуй другой трек.')
  const contentType = response.headers.get('Content-Type') || 'audio/mpeg'
  if (contentType.startsWith('text/') || contentType.includes('json'))
    throw new Error('Источник вернул страницу вместо аудиофайла.')
  const total = Number(response.headers.get('Content-Length')) || 0
  const estimate = await navigator.storage?.estimate?.()
  if (total && estimate?.quota && total > estimate.quota - (estimate.usage || 0))
    throw new Error('Для трека не хватает места. Удали несколько сохранённых записей.')
  const chunks: Uint8Array<ArrayBuffer>[] = []
  let loaded = 0
  if (response.body) {
    const reader = response.body.getReader()
    try {
      while (true) {
        const result = await reader.read()
        if (result.done) break
        if (signal.aborted) throw new DOMException('Download canceled', 'AbortError')
        // Copy to an ArrayBuffer-backed view accepted by Blob in strict TypeScript.
        chunks.push(new Uint8Array(result.value))
        loaded += result.value.byteLength
        onProgress({ loaded, total })
      }
    } finally {
      reader.releaseLock()
    }
  } else {
    const buffer = await response.arrayBuffer()
    chunks.push(new Uint8Array(buffer))
    loaded = buffer.byteLength
  }
  if (signal.aborted) throw new DOMException('Download canceled', 'AbortError')
  if (!loaded || (total && loaded !== total))
    throw new Error('Аудиофайл загружен не полностью. Попробуй ещё раз.')
  const blob = new Blob(chunks, { type: 'audio/mpeg' })
  const entry = { id: track.id, track, size: blob.size, savedAt: Date.now() }
  const transaction = db.transaction(['audio', 'tracks'], 'readwrite')
  transaction.objectStore('audio').put({ id: track.id, blob })
  transaction.objectStore('tracks').put(entry)
  // Cancellation cannot leave metadata claiming a partial file is ready offline.
  const cancel = () => {
    try {
      transaction.abort()
    } catch {
      /* Transaction already finished. */
    }
  }
  signal.addEventListener('abort', cancel, { once: true })
  try {
    await complete(transaction)
  } finally {
    signal.removeEventListener('abort', cancel)
  }
  return entry
}
