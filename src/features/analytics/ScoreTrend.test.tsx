import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { SeriesDay } from '@/domain/trend'
import { ScoreTrend } from './ScoreTrend'

const all = (value: number | null) => ({ day: value, mood: value, wellbeing: value, productivity: value })

/** Двадцать дней с 1 сентября; в `gaps` оценки нет — и сглаженной линии тоже. */
function series(gaps: number[] = []): SeriesDay[] {
  return Array.from({ length: 20 }, (_, i) => {
    const value = gaps.includes(i) ? null : 6 + (i % 3) * 0.5
    return { day: `2026-09-${String(i + 1).padStart(2, '0')}`, raw: all(value), smooth: all(value) }
  })
}

const dayPath = (container: HTMLElement) => container.querySelector('[data-line="day"]')!.getAttribute('d')!

describe('ScoreTrend', () => {
  it('описан для читалки: что за график и за какой срок', () => {
    render(<ScoreTrend series={series()} />)
    expect(screen.getByRole('slider', { name: /оценка дня за 20 дней/i })).toBeInTheDocument()
  })

  it('линия оценки дня рвётся там, где оценок не было', () => {
    const { container } = render(<ScoreTrend series={series([8, 9, 10])} />)
    expect(dayPath(container).match(/M/g)).toHaveLength(2)
  })

  it('без пропусков линия одна', () => {
    const { container } = render(<ScoreTrend series={series()} />)
    expect(dayPath(container).match(/M/g)).toHaveLength(1)
  })

  it('наведение на день показывает дату и оценки', () => {
    render(<ScoreTrend series={series()} />)
    fireEvent.pointerEnter(screen.getByTestId('day-2026-09-14'))

    const tip = screen.getByRole('status')
    expect(tip).toHaveTextContent('14 сентября')
    expect(tip).toHaveTextContent('6,5') // 14-е — тринадцатый день: 6 + 1 × 0,5
  })

  it('день без оценки в подсказке так и назван', () => {
    render(<ScoreTrend series={series([8])} />)
    fireEvent.pointerEnter(screen.getByTestId('day-2026-09-09'))
    expect(screen.getByRole('status')).toHaveTextContent(/без оценки/i)
  })

  it('с клавиатуры дни листаются стрелками', async () => {
    const user = userEvent.setup()
    render(<ScoreTrend series={series()} />)

    await user.tab()
    await user.keyboard('{ArrowLeft}')
    expect(screen.getByRole('status')).toHaveTextContent('19 сентября')
  })
})

describe('ScoreTrend — мышь, палец и читалка', () => {
  it('клик по дню показывает этот день, а не вчерашний', async () => {
    const user = userEvent.setup()
    render(<ScoreTrend series={series()} />)

    await user.click(screen.getByTestId('day-2026-09-05'))
    expect(screen.getByRole('status')).toHaveTextContent('5 сентября')
  })

  it('тап пальцем показывает день и не гаснет, когда палец убран; следующий тап — следующий день', async () => {
    const user = userEvent.setup()
    render(<ScoreTrend series={series()} />)

    await user.pointer({ keys: '[TouchA]', target: screen.getByTestId('day-2026-09-05') })
    expect(screen.getByRole('status')).toHaveTextContent('5 сентября')
    await user.pointer({ keys: '[TouchA]', target: screen.getByTestId('day-2026-09-10') })
    expect(screen.getByRole('status')).toHaveTextContent('10 сентября')
  })

  it('читалке значение дня отдаётся через aria-valuetext', async () => {
    const user = userEvent.setup()
    render(<ScoreTrend series={series()} />)

    await user.tab()
    await user.keyboard('{ArrowLeft}')
    expect(screen.getByRole('slider')).toHaveAttribute('aria-valuetext', expect.stringMatching(/19 сентября/))
  })
})
