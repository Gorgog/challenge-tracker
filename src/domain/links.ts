import { isoDow, parseDay } from './date'
import type { Goal } from './overview'
import { DAY_TAGS } from './tags'
import { BAD_SLEEP, HARMFUL_TAGS, round1, stateOf, type TimelineDay } from './timeline'

/*
 * Связи v1 (срез 2 новой аналитики, 24.09; свод `research/2026-09-24-analytics-clean/`, §3.4–3.5, §6.1).
 * Пары заданы заранее, а не перебором: тег вечером → утро (сон, самочувствие, настроение) или
 * продуктивность следующего дня; плохая ночь → вечер того же дня. Отказы в связях не участвуют, пока
 * у них нет явного «Да, без»: день без отметки у них — «выдержал», а это может быть и «не записал».
 * Сжатая разница решает, показывать ли связь; на экране — сырые средние «с / без» и счёт случаев.
 */

/** Окно связей: в 14–30 днях 5 + 5 почти не набирается. */
export const LINK_DAYS = 56
/** Меньше стольких дней «с» или «без» — «пока рано». */
export const LINK_MIN = 5
/** От стольких дней «с» — ступень ●●○. */
export const LINK_STRONG = 8
/** Записанных дней в окне меньше — «пока рано» для всех пар. */
export const LINK_RECORDED = 14
/** Закрытых вечеров меньше этой доли (от первой записи) — «пока рано». */
export const LINK_CLOSED = 0.7
/** Разница меньше балла не показывается как связь. */
export const LINK_DIFF = 1
/** Сжатие к нулю: τ — ожидаемый размер настоящих разниц, в баллах. */
export const TAU = 1.5
/** Совпадение с другим тегом или выходными — от 2/3 дней с фактором. */
const TOGETHER = 2 / 3
/** Половины окна и разница «без совпавшего» — от стольких дней в каждой группе. */
const PART_MIN = 3

/** «Не в моих силах»: такие теги объясняют плохие дни, но не становятся советом («болей меньше»). */
export const CONTEXT_TAGS: readonly string[] = ['болел', 'дорога', 'выходной']

export type Factor = { kind: 'tag'; tag: string } | { kind: 'badSleep' }
/** early — «пока рано»; none — проверено, связи не видно; maybe — ●○○; notable — ●●○. */
export type Level = 'early' | 'none' | 'maybe' | 'notable'
export type Otherwise =
  | { kind: 'tag'; tag: string; together: number; of: number; diff: number | null }
  | { kind: 'weekend'; together: number; of: number; diff: number }

export type Link = {
  factor: Factor
  /** Дни результата «с»: утро (или вечер) после фактора — их подсвечивает график. */
  withDays: string[]
  withN: number
  withoutN: number
  withMean: number | null
  withoutMean: number | null
  level: Level
  /** В какую сторону «с» от «без»; у «пока рано» — null. */
  direction: 'worse' | 'better' | null
  /** Сколько дней «с» по ту же сторону от среднего «без», что и разница. */
  sameSide: number
  shrunk: number | null
  otherwise: Otherwise | null
  bucket: 'less' | 'more' | null
}

export type Gate = { ok: boolean; recorded: number; closedShare: number }
export type Links = {
  gate: Gate
  pairs: Link[]
  /** До одной на ведро, сильнейшая первой. */
  cards: Link[]
  /** Сколько пар прошли 5 + 5 — «смотрели N связей». */
  checked: number
  /** Сколько из них ●○○ и выше — «заметных M». */
  found: number
}

/** Простое сжатие к нулю (методика §3.5, вариант Б). */
export const shrink = (raw: number, se: number) => (raw * TAU * TAU) / (TAU * TAU + se * se)

const mean = (v: number[]) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : null)
const variance = (v: number[]) => {
  if (v.length < 2) return 0
  const m = mean(v)!
  return v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length - 1)
}

/** Результат, привязанный к дню: значение, день результата и теги вечера, после которого он измерен. */
type Point = { value: number; day: string; weekend: boolean; before: string[] }

const morningValue = (d: TimelineDay, goal: Goal): number | null => {
  const m = d.morning
  if (!m) return null
  if (goal === 'sleep') return m.sleep
  if (goal === 'wellbeing') return m.wellbeing
  if (goal === 'mood') return m.mood
  return stateOf(m)
}

const eveningValue = (d: TimelineDay, goal: Goal): number | null => {
  const e = d.evening
  if (!e) return null
  if (goal === 'productivity') return e.productivity
  if (goal === 'wellbeing') return e.wellbeing
  if (goal === 'mood') return e.mood
  return stateOf(e)
}

const isWeekend = (day: string) => isoDow(parseDay(day)) >= 5

/**
 * Тег вечера D → результат дня D+1: утро по цели, у «Продуктивности» — вечер. Вечер D не закрыт —
 * тегов не знаем, пара не идёт никуда.
 */
function tagPoints(window: TimelineDay[], goal: Goal, tag: string) {
  const withTag: Point[] = []
  const without: Point[] = []
  for (let i = 1; i < window.length; i++) {
    const prev = window[i - 1]!
    const d = window[i]!
    if (!prev.evening) continue
    const value = goal === 'productivity' ? eveningValue(d, goal) : morningValue(d, goal)
    if (value === null) continue
    const p = { value, day: d.day, weekend: isWeekend(d.day), before: prev.tags }
    ;(prev.tags.includes(tag) ? withTag : without).push(p)
  }
  return { withTag, without }
}

/** Плохая ночь (сон 0–4) → вечер того же дня; «до» — теги вечера накануне. */
function badSleepPoints(window: TimelineDay[], goal: Goal) {
  const withTag: Point[] = []
  const without: Point[] = []
  for (let i = 0; i < window.length; i++) {
    const d = window[i]!
    if (!d.morning) continue
    const value = eveningValue(d, goal)
    if (value === null) continue
    const p = { value, day: d.day, weekend: isWeekend(d.day), before: i > 0 ? window[i - 1]!.tags : [] }
    ;(d.morning.sleep <= BAD_SLEEP ? withTag : without).push(p)
  }
  return { withTag, without }
}

const values = (p: Point[]) => p.map((x) => x.value)

/**
 * Разница с поправкой на выходные: внутри «выходных» и «будних» дней результата отдельно, взвешенная
 * числом дней «с». Пятничный и субботний вечер — это утро выходного. Слой без «без» не в счёт; не осталось
 * ни одного — поправить нельзя (null).
 */
function weekendAdjusted(withTag: Point[], without: Point[]): number | null {
  let sum = 0
  let weight = 0
  for (const weekend of [true, false]) {
    const w = values(withTag.filter((p) => p.weekend === weekend))
    const o = values(without.filter((p) => p.weekend === weekend))
    if (!w.length || o.length < 2) continue
    sum += (mean(w)! - mean(o)!) * w.length
    weight += w.length
  }
  return weight ? sum / weight : null
}

/** Другой тег в 2/3 вечеров с фактором или выходные в 2/3 дней результата — «а может быть иначе». */
function otherwiseOf(factor: Factor, withTag: Point[], without: Point[]): Otherwise | null {
  const of = withTag.length
  const counts = new Map<string, number>()
  for (const p of withTag)
    for (const t of new Set(p.before)) if (factor.kind !== 'tag' || t !== factor.tag) counts.set(t, (counts.get(t) ?? 0) + 1)
  const top = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ru'))[0]
  if (top && top[1] >= of * TOGETHER) {
    const [tag, together] = top
    const w = values(withTag.filter((p) => !p.before.includes(tag)))
    const o = values(without.filter((p) => !p.before.includes(tag)))
    const diff = w.length >= PART_MIN && o.length >= PART_MIN ? round1(mean(w)! - mean(o)!) : null
    return { kind: 'tag', tag, together, of, diff }
  }
  const together = withTag.filter((p) => p.weekend).length
  const adjusted = weekendAdjusted(withTag, without)
  if (together >= of * TOGETHER && adjusted !== null) return { kind: 'weekend', together, of, diff: round1(adjusted) }
  return null
}

function linkOf(factor: Factor, withTag: Point[], without: Point[], gateOk: boolean, half: string | null): Link {
  const w = values(withTag)
  const o = values(without)
  const base = {
    factor,
    withDays: withTag.map((p) => p.day),
    withN: w.length,
    withoutN: o.length,
    withMean: mean(w),
    withoutMean: mean(o),
  }
  if (!gateOk || w.length < LINK_MIN || o.length < LINK_MIN)
    return { ...base, level: 'early', direction: null, sameSide: 0, shrunk: null, otherwise: null, bucket: null }

  const raw = base.withMean! - base.withoutMean!
  const direction = raw < 0 ? 'worse' : 'better'
  const sameSide = w.filter((v) => (raw < 0 ? v < base.withoutMean! : v > base.withoutMean!)).length
  const se = Math.sqrt(variance(w) / w.length + variance(o) / o.length)
  const shrunk = shrink(raw, se)
  const sigma = Math.sqrt(variance([...w, ...o]))
  const threshold = Math.max(LINK_DIFF, sigma / 2)
  const adjusted = weekendAdjusted(withTag, without)
  const holds =
    Math.abs(shrunk) >= threshold &&
    sameSide >= w.length * TOGETHER &&
    adjusted !== null &&
    Math.sign(adjusted) === Math.sign(raw) &&
    Math.abs(shrink(adjusted, se)) >= threshold

  let level: Level = holds ? 'maybe' : 'none'
  if (holds && w.length >= LINK_STRONG && half !== null) {
    const halves = [(p: Point) => p.day < half, (p: Point) => p.day >= half].map((inHalf) => {
      const hw = values(withTag.filter(inHalf))
      const ho = values(without.filter(inHalf))
      return hw.length >= PART_MIN && ho.length >= PART_MIN && Math.sign(mean(hw)! - mean(ho)!) === Math.sign(raw)
    })
    if (halves.every(Boolean)) level = 'notable'
  }

  const inPower = factor.kind === 'tag' && !CONTEXT_TAGS.includes(factor.tag)
  const harmful = factor.kind === 'tag' && HARMFUL_TAGS.includes(factor.tag)
  const bucket = level === 'none' || !inPower ? null : direction === 'worse' ? 'less' : harmful ? null : 'more'
  return {
    ...base,
    level,
    direction,
    sameSide,
    shrunk,
    otherwise: level === 'none' ? null : otherwiseOf(factor, withTag, without),
    bucket,
  }
}

/** Записано и закрыто достаточно, чтобы вообще что-то сравнивать. Доля — от первого записанного дня. */
function gateOf(window: TimelineDay[]): Gate {
  const first = window.findIndex((d) => d.morning || d.evening)
  if (first < 0) return { ok: false, recorded: 0, closedShare: 0 }
  const span = window.slice(first)
  const recorded = span.filter((d) => d.morning || d.evening).length
  const closedShare = span.filter((d) => d.evening).length / span.length
  return { ok: recorded >= LINK_RECORDED && closedShare >= LINK_CLOSED, recorded, closedShare }
}

const score = (l: Link) => Math.abs(l.shrunk ?? 0) * (l.level === 'notable' ? 2 : 1)

/** Связи по последним `LINK_DAYS` дням истории для цели. */
export function links(history: TimelineDay[], goal: Goal): Links {
  const window = history.slice(-LINK_DAYS)
  const gate = gateOf(window)
  const half = window.length ? window[Math.floor(window.length / 2)]!.day : null
  const pairs: Link[] = DAY_TAGS.map((tag) => {
    const { withTag, without } = tagPoints(window, goal, tag)
    return linkOf({ kind: 'tag', tag }, withTag, without, gate.ok, half)
  })
  if (goal !== 'sleep') {
    const { withTag, without } = badSleepPoints(window, goal)
    pairs.push(linkOf({ kind: 'badSleep' }, withTag, without, gate.ok, half))
  }
  const shown = pairs.filter((l) => l.level === 'maybe' || l.level === 'notable')
  const cards = (['less', 'more'] as const)
    .map((b) => shown.filter((l) => l.bucket === b).sort((a, c) => score(c) - score(a))[0])
    .filter((l): l is Link => l !== undefined)
    .sort((a, c) => score(c) - score(a))
  return { gate, pairs, cards, checked: pairs.filter((l) => l.level !== 'early').length, found: shown.length }
}
