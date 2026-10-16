import { useEffect, useRef } from 'react'
import type { ListeningStat } from './musicTaste'

// Count observed playback, not seeks, metadata searches or time spent paused.
export function useYouTubeListening(
  trackId: string,
  enabled: boolean,
  playing: boolean,
  position: number,
  duration: number,
  save: (id: string, delta: ListeningStat) => void,
) {
  const callback = useRef(save)
  callback.current = save
  const state = useRef({
    seconds: 0,
    logged: 0,
    last: 0,
    playing: false,
    credited: false,
    completed: false,
  })
  useEffect(() => {
    const value = {
      seconds: 0,
      logged: 0,
      last: 0,
      playing: false,
      credited: false,
      completed: false,
    }
    state.current = value
    return () => {
      if (!enabled) return
      const skip = value.seconds >= 2 && value.seconds < 10 && !value.completed
      if (value.seconds > value.logged || skip)
        callback.current(trackId, {
          seconds: Math.max(0, value.seconds - value.logged),
          plays: !value.credited && value.seconds >= 10 ? 1 : 0,
          completions: 0,
          skips: skip ? 1 : 0,
        })
    }
  }, [trackId, enabled])
  useEffect(() => {
    if (!enabled) return
    const value = state.current
    const delta = position - value.last
    value.last = position
    if (playing && value.playing && delta > 0 && delta < 2.5) value.seconds += delta
    value.playing = playing
    if (!value.credited && value.seconds >= 20) {
      callback.current(trackId, { seconds: 20, plays: 1, completions: 0, skips: 0 })
      value.logged = 20
      value.credited = true
    }
  }, [position, playing, enabled])
  return () => {
    if (!enabled) return
    const value = state.current
    value.completed = duration > 0 && value.seconds >= duration * 0.6
    callback.current(trackId, {
      seconds: Math.max(0, value.seconds - value.logged),
      plays: !value.credited && value.seconds >= 10 ? 1 : 0,
      completions: value.completed ? 1 : 0,
      skips: 0,
    })
    value.logged = value.seconds
    value.credited = true
  }
}
