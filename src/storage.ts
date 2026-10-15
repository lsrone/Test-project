import { useState } from 'react'

export function useStoredState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const saved = localStorage.getItem(key)
      return saved ? (JSON.parse(saved) as T) : initial
    } catch {
      return initial
    }
  })
  const save = (update: T | ((previous: T) => T)) => {
    setValue((previous) => {
      const next = typeof update === 'function' ? (update as (p: T) => T)(previous) : update
      try {
        localStorage.setItem(key, JSON.stringify(next))
      } catch {
        /* Private browsing or quota: keep the current session usable. */
      }
      return next
    })
  }
  return [value, save] as const
}
