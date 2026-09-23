import { describe, expect, it } from 'vitest'
import { addDays, dayKey, parseDay } from './date'
import { forecast, unratedDays, weekProfile } from './stats'
import type { Challenge, DayLog, EntryMap } from './types'

const TODAY = parseDay('2026-09-21')

function challenge(over: Partial<Challenge> = {}): Challenge {
  return {
    id: 'c1', name: 'Отжимания', code: 'ОТЖ', kind: 'do', measure: 'binary', goal: 1,
    unit: null, color: 'var(--chart-1)', tagIds: [], startDate: '2026-09-01',
    lengthDays: null, pauses: [], rulesLocked: false, deletedAt: null, sortOrder: 0,
    ...over,
  }
}

/** Отметки за N дней назад от сегодня: predicate решает, был ли день выполнен. */
function entriesBack(days: number, done: (index: number, day: Date) => boolean): EntryMap {
  const map: EntryMap = {}
  for (let i = days; i >= 1; i--) {
    const day = addDays(TODAY, -i)
    if (done(i, day)) map[dayKey(day)] = 1
  }
  return map
}

function log(day: string, over: Partial<DayLog> = {}): DayLog {
  return { day, mood: 6, wellbeing: 6, productivity: 6, tags: [], note: '', closedAt: `${day}T21:00:00Z`, ...over }
}

describe('forecast', () => {
  const limited = challenge({ startDate: '2026-09-01', lengthDays: 30 })

  it('считает темп по прошедшим дням и прогноз на финиш', () => {
    // 20 прошедших дней (1–20 сентября), выполнены все
    const entries = entriesBack(20, () => true)
    const f = forecast(limited, entries, TODAY)!
    expect(f.pace).toBe(1)
    expect(f.projected).toBe(30)
    expect(f.onTrack).toBe(true)
  })

  it('половинный темп не дотягивает до цели', () => {
    const entries = entriesBack(20, (i) => i % 2 === 0)
    const f = forecast(limited, entries, TODAY)!
    expect(f.pace).toBeCloseTo(0.5)
    expect(f.projected).toBe(15)
    expect(f.onTrack).toBe(false)
  })

  it('у бессрочного челленджа прогноза нет', () => {
    expect(forecast(challenge(), {}, TODAY)).toBeNull()
  })

  it('дней до финиша считается вместе с сегодняшним', () => {
    const f = forecast(limited, {}, TODAY)
    expect(f?.daysLeft).toBe(10) // 21–30 сентября
  })
})

describe('weekProfile', () => {
  it('считает долю выполнения по каждому дню недели', () => {
    const c = challenge({ startDate: '2026-08-24' }) // понедельник
    // выполняю всё, кроме суббот
    const entries = entriesBack(28, (_i, day) => day.getDay() !== 6)
    const profile = weekProfile(c, entries, TODAY)
    expect(profile[0]?.rate).toBe(1) // понедельник
    expect(profile[5]?.rate).toBe(0) // суббота
    expect(profile[5]?.total).toBeGreaterThan(0)
  })

  it('дни недели без данных остаются пустыми', () => {
    const c = challenge({ startDate: '2026-09-19' }) // суббота, прошли сб и вс
    const profile = weekProfile(c, {}, TODAY)
    expect(profile[0]).toBeNull() // понедельника в выборке нет
    expect(profile[5]).not.toBeNull()
  })
})

describe('forecast и пауза', () => {
  it('на незакрытой паузе прогноза нет — финиш неизвестен', () => {
    const paused = challenge({ lengthDays: 30, pauses: [{ from: '2026-09-15', to: null }] })
    expect(forecast(paused, entriesBack(20, () => true), TODAY)).toBeNull()
  })

  it('закрытая пауза отодвигает финиш — дней до него становится больше', () => {
    const paused = challenge({ lengthDays: 30, pauses: [{ from: '2026-09-10', to: '2026-09-14' }] })
    // финиш 5 октября вместо 30 сентября
    expect(forecast(paused, {}, TODAY)?.daysLeft).toBe(15)
  })

  it('дни паузы в темп не входят', () => {
    const paused = challenge({ lengthDays: 30, pauses: [{ from: '2026-09-10', to: '2026-09-14' }] })
    // выполнены все дни, кроме паузы: темп ровно единица, а не 15 из 20
    const outsidePause = (_i: number, day: Date) => dayKey(day) < '2026-09-10' || dayKey(day) > '2026-09-14'
    expect(forecast(paused, entriesBack(20, outsidePause), TODAY)?.pace).toBe(1)
  })
})

describe('unratedDays — долг по оценкам', () => {
  it('дни без закрытой оценки за последние две недели, самый ранний первым', () => {
    const logs = Array.from({ length: 14 }, (_, k) => log(dayKey(addDays(TODAY, -(k + 1)))))
      .filter((l) => l.day !== '2026-09-10' && l.day !== '2026-09-18')
    expect(unratedDays(logs, TODAY)).toEqual(['2026-09-10', '2026-09-18'])
  })

  it('незакрытый итог — тоже долг', () => {
    const logs = Array.from({ length: 14 }, (_, k) => log(dayKey(addDays(TODAY, -(k + 1)))))
    logs[0] = { ...logs[0]!, closedAt: null }
    expect(unratedDays(logs, TODAY)).toEqual(['2026-09-20'])
  })

  it('сегодняшний день в долг не входит — он ещё идёт', () => {
    expect(unratedDays([], TODAY, 1)).toEqual(['2026-09-20'])
  })

  it('дни до начала пользования — не долг: новый пользователь ничего не должен', () => {
    expect(unratedDays([], TODAY, 14, dayKey(TODAY))).toEqual([])
    expect(unratedDays([], TODAY, 14, '2026-09-19')).toEqual(['2026-09-19', '2026-09-20'])
    expect(unratedDays([], TODAY, 14, null)).toHaveLength(14)
  })
})
