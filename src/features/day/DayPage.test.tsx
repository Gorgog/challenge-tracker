import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Challenge, DayLog, DayStart, Settings } from '@/domain/types'
import { DayPage } from './DayPage'

const TODAY = '2026-09-21'

const mocked = vi.hoisted(() => ({
  challenges: [] as Challenge[],
  logs: [] as DayLog[],
  starts: [] as DayStart[],
  settings: { morningUntil: 15 } as Settings,
  startDay: vi.fn(),
  setEntry: vi.fn(),
}))

vi.mock('@/data/queries', () => ({
  useChallenges: () => ({ data: mocked.challenges, isPending: false }),
  useEntries: () => ({ data: {}, isPending: false }),
  useDayLogs: () => ({ data: mocked.logs, isPending: false }),
  useDayGroups: () => ({ data: ['tasks', 'holds'], isPending: false }),
  useDayStarts: () => ({ data: mocked.starts, isPending: false }),
  useSettings: () => ({ data: mocked.settings, isPending: false }),
  useSetEntry: () => ({ mutate: mocked.setEntry }),
  useSaveDayLog: () => ({ mutate: vi.fn() }),
  useStartDay: () => ({ mutate: mocked.startDay }),
  useReorderChallenges: () => ({ mutate: vi.fn() }),
  useSaveDayGroups: () => ({ mutate: vi.fn() }),
}))

const read: Challenge = {
  id: 'read',
  name: 'Читать 20 страниц',
  code: 'ЧТН',
  kind: 'do',
  measure: 'binary',
  goal: 1,
  unit: null,
  color: 'var(--chart-3)',
  tagIds: [],
  startDate: '2026-09-01',
  lengthDays: null,
  pauses: [],
  rulesLocked: false,
  deletedAt: null,
  sortOrder: 0,
}

const started = (morning: DayStart['morning']): DayStart => ({ day: TODAY, morning, startedAt: `${TODAY}T05:30:00.000Z` })
const closed: DayLog = {
  day: TODAY,
  mood: 7,
  wellbeing: 6,
  productivity: 8,
  tags: [],
  note: '',
  closedAt: `${TODAY}T20:00:00.000Z`,
}

/** Часы — единственное, что подменяется: таймеры настоящие, иначе userEvent зависнет. */
const at = (hour: number) => vi.setSystemTime(new Date(2026, 8, 21, hour, 0))

const markButton = () => screen.getByRole('button', { name: /отметить/i })
const pageStart = () => screen.getAllByRole('button', { name: 'Начать день' })[0]!

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  at(8)
  Object.assign(mocked, { challenges: [read], logs: [], starts: [], settings: { morningUntil: 15 } })
  mocked.startDay.mockReset()
  mocked.setEntry.mockReset()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('экран дня — пока день не начат', () => {
  it('челленджи под блюром с плашкой «День не начат», снизу «Начать день», а не «Завершить день»', () => {
    render(<DayPage />)

    expect(screen.getByText('День не начат')).toBeInTheDocument()
    expect(markButton()).toBeDisabled()
    expect(pageStart()).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Завершить день' })).toBeNull()
  })

  it('до утреннего часа «Начать день» открывает окно утра и записывает утро', async () => {
    const user = userEvent.setup()
    render(<DayPage />)
    expect(screen.getByText(/три коротких вопроса/i)).toBeInTheDocument()

    await user.click(pageStart())
    const dialog = screen.getByRole('dialog')
    for (const name of [/сон/i, /самочувствие/i, /настроение/i]) {
      within(dialog).getByRole('slider', { name }).focus()
      await user.keyboard('{ArrowRight}')
    }
    await user.click(within(dialog).getByRole('button', { name: 'Начать день' }))

    expect(mocked.startDay).toHaveBeenCalledWith({
      day: TODAY,
      morning: { sleep: 6, wellbeing: 6, mood: 6 },
      startedAt: expect.any(String),
    })
  })

  it('«Пропустить утро» начинает день без оценок', async () => {
    const user = userEvent.setup()
    render(<DayPage />)
    await user.click(pageStart())
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: /пропустить утро/i }))

    expect(mocked.startDay).toHaveBeenCalledWith({ day: TODAY, morning: null, startedAt: expect.any(String) })
  })

  it('после утреннего часа «Начать день» начинает день сразу, без окна и без оценок', async () => {
    at(16)
    const user = userEvent.setup()
    render(<DayPage />)
    expect(screen.getByText(/утренние вопросы — до 15:00/i)).toBeInTheDocument()

    await user.click(pageStart())
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(mocked.startDay).toHaveBeenCalledWith({ day: TODAY, morning: null, startedAt: expect.any(String) })
  })

  it('утренний час берётся из настроек', async () => {
    mocked.settings = { morningUntil: 9 }
    at(10)
    const user = userEvent.setup()
    render(<DayPage />)
    expect(screen.getByText(/утренние вопросы — до 9:00/i)).toBeInTheDocument()

    await user.click(pageStart())
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('цифры не отмечают задачи, пока день не начат', async () => {
    const user = userEvent.setup()
    render(<DayPage />)
    await user.keyboard('1')
    expect(mocked.setEntry).not.toHaveBeenCalled()
  })
})

describe('экран дня — день начат', () => {
  it('без блюра: отметки доступны, цифра отмечает, снизу «Завершить день»', async () => {
    mocked.starts = [started({ sleep: 7, wellbeing: 6, mood: 5 })]
    const user = userEvent.setup()
    render(<DayPage />)

    expect(screen.queryByText('День не начат')).toBeNull()
    expect(markButton()).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Завершить день' })).toBeInTheDocument()
    await user.keyboard('1')
    expect(mocked.setEntry).toHaveBeenCalled()
  })

  it('под заголовком — утро, и его не поправить: кнопки правки нет', () => {
    mocked.starts = [started({ sleep: 7, wellbeing: 6, mood: 5 })]
    render(<DayPage />)

    expect(screen.getByText('Утро: сон 7 · самочувствие 6 · настроение 5')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /изменить утро/i })).toBeNull()
  })

  it('утро пропущено — так и сказано', () => {
    mocked.starts = [started(null)]
    render(<DayPage />)
    expect(screen.getByText('Утро без оценок')).toBeInTheDocument()
  })
})

describe('экран дня — день закрыт', () => {
  it('как был: плашка «День закрыт», и утро видно', () => {
    mocked.starts = [started({ sleep: 7, wellbeing: 6, mood: 5 })]
    mocked.logs = [closed]
    render(<DayPage />)

    expect(screen.getByText('День закрыт')).toBeInTheDocument()
    expect(screen.getByText('Утро: сон 7 · самочувствие 6 · настроение 5')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Начать день' })).toBeNull()
  })

  it('закрыт без утра — тоже закрыт, а не «не начат»', () => {
    mocked.logs = [closed]
    render(<DayPage />)

    expect(screen.getByText('День закрыт')).toBeInTheDocument()
    expect(screen.queryByText('День не начат')).toBeNull()
    expect(screen.queryByText(/^Утро/)).toBeNull()
  })
})
