import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Challenge } from '@/domain/types'
import { DeletedChallenges } from './DeletedChallenges'

const deleted = (over: Partial<Challenge> = {}): Challenge => ({
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
  pauses: [],
  rulesLocked: false,
  deletedAt: '2026-09-20T10:00:00.000Z',
  sortOrder: 2,
  ...over,
})

const setup = (list: Challenge[] = [deleted(), deleted({ id: 'step', name: '10 000 шагов', code: 'ШАГ' })]) => {
  const onRestore = vi.fn()
  const onPurge = vi.fn()
  const view = render(<DeletedChallenges challenges={list} onRestore={onRestore} onPurge={onPurge} />)
  return { onRestore, onPurge, view, user: userEvent.setup() }
}

describe('удалённые челленджи', () => {
  it('без удалённых блока нет вовсе', () => {
    const { view } = setup([])
    expect(view.container).toBeEmptyDOMElement()
  })

  it('свёрнут по умолчанию и говорит, сколько внутри', () => {
    setup()
    expect(screen.getByRole('button', { name: /удалённые.*2/i })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('Читать 20 страниц')).not.toBeInTheDocument()
  })

  it('разворачивается по клику', async () => {
    const { user } = setup()
    await user.click(screen.getByRole('button', { name: /удалённые/i }))
    expect(screen.getByText('Читать 20 страниц')).toBeInTheDocument()
    expect(screen.getByText('10 000 шагов')).toBeInTheDocument()
  })

  it('«Вернуть» восстанавливает челлендж', async () => {
    const { user, onRestore } = setup([deleted()])
    await user.click(screen.getByRole('button', { name: /удалённые/i }))
    await user.click(screen.getByRole('button', { name: /вернуть/i }))
    expect(onRestore).toHaveBeenCalledWith('read')
  })

  it('«Удалить навсегда» сначала спрашивает и без подтверждения ничего не стирает', async () => {
    const { user, onPurge } = setup([deleted()])
    await user.click(screen.getByRole('button', { name: /удалённые/i }))
    await user.click(screen.getByRole('button', { name: /удалить навсегда/i }))

    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText(/из статистики/i)).toBeInTheDocument()

    await user.click(within(dialog).getByRole('button', { name: /отмена/i }))
    expect(onPurge).not.toHaveBeenCalled()
  })

  it('после подтверждения стирает навсегда', async () => {
    const { user, onPurge } = setup([deleted()])
    await user.click(screen.getByRole('button', { name: /удалённые/i }))
    await user.click(screen.getByRole('button', { name: /удалить навсегда/i }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: /удалить навсегда/i }))
    expect(onPurge).toHaveBeenCalledWith('read')
  })
})
