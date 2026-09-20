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

/** Обёртка, которая умеет заводить теги, — как форма, у которой есть репозиторий. */
function CreatingHarness() {
  const [tags, setTags] = useState<Tag[]>(TAGS)
  const [value, setValue] = useState<string[]>([])
  return (
    <>
      <TagPicker
        tags={tags}
        value={value}
        onChange={setValue}
        onCreate={async (name) => {
          const tag = { id: 'new', name }
          setTags((prev) => [...prev, tag])
          return tag
        }}
      />
      <output data-testid="value">{value.join(',')}</output>
    </>
  )
}

describe('создание тега прямо из выбора', () => {
  const open = async () => {
    render(<CreatingHarness />)
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /выбрать теги/i }))
    return user
  }

  it('если такого тега нет — предлагает создать и сразу выбирает созданный', async () => {
    const user = await open()
    await user.type(screen.getByRole('searchbox'), 'йога')
    await user.click(screen.getByRole('button', { name: /создать тег «йога»/i }))

    expect(screen.getByTestId('value')).toHaveTextContent('new')
    expect(screen.getByRole('button', { name: /убрать тег «йога»/i })).toBeInTheDocument()
  })

  it('при точном совпадении создать не предлагает — без учёта регистра и пробелов', async () => {
    const user = await open()
    await user.type(screen.getByRole('searchbox'), '  Тело ')
    expect(screen.queryByRole('button', { name: /создать тег/i })).not.toBeInTheDocument()
  })

  it('частичное совпадение не мешает создать новый', async () => {
    const user = await open()
    await user.type(screen.getByRole('searchbox'), 'те')
    expect(screen.getByRole('option', { name: 'тело' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /создать тег «те»/i })).toBeInTheDocument()
  })

  it('с пустым поиском создавать нечего', async () => {
    await open()
    expect(screen.queryByRole('button', { name: /создать тег/i })).not.toBeInTheDocument()
  })
})

