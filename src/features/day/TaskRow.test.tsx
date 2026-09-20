import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Challenge } from '@/domain/types'
import { TaskRow } from './TaskRow'

const binary: Challenge = {
  id: 'read',
  name: 'Читать 20 страниц',
  code: 'ЧТН',
  kind: 'do',
  measure: 'binary',
  goal: 1,
  unit: null,
  color: 'var(--chart-3)',
  tagIds: [],
  startDate: '2026-07-02',
  lengthDays: null,
  status: 'active',
  rulesLocked: false,
  deletedAt: null,
  sortOrder: 2,
}

const counted: Challenge = { ...binary, id: 'step', name: '10 000 шагов', measure: 'count', goal: 10000, unit: 'шагов' }

const setup = (over: { challenge?: Challenge; frozen?: boolean; value?: number } = {}) => {
  const onToggle = vi.fn()
  const onSetValue = vi.fn()
  render(
    <TaskRow
      challenge={over.challenge ?? binary}
      value={over.value}
      done={false}
      streak={3}
      index={1}
      frozen={over.frozen ?? false}
      onToggle={onToggle}
      onSetValue={onSetValue}
    />,
  )
  return { onToggle, onSetValue, user: userEvent.setup() }
}

describe('строка задачи', () => {
  it('пока день не закрыт — отметку можно поставить', async () => {
    const { user, onToggle } = setup()
    await user.click(screen.getByRole('button', { name: /отметить/i }))
    expect(onToggle).toHaveBeenCalledTimes(1)
  })

  it('после закрытия дня отметку не поставить', async () => {
    const { user, onToggle } = setup({ frozen: true })
    const mark = screen.getByRole('button', { name: /отметить/i })
    expect(mark).toBeDisabled()

    await user.click(mark)
    expect(onToggle).not.toHaveBeenCalled()
  })

  it('после закрытия дня шаговый ввод заблокирован', async () => {
    const { user, onSetValue } = setup({ challenge: counted, value: 5000, frozen: true })
    expect(screen.getByRole('button', { name: /больше/i })).toBeDisabled()
    expect(screen.getByLabelText(/значение/i)).toBeDisabled()

    await user.click(screen.getByRole('button', { name: /больше/i }))
    expect(onSetValue).not.toHaveBeenCalled()
  })

  it('пока день не закрыт — шаг прибавляет значение', async () => {
    const { user, onSetValue } = setup({ challenge: counted, value: 5000 })
    await user.click(screen.getByRole('button', { name: /больше/i }))
    expect(onSetValue).toHaveBeenCalledWith(5500)
  })
})
