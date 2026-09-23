import { parseDay } from './date'
import { dayOutcome } from './streaks'
import { BAD_SLEEP, HARMFUL_TAGS, periodReport, round1, type TimelineDay } from './timeline'
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

/** Значение цели за день. Нет записи — null, а не ноль. */
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

/** Полоса «обычно» считается по стольким дням до окна. */
export const BAND_DAYS = 28
/** Меньше стольких записанных дней до окна — полоса «пока», по всей истории. */
export const BAND_MIN = 10
/** Меньше стольких записанных дней вообще — полосы нет. */
export const BAND_FLOOR = 5
/** Половины окна различаются — от полубалла. */
export const HALVES_DIFF = 0.5

export type Band = { kind: 'band'; low: number; high: number; days: number; short: boolean } | { kind: 'none'; need: number }

function percentile(sorted: number[], p: number) {
  const i = (sorted.length - 1) * p
  const lo = Math.floor(i)
  const hi = Math.ceil(i)
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (i - lo)
}

/**
 * Полоса «обычно» — 25–75 % своих дней за `BAND_DAYS` до окна: окно в неё не входит, иначе в плохой
 * месяц «обычное» опускается вместе с данными. Истории мало — по всем записанным дням, с пометкой.
 */
export function usualBand(history: TimelineDay[], windowStart: number, goal: Goal): Band {
  const values = (list: TimelineDay[]) => list.map((d) => goalValue(d, goal)).filter((v): v is number => v !== null)
  let base = values(history.slice(Math.max(0, windowStart - BAND_DAYS), windowStart))
  let short = false
  if (base.length < BAND_MIN) {
    base = values(history)
    short = true
  }
  if (base.length < BAND_FLOOR) return { kind: 'none', need: BAND_FLOOR - base.length }
  const sorted = [...base].sort((a, b) => a - b)
  return { kind: 'band', low: round1(percentile(sorted, 0.25)), high: round1(percentile(sorted, 0.75)), days: base.length, short }
}

export type Tone = 'worse' | 'better' | 'usual'
export type Verdict =
  | { kind: 'band'; tone: Tone; below: number; above: number; recorded: number }
  | { kind: 'halves'; tone: Tone; first: number; second: number }
  | { kind: 'none'; need: number }

/**
 * Фраза сверху. Ниже полосы половина дней с записью и больше — «хуже обычного», выше — «лучше».
 * Полоса «пока» (своей истории до окна мало) — вторая половина окна против первой.
 */
export function verdict(window: TimelineDay[], band: Band, goal: Goal): Verdict {
  if (band.kind === 'none') return band
  const values = window.map((d) => goalValue(d, goal))
  if (band.short) {
    const half = Math.floor(window.length / 2)
    const first = mean(values.slice(0, half))
    const second = mean(values.slice(half))
    if (first === null || second === null) return { kind: 'none', need: 0 }
    const a = round1(first)
    const b = round1(second)
    const diff = round1(b - a)
    return { kind: 'halves', tone: diff <= -HALVES_DIFF ? 'worse' : diff >= HALVES_DIFF ? 'better' : 'usual', first: a, second: b }
  }
  const recorded = values.filter((v): v is number => v !== null)
  const below = recorded.filter((v) => v < band.low).length
  const above = recorded.filter((v) => v > band.high).length
  const worse = recorded.length > 0 && below * 2 >= recorded.length
  const better = recorded.length > 0 && above * 2 >= recorded.length
  const tone = worse && !better ? 'worse' : better && !worse ? 'better' : 'usual'
  return { kind: 'band', tone, below, above, recorded: recorded.length }
}

/* ---------- ряды под графиком ---------- */

export type Row =
  | { kind: 'sleep'; key: string; label: string; cells: (number | null)[] }
  /** 'yes' / 'no' — вечер закрыт; null — вечер не закрыт, тег неизвестен. */
  | { kind: 'tag'; key: string; label: string; cells: ('yes' | 'no' | null)[] }
  | { kind: 'challenge'; key: string; label: string; cells: Outcome[] }

/** Сон (кроме цели «Сон») и два самых частых тега окна — сразу; остальные теги и челленджи — в «ещё». */
export function eventRows(
  window: TimelineDay[],
  goal: Goal,
  challenges: Challenge[],
  entries: Record<string, EntryMap>,
  today: Date,
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
  const more: Row[] = [
    ...tags.slice(2).map(tagRow),
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

export type ChangeLine =
  | { kind: 'tag'; tag: string; now: number; was: number; good: boolean | null }
  | { kind: 'badSleep'; now: number; was: number; good: boolean }
  | { kind: 'challenge'; challenge: Challenge; hits: number; known: number; wasHits: number; wasKnown: number; good: boolean }

export type Changes = { hasPrev: false } | { hasPrev: true; lines: ChangeLine[] }

/** Строк в «Что изменилось» — не больше. */
export const CHANGES_SHOWN = 5

/**
 * `len` дней по `history[index]` включительно против `len` дней перед ними. Прошлый период, записанный
 * меньше чем наполовину, — не мерка. Изменение — от 2 дней у 14 и от 4 у 30 (как у `periodReport`);
 * челлендж — только если шёл хотя бы полпериода и сейчас, и тогда (`comparable`).
 */
export function changes(
  history: TimelineDay[],
  index: number,
  len: number,
  challenges: Challenge[],
  entries: Record<string, EntryMap>,
  today: Date,
  morningOpen = false,
): Changes {
  const cur = history.slice(Math.max(0, index - len + 1), index + 1)
  const prevStart = index - 2 * len + 1
  const prev = prevStart >= 0 ? history.slice(prevStart, index - len + 1) : []
  const recorded = (list: TimelineDay[]) => list.filter((d) => d.morning || d.evening).length
  if (prev.length !== len || recorded(prev) * 2 < len) return { hasPrev: false }

  const minDiff = len >= 30 ? 4 : 2
  const tagDays = (list: TimelineDay[], t: string) => list.filter((d) => d.tags.includes(t)).length
  const badNights = (list: TimelineDay[]) => list.filter((d) => d.morning && d.morning.sleep <= BAD_SLEEP).length

  const names = [...new Set([...cur, ...prev].flatMap((d) => d.tags))].sort((a, b) => a.localeCompare(b, 'ru'))
  const tagLines: ChangeLine[] = names.flatMap((tag) => {
    const now = tagDays(cur, tag)
    const was = tagDays(prev, tag)
    if (Math.abs(now - was) < minDiff) return []
    return [{ kind: 'tag' as const, tag, now, was, good: HARMFUL_TAGS.includes(tag) ? now < was : null }]
  })
  const sleepNow = badNights(cur)
  const sleepWas = badNights(prev)
  const sleepLines: ChangeLine[] =
    Math.abs(sleepNow - sleepWas) >= minDiff ? [{ kind: 'badSleep', now: sleepNow, was: sleepWas, good: sleepNow < sleepWas }] : []

  const window = history.slice(Math.max(0, index - 29), index + 1)
  const challengeLines: ChangeLine[] = challenges.flatMap((c) => {
    const r = periodReport(history, index, len, window, c, entries[c.id] ?? {}, today, morningOpen).challenge
    const misses = r.known - r.hits
    const wasMisses = r.wasKnown - r.wasHits
    if (!r.comparable || Math.abs(misses - wasMisses) < minDiff) return []
    return [{ kind: 'challenge' as const, challenge: c, hits: r.hits, known: r.known, wasHits: r.wasHits, wasKnown: r.wasKnown, good: misses < wasMisses }]
  })

  const size = (l: ChangeLine) =>
    l.kind === 'challenge' ? Math.abs(l.known - l.hits - (l.wasKnown - l.wasHits)) : Math.abs(l.now - l.was)
  const lines = [...tagLines, ...sleepLines, ...challengeLines]
    .map((l, i) => ({ l, i }))
    .sort((a, b) => size(b.l) - size(a.l) || a.i - b.i)
    .slice(0, CHANGES_SHOWN)
    .map(({ l }) => l)
  return { hasPrev: true, lines }
}
