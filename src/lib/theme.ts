import { useCallback, useEffect, useState } from 'react'
import { storage } from './utils'

export type Theme = 'light' | 'dark'
const KEY = '2point0-pm:theme'

/** Light for every user until they pick dark with the switch (the OS dark setting is not followed). */
function initialTheme(): Theme {
  return storage.get(KEY) === 'dark' ? 'dark' : 'light'
}

/** Light / dark switch: stamps data-theme on <html> (the CSS tokens key off it) and remembers the choice. */
export function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(initialTheme)
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.documentElement.style.colorScheme = theme
  }, [theme])
  const toggle = useCallback(() => {
    setTheme((t) => {
      const next = t === 'dark' ? 'light' : 'dark'
      storage.set(KEY, next)
      return next
    })
  }, [])
  return [theme, toggle]
}
