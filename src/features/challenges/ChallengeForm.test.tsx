import { render, screen } from '@testing-library/react'
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
    expect(c.status).toBe('active')
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
    status: 'active',
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
