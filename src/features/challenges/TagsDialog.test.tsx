import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Tag } from '@/domain/types'
import { TagsDialog } from './TagsDialog'

const TAGS: Tag[] = [
  { id: 't1', name: 'тело' },
  { id: 't2', name: 'здоровье' },
]

const setup = (usage: Record<string, number> = { t1: 2 }) => {
  const onCreate = vi.fn(async () => {})
  const onDelete = vi.fn()
  render(
    <TagsDialog open tags={TAGS} usage={usage} onCreate={onCreate} onDelete={onDelete} onClose={() => {}} />,
  )
  return { onCreate, onDelete, user: userEvent.setup() }
}

const nameField = () => screen.getByRole('textbox', { name: /новый тег/i })
const addButton = () => screen.getByRole('button', { name: /добавить/i })

describe('окно тегов', () => {
  it('показывает теги и сколько челленджей их носят', () => {
    setup()
    expect(screen.getByText('тело')).toBeInTheDocument()
    expect(screen.getByText(/2 челленджа/i)).toBeInTheDocument()
    expect(screen.getByText(/не используется/i)).toBeInTheDocument()
  })

  it('заводит новый тег', async () => {
    const { user, onCreate } = setup()
    await user.type(nameField(), 'сон')
    await user.click(addButton())
    expect(onCreate).toHaveBeenCalledWith('сон')
  })

  it('заводит тег по Enter', async () => {
    const { user, onCreate } = setup()
    await user.type(nameField(), 'сон{Enter}')
    expect(onCreate).toHaveBeenCalledWith('сон')
  })

  it('пустое имя не добавить', async () => {
    const { user } = setup()
    expect(addButton()).toBeDisabled()
    await user.type(nameField(), '   ')
    expect(addButton()).toBeDisabled()
  })

  it('имя, которое уже есть, не добавить — без учёта регистра и пробелов', async () => {
    const { user, onCreate } = setup()
    await user.type(nameField(), '  ТЕЛО ')
    expect(screen.getByText(/такой тег уже есть/i)).toBeInTheDocument()
    expect(addButton()).toBeDisabled()

    await user.type(nameField(), '{Enter}')
    expect(onCreate).not.toHaveBeenCalled()
  })

  it('неиспользуемый тег удаляется сразу', async () => {
    const { user, onDelete } = setup()
    await user.click(screen.getByRole('button', { name: /удалить тег «здоровье»/i }))
    expect(onDelete).toHaveBeenCalledWith('t2')
  })

  it('используемый — сначала предупреждает, сколько челленджей его потеряют', async () => {
    const { user, onDelete } = setup()
    await user.click(screen.getByRole('button', { name: /удалить тег «тело»/i }))
    expect(onDelete).not.toHaveBeenCalled()
    expect(screen.getByText(/снимется с 2 челленджей/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /да, удалить/i }))
    expect(onDelete).toHaveBeenCalledWith('t1')
  })
})
