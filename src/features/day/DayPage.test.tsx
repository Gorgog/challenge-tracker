import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Challenge, DayLog, DayStart, Settings } from '@/domain/types'
import { DayPage } from './DayPage'

const TODAY = '2026-09-21'

const mocked = vi.hoisted(() => ({
  challenges: [] as Challenge[],
  logs: [] as DayLog[],
  starts: [] as DayStart[],
  startsPending: false,
  settings: { morningUntil: 15 } as Settings,
  startDay: vi.fn(),
  setEntry: vi.fn(),
}))

vi.mock('@/data/queries', () => ({
  useChallenges: () => ({ data: mocked.challenges, isPending: false }),
  useEntries: () => ({ data: {}, isPending: false }),
  useDayLogs: () => ({ data: mocked.logs, isPending: false }),
  useDayGroups: () => ({ data: ['tasks', 'holds'], isPending: false }),
  useDayStarts: () =>
    mocked.startsPending ? { data: undefined, isPending: true } : { data: mocked.starts, isPending: false },
  useSettings: () => ({ data: mocked.settings, isPending: false }),
  useSetEntry: () => ({ mutate: mocked.setEntry }),
  useSaveDayLog: () => ({ mutate: vi.fn() }),
  useStartDay: () => ({ mutate: mocked.startDay, isPending: false }),
  useReorderChallenges: () => ({ mutate: vi.fn() }),
  useSaveDayGroups: () => ({ mutate: vi.fn() }),
}))

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { error: vi.fn() }) }))

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
/** Отказ: у него своя кнопка «сорвался» — она тоже под замком, пока день не начат. */
const smoke: Challenge = { ...read, id: 'smoke', code: 'БСГ', name: 'Без сигарет', kind: 'quit', sortOrder: 1 }

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
const at = (hour: number, minute = 0) => vi.setSystemTime(new Date(2026, 8, 21, hour, minute))

const markButton = () => screen.getByRole('button', { name: /отметить/i })
const pageStart = () => screen.getAllByRole('button', { name: 'Начать день' })[0]!

/** Выставить три утренние оценки с клавиатуры (с пятёрки на шестёрку) и начать день в окне. */
async function fillMorning(user: ReturnType<typeof userEvent.setup>) {
  const dialog = screen.getByRole('dialog')
  for (const name of [/сон/i, /самочувствие/i, /настроение/i]) {
    within(dialog).getByRole('slider', { name }).focus()
    await user.keyboard('{ArrowRight}')
  }
  await user.click(within(dialog).getByRole('button', { name: 'Начать день' }))
}

/** Хранилище приняло начало дня: следующий рендер видит начатый день. */
const acceptStart = () =>
  mocked.startDay.mockImplementation((start: DayStart, options?: { onSuccess?: () => void }) => {
    mocked.starts = [...mocked.starts, start]
    options?.onSuccess?.()
  })

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  at(8)
  Object.assign(mocked, {
    challenges: [read, smoke],
    logs: [],
    starts: [],
    startsPending: false,
    settings: { morningUntil: 15 },
  })
  mocked.startDay.mockReset()
  mocked.setEntry.mockReset()
  vi.mocked(toast).mockReset()
  vi.mocked(toast.error).mockReset()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('экран дня — пока день не начат', () => {
  it('челленджи под блюром с плашкой «День не начат», снизу «Начать день», а не «Завершить день»', () => {
    render(<DayPage />)

    expect(screen.getByText('День не начат')).toBeInTheDocument()
    expect(screen.getByText('Читать 20 страниц').closest('.pointer-events-none')).not.toBeNull()
    expect(markButton()).toBeDisabled()
    expect(screen.getByRole('button', { name: 'сорвался' })).toBeDisabled()
    expect(pageStart()).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Завершить день' })).toBeNull()
  })

  it('до утреннего часа «Начать день» открывает окно утра и записывает утро', async () => {
    const user = userEvent.setup()
    render(<DayPage />)
    expect(screen.getByText(/три коротких вопроса/i)).toBeInTheDocument()

    await user.click(pageStart())
    await fillMorning(user)

    expect(mocked.startDay).toHaveBeenCalledWith(
      { day: TODAY, morning: { sleep: 6, wellbeing: 6, mood: 6 }, startedAt: expect.any(String) },
      expect.anything(),
    )
  })

  it('«Пропустить утро» начинает день без оценок', async () => {
    const user = userEvent.setup()
    render(<DayPage />)
    await user.click(pageStart())
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: /пропустить утро/i }))

    expect(mocked.startDay).toHaveBeenCalledWith(
      { day: TODAY, morning: null, startedAt: expect.any(String) },
      expect.anything(),
    )
  })

  it('после утреннего часа «Начать день» начинает день сразу, без окна и без оценок', async () => {
    at(16)
    const user = userEvent.setup()
    render(<DayPage />)
    expect(screen.getByText(/утренние вопросы — до 15:00/i)).toBeInTheDocument()

    await user.click(pageStart())
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(mocked.startDay).toHaveBeenCalledWith(
      { day: TODAY, morning: null, startedAt: expect.any(String) },
      expect.anything(),
    )
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

  it('пока начала дней загружаются — не «День не начат»', () => {
    mocked.startsPending = true
    render(<DayPage />)

    expect(screen.getByText('Загружаю…')).toBeInTheDocument()
    expect(screen.queryByText('День не начат')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Начать день' })).toBeNull()
  })
})

describe('экран дня — начало дня без ловушек', () => {
  it('двойной Enter по «Начать день» после утреннего часа не открывает окно итога', async () => {
    at(16)
    acceptStart()
    const user = userEvent.setup()
    const { rerender } = render(<DayPage />)

    pageStart().focus()
    await user.keyboard('{Enter}')
    rerender(<DayPage />)
    // новая кнопка — новый узел: фокус «Начать день» ей не достаётся
    expect(screen.getByRole('button', { name: 'Завершить день' })).not.toHaveFocus()
    await user.keyboard('{Enter}')

    expect(screen.getByRole('button', { name: 'Завершить день' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('второй клик сразу после старта не открывает окно итога, а спустя пару секунд — открывает', async () => {
    at(16)
    acceptStart()
    const user = userEvent.setup()
    const { rerender } = render(<DayPage />)

    await user.click(pageStart())
    rerender(<DayPage />)
    await user.click(screen.getByRole('button', { name: 'Завершить день' }))
    expect(screen.queryByRole('dialog')).toBeNull()

    vi.setSystemTime(new Date(2026, 8, 21, 16, 0, 2))
    await user.click(screen.getByRole('button', { name: 'Завершить день' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('страница, открытая до полуночи: утро нового дня пишется под новым днём, а не под вчерашним', async () => {
    vi.setSystemTime(new Date(2026, 8, 21, 23, 50))
    const user = userEvent.setup()
    render(<DayPage />)

    vi.setSystemTime(new Date(2026, 8, 22, 0, 10))
    await user.click(pageStart())
    // страница может сначала догнать новый день — тогда окно открывается вторым нажатием
    if (!screen.queryByRole('dialog')) await user.click(pageStart())
    await fillMorning(user)

    expect(mocked.startDay).toHaveBeenCalledWith(expect.objectContaining({ day: '2026-09-22' }), expect.anything())
    expect(mocked.startDay).not.toHaveBeenCalledWith(expect.objectContaining({ day: TODAY }), expect.anything())
    expect(screen.getByText(/22 сентября/)).toBeInTheDocument()
  })

  it('окно утра, открытое вечером до утреннего часа, а отправленное после полуночи, не пишет утро под вчерашним днём', async () => {
    mocked.settings = { morningUntil: 20 }
    at(19, 59)
    const user = userEvent.setup()
    render(<DayPage />)
    await user.click(pageStart())

    vi.setSystemTime(new Date(2026, 8, 22, 0, 5))
    await fillMorning(user)

    expect(mocked.startDay).not.toHaveBeenCalledWith(expect.objectContaining({ day: TODAY }), expect.anything())
    expect(screen.getByText(/22 сентября/)).toBeInTheDocument()
  })

  it('окно утра, открытое до утреннего часа, а отправленное после, начинает день без утра', async () => {
    at(14, 59)
    const user = userEvent.setup()
    render(<DayPage />)
    await user.click(pageStart())

    at(15, 30)
    await fillMorning(user)

    expect(mocked.startDay).toHaveBeenCalledWith(
      { day: TODAY, morning: null, startedAt: expect.any(String) },
      expect.anything(),
    )
  })

  it('на границе часа плашка обновляется сама — при возврате во вкладку', async () => {
    at(14, 59)
    render(<DayPage />)
    expect(screen.getByText(/три коротких вопроса/i)).toBeInTheDocument()

    at(15, 1)
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(screen.getByText(/утренние вопросы — до 15:00/i)).toBeInTheDocument()
  })

  it('час проверяется в момент нажатия: плашка устарела — окна утра всё равно нет', async () => {
    at(14, 59)
    const user = userEvent.setup()
    render(<DayPage />)

    at(15, 1)
    await user.click(pageStart())
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(mocked.startDay).toHaveBeenCalledWith(
      { day: TODAY, morning: null, startedAt: expect.any(String) },
      expect.anything(),
    )
  })

  it('тост «День начат» — только когда хранилище приняло начало, а ошибка видна', async () => {
    at(16)
    mocked.startDay.mockImplementation((_start: DayStart, options?: { onError?: (e: Error) => void }) =>
      options?.onError?.(new Error('День 2026-09-21 уже начат: утро не правится')),
    )
    const user = userEvent.setup()
    render(<DayPage />)
    await user.click(pageStart())

    expect(toast).not.toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalled()
  })
})

describe('экран дня — день начат', () => {
  it('без блюра: отметки доступны, цифра отмечает, снизу «Завершить день»', async () => {
    mocked.starts = [started({ sleep: 7, wellbeing: 6, mood: 5 })]
    const user = userEvent.setup()
    render(<DayPage />)

    expect(screen.queryByText('День не начат')).toBeNull()
    expect(screen.getByText('Читать 20 страниц').closest('.pointer-events-none')).toBeNull()
    expect(markButton()).toBeEnabled()
    expect(screen.getByRole('button', { name: 'сорвался' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Завершить день' })).toBeInTheDocument()
    await user.keyboard('1')
    expect(mocked.setEntry).toHaveBeenCalled()
  })

  it('под заголовком — утро', () => {
    mocked.starts = [started({ sleep: 7, wellbeing: 6, mood: 5 })]
    render(<DayPage />)
    expect(screen.getByText('Утро: сон 7 · самочувствие 6 · настроение 5')).toBeInTheDocument()
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
