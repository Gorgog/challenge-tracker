import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Challenge } from '@/domain/types'
import { HoldCard } from './HoldCard'

const challenge: Challenge = {
  id: 'smoke',
  name: 'Без сигарет',
  code: 'БСГ',
  kind: 'quit',
  measure: 'binary',
  goal: 1,
  unit: null,
  color: 'var(--chart-2)',
  tagIds: [],
  startDate: '2026-06-14',
  lengthDays: null,
  status: 'active',
  rulesLocked: false,
  deletedAt: null,
  sortOrder: 1,
}

const setup = (over: { failed?: boolean; streak?: number; frozen?: boolean } = {}) => {
  const onToggleRelapse = vi.fn()
  render(
    <HoldCard
      challenge={challenge}
      failed={over.failed ?? false}
      streak={over.streak ?? 40}
      frozen={over.frozen ?? false}
      onToggleRelapse={onToggleRelapse}
    />,
  )
  return { onToggleRelapse, user: userEvent.setup() }
}

describe('карточка отказа', () => {
  it('показывает счётчик непрерывности крупно и название рядом', () => {
    setup({ streak: 40 })
    expect(screen.getByText('40')).toBeInTheDocument()
    expect(screen.getByText('Без сигарет')).toBeInTheDocument()
    expect(screen.getByText(/дней без срыва/i)).toBeInTheDocument()
  })

  it('пока держится — предлагает отметить срыв', async () => {
    const { user, onToggleRelapse } = setup()
    const button = screen.getByRole('button', { name: /сорвался/i })
    await user.click(button)
    expect(onToggleRelapse).toHaveBeenCalledTimes(1)
  })

  it('когда срыв отмечен — говорит об этом и даёт его убрать', async () => {
    const { user, onToggleRelapse } = setup({ failed: true, streak: 0 })
    expect(screen.getByText(/срыв отмечен сегодня/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /убрать срыв/i }))
    expect(onToggleRelapse).toHaveBeenCalledTimes(1)
  })

  it('счётчик с нулём не превращается в «0 дня»', () => {
    setup({ failed: true, streak: 0 })
    expect(screen.getByText('0')).toBeInTheDocument()
  })

  it('после закрытия дня срыв не отметить', async () => {
    const { user, onToggleRelapse } = setup({ frozen: true })
    const button = screen.getByRole('button', { name: /сорвался/i })
    expect(button).toBeDisabled()

    await user.click(button)
    expect(onToggleRelapse).not.toHaveBeenCalled()
  })
})
