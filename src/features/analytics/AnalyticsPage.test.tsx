import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { addDays, dayKey, parseDay } from '@/domain/date'
import type { Challenge, DayLog, DayStart, EntryMap } from '@/domain/types'
import { AnalyticsPage } from './AnalyticsPage'

const TODAY = parseDay('2026-09-23')
const key = (back: number) => dayKey(addDays(TODAY, -back))

const mocked = vi.hoisted(() => ({
  challenges: [] as Challenge[],
  entries: {} as Record<string, EntryMap>,
  logs: [] as DayLog[],
  starts: [] as DayStart[],
  startsPending: false,
  /** Какой запрос не загрузился. */
  failed: null as null | 'challenges' | 'entries' | 'logs' | 'starts',
}))

vi.mock('@/data/queries', () => {
  const result = (name: typeof mocked.failed, data: unknown) =>
    mocked.failed === name ? { data: undefined, isPending: false, isError: true } : { data, isPending: false, isError: false }
  return {
    useChallenges: () => result('challenges', mocked.challenges),
    useEntries: () => result('entries', mocked.entries),
    useDayLogs: () => result('logs', mocked.logs),
    useDayStarts: () =>
      mocked.startsPending && mocked.failed !== 'starts'
        ? { data: undefined, isPending: true, isError: false }
        : result('starts', mocked.starts),
  }
})

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
  startDate: key(60),
  lengthDays: null,
  pauses: [],
  rulesLocked: false,
  deletedAt: null,
  sortOrder: 0,
}
const insta: Challenge = { ...push, id: 'insta', code: 'ИНС', name: 'Не залипать в инсте', kind: 'quit', measure: 'binary', goal: 1, startDate: key(20), sortOrder: 1 }
const gone: Challenge = { ...push, id: 'gone', code: 'УДЛ', name: 'Удалённый', deletedAt: `${key(5)}T10:00:00.000Z`, sortOrder: 2 }

/**
 * 40 дней истории. Вечера 7…2 — с алкоголем, после них утра 6…1 плохие (сон 2, утро 3, вечер 4);
 * остальные дни ровные (утро и вечер 6, сон 7). Сегодня день начат с хорошим утром, вечера нет.
 */
function world() {
  const logs: DayLog[] = []
  const starts: DayStart[] = []
  for (let back = 40; back >= 1; back--) {
    const hangover = back >= 1 && back <= 6
    const v = hangover ? 4 : 6
    logs.push({
      day: key(back),
      mood: v,
      wellbeing: v,
      productivity: 5,
      tags: back >= 2 && back <= 7 ? ['алкоголь'] : [],
      note: '',
      closedAt: `${key(back)}T21:00:00.000Z`,
    })
    starts.push({
      day: key(back),
      morning: hangover ? { sleep: 2, wellbeing: 3, mood: 3 } : { sleep: 7, wellbeing: 6, mood: 6 },
      startedAt: `${key(back)}T08:00:00.000Z`,
    })
  }
  starts.push({ day: key(0), morning: { sleep: 8, wellbeing: 7, mood: 7 }, startedAt: `${key(0)}T08:00:00.000Z` })
  return { logs, starts }
}

const svg = () => screen.getByRole('slider', { name: 'День на графике' })
const dayTitle = () => screen.getByTestId('day-title').textContent

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 8, 23, 12, 0))
  const { logs, starts } = world()
  Object.assign(mocked, {
    challenges: [push, insta, gone],
    entries: {},
    logs,
    starts,
    startsPending: false,
    failed: null,
  })
})
afterEach(() => vi.useRealTimers())

describe('AnalyticsPage — график челленджа и разбор', () => {
  it('нет челленджей — подсказка завести', () => {
    mocked.challenges = [gone]
    render(<AnalyticsPage />)
    expect(screen.getByText(/заведи челлендж/i)).toBeInTheDocument()
    expect(screen.queryByRole('slider')).not.toBeInTheDocument()
  })

  it('чипы — живые челленджи; сначала «День» на последнем дне с записями', () => {
    render(<AnalyticsPage />)
    const chips = screen.getByRole('group', { name: 'Челлендж' })
    expect(within(chips).getAllByRole('button').map((b) => b.textContent)).toEqual([
      'ОТЖОтжиматься по 20 раз',
      'ИНСНе залипать в инсте',
    ])
    expect(screen.getByRole('tab', { name: 'День' })).toHaveAttribute('aria-selected', 'true')
    expect(dayTitle()).toBe('ср, 23 сентября')
    expect(screen.getByText('Хорошо спал: сон 8')).toBeInTheDocument()
    expect(screen.getByText('ОТЖ: день ещё идёт')).toBeInTheDocument()
  })

  it('← на «Дне» — вчера: ночь после алкоголя и понятное сравнение', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<AnalyticsPage />)
    await user.click(screen.getByRole('button', { name: 'Предыдущий день' }))
    expect(dayTitle()).toBe('вт, 22 сентября')
    expect(svg()).toHaveAttribute('aria-valuetext', 'вт, 22 сентября')
    expect(screen.getByText('День хуже обычного')).toBeInTheDocument()
    expect(screen.getByText('Накануне вечером «алкоголь»')).toBeInTheDocument()
    expect(screen.getByText('Плохо спал: сон 2')).toBeInTheDocument()
    expect(screen.getByText('ОТЖ пропущен')).toBeInTheDocument()
    expect(screen.getByText('После вечера с тегом «алкоголь» ты обычно просыпаешься хуже')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Следующий день' })).toBeEnabled()
  })

  it('стрелка на графике двигает день; на последнем дне → неактивна', () => {
    render(<AnalyticsPage />)
    expect(screen.getByRole('button', { name: 'Следующий день' })).toBeDisabled()
    fireEvent.keyDown(svg(), { key: 'ArrowLeft' })
    fireEvent.keyDown(svg(), { key: 'ArrowLeft' })
    expect(dayTitle()).toBe('пн, 21 сентября')
  })

  it('«Неделя»: итог, что поменялось в делах, дни недели открывают разбор дня', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<AnalyticsPage />)
    await user.click(screen.getByRole('tab', { name: 'Неделя' }))
    expect(screen.getByText('Неделя хуже прошлой')).toBeInTheDocument()
    expect(screen.getByText('Чаще «алкоголь»: 5 вечеров за неделю')).toBeInTheDocument()
    expect(screen.getByText('Хуже спал: плохих ночей 6')).toBeInTheDocument()
    expect(svg().querySelector('[data-period="7"]')).not.toBeNull()
    await user.click(screen.getByRole('button', { name: /^вс 20/ }))
    expect(screen.getByRole('tab', { name: 'День' })).toHaveAttribute('aria-selected', 'true')
    expect(dayTitle()).toBe('вс, 20 сентября')
  })

  it('«30 дней»: предыдущие 30 дней почти не записаны — сравнивать не с чем', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<AnalyticsPage />)
    await user.click(screen.getByRole('tab', { name: '30 дней' }))
    expect(screen.getByText(/предыдущие 30 дней почти не записаны/i)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '30 дней по неделям' })).toBeInTheDocument()
  })

  it('«Три линии» — чипы шкал; последнюю линию не спрятать', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<AnalyticsPage />)
    expect(svg().querySelector('[data-series]')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Три линии' }))
    const series = screen.getByRole('group', { name: 'Что показывать' })
    await user.click(within(series).getByRole('button', { name: 'Настроение' }))
    await user.click(within(series).getByRole('button', { name: 'Сон' }))
    expect(svg().querySelector('[data-series="mood"]')).toBeNull()
    await user.click(within(series).getByRole('button', { name: 'Самочувствие' }))
    expect(within(series).getByRole('button', { name: 'Самочувствие' })).toHaveAttribute('aria-pressed', 'true')
    expect(svg().querySelector('[data-series="wellbeing"]')).not.toBeNull()
  })

  it('другой челлендж — его отметки на графике и в разборе', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<AnalyticsPage />)
    await user.click(screen.getByRole('button', { name: /ИНС/ }))
    expect(svg().textContent).toContain('ИНС')
    await user.click(screen.getByRole('button', { name: 'Предыдущий день' }))
    expect(screen.getByText('ИНС: без срыва')).toBeInTheDocument()
  })

  it('утра пришли позже — график и разбор пересчитаны с ними', () => {
    mocked.startsPending = true
    const { rerender } = render(<AnalyticsPage />)
    expect(screen.getByText('Загружаю…')).toBeInTheDocument()
    mocked.startsPending = false
    rerender(<AnalyticsPage />)
    expect(svg().querySelectorAll('[data-sleep]').length).toBe(29 + 1)
    expect(screen.getByText('Хорошо спал: сон 8')).toBeInTheDocument()
  })

  it.each(['challenges', 'entries', 'logs', 'starts'] as const)(
    'не загрузилось (%s) — сообщение вместо графика, а не «пропущено» и не «челленджей нет»',
    (name) => {
      mocked.failed = name
      render(<AnalyticsPage />)
      expect(screen.getByRole('alert')).toHaveTextContent('Не удалось загрузить данные')
      expect(screen.queryByRole('slider')).not.toBeInTheDocument()
      expect(screen.queryByText(/заведи челлендж/i)).not.toBeInTheDocument()
      expect(screen.queryByText(/пропущен/i)).not.toBeInTheDocument()
    },
  )

  it('выбранный день держится за дату: после полуночи не съезжает на соседний', () => {
    const { rerender } = render(<AnalyticsPage />)
    act(() => fireEvent.keyDown(svg(), { key: 'ArrowLeft' }))
    act(() => fireEvent.keyDown(svg(), { key: 'ArrowLeft' }))
    expect(dayTitle()).toBe('пн, 21 сентября')
    vi.setSystemTime(new Date(2026, 8, 24, 0, 5))
    rerender(<AnalyticsPage />)
    expect(dayTitle()).toBe('пн, 21 сентября')
    expect(svg()).toHaveAttribute('aria-valuetext', 'пн, 21 сентября')
  })

  it('график не держит вертикальный свайп: страница прокручивается пальцем', () => {
    render(<AnalyticsPage />)
    expect(svg()).toHaveClass('touch-pan-y')
    expect(svg()).not.toHaveClass('touch-none')
  })
})
