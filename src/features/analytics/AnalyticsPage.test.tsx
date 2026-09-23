import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
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
  failed: null as null | 'challenges' | 'entries' | 'logs' | 'starts',
}))

vi.mock('@/data/queries', () => {
  const result = (name: typeof mocked.failed, data: unknown) =>
    mocked.failed === name ? { data: undefined, isPending: false, isError: true } : { data, isPending: false, isError: false }
  return {
    useSettings: () => ({ data: { morningUntil: 15 }, isPending: false, isError: false }),
    useChallenges: () => result('challenges', mocked.challenges),
    useEntries: () => result('entries', mocked.entries),
    useDayLogs: () => result('logs', mocked.logs),
    useDayStarts: () => result('starts', mocked.starts),
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
  startDate: key(80),
  lengthDays: null,
  pauses: [],
  rulesLocked: false,
  deletedAt: null,
  sortOrder: 0,
}

/**
 * 60 дней. Обычно: утро 6, вечер 7 или 8 через день (день 6,5 или 7), сон 7 — полоса «обычно» 6,5–7.
 * Последние 7 прошедших дней (7…1 назад) — плохие: утро 3, вечер 4, сон 2, вечером алкоголь.
 * Сегодня начат с утром 7 и сном 8, вечера нет.
 */
function world() {
  const logs: DayLog[] = []
  const starts: DayStart[] = []
  for (let back = 59; back >= 1; back--) {
    const bad = back <= 7
    const ev = bad ? 4 : back % 2 ? 7 : 8
    logs.push({ day: key(back), mood: ev, wellbeing: ev, productivity: 6, tags: bad ? ['алкоголь'] : [], note: '', closedAt: `${key(back)}T21:00:00.000Z` })
    starts.push({ day: key(back), morning: bad ? { sleep: 2, wellbeing: 3, mood: 3 } : { sleep: 7, wellbeing: 6, mood: 6 }, startedAt: `${key(back)}T08:00:00.000Z` })
  }
  starts.push({ day: key(0), morning: { sleep: 8, wellbeing: 7, mood: 7 }, startedAt: `${key(0)}T08:00:00.000Z` })
  return { logs, starts }
}

const show = () =>
  render(
    <MemoryRouter>
      <AnalyticsPage />
    </MemoryRouter>,
  )
const headline = () => screen.getByTestId('headline')

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 8, 23, 12, 0))
  Object.assign(mocked, { challenges: [push], entries: {}, failed: null, ...world() })
})
afterEach(() => vi.useRealTimers())

describe('AnalyticsPage — обзор: цель, фраза, график, «Что изменилось»', () => {
  it('сверху — фраза против своего обычного: 7 дней из 14 ниже полосы', () => {
    show()
    expect(headline()).toHaveTextContent('Последние 2 недели — хуже обычного')
    expect(screen.getByText('7 дней из 14 с записями — ниже твоего обычного')).toBeInTheDocument()
    expect(screen.getByText(/Полоса — твоё обычное: 6,5–7,0/)).toBeInTheDocument()
  })

  it('цель «Сон» перестраивает фразу; 30 дней — другое окно', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    show()
    await user.click(within(screen.getByRole('group', { name: 'Цель' })).getByRole('button', { name: 'Сон' }))
    expect(screen.getByRole('button', { name: 'Сон' })).toHaveAttribute('aria-pressed', 'true')
    expect(headline()).toHaveTextContent('Сон за последние 2 недели — хуже обычного')
    await user.click(screen.getByRole('button', { name: '30 дней' }))
    expect(headline()).toHaveTextContent('Сон за последние 30 дней — как обычно')
  })

  it('на графике — точка на день; нажатие на день открывает его: утро, вечер, теги', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    show()
    const chart = screen.getByRole('region', { name: 'График' })
    expect(within(chart).getAllByRole('button', { name: /сентября/ })).toHaveLength(14)
    await user.click(within(chart).getByRole('button', { name: /^пн, 21 сентября: 3,5/ }))
    const dialog = screen.getByRole('dialog', { name: 'пн, 21 сентября' })
    expect(within(dialog).getByText('алкоголь')).toBeInTheDocument()
    expect(within(dialog).getByRole('row', { name: /сон 2/ })).toBeInTheDocument()
    expect(within(dialog).getByRole('row', { name: /продуктивность 6/ })).toBeInTheDocument()
  })

  it('день открывается и с клавиатуры; сегодняшний вечер — «ещё не закрыт»', () => {
    show()
    const today = screen.getByRole('button', { name: /^ср, 23 сентября/ })
    today.focus()
    fireEvent.keyDown(today, { key: 'Enter' })
    expect(within(screen.getByRole('dialog')).getByText('Вечер ещё не закрыт')).toBeInTheDocument()
  })

  it('«ещё ряды» раскрывает челленджи под графиком', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    show()
    const more = screen.getByRole('button', { name: /ещё ряды/ })
    expect(more).toHaveAttribute('aria-expanded', 'false')
    expect(within(screen.getByRole('region', { name: 'График' })).queryByText('ОТЖ')).not.toBeInTheDocument()
    await user.click(more)
    expect(more).toHaveAttribute('aria-expanded', 'true')
    expect(within(screen.getByRole('region', { name: 'График' })).getByText('ОТЖ')).toBeInTheDocument()
  })

  it('«Что изменилось» — факты против прошлых 2 недель', () => {
    show()
    const box = screen.getByRole('region', { name: 'Что изменилось' })
    expect(within(box).getByText('«алкоголь»: 7 вечеров')).toBeInTheDocument()
    expect(within(box).getByText('Плохих ночей (сон 0–4): 7')).toBeInTheDocument()
    expect(within(box).getAllByText('было 0')).toHaveLength(2)
  })

  it('истории мало — сравнивать не с чем и полоса «пока»', () => {
    mocked.logs = mocked.logs.filter((l) => l.day >= key(15))
    mocked.starts = mocked.starts.filter((s) => s.day >= key(15))
    show()
    expect(within(screen.getByRole('region', { name: 'Что изменилось' })).getByText(/почти не записаны/)).toBeInTheDocument()
    expect(screen.getByText(/пока по 16 дням/)).toBeInTheDocument()
    expect(headline()).toHaveTextContent('Вторая неделя хуже первой')
  })

  it('не загрузилось — сообщение вместо обзора', () => {
    mocked.failed = 'logs'
    show()
    expect(screen.getByRole('alert')).toHaveTextContent('Не удалось загрузить данные')
    expect(screen.queryByTestId('headline')).not.toBeInTheDocument()
  })

  it('челленджей нет — обзор всё равно есть, внизу — куда идти', () => {
    mocked.challenges = []
    show()
    expect(headline()).toHaveTextContent('хуже обычного')
    expect(screen.getByRole('link', { name: /Челленджей пока нет/ })).toHaveAttribute('href', '/challenges')
  })
})
