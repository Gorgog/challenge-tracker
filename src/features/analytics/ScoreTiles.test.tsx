import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { Averages } from '@/domain/trend'
import { ScoreTiles } from './ScoreTiles'

const all = (value: number | null) => ({ day: value, mood: value, wellbeing: value, productivity: value })

describe('ScoreTiles', () => {
  it('средние за 30 дней и сдвиг к прошлым 30', () => {
    const a: Averages = {
      current: { day: 7.14, mood: 7.5, wellbeing: 6.9, productivity: 7.02 },
      previous: { day: 6.8, mood: 7.5, wellbeing: 7.4, productivity: 6.5 },
      currentDays: 28,
      previousDays: 30,
    }
    render(<ScoreTiles averages={a} />)

    const day = screen.getByRole('group', { name: /оценка дня/i })
    expect(day).toHaveTextContent('7,1')
    expect(day).toHaveTextContent('+0,3')
    expect(screen.getByRole('group', { name: /самочувствие/i })).toHaveTextContent('−0,5')
  })

  it('без оценок — прочерк, а не ноль', () => {
    render(<ScoreTiles averages={{ current: all(null), previous: all(null), currentDays: 0, previousDays: 0 }} />)
    expect(screen.getByRole('group', { name: /оценка дня/i })).toHaveTextContent('—')
  })

  it('без прошлого месяца сдвиг не показывается', () => {
    render(<ScoreTiles averages={{ current: all(7), previous: all(null), currentDays: 20, previousDays: 0 }} />)
    expect(screen.getByRole('group', { name: /оценка дня/i })).not.toHaveTextContent(/[+−]/)
  })
})
