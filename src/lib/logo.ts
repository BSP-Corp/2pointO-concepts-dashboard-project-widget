import type { PdfImage } from './pdf'

// Company logo for printed documents: drop the file in as src/assets/company-logo.png (or .jpg / .jpeg / .svg / .webp)
// and rebuild. Without it the documents print the company name instead.
const files = import.meta.glob('/src/assets/company-logo.{png,jpg,jpeg,svg,webp}', { eager: true, query: '?url', import: 'default' }) as Record<string, string>
export const LOGO_URL = Object.values(files)[0] ?? ''

/** The logo as a JPEG on white (transparent parts turn white), at most `maxPx` pixels on its long side */
export async function loadLogo(maxPx = 600): Promise<PdfImage | null> {
  if (!LOGO_URL) return null
  try {
    const img = new Image()
    img.src = LOGO_URL
    await img.decode()
    const scale = Math.min(1, maxPx / Math.max(img.naturalWidth, img.naturalHeight))
    const width = Math.max(1, Math.round(img.naturalWidth * scale))
    const height = Math.max(1, Math.round(img.naturalHeight * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, width, height)
    ctx.drawImage(img, 0, 0, width, height)
    return { data: atob(canvas.toDataURL('image/jpeg', 0.92).split(',')[1]), width, height }
  } catch {
    return null
  }
}
