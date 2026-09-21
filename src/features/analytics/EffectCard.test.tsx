import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { EffectCard } from './EffectCard'
import { beforeAfterOf, challenge, effect, est } from './testing'

const dayRow = () => screen.getByRole('row', { name: /оценка дня/i })

describe('EffectCard', () => {
  it('в заголовке — слово уверенности и вывод словами', () => {
    render(<EffectCard effect={effect(est('likely', 1.1), est('strong', 1.5))} />)

    expect(screen.getByText('Уверенно')).toBeInTheDocument()
    expect(screen.getByText('Дни лучше — и на следующий день тоже')).toBeInTheDocument()
  })

  it('оценка дня в двух окнах — числом и словом', () => {
    render(<EffectCard effect={effect(est('likely', 1.1), est('strong', 1.5))} />)

    expect(dayRow()).toHaveTextContent('+1,1')
    expect(dayRow()).toHaveTextContent('похоже')
    expect(dayRow()).toHaveTextContent('+1,5')
    expect(dayRow()).toHaveTextContent('уверенно')
  })

  it('в колонке «в тот же день» не бывает «уверенно» — там причину от следствия не отличить', () => {
    render(<EffectCard effect={effect(est('strong', 2), est('flat', 0.1))} />)
    expect(dayRow()).not.toHaveTextContent('уверенно')
  })

  it('отрицательная разница — с настоящим минусом', () => {
    render(<EffectCard effect={effect(est('flat', 0.1), est('likely', -1.4))} />)
    expect(dayRow()).toHaveTextContent('−1,4')
  })

  it('шкалы по отдельности — по раскрытию', async () => {
    const user = userEvent.setup()
    render(<EffectCard effect={effect(est('likely', 1.1), est('strong', 1.5))} />)

    expect(screen.getByRole('row', { name: /самочувствие/i })).not.toBeVisible()
    await user.click(screen.getByText('По шкалам'))
    expect(screen.getByRole('row', { name: /самочувствие/i })).toBeVisible()
  })

  it('сколько дней учтено и сколько дней болезни выброшено', () => {
    render(
      <EffectCard effect={effect(est('likely', 1, [38, 28]), est('strong', 1.5), { days: 66, sickDays: 4 })} />,
    )
    expect(screen.getByText(/учтено 66 дней: с — 38, без — 28/)).toBeInTheDocument()
    expect(screen.getByText(/4 дня не учтены из-за болезни/)).toBeInTheDocument()
  })

  it('число и глагол согласованы: один день — «учтён», «не учтён»', () => {
    render(
      <EffectCard effect={effect(est('likely', 1, [12, 9]), est('strong', 1.5), { days: 21, sickDays: 1 })} />,
    )
    expect(screen.getByText(/учтён 21 день: с — 12, без — 9/)).toBeInTheDocument()
    expect(screen.getByText(/1 день не учтён из-за болезни/)).toBeInTheDocument()
  })

  it('сосед назван — его вклад в разницу уже вычтен', () => {
    const partner = challenge({ id: 'read', code: 'ЧТН', name: 'Читать 20 страниц' })
    render(<EffectCard effect={effect(est('likely', 1), est('flat', 0.1), { partner })} />)
    expect(screen.getByText(/делается вместе с ЧТН/)).toBeInTheDocument()
  })

  it('близнец назван: делаются почти всегда вместе, и чей это эффект — не сказать', () => {
    const twin = challenge({ id: 'read', code: 'ЧТН', name: 'Читать 20 страниц' })
    render(<EffectCard effect={effect(est('flat', 0.1), est('likely', 1.2), { twin })} />)
    expect(screen.getByText(/почти всегда вместе с ЧТН — чей эффект, не сказать/)).toBeInTheDocument()
  })

  it('челлендж на паузе помечен', () => {
    const paused = challenge({ pauses: [{ from: '2026-09-01', to: null }] })
    render(<EffectCard effect={effect(est('flat', 0.1), est('flat', 0.1), { challenge: paused })} />)
    expect(screen.getByText(/на паузе/i)).toBeInTheDocument()
  })

  describe('мало данных', () => {
    const quit = challenge({ id: 'smoke', kind: 'quit', code: 'БСГ', name: 'Без сигарет' })

    it('объясняет, что дни не с чем сравнить, и показывает месяц до старта против месяца после', () => {
      const noRelapses = est('few', 0, [30, 3])
      render(<EffectCard effect={effect(noRelapses, noRelapses, { challenge: quit, beforeAfter: beforeAfterOf() })} />)

      expect(screen.getByText('Мало данных')).toBeInTheDocument()
      expect(screen.getByText(/срывов почти нет/i)).toBeInTheDocument()
      expect(screen.getByText(/до и после старта/i)).toBeInTheDocument()
      expect(screen.getByText(/без разницы/)).toBeInTheDocument()
    })

    it('начатые одновременно — предупреждение, что эффекты не разделить', () => {
      const ba = beforeAfterOf({ inseparableFrom: [challenge({ code: 'ШАГ' })] })
      render(<EffectCard effect={effect(est('few'), est('few'), { challenge: quit, beforeAfter: ba })} />)
      expect(screen.getByText(/в те же дни начат ШАГ/i)).toBeInTheDocument()
    })

    const none = est('few')
    const nothing = { day: none, mood: none, wellbeing: none, productivity: none }

    it('до старта оценок нет — так и сказано', () => {
      const ba = beforeAfterOf({ span: 0, sinceStart: 30, beforeStart: 0, daysBefore: 0, daysAfter: 0, byMetric: nothing })
      render(<EffectCard effect={effect(est('few', 0, [28, 2]), est('few', 0, [28, 2]), { challenge: quit, beforeAfter: ba })} />)
      expect(screen.getByText(/до старта оценок нет/i)).toBeInTheDocument()
    })

    it('начат только что — не «пропусков почти нет» и не «до старта оценок нет»', () => {
      const fresh = challenge({ id: 'new', code: 'НОВ', name: 'Новая привычка' })
      const ba = beforeAfterOf({ span: 0, sinceStart: 0, beforeStart: 60, daysBefore: 0, daysAfter: 0, byMetric: nothing })
      render(<EffectCard effect={effect(est('few', 0, [0, 0]), est('few', 0, [0, 0]), { challenge: fresh, days: 0, beforeAfter: ba })} />)

      expect(screen.getByText(/только начат/i)).toBeInTheDocument()
      expect(screen.queryByText(/почти нет/i)).toBeNull()
      expect(screen.queryByText(/до старта оценок нет/i)).toBeNull()
    })

    it('почти одни пропуски — так и сказано', () => {
      const habit = challenge({ id: 'h', code: 'ПРВ', name: 'Привычка' })
      render(<EffectCard effect={effect(est('few', 0, [5, 33]), est('few', 0, [5, 33]), { challenge: habit, beforeAfter: beforeAfterOf() })} />)
      expect(screen.getByText(/выполнений почти нет/i)).toBeInTheDocument()
    })

    it('отказ с частыми срывами — выдержанных дней мало', () => {
      render(<EffectCard effect={effect(est('few', 0, [5, 33]), est('few', 0, [5, 33]), { challenge: quit, beforeAfter: beforeAfterOf() })} />)
      expect(screen.getByText(/выдержанных дней почти нет/i)).toBeInTheDocument()
    })
  })
})
