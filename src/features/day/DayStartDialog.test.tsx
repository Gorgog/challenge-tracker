import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { DayStartDialog } from './DayStartDialog'

const setup = () => {
  const handlers = { onStart: vi.fn(), onSkip: vi.fn(), onCancel: vi.fn() }
  render(<DayStartDialog open day="2026-09-21" {...handlers} />)
  return { ...handlers, user: userEvent.setup() }
}

const slider = (name: string) => screen.getByRole('slider', { name: new RegExp(name, 'i') })
const startButton = () => screen.getByRole('button', { name: /начать день/i })

/** Сдвинуть ползунок с клавиатуры: фокус на бегунке, стрелка вправо — с пятёрки на шестёрку. */
async function move(user: ReturnType<typeof userEvent.setup>, name: string) {
  slider(name).focus()
  await user.keyboard('{ArrowRight}')
}

describe('окно начала дня', () => {
  it('три утренние оценки стартуют не выставленными', () => {
    setup()
    expect(screen.getAllByText('не выбрано')).toHaveLength(3)
    expect(slider('сон')).toBeInTheDocument()
    expect(slider('самочувствие')).toBeInTheDocument()
    expect(slider('настроение')).toBeInTheDocument()
  })

  it('у сна свои якоря на позициях своих значений', () => {
    setup()
    expect(screen.getByText('0 — не спал').style.left).toBe('0%')
    expect(screen.getByText('10 — отлично').style.left).toBe('100%')
  })

  it('самочувствие и настроение — с теми же якорями, что вечером: утро и вечер сравнимы', () => {
    setup()
    expect(screen.getByText('0 — разбит')).toBeInTheDocument()
    expect(screen.getByText('10 — полон сил')).toBeInTheDocument()
    expect(screen.getByText('0 — дно')).toBeInTheDocument()
    expect(screen.getByText('10 — отличное')).toBeInTheDocument()
  })

  it('«Начать день» неактивна, пока не выставлены все три', async () => {
    const { user } = setup()
    await move(user, 'сон')
    await move(user, 'самочувствие')
    expect(startButton()).toBeDisabled()
    await move(user, 'настроение')
    expect(startButton()).toBeEnabled()
  })

  it('начинает день с утренними оценками', async () => {
    const { user, onStart, onSkip } = setup()
    await move(user, 'сон')
    await move(user, 'самочувствие')
    await move(user, 'настроение')
    await user.click(startButton())

    expect(onStart).toHaveBeenCalledWith({ sleep: 6, wellbeing: 6, mood: 6 })
    expect(onSkip).not.toHaveBeenCalled()
  })

  it('«Пропустить утро» начинает день без оценок', async () => {
    const { user, onStart, onSkip } = setup()
    await user.click(screen.getByRole('button', { name: /пропустить утро/i }))

    expect(onSkip).toHaveBeenCalled()
    expect(onStart).not.toHaveBeenCalled()
  })

  it('окно можно закрыть — день остаётся не начатым', async () => {
    const { user, onStart, onSkip, onCancel } = setup()
    await user.keyboard('{Escape}')

    expect(onCancel).toHaveBeenCalled()
    expect(onStart).not.toHaveBeenCalled()
    expect(onSkip).not.toHaveBeenCalled()
  })

  it('предупреждает, что утро записывается один раз', () => {
    setup()
    expect(screen.getByText(/утро записывается один раз/i)).toBeInTheDocument()
  })
})
