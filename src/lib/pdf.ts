// Minimal PDF writer (A4, Helvetica / Helvetica-Bold, text, lines and JPEG images) — enough for printable documents such as
// a delivery note, with no library. Coordinates are in points from the top-left; text is Latin-1 (other characters print as "?").

export const A4 = { width: 595.28, height: 841.89 }

/** A JPEG: its bytes as a binary (Latin-1) string and its pixel size */
export interface PdfImage {
  data: string
  width: number
  height: number
}

type Op =
  | { kind: 'text'; x: number; y: number; size: number; bold: boolean; text: string }
  | { kind: 'line'; x1: number; y1: number; x2: number; y2: number; width: number }
  | { kind: 'image'; x: number; y: number; w: number; h: number; img: PdfImage }

const latin1 = (s: string) =>
  s
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...')
    .replace(/·/g, '·')
    .replace(/[^\x20-\xFF]/g, '?')
const escape = (s: string) => latin1(s).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')

/** Rough Helvetica width (points) — used to wrap and right-align text */
export const textWidth = (s: string, size: number, bold = false) => [...s].reduce((w, ch) => w + (/[il.,:;|'!]/.test(ch) ? 0.28 : /[mwMW@]/.test(ch) ? 0.85 : /[A-Z0-9]/.test(ch) ? 0.64 : ch === ' ' ? 0.28 : 0.52), 0) * size * (bold ? 1.06 : 1)

/** Splits text into lines no wider than `width` points */
export function wrap(text: string, width: number, size: number, bold = false): string[] {
  const out: string[] = []
  for (const para of (text || '').split(/\r?\n/)) {
    let line = ''
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word
      if (textWidth(next, size, bold) <= width || !line) line = next
      else (out.push(line), (line = word))
    }
    out.push(line)
  }
  return out
}

export class PdfDoc {
  private pages: Op[][] = [[]]
  private get page() {
    return this.pages[this.pages.length - 1]
  }
  addPage() {
    this.pages.push([])
  }
  text(x: number, y: number, text: string, size = 10, bold = false) {
    this.page.push({ kind: 'text', x, y, size, bold, text })
  }
  textRight(right: number, y: number, text: string, size = 10, bold = false) {
    this.text(right - textWidth(text, size, bold), y, text, size, bold)
  }
  line(x1: number, y1: number, x2: number, y2: number, width = 0.6) {
    this.page.push({ kind: 'line', x1, y1, x2, y2, width })
  }
  /** Image with its top-left corner at (x, y), w × h points */
  image(x: number, y: number, w: number, h: number, img: PdfImage) {
    this.page.push({ kind: 'image', x, y, w, h, img })
  }

  /** The finished file */
  toBlob(): Blob {
    const H = A4.height
    const objects: string[] = []
    const add = (body: string) => objects.push(body) // object number = index + 1
    add('<< /Type /Catalog /Pages 2 0 R >>')
    add('') // pages, filled below
    add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>')
    add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>')
    const images: PdfImage[] = []
    const imageObj = new Map<PdfImage, number>()
    for (const ops of this.pages)
      for (const o of ops)
        if (o.kind === 'image' && !imageObj.has(o.img)) {
          add(`<< /Type /XObject /Subtype /Image /Width ${o.img.width} /Height ${o.img.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${o.img.data.length} >>\nstream\n${o.img.data}\nendstream`)
          imageObj.set(o.img, objects.length)
          images.push(o.img)
        }
    const xobjects = images.length ? ` /XObject << ${images.map((img, i) => `/Im${i + 1} ${imageObj.get(img)} 0 R`).join(' ')} >>` : ''
    const kids: number[] = []
    for (const ops of this.pages) {
      const stream = ops
        .map((o) =>
          o.kind === 'text'
            ? `BT /${o.bold ? 'F2' : 'F1'} ${o.size} Tf ${o.x.toFixed(2)} ${(H - o.y).toFixed(2)} Td (${escape(o.text)}) Tj ET`
            : o.kind === 'image'
              ? `q ${o.w.toFixed(2)} 0 0 ${o.h.toFixed(2)} ${o.x.toFixed(2)} ${(H - o.y - o.h).toFixed(2)} cm /Im${images.indexOf(o.img) + 1} Do Q`
              : `${o.width} w ${o.x1.toFixed(2)} ${(H - o.y1).toFixed(2)} m ${o.x2.toFixed(2)} ${(H - o.y2).toFixed(2)} l S`,
        )
        .join('\n')
      add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`)
      const content = objects.length
      add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${A4.width} ${A4.height}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >>${xobjects} >> /Contents ${content} 0 R >>`)
      kids.push(objects.length)
    }
    objects[1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>`
    let out = '%PDF-1.4\n'
    const offsets: number[] = []
    objects.forEach((body, i) => {
      offsets.push(out.length)
      out += `${i + 1} 0 obj\n${body}\nendobj\n`
    })
    const xref = out.length
    out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`
    out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`
    const bytes = new Uint8Array(out.length)
    for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 0xff
    return new Blob([bytes], { type: 'application/pdf' })
  }
}

/** Saves a file through a temporary link */
export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
