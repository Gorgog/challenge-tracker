import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { Tag } from '@/domain/types'
import { TagPicker } from './TagPicker'

const TAGS: Tag[] = [
  { id: 't1', name: 'тело' },
  { id: 't2', name: 'здоровье' },
  { id: 't3', name: 'ум' },
  { id: 't4', name: 'еда' },
]

/** Обёртка с состоянием: пикер управляемый, как и в форме. */
function Harness({ initial = [] as string[] }) {
  const [value, setValue] = useState<string[]>(initial)
  return (
    <>
      <TagPicker tags={TAGS} value={value} onChange={setValue} />
      <output data-testid="value">{value.join(',')}</output>
    </>
  )
}

const setup = (initial: string[] = []) => {
  render(<Harness initial={initial} />)
  return userEvent.setup()
}

const openPicker = (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole('button', { name: /выбрать теги|теги/i }))

describe('выбор тегов', () => {
  it('выбранные теги видны чипами без открытия списка', () => {
    setup(['t1', 't3'])
    expect(screen.getByText('тело')).toBeInTheDocument()
    expect(screen.getByText('ум')).toBeInTheDocument()
    expect(screen.queryByText('еда')).not.toBeInTheDocument()
  })

  it('отмечает несколько тегов', async () => {
    const user = setup()
    await openPicker(user)
    await user.click(screen.getByRole('option', { name: 'тело' }))
    await user.click(screen.getByRole('option', { name: 'еда' }))
    expect(screen.getByTestId('value')).toHaveTextContent('t1,t4')
  })

  it('повторный клик снимает тег', async () => {
    const user = setup(['t1'])
    await openPicker(user)
    await user.click(screen.getByRole('option', { name: 'тело' }))
    expect(screen.getByTestId('value')).toHaveTextContent('')
  })

  it('поиск сужает список, без учёта регистра', async () => {
    const user = setup()
    await openPicker(user)
    await user.type(screen.getByRole('searchbox'), 'ЗДОР')
    expect(screen.getByRole('option', { name: 'здоровье' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'тело' })).not.toBeInTheDocument()
  })

  it('если ничего не нашлось — так и говорит', async () => {
    const user = setup()
    await openPicker(user)
    await user.type(screen.getByRole('searchbox'), 'йога')
    expect(screen.getByText(/не нашлось/i)).toBeInTheDocument()
  })

  it('чип снимается крестиком прямо в форме', async () => {
    const user = setup(['t1', 't3'])
    await user.click(screen.getByRole('button', { name: /убрать тег «тело»/i }))
    expect(screen.getByTestId('value')).toHaveTextContent('t3')
  })

  it('без тегов подсказывает, где их завести', async () => {
    render(<TagPicker tags={[]} value={[]} onChange={() => {}} />)
    await userEvent.setup().click(screen.getByRole('button', { name: /выбрать теги|теги/i }))
    expect(screen.getByText(/заведи их кнопкой «теги»/i)).toBeInTheDocument()
  })
})
