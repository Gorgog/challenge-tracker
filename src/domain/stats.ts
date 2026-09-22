import { addDays, dayKey, daysBetween, isoDow, parseDay } from './date'
import { activeDays, dayOutcome, lastDay } from './streaks'
import type { Challenge, DayLog, EntryMap } from './types'

export type Forecast = {
  /** Доля выполненных дней среди прошедших. */
  pace: number
  /** Сколько дней будет взято к финишу, если темп сохранится. */
  projected: number
  daysLeft: number
  onTrack: boolean
}

/** Прогноз имеет смысл только для челленджа с конечной длиной. */
export function forecast(c: Challenge, entries: EntryMap, today: Date): Forecast | null {
  const end = lastDay(c)
  if (!c.lengthDays || !end) return null

  const passed = activeDays(c, today)
  const done = passed.filter((k) => dayOutcome(c, entries, parseDay(k), today) === 'hit').length
  const pace = passed.length ? done / passed.length : 0
  const daysLeft = Math.max(0, daysBetween(today, end) + 1)
  const projected = Math.round(done + pace * daysLeft)

  return { pace, projected, daysLeft, onTrack: projected >= c.lengthDays * 0.9 }
}

export type WeekDayStat = { rate: number; hits: number; total: number }

/** Доля выполнения по дням недели: 0 — понедельник. Дни без данных дают null. */
export function weekProfile(
  c: Challenge,
  entries: EntryMap,
  today: Date,
): (WeekDayStat | null)[] {
  const buckets = Array.from({ length: 7 }, () => ({ hits: 0, total: 0 }))
  for (const key of activeDays(c, today)) {
    const day = parseDay(key)
    const outcome = dayOutcome(c, entries, day, today)
    if (outcome === 'outside') continue
    const bucket = buckets[isoDow(day)]
    bucket.total++
    if (outcome === 'hit') bucket.hits++
  }
  return buckets.map((b) => (b.total ? { rate: b.hits / b.total, hits: b.hits, total: b.total } : null))
}

/** Дни без оценки за последние `back` дней, самый ранний первым. */
export function unratedDays(logs: DayLog[], today: Date, back = 14): string[] {
  const closed = new Set(logs.filter((l) => l.closedAt).map((l) => l.day))
  const out: string[] = []
  for (let i = back; i >= 1; i--) {
    const key = dayKey(addDays(today, -i))
    if (!closed.has(key)) out.push(key)
  }
  return out
}
