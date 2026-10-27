import { createContext, useContext } from 'react'
import type { Theme } from '@/lib/theme'
import { ThemeToggle } from './ThemeToggle'
import { UserChip } from './ui'

export const ThemeContext = createContext<{ theme: Theme; toggle: () => void }>({ theme: 'light', toggle: () => {} })

/** Signed-in user + light / dark switch at the right end of the page header — a normal (static) element, it never floats. */
export function TopBar({ name }: { name?: string }) {
  const { theme, toggle } = useContext(ThemeContext)
  return (
    <div className="gc-userbar">
      <UserChip name={name} />
      <ThemeToggle theme={theme} onToggle={toggle} />
    </div>
  )
}
