import { useEffect, useState } from 'react'

// Small save confirmations ("Task updated") — one live region at the bottom of the widget, gone after a few seconds.
type Toast = { id: number; text: string; tone: 'ok' | 'error' }
let listeners: ((t: Toast) => void)[] = []
let next = 0

export function toast(text: string, tone: Toast['tone'] = 'ok') {
  const t = { id: ++next, text, tone }
  listeners.forEach((l) => l(t))
}

export function Toaster() {
  const [items, setItems] = useState<Toast[]>([])
  useEffect(() => {
    const add = (t: Toast) => {
      setItems((s) => [...s.slice(-2), t])
      setTimeout(() => setItems((s) => s.filter((x) => x.id !== t.id)), t.tone === 'error' ? 6000 : 2600)
    }
    listeners.push(add)
    return () => {
      listeners = listeners.filter((l) => l !== add)
    }
  }, [])
  return (
    <div className="gc-toasts" role="status" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className={`gc-toast gc-toast--${t.tone}`}>
          <span aria-hidden="true">{t.tone === 'ok' ? '✓' : '!'}</span>
          {t.text}
        </div>
      ))}
    </div>
  )
}
