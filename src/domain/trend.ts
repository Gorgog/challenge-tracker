import { addDays, dayKey, daysBetween, parseDay } from './date'
import { METRICS, SICK, scoreOf, type Metric } from './effects'
import type { DayLog } from './types'

/** Оценки по метрикам; null — оценки нет, и это не ноль. */
export type Scores = Record<Metric, number | null>

export type SeriesDay = {
  day: string
  /** Оценки самого дня. */
  raw: Scores
  /** Среднее оценённых дней за неделю, считая сам день. */
  smooth: Scores
}

/** Неделя — окно сглаживания. */
const SMOOTH_DAYS = 7

const empty = (): Scores => ({ day: null, mood: null, wellbeing: null, productivity: null })

function mean(logs: DayLog[]): Scores {
  const out = empty()
  if (!logs.length) return out
  for (const metric of METRICS) out[metric] = logs.reduce((s, l) => s + scoreOf(l, metric), 0) / logs.length
  return out
}

const closedByDay = (logs: DayLog[]) =>
  new Map(logs.filter((l) => l.closedAt !== null).map((l) => [l.day, l]))

/**
 * Ряд оценок за `days` дней по вчера включительно: сегодня ещё идёт. День без оценки — пусто,
 * а сглаженная линия рвётся, только когда за неделю нет ни одной оценки. Сглаживание берёт
 * и дни до начала ряда — иначе первые точки проседали бы.
 */
export function scoreSeries(logs: DayLog[], today: Date, days = 90): SeriesDay[] {
  const byDay = closedByDay(logs)
  return Array.from({ length: days }, (_, i) => {
    const date = addDays(today, i - days)
    const log = byDay.get(dayKey(date))
    const week = Array.from({ length: SMOOTH_DAYS }, (_, k) => byDay.get(dayKey(addDays(date, -k)))).filter(
      (l): l is DayLog => l !== undefined,
    )
    return { day: dayKey(date), raw: log ? mean([log]) : empty(), smooth: mean(week) }
  })
}

export type Coverage = {
  /** Закрытых дней по вчера включительно. */
  rated: number
  /** Дней от первой оценки по вчера. */
  span: number
  /** Среди оценённых — дней с тегом болезни. */
  sick: number
}

/** Сколько дней оценено — по вчера, как и всё остальное: закрытый сегодня день ещё не история. */
export function coverage(logs: DayLog[], today: Date): Coverage {
  const yesterday = dayKey(addDays(today, -1))
  const rated = [...closedByDay(logs).values()].filter((l) => l.day <= yesterday)
  if (!rated.length) return { rated: 0, span: 0, sick: 0 }
  const first = rated.reduce((min, l) => (l.day < min ? l.day : min), rated[0]!.day)
  return {
    rated: rated.length,
    span: daysBetween(parseDay(first), parseDay(yesterday)) + 1,
    sick: rated.filter((l) => l.tags.includes(SICK)).length,
  }
}

export type Averages = {
  current: Scores
  previous: Scores
  currentDays: number
  previousDays: number
}

/** Средние за последние `days` дней (по вчера) и за столько же дней до них. */
export function averages(logs: DayLog[], today: Date, days = 30): Averages {
  const closed = [...closedByDay(logs).values()]
  const between = (from: number, to: number) => {
    const lo = dayKey(addDays(today, -from))
    const hi = dayKey(addDays(today, -to))
    return closed.filter((l) => l.day >= lo && l.day <= hi)
  }
  const current = between(days, 1)
  const previous = between(2 * days, days + 1)
  return { current: mean(current), previous: mean(previous), currentDays: current.length, previousDays: previous.length }
}
