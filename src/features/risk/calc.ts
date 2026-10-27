// Risk scoring, as in the workbook's "Risk Escalation Matrix" and "Risk Dashboard" sheets.
// Score = probability score × impact score (1–25); severity = matrix cell (probability row × impact column).
import type { Risk } from '@/types/domain'

export const PROBABILITIES = ['Very High', 'High', 'Medium', 'Low', 'Very Low'] as const
export const IMPACTS = ['Negligible', 'Minor', 'Moderate', 'Significant', 'Severe'] as const
export const SEVERITIES = ['Very Low', 'Low', 'Medium', 'High', 'Critical'] as const
export const RISK_STATUSES = ['Not Started', 'In-Progress', 'Complete'] as const
export const STRATEGIES = ['Avoid', 'Accept', 'Mitigate', 'Transfer', 'Escalate'] as const
export const PRIORITIES = ['High', 'Medium', 'Low'] as const

const PROBABILITY_SCORE: Record<string, number> = { 'Very High': 5, High: 4, Medium: 3, Low: 2, 'Very Low': 1 }
const IMPACT_SCORE: Record<string, number> = { Severe: 5, Significant: 4, Moderate: 3, Minor: 2, Negligible: 1 }

/** Rows = PROBABILITIES order, columns = IMPACTS order (Negligible → Severe). */
export const SEVERITY_MATRIX: Record<string, readonly string[]> = {
  'Very High': ['Medium', 'High', 'High', 'Critical', 'Critical'],
  High: ['Low', 'Medium', 'High', 'Critical', 'Critical'],
  Medium: ['Low', 'Medium', 'Medium', 'High', 'Critical'],
  Low: ['Very Low', 'Low', 'Medium', 'High', 'High'],
  'Very Low': ['Very Low', 'Low', 'Low', 'Medium', 'High'],
}

export function riskScore(probability: string, impact: string): number {
  return (PROBABILITY_SCORE[probability] ?? 0) * (IMPACT_SCORE[impact] ?? 0)
}

export function riskSeverity(probability: string, impact: string): string {
  const col = IMPACTS.indexOf(impact as (typeof IMPACTS)[number])
  return (col >= 0 && SEVERITY_MATRIX[probability]?.[col]) || ''
}

/** Calculated from Probability × Impact (never entered by hand); the stored value is only a fallback. */
export const scoreOf = (r: Risk) => riskScore(r.probability, r.impact) || r.storedScore
export const severityOf = (r: Risk) => riskSeverity(r.probability, r.impact) || r.storedSeverity
/** Risk_Status (Status form, Modules "Project Risk"): complete when the name says Complete / Closed. */
export const isComplete = (r: Risk) => /complete|closed/i.test(r.status)
/** The stored severity / score on the record differ from the calculation (shown as a data issue). */
export const storedMismatch = (r: Risk) =>
  (!!r.storedSeverity && !!severityOf(r) && r.storedSeverity !== severityOf(r)) || (r.storedScore > 0 && r.storedScore !== riskScore(r.probability, r.impact))

export interface RiskSummary {
  total: number
  active: number
  /** Open risks with Critical severity */
  critical: number
  completed: number
  /** Risk Dashboard "Average Risk Score": average of the open (not Complete) risks' scores, 1 decimal, out of 25 */
  averageScore: number
  /** heat[probability][impact] = number of risks */
  heat: Record<string, Record<string, number>>
}

export function summarizeRisks(risks: Risk[]): RiskSummary {
  const scored = risks.filter((r) => !isComplete(r)).map(scoreOf).filter((s) => s > 0)
  const heat: Record<string, Record<string, number>> = {}
  for (const p of PROBABILITIES) heat[p] = Object.fromEntries(IMPACTS.map((i) => [i, 0]))
  for (const r of risks) if (heat[r.probability] && r.impact in heat[r.probability]) heat[r.probability][r.impact]++
  return {
    total: risks.length,
    active: risks.filter((r) => !isComplete(r)).length,
    critical: risks.filter((r) => !isComplete(r) && severityOf(r) === 'Critical').length,
    completed: risks.filter(isComplete).length,
    averageScore: scored.length ? Math.round((scored.reduce((a, b) => a + b, 0) / scored.length) * 10) / 10 : 0,
    heat,
  }
}
