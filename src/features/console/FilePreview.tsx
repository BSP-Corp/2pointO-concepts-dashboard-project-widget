import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { previewListeners } from './openFile'
import { lockBackground } from './ui'

/** Image viewer for files opened from the widget (receipts, delivery notes, tasks): the image, Print, Open in new tab */
export function FilePreview() {
  const [file, setFile] = useState<{ name: string; href: string; print: boolean } | null>(null)
  const img = useRef<HTMLImageElement>(null)
  useEffect(() => {
    previewListeners.add(setFile)
    return () => void previewListeners.remove(setFile)
  }, [])
  useEffect(() => {
    if (!file) return
    const unlock = lockBackground()
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setFile(null)
    document.addEventListener('keydown', esc)
    return () => (unlock(), document.removeEventListener('keydown', esc))
  }, [file])
  if (!file) return null
  const print = () => {
    const w = window.open('', '_blank')
    if (!w) return
    w.document.title = file.name
    const pic = w.document.createElement('img')
    pic.src = file.href
    pic.style.maxWidth = '100%'
    pic.onload = () => w.print()
    w.document.body.appendChild(pic)
  }
  return createPortal(
    <div className="gc-preview" role="dialog" aria-modal="true" aria-label={`Preview of ${file.name}`} onMouseDown={(e) => e.target === e.currentTarget && setFile(null)}>
      <div className="gc-preview__bar">
        <span className="gc-preview__name" title={file.name}>
          {file.name}
        </span>
        <button type="button" className="gc-btn gc-btn--sm" onClick={print}>
          Print
        </button>
        <a className="gc-btn gc-btn--sm" href={file.href} target="_blank" rel="noopener noreferrer">
          Open in new tab
        </a>
        <button type="button" className="gc-btn gc-btn--sm" onClick={() => setFile(null)} aria-label="Close preview">
          ×
        </button>
      </div>
      <img ref={img} className="gc-preview__img" src={file.href} alt={file.name} onLoad={() => file.print && (setFile({ ...file, print: false }), print())} />
    </div>,
    document.body,
  )
}
