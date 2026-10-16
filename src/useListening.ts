import { useEffect, useRef, type RefObject } from 'react'
import type { ListeningStat } from './musicTaste'

export function useListening(
  trackId: string,
  audio: RefObject<HTMLAudioElement | null>,
  save: (id: string, delta: ListeningStat) => void,
) {
  const callback = useRef(save)
  callback.current = save
  useEffect(() => {
    const node = audio.current
    if (!node) return
    let seconds = 0,
      logged = 0,
      last = node.currentTime,
      credited = false,
      completed = false
    const tick = () => {
      const delta = node.currentTime - last
      last = node.currentTime
      if (!node.paused && !node.seeking && delta > 0 && delta < 2.5) seconds += delta
      if (!credited && seconds >= 20) {
        callback.current(trackId, { seconds: 20, plays: 1, completions: 0, skips: 0 })
        logged = 20
        credited = true
      }
    }
    const ended = () => {
      completed = Number.isFinite(node.duration) && seconds >= node.duration * 0.6
      callback.current(trackId, {
        seconds: Math.max(0, seconds - logged),
        plays: !credited && seconds >= 10 ? 1 : 0,
        completions: completed ? 1 : 0,
        skips: 0,
      })
      logged = seconds
      credited = true
    }
    const seek = () => {
      last = node.currentTime
    }
    node.addEventListener('timeupdate', tick)
    node.addEventListener('seeked', seek)
    node.addEventListener('ended', ended)
    return () => {
      node.removeEventListener('timeupdate', tick)
      node.removeEventListener('seeked', seek)
      node.removeEventListener('ended', ended)
      if (seconds > logged || (seconds >= 2 && seconds < 10 && !completed))
        callback.current(trackId, {
          seconds: Math.max(0, seconds - logged),
          plays: !credited && seconds >= 10 ? 1 : 0,
          completions: 0,
          skips: seconds >= 2 && seconds < 10 && !completed ? 1 : 0,
        })
    }
  }, [trackId, audio])
}
