import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { addDays, dayKey, parseDay, todayKey } from '@/domain/date'
import type { DayLog } from '@/domain/types'
import { AnalyticsPage } from './AnalyticsPage'

const mocked = vi.hoisted(() => ({ logs: [] as DayLog[] }))

vi.mock('@/data/queries', () => ({
  useChallenges: () => ({ data: [], isPending: false }),
  useEntries: () => ({ data: {}, isPending: false }),
  useDayLogs: () => ({ data: mocked.logs, isPending: false }),
}))

/** Оценённые дни по вчера включительно. */
function rated(count: number): DayLog[] {
  return Array.from({ length: count }, (_, i) => {
    const day = dayKey(addDays(parseDay(todayKey()), -(i + 1)))
    return { day, mood: 6, wellbeing: 6, productivity: 6, tags: [], note: '', closedAt: `${day}T21:00:00.000Z` }
  })
}

describe('AnalyticsPage — что сказано о выводах', () => {
  beforeEach(() => {
    mocked.logs = rated(20)
  })

  it('подпись объясняет «возможно»: ранний вывод, в первые недели ошибается примерно через раз', () => {
    render(<AnalyticsPage />)
    expect(screen.getByText(/«возможно» — ранний вывод: в первые недели он ошибается примерно через раз/i)).toBeInTheDocument()
  })

  it('подпись называет поправку на общий подъём или спад оценок', () => {
    render(<AnalyticsPage />)
    expect(screen.getByText(/общий подъём или спад/i)).toBeInTheDocument()
  })

  it('оценок мало — плашка не обещает выводов через две недели: первые могут появиться раньше', () => {
    mocked.logs = rated(5)
    render(<AnalyticsPage />)

    expect(screen.queryByText(/выводы появятся/i)).toBeNull()
    expect(
      screen.getByText(/оценено 5 дней — данных пока мало: первые выводы обычно появляются на второй неделе/i),
    ).toBeInTheDocument()
  })
})
