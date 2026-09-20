import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Challenge } from '@/domain/types'
import { ChallengeRow } from './ChallengeRow'

const challenge = (over: Partial<Challenge> = {}): Challenge => ({
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
  ...over,
})

const setup = (c: Challenge = challenge()) => {
  const onToggleStatus = vi.fn()
  const onDelete = vi.fn()
  render(
    <ChallengeRow challenge={c} tagNames={['ум']} onToggleStatus={onToggleStatus} onDelete={onDelete} />,
  )
  return { onToggleStatus, onDelete, user: userEvent.setup() }
}

describe('строка челленджа', () => {
  it('показывает теги по именам', () => {
    setup()
    expect(screen.getByText(/«ум»/)).toBeInTheDocument()
  })

  it('у активного кнопка ставит на паузу', async () => {
    const { user, onToggleStatus } = setup()
    await user.click(screen.getByRole('button', { name: /поставить на паузу/i }))
    expect(onToggleStatus).toHaveBeenCalledTimes(1)
  })

  it('у челленджа на паузе та же кнопка снимает паузу', () => {
    setup(challenge({ status: 'paused' }))
    expect(screen.getByRole('button', { name: /снять с паузы/i })).toBeInTheDocument()
    expect(screen.getByText(/на паузе/i)).toBeInTheDocument()
  })

  it('кнопка удаления просит мягкое удаление', async () => {
    const { user, onDelete } = setup()
    await user.click(screen.getByRole('button', { name: /удалить/i }))
    expect(onDelete).toHaveBeenCalledTimes(1)
  })
})
