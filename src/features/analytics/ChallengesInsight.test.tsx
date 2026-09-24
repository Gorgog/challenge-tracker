import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { addDays, dayKey, parseDay } from '@/domain/date'
import type { Challenge, DayLog, DayStart, EntryMap } from '@/domain/types'
import { ChallengesInsight } from './ChallengesInsight'

const TODAY = parseDay('2026-09-23')
const key = (back: number) => dayKey(addDays(TODAY, -back))

const mocked = vi.hoisted(() => ({
  challenges: [] as Challenge[],
  entries: {} as Record<string, EntryMap>,
  logs: [] as DayLog[],
  starts: [] as DayStart[],
  failed: false,
}))

vi.mock('@/data/queries', () => {
  const ok = (data: unknown) => ({ data, isPending: false, isError: false })
  return {
    useChallenges: () => (mocked.failed ? { data: undefined, isPending: false, isError: true } : ok(mocked.challenges)),
    useEntries: () => ok(mocked.entries),
    useDayLogs: () => ok(mocked.logs),
    useDayStarts: () => ok(mocked.starts),
  }
})

const base: Challenge = {
  id: 'sport',
  name: 'Спорт',
  code: 'СПТ',
  kind: 'do',
  measure: 'binary',
  goal: 1,
  unit: '',
  color: 'var(--chart-1)',
  tagIds: [],
  startDate: key(29),
  lengthDays: 60,
  pauses: [],
  rulesLocked: false,
  deletedAt: null,
  sortOrder: 0,
}

/** 60 дней записей; утро 3 в дни `bad`, иначе 7; вечер закрыт, теги — `tags(back)`. */
function world(bad: (back: number) => boolean, tags: (back: number) => string[] = () => []) {
  const logs: DayLog[] = []
  const starts: DayStart[] = []
  for (let back = 59; back >= 0; back--) {
    const m = bad(back) ? 3 : 7
    starts.push({ day: key(back), morning: { sleep: 7, wellbeing: m, mood: m }, startedAt: `${key(back)}T08:00:00.000Z` })
    if (back > 0) logs.push({ day: key(back), mood: 6, wellbeing: 6, productivity: 6, tags: tags(back), note: '', closedAt: `${key(back)}T21:00:00.000Z` })
  }
  return { logs, starts }
}
/** Выполнено во все прошедшие дни с начала, кроме `miss`. */
const marks = (from: number, miss: (back: number) => boolean): EntryMap =>
  Object.fromEntries(Array.from({ length: from }, (_, i) => from - i).filter((b) => !miss(b)).map((b) => [key(b), 1]))

const show = () =>
  render(
    <MemoryRouter>
      <ChallengesInsight />
    </MemoryRouter>,
  )
const card = (name: string) => screen.getByRole('article', { name })

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 8, 23, 12, 0))
  const miss = (b: number) => b % 4 === 0
  Object.assign(mocked, { challenges: [base], entries: { sport: marks(29, miss) }, failed: false, ...world(miss) })
})
afterEach(() => vi.useRealTimers())

describe('ChallengesInsight — прогресс, потом честность сравнения', () => {
  it('назад — в аналитику; прогресс: день из срока и выполнено из прошедших', () => {
    show()
    expect(screen.getByRole('link', { name: '‹ Аналитика' })).toHaveAttribute('href', '/analytics')
    const c = card('Спорт')
    expect(within(c).getByText('день 30 из 60')).toBeInTheDocument()
    // прошедшие 29…1 назад, пропуски — 28, 24, … 4: семь
    expect(within(c).getByText('22 из 29')).toBeInTheDocument()
  })

  it('пропуски в тяжёлые утра — сравнивать честно нельзя, и почему', () => {
    show()
    expect(within(card('Спорт')).getByText('Сравнить честно пока нельзя: пропуски чаще приходились на дни, которые уже с утра были тяжёлыми (утро 3,0 против 7,0).')).toBeInTheDocument()
  })

  it('пропусков меньше 5 — «пока рано», и уже видно тяжёлые утра', () => {
    const miss = (b: number) => [5, 10, 15, 20].includes(b)
    Object.assign(mocked, { entries: { sport: marks(29, miss) }, ...world(miss) })
    show()
    expect(
      within(card('Спорт')).getByText(
        'Сравнивать пока рано: за 8 недель пропусков 4, нужно 5. И смотри: пропуски пришлись на утра хуже (3,0 против 7,0) — простое «с ним лучше» будет нечестным.',
      ),
    ).toBeInTheDocument()
  })

  it('пропусков нет или выполнений нет — сравнить не с чем', () => {
    Object.assign(mocked, { entries: { sport: marks(29, () => false) }, ...world(() => false) })
    const { unmount } = show()
    expect(within(card('Спорт')).getByText('За 8 недель пропусков нет — сравнить не с чем.')).toBeInTheDocument()
    unmount()
    mocked.entries = { sport: {} }
    show()
    expect(within(card('Спорт')).getByText('За 8 недель выполнений нет — сравнить не с чем.')).toBeInTheDocument()
  })

  it('честно — так и сказано, числа влияния — позже', () => {
    const miss = (b: number) => b % 4 === 0
    Object.assign(mocked, world(() => false))
    mocked.entries = { sport: marks(29, miss) }
    show()
    expect(
      within(card('Спорт')).getByText(/Пропуски не совпадают ни с тяжёлыми утрами, ни с вечерами накануне — сравнение будет честным/),
    ).toBeInTheDocument()
  })

  it('«чаще пропуск после» — теги прошлого вечера', () => {
    const miss = (b: number) => b % 4 === 0
    Object.assign(mocked, world(() => false, (b) => (miss(b - 1) && b < 20 ? ['алкоголь'] : [])))
    show()
    const c = card('Спорт')
    expect(within(c).getByText('Чаще пропуск после: «алкоголь» (4).')).toBeInTheDocument()
    // утра те же, но пропуски шли после алкоголя — «честным» не пишем
    expect(within(c).getByText('Сравнить честно пока нельзя: пропуски чаще шли после некоторых вечеров.')).toBeInTheDocument()
    expect(within(c).queryByText(/будет честным/)).not.toBeInTheDocument()
  })

  it('утр записано мало — так и сказано', () => {
    mocked.starts = mocked.starts.map((s) => ({ ...s, morning: null }))
    show()
    expect(within(card('Спорт')).getByText('Утр записано мало — проверить, честно ли сравнение, пока нельзя.')).toBeInTheDocument()
  })

  it('срок вышел — «срок … ✓»', () => {
    mocked.challenges = [{ ...base, startDate: key(40), lengthDays: 10 }]
    mocked.entries = {}
    show()
    expect(within(card('Спорт')).getByText('срок 10 дней ✓')).toBeInTheDocument()
  })

  it('на паузе — так и сказано, день — без дней паузы', () => {
    mocked.challenges = [{ ...base, pauses: [{ from: key(5), to: null }] }]
    show()
    // прошедшие дни до паузы: 29…6 назад
    expect(within(card('Спорт')).getByText('на паузе · день 24 из 60')).toBeInTheDocument()
  })

  it('отказ — только прогресс и почему без сравнений', () => {
    mocked.challenges = [{ ...base, id: 'sweet', name: 'Без сладкого', kind: 'quit', lengthDays: null }]
    mocked.entries = {}
    show()
    const c = card('Без сладкого')
    expect(within(c).getByText('идёт 30 дней')).toBeInTheDocument()
    expect(within(c).getByText(/Сравнений у отказов пока нет/)).toBeInTheDocument()
    /* срез 5а: день без ответа — «не записано», а не выдержанный */
    expect(within(c).queryByText(/считается выдержанным/)).toBeNull()
  })

  it('начались почти вместе — предупреждение; удалённого нет', () => {
    mocked.challenges = [base, { ...base, id: 'read', name: 'Чтение', startDate: key(27), sortOrder: 1 }, { ...base, id: 'gone', name: 'Удалённый', deletedAt: `${key(3)}T10:00:00.000Z` }]
    show()
    expect(screen.getByText('«Спорт» и «Чтение» начались почти вместе — их влияние не разделить.')).toBeInTheDocument()
    expect(screen.queryByRole('article', { name: 'Удалённый' })).not.toBeInTheDocument()
  })

  it('челленджей нет — куда идти; не загрузилось — сообщение', () => {
    mocked.challenges = []
    const { unmount } = show()
    expect(screen.getByRole('link', { name: /Челленджей пока нет/ })).toHaveAttribute('href', '/challenges')
    unmount()
    mocked.failed = true
    show()
    expect(screen.getByRole('alert')).toHaveTextContent('Не удалось загрузить')
  })
})

describe('«Ложусь раньше» в разборе (срез 4б)', () => {
  it('прогресс — из записанных ночей; сказано, что отбой считается сам', () => {
    const bed: Challenge = { ...base, id: 'bed', name: 'Ложусь раньше', measure: 'bedtime', goal: -30, lengthDays: null, startDate: key(10) }
    Object.assign(mocked, world(() => false))
    mocked.challenges = [bed]
    // 10…1 день назад: до 23:30 — 6 ночей, позже — 3, не записана — 1 (не в счёт)
    mocked.entries = { bed: Object.fromEntries([-40, -40, 30, NaN, -40, 30, -40, 30, -40, -40].map((v, i) => [key(10 - i), v])) }
    show()
    const card = screen.getByRole('article', { name: 'Ложусь раньше' })
    expect(within(card).getByText('6 из 9')).toBeInTheDocument()
    expect(within(card).getByText('Отбой считается сам из времени, которое ты отмечаешь утром.')).toBeInTheDocument()
  })
})
