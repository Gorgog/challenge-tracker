import { addDays, daysBetween, isoDow, parseDay } from './date'
import { activeDays, dayOutcome, lastDay } from './streaks'
import type { Challenge, DayLog, EntryMap, ScoreField } from './types'

const average = (values: number[]) =>
  values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : 0

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

export type ScoreSplit = {
  withHit: number
  withoutHit: number
  delta: number
  daysWithHit: number
  daysWithoutHit: number
}

/** Минимальный размер группы, при котором вывод вообще показывается. */
export const MIN_GROUP = 10

/**
 * Сравнивает оценку дня в дни с выполненным челленджем и без него.
 * Возвращает null, если хоть одна группа меньше MIN_GROUP: на таких выборках
 * разница — шум, и показывать её нечестно.
 */
export function scoreSplit(
  c: Challenge,
  entries: EntryMap,
  logs: DayLog[],
  field: ScoreField,
  today: Date,
): ScoreSplit | null {
  const byDay = new Map(logs.map((l) => [l.day, l]))
  const withHit: number[] = []
  const withoutHit: number[] = []

  for (const key of activeDays(c, today)) {
    const entry = byDay.get(key)
    if (!entry) continue
    const outcome = dayOutcome(c, entries, parseDay(key), today)
    if (outcome === 'hit') withHit.push(entry[field])
    else if (outcome === 'miss') withoutHit.push(entry[field])
  }

  if (withHit.length < MIN_GROUP || withoutHit.length < MIN_GROUP) return null

  const a = average(withHit)
  const b = average(withoutHit)
  return {
    withHit: a,
    withoutHit: b,
    delta: a - b,
    daysWithHit: withHit.length,
    daysWithoutHit: withoutHit.length,
  }
}

export type TagStat = {
  tag: string
  days: number
  mood: number
  wellbeing: number
  productivity: number
  baseline: { mood: number; wellbeing: number; productivity: number }
}

/** Минимум дней с тегом, чтобы показать по нему средние. */
export const MIN_TAG_DAYS = 4

export function tagStats(logs: DayLog[]): TagStat[] {
  if (!logs.length) return []
  const baseline = {
    mood: average(logs.map((l) => l.mood)),
    wellbeing: average(logs.map((l) => l.wellbeing)),
    productivity: average(logs.map((l) => l.productivity)),
  }

  const tags = new Set(logs.flatMap((l) => l.tags))
  return [...tags]
    .map((tag) => {
      const picked = logs.filter((l) => l.tags.includes(tag))
      return {
        tag,
        days: picked.length,
        mood: average(picked.map((l) => l.mood)),
        wellbeing: average(picked.map((l) => l.wellbeing)),
        productivity: average(picked.map((l) => l.productivity)),
        baseline,
      }
    })
    .filter((s) => s.days >= MIN_TAG_DAYS)
    .sort((a, b) => b.days - a.days)
}

/** Самое сильное влияние на каждый челлендж — по одному выводу, иначе список про один и тот же. */
export function topScoreEffects(
  challenges: Challenge[],
  entriesById: Record<string, EntryMap>,
  logs: DayLog[],
  today: Date,
  limit = 3,
): { challenge: Challenge; field: ScoreField; split: ScoreSplit }[] {
  const fields: ScoreField[] = ['mood', 'wellbeing', 'productivity']
  const best = new Map<string, { challenge: Challenge; field: ScoreField; split: ScoreSplit }>()

  for (const c of challenges) {
    for (const field of fields) {
      const split = scoreSplit(c, entriesById[c.id] ?? {}, logs, field, today)
      if (!split || Math.abs(split.delta) < 0.4) continue
      const prev = best.get(c.id)
      if (!prev || Math.abs(split.delta) > Math.abs(prev.split.delta)) {
        best.set(c.id, { challenge: c, field, split })
      }
    }
  }

  return [...best.values()]
    .sort((a, b) => Math.abs(b.split.delta) - Math.abs(a.split.delta))
    .slice(0, limit)
}

/** Дни без оценки за последние `back` дней, самый ранний первым. */
export function unratedDays(logs: DayLog[], today: Date, back = 14): string[] {
  const closed = new Set(logs.filter((l) => l.closedAt).map((l) => l.day))
  const out: string[] = []
  for (let i = back; i >= 1; i--) {
    const key = addDays(today, -i)
    const k = `${key.getFullYear()}-${String(key.getMonth() + 1).padStart(2, '0')}-${String(key.getDate()).padStart(2, '0')}`
    if (!closed.has(k)) out.push(k)
  }
  return out
}
