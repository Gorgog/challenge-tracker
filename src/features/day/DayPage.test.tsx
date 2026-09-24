import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Challenge, DayLog, DayStart, EntryMap, Settings } from '@/domain/types'
import { DayPage } from './DayPage'

const TODAY = '2026-09-21'

const mocked = vi.hoisted(() => ({
  challenges: [] as Challenge[],
  entries: {} as Record<string, EntryMap>,
  logs: [] as DayLog[],
  starts: [] as DayStart[],
  startsPending: false,
  /** Какой запрос экрана ещё идёт или не загрузился. */
  pending: null as null | 'entries' | 'logs',
  failed: null as null | 'challenges' | 'entries' | 'logs' | 'starts' | 'settings',
  settings: { morningUntil: 15 } as Settings,
  startDay: vi.fn(),
  setEntry: vi.fn(),
  closeDay: vi.fn(),
  savePending: false,
  savePaused: false,
  /** Фоновое обновление не прошло: данные есть, `isError` поднят. */
  stale: false,
}))

const answer = (name: string, data: unknown) =>
  mocked.failed === name
    ? { data: undefined, isPending: false, isError: true }
    : mocked.pending === name
      ? { data: undefined, isPending: true, isError: false }
      : { data, isPending: false, isError: mocked.stale }

vi.mock('@/data/queries', () => ({
  useChallenges: () => answer('challenges', mocked.challenges),
  useEntries: () => answer('entries', mocked.entries),
  useDayLogs: () => answer('logs', mocked.logs),
  useDayGroups: () => ({ data: ['tasks', 'holds'], isPending: false }),
  useDayStarts: () =>
    mocked.startsPending ? { data: undefined, isPending: true } : answer('starts', mocked.starts),
  useSettings: () => answer('settings', mocked.settings),
  useSetEntry: () => ({ mutate: mocked.setEntry }),
  useCloseDay: () => ({ mutate: mocked.closeDay, isPending: mocked.savePending, isPaused: mocked.savePaused }),
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

/** Ночь полями (лёг 23:30, встал 7:40), три утренние оценки с клавиатуры (с пятёрки на шестёрку) — и начать день. */
async function fillMorning(user: ReturnType<typeof userEvent.setup>, night = { bed: '23:30', wake: '07:40' }) {
  const dialog = screen.getByRole('dialog')
  fireEvent.change(within(dialog).getByLabelText('Лёг, точное время'), { target: { value: night.bed } })
  fireEvent.change(within(dialog).getByLabelText('Встал, точное время'), { target: { value: night.wake } })
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
    entries: {},
    logs: [],
    starts: [],
    startsPending: false,
    pending: null,
    failed: null,
    settings: { morningUntil: 15 },
  })
  mocked.startDay.mockReset()
  mocked.setEntry.mockReset()
  mocked.closeDay.mockReset()
  mocked.savePending = false
  mocked.savePaused = false
  mocked.stale = false
  vi.mocked(toast).mockReset()
  vi.mocked(toast.error).mockReset()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('экран дня — данные с сервера', () => {
  it.each(['entries', 'logs'] as const)('пока идёт %s — «Загружаю…», а не пустой день и не долг по оценкам', (name) => {
    mocked.pending = name
    render(<DayPage />)
    expect(screen.getByText('Загружаю…')).toBeInTheDocument()
    expect(screen.queryByText(/без оценки/)).toBeNull()
    expect(screen.queryByRole('button', { name: /отметить/i })).toBeNull()
  })

  it.each(['challenges', 'entries', 'logs', 'starts', 'settings'] as const)(
    'не загрузилось (%s) — сообщение, а не пустые данные, по которым можно записать поверх',
    (name) => {
      mocked.failed = name
      render(<DayPage />)
      expect(screen.getByRole('alert')).toHaveTextContent('Не удалось загрузить')
      expect(screen.queryByRole('button', { name: /отметить|оценить|начать день/i })).toBeNull()
    },
  )

  it('новый пользователь: челлендж заведён сегодня, записей нет — долга по оценкам нет', () => {
    mocked.challenges = [{ ...read, startDate: TODAY }]
    render(<DayPage />)
    expect(screen.queryByText(/без оценки/)).toBeNull()
  })

  it('ничего нет совсем — долга нет', () => {
    mocked.challenges = []
    render(<DayPage />)
    expect(screen.queryByText(/без оценки/)).toBeNull()
  })

  it('первый день пользования — по самому раннему началу дня, даже если челлендж моложе', () => {
    mocked.challenges = [{ ...read, startDate: TODAY }]
    mocked.starts = [{ day: '2026-09-19', morning: null, startedAt: '2026-09-19T08:00:00.000Z' }]
    render(<DayPage />)
    expect(screen.getByText('2 дня без оценки')).toBeInTheDocument()
  })

  it('первый день пользования — и по самому раннему итогу', () => {
    mocked.challenges = [{ ...read, startDate: TODAY }]
    mocked.logs = [{ ...closed, day: '2026-09-17', closedAt: '2026-09-17T20:00:00.000Z' }]
    render(<DayPage />)
    expect(screen.getByText('3 дня без оценки')).toBeInTheDocument()
  })

  it('фоновое обновление не прошло, данные есть — экран работает, а не «не удалось загрузить»', () => {
    mocked.stale = true
    render(<DayPage />)
    expect(screen.queryByRole('alert')).toBeNull()
    expect(markButton()).toBeInTheDocument()
  })

  it('база отказала — окно с оценками остаётся, но из него можно выйти; пока ждём — выйти нельзя', async () => {
    at(20)
    mocked.starts = [started({ sleep: 7, wellbeing: 6, mood: 6 })]
    /* как настоящая оптимистичная запись: итог сразу в кэше, запрос идёт */
    mocked.closeDay.mockImplementation(({ log }: { log: DayLog }) => {
      mocked.logs = [...mocked.logs, log]
      mocked.savePending = true
    })
    const user = userEvent.setup()
    const { rerender } = render(<DayPage />)
    await user.click(screen.getByRole('button', { name: 'Завершить день' }))
    const dialog = screen.getByRole('dialog')
    for (const name of [/настроение/i, /самочувствие/i, /продуктивность/i]) {
      within(dialog).getByRole('slider', { name }).focus()
      await user.keyboard('{ArrowRight}')
    }
    await user.click(within(within(dialog).getByRole('group', { name: 'Без сигарет' })).getByRole('button', { name: 'Да, без' }))
    await user.click(within(dialog).getByRole('button', { name: /закрыть день/i }))
    rerender(<DayPage />)

    /* окно не превратилось в «Оценку дня» с «Отменой» из-за итога в кэше */
    expect(screen.getByText('Как прошёл день')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Сохраняю…' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: /отмена/i })).toBeNull()

    /* отказ: кэш откатился, окно с оценками на месте, выйти можно */
    mocked.logs = []
    mocked.savePending = false
    act(() => mocked.closeDay.mock.calls[0]![1].onError(new Error('нет сети')))
    rerender(<DayPage />)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.queryAllByText('не выбрано')).toHaveLength(0)
    await user.click(screen.getByRole('button', { name: /отмена/i }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('нет сети — запись ждёт связь, окно не запирает: «Нет связи» и выход', async () => {
    at(20)
    mocked.starts = [started({ sleep: 7, wellbeing: 6, mood: 6 })]
    /* TanStack без сети ставит запись на паузу: isPending и isPaused, запроса нет, ошибки нет */
    mocked.closeDay.mockImplementation(({ log }: { log: DayLog }) => {
      mocked.logs = [...mocked.logs, log]
      mocked.savePending = true
      mocked.savePaused = true
    })
    const user = userEvent.setup()
    const { rerender } = render(<DayPage />)
    await user.click(screen.getByRole('button', { name: 'Завершить день' }))
    const dialog = screen.getByRole('dialog')
    for (const name of [/настроение/i, /самочувствие/i, /продуктивность/i]) {
      within(dialog).getByRole('slider', { name }).focus()
      await user.keyboard('{ArrowRight}')
    }
    await user.click(within(within(dialog).getByRole('group', { name: 'Без сигарет' })).getByRole('button', { name: 'Да, без' }))
    await user.click(within(dialog).getByRole('button', { name: /закрыть день/i }))
    rerender(<DayPage />)

    expect(screen.getByText(/Нет связи/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /отмена|закрыть окно/i }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('«День закрыт» и закрытие окна — только когда база приняла итог; иначе окно с оценками остаётся', async () => {
    at(20)
    mocked.starts = [started({ sleep: 7, wellbeing: 6, mood: 6 })]
    const user = userEvent.setup()
    render(<DayPage />)
    await user.click(screen.getByRole('button', { name: 'Завершить день' }))
    const dialog = screen.getByRole('dialog')
    for (const name of [/настроение/i, /самочувствие/i, /продуктивность/i]) {
      within(dialog).getByRole('slider', { name }).focus()
      await user.keyboard('{ArrowRight}')
    }
    await user.click(within(within(dialog).getByRole('group', { name: 'Без сигарет' })).getByRole('button', { name: 'Да, без' }))
    await user.click(within(dialog).getByRole('button', { name: /закрыть день/i }))

    expect(mocked.closeDay).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(toast).not.toHaveBeenCalledWith('День закрыт')

    act(() => mocked.closeDay.mock.calls[0]![1].onSuccess())
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(toast).toHaveBeenCalledWith('День закрыт')
  })
})

describe('экран дня — отказ отвечает вечером «Да, без» (срез 5а)', () => {
  const closeAt20 = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(screen.getByRole('button', { name: 'Завершить день' }))
    const dialog = screen.getByRole('dialog')
    for (const name of [/настроение/i, /самочувствие/i, /продуктивность/i]) {
      within(dialog).getByRole('slider', { name }).focus()
      await user.keyboard('{ArrowRight}')
    }
    return dialog
  }

  it('в окне итога — вопрос по отказу; без ответа день не закрыть; ответ уходит вместе с итогом', async () => {
    at(20)
    mocked.starts = [started({ sleep: 7, wellbeing: 6, mood: 6 })]
    const user = userEvent.setup()
    render(<DayPage />)
    const dialog = await closeAt20(user)
    const close = within(dialog).getByRole('button', { name: /закрыть день/i })
    expect(close).toBeDisabled()
    await user.click(within(within(dialog).getByRole('group', { name: 'Без сигарет' })).getByRole('button', { name: 'Да, без' }))
    await user.click(close)
    expect(mocked.closeDay).toHaveBeenCalledTimes(1)
    expect(mocked.closeDay.mock.calls[0]![0]).toMatchObject({ log: { day: TODAY }, answers: { smoke: 1 } })
  })

  it('срыв, отмеченный днём, в окне уже стоит «Сорвался»', async () => {
    at(20)
    mocked.starts = [started({ sleep: 7, wellbeing: 6, mood: 6 })]
    mocked.entries = { smoke: { [TODAY]: 0 } }
    const user = userEvent.setup()
    render(<DayPage />)
    const dialog = await closeAt20(user)
    expect(within(within(dialog).getByRole('group', { name: 'Без сигарет' })).getByRole('button', { name: 'Сорвался' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(within(dialog).getByRole('button', { name: /закрыть день/i })).toBeEnabled()
  })

  it('отказ на паузе, удалённый или заведённый позже дня — не спрашивается', async () => {
    at(20)
    mocked.starts = [started({ sleep: 7, wellbeing: 6, mood: 6 })]
    mocked.challenges = [
      read,
      smoke,
      { ...smoke, id: 'paused', name: 'На паузе', pauses: [{ from: '2026-09-20', to: null }] },
      { ...smoke, id: 'gone', name: 'Удалён', deletedAt: '2026-09-21T09:00:00' },
      { ...smoke, id: 'later', name: 'Со следующего дня', startDate: '2026-09-22' },
    ]
    const user = userEvent.setup()
    render(<DayPage />)
    const dialog = await closeAt20(user)
    expect(within(dialog).getAllByRole('group').map((g) => g.getAttribute('aria-label'))).toEqual(['Без сигарет'])
  })

  it('карточка отказа днём напоминает: ответ — вечером; под «Завершить день» — что спросят', () => {
    at(12)
    mocked.starts = [started({ sleep: 7, wellbeing: 6, mood: 6 })]
    render(<DayPage />)
    expect(screen.getByText(/ответ — вечером/i)).toBeInTheDocument()
    expect(screen.getByText(/и ответ по отказам/i)).toBeInTheDocument()
  })

  it('день закрыт с ответом — напоминания нет (ревью 5а)', () => {
    at(21)
    mocked.starts = [started({ sleep: 7, wellbeing: 6, mood: 6 })]
    mocked.logs = [closed]
    mocked.entries = { smoke: { [TODAY]: 1 } }
    render(<DayPage />)
    expect(screen.queryByText(/ответ — вечером|ответь в оценке дня/i)).toBeNull()
  })

  it('день закрыт, а отказ без ответа (заведён после) — «ответь в оценке дня», и «Изменить оценку» даёт ответить', async () => {
    at(21)
    mocked.starts = [started({ sleep: 7, wellbeing: 6, mood: 6 })]
    mocked.logs = [closed]
    const user = userEvent.setup()
    render(<DayPage />)
    expect(screen.getByText(/ответь в оценке дня/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Изменить оценку' }))
    const dialog = screen.getByRole('dialog')
    await user.click(within(within(dialog).getByRole('group', { name: 'Без сигарет' })).getByRole('button', { name: 'Да, без' }))
    await user.click(within(dialog).getByRole('button', { name: 'Сохранить' }))
    expect(mocked.closeDay.mock.calls[0]![0]).toMatchObject({ log: { day: TODAY }, answers: { smoke: 1 } })
  })

  it('отказ сегодня вне челленджа (пауза до сегодня) — напоминания нет', () => {
    at(12)
    mocked.starts = [started({ sleep: 7, wellbeing: 6, mood: 6 })]
    mocked.challenges = [read, { ...smoke, pauses: [{ from: '2026-09-10', to: TODAY }] }]
    render(<DayPage />)
    expect(screen.getByText('Без сигарет')).toBeInTheDocument()
    expect(screen.queryByText(/ответ — вечером|ответь в оценке дня/i)).toBeNull()
  })

  it('«Отменить» в тосте срыва после закрытия дня не трогает закрытый день (ревью 5а)', async () => {
    at(20)
    mocked.starts = [started({ sleep: 7, wellbeing: 6, mood: 6 })]
    const user = userEvent.setup()
    const { rerender } = render(<DayPage />)
    await user.click(screen.getByRole('button', { name: 'сорвался' }))
    expect(mocked.setEntry).toHaveBeenCalledTimes(1)
    const undo = vi.mocked(toast).mock.calls.at(-1)![1] as unknown as { action: { onClick: () => void } }
    /* день закрыли, пока тост ещё висит */
    mocked.entries = { smoke: { [TODAY]: 0 } }
    mocked.logs = [closed]
    rerender(<DayPage />)
    act(() => undo.action.onClick())
    expect(mocked.setEntry).toHaveBeenCalledTimes(1)
    expect(toast).toHaveBeenCalledWith(expect.stringMatching(/День уже закрыт/))
  })
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
    expect(screen.getByText(/пять коротких вопросов: когда лёг и встал, сон/i)).toBeInTheDocument()

    await user.click(pageStart())
    await fillMorning(user)

    expect(mocked.startDay).toHaveBeenCalledWith(
      {
        day: TODAY,
        morning: { sleep: 6, wellbeing: 6, mood: 6, night: { bed: -30, wake: 460, bedHow: 'exact', wakeHow: 'exact' } },
        startedAt: expect.any(String),
      },
      expect.anything(),
    )
  })

  it('часы страницы отстают на минуту — подъём в текущую минуту не «ещё не наступило» (ревью 24.09)', async () => {
    at(7, 39)
    const user = userEvent.setup()
    render(<DayPage />)
    await user.click(pageStart())
    /* часы страницы обновятся только через минуту, а на деле уже 7:40:30 */
    vi.setSystemTime(new Date(2026, 8, 21, 7, 40, 30))
    await fillMorning(user, { bed: '23:30', wake: '07:40' })
    expect(mocked.startDay).toHaveBeenCalledWith(
      expect.objectContaining({ morning: expect.objectContaining({ night: expect.objectContaining({ wake: 460 }) }) }),
      expect.anything(),
    )
  })

  it('«как обычно» — из своих прошлых утр: середина ответов за 14 дней', async () => {
    const night = (bed: number, wake: number) => ({ bed, wake, bedHow: 'exact' as const, wakeHow: 'exact' as const })
    mocked.starts = [
      { day: '2026-09-18', morning: { sleep: 7, wellbeing: 6, mood: 6, night: night(-40, 450) }, startedAt: '2026-09-18T05:00:00.000Z' },
      { day: '2026-09-19', morning: { sleep: 7, wellbeing: 6, mood: 6, night: night(-30, 460) }, startedAt: '2026-09-19T05:00:00.000Z' },
      { day: '2026-09-20', morning: { sleep: 7, wellbeing: 6, mood: 6, night: night(20, 500) }, startedAt: '2026-09-20T05:00:00.000Z' },
    ]
    const user = userEvent.setup()
    render(<DayPage />)
    await user.click(pageStart())
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByRole('button', { name: /лёг как обычно/i })).toHaveTextContent('23:30')
    expect(within(dialog).getByRole('button', { name: /встал как обычно/i })).toHaveTextContent('7:40')
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
    /* в 0:10 подъём в 7:40 ещё не наступил — ночь, какая бывает после полуночи */
    await fillMorning(user, { bed: '23:00', wake: '00:05' })

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
    /* окно сверяет подъём с настоящими часами: в 0:05 встать можно было только до 0:05 */
    await fillMorning(user, { bed: '23:30', wake: '00:00' })

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
    expect(screen.getByText(/пять коротких вопросов: когда лёг и встал, сон/i)).toBeInTheDocument()

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

  /* Ошибку начала дня показывает сам хук (meta.errorText, queries.test.tsx): страницу могли уже покинуть. */
  it('тост «День начат» — только когда хранилище приняло начало', async () => {
    at(16)
    mocked.startDay.mockImplementation((_start: DayStart, options?: { onError?: (e: Error) => void }) =>
      options?.onError?.(new Error('День 2026-09-21 уже начат: утро не правится')),
    )
    const user = userEvent.setup()
    render(<DayPage />)
    await user.click(pageStart())

    expect(toast).not.toHaveBeenCalled()
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

  it('под утром — ночь, если записана', () => {
    mocked.starts = [started({ sleep: 7, wellbeing: 6, mood: 5, night: { bed: 30, wake: 460, bedHow: 'exact', wakeHow: 'usual' } })]
    render(<DayPage />)
    expect(screen.getByText('Ночь: лёг 00:30 · встал 7:40')).toBeInTheDocument()
  })

  it('утро без ночи — строки ночи нет', () => {
    mocked.starts = [started({ sleep: 7, wellbeing: 6, mood: 5 })]
    render(<DayPage />)
    expect(screen.queryByText(/Ночь:/)).toBeNull()
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

describe('«Ложусь раньше» на экране дня (срез 4б)', () => {
  const bed: Challenge = { ...read, id: 'bed', code: 'ЛР', name: 'Ложусь раньше', measure: 'bedtime', goal: -30, sortOrder: 2 }
  const YESTERDAY = '2026-09-20'
  const show = (yesterday: number | undefined) => {
    mocked.challenges = [read, bed]
    mocked.starts = [started({ sleep: 7, wellbeing: 6, mood: 6 })]
    mocked.entries = { bed: yesterday === undefined ? {} : { [YESTERDAY]: yesterday } }
    render(<DayPage />)
  }

  it('строка без отметки: цель, сегодня считается завтра, вчерашний отбой; в счёт задач не идёт', () => {
    show(-40)
    expect(screen.getByText('Ложусь раньше · до 23:30')).toBeInTheDocument()
    expect(screen.getByText('Сегодня посчитается завтра утром · вчера лёг в 23:20 ✓')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Отметить: Ложусь раньше' })).toBeNull()
    expect(screen.getByText(/0 из 1 задачи закрыто/)).toBeInTheDocument()
  })

  it('вчера позже цели, ночь не записана, ещё не известна — так и сказано', () => {
    show(40)
    expect(screen.getByText('Сегодня посчитается завтра утром · вчера лёг в 00:40 — позже')).toBeInTheDocument()
    cleanup()
    show(NaN)
    expect(screen.getByText('Сегодня посчитается завтра утром · вчера — ночь не записана')).toBeInTheDocument()
    cleanup()
    show(undefined)
    expect(screen.getByText('Сегодня посчитается завтра утром · вчера — посчитается, когда начнёшь день')).toBeInTheDocument()
  })

  it('стоит в «Идут сами» — его не отмечают; номера и цифры — только у задач «Отмечаю сам» (ревью 4б)', async () => {
    const user = userEvent.setup()
    const write: Challenge = { ...read, id: 'write', code: 'ПСТ', name: 'Писать', sortOrder: 3 }
    mocked.challenges = [read, { ...bed, sortOrder: 1 }, write]
    mocked.starts = [started({ sleep: 7, wellbeing: 6, mood: 6 })]
    mocked.entries = { bed: { [YESTERDAY]: -40 } }
    render(<DayPage />)
    const follows = (a: HTMLElement, b: HTMLElement) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)
    const own = screen.getByText('Идут сами')
    const row = screen.getByText('Ложусь раньше · до 23:30')
    expect(follows(own, row)).toBe(true)
    expect(follows(screen.getByText('Писать'), own)).toBe(true)
    expect(screen.getByText(/0 из 2 задач закрыто/)).toBeInTheDocument()
    await user.keyboard('2')
    // «2» — вторая задача «Отмечаю сам» («Писать»), а не «Ложусь раньше»
    expect(mocked.setEntry).toHaveBeenCalledTimes(1)
    expect(mocked.setEntry.mock.calls[0]![0]).toMatchObject({ challengeId: 'write' })
  })

  it('лёг ровно в цель — выполнено; челлендж начат сегодня — про вчера молчит', () => {
    show(-30)
    expect(screen.getByText('Сегодня посчитается завтра утром · вчера лёг в 23:30 ✓')).toBeInTheDocument()
    cleanup()
    mocked.challenges = [read, { ...bed, startDate: TODAY }]
    mocked.starts = [started({ sleep: 7, wellbeing: 6, mood: 6 })]
    mocked.entries = { bed: { [YESTERDAY]: -40 } }
    render(<DayPage />)
    expect(screen.getByText('Сегодня посчитается завтра утром')).toBeInTheDocument()
  })
})
