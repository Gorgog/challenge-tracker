import { describe, expect, it } from 'vitest'
import { bedtimeEntries } from './bedtime'
import { challengeInsight } from './challengeInsight'
import { addDays, dayKey, parseDay } from './date'
import { bestStreak, completionRate, currentStreak, dayOutcome, fullDays } from './streaks'
import type { Challenge, DayStart, EntryMap } from './types'

/*
 * «Ложусь раньше» (срез 4б): измерение `bedtime`, цель — минуты от полуночи утра (23:30 = −30). Отметок руками
 * нет: ночь после вечера D записана в утре D+1. Ночь не записана — «не записано»: серия замирает, в долю не идёт.
 */

const TODAY = parseDay('2026-09-24')
const key = (back: number) => dayKey(addDays(TODAY, -back))

const early: Challenge = {
  id: 'bed',
  name: 'Ложусь раньше',
  code: 'ЛЖР',
  kind: 'do',
  measure: 'bedtime',
  goal: -30,
  unit: '',
  color: 'var(--chart-1)',
  tagIds: [],
  startDate: key(10),
  lengthDays: null,
  pauses: [],
  rulesLocked: false,
  deletedAt: null,
  sortOrder: 0,
}

const night = (bed: number) => ({ bed, wake: 460, bedHow: 'exact' as const, wakeHow: 'exact' as const })
/** Начало дня `back` дней назад: `bed` — ночь перед этим утром; `null` — утро без ночи; `'skip'` — без утра. */
function start(back: number, bed: number | null | 'skip'): DayStart {
  const morning = bed === 'skip' ? null : { sleep: 7, wellbeing: 6, mood: 6, night: bed === null ? null : night(bed) }
  return { day: key(back), morning, startedAt: `${key(back)}T08:00:00` }
}
const outcome = (entries: EntryMap, back: number) => dayOutcome(early, entries, parseDay(key(back)), TODAY)

describe('bedtimeEntries — ночь после вечера дня', () => {
  it('отбой из утра D+1 — у дня D; утро без ночи или без утра — NaN; день D+1 не начат — ключа нет', () => {
    const map = bedtimeEntries([start(3, -45), start(2, null), start(1, 'skip')])
    expect(map).toEqual({ [key(4)]: -45, [key(3)]: NaN, [key(2)]: NaN })
    expect(key(1) in map).toBe(false)
  })
})

describe('dayOutcome — «Ложусь раньше»', () => {
  const entries = bedtimeEntries([start(5, -30), start(4, -29), start(3, 20), start(2, null)])

  it('лёг ровно в цель — выполнено, минутой позже — нет; после полуночи — тоже позже', () => {
    expect(outcome(entries, 6)).toBe('hit')
    expect(outcome(entries, 5)).toBe('miss')
    expect(outcome(entries, 4)).toBe('miss')
  })

  it('ночь не записана или день не начат — «не записано», а не пропуск', () => {
    expect(outcome(entries, 3)).toBe('unknown')
    // 2 дня назад: утро вчера не начато вовсе — ночь уже не узнать
    expect(outcome(entries, 2)).toBe('unknown')
  })

  it('вчера, пока сегодня не начато, и сегодня — ещё идёт', () => {
    expect(outcome(entries, 1)).toBe('pending')
    expect(outcome(entries, 0)).toBe('pending')
    // сегодня начато без ночи — вчерашняя ночь уже не узнается
    expect(outcome(bedtimeEntries([start(0, null)]), 1)).toBe('unknown')
    expect(outcome(bedtimeEntries([start(0, -40)]), 1)).toBe('hit')
  })

  it('пауза и дни до старта — по-прежнему вне челленджа', () => {
    const paused = { ...early, pauses: [{ from: key(6), to: key(6) }] }
    expect(dayOutcome(paused, entries, parseDay(key(6)), TODAY)).toBe('outside')
    expect(outcome(entries, 11)).toBe('outside')
  })
})

describe('серии и доли — «не записано» как пауза', () => {
  // 10 → 1 день назад: hit hit ? hit miss hit ? ? hit hit, вчера — сегодня начато с ночью −40
  const beds: (number | null)[] = [-40, -50, null, -35, 30, -60, null, null, -45, -40]
  const starts = beds.map((b, i) => start(9 - i, b))
  const entries = bedtimeEntries(starts)

  it('текущая серия: «не записано» не рвёт и не прибавляет; сегодня ещё идёт — не рвёт', () => {
    // вчера hit (утро сегодня −40), 2 дня назад hit, 3 и 4 — не записано, 5 — hit, 6 — miss
    expect(currentStreak(early, entries, TODAY)).toBe(3)
  })

  it('вчера ещё идёт (сегодня не начато) — серия считается с позавчера', () => {
    const withoutToday = bedtimeEntries(starts.slice(0, -1))
    expect(outcome(withoutToday, 1)).toBe('pending')
    expect(currentStreak(early, withoutToday, TODAY)).toBe(2)
  })

  it('лучшая серия: «не записано» внутри — не обрыв', () => {
    expect(bestStreak(early, entries, TODAY)).toBe(3)
    // дни 10…1: hit hit ? hit hit miss hit miss miss hit — лучшая 4 (через «не записано»), текущая 1
    const run = bedtimeEntries([-40, -50, null, -35, -60, 30, -45, 10, 20, -40].map((b, i) => start(9 - i, b)))
    expect(currentStreak(early, run, TODAY)).toBe(1)
    expect(bestStreak(early, run, TODAY)).toBe(4)
  })

  it('доля — от записанных ночей: 6 из 7', () => {
    // 10 дней назад: ночь в утре 9 дней назад = −40 → hit; дни 10…1: hit hit ? hit miss hit ? ? hit hit
    expect(completionRate(early, entries, TODAY)).toBeCloseTo(6 / 7, 10)
  })

  it('«полные дни» не спотыкаются о «не записано»', () => {
    // дни 3 и 4 назад — только «не записано»: такие дни не в счёт, а не «не закрыты»
    expect(fullDays([early], { bed: entries }, TODAY, 4)).toBe(2)
    // с другой привычкой, выполненной все 4 дня: день с «не записано» полный — по той, что известна
    const read: Challenge = { ...early, id: 'read', measure: 'binary', goal: 1 }
    const all4 = { [key(1)]: 1, [key(2)]: 1, [key(3)]: 1, [key(4)]: 1 }
    expect(fullDays([early, read], { bed: entries, read: all4 }, TODAY, 4)).toBe(4)
  })

  it('разбор челленджа: известных — только выполнено и пропуск', () => {
    const r = challengeInsight(early, entries, [], TODAY)
    expect(r).toMatchObject({ hits: 6, known: 7 })
  })
})
