import { describe, expect, it } from 'vitest'
import type { Risk } from '@/types/domain'
import { isComplete, riskScore, riskSeverity, scoreOf, severityOf, storedMismatch, summarizeRisks } from './calc'

const risk = (p: Partial<Risk>): Risk => ({ id: '1', projectReference: '', riskNo: '', description: '', cause: '', causeHtml: '', probability: '', impact: '', storedSeverity: '', storedScore: 0, owner: '', ownerId: '', department: '', departmentId: '', priority: '', status: '', statusId: '', ...p })
const risks = [
  risk({ id: '1', probability: 'Medium', impact: 'Significant', status: 'In-Progress' }),
  risk({ id: '2', probability: 'Medium', impact: 'Moderate', status: 'Complete' }),
  risk({ id: '3', probability: 'Very High', impact: 'Significant', status: 'Not Started', storedSeverity: 'High', storedScore: 12 }),
]

describe('risk matrix (workbook Risk Escalation Matrix)', () => {
  it('scores probability × impact on 1–25', () => {
    expect(riskScore('Medium', 'Significant')).toBe(12)
    expect(riskScore('Very High', 'Severe')).toBe(25)
    expect(riskScore('', 'Severe')).toBe(0)
  })

  it('reads severity from the matrix', () => {
    expect(riskSeverity('Medium', 'Significant')).toBe('High')
    expect(riskSeverity('Medium', 'Moderate')).toBe('Medium')
    expect(riskSeverity('Very High', 'Significant')).toBe('Critical')
    expect(riskSeverity('Very Low', 'Negligible')).toBe('Very Low')
  })

  it('always calculates — a wrong stored value is flagged, not shown', () => {
    expect(scoreOf(risks[2])).toBe(20)
    expect(severityOf(risks[2])).toBe('Critical')
    expect(storedMismatch(risks[2])).toBe(true)
    expect(storedMismatch(risks[0])).toBe(false)
  })
})

describe('risk dashboard', () => {
  it('matches the Risk Dashboard definitions', () => {
    const s = summarizeRisks(risks)
    expect(s).toMatchObject({ total: 3, active: 2, completed: 1, critical: 1, averageScore: 16 }) // (12 + 20) / 2 — Complete risks excluded, as in the workbook
    expect(s.heat.Medium.Significant).toBe(1)
    expect(isComplete(risk({ status: 'Closed' }))).toBe(true)
  })
})
