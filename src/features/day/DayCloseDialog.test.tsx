import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Challenge, DayLog } from '@/domain/types'
import { DayCloseDialog } from './DayCloseDialog'

const setup = (over: Partial<Parameters<typeof DayCloseDialog>[0]> = {}) => {
  const onSave = vi.fn()
  render(<DayCloseDialog open day="2026-09-21" pendingCount={0} onSave={onSave} {...over} />)
  return { onSave, user: userEvent.setup() }
}

const slider = (name: string) => screen.getByRole('slider', { name: new RegExp(name, 'i') })
const saveButton = () => screen.getByRole('button', { name: /закрыть день|сохранить/i })

/** Сдвинуть ползунок с клавиатуры: фокус на бегунке, стрелка вправо. */
async function move(user: ReturnType<typeof userEvent.setup>, name: string) {
  slider(name).focus()
  await user.keyboard('{ArrowRight}')
}

describe('окно итога дня — пока база отвечает', () => {
  it('«Сохраняю…», кнопка выключена, «Отмены» нет — оценки не потеряются на полпути', () => {
    render(<DayCloseDialog open day="2026-09-21" saving onSave={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Сохраняю…' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: /отмена/i })).toBeNull()
  })
})

describe('окно итога дня — нет сети', () => {
  it('запись ждёт сеть: так и сказано, и из окна можно выйти', () => {
    const onCancel = vi.fn()
    render(<DayCloseDialog open day="2026-09-21" offline onSave={vi.fn()} onCancel={onCancel} />)
    expect(screen.getByText(/Нет связи/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /отмена|закрыть окно/i })).toBeEnabled()
  })
})

describe('окно итога дня', () => {
  it('три оценки стартуют не выставленными', () => {
    setup()
    expect(screen.getAllByText('не выбрано')).toHaveLength(3)
  })

  it('на шкале 0–10 пятёрка стоит ровно посередине', () => {
    setup()
    expect(screen.getAllByText(/5 — как обычно/)[0]!.style.left).toBe('50%')
  })

  it('крайние якоря прижаты к краям дорожки, а нижний — ноль', () => {
    setup()
    expect(screen.getAllByText(/0 — дно/)[0]!.style.left).toBe('0%')
    expect(screen.getAllByText(/10 — отличное/)[0]!.style.left).toBe('100%')
  })

  it('ноль — допустимая оценка', async () => {
    const { user } = setup()
    slider('настроение').focus()
    await user.keyboard('{Home}')
    expect(screen.getByText('0 из 10')).toBeInTheDocument()
  })

  it('кнопка неактивна, пока выставлены не все три оценки', async () => {
    const { user } = setup()
    expect(saveButton()).toBeDisabled()

    await move(user, 'настроение')
    expect(saveButton()).toBeDisabled()

    await move(user, 'самочувствие')
    expect(saveButton()).toBeDisabled()
  })

  it('с клавиатуры шаг — ровно единица, хоть под пальцем ползунок и плавный', async () => {
    const { user } = setup()
    slider('настроение').focus()
    await user.keyboard('{ArrowRight}{ArrowRight}')
    expect(screen.getByText('7 из 10')).toBeInTheDocument()

    await user.keyboard('{End}')
    expect(screen.getByText('10 из 10')).toBeInTheDocument()
  })

  it('кнопка включается, когда сдвинуты все три', async () => {
    const { user } = setup()
    for (const name of ['настроение', 'самочувствие', 'продуктивность']) await move(user, name)
    expect(saveButton()).toBeEnabled()
  })

  it('сохраняет оценки, теги и комментарий', async () => {
    const { user, onSave } = setup()
    for (const name of ['настроение', 'самочувствие', 'продуктивность']) await move(user, name)
    await user.click(screen.getByRole('button', { name: 'дедлайн' }))
    await user.type(screen.getByRole('textbox'), 'проверка')
    await user.click(saveButton())

    expect(onSave).toHaveBeenCalledTimes(1)
    const log = onSave.mock.calls[0]![0] as DayLog
    expect(log.day).toBe('2026-09-21')
    expect(log.tags).toEqual(['дедлайн'])
    expect(log.note).toBe('проверка')
    expect(log.closedAt).not.toBeNull()
    for (const v of [log.mood, log.wellbeing, log.productivity]) {
      expect(v).toBeGreaterThanOrEqual(1)
      expect(v).toBeLessThanOrEqual(10)
    }
  })

  it('Escape не закрывает окно, пока оценки не выставлены', async () => {
    const { user } = setup()
    await user.keyboard('{Escape}')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(saveButton()).toBeInTheDocument()
  })

  it('крестика для закрытия нет', () => {
    setup()
    expect(screen.queryByRole('button', { name: /close|закрыть окно/i })).not.toBeInTheDocument()
  })

  it('предупреждает, сколько задач останется невыполненными', () => {
    setup({ pendingCount: 2 })
    expect(screen.getByText(/2 задачи останутся невыполненными/i)).toBeInTheDocument()
  })

  it('правка уже закрытого дня открывается с прежними оценками и даёт отменить', () => {
    const existing: DayLog = {
      day: '2026-09-21',
      mood: 7,
      wellbeing: 6,
      productivity: 8,
      tags: ['отдых'],
      note: 'было',
      closedAt: '2026-09-21T21:00:00.000Z',
    }
    setup({ existing, onCancel: vi.fn() })

    expect(screen.queryByText('не выбрано')).not.toBeInTheDocument()
    expect(screen.getByRole('textbox')).toHaveValue('было')
    expect(screen.getByRole('button', { name: /отмена/i })).toBeInTheDocument()
    expect(saveButton()).toBeEnabled()
  })
})

describe('окно итога дня — отказы отвечают «Да, без» (срез 5а)', () => {
  const quit = (id: string, name: string): Challenge => ({
    id,
    name,
    code: 'БСГ',
    kind: 'quit',
    measure: 'binary',
    goal: 1,
    unit: null,
    color: 'var(--chart-2)',
    tagIds: [],
    startDate: '2026-09-01',
    lengthDays: null,
    pauses: [],
    rulesLocked: false,
    deletedAt: null,
    sortOrder: 1,
  })
  const smoke = quit('smoke', 'Без сигарет')
  const sugar = quit('sugar', 'Без сахара')
  const row = (name: string) => within(screen.getByRole('group', { name }))
  const scores = async (user: ReturnType<typeof userEvent.setup>) => {
    for (const name of ['настроение', 'самочувствие', 'продуктивность']) await move(user, name)
  }

  it('строка на каждый отказ, заранее ничего не выбрано', () => {
    setup({ quits: [{ challenge: smoke }, { challenge: sugar }] })
    for (const name of ['Без сигарет', 'Без сахара']) {
      expect(row(name).getByRole('button', { name: 'Да, без' })).toHaveAttribute('aria-pressed', 'false')
      expect(row(name).getByRole('button', { name: 'Сорвался' })).toHaveAttribute('aria-pressed', 'false')
    }
  })

  it('оценки стоят, а отказ не отвечен — день не закрыть, и сказано почему', async () => {
    const { user } = setup({ quits: [{ challenge: smoke }, { challenge: sugar }] })
    await scores(user)
    expect(saveButton()).toBeDisabled()
    expect(screen.getByText(/Осталось ответить: 2 отказа/)).toBeInTheDocument()

    await user.click(row('Без сигарет').getByRole('button', { name: 'Да, без' }))
    expect(saveButton()).toBeDisabled()
    expect(screen.getByText(/Осталось ответить: 1 отказ/)).toBeInTheDocument()

    await user.click(row('Без сахара').getByRole('button', { name: 'Сорвался' }))
    expect(saveButton()).toBeEnabled()
  })

  it('ответы уходят вместе с итогом: «Да, без» — 1, «Сорвался» — 0', async () => {
    const { user, onSave } = setup({ quits: [{ challenge: smoke }, { challenge: sugar }] })
    await scores(user)
    await user.click(row('Без сигарет').getByRole('button', { name: 'Да, без' }))
    await user.click(row('Без сахара').getByRole('button', { name: 'Сорвался' }))
    await user.click(saveButton())
    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onSave.mock.calls[0]![1]).toEqual({ smoke: 1, sugar: 0 })
  })

  it('срыв, отмеченный днём, уже стоит ответом — и его можно поменять до закрытия', async () => {
    const { user, onSave } = setup({ quits: [{ challenge: smoke, value: 0 }] })
    expect(row('Без сигарет').getByRole('button', { name: 'Сорвался' })).toHaveAttribute('aria-pressed', 'true')
    await scores(user)
    expect(saveButton()).toBeEnabled()

    await user.click(row('Без сигарет').getByRole('button', { name: 'Да, без' }))
    await user.click(saveButton())
    expect(onSave.mock.calls[0]![1]).toEqual({ smoke: 1 })
  })

  it('без отказов окно как прежде: ответов нет', async () => {
    const { user, onSave } = setup()
    expect(screen.queryByRole('button', { name: 'Да, без' })).toBeNull()
    await scores(user)
    await user.click(saveButton())
    expect(onSave.mock.calls[0]![1]).toEqual({})
  })

  it('отметка не 0 и не 1 (старые данные) — не ответ: ничего не выбрано, ответить нужно', async () => {
    const { user } = setup({ quits: [{ challenge: smoke, value: 30 }] })
    expect(row('Без сигарет').getByRole('button', { name: 'Да, без' })).toHaveAttribute('aria-pressed', 'false')
    expect(row('Без сигарет').getByRole('button', { name: 'Сорвался' })).toHaveAttribute('aria-pressed', 'false')
    await scores(user)
    expect(saveButton()).toBeDisabled()
  })

  it('правка закрытого дня: ответ виден, заперт и заново не отправляется; неотвеченный можно ответить (ревью 5а)', async () => {
    const existing: DayLog = {
      day: '2026-09-21',
      mood: 7,
      wellbeing: 6,
      productivity: 8,
      tags: [],
      note: '',
      closedAt: '2026-09-21T21:00:00.000Z',
    }
    const { user, onSave } = setup({ existing, onCancel: vi.fn(), quits: [{ challenge: smoke, value: 1 }, { challenge: sugar }] })
    const yes = row('Без сигарет').getByRole('button', { name: 'Да, без' })
    expect(yes).toHaveAttribute('aria-pressed', 'true')
    expect(yes).toBeDisabled()
    /* неотвеченный — не обязателен: сохранить можно и так */
    expect(row('Без сахара').getByRole('button', { name: 'Да, без' })).toBeEnabled()
    expect(saveButton()).toBeEnabled()
    await user.click(saveButton())
    expect(onSave.mock.calls[0]![1]).toEqual({})
  })

  it('правка закрытого дня: ответ на неотвеченный отказ уходит, запертый — нет', async () => {
    const existing: DayLog = {
      day: '2026-09-21',
      mood: 7,
      wellbeing: 6,
      productivity: 8,
      tags: [],
      note: '',
      closedAt: '2026-09-21T21:00:00.000Z',
    }
    const { user, onSave } = setup({ existing, onCancel: vi.fn(), quits: [{ challenge: smoke, value: 0 }, { challenge: sugar }] })
    await user.click(row('Без сахара').getByRole('button', { name: 'Да, без' }))
    await user.click(saveButton())
    expect(onSave.mock.calls[0]![1]).toEqual({ sugar: 1 })
  })
})

describe('окно итога дня — теги со ступенями (срез 5б)', () => {
  const ALL_TAGS = [
    'выходной', 'дедлайн', 'болел', 'алкоголь', 'дорога', 'встречи', 'ссора', 'учёба', 'отдых',
    'игры', 'стресс', 'работа допоздна',
  ]
  const tagButton = (name: string) => screen.getByRole('button', { name })
  const group = (question: string) => within(screen.getByRole('group', { name: question }))
  const scores = async (user: ReturnType<typeof userEvent.setup>) => {
    for (const name of ['настроение', 'самочувствие', 'продуктивность']) await move(user, name)
  }

  it('видны чипы всех 12 тегов по порядку: новые — в конце, прежний порядок не меняется', () => {
    setup()
    for (const tag of ALL_TAGS) expect(tagButton(tag)).toBeInTheDocument()

    const names = screen
      .getAllByRole('button')
      .map((b) => b.textContent)
      .filter((t): t is string => ALL_TAGS.includes(t ?? ''))
    expect(names).toEqual(ALL_TAGS)
  })

  it('отметка тега со ступенями открывает группу вопроса: кнопки не нажаты, подсказка и note у алкоголя', async () => {
    const { user } = setup()
    await user.click(tagButton('алкоголь'))

    const g = group('Алкоголь — сколько?')
    for (const label of ['1–2', '3–5', '6+']) {
      expect(g.getByRole('button', { name: label })).toHaveAttribute('aria-pressed', 'false')
    }
    expect(g.getByText(/можно не выбирать/)).toBeInTheDocument()
    expect(g.getByText(/бокал вина 100 мл/)).toBeInTheDocument()
  })

  it('тег отмечен, ступень не выбрана — сохраняется без ступени (не подставляется значение по умолчанию)', async () => {
    const { user, onSave } = setup()
    await user.click(tagButton('алкоголь'))
    await scores(user)
    await user.click(saveButton())

    const log = onSave.mock.calls[0]![0] as DayLog
    expect(log.tags).toContain('алкоголь')
    expect(log.levels).toEqual({})
  })

  it('нажатие ступени отмечает кнопку и переименовывает чип («алкоголь · 3–5»)', async () => {
    const { user } = setup()
    await user.click(tagButton('алкоголь'))
    await user.click(group('Алкоголь — сколько?').getByRole('button', { name: '3–5' }))

    expect(group('Алкоголь — сколько?').getByRole('button', { name: '3–5' })).toHaveAttribute('aria-pressed', 'true')
    expect(tagButton('алкоголь · 3–5')).toBeInTheDocument()
    expect(tagButton('алкоголь · 3–5')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByRole('button', { name: 'алкоголь' })).toBeNull()
  })

  it('повторное нажатие той же ступени снимает её — чип возвращается к имени тега, и ступень правда пропала из состояния', async () => {
    const { user, onSave } = setup()
    await user.click(tagButton('алкоголь'))
    const pick = () => group('Алкоголь — сколько?').getByRole('button', { name: '3–5' })
    await user.click(pick())
    await user.click(pick())

    expect(pick()).toHaveAttribute('aria-pressed', 'false')
    expect(tagButton('алкоголь')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'алкоголь · 3–5' })).toBeNull()

    /* не только на экране: сохранённый лог не должен принести снятую ступень обратно */
    await scores(user)
    await user.click(saveButton())
    const log = onSave.mock.calls[0]![0] as DayLog
    expect(log.tags).toContain('алкоголь')
    expect(log.levels).toEqual({})
  })

  it('нажатие другой ступени переключает: прежняя гаснет, новая горит, чип обновляет имя', async () => {
    const { user } = setup()
    await user.click(tagButton('алкоголь'))
    const g = () => group('Алкоголь — сколько?')
    await user.click(g().getByRole('button', { name: '3–5' }))
    await user.click(g().getByRole('button', { name: '6+' }))

    expect(g().getByRole('button', { name: '3–5' })).toHaveAttribute('aria-pressed', 'false')
    expect(g().getByRole('button', { name: '6+' })).toHaveAttribute('aria-pressed', 'true')
    expect(tagButton('алкоголь · 6+')).toBeInTheDocument()
  })

  it('снятие тега убирает и группу, и ступень из сохраняемого лога; заново отмеченный тег ступень не помнит', async () => {
    const { user, onSave } = setup()
    await user.click(tagButton('алкоголь'))
    await user.click(group('Алкоголь — сколько?').getByRole('button', { name: '3–5' }))
    await user.click(tagButton('алкоголь · 3–5')) // снимаем тег целиком

    expect(screen.queryByRole('group', { name: 'Алкоголь — сколько?' })).toBeNull()
    expect(tagButton('алкоголь')).toBeInTheDocument()

    await user.click(tagButton('алкоголь')) // отмечаем заново — прежняя ступень не должна быть нажата
    const g2 = group('Алкоголь — сколько?')
    for (const label of ['1–2', '3–5', '6+']) {
      expect(g2.getByRole('button', { name: label })).toHaveAttribute('aria-pressed', 'false')
    }
    expect(tagButton('алкоголь')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'алкоголь · 3–5' })).toBeNull()

    await user.click(tagButton('алкоголь')) // снимаем ещё раз — в логе тега быть не должно
    await scores(user)
    await user.click(saveButton())
    const log = onSave.mock.calls[0]![0] as DayLog
    expect(log.tags).not.toContain('алкоголь')
    expect(log.levels).toEqual({})
  })

  it('в лог уходят ступени только отмеченных тегов: ничего не выбрано — {}', async () => {
    const { user, onSave } = setup()
    await scores(user)
    await user.click(saveButton())
    expect((onSave.mock.calls[0]![0] as DayLog).levels).toEqual({})
  })

  it('в лог уходит выбранная ступень тега', async () => {
    const { user, onSave } = setup()
    await user.click(tagButton('алкоголь'))
    await user.click(group('Алкоголь — сколько?').getByRole('button', { name: '3–5' }))
    await scores(user)
    await user.click(saveButton())
    const log = onSave.mock.calls[0]![0] as DayLog
    // алкоголь.short = ['1–2', '3–5', '6+']; '3–5' — индекс 1 → уровень 1 + 1 = 2
    expect(log.levels).toEqual({ 'алкоголь': 2 })
  })

  it('два тега со ступенями одновременно (игры + стресс) — у каждого своя группа', async () => {
    const { user, onSave } = setup()
    await user.click(tagButton('игры'))
    await user.click(tagButton('стресс'))

    const games = () => group('Игры — сколько часов?')
    const stress = () => group('Стресс — насколько?')
    for (const label of ['<1 ч', '1–2 ч', '3–4 ч', '5+ ч']) {
      expect(games().getByRole('button', { name: label })).toHaveAttribute('aria-pressed', 'false')
    }
    for (const label of ['немного', 'сильно', 'очень']) {
      expect(stress().getByRole('button', { name: label })).toHaveAttribute('aria-pressed', 'false')
    }
    /* note («1 порция ≈ …») — только у алкоголя; у других тегов со ступенями его быть не должно */
    expect(games().getByText(/можно не выбирать/)).toBeInTheDocument()
    expect(games().queryByText(/бокал вина/)).toBeNull()
    expect(stress().getByText(/можно не выбирать/)).toBeInTheDocument()
    expect(stress().queryByText(/бокал вина/)).toBeNull()

    await user.click(games().getByRole('button', { name: '1–2 ч' }))
    await user.click(stress().getByRole('button', { name: 'немного' }))
    expect(tagButton('игры · 1–2 ч')).toBeInTheDocument()
    expect(tagButton('стресс · немного')).toBeInTheDocument()

    await scores(user)
    await user.click(saveButton())
    const log = onSave.mock.calls[0]![0] as DayLog
    // игры.short = ['<1 ч','1–2 ч','3–4 ч','5+ ч']; '1–2 ч' — индекс 1 → уровень 2.
    // стресс.short = ['немного','сильно','очень']; 'немного' — индекс 0 → уровень 1.
    expect(log.levels).toEqual({ 'игры': 2, 'стресс': 1 })
  })

  it('четвёртый тег со ступенями (работа допоздна) открывает свою группу, без note, и пишет уровень', async () => {
    const { user, onSave } = setup()
    await user.click(tagButton('работа допоздна'))

    const g = group('Работа допоздна — сколько сверх обычного?')
    for (const label of ['до 1 ч', '1–3 ч', '3+ ч']) {
      expect(g.getByRole('button', { name: label })).toHaveAttribute('aria-pressed', 'false')
    }
    expect(g.getByText(/можно не выбирать/)).toBeInTheDocument()
    expect(g.queryByText(/бокал вина/)).toBeNull()

    await user.click(g.getByRole('button', { name: '3+ ч' }))
    expect(tagButton('работа допоздна · 3+ ч')).toBeInTheDocument()

    await scores(user)
    await user.click(saveButton())
    const log = onSave.mock.calls[0]![0] as DayLog
    // работа допоздна.short = ['до 1 ч','1–3 ч','3+ ч']; '3+ ч' — индекс 2 → уровень 3
    expect(log.levels).toEqual({ 'работа допоздна': 3 })
  })

  it('тег без шкалы (дорога) группу не открывает', async () => {
    const { user } = setup()
    await user.click(tagButton('дорога'))
    /* групп со ступенями нет — любые другие группы (например, обёртка чипов) не в счёт */
    expect(screen.queryByRole('group', { name: /сколько|насколько/i })).toBeNull()
    expect(tagButton('дорога')).toBeInTheDocument()
  })

  it('правка закрытого дня со ступенями: ступень уже нажата и её можно поменять', async () => {
    const existing: DayLog = {
      day: '2026-09-21',
      mood: 7,
      wellbeing: 6,
      productivity: 8,
      tags: ['алкоголь'],
      levels: { 'алкоголь': 2 }, // short[1] = '3–5'
      note: '',
      closedAt: '2026-09-21T21:00:00.000Z',
    }
    const { user, onSave } = setup({ existing, onCancel: vi.fn() })

    expect(tagButton('алкоголь · 3–5')).toBeInTheDocument()
    expect(group('Алкоголь — сколько?').getByRole('button', { name: '3–5' })).toHaveAttribute('aria-pressed', 'true')

    await user.click(group('Алкоголь — сколько?').getByRole('button', { name: '6+' }))
    expect(tagButton('алкоголь · 6+')).toBeInTheDocument()

    await user.click(saveButton())
    const log = onSave.mock.calls[0]![0] as DayLog
    // выбрана третья кнопка ('6+', индекс 2) → уровень 3
    expect(log.levels).toEqual({ 'алкоголь': 3 })
  })

  it('правка закрытого дня: сняли тег со ступенью — в сохранённом логе levels: {}', async () => {
    const existing: DayLog = {
      day: '2026-09-21',
      mood: 7,
      wellbeing: 6,
      productivity: 8,
      tags: ['алкоголь'],
      levels: { 'алкоголь': 2 },
      note: '',
      closedAt: '2026-09-21T21:00:00.000Z',
    }
    const { user, onSave } = setup({ existing, onCancel: vi.fn() })
    await user.click(tagButton('алкоголь · 3–5')) // снимаем тег целиком

    await user.click(saveButton())
    const log = onSave.mock.calls[0]![0] as DayLog
    expect(log.tags).not.toContain('алкоголь')
    expect(log.levels).toEqual({})
  })

  it('правка закрытого дня: тег отмечен, а в записи levels не было — группа видна, ничего не нажато, в логе levels: {} (не undefined)', async () => {
    const existing: DayLog = {
      day: '2026-09-21',
      mood: 7,
      wellbeing: 6,
      productivity: 8,
      tags: ['алкоголь'],
      note: '',
      closedAt: '2026-09-21T21:00:00.000Z',
    }
    const { user, onSave } = setup({ existing, onCancel: vi.fn() })

    const g = group('Алкоголь — сколько?')
    for (const label of ['1–2', '3–5', '6+']) {
      expect(g.getByRole('button', { name: label })).toHaveAttribute('aria-pressed', 'false')
    }
    expect(tagButton('алкоголь')).toBeInTheDocument()

    await user.click(saveButton())
    const log = onSave.mock.calls[0]![0] as DayLog
    expect(log.levels).toEqual({})
  })

  it('правка закрытого дня: ступень тега, которого нет в tags, в лог не уходит', async () => {
    const existing: DayLog = {
      day: '2026-09-21',
      mood: 7,
      wellbeing: 6,
      productivity: 8,
      tags: [],
      levels: { 'алкоголь': 2 },
      note: '',
      closedAt: '2026-09-21T21:00:00.000Z',
    }
    const { user, onSave } = setup({ existing, onCancel: vi.fn() })

    expect(tagButton('алкоголь')).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Алкоголь — сколько?' })).toBeNull()

    await user.click(saveButton())
    const log = onSave.mock.calls[0]![0] as DayLog
    expect(log.tags).not.toContain('алкоголь')
    expect(log.levels).toEqual({})
  })
})
