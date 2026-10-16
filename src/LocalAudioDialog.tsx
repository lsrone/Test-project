import { useEffect, useRef, useState } from 'react'
import { ExternalLink, FileAudio, LoaderCircle, X } from 'lucide-react'
import type { Track } from './catalog'
import { youtubeLink } from './youtube'
export function LocalAudioDialog({
  track,
  onSave,
  onClose,
  onExternal,
}: {
  track: Track
  onSave: (file: File) => Promise<void>
  onClose: () => void
  onExternal: () => void
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('')
  const input = useRef<HTMLInputElement>(null),
    panel = useRef<HTMLElement>(null),
    active = useRef(true)
  useEffect(() => {
    active.current = true
    const previous = document.activeElement as HTMLElement | null
    panel.current?.querySelector<HTMLButtonElement>('.local-audio-pick')?.focus()
    return () => {
      active.current = false
      previous?.focus()
    }
  }, [])
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose()
      }}
    >
      <section
        ref={panel}
        className="modal local-audio-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="local-audio-title"
        onKeyDown={(event) => {
          if (event.key === 'Escape' && !busy) {
            event.stopPropagation()
            onClose()
          }
          if (event.key === 'Tab') {
            const controls = [
              ...event.currentTarget.querySelectorAll<HTMLElement>(
                'button:not([disabled]), a[href]',
              ),
            ]
            const first = controls[0],
              last = controls.at(-1)
            if (event.shiftKey && document.activeElement === first) {
              event.preventDefault()
              last?.focus()
            } else if (!event.shiftKey && document.activeElement === last) {
              event.preventDefault()
              first?.focus()
            }
          }
        }}
      >
        <button
          className="modal-close icon-button"
          disabled={busy}
          aria-label="Закрыть выбор аудио"
          onClick={onClose}
        >
          <X size={21} />
        </button>
        <div className="modal-icon">
          <FileAudio size={30} />
        </div>
        <h2 id="local-audio-title">Прослушивание в Volna</h2>
        <p className="local-audio-track">
          {track.artist} — {track.title}
        </p>
        <p className="local-audio-note">
          В коллекции сохранены название и исполнитель. Чтобы слушать этот трек здесь без видео,
          выбери свой аудиофайл. Он останется на устройстве и будет доступен без интернета.
        </p>
        <input
          ref={input}
          type="file"
          hidden
          accept=".mp3,.m4a,.ogg,.wav,.flac,audio/*"
          aria-label="Аудиофайл для трека"
          onChange={(event) => {
            const file = event.target.files?.[0]
            event.target.value = ''
            if (!file || busy) return
            setBusy(true)
            setError('')
            void onSave(file)
              .then(() => {
                if (active.current) onClose()
              })
              .catch((cause) => {
                if (active.current)
                  setError(
                    cause instanceof Error ? cause.message : 'Не удалось сохранить аудиофайл.',
                  )
              })
              .finally(() => {
                if (active.current) setBusy(false)
              })
          }}
        />
        <button
          className="primary-button local-audio-pick"
          disabled={busy}
          onClick={() => input.current?.click()}
        >
          {busy ? <LoaderCircle size={18} className="spinner" /> : <FileAudio size={18} />}{' '}
          {busy
            ? 'Проверяем и сохраняем…'
            : track.localAudio
              ? 'Заменить аудиофайл'
              : 'Выбрать аудиофайл'}
        </button>
        <p className="about-fine-print">
          MP3, M4A, OGG, WAV или FLAC · до 250 МБ. Лайк и плейлисты сохранятся.
        </p>
        {error && (
          <p className="import-error" role="alert">
            {error}
          </p>
        )}
        {youtubeLink(track) && (
          <button className="text-button" disabled={busy} onClick={onExternal}>
            Открыть на YouTube вручную <ExternalLink size={15} />
          </button>
        )}
      </section>
    </div>
  )
}
