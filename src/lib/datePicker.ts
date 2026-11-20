/**
 * The widget's own calendar for every <input type="date">: a click anywhere in the field opens it (the browser's picker
 * is blocked inside Creator's cross-origin frame and cannot be styled). Picking a day sets the field exactly as typing
 * would (input + change events), so React forms and the inline date cells save as before. Min / max are respected;
 * typing a date still works. One listener for the whole widget.
 */
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const DAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']
/** What the calendar shows: the days of a month, the months of a year, or a block of 12 years */
type Mode = 'days' | 'months' | 'years'
const pad = (n: number) => String(n).padStart(2, '0')
const iso = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`
const todayIso = () => {
  const t = new Date()
  return iso(t.getFullYear(), t.getMonth(), t.getDate())
}

/** Sets the field's value as the user would: React sees the change, native "change" listeners fire. */
function setValue(el: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  if (setter) setter.call(el, value)
  else el.value = value
  el.dispatchEvent(new Event('input', { bubbles: true }))
  el.dispatchEvent(new Event('change', { bubbles: true }))
}

export function installDatePickerOpen(doc: Document = document) {
  let pop: HTMLDivElement | null = null
  let target: HTMLInputElement | null = null
  /** What the calendar sits under: the field itself, or the DateInput button that shows it */
  let anchor: HTMLElement | null = null
  let view = { y: 0, m: 0 }
  let mode: Mode = 'days'

  const onFocusOut = () => setTimeout(() => target && doc.activeElement !== target && close(), 0)
  const close = () => {
    pop?.remove()
    pop = null
    target?.removeEventListener('focusout', onFocusOut)
    target = null
    anchor = null
  }

  const place = () => {
    if (!pop || !target) return
    const r = (anchor ?? target).getBoundingClientRect()
    const w = pop.offsetWidth || 304
    const h = pop.offsetHeight || 320
    const vw = doc.documentElement.clientWidth || window.innerWidth
    const vh = doc.documentElement.clientHeight || window.innerHeight
    const below = r.bottom + 6 + h <= vh || r.top - 6 - h < 0
    pop.style.top = `${Math.max(4, below ? r.bottom + 6 : r.top - 6 - h)}px`
    pop.style.left = `${Math.max(4, Math.min(r.left, vw - w - 4))}px`
  }

  const render = () => {
    if (!pop || !target) return
    const el = target
    const value = el.value
    const min = el.min || ''
    const max = el.max || ''
    const today = todayIso()
    const todayOff = (min && today < min) || (max && today > max)
    const head = (title: string, label: string, prev: string, next: string) => `
      <div class="gc-cal__head">
        <button type="button" tabindex="-1" class="gc-cal__nav" data-step="-1" aria-label="${prev}">‹</button>
        <button type="button" tabindex="-1" class="gc-cal__title" data-zoom="1" aria-label="${label}">${title}<span aria-hidden="true">▾</span></button>
        <button type="button" tabindex="-1" class="gc-cal__nav" data-step="1" aria-label="${next}">›</button>
      </div>`
    if (mode === 'months') {
      const cur = value ? Number(value.slice(0, 4)) * 12 + Number(value.slice(5, 7)) - 1 : -1
      pop.innerHTML = `${head(String(view.y), `Year ${view.y}: choose another year`, 'Previous year', 'Next year')}
      <div class="gc-cal__picks">${MONTHS.map((n, i) => {
        const on = cur === view.y * 12 + i
        const off = (min && `${iso(view.y, i, 1).slice(0, 7)}-31` < min) || (max && iso(view.y, i, 1) > max)
        return `<button type="button" tabindex="-1" class="gc-cal__pick${on ? ' is-on' : ''}" data-month="${i}" aria-label="${n} ${view.y}"${on ? ' aria-pressed="true"' : ''}${off ? ' disabled' : ''}>${n.slice(0, 3)}</button>`
      }).join('')}</div>`
      return place()
    }
    if (mode === 'years') {
      const first = view.y - (view.y % 12)
      const cur = value ? Number(value.slice(0, 4)) : -1
      const picks: string[] = []
      for (let y = first; y < first + 12; y++) {
        const off = (min && `${y}-12-31` < min) || (max && `${y}-01-01` > max)
        picks.push(
          `<button type="button" tabindex="-1" class="gc-cal__pick${y === cur ? ' is-on' : ''}" data-year="${y}"${y === cur ? ' aria-pressed="true"' : ''}${off ? ' disabled' : ''}>${y}</button>`,
        )
      }
      pop.innerHTML = `${head(`${first} – ${first + 11}`, 'Years', 'Previous 12 years', 'Next 12 years')}<div class="gc-cal__picks">${picks.join('')}</div>`
      return place()
    }
    const lead = (new Date(Date.UTC(view.y, view.m, 1)).getUTCDay() + 6) % 7
    const days = new Date(Date.UTC(view.y, view.m + 1, 0)).getUTCDate()
    const cells: string[] = []
    for (let i = 0; i < lead; i++) cells.push('<span class="gc-cal__pad"></span>')
    for (let d = 1; d <= days; d++) {
      const v = iso(view.y, view.m, d)
      const off = (min && v < min) || (max && v > max)
      const cls = ['gc-cal__day', v === value ? 'is-on' : '', v === today ? 'is-today' : ''].filter(Boolean).join(' ')
      cells.push(
        `<button type="button" tabindex="-1" class="${cls}" data-day="${v}" aria-label="${d} ${MONTHS[view.m]} ${view.y}"${v === value ? ' aria-pressed="true"' : ''}${off ? ' disabled' : ''}>${d}</button>`,
      )
    }
    pop.innerHTML = `${head(`${MONTHS[view.m]} ${view.y}`, `${MONTHS[view.m]} ${view.y}: choose month and year`, 'Previous month', 'Next month')}
      <div class="gc-cal__grid">${DAYS.map((d) => `<span class="gc-cal__dow">${d}</span>`).join('')}${cells.join('')}</div>
      <div class="gc-cal__foot">
        ${el.required ? '<span></span>' : '<button type="button" tabindex="-1" class="gc-cal__link" data-clear="1">Clear</button>'}
        <button type="button" tabindex="-1" class="gc-cal__link" data-day="${today}"${todayOff ? ' disabled' : ''}>Today</button>
      </div>`
    place()
  }

  const open = (el: HTMLInputElement, at: HTMLElement = el) => {
    if (target === el && pop) return
    close()
    target = el
    anchor = at
    const base = el.value || (el.min && todayIso() < el.min ? el.min : todayIso())
    view = { y: Number(base.slice(0, 4)), m: Number(base.slice(5, 7)) - 1 }
    mode = 'days'
    pop = doc.createElement('div')
    pop.className = 'gc-cal'
    pop.setAttribute('role', 'dialog')
    pop.setAttribute('aria-label', `Choose date${el.getAttribute('aria-label') ? `: ${el.getAttribute('aria-label')}` : ''}`)
    // keep the focus in the field (inline date cells close when it leaves); month and year are picked inside the
    // calendar, not in native lists (those open behind the popup inside Creator's frame)
    pop.addEventListener('mousedown', (e) => e.preventDefault())
    pop.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button')
      if (!b || !target || b.disabled) return
      if (b.dataset.step) {
        const step = Number(b.dataset.step)
        if (mode === 'days') {
          const d = new Date(Date.UTC(view.y, view.m + step, 1))
          view = { y: d.getUTCFullYear(), m: d.getUTCMonth() }
        } else view = { ...view, y: view.y + step * (mode === 'years' ? 12 : 1) }
        return render()
      }
      if (b.dataset.zoom) {
        mode = mode === 'days' ? 'months' : 'years'
        return render()
      }
      if (b.dataset.year) {
        view = { ...view, y: Number(b.dataset.year) }
        mode = 'months'
        return render()
      }
      if (b.dataset.month) {
        view = { ...view, m: Number(b.dataset.month) }
        mode = 'days'
        return render()
      }
      const field = target
      const next = b.dataset.clear ? '' : b.dataset.day
      if (next === undefined) return
      const back = anchor
      close()
      ;(back ?? field).focus()
      setValue(field, next)
    })
    doc.body.append(pop)
    if (at === el) el.addEventListener('focusout', onFocusOut)
    render()
  }

  const onClick = (e: MouseEvent) => {
    const el = e.target
    const trigger = el instanceof Element ? el.closest<HTMLButtonElement>('button[data-date-for]') : null
    if (trigger) {
      const field = doc.getElementById(trigger.dataset.dateFor ?? '')
      if (field instanceof HTMLInputElement && !trigger.disabled && !field.disabled) {
        e.preventDefault()
        if (target === field && pop) close()
        else open(field, trigger)
      }
      return
    }
    if (el instanceof HTMLInputElement && el.type === 'date' && !el.disabled && !el.readOnly) {
      e.preventDefault()
      open(el)
    } else if (pop && !(el instanceof Node && pop.contains(el))) close()
  }
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && pop) {
      e.stopPropagation() // closes the calendar only, not the form or dialog behind it
      close()
    } else if (pop && target && e.target === target) setTimeout(render, 0)
  }
  const onMove = () => (pop && target && !(anchor ?? target).isConnected ? close() : place())

  doc.addEventListener('click', onClick, true)
  doc.addEventListener('keydown', onKey, true)
  window.addEventListener('resize', onMove)
  doc.addEventListener('scroll', onMove, true)
  return () => {
    close()
    doc.removeEventListener('click', onClick, true)
    doc.removeEventListener('keydown', onKey, true)
    window.removeEventListener('resize', onMove)
    doc.removeEventListener('scroll', onMove, true)
  }
}
