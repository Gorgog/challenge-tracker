import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { addDays, dayKey, parseDay, todayKey } from '@/domain/date'
import type { DayLog, DayStart } from '@/domain/types'
import { AnalyticsPage } from './AnalyticsPage'

const mocked = vi.hoisted(() => ({ logs: [] as DayLog[], starts: [] as DayStart[], startsPending: false }))

vi.mock('@/data/queries', () => ({
  useChallenges: () => ({ data: [], isPending: false }),
  useEntries: () => ({ data: {}, isPending: false }),
  useDayLogs: () => ({ data: mocked.logs, isPending: false }),
  useDayStarts: () =>
    mocked.startsPending ? { data: undefined, isPending: true } : { data: mocked.starts, isPending: false },
}))

/** Оценённые дни по вчера включительно. */
function rated(count: number): DayLog[] {
  return Array.from({ length: count }, (_, i) => {
    const day = dayKey(addDays(parseDay(todayKey()), -(i + 1)))
    return { day, mood: 6, wellbeing: 6, productivity: 6, tags: [], note: '', closedAt: `${day}T21:00:00.000Z` }
  })
}

/** Утра по вчера включительно — сон 6. */
function mornings(count: number): DayStart[] {
  return Array.from({ length: count }, (_, i) => {
    const day = dayKey(addDays(parseDay(todayKey()), -(i + 1)))
    return { day, morning: { sleep: 6, wellbeing: 6, mood: 6 }, startedAt: `${day}T08:00:00.000Z` }
  })
}

describe('AnalyticsPage — что сказано о выводах', () => {
  beforeEach(() => {
    mocked.logs = rated(20)
    mocked.starts = []
    mocked.startsPending = false
  })

  it('подпись объясняет «возможно»: ранний вывод, пока дней мало, потом его сменяют другие слова', () => {
    render(<AnalyticsPage />)
    expect(
      screen.getByText(/«возможно» — ранний вывод, пока дней мало: в первые недели он ошибается примерно через раз/i),
    ).toBeInTheDocument()
    expect(screen.getByText(/его сменяют «похоже», «уверенно» или «неясно»/i)).toBeInTheDocument()
  })

  it('подпись называет поправки разницы «с» и «без» и какие дни не идут в расчёт', () => {
    render(<AnalyticsPage />)
    expect(screen.getByText(/разницы «с» и «без» посчитаны с поправкой .* на общий подъём или спад/i)).toBeInTheDocument()
    expect(screen.getByText(/день старта, вчерашний день и дни болезни в расчёт не идут/i)).toBeInTheDocument()
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

describe('AnalyticsPage — утро', () => {
  beforeEach(() => {
    mocked.logs = rated(20)
    mocked.starts = mornings(20)
    mocked.startsPending = false
  })

  it('сон по утрам — пятой плиткой в «Как идут дни»', () => {
    render(<AnalyticsPage />)
    expect(screen.getByRole('group', { name: /сон/i })).toHaveTextContent('6,0')
  })

  it('пока начала дней грузятся — «Загружаю…», а не выводы без утра', () => {
    mocked.startsPending = true
    render(<AnalyticsPage />)
    expect(screen.getByText('Загружаю…')).toBeInTheDocument()
  })

  it('подпись объясняет утро: «в тот же день» — при том же утре, строка «Утро» слов не даёт, откуда «плохо спал»', () => {
    render(<AnalyticsPage />)
    expect(screen.getByText(/окно «в тот же день» сравнивает дни с одинаковым утром/i)).toBeInTheDocument()
    expect(screen.getByText(/дни без утра в это окно не идут/i)).toBeInTheDocument()
    expect(screen.getByText(/строка «утро».*слов уверенности она не даёт/i)).toBeInTheDocument()
    expect(screen.getByText(/«плохо спал» — дни, когда сон утром был от 0 до 4/i)).toBeInTheDocument()
  })
})
