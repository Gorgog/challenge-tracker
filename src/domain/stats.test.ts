import { describe, expect, it } from 'vitest'
import { addDays, dayKey, parseDay } from './date'
import { forecast, scoreSplit, tagStats, weekProfile } from './stats'
import type { Challenge, DayLog, EntryMap } from './types'

const TODAY = parseDay('2026-09-21')

function challenge(over: Partial<Challenge> = {}): Challenge {
  return {
    id: 'c1', name: 'Отжимания', code: 'ОТЖ', kind: 'do', measure: 'binary', goal: 1,
    unit: null, color: 'var(--chart-1)', tag: null, startDate: '2026-09-01',
    lengthDays: null, status: 'active', sortOrder: 0, ...over,
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
    const f = forecast(limited, entries, TODAY)
    expect(f.pace).toBe(1)
    expect(f.projected).toBe(30)
    expect(f.onTrack).toBe(true)
  })

  it('половинный темп не дотягивает до цели', () => {
    const entries = entriesBack(20, (i) => i % 2 === 0)
    const f = forecast(limited, entries, TODAY)
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

describe('scoreSplit', () => {
  const c = challenge({ startDate: '2026-07-01' })

  it('сравнивает среднюю оценку в дни с выполнением и без', () => {
    const entries = entriesBack(60, (i) => i % 2 === 0)
    const logs = Array.from({ length: 60 }, (_, k) => {
      const day = addDays(TODAY, -(k + 1))
      return log(dayKey(day), { mood: (k + 1) % 2 === 0 ? 8 : 4 })
    })
    const split = scoreSplit(c, entries, logs, 'mood', TODAY)
    expect(split?.withHit).toBeCloseTo(8)
    expect(split?.withoutHit).toBeCloseTo(4)
    expect(split?.delta).toBeCloseTo(4)
  })

  it('не делает вывод, если в группе меньше десяти дней', () => {
    const entries = entriesBack(12, (i) => i > 3) // без выполнения всего 3 дня
    const logs = Array.from({ length: 12 }, (_, k) => log(dayKey(addDays(TODAY, -(k + 1)))))
    expect(scoreSplit(c, entries, logs, 'mood', TODAY)).toBeNull()
  })

  it('дни без оценки в расчёт не идут', () => {
    const entries = entriesBack(40, () => true)
    expect(scoreSplit(c, entries, [], 'mood', TODAY)).toBeNull()
  })
})

describe('tagStats', () => {
  it('считает средние оценки по тегу и общее среднее', () => {
    const logs = [
      ...Array.from({ length: 5 }, (_, k) => log(`2026-09-0${k + 1}`, { tags: ['мало спал'], wellbeing: 3 })),
      ...Array.from({ length: 5 }, (_, k) => log(`2026-09-1${k}`, { wellbeing: 7 })),
    ]
    const stats = tagStats(logs)
    const sleep = stats.find((s) => s.tag === 'мало спал')
    expect(sleep?.days).toBe(5)
    expect(sleep?.wellbeing).toBe(3)
    expect(sleep?.baseline.wellbeing).toBe(5)
  })

  it('редкие теги не показываются — выборка слишком мала', () => {
    const logs = [
      log('2026-09-01', { tags: ['ссора'] }),
      log('2026-09-02', { tags: ['ссора'] }),
      ...Array.from({ length: 6 }, (_, k) => log(`2026-09-1${k}`, { tags: ['выходной'] })),
    ]
    const tags = tagStats(logs).map((s) => s.tag)
    expect(tags).toContain('выходной')
    expect(tags).not.toContain('ссора')
  })

  it('сортирует по частоте', () => {
    const logs = [
      ...Array.from({ length: 4 }, (_, k) => log(`2026-09-0${k + 1}`, { tags: ['дедлайн'] })),
      ...Array.from({ length: 8 }, (_, k) => log(`2026-09-1${k}`, { tags: ['выходной'] })),
    ]
    expect(tagStats(logs)[0]?.tag).toBe('выходной')
  })
})
