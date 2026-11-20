import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Currency fields in the .ds are of type AED; amounts use Indian digit grouping (1,25,76,000) as specified.
const money = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 })
/** Project currency (Creator Currency name such as "UAE Dirham" or a code) → ISO code; AED when not set */
export const currencyCode = (c?: string | null) => {
  const v = (c ?? '').trim()
  if (/^[A-Z]{3}$/.test(v)) return v
  if (/riyal|saudi|\bSAR\b/i.test(v)) return 'SAR'
  if (/dollar|\bUSD\b/i.test(v)) return 'USD'
  if (/euro|\bEUR\b/i.test(v)) return 'EUR'
  return 'AED'
}
/** "AED 1,25,76,000" (or the project's currency); null / NaN → "—" */
export const formatMoney = (n: number | null | undefined, currency?: string | null) => (n == null || !Number.isFinite(n) ? '—' : `${currencyCode(currency)} ${money.format(Math.round(n))}`)
/** Units of each currency per 1 USD — the same fixed rates as Widget.get_cost_analysis / get_work_packages in Creator */
export const USD_RATES: Record<string, number> = { USD: 1, AED: 3.6725, SAR: 3.75, BHD: 0.376, OMR: 0.3845, QAR: 3.64, KWD: 0.307 }
/** Amount in the project currency → USD (null when the currency has no rate) */
export const toUsd = (n: number, currency?: string | null) => {
  const rate = USD_RATES[currencyCode(currency)]
  return rate ? n / rate : null
}
const usd = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })
export const formatUsd = (n: number | null) => (n == null || !Number.isFinite(n) ? '—' : `USD ${usd.format(Math.round(n))}`)
const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 })
export const formatCompact = (n: number) => compact.format(n)
const qty = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 })
export const formatQty = (n: number | null | undefined) => (n == null || !Number.isFinite(n) ? '—' : qty.format(n))
/** 0–1 ratio → "42%"; null → "—" (no divide-by-zero NaN) */
export const formatPct = (r: number | null | undefined) => (r == null || !Number.isFinite(r) ? '—' : `${Math.round(r * 100)}%`)
/** "—" for empty / null values */
export const dash = (v: unknown) => (v == null || v === '' || v === 'null' ? '—' : String(v))

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
/** ISO yyyy-mm-dd → DD MMM YYYY; empty or invalid → "—" */
export const formatDate = (iso: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '')
  return m ? `${m[3]} ${MONTHS[Number(m[2]) - 1]} ${m[1]}` : '—'
}

export const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0)

/** Today as ISO yyyy-mm-dd (UTC), for due-date and warranty comparisons. */
export const todayIso = () => new Date().toISOString().slice(0, 10)
export const addDaysIso = (iso: string, days: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10)

/** Counts per label, largest first; '' is reported as `emptyLabel`. */
export function countBy<T>(rows: T[], get: (r: T) => string, emptyLabel = 'Not set'): { label: string; value: number }[] {
  const m = new Map<string, number>()
  for (const r of rows) {
    const k = get(r).trim() || emptyLabel
    m.set(k, (m.get(k) ?? 0) + 1)
  }
  return [...m].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value)
}

/** localStorage that never throws (private mode, blocked storage, sandboxed iframes). */
export const storage = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(key)
    } catch {
      return null
    }
  },
  set(key: string, value: string | null) {
    try {
      if (value === null) localStorage.removeItem(key)
      else localStorage.setItem(key, value)
    } catch {
      /* ignore */
    }
  },
}

/** Status names compared without case, extra spaces or emoji ("Ordered  ⏳" = "ordered"). */
export const statusKey = (s: string) =>
  s
    .replace(/[^\p{L}\p{N}&/.\- ]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()

/** Orders options by a static status order; names not in the order keep their place after the known ones. */
export function sortByOrder<T extends { label: string }>(options: T[], order: string[]): T[] {
  const pos = new Map(order.map((n, i) => [statusKey(n), i]))
  return [...options].sort((a, b) => (pos.get(statusKey(a.label)) ?? order.length) - (pos.get(statusKey(b.label)) ?? order.length))
}
