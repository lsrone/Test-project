const messages = {
  NETWORK:
    'Не удалось соединиться с YouTube из приложения. Проверь подключение и системный прокси.',
  TIMEOUT: 'YouTube не ответил вовремя. Попробуй ещё раз.',
  TLS: 'Не удалось проверить защищённое соединение с YouTube. Проверь дату и сертификаты системы.',
  LOGIN_REQUIRED:
    'YouTube требует вход или проверку посетителя для этого запроса. Приложение без аккаунта не может воспроизвести запись.',
  EMBED_BLOCKED:
    'Автор запретил воспроизведение этой записи в приложениях. Ищем другую доступную запись.',
  UNAVAILABLE: 'Эта запись сейчас недоступна у источника. Можно выбрать другую запись.',
  NO_AUDIO: 'YouTube не предоставил обычный аудиопоток для этой записи.',
  PLAYER_SCRIPT:
    'Не удалось обработать адрес аудио YouTube. Формат проигрывателя источника мог измениться.',
  INTERNAL: 'Не удалось получить аудио YouTube. Скопируй диагностику, чтобы определить причину.',
}
export class AudioSourceError extends Error {
  constructor(code, stage = 'metadata', details = {}) {
    super(
      messages[code] ||
        (code === 'HTTP'
          ? `YouTube отклонил запрос приложения (HTTP ${details.httpStatus}).`
          : messages.INTERNAL),
    )
    this.code = code
    this.stage = stage
    this.httpStatus = details.httpStatus
    this.providerStatus = details.providerStatus
  }
}
export class AudioUnavailable extends AudioSourceError {
  constructor(message = messages.UNAVAILABLE, code = 'UNAVAILABLE', details = {}) {
    super(code, 'metadata', details)
    this.message = message
  }
}
export function audioFailure(error, stage = 'metadata') {
  if (error instanceof AudioSourceError) return error
  const code =
    error?.cause?.code || error?.code || /net::(ERR_[A-Z_]+)/.exec(error?.message || '')?.[1] || ''
  if (
    error?.name === 'TimeoutError' ||
    error?.name === 'AbortError' ||
    /TIMEOUT|TIMED_OUT/.test(code)
  )
    return new AudioSourceError('TIMEOUT', stage)
  if (/CERT|TLS|SSL/.test(code)) return new AudioSourceError('TLS', stage)
  if (
    /ECONN|ENOTFOUND|EAI_|ENET|UND_ERR|ERR_(CONNECTION|NAME_|PROXY|TUNNEL|NETWORK|INTERNET)/.test(
      code,
    ) ||
    error?.message === 'fetch failed'
  )
    return new AudioSourceError('NETWORK', stage)
  return new AudioSourceError(stage === 'player' ? 'PLAYER_SCRIPT' : 'INTERNAL', stage)
}
export function safeAudioDiagnostic(error) {
  const failure = audioFailure(error)
  return {
    code: failure.code,
    stage: failure.stage,
    ...(Number.isInteger(failure.httpStatus) ? { httpStatus: failure.httpStatus } : {}),
    ...(['ERROR', 'UNPLAYABLE', 'LOGIN_REQUIRED', 'LIVE_STREAM_OFFLINE'].includes(
      failure.providerStatus,
    )
      ? { providerStatus: failure.providerStatus }
      : {}),
  }
}
