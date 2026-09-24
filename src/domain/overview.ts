import { dayKey, parseDay } from './date'
import { clockText } from './night'
import { dayOutcome } from './streaks'
import {
  BAD_SLEEP,
  HARMFUL_TAGS,
  morningPending,
  periodReport,
  round1,
  shiftOfDay,
  stateOf,
  type Shift,
  type TimelineDay,
} from './timeline'
import type { Challenge, EntryMap, Outcome } from './types'

/*
 * Обзор «Аналитики» (срез 1 новой аналитики, 24.09; макет одобрен Georgy): цель, полоса «обычно»,
 * фраза сверху, ряды событий под графиком и «Что изменилось». Причин не утверждает: только что было
 * и как это соотносится с твоими же прошлыми днями.
 */

export type Goal = 'all' | 'sleep' | 'wellbeing' | 'mood' | 'productivity'
export const GOALS: Goal[] = ['all', 'sleep', 'wellbeing', 'mood', 'productivity']

const mean = (values: (number | null | undefined)[]) => {
  const v = values.filter((x): x is number => x != null)
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null
}

/** Значение цели за день — среднее того, что записано. Нет записи — null, а не ноль. */
export function goalValue(d: TimelineDay, goal: Goal): number | null {
  const m = d.morning
  const e = d.evening
  switch (goal) {
    case 'all':
      return mean([m?.wellbeing, m?.mood, e?.wellbeing, e?.mood])
    case 'sleep':
      return m?.sleep ?? null
    case 'wellbeing':
      return mean([m?.wellbeing, e?.wellbeing])
    case 'mood':
      return mean([m?.mood, e?.mood])
    case 'productivity':
      return e?.productivity ?? null
  }
}

/**
 * День записан по этой цели полностью. Утро обычно ниже вечера, поэтому день из одного утра (сегодня
 * до вечера) или одного вечера — не на той же шкале: на графике он серый, в полосу и фразу не идёт
 * (решение Georgy по ревью 24.09).
 */
export function isComplete(d: TimelineDay, goal: Goal): boolean {
  if (goal === 'sleep') return d.morning !== null
  if (goal === 'productivity') return d.evening !== null
  return d.morning !== null && d.evening !== null
}

/** Значение полного дня; неполный и пустой — null. */
const fullValue = (d: TimelineDay, goal: Goal) => (isComplete(d, goal) ? goalValue(d, goal) : null)

/** Полоса «обычно» считается по стольким дням до окна. */
export const BAND_DAYS = 28
/** Меньше стольких полных дней до окна — полоса «пока», по всей истории. */
export const BAND_MIN = 10
/** Меньше стольких полных дней вообще — полосы нет. */
export const BAND_FLOOR = 5
/** Меньше стольких полных дней в окне — фразы нет. */
export const VERDICT_MIN = 5
/** Половины окна различаются — от полубалла. */
export const HALVES_DIFF = 0.5

export type Band = { kind: 'band'; low: number; high: number; days: number; short: boolean } | { kind: 'none'; need: number }

function percentile(sorted: number[], p: number) {
  const i = (sorted.length - 1) * p
  const lo = Math.floor(i)
  const hi = Math.ceil(i)
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (i - lo)
}

const fullValues = (list: TimelineDay[], goal: Goal) => list.map((d) => fullValue(d, goal)).filter((v): v is number => v !== null)

/**
 * Полоса «обычно» — 25–75 % своих полных дней за `BAND_DAYS` до окна: окно в неё не входит, иначе в
 * плохой месяц «обычное» опускается вместе с данными. Истории мало — по всем полным дням, с пометкой.
 */
export function usualBand(history: TimelineDay[], windowStart: number, goal: Goal): Band {
  let base = fullValues(history.slice(Math.max(0, windowStart - BAND_DAYS), windowStart), goal)
  let short = false
  if (base.length < BAND_MIN) {
    base = fullValues(history, goal)
    short = true
  }
  if (base.length < BAND_FLOOR) return { kind: 'none', need: BAND_FLOOR - base.length }
  const sorted = [...base].sort((a, b) => a - b)
  return { kind: 'band', low: round1(percentile(sorted, 0.25)), high: round1(percentile(sorted, 0.75)), days: base.length, short }
}

/** Где точка против полосы — по тому числу, что видно на экране (до десятых). */
export function pointClass(v: number, band: Band): 'above' | 'below' | 'usual' {
  if (band.kind === 'none') return 'usual'
  const shown = round1(v)
  return shown > band.high ? 'above' : shown < band.low ? 'below' : 'usual'
}

export type Tone = 'worse' | 'better' | 'usual' | 'mixed'
export type Verdict =
  | { kind: 'band'; tone: Tone; below: number; above: number; recorded: number }
  | { kind: 'halves'; tone: Exclude<Tone, 'mixed'>; first: number; second: number }
  | { kind: 'few'; recorded: number; need: number }
  | { kind: 'none'; need: number }

/**
 * Фраза сверху — по полным дням окна. Ниже полосы половина и больше — «хуже обычного», выше — «лучше»,
 * и то и другое — «то лучше, то хуже». Полных дней меньше `VERDICT_MIN` — вывода нет. Полоса «пока»
 * (своей истории до окна мало) — вторая половина окна против первой.
 */
export function verdict(window: TimelineDay[], band: Band, goal: Goal): Verdict {
  if (band.kind === 'none') return band
  const recorded = fullValues(window, goal)
  if (recorded.length < VERDICT_MIN) return { kind: 'few', recorded: recorded.length, need: VERDICT_MIN }
  if (band.short) {
    const half = Math.floor(window.length / 2)
    const first = mean(fullValues(window.slice(0, half), goal))
    const second = mean(fullValues(window.slice(half), goal))
    if (first === null || second === null) return { kind: 'few', recorded: recorded.length, need: VERDICT_MIN }
    const a = round1(first)
    const b = round1(second)
    const diff = round1(b - a)
    return { kind: 'halves', tone: diff <= -HALVES_DIFF ? 'worse' : diff >= HALVES_DIFF ? 'better' : 'usual', first: a, second: b }
  }
  const below = recorded.filter((v) => pointClass(v, band) === 'below').length
  const above = recorded.filter((v) => pointClass(v, band) === 'above').length
  const worse = below * 2 >= recorded.length
  const better = above * 2 >= recorded.length
  const tone = worse && better ? 'mixed' : worse ? 'worse' : better ? 'better' : 'usual'
  return { kind: 'band', tone, below, above, recorded: recorded.length }
}

/** Ночь и день словами для шторки дня `history[index]`. */
export function dayShift(history: TimelineDay[], index: number, today: Date, morningOpen: boolean): Shift {
  const d = history[index]!
  const prev = index > 0 ? history[index - 1]! : null
  return shiftOfDay(stateOf(prev?.evening ?? null), stateOf(d.morning), stateOf(d.evening), morningPending(d, today, morningOpen))
}

/* ---------- поздний отбой ---------- */

/** Поздний отбой — на столько минут позже своего обычного и больше. */
export const LATE_BED = 60

const bedOf = (d: TimelineDay | undefined) => d?.morning?.night?.bed ?? null

/**
 * С какого времени отбой поздний: обычный — медиана отбоя за `BAND_DAYS` до окна (окно не входит, как у
 * полосы), до 5 минут, плюс `LATE_BED`. Ночей до окна меньше `BAND_MIN` — по всем ночам; меньше
 * `BAND_FLOOR` — позднего нет. Минуты от полуночи утра: 30 — это 00:30.
 */
export function lateFrom(history: TimelineDay[], windowStart: number): number | null {
  const beds = (list: TimelineDay[]) => list.map(bedOf).filter((v): v is number => v !== null)
  let base = beds(history.slice(Math.max(0, windowStart - BAND_DAYS), windowStart))
  if (base.length < BAND_MIN) base = beds(history)
  if (base.length < BAND_FLOOR) return null
  const usual = percentile([...base].sort((a, b) => a - b), 0.5)
  return Math.round(usual / 5) * 5 + LATE_BED
}

/* ---------- ряды под графиком ---------- */

export type Row =
  | { kind: 'sleep'; key: string; label: string; cells: (number | null)[] }
  /** 'yes' / 'no' — вечер закрыт; null — вечер не закрыт, тег неизвестен. */
  | { kind: 'tag'; key: string; label: string; cells: ('yes' | 'no' | null)[] }
  | { kind: 'challenge'; key: string; label: string; cells: Outcome[] }
  /** Ночь после вечера дня: 'late' — с `lateFrom` и позже; null — не записана или ещё не прошла. */
  | { kind: 'late'; key: string; label: string; cells: ('late' | 'no' | null)[] }

/**
 * Сон (кроме цели «Сон») и два самых частых тега окна — сразу; остальные теги, поздний отбой и челленджи —
 * в «ещё». Отбой стоит у дня, после вечера которого лёг (как в макете): у последнего дня окна ночь ещё впереди.
 */
export function eventRows(
  window: TimelineDay[],
  goal: Goal,
  challenges: Challenge[],
  entries: Record<string, EntryMap>,
  today: Date,
  late: number | null = null,
): { main: Row[]; more: Row[] } {
  const counts = new Map<string, number>()
  for (const d of window) for (const t of d.tags) counts.set(t, (counts.get(t) ?? 0) + 1)
  const tags = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ru')).map(([t]) => t)
  const tagRow = (tag: string): Row => ({
    kind: 'tag',
    key: `tag:${tag}`,
    label: tag,
    cells: window.map((d) => (d.evening ? (d.tags.includes(tag) ? 'yes' : 'no') : null)),
  })
  const main: Row[] = []
  if (goal !== 'sleep') main.push({ kind: 'sleep', key: 'sleep', label: 'сон', cells: window.map((d) => d.morning?.sleep ?? null) })
  main.push(...tags.slice(0, 2).map(tagRow))
  const nightAfter = window.map((_, i) => bedOf(window[i + 1]))
  const lateRow: Row[] =
    late !== null && nightAfter.some((b) => b !== null)
      ? [{ kind: 'late', key: 'late', label: `лёг ${clockText(late)}+`, cells: nightAfter.map((b) => (b === null ? null : b >= late ? 'late' : 'no')) }]
      : []
  const more: Row[] = [
    ...tags.slice(2).map(tagRow),
    ...lateRow,
    ...challenges.map(
      (c): Row => ({
        kind: 'challenge',
        key: `challenge:${c.id}`,
        label: c.name,
        cells: window.map((d) => dayOutcome(c, entries[c.id] ?? {}, parseDay(d.day), today)),
      }),
    ),
  ]
  return { main, more }
}

/* ---------- что изменилось ---------- */

/** `now` из `of` против `was` из `wasOf`: теги — из закрытых вечеров, плохие ночи — из записанных утр. */
type Share = { now: number; of: number; was: number; wasOf: number }
export type ChangeLine =
  | ({ kind: 'tag'; tag: string; good: boolean | null } & Share)
  | ({ kind: 'badSleep'; good: boolean } & Share)
  | ({ kind: 'skippedMornings'; good: boolean } & Share)
  /** Ночи с отбоем с `from` и позже — от записанных ночей. */
  | ({ kind: 'lateBed'; from: number; good: boolean } & Share)
  | { kind: 'challenge'; challenge: Challenge; hits: number; known: number; wasHits: number; wasKnown: number; good: boolean }

export type Changes = { status: 'ok'; lines: ChangeLine[] } | { status: 'prevEmpty' } | { status: 'curEmpty' }

/** Строк в «Что изменилось» — не больше. */
export const CHANGES_SHOWN = 5

/** Сдвиг доли в днях периода: «+3» — как три лишних дня из `len`. Доля — чтобы «не записывал» не читалось как «не было». */
const shareShift = (now: number, of: number, was: number, wasOf: number, len: number) =>
  of && wasOf ? (now / of - was / wasOf) * len : 0

/**
 * `len` дней по `history[index]` включительно против `len` дней перед ними. Любой из периодов, записанный
 * меньше чем наполовину, — не мерка. Всё сравнивается долей: теги — от закрытых вечеров, плохие ночи —
 * от записанных утр, пропущенные утра — от дней (сегодняшнее, которое ещё можно записать, не в счёт),
 * челлендж — от известных дней и только если шёл полпериода и сейчас, и тогда. Изменение — от 2 дней
 * у 14 и от 4 у 30.
 */
export function changes(
  history: TimelineDay[],
  index: number,
  len: number,
  challenges: Challenge[],
  entries: Record<string, EntryMap>,
  today: Date,
  morningOpen = false,
  late: number | null = null,
): Changes {
  const cur = history.slice(Math.max(0, index - len + 1), index + 1)
  const prevStart = index - 2 * len + 1
  const prev = prevStart >= 0 ? history.slice(prevStart, index - len + 1) : []
  const recorded = (list: TimelineDay[]) => list.filter((d) => d.morning || d.evening).length
  if (prev.length !== len || recorded(prev) * 2 < len) return { status: 'prevEmpty' }
  if (recorded(cur) * 2 < len) return { status: 'curEmpty' }

  const minDiff = len >= 30 ? 4 : 2
  const closed = (list: TimelineDay[]) => list.filter((d) => d.evening)
  const mornings = (list: TimelineDay[]) => list.filter((d) => d.morning)
  const share = (count: (l: TimelineDay[]) => number, base: (l: TimelineDay[]) => TimelineDay[]): Share => ({
    now: count(base(cur)),
    of: base(cur).length,
    was: count(base(prev)),
    wasOf: base(prev).length,
  })
  const shift = (s: Share) => shareShift(s.now, s.of, s.was, s.wasOf, len)

  const names = [...new Set([...cur, ...prev].flatMap((d) => d.tags))].sort((a, b) => a.localeCompare(b, 'ru'))
  const tagLines: ChangeLine[] = names.flatMap((tag) => {
    const s = share((l) => l.filter((d) => d.tags.includes(tag)).length, closed)
    if (Math.abs(shift(s)) < minDiff) return []
    return [{ kind: 'tag' as const, tag, ...s, good: HARMFUL_TAGS.includes(tag) ? shift(s) < 0 : null }]
  })
  const sleep = share((l) => l.filter((d) => d.morning!.sleep <= BAD_SLEEP).length, mornings)
  const sleepLines: ChangeLine[] = Math.abs(shift(sleep)) >= minDiff ? [{ kind: 'badSleep', ...sleep, good: shift(sleep) < 0 }] : []
  const todayKey = dayKey(today)
  const due = (l: TimelineDay[]) => l.filter((d) => !(d.day === todayKey && morningPending(d, today, morningOpen)))
  const skipped = share((l) => l.filter((d) => !d.morning).length, due)
  const skippedLines: ChangeLine[] = Math.abs(shift(skipped)) >= minDiff ? [{ kind: 'skippedMornings', ...skipped, good: shift(skipped) < 0 }] : []
  /*
   * Ночь — после вечера дня, как в ряду под графиком (записана утром следующего): у сегодняшнего дня её ещё нет.
   * Только если в обоих периодах ночи записаны хотя бы наполовину: иначе «не записывал» сошло бы за «не было».
   */
  const nightsAfter = (from: number, to: number) =>
    from < 0 ? [] : history.slice(from + 1, to + 2).map(bedOf).filter((b): b is number => b !== null)
  const nowBeds = nightsAfter(Math.max(0, index - len + 1), index)
  const wasBeds = nightsAfter(prevStart, index - len)
  const lateShare: Share = {
    now: nowBeds.filter((b) => b >= late!).length,
    of: nowBeds.length,
    was: wasBeds.filter((b) => b >= late!).length,
    wasOf: wasBeds.length,
  }
  const lateLines: ChangeLine[] =
    late !== null && lateShare.of * 2 >= len && lateShare.wasOf * 2 >= len && Math.abs(shift(lateShare)) >= minDiff
      ? [{ kind: 'lateBed', from: late, ...lateShare, good: shift(lateShare) < 0 }]
      : []

  const window = history.slice(Math.max(0, index - 29), index + 1)
  const challengeLines: ChangeLine[] = challenges.flatMap((c) => {
    const r = periodReport(history, index, len, window, c, entries[c.id] ?? {}, today, morningOpen).challenge
    if (!r.comparable) return []
    const s = shareShift(r.hits, r.known, r.wasHits, r.wasKnown, len)
    if (Math.abs(s) < minDiff) return []
    return [{ kind: 'challenge' as const, challenge: c, hits: r.hits, known: r.known, wasHits: r.wasHits, wasKnown: r.wasKnown, good: s > 0 }]
  })

  const size = (l: ChangeLine) =>
    Math.abs(l.kind === 'challenge' ? shareShift(l.hits, l.known, l.wasHits, l.wasKnown, len) : shareShift(l.now, l.of, l.was, l.wasOf, len))
  const lines = [...tagLines, ...sleepLines, ...lateLines, ...skippedLines, ...challengeLines]
    .map((l, i) => ({ l, i }))
    .sort((a, b) => size(b.l) - size(a.l) || a.i - b.i)
    .slice(0, CHANGES_SHOWN)
    .map(({ l }) => l)
  return { status: 'ok', lines }
}
