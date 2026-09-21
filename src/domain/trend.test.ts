import { describe, expect, it } from 'vitest'
import { addDays, dayKey, parseDay } from './date'
import { averages, coverage, scoreSeries, sleepAverages, sleepSeries } from './trend'
import type { DayLog, DayStart } from './types'

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

describe('scoreSeries и averages — границы окон', () => {
  it('сглаживание захватывает дни до начала ряда: девятка накануне и пятёрка в первый день дают семь', () => {
    const logs = [log(11, 9), log(10, 5)]
    expect(scoreSeries(logs, TODAY, 10)[0]!.smooth.day).toBe(7)
  })

  it('окно сглаживания — ровно неделя: седьмой день назад входит, восьмой — нет', () => {
    expect(scoreSeries([log(7, 10), log(1, 4)], TODAY, 1)[0]!.smooth.day).toBe(7)
    expect(scoreSeries([log(8, 10), log(1, 4)], TODAY, 1)[0]!.smooth.day).toBe(4)
  })

  it('последние 30 дней не включают сегодня — он ещё идёт', () => {
    const logs = [log(0, 10), log(1, 4)]
    expect(averages(logs, TODAY, 30).current.day).toBe(4)
  })

  it('прошлые 30 — ровно с 31-го по 60-й день назад, без перекрытия с текущими', () => {
    const logs = [log(30, 8), log(31, 2), log(60, 2), log(61, 9)]
    const a = averages(logs, TODAY, 30)

    expect(a.current.day).toBe(8)
    expect(a.previous.day).toBe(2)
    expect(a.previousDays).toBe(2)
  })

  it('незакрытый день в средние не идёт', () => {
    const logs = [log(1, 10, { closedAt: null }), log(2, 4)]
    expect(averages(logs, TODAY, 30).current.day).toBe(4)
  })
})

describe('coverage — сколько дней оценено', () => {
  it('закрытый сегодня день не считается: «оценено» — по вчера, как и «из скольких»', () => {
    const logs = [log(0, 7), log(1, 7), log(3, 7)]
    expect(coverage(logs, TODAY)).toEqual({ rated: 2, span: 3, sick: 0 })
  })

  it('первый же закрытый день не даёт «1 из 0»', () => {
    expect(coverage([log(0, 7)], TODAY)).toEqual({ rated: 0, span: 0, sick: 0 })
  })

  it('дни болезни считаются среди оценённых', () => {
    const logs = [log(1, 3, { tags: ['болел'] }), log(2, 7)]
    expect(coverage(logs, TODAY).sick).toBe(1)
  })
})

/** Начало дня `back` дней назад; сон null — утро пропущено. */
const start = (back: number, sleep: number | null): DayStart => {
  const day = dayKey(addDays(TODAY, -back))
  return { day, morning: sleep === null ? null : { sleep, wellbeing: 6, mood: 6 }, startedAt: `${day}T08:00:00.000Z` }
}

describe('сон по утрам — ряд и средние', () => {
  it('ряд — по вчера: пропущенное утро — пусто, а не ноль; сегодняшнее утро в ряд не идёт', () => {
    const series = sleepSeries([start(0, 9), start(1, 6), start(2, null), start(3, 4)], TODAY, 5)
    expect(series.map((d) => d.day)).toEqual(['2026-09-16', '2026-09-17', '2026-09-18', '2026-09-19', '2026-09-20'])
    expect(series.map((d) => d.raw)).toEqual([null, null, 4, null, 6])
  })

  it('сглаживание — среднее утр за неделю, считая сам день; без утр за неделю — пусто', () => {
    const series = sleepSeries([start(1, 6), start(3, 4)], TODAY, 10)
    expect(series.at(-1)!.smooth).toBe(5)
    expect(series[0]!.smooth).toBeNull()
  })

  it('средние за последние 30 дней и прошлые 30 — по дням с утром, со своим числом дней', () => {
    const starts = [start(0, 10), start(1, 8), start(2, 6), start(3, null), start(35, 5), start(40, null)]
    expect(sleepAverages(starts, TODAY)).toEqual({ current: 7, previous: 5, currentDays: 2, previousDays: 1 })
  })

  it('без утр — пусто и ноль дней', () => {
    expect(sleepAverages([start(1, null)], TODAY)).toEqual({ current: null, previous: null, currentDays: 0, previousDays: 0 })
    expect(sleepSeries([], TODAY, 3).every((d) => d.raw === null && d.smooth === null)).toBe(true)
  })
})

describe('сон по утрам — сегодняшнее утро', () => {
  it('сглаживание вчерашнего дня сегодняшнее утро не берёт', () => {
    const series = sleepSeries([start(0, 10), start(1, 2)], TODAY, 3)
    expect(series.at(-1)!.smooth).toBe(2)
  })
})
