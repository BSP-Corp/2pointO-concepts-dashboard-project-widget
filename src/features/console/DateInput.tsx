import { useId, type InputHTMLAttributes } from 'react'
import { formatDate } from '@/lib/utils'

/**
 * Date field shown as the milestone dates are: the date as text ("02 May 2026") with a calendar icon; a click anywhere
 * opens the widget's calendar (lib/datePicker.ts). It takes the same props as <input type="date"> — the value lives in a
 * hidden date input (labels, forms and onChange work as before), the visible part is a button.
 */
export function DateInput({ id, className, disabled, value, ...rest }: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>) {
  const auto = useId()
  const inputId = id ?? `gc-date-${auto.replace(/:/g, '')}`
  const v = typeof value === 'string' ? value : ''
  const label = rest['aria-label']
  return (
    <span className={`gc-dateinput ${className ?? ''} ${disabled ? 'is-disabled' : ''}`}>
      <input {...rest} id={inputId} type="date" value={v} disabled={disabled} className="gc-dateinput__native" tabIndex={-1} />
      <button
        type="button"
        className="gc-dateinput__btn"
        data-date-for={inputId}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-label={`${label ? `${label}: ` : ''}${v ? formatDate(v) : 'no date'} — choose date`}
      >
        {v ? formatDate(v) : <span className="gc-dateinput__ph">Select date</span>}
      </button>
    </span>
  )
}
