import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { todayKey } from '@/domain/date'
import type { Challenge, Tag } from '@/domain/types'
import { ChallengeForm } from './ChallengeForm'

const TAGS: Tag[] = [
  { id: 't1', name: 'тело' },
  { id: 't2', name: 'ум' },
]

const setup = () => {
  const onCreate = vi.fn()
  const onCancel = vi.fn()
  render(<ChallengeForm open existing={[]} tags={TAGS} onCreate={onCreate} onCancel={onCancel} />)
  return { onCreate, onCancel, user: userEvent.setup() }
}

const nameField = () => screen.getByLabelText(/название/i)
const submit = () => screen.getByRole('button', { name: /создать/i })
const created = (fn: ReturnType<typeof vi.fn>) => fn.mock.calls[0]![0] as Omit<Challenge, 'id'>

describe('форма нового челленджа', () => {
  it('кнопка создания неактивна, пока нет названия', async () => {
    const { user } = setup()
    expect(submit()).toBeDisabled()

    await user.type(nameField(), 'Без сахара')
    expect(submit()).toBeEnabled()
  })

  it('при создании поля кода нет — код подставляется из названия', async () => {
    const { user, onCreate } = setup()
    expect(screen.queryByLabelText(/код/i)).not.toBeInTheDocument()

    await user.type(nameField(), 'Без сахара')
    await user.click(submit())
    expect(created(onCreate).code).toBe('БС')
  })

  it('у галочки не спрашивает цель и единицу', async () => {
    const { user } = setup()
    await user.type(nameField(), 'Читать')
    expect(screen.queryByLabelText(/цель/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/единиц/i)).not.toBeInTheDocument()
  })

  it('для числа появляются цель и единица', async () => {
    const { user } = setup()
    await user.type(nameField(), 'Шаги')
    await user.click(screen.getByRole('button', { name: /^число$/i }))
    expect(screen.getByLabelText(/цель/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/единиц/i)).toBeInTheDocument()
  })

  it('у отказа измерение не спрашивается — отказ всегда галочка', async () => {
    const { user } = setup()
    await user.type(nameField(), 'Без сигарет')
    await user.click(screen.getByRole('button', { name: /^отказ$/i }))
    expect(screen.queryByRole('button', { name: /^число$/i })).not.toBeInTheDocument()
  })

  it('создаёт привычку с сегодняшней датой старта', async () => {
    const { user, onCreate } = setup()
    await user.type(nameField(), 'Без сахара')
    await user.click(screen.getByRole('button', { name: /^отказ$/i }))
    await user.click(submit())

    expect(onCreate).toHaveBeenCalledTimes(1)
    const c = created(onCreate)
    expect(c.name).toBe('Без сахара')
    expect(c.kind).toBe('quit')
    expect(c.measure).toBe('binary')
    expect(c.startDate).toBe(todayKey())
    expect(c.pauses).toEqual([])
  })

  it('создаёт счётный челлендж с целью и единицей', async () => {
    const { user, onCreate } = setup()
    await user.type(nameField(), 'Шаги')
    await user.click(screen.getByRole('button', { name: /^число$/i }))
    await user.clear(screen.getByLabelText(/цель/i))
    await user.type(screen.getByLabelText(/цель/i), '10000')
    await user.type(screen.getByLabelText(/единиц/i), 'шагов')
    await user.click(submit())

    const c = created(onCreate)
    expect(c.measure).toBe('count')
    expect(c.goal).toBe(10000)
    expect(c.unit).toBe('шагов')
  })

  it('по умолчанию челлендж бессрочный, но срок можно задать', async () => {
    const { user, onCreate } = setup()
    await user.type(nameField(), 'Отжимания')
    await user.click(screen.getByRole('button', { name: /срок/i }))
    await user.clear(screen.getByLabelText(/дней/i))
    await user.type(screen.getByLabelText(/дней/i), '30')
    await user.click(submit())

    expect(created(onCreate).lengthDays).toBe(30)
  })

  it('выбранные теги попадают в челлендж', async () => {
    const { user, onCreate } = setup()
    await user.type(nameField(), 'Бегать')
    await user.click(screen.getByRole('button', { name: /выбрать теги/i }))
    await user.click(screen.getByRole('option', { name: 'тело' }))
    await user.click(screen.getByRole('option', { name: 'ум' }))
    await user.keyboard('{Escape}')
    await user.click(submit())

    expect(created(onCreate).tagIds).toEqual(['t1', 't2'])
  })

  it('по умолчанию правила можно менять', async () => {
    const { user, onCreate } = setup()
    await user.type(nameField(), 'Бегать')
    await user.click(submit())
    expect(created(onCreate).rulesLocked).toBe(false)
  })

  it('правила можно сразу запереть', async () => {
    const { user, onCreate } = setup()
    await user.type(nameField(), 'Бегать')
    await user.click(screen.getByRole('switch', { name: /запереть правила/i }))
    await user.click(submit())
    expect(created(onCreate).rulesLocked).toBe(true)
  })
})

describe('форма правки челленджа', () => {
  const existing: Challenge = {
    id: 'push',
    name: '30 дней отжимаюсь',
    code: 'ОТЖ',
    kind: 'do',
    measure: 'count',
    goal: 30,
    unit: 'раз',
    color: 'var(--chart-1)',
    tagIds: ['t1'],
    startDate: '2026-09-01',
    lengthDays: 30,
    pauses: [],
    rulesLocked: false,
    deletedAt: null,
    sortOrder: 0,
  }

  const edit = (c: Challenge = existing) => {
    const onSave = vi.fn()
    render(
      <ChallengeForm
        open
        existing={[c]}
        tags={TAGS}
        challenge={c}
        onCreate={vi.fn()}
        onSave={onSave}
        onCancel={vi.fn()}
      />,
    )
    return { onSave, user: userEvent.setup() }
  }

  const save = () => screen.getByRole('button', { name: /сохранить/i })
  const saved = (fn: ReturnType<typeof vi.fn>) => fn.mock.calls[0]![0]

  it('открывается с текущими значениями', () => {
    edit()
    expect(screen.getByRole('heading', { name: /изменить челлендж/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/название/i)).toHaveValue('30 дней отжимаюсь')
    expect(screen.getByLabelText(/цель/i)).toHaveValue('30')
    expect(screen.getByText('тело')).toBeInTheDocument()
  })

  it('сохраняет новое название и теги', async () => {
    const { user, onSave } = edit()
    await user.clear(screen.getByLabelText(/название/i))
    await user.type(screen.getByLabelText(/название/i), '40 дней отжимаюсь')
    await user.click(screen.getByRole('button', { name: /выбрать теги|изменить теги/i }))
    await user.click(screen.getByRole('option', { name: 'ум' }))
    await user.keyboard('{Escape}')
    await user.click(save())

    expect(saved(onSave).name).toBe('40 дней отжимаюсь')
    expect(saved(onSave).tagIds).toEqual(['t1', 't2'])
  })

  it('у незапертого правила меняются', async () => {
    const { user, onSave } = edit()
    await user.clear(screen.getByLabelText(/цель/i))
    await user.type(screen.getByLabelText(/цель/i), '50')
    await user.click(save())
    expect(saved(onSave).goal).toBe(50)
  })

  it('у запертого поля правил недоступны, а название меняется', async () => {
    const { user, onSave } = edit({ ...existing, rulesLocked: true })
    expect(screen.getByLabelText(/цель/i)).toBeDisabled()
    expect(screen.getByRole('button', { name: /^отказ$/i })).toBeDisabled()
    expect(screen.getByText(/правила заперты/i)).toBeInTheDocument()

    await user.clear(screen.getByLabelText(/название/i))
    await user.type(screen.getByLabelText(/название/i), 'Отжимания')
    await user.click(save())
    expect(saved(onSave).name).toBe('Отжимания')
  })

  it('запертый замок снять нельзя', () => {
    edit({ ...existing, rulesLocked: true })
    const lock = screen.getByRole('switch', { name: /запереть правила/i })
    expect(lock).toBeChecked()
    expect(lock).toBeDisabled()
  })

  it('при правке поля кода тоже нет', () => {
    edit()
    expect(screen.queryByLabelText(/код/i)).not.toBeInTheDocument()
  })

  it('переименование в «100» даёт непустой код — база пустой не примет', async () => {
    const { user, onSave } = edit()
    const input = screen.getByDisplayValue(existing.name)
    await user.clear(input)
    await user.type(input, '100')
    await user.click(save())
    expect(saved(onSave).code).toBe('100')
  })

  it('если название не меняли — код остаётся прежним, а не пересчитывается', async () => {
    const { user, onSave } = edit()
    await user.click(save())
    expect(saved(onSave).code).toBe('ОТЖ')
  })

  it('новое название — новый код', async () => {
    const { user, onSave } = edit()
    await user.clear(screen.getByLabelText(/название/i))
    await user.type(screen.getByLabelText(/название/i), 'Отжимания')
    await user.click(save())
    expect(saved(onSave).code).toBe('ОТЖ')
  })

  it('новое название из нескольких слов — код из первых букв', async () => {
    const { user, onSave } = edit()
    await user.clear(screen.getByLabelText(/название/i))
    await user.type(screen.getByLabelText(/название/i), 'Утренние отжимания')
    await user.click(save())
    expect(saved(onSave).code).toBe('УО')
  })

  it('незапертый можно запереть при правке', async () => {
    const { user, onSave } = edit()
    await user.click(screen.getByRole('switch', { name: /запереть правила/i }))
    await user.click(save())
    expect(saved(onSave).rulesLocked).toBe(true)
  })
})

describe('«Время» — лечь не позже (срез 4б)', () => {
  const open = (props: Partial<Parameters<typeof ChallengeForm>[0]> = {}) => {
    const onCreate = vi.fn()
    const onSave = vi.fn()
    render(<ChallengeForm open existing={[]} tags={TAGS} onCreate={onCreate} onSave={onSave} onCancel={vi.fn()} usualBed={0} {...props} />)
    return { onCreate, onSave, user: userEvent.setup() }
  }
  const bedField = () => screen.getByLabelText('Лечь не позже')

  it('третий вариант у привычки — «Время»; поле — обычный отбой на 30 минут раньше; отмечать не нужно', async () => {
    const { user } = open()
    await user.click(screen.getByRole('button', { name: 'Время' }))
    expect(bedField()).toHaveValue('23:30')
    expect(screen.getByText(/Обычно ты ложишься в 00:00 — подставили на 30 минут раньше/)).toBeInTheDocument()
    expect(screen.getByText(/Отмечать не нужно: считается само из «Лёг» утром/)).toBeInTheDocument()
    // цели в день и единицы у времени нет
    expect(screen.queryByLabelText(/цель в день/i)).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Отказ' }))
    expect(screen.queryByRole('button', { name: 'Время' })).not.toBeInTheDocument()
  })

  it('создаёт челлендж: цель — минуты от полуночи утра (23:30 = −30, 00:30 = 30), без единицы', async () => {
    const { user, onCreate } = open()
    await user.type(nameField(), 'Ложусь раньше')
    await user.click(screen.getByRole('button', { name: 'Время' }))
    await user.click(submit())
    expect(created(onCreate)).toMatchObject({ kind: 'do', measure: 'bedtime', goal: -30, unit: null })
    fireEvent.change(bedField(), { target: { value: '00:30' } })
    await user.click(submit())
    expect((onCreate.mock.calls[1]![0] as Challenge).goal).toBe(30)
  })

  it('своего обычного отбоя ещё нет — поле пустое, «Создать» ждёт времени', async () => {
    const { user } = open({ usualBed: null })
    await user.type(nameField(), 'Ложусь раньше')
    await user.click(screen.getByRole('button', { name: 'Время' }))
    expect(bedField()).toHaveValue('')
    expect(screen.queryByText(/Обычно ты ложишься/)).not.toBeInTheDocument()
    expect(submit()).toBeDisabled()
    fireEvent.change(bedField(), { target: { value: '23:00' } })
    expect(submit()).toBeEnabled()
  })

  it('черновик из аналитики: название и «Время» уже выбраны', () => {
    open({ initial: { name: 'Ложусь раньше', measure: 'bedtime' } })
    expect(nameField()).toHaveValue('Ложусь раньше')
    expect(screen.getByRole('button', { name: 'Время' })).toHaveAttribute('aria-pressed', 'true')
    expect(bedField()).toHaveValue('23:30')
    expect(submit()).toBeEnabled()
  })

  it('правка: время открывается как записано и сохраняется, измерение остаётся «Время»', async () => {
    const c: Challenge = {
      id: 'bed',
      name: 'Ложусь раньше',
      code: 'ЛР',
      kind: 'do',
      measure: 'bedtime',
      goal: -45,
      unit: null,
      color: 'var(--chart-1)',
      tagIds: [],
      startDate: '2026-09-01',
      lengthDays: null,
      pauses: [],
      rulesLocked: false,
      deletedAt: null,
      sortOrder: 0,
    }
    const { user, onSave } = open({ challenge: c, existing: [c] })
    expect(bedField()).toHaveValue('23:15')
    fireEvent.change(bedField(), { target: { value: '23:00' } })
    await user.click(screen.getByRole('button', { name: /сохранить/i }))
    expect(onSave.mock.calls[0]![0]).toMatchObject({ measure: 'bedtime', goal: -60, unit: null })
  })
})

describe('«Время» — правки по ревью 4б', () => {
  const base: Challenge = {
    id: 'x',
    name: 'Читать',
    code: 'ЧТ',
    kind: 'do',
    measure: 'binary',
    goal: 1,
    unit: null,
    color: 'var(--chart-1)',
    tagIds: [],
    startDate: '2026-09-01',
    lengthDays: null,
    pauses: [],
    rulesLocked: false,
    deletedAt: null,
    sortOrder: 0,
  }
  const edit = (c: Challenge) =>
    render(<ChallengeForm open existing={[c]} tags={TAGS} challenge={c} onSave={vi.fn()} onCancel={vi.fn()} usualBed={0} />)

  it('у заведённого измерение на «Время» и обратно не меняется (решение Georgy)', () => {
    edit(base)
    expect(screen.getByRole('button', { name: 'Время' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Число' })).toBeEnabled()
    cleanup()
    edit({ ...base, measure: 'bedtime', goal: -30 })
    expect(screen.getByRole('button', { name: 'Галочка' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Число' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Отказ' })).toBeDisabled()
    expect(screen.getByLabelText('Лечь не позже')).toBeEnabled()
  })

  it('обычный отбой около полудня — подстановка не перескакивает через полдень', async () => {
    const user = userEvent.setup()
    render(<ChallengeForm open existing={[]} tags={TAGS} onCreate={vi.fn()} onCancel={vi.fn()} usualBed={-715} />)
    await user.click(screen.getByRole('button', { name: 'Время' }))
    // 12:05 − 30 минут — не 11:35 «утра следующего дня», а самое раннее, что можно: 12:00
    expect(screen.getByLabelText('Лечь не позже')).toHaveValue('12:00')
  })
})
