import { version } from '../package.json'
import type { Track } from './catalog'
import { archiveResource } from './audioSource'

export type PlaybackFailure = { trackId: string; message: string; diagnostic: string }
const messages: Record<string, string> = {
  TLS: 'Не удалось проверить защищённое соединение с аудиокаталогом. Проверь дату и сертификаты системы.',
  PROXY: 'Системный прокси не пропускает аудио из каталога. Проверь его настройки.',
  DNS: 'Не удалось найти сервер с аудио. Проверь подключение к интернету.',
  TIMEOUT: 'Сервер с аудио не ответил вовремя. Попробуй ещё раз.',
  REDIRECT: 'Не удалось перейти на сервер с аудиофайлом. Повтори загрузку.',
  UPSTREAM: 'Сервер каталога не отдал аудиофайл. Попробуй ещё раз позже.',
  INVALID_AUDIO: 'Источник вернул файл, который не удалось распознать как аудио.',
  RESTRICTED: 'Эта запись недоступна в аудиокаталоге. Выбери другую.',
  NETWORK: 'Не удалось загрузить аудио из каталога. Проверь подключение и повтори попытку.',
}

export async function describePlaybackFailure(
  track: Track,
  mediaCode: number,
  error?: unknown,
): Promise<PlaybackFailure | null> {
  const name = error instanceof Error ? error.name : ''
  // Rapid track changes abort the previous play() promise; that is not a failure.
  if (name === 'AbortError' || mediaCode === 1) return null
  let code = name === 'NotAllowedError' ? 'GESTURE' : 'MEDIA'
  let stage: string | undefined, status: number | undefined
  if (track.source === 'archive' && code !== 'GESTURE') {
    const resource = archiveResource(track.audio)
    if (resource.startsWith('/api/archive/audio?')) {
      try {
        const response = await fetch(resource.replace('/audio?', '/playback-status?'), {
          signal: AbortSignal.timeout(5000),
        })
        const { failure } = await response.json()
        if (failure && Object.hasOwn(messages, failure.code)) {
          code = failure.code
          stage = ['metadata', 'audio'].includes(failure.stage) ? failure.stage : undefined
          status = Number.isInteger(failure.status) ? failure.status : undefined
        }
      } catch {
        /* The local server may itself be unavailable. */
      }
    }
  }
  const message =
    code === 'GESTURE'
      ? 'Нажми кнопку воспроизведения, чтобы разрешить звук.'
      : messages[code] ||
        (mediaCode === 3 || mediaCode === 4
          ? 'Не удалось декодировать аудиофайл. Повтори загрузку или выбери другую запись.'
          : 'Не удалось загрузить аудио. Проверь подключение и повтори попытку.')
  return {
    trackId: track.id,
    message,
    diagnostic: JSON.stringify(
      {
        app: 'Volna',
        version,
        source: track.source || 'built-in',
        code,
        stage,
        status,
        mediaCode,
        playError: ['NotAllowedError', 'NotSupportedError', 'NetworkError'].includes(name)
          ? name
          : undefined,
      },
      null,
      2,
    ),
  }
}
