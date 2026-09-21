import { describe, expect, it } from 'vitest'
import { addDays, dayKey, parseDay } from './date'
import { averages, scoreSeries } from './trend'
import type { DayLog } from './types'

const TODAY = parseDay('2026-09-21')

const log = (back: number, score: number, over: Partial<DayLog> = {}): DayLog => {
  const day = dayKey(addDays(TODAY, -back))
  return {
    day, mood: score, wellbeing: score, productivity: score, tags: [], note: '',
    closedAt: `${day}T21:00:00.000Z`, ...over,
  }
}

describe('scoreSeries — ряд оценок по дням', () => {
  it('последние N дней по вчера включительно — сегодня ещё идёт', () => {
    const series = scoreSeries([], TODAY, 10)
    expect(series).toHaveLength(10)
    expect(series[0]!.day).toBe('2026-09-11')
    expect(series.at(-1)!.day).toBe('2026-09-20')
  })

  it('день без оценки — пусто, а не ноль', () => {
    const series = scoreSeries([log(2, 7)], TODAY, 5)
    expect(series.find((d) => d.day === '2026-09-19')!.raw.day).toBe(7)
    expect(series.find((d) => d.day === '2026-09-18')!.raw.day).toBeNull()
  })

  it('оценка дня — среднее трёх шкал', () => {
    const series = scoreSeries([log(1, 0, { mood: 6, wellbeing: 9, productivity: 3 })], TODAY, 3)
    expect(series.at(-1)!.raw.day).toBe(6)
    expect(series.at(-1)!.raw.wellbeing).toBe(9)
  })

  it('сглаживание — среднее по оценённым дням последней недели, пропуски не тянут вниз', () => {
    const logs = [log(3, 6), log(2, 8)] // 18 и 19 сентября; 20-го оценки нет
    expect(scoreSeries(logs, TODAY, 3).at(-1)!.smooth.day).toBe(7)
  })

  it('неделя без оценок рвёт и сглаженную линию', () => {
    const logs = [log(20, 6), log(1, 8)]
    const gap = scoreSeries(logs, TODAY, 20).find((d) => d.day === dayKey(addDays(TODAY, -10)))!
    expect(gap.smooth.day).toBeNull()
  })

  it('сглаживание берёт и дни до начала графика — первые точки не проседают', () => {
    const logs = [log(12, 5), log(11, 5), log(10, 5)]
    expect(scoreSeries(logs, TODAY, 10)[0]!.smooth.day).toBe(5)
  })

  it('незакрытый день в ряд не идёт', () => {
    const series = scoreSeries([log(1, 7, { closedAt: null })], TODAY, 3)
    expect(series.at(-1)!.raw.day).toBeNull()
  })
})

describe('averages — средние за месяц и сдвиг к прошлому', () => {
  it('последние 30 дней против предыдущих 30', () => {
    const logs = [log(1, 8), log(15, 6), log(40, 5), log(45, 7)]
    const a = averages(logs, TODAY, 30)

    expect(a.current.day).toBe(7)
    expect(a.previous.day).toBe(6)
    expect(a.currentDays).toBe(2)
    expect(a.previousDays).toBe(2)
  })

  it('без оценок — пусто, а не ноль', () => {
    const a = averages([log(1, 8)], TODAY, 30)
    expect(a.previous.day).toBeNull()
    expect(a.previousDays).toBe(0)
  })
})
