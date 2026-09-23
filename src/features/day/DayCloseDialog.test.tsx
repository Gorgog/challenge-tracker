import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { DayLog } from '@/domain/types'
import { DayCloseDialog } from './DayCloseDialog'

const setup = (over: Partial<Parameters<typeof DayCloseDialog>[0]> = {}) => {
  const onSave = vi.fn()
  render(<DayCloseDialog open day="2026-09-21" pendingCount={0} onSave={onSave} {...over} />)
  return { onSave, user: userEvent.setup() }
}

const slider = (name: string) => screen.getByRole('slider', { name: new RegExp(name, 'i') })
const saveButton = () => screen.getByRole('button', { name: /закрыть день|сохранить/i })

/** Сдвинуть ползунок с клавиатуры: фокус на бегунке, стрелка вправо. */
async function move(user: ReturnType<typeof userEvent.setup>, name: string) {
  slider(name).focus()
  await user.keyboard('{ArrowRight}')
}

describe('окно итога дня — пока база отвечает', () => {
  it('«Сохраняю…», кнопка выключена, «Отмены» нет — оценки не потеряются на полпути', () => {
    render(<DayCloseDialog open day="2026-09-21" saving onSave={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Сохраняю…' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: /отмена/i })).toBeNull()
  })
})

describe('окно итога дня — нет сети', () => {
  it('запись ждёт сеть: так и сказано, и из окна можно выйти', () => {
    const onCancel = vi.fn()
    render(<DayCloseDialog open day="2026-09-21" offline onSave={vi.fn()} onCancel={onCancel} />)
    expect(screen.getByText(/Нет связи/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /отмена|закрыть окно/i })).toBeEnabled()
  })
})

describe('окно итога дня', () => {
  it('три оценки стартуют не выставленными', () => {
    setup()
    expect(screen.getAllByText('не выбрано')).toHaveLength(3)
  })

  it('на шкале 0–10 пятёрка стоит ровно посередине', () => {
    setup()
    expect(screen.getAllByText(/5 — как обычно/)[0]!.style.left).toBe('50%')
  })

  it('крайние якоря прижаты к краям дорожки, а нижний — ноль', () => {
    setup()
    expect(screen.getAllByText(/0 — дно/)[0]!.style.left).toBe('0%')
    expect(screen.getAllByText(/10 — отличное/)[0]!.style.left).toBe('100%')
  })

  it('ноль — допустимая оценка', async () => {
    const { user } = setup()
    slider('настроение').focus()
    await user.keyboard('{Home}')
    expect(screen.getByText('0 из 10')).toBeInTheDocument()
  })

  it('кнопка неактивна, пока выставлены не все три оценки', async () => {
    const { user } = setup()
    expect(saveButton()).toBeDisabled()

    await move(user, 'настроение')
    expect(saveButton()).toBeDisabled()

    await move(user, 'самочувствие')
    expect(saveButton()).toBeDisabled()
  })

  it('с клавиатуры шаг — ровно единица, хоть под пальцем ползунок и плавный', async () => {
    const { user } = setup()
    slider('настроение').focus()
    await user.keyboard('{ArrowRight}{ArrowRight}')
    expect(screen.getByText('7 из 10')).toBeInTheDocument()

    await user.keyboard('{End}')
    expect(screen.getByText('10 из 10')).toBeInTheDocument()
  })

  it('кнопка включается, когда сдвинуты все три', async () => {
    const { user } = setup()
    for (const name of ['настроение', 'самочувствие', 'продуктивность']) await move(user, name)
    expect(saveButton()).toBeEnabled()
  })

  it('сохраняет оценки, теги и комментарий', async () => {
    const { user, onSave } = setup()
    for (const name of ['настроение', 'самочувствие', 'продуктивность']) await move(user, name)
    await user.click(screen.getByRole('button', { name: 'дедлайн' }))
    await user.type(screen.getByRole('textbox'), 'проверка')
    await user.click(saveButton())

    expect(onSave).toHaveBeenCalledTimes(1)
    const log = onSave.mock.calls[0]![0] as DayLog
    expect(log.day).toBe('2026-09-21')
    expect(log.tags).toEqual(['дедлайн'])
    expect(log.note).toBe('проверка')
    expect(log.closedAt).not.toBeNull()
    for (const v of [log.mood, log.wellbeing, log.productivity]) {
      expect(v).toBeGreaterThanOrEqual(1)
      expect(v).toBeLessThanOrEqual(10)
    }
  })

  it('Escape не закрывает окно, пока оценки не выставлены', async () => {
    const { user } = setup()
    await user.keyboard('{Escape}')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(saveButton()).toBeInTheDocument()
  })

  it('крестика для закрытия нет', () => {
    setup()
    expect(screen.queryByRole('button', { name: /close|закрыть окно/i })).not.toBeInTheDocument()
  })

  it('предупреждает, сколько задач останется невыполненными', () => {
    setup({ pendingCount: 2 })
    expect(screen.getByText(/2 задачи останутся невыполненными/i)).toBeInTheDocument()
  })

  it('правка уже закрытого дня открывается с прежними оценками и даёт отменить', () => {
    const existing: DayLog = {
      day: '2026-09-21',
      mood: 7,
      wellbeing: 6,
      productivity: 8,
      tags: ['отдых'],
      note: 'было',
      closedAt: '2026-09-21T21:00:00.000Z',
    }
    setup({ existing, onCancel: vi.fn() })

    expect(screen.queryByText('не выбрано')).not.toBeInTheDocument()
    expect(screen.getByRole('textbox')).toHaveValue('было')
    expect(screen.getByRole('button', { name: /отмена/i })).toBeInTheDocument()
    expect(saveButton()).toBeEnabled()
  })
})
