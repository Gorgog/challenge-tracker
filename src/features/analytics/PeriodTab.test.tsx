import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { addDays, dayKey, parseDay } from '@/domain/date'
import { dayOutcome } from '@/domain/streaks'
import { periodReport, timeline } from '@/domain/timeline'
import type { Challenge, DayLog, DayStart } from '@/domain/types'
import { PeriodTab } from './PeriodTab'

const TODAY = parseDay('2026-09-23')
const key = (back: number) => dayKey(addDays(TODAY, -back))

const push: Challenge = {
  id: 'push',
  name: 'Отжиматься по 20 раз',
  code: 'ОТЖ',
  kind: 'do',
  measure: 'count',
  goal: 20,
  unit: 'раз',
  color: 'var(--chart-1)',
  tagIds: [],
  startDate: key(20),
  lengthDays: null,
  pauses: [],
  rulesLocked: false,
  deletedAt: null,
  sortOrder: 0,
}

describe('PeriodTab — все цифры', () => {
  it('челлендж начат 20 дней назад: в «прошлые 30» у пропусков — прочерк, а не 0 (демо 24.09: «0 → 11»)', () => {
    const logs: DayLog[] = []
    const starts: DayStart[] = []
    for (let back = 89; back >= 1; back--) {
      logs.push({ day: key(back), mood: 6, wellbeing: 6, productivity: 5, tags: [], note: '', closedAt: `${key(back)}T21:00:00.000Z` })
      starts.push({ day: key(back), morning: { sleep: 7, wellbeing: 6, mood: 6 }, startedAt: `${key(back)}T08:00:00.000Z` })
    }
    const days = timeline(logs, starts, addDays(TODAY, -89), TODAY)
    const index = days.length - 2
    const report = periodReport(days, index, 30, days.slice(-30), push, {}, TODAY)
    expect(report.hasPrev).toBe(true)
    render(
      <PeriodTab
        report={report}
        days={days}
        windowStart={days.length - 30}
        challenge={push}
        outcomeOf={(d) => dayOutcome(push, {}, parseDay(d), TODAY)}
        onOpenDay={() => {}}
        onOpenWeek={() => {}}
      />,
    )
    fireEvent.click(screen.getByText('Все цифры'))
    const row = screen.getByText('ОТЖ: пропуски').closest('tr')!
    expect([...row.querySelectorAll('td')].map((td) => td.textContent)).toEqual(['ОТЖ: пропуски', '20', '—'])
  })
})
