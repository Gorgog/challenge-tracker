import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { todayKey } from '@/domain/date'
import type { Challenge } from '@/domain/types'
import { ChallengeForm } from './ChallengeForm'

const setup = () => {
  const onCreate = vi.fn()
  const onCancel = vi.fn()
  render(<ChallengeForm open existing={[]} onCreate={onCreate} onCancel={onCancel} />)
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

  it('код подставляется из названия и его можно поправить', async () => {
    const { user } = setup()
    await user.type(nameField(), 'Без сахара')
    const code = screen.getByLabelText(/код/i)
    expect(code).toHaveValue('БС')

    await user.clear(code)
    await user.type(code, 'БСХ')
    expect(code).toHaveValue('БСХ')
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
})
