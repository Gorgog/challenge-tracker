import { render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { addDays, dayKey, parseDay, todayKey } from '@/domain/date'
import type { Challenge, DayLog, DayStart, EntryMap } from '@/domain/types'
import { AnalyticsPage } from './AnalyticsPage'

const mocked = vi.hoisted(() => ({
  challenges: [] as Challenge[],
  entries: {} as Record<string, EntryMap>,
  logs: [] as DayLog[],
  starts: [] as DayStart[],
  startsPending: false,
  startsError: false,
}))

vi.mock('@/data/queries', () => ({
  useChallenges: () => ({ data: mocked.challenges, isPending: false }),
  useEntries: () => ({ data: mocked.entries, isPending: false }),
  useDayLogs: () => ({ data: mocked.logs, isPending: false }),
  useDayStarts: () =>
    mocked.startsError
      ? { data: undefined, isPending: false, isError: true }
      : mocked.startsPending
        ? { data: undefined, isPending: true, isError: false }
        : { data: mocked.starts, isPending: false, isError: false },
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
    mocked.challenges = []
    mocked.entries = {}
    mocked.logs = rated(20)
    mocked.starts = []
    mocked.startsPending = false
    mocked.startsError = false
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
    mocked.challenges = []
    mocked.entries = {}
    mocked.logs = rated(20)
    mocked.starts = mornings(20)
    mocked.startsPending = false
    mocked.startsError = false
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

  it('подпись объясняет утро: «в тот же день» — при том же утре, строка «Утро» на вывод не влияет, откуда «плохо спал»', () => {
    render(<AnalyticsPage />)
    expect(screen.getByText(/окно «в тот же день» сравнивает дни с одинаковым утром/i)).toBeInTheDocument()
    expect(screen.getByText(/дни без утра в это окно не идут/i)).toBeInTheDocument()
    expect(screen.getByText(/строка «утро».*на вывод и слово карточки она не влияет/i)).toBeInTheDocument()
    expect(screen.getByText(/«плохо спал» — дни, когда сон утром был от 0 до 4/i)).toBeInTheDocument()
  })
})

/**
 * Мир для страницы с настоящим расчётом: челлендж «Гулять», отметки, оценки и утра за `count` дней
 * по вчера. Сон 3 — каждый пятый день, иначе 7; утро с вечером не совпадает.
 */
function world(count: number) {
  let seed = 7
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647
  const today = parseDay(todayKey())
  const walk: Challenge = {
    id: 'walk', name: 'Гулять', code: 'ГУЛ', kind: 'do', measure: 'binary', goal: 1, unit: null,
    color: 'var(--chart-1)', tagIds: [], startDate: dayKey(addDays(today, -count)), lengthDays: null,
    pauses: [], rulesLocked: false, deletedAt: null, sortOrder: 0,
  }
  const entries: EntryMap = {}
  const logs: DayLog[] = []
  const starts: DayStart[] = []
  for (let i = count; i >= 1; i--) {
    const day = dayKey(addDays(today, -i))
    if (rnd() < 0.5) entries[day] = 1
    const s = 4 + 4 * rnd()
    logs.push({ day, mood: s, wellbeing: s, productivity: s, tags: [], note: '', closedAt: `${day}T21:00:00.000Z` })
    const morning = { sleep: i % 5 === 0 ? 3 : 7, wellbeing: 4 + 4 * rnd(), mood: 4 + 4 * rnd() }
    starts.push({ day, morning, startedAt: `${day}T08:00:00.000Z` })
  }
  return { challenges: [walk], entries: { walk: entries }, logs, starts }
}

describe('AnalyticsPage — утро доходит до выводов', () => {
  beforeEach(() => {
    const w = world(40)
    mocked.challenges = w.challenges
    mocked.entries = w.entries
    mocked.logs = w.logs
    mocked.starts = w.starts
    mocked.startsPending = false
    mocked.startsError = false
  })

  it('на карточке — окно «в тот же день» при том же утре и строка «Утро»; в тегах — «плохо спал»', () => {
    render(<AnalyticsPage />)
    const card = screen.getByRole('article', { name: 'Гулять' })
    expect(within(card).getByText(/в тот же день — с утром/)).toBeInTheDocument()
    expect(within(card).getByRole('row', { name: /утро/i })).toBeInTheDocument()
    expect(screen.getByText('плохо спал')).toBeInTheDocument()
    expect(screen.getByText('из утра · 8 дней')).toBeInTheDocument()
    expect(screen.getByText('сон, утром')).toBeInTheDocument()
  })

  it('начала дней пришли позже остальных данных — выводы пересчитаны с утром', () => {
    mocked.startsPending = true
    const { rerender } = render(<AnalyticsPage />)
    expect(screen.getByText('Загружаю…')).toBeInTheDocument()

    mocked.startsPending = false
    rerender(<AnalyticsPage />)
    const card = screen.getByRole('article', { name: 'Гулять' })
    expect(within(card).getByRole('row', { name: /утро/i })).toBeInTheDocument()
  })

  it('начала дней не загрузились — аналитика считается без утра, а не пропадает', () => {
    mocked.startsError = true
    render(<AnalyticsPage />)
    const card = screen.getByRole('article', { name: 'Гулять' })
    expect(within(card).queryByRole('row', { name: /утро/i })).toBeNull()
    expect(screen.getByRole('heading', { name: 'Как идут дни' })).toBeInTheDocument()
  })
})
