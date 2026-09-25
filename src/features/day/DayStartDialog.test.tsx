import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { UsualNight } from '@/domain/night'
import { DayStartDialog } from './DayStartDialog'

const USUAL: UsualNight = { bed: -30, wake: 460 }
/** Утро 21.09, 9:00 — обычный подъём 7:40 уже прошёл. */
const NINE = new Date(2026, 8, 21, 9, 0)

const setup = ({ usual = USUAL, now = NINE }: { usual?: UsualNight; now?: Date } = {}) => {
  const handlers = { onStart: vi.fn(), onSkip: vi.fn(), onCancel: vi.fn() }
  render(<DayStartDialog open day="2026-09-21" usual={usual} now={() => now} {...handlers} />)
  return { ...handlers, user: userEvent.setup() }
}

const slider = (name: string) => screen.getByRole('slider', { name: new RegExp(name, 'i') })
const startButton = () => screen.getByRole('button', { name: /начать день/i })
const usualButton = (label: 'Лёг' | 'Встал') => screen.getByRole('button', { name: new RegExp(`${label} как обычно`, 'i') })
const timeField = (label: 'Лёг' | 'Встал') => screen.getByLabelText(`${label}, точное время`) as HTMLInputElement
const setTime = (label: 'Лёг' | 'Встал', value: string) => fireEvent.change(timeField(label), { target: { value } })

/** Сдвинуть ползунок с клавиатуры: фокус на бегунке, стрелка вправо — с пятёрки на шестёрку. */
async function move(user: ReturnType<typeof userEvent.setup>, name: string) {
  slider(name).focus()
  await user.keyboard('{ArrowRight}')
}

async function scores(user: ReturnType<typeof userEvent.setup>) {
  await move(user, 'сон')
  await move(user, 'самочувствие')
  await move(user, 'настроение')
}

/** Ночь «как обычно»: обе кнопки. */
async function usualNight(user: ReturnType<typeof userEvent.setup>) {
  await user.click(usualButton('Лёг'))
  await user.click(usualButton('Встал'))
}

describe('окно начала дня', () => {
  it('ночь и три утренние оценки стартуют не выбранными', () => {
    setup()
    expect(screen.getAllByText('не выбрано')).toHaveLength(5)
    expect(timeField('Лёг').value).toBe('')
    expect(timeField('Встал').value).toBe('')
    expect(usualButton('Лёг')).toHaveAttribute('aria-pressed', 'false')
    expect(slider('сон')).toBeInTheDocument()
    expect(slider('самочувствие')).toBeInTheDocument()
    expect(slider('настроение')).toBeInTheDocument()
  })

  it('ночь — над оценками: сначала лёг и встал, потом сон', () => {
    setup()
    const bed = timeField('Лёг')
    const wake = timeField('Встал')
    expect(bed.compareDocumentPosition(wake) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(wake.compareDocumentPosition(slider('сон')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
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

  it('«Начать день» неактивна, пока нет всех пяти ответов', async () => {
    const { user } = setup()
    await scores(user)
    expect(startButton()).toBeDisabled()
    await user.click(usualButton('Лёг'))
    expect(startButton()).toBeDisabled()
    await user.click(usualButton('Встал'))
    expect(startButton()).toBeEnabled()
  })

  it('начинает день с ночью и утренними оценками', async () => {
    const { user, onStart, onSkip } = setup()
    await usualNight(user)
    await scores(user)
    await user.click(startButton())

    expect(onStart).toHaveBeenCalledWith({
      sleep: 6,
      wellbeing: 6,
      mood: 6,
      night: { bed: -30, wake: 460, bedHow: 'usual', wakeHow: 'usual' },
    })
    expect(onSkip).not.toHaveBeenCalled()
  })

  it('заметка утра — по кнопке «+ заметка», необязательная; уходит вместе с утром (решение Georgy 25.09)', async () => {
    const { user, onStart } = setup()
    expect(screen.queryByRole('textbox', { name: 'Заметка утра' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '+ заметка' }))
    await user.type(screen.getByRole('textbox', { name: 'Заметка утра' }), '  Голова болит ')
    await usualNight(user)
    await scores(user)
    await user.click(startButton())
    expect(onStart).toHaveBeenCalledWith({
      sleep: 6,
      wellbeing: 6,
      mood: 6,
      night: { bed: -30, wake: 460, bedHow: 'usual', wakeHow: 'usual' },
      note: 'Голова болит',
    })
  })

  it('заметку открыли и не написали — утро без заметки', async () => {
    const { user, onStart } = setup()
    await user.click(screen.getByRole('button', { name: '+ заметка' }))
    await user.type(screen.getByRole('textbox', { name: 'Заметка утра' }), '   ')
    await usualNight(user)
    await scores(user)
    await user.click(startButton())
    expect(onStart.mock.calls[0]![0]).not.toHaveProperty('note')
  })

  it('«как обычно» подставляет обычное время в поле и справа', async () => {
    const { user } = setup()
    expect(usualButton('Лёг')).toHaveTextContent('23:30')
    await user.click(usualButton('Лёг'))
    expect(timeField('Лёг').value).toBe('23:30')
    expect(usualButton('Лёг')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getAllByText('не выбрано')).toHaveLength(4)
    expect(screen.getByText('23:30', { selector: 'em' })).toBeInTheDocument()
  })

  it('правка поля — ответ «точно», кнопка отжимается; отбой после полуночи — плюс', async () => {
    const { user, onStart } = setup()
    await usualNight(user)
    setTime('Лёг', '00:30')
    expect(usualButton('Лёг')).toHaveAttribute('aria-pressed', 'false')
    await scores(user)
    await user.click(startButton())
    expect(onStart.mock.calls[0]![0].night).toEqual({ bed: 30, wake: 460, bedHow: 'exact', wakeHow: 'usual' })
  })

  it('поле, совпавшее с обычным временем, — всё равно «точно»: ответ дан полем', async () => {
    const { user, onStart } = setup()
    setTime('Лёг', '23:30')
    setTime('Встал', '07:40')
    await scores(user)
    await user.click(startButton())
    expect(onStart.mock.calls[0]![0].night).toEqual({ bed: -30, wake: 460, bedHow: 'exact', wakeHow: 'exact' })
  })

  it('обычный подъём ещё не наступил — кнопка выключена, поле в будущем не пускает', async () => {
    const { user } = setup({ now: new Date(2026, 8, 21, 7, 10) })
    expect(usualButton('Встал')).toBeDisabled()
    expect(screen.getByText(/7:40 ещё не наступило/)).toBeInTheDocument()
    expect(usualButton('Лёг')).toBeEnabled()
    await user.click(usualButton('Лёг'))
    setTime('Встал', '08:00')
    await scores(user)
    expect(screen.getByRole('alert')).toHaveTextContent(/ещё не наступило/)
    expect(startButton()).toBeDisabled()
    setTime('Встал', '07:05')
    expect(screen.queryByRole('alert')).toBeNull()
    expect(startButton()).toBeEnabled()
  })

  it('лёг не раньше, чем встал, — ошибка, начать нельзя', async () => {
    const { user } = setup()
    setTime('Лёг', '08:00')
    setTime('Встал', '07:40')
    await scores(user)
    expect(screen.getByRole('alert')).toHaveTextContent(/лёг позже, чем встал/i)
    expect(startButton()).toBeDisabled()
  })

  it('первые дни — обычного нет: только поля, ответ «точно»', async () => {
    const { user, onStart } = setup({ usual: { bed: null, wake: null } })
    expect(screen.queryByRole('button', { name: /как обычно/i })).toBeNull()
    expect(screen.getByText(/появится после трёх/i)).toBeInTheDocument()
    setTime('Лёг', '23:10')
    setTime('Встал', '07:00')
    await scores(user)
    await user.click(startButton())
    expect(onStart.mock.calls[0]![0].night).toEqual({ bed: -50, wake: 420, bedHow: 'exact', wakeHow: 'exact' })
  })

  it('стёртое поле — снова не выбрано', async () => {
    const { user } = setup()
    await usualNight(user)
    setTime('Встал', '')
    expect(screen.getAllByText('не выбрано')).toHaveLength(4)
    expect(usualButton('Встал')).toHaveAttribute('aria-pressed', 'false')
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
