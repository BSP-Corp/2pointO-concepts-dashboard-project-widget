import { toast } from './toast'

const TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  jfif: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  svg: 'image/svg+xml',
  heic: 'image/heic',
  heif: 'image/heif',
  pdf: 'application/pdf',
  txt: 'text/plain',
  csv: 'text/csv',
}
const ext = (name: string) => (/\.([a-z0-9]{1,5})$/i.exec(name)?.[1] ?? '').toLowerCase()
/** Images the browser can draw (HEIC / HEIF only in Safari, so they open in a new tab like other files) */
const VIEWABLE_IMAGE = /^image\/(jpeg|png|gif|webp|bmp|svg\+xml)$/
/** What a browser tab can show; anything else (Excel, Word, CSV, zip…) is downloaded under its own name */
const VIEWABLE = /^(image\/|application\/pdf$|text\/plain$)/
/** File name without Creator's upload prefix ("1794298271719850_report.xlsx" → "report.xlsx") */
const plainName = (name: string) => name.replace(/^\d{10,}_/, '')
/** The browser can show (and print) this file — else it is downloaded */
export const canView = (name: string) => VIEWABLE.test(TYPES[ext(name)] ?? '')

function download(href: string, name: string) {
  const a = document.createElement('a')
  a.href = href
  a.download = plainName(name)
  document.body.appendChild(a)
  a.click()
  a.remove()
}

/** What Creator's readFile gives back (Blob, ArrayBuffer, bytes, base64 / data: URL text, or any of these in { data }) as a Blob typed from the file name */
export function fileBlob(res: unknown, name: string): Blob | null {
  const raw = res && typeof res === 'object' && 'data' in res && !(res instanceof Blob) ? (res as { data: unknown }).data : res
  const blob = raw instanceof Blob ? raw : raw instanceof ArrayBuffer ? new Blob([raw]) : ArrayBuffer.isView(raw) ? new Blob([raw as Uint8Array]) : typeof raw === 'string' ? textBlob(raw) : null
  if (!blob) return null
  // Creator sends files untyped (or as text): type them from the name — unknown kinds stay a plain binary download
  const type = TYPES[ext(name)] ?? 'application/octet-stream'
  return blob.type !== type ? new Blob([blob], { type }) : blob
}

/** A data: URL or base64 text from readFile as a Blob (other text is not a file) */
function textBlob(text: string): Blob | null {
  const m = /^data:([^;,]*)(;base64)?,(.*)$/s.exec(text)
  const b64 = m ? (m[2] ? m[3] : '') : /^[A-Za-z0-9+/=\s]{16,}$/.test(text) ? text : ''
  if (m && !m[2]) return new Blob([decodeURIComponent(m[3])], { type: m[1] })
  if (!b64) return null
  try {
    const bin = atob(b64.replace(/\s/g, ''))
    return new Blob([Uint8Array.from(bin, (c) => c.charCodeAt(0))])
  } catch {
    return null
  }
}

type Preview = { name: string; href: string; print: boolean }
let listeners: ((p: Preview | null) => void)[] = []
/** The image viewer (FilePreview in ConsoleApp) listens here */
export const previewListeners = {
  add: (l: (p: Preview | null) => void) => listeners.push(l),
  remove: (l: (p: Preview | null) => void) => (listeners = listeners.filter((x) => x !== l)),
}

/**
 * Opens a file: an image shows in the widget's viewer (Print and Open in new tab there); other files open in a new tab
 * to view, or print from there; files the browser cannot show are downloaded.
 */
export async function openFile(read: () => Promise<Blob | null>, url: string, name: string, print: boolean) {
  const image = VIEWABLE_IMAGE.test(TYPES[ext(name)] ?? '')
  const viewable = VIEWABLE.test(TYPES[ext(name)] ?? '')
  const tab = (image && listeners.length) || !viewable ? null : window.open('', '_blank')
  try {
    const raw = await read()
    const blob = raw ? fileBlob(raw, name) : null
    const href = blob ? URL.createObjectURL(blob) : url
    if (!href) throw new Error('Creator gave no link for this file')
    if (image && blob && listeners.length) {
      listeners.forEach((l) => l({ name, href, print }))
      return
    }
    if (!viewable) {
      download(href, name)
      if (print) toast('Downloaded', 'ok', `${plainName(name)} cannot be printed from the browser — open it in its app to print`)
      return
    }
    if (!tab) {
      window.open(href, '_blank')
      return
    }
    tab.location.href = href
    if (print && blob) tab.addEventListener('load', () => tab.print(), { once: true })
  } catch (e) {
    tab?.close()
    toast('File not opened', 'error', `${name}: ${(e as Error).message}`)
  }
}
