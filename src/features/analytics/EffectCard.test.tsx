import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { addDays, dayKey, parseDay } from '@/domain/date'
import { challengeEffects } from '@/domain/effects'
import type { DayLog } from '@/domain/types'
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

    it('объясняет числами, чего не хватает, и показывает месяц до старта против месяца после', () => {
      const fewRelapses = est('few', 0, [30, 2])
      render(<EffectCard effect={effect(fewRelapses, fewRelapses, { challenge: quit, beforeAfter: beforeAfterOf() })} />)

      expect(screen.getByText('Мало данных')).toBeInTheDocument()
      expect(screen.getByText(/учтено 2 срыва — для сравнения нужно хотя бы 3/i)).toBeInTheDocument()
      expect(screen.getByText(/до и после старта/i)).toBeInTheDocument()
      expect(screen.getByText(/без разницы/)).toBeInTheDocument()
    })

    it('учтённых срывов нет — так и сказано, без «0»; и не «срывов не было»: день старта и вчера не в счёт', () => {
      render(<EffectCard effect={effect(est('few', 0, [30, 0]), est('few', 0, [30, 0]), { challenge: quit, beforeAfter: beforeAfterOf() })} />)
      expect(screen.getByText(/учтённых срывов пока нет — дни не с чем сравнить/i)).toBeInTheDocument()
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

    it('начат только что — ни «сколько нужно», ни «до старта оценок нет»', () => {
      const fresh = challenge({ id: 'new', code: 'НОВ', name: 'Новая привычка' })
      const ba = beforeAfterOf({ span: 0, sinceStart: 0, beforeStart: 60, daysBefore: 0, daysAfter: 0, byMetric: nothing })
      render(<EffectCard effect={effect(est('few', 0, [0, 0]), est('few', 0, [0, 0]), { challenge: fresh, days: 0, beforeAfter: ba })} />)

      expect(screen.getByText(/только начат/i)).toBeInTheDocument()
      expect(screen.queryByText(/для сравнения нужно/i)).toBeNull()
      expect(screen.queryByText(/до старта оценок нет/i)).toBeNull()
    })

    const habit = challenge({ id: 'h', code: 'ПРВ', name: 'Привычка' })

    it('выполнений мало — сколько учтено и сколько нужно', () => {
      render(<EffectCard effect={effect(est('few', 0, [2, 33]), est('few', 0, [2, 33]), { challenge: habit, beforeAfter: beforeAfterOf() })} />)
      expect(screen.getByText(/учтено 2 выполнения — для сравнения нужно хотя бы 3/i)).toBeInTheDocument()
    })

    it('одно выполнение — «учтено 1 выполнение», один пропуск — «учтён 1 пропуск»', () => {
      const { unmount } = render(
        <EffectCard effect={effect(est('few', 0, [1, 30]), est('few', 0, [1, 30]), { challenge: habit, beforeAfter: beforeAfterOf() })} />,
      )
      expect(screen.getByText(/учтено 1 выполнение — для сравнения нужно хотя бы 3/i)).toBeInTheDocument()
      unmount()
      render(<EffectCard effect={effect(est('few', 0, [30, 1]), est('few', 0, [30, 1]), { challenge: habit, beforeAfter: beforeAfterOf() })} />)
      expect(screen.getByText(/учтён 1 пропуск — для сравнения нужно хотя бы 3/i)).toBeInTheDocument()
    })

    it('учтённых выполнений нет — так и сказано', () => {
      render(<EffectCard effect={effect(est('few', 0, [0, 33]), est('few', 0, [0, 33]), { challenge: habit, beforeAfter: beforeAfterOf() })} />)
      expect(screen.getByText(/учтённых выполнений пока нет — дни не с чем сравнить/i)).toBeInTheDocument()
    })

    it('учтённых пропусков нет — так и сказано', () => {
      render(<EffectCard effect={effect(est('few', 0, [30, 0]), est('few', 0, [30, 0]), { challenge: habit, beforeAfter: beforeAfterOf() })} />)
      expect(screen.getByText(/учтённых пропусков пока нет — дни не с чем сравнить/i)).toBeInTheDocument()
    })

    it('отказ с частыми срывами — выдержанных дней мало, с числами', () => {
      render(<EffectCard effect={effect(est('few', 0, [2, 33]), est('few', 0, [2, 33]), { challenge: quit, beforeAfter: beforeAfterOf() })} />)
      expect(screen.getByText(/учтено 2 выдержанных дня — для сравнения нужно хотя бы 3/i)).toBeInTheDocument()
    })

    it('обеих групп мало — сколько дней учтено и сколько нужно', () => {
      render(<EffectCard effect={effect(est('few', 0, [2, 1]), est('few', 0, [2, 1]), { challenge: habit, days: 3, beforeAfter: beforeAfterOf() })} />)
      expect(screen.getByText(/учтено 3 дня: с выполнением — 2, без — 1\. для сравнения нужно хотя бы по 3/i)).toBeInTheDocument()
    })

    it('группы полные, а дни модель не разделяет — так и сказано, без ложных чисел', () => {
      // Выполнения по расписанию: «не делал ни вчера, ни сегодня» — один день, «делал и вчера, и сегодня» —
      // ни одного. У этого дня полный рычаг, и модель не решается даже без поправок, как у ЧТН на 15-й день
      // «выгорания» в части миров.
      const today = parseDay('2026-09-21')
      const on = (i: number) => dayKey(addDays(today, i - 10))
      const read = challenge({ id: 'r', code: 'ЧТН', name: 'Читать 20 страниц', measure: 'binary', goal: 1, unit: null, startDate: on(0) })
      const entries = Object.fromEntries([0, 2, 5, 7, 9].map((i) => [on(i), 1]))
      const logs = Array.from({ length: 10 }, (_, i): DayLog => {
        const day = on(i)
        return { day, mood: 5 + (i % 3), wellbeing: 6, productivity: 5 + (i % 2), tags: [], note: '', closedAt: `${day}T21:00:00.000Z` }
      })
      const [e] = challengeEffects([read], { r: entries }, logs, today)

      expect(e!.verdict).toBe('insufficient')
      expect(Math.min(e!.windows.day.same.withDays, e!.windows.day.same.withoutDays)).toBeGreaterThanOrEqual(3)
      render(<EffectCard effect={e!} />)
      expect(screen.getByText(/дни пока не разделить/i)).toBeInTheDocument()
      expect(screen.queryByText(/нужно хотя бы/i)).toBeNull()
    })
  })

  it('ранний вывод — бейдж «Возможно» с пунктирной рамкой, слабее «Похоже», и слово в таблице', () => {
    render(<EffectCard effect={effect(est('flat', 0.1), est('possible', 0.9, [6, 20]))} />)

    const badge = screen.getByText('Возможно')
    expect(badge).toHaveClass('border', 'border-dashed')
    expect(badge).not.toHaveClass('bg-muted')
    expect(badge).not.toHaveClass('bg-primary')
    expect(screen.getByText('Следующий день лучше')).toBeInTheDocument()
    expect(dayRow()).toHaveTextContent('+0,9')
    expect(dayRow()).toHaveTextContent('возможно')
  })
})
