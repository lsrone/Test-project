import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import { youtubePlaybackError } from './youtube'

interface Player {
  playVideo(): void
  pauseVideo(): void
  seekTo(seconds: number, allowSeekAhead: boolean): void
  setVolume(volume: number): void
  getCurrentTime(): number
  getDuration(): number
  getPlayerState(): number
  getIframe(): HTMLIFrameElement
  destroy(): void
}
interface PlayerEvent {
  target: Player
  data: number
}
interface SDK {
  Player: new (
    element: HTMLElement,
    options: {
      videoId: string
      host: string
      width: number
      height: number
      playerVars: Record<string, string | number>
      events: {
        onReady: (event: PlayerEvent) => void
        onStateChange: (event: PlayerEvent) => void
        onError: (event: PlayerEvent) => void
        onAutoplayBlocked: () => void
      }
    },
  ) => Player
}
declare global {
  interface Window {
    YT?: SDK
    onYouTubeIframeAPIReady?: () => void
  }
}
let sdkPromise: Promise<SDK> | undefined
function loadSDK(): Promise<SDK> {
  if (window.YT?.Player) return Promise.resolve(window.YT)
  if (!sdkPromise) {
    sdkPromise = new Promise<SDK>((resolve, reject) => {
      const script = document.createElement('script')
      const fail = () => {
        clearTimeout(timeout)
        script.remove()
        reject(
          new Error('Не удалось подключить плеер YouTube. Проверь интернет и попробуй ещё раз.'),
        )
      }
      const timeout = setTimeout(fail, 12000)
      window.onYouTubeIframeAPIReady = () => {
        clearTimeout(timeout)
        if (window.YT?.Player) resolve(window.YT)
        else fail()
      }
      script.src = 'https://www.youtube.com/iframe_api'
      script.async = true
      script.onerror = fail
      document.head.append(script)
    }).catch((error) => {
      sdkPromise = undefined
      throw error
    })
  }
  return sdkPromise
}

export interface YouTubeControls {
  seek: (seconds: number) => void
  play: () => void
}
interface Props {
  videoId: string
  title: string
  intent: 'play' | 'pause'
  volume: number
  session: number
  onState: (state: number) => void
  onTime: (position: number, duration: number) => void
  onEnded: () => void
  onError: (message: string, needsReload?: boolean) => void
}

export const YouTubePlayback = forwardRef<YouTubeControls, Props>(
  function YouTubePlayback(props, ref) {
    const host = useRef<HTMLDivElement>(null)
    const player = useRef<Player | null>(null)
    const ready = useRef(false)
    const latest = useRef(props)
    latest.current = props
    useImperativeHandle(
      ref,
      () => ({
        play: () => {
          if (ready.current) player.current?.playVideo()
        },
        seek: (seconds) => {
          if (ready.current) player.current?.seekTo(Math.max(0, seconds), true)
        },
      }),
      [],
    )

    useEffect(() => {
      let cancelled = false
      let instance: Player | undefined
      ready.current = false
      const timeout = setTimeout(() => {
        if (!cancelled && !ready.current)
          latest.current.onError(
            'YouTube не отвечает. Проверь подключение или выбери другую запись.',
          )
      }, 20000)
      const tick = () => {
        if (!cancelled && ready.current && instance) {
          const position = instance.getCurrentTime(),
            duration = instance.getDuration()
          if (Number.isFinite(position) && Number.isFinite(duration))
            latest.current.onTime(position, duration)
        }
      }
      const interval = setInterval(tick, 500)
      void loadSDK()
        .then((sdk) => {
          if (cancelled || !host.current) return
          const element = document.createElement('div')
          host.current.replaceChildren(element)
          instance = new sdk.Player(element, {
            videoId: props.videoId,
            host: 'https://www.youtube-nocookie.com',
            width: 356,
            height: 200,
            playerVars: {
              enablejsapi: 1,
              playsinline: 1,
              rel: 0,
              origin: location.origin,
              widget_referrer: location.href,
            },
            events: {
              onReady: (event) => {
                if (cancelled) return
                clearTimeout(timeout)
                player.current = event.target
                ready.current = true
                const iframe = event.target.getIframe()
                iframe.title = `YouTube: ${latest.current.title}`
                iframe.referrerPolicy = 'strict-origin-when-cross-origin'
                event.target.setVolume(latest.current.volume * 100)
                if (latest.current.intent === 'play') event.target.playVideo()
                else event.target.pauseVideo()
                tick()
              },
              onStateChange: (event) => {
                if (cancelled) return
                latest.current.onState(event.data)
                tick()
                if (event.data === 0) latest.current.onEnded()
              },
              onError: (event) => {
                if (cancelled) return
                clearTimeout(timeout)
                latest.current.onError(youtubePlaybackError(event.data))
              },
              onAutoplayBlocked: () => {
                if (!cancelled)
                  latest.current.onError(
                    'YouTube ожидает нажатия. Нажми воспроизведение в нижней панели или в видео.',
                    false,
                  )
              },
            },
          })
          player.current = instance
        })
        .catch((error) => {
          if (!cancelled) {
            clearTimeout(timeout)
            latest.current.onError(
              error instanceof Error ? error.message : 'Плеер YouTube недоступен.',
            )
          }
        })
      return () => {
        cancelled = true
        ready.current = false
        clearTimeout(timeout)
        clearInterval(interval)
        player.current = null
        instance?.destroy()
      }
    }, [props.videoId, props.session])

    useEffect(() => {
      if (!ready.current || !player.current) return
      if (props.intent === 'play') player.current.playVideo()
      else player.current.pauseVideo()
    }, [props.intent])
    useEffect(() => {
      if (ready.current) player.current?.setVolume(props.volume * 100)
    }, [props.volume])
    return <div className="youtube-inline-video" ref={host} aria-label="Видео YouTube" />
  },
)
