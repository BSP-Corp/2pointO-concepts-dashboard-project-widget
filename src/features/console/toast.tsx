import { useEffect, useState } from 'react'

// Save confirmations and errors — one live region at the top centre of the widget: a short title ("Purchase Receive created")
// and, when it matters, one line of detail. Success and warnings stay 4 s, errors 6 s; × closes one sooner.
type Tone = 'ok' | 'warn' | 'error'
type Toast = { id: number; text: string; detail?: string; tone: Tone }
let listeners: ((t: Toast) => void)[] = []
let next = 0
const STAY: Record<Tone, number> = { ok: 4000, warn: 4000, error: 6000 }
const ICON: Record<Tone, string> = { ok: '✓', warn: '!', error: '×' }

export function toast(text: string, tone: Tone = 'ok', detail?: string) {
  const t = { id: ++next, text, detail, tone }
  listeners.forEach((l) => l(t))
}

export function Toaster() {
  const [items, setItems] = useState<Toast[]>([])
  useEffect(() => {
    const add = (t: Toast) => {
      // the same message already showing is not shown twice
      setItems((s) => [...s.filter((x) => x.text !== t.text || x.tone !== t.tone).slice(-2), t])
      setTimeout(() => setItems((s) => s.filter((x) => x.id !== t.id)), STAY[t.tone])
    }
    listeners.push(add)
    return () => {
      listeners = listeners.filter((l) => l !== add)
    }
  }, [])
  return (
    <div className="gc-toasts" role="status" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className={`gc-toast gc-toast--${t.tone}`} style={{ ['--gc-toast-stay' as string]: `${STAY[t.tone]}ms` }}>
          <span className="gc-toast__icon" aria-hidden="true">
            {ICON[t.tone]}
          </span>
          <span className="gc-toast__body">
            <strong>{t.text}</strong>
            {t.detail && <small>{t.detail}</small>}
          </span>
          <button type="button" className="gc-toast__close" aria-label="Close" onClick={() => setItems((s) => s.filter((x) => x.id !== t.id))}>
            ×
          </button>
        </div>
      ))}
    </div>
  )
}
