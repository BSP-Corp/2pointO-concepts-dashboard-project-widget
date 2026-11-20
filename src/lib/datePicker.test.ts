import { describe, expect, it, vi } from 'vitest'
import { installDatePickerOpen } from './datePicker'

const field = (attrs: { value?: string; min?: string; disabled?: boolean } = {}) => {
  const el = document.createElement('input')
  el.type = 'date'
  el.setAttribute('aria-label', 'Start date')
  if (attrs.value) el.value = attrs.value
  if (attrs.min) el.min = attrs.min
  el.disabled = !!attrs.disabled
  document.body.append(el)
  return el
}

describe('date fields', () => {
  it('open the widget calendar on a click anywhere in the field; a picked day sets the field and fires change', () => {
    const off = installDatePickerOpen()
    const el = field({ value: '2026-11-11', min: '2026-11-05' })
    const change = vi.fn()
    el.addEventListener('change', change)
    el.click()
    const cal = document.querySelector('[role="dialog"][aria-label="Choose date: Start date"]')!
    expect(cal).not.toBeNull()
    expect(cal.querySelector('.gc-cal__title')).toHaveTextContent('November 2026')
    expect(cal.querySelector('[aria-pressed="true"]')).toHaveTextContent('11')
    expect(cal.querySelector<HTMLButtonElement>('[data-day="2026-11-04"]')!.disabled).toBe(true) // before min
    cal.querySelector<HTMLButtonElement>('[aria-label="Next month"]')!.click()
    expect(document.querySelector('.gc-cal__title')).toHaveTextContent('December 2026')
    document.querySelector<HTMLButtonElement>('[data-day="2026-12-20"]')!.click()
    expect(el.value).toBe('2026-12-20')
    expect(change).toHaveBeenCalledTimes(1)
    expect(document.querySelector('.gc-cal')).toBeNull()
    el.remove()
    off()
  })

  it('picks month and year inside the calendar (no native lists)', () => {
    const off = installDatePickerOpen()
    const el = field({ value: '2026-11-11' })
    el.click()
    expect(document.querySelector('.gc-cal select')).toBeNull()
    document.querySelector<HTMLButtonElement>('.gc-cal__title')!.click()
    document.querySelector<HTMLButtonElement>('.gc-cal__title')!.click()
    expect(document.querySelector('.gc-cal__title')).toHaveTextContent('2016 – 2027')
    document.querySelector<HTMLButtonElement>('[data-year="2024"]')!.click()
    document.querySelector<HTMLButtonElement>('[aria-label="March 2024"]')!.click()
    expect(document.querySelector('.gc-cal__title')).toHaveTextContent('March 2024')
    document.querySelector<HTMLButtonElement>('[data-day="2024-03-05"]')!.click()
    expect(el.value).toBe('2024-03-05')
    el.remove()
    off()
  })

  it('stays closed on disabled fields and closes on Escape', () => {
    const off = installDatePickerOpen()
    const dis = field({ disabled: true })
    dis.click()
    expect(document.querySelector('.gc-cal')).toBeNull()
    const el = field()
    el.click()
    expect(document.querySelector('.gc-cal')).not.toBeNull()
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(document.querySelector('.gc-cal')).toBeNull()
    dis.remove()
    el.remove()
    off()
  })
})
