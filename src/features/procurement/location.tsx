import type { Option } from '@/types/domain'

// Warehouse location colours, from the rack sheet (Pallet · Rack · Bays · Levels · Side): each label kind has its own colour,
// each bay + level band of a rack takes the next colour of the sheet, and Right / Left are the sheet's grey and black.
export const KIND_COLOURS = { rack: '#00B0F0', bay: '#604A7B', level: '#E46C0A', pallet: '#92D050' } as const
export const SIDE_COLOURS: Record<string, string> = { Right: '#7F7F7F', Left: '#262626', Top: '#595959', Bottom: '#595959' }
export const BAND_COLOURS = ['#00B0F0', '#E6B8B7', '#604A7B', '#4F81BD', '#FAC090', '#92D050', '#808080', '#DA9694', '#00CC6A', '#CDB940', '#595959', '#E46C0A', '#558ED5', '#FF0066', '#C4BD97']

/** Dark text on light colours, white on dark ones (WCAG relative luminance) */
export function inkOn(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.36 ? '#1B1931' : '#FFFFFF'
}

export interface LocationParts {
  rack?: string
  bay?: string
  level?: string
  side?: string
  pallet?: string
}

/** "R1-A-L1-Right" (Bay.Location_Path) and "P03" (pallet code) inside a free-text location label */
export function partsOf(label: string): LocationParts & { rest: string } {
  const path = /\bR([\w]+)-([A-H])-L(\d)-(Right|Left|Top|Bottom)\b/.exec(label)
  const pallet = /\bP\d{1,3}\b/.exec(label)
  let rest = label
  if (path) rest = rest.replace(path[0], '')
  if (pallet) rest = rest.replace(pallet[0], '')
  rest = rest
    .split('·')
    .map((x) => x.trim())
    .filter(Boolean)
    .join(' · ')
  return path ? { rack: path[1], bay: path[2], level: path[3], side: path[4], pallet: pallet?.[0], rest } : { pallet: pallet?.[0], rest }
}

const Chip = ({ kind, text, colour, compact }: { kind: string; text: string; colour: string; compact?: boolean }) => (
  <span className="gc-loc__chip" style={{ background: colour, color: inkOn(colour) }} title={`${kind} ${text}`}>
    {!compact && <span className="gc-loc__kind">{kind}</span>}
    {compact && kind === 'Level' ? `L${text}` : compact && kind === 'Side' ? text.charAt(0) : text}
  </span>
)

/** Rack · Bay · Level · Side · Pallet as coloured chips — the same colours wherever a location shows; compact drops the captions */
export function LocationTags({ rack, bay, level, side, pallet, empty = 'Not placed', compact }: LocationParts & { empty?: string; compact?: boolean }) {
  if (!rack && !bay && !level && !side && !pallet) return <span className="gc-small gc-soft">{empty}</span>
  return (
    <span
      className={`gc-loc ${compact ? 'gc-loc--compact' : ''}`}
      aria-label={[rack && `Rack ${rack}`, bay && `Bay ${bay}`, level && `Level ${level}`, side, pallet && `Pallet ${pallet}`].filter(Boolean).join(', ')}
    >
      {rack && <Chip kind="Rack" text={rack} colour={KIND_COLOURS.rack} compact={compact} />}
      {bay && <Chip kind="Bay" text={bay} colour={KIND_COLOURS.bay} compact={compact} />}
      {level && <Chip kind="Level" text={level} colour={KIND_COLOURS.level} compact={compact} />}
      {side && <Chip kind="Side" text={side} colour={SIDE_COLOURS[side] ?? '#595959'} compact={compact} />}
      {pallet && <Chip kind="Pallet" text={pallet} colour={KIND_COLOURS.pallet} compact={compact} />}
    </span>
  )
}

/** A stored location label (Storage.Location_Label, delivery-note locations): its rack path and pallet as chips, the rest as text */
export function LocationLabel({ label }: { label: string }) {
  const p = partsOf(label)
  if (!p.rack && !p.pallet) return <span>{label || '—'}</span>
  return (
    <span className="gc-loc-line">
      <LocationTags {...p} />
      {p.rest && <span className="gc-small gc-soft">{p.rest}</span>}
    </span>
  )
}

/** Pallet positions of one rack, grouped like the rack sheet: one coloured band per bay + level, its pallets side by side */
export function bandsOf(pallets: Option[]) {
  const order = (o: Option) => `${o.bay ?? ''}|${(o.level ?? '').padStart(2, '0')}`
  const bands = new Map<string, Option[]>()
  for (const p of [...pallets].sort((a, b) => order(a).localeCompare(order(b)) || Number(a.side === 'Left') - Number(b.side === 'Left'))) {
    const k = order(p)
    bands.set(k, [...(bands.get(k) ?? []), p])
  }
  return [...bands.values()].map((list, i) => ({ bay: list[0].bay ?? '', level: list[0].level ?? '', colour: BAND_COLOURS[i % BAND_COLOURS.length], pallets: list }))
}

/**
 * Pallet picker of a rack (form Bay: one pallet position per record). Each bay + level is a band in the sheet's colour, with
 * its Right / Left pallets; a pallet shows its code and free space and cannot be picked when blocked, without capacity or full.
 */
export function RackPicker({
  rackCode,
  pallets,
  value,
  need,
  taken,
  onPick,
  label,
}: {
  rackCode: string
  pallets: Option[]
  value: string
  /** Units this location needs */
  need: number
  /** Pallets already used by another location of this receipt */
  taken: string[]
  onPick: (id: string) => void
  label: string
}) {
  if (!pallets.length) return <p className="gc-small gc-soft">No pallet positions on this rack — add them in Creator → Warehouse Racks.</p>
  return (
    <div className="gc-rack" role="radiogroup" aria-label={label}>
      <div className="gc-rack__head" aria-hidden="true">
        <span>Rack</span>
        <span>Bay</span>
        <span>Level</span>
        <span>Pallets (side · free)</span>
      </div>
      {bandsOf(pallets).map((band) => (
        <div className="gc-rack__band" key={`${band.bay}-${band.level}`} style={{ ['--band' as string]: band.colour, ['--band-ink' as string]: inkOn(band.colour) }}>
          <span className="gc-rack__cell">{rackCode}</span>
          <span className="gc-rack__cell">{band.bay || '—'}</span>
          <span className="gc-rack__cell">{band.level || '—'}</span>
          <span className="gc-rack__pallets">
            {band.pallets.map((p) => {
              const capacity = p.capacity ?? 0
              const free = p.free ?? 0
              const why = p.active === false ? 'Blocked' : !(capacity > 0) ? 'No capacity set' : taken.includes(p.id) ? 'Used by another location' : need > free ? `Only ${free} free` : ''
              const on = p.id === value
              return (
                <button
                  type="button"
                  role="radio"
                  aria-checked={on}
                  key={p.id}
                  className={`gc-rack__pallet ${on ? 'is-on' : ''}`}
                  disabled={!!why && !on}
                  title={[p.path || p.label, `${free} free of ${capacity}`, why].filter(Boolean).join(' · ')}
                  onClick={() => onPick(on ? '' : p.id)}
                  style={{ ['--side' as string]: SIDE_COLOURS[p.side ?? ''] ?? '#595959' }}
                >
                  {p.side && <span className="gc-rack__side">{p.side}</span>}
                  <strong>{p.pallet || p.label}</strong>
                  <small>{why || `${free} free`}</small>
                </button>
              )
            })}
          </span>
        </div>
      ))}
    </div>
  )
}
