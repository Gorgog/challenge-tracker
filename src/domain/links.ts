import { isoDow, parseDay } from './date'
import { dayOutcome } from './streaks'
import { goalValue, isComplete, pointClass, type Band, type Goal } from './overview'
import { DAY_TAGS } from './tags'
import { BAD_SLEEP, HARMFUL_TAGS, round1, stateOf, type TimelineDay } from './timeline'
import type { Challenge, EntryMap, Night } from './types'

/*
 * Связи v1 (срез 2 новой аналитики, 24.09; свод `research/2026-09-24-analytics-clean/`, §3.4–3.5, §6.1).
 * Пары заданы заранее, а не перебором: тег вечером → утро (сон, самочувствие, настроение) или
 * продуктивность следующего дня; плохая ночь → вечер того же дня. Отказы в связях не участвуют, пока
 * у них нет явного «Да, без»: день без отметки у них — «выдержал», а это может быть и «не записал».
 * Сжатая разница решает, показывать ли связь; на экране — сырые средние «с / без» и счёт случаев.
 * Последний день окна — сегодня: пока он не записан, он ещё идёт, а не пропущен.
 */

/** Окно связей: в 14–30 днях 5 + 5 почти не набирается. */
export const LINK_DAYS = 56
/** Меньше стольких дней «с» или «без» — «пока рано». */
export const LINK_MIN = 5
/** От стольких дней «с» — ступень ●●○. */
export const LINK_STRONG = 8
/** Записанных дней в окне меньше — «пока рано» для всех пар. */
export const LINK_RECORDED = 14
/** Закрытых вечеров меньше этой доли (от первой записи, без сегодняшнего незакрытого) — «пока рано». */
export const LINK_CLOSED = 0.7
/** Разница меньше балла не показывается как связь. */
export const LINK_DIFF = 1
/** Сжатие к нулю: τ — ожидаемый размер настоящих разниц, в баллах. */
export const TAU = 1.5
/** Совпадение с другим тегом или выходными — от 2/3 дней с фактором. */
const TOGETHER = 2 / 3
/** Половины окна, разница «без совпавшего» и строка цепочки — от стольких дней в группе. */
const PART_MIN = 3

/** «Не в моих силах»: такие теги объясняют плохие дни, но не становятся советом («болей меньше»). */
export const CONTEXT_TAGS: readonly string[] = ['болел', 'дорога', 'выходной']
/** Совет «Больше» по ним звучал бы как «бери дедлайны»: только «Меньше» (решение Georgy 24.09). */
export const NOT_MORE: readonly string[] = ['дедлайн', 'встречи']

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
  /** Плохая ночь → вечер: видна строкой без ведра, совета «меньше / больше» у неё нет (действие — отбой). */
  night: Link | null
  /** Сколько пар прошли 5 + 5 — «смотрели N связей». */
  checked: number
  /** Сколько связей видно на экране (карточки и плохая ночь) — «заметных M». */
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

/** Результат дня после тега вечером: утро по цели, у «Продуктивности» — вечер. */
const nextValue = (d: TimelineDay, goal: Goal) => (goal === 'productivity' ? eveningValue(d, goal) : morningValue(d, goal))

const isWeekend = (day: string) => isoDow(parseDay(day)) >= 5

/** Вечер D не закрыт — тегов не знаем, пара не идёт никуда. */
function tagPoints(window: TimelineDay[], goal: Goal, tag: string) {
  const withTag: Point[] = []
  const without: Point[] = []
  for (let i = 1; i < window.length; i++) {
    const prev = window[i - 1]!
    const d = window[i]!
    if (!prev.evening) continue
    const value = nextValue(d, goal)
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
  const onlyLess = factor.kind === 'tag' && (HARMFUL_TAGS.includes(factor.tag) || NOT_MORE.includes(factor.tag))
  const bucket = level === 'none' || !inPower ? null : direction === 'worse' ? 'less' : onlyLess ? null : 'more'
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

/**
 * Записано и закрыто достаточно, чтобы вообще что-то сравнивать. Доля — от первого записанного дня; сегодняшний
 * незакрытый вечер — ещё не пропуск, в долю не идёт (иначе связи пропадали бы утром и возвращались вечером).
 */
function gateOf(window: TimelineDay[]): Gate {
  const first = window.findIndex((d) => d.morning || d.evening)
  if (first < 0) return { ok: false, recorded: 0, closedShare: 0 }
  const span = window.slice(first)
  const recorded = span.filter((d) => d.morning || d.evening).length
  const past = span[span.length - 1]!.evening ? span : span.slice(0, -1)
  const closedShare = past.length ? past.filter((d) => d.evening).length / past.length : 0
  return { ok: recorded >= LINK_RECORDED && closedShare >= LINK_CLOSED, recorded, closedShare }
}

const score = (l: Link) => Math.abs(l.shrunk ?? 0) * (l.level === 'notable' ? 2 : 1)
const found = (l: Link) => l.level === 'maybe' || l.level === 'notable'

/* ---------- случаи и «объясняет плохие дни» ---------- */

/** Случай — утро (день) после редкого тега; ниже обычного — от балла. Показываем не больше двух. */
export const CASE_GAP = 1
const CASES_SHOWN = 2

/** `missing` — сколько раз день после тега не записан (сегодняшний, который ещё идёт, не в счёт). */
export type Case = { tag: string; values: number[]; days: string[]; usual: number; missing: number }

const median = (v: number[]) => {
  const s = [...v].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2
}

/**
 * «Случаи · обобщать пока рано»: тег в моих силах был 1–4 вечера (закрытых), и каждый записанный результат
 * после него ниже обычного (медиана после других закрытых вечеров) на `CASE_GAP` и больше. Не связь — перечень,
 * без среднего. Когда записей мало для связей (ворота закрыты), и случаев нет: сравнивать не с чем.
 */
export function cases(history: TimelineDay[], goal: Goal): Case[] {
  const window = history.slice(-LINK_DAYS)
  if (!gateOf(window).ok) return []
  const last = window.length - 1
  return DAY_TAGS.filter((t) => !CONTEXT_TAGS.includes(t))
    .flatMap((tag) => {
      const { withTag, without } = tagPoints(window, goal, tag)
      let episodes = 0
      for (let i = 1; i < window.length; i++) {
        if (!window[i - 1]!.evening || !window[i - 1]!.tags.includes(tag)) continue
        if (i === last && nextValue(window[i]!, goal) === null) continue
        episodes++
      }
      if (!withTag.length || episodes >= LINK_MIN || without.length < LINK_MIN) return []
      const usual = median(values(without))
      if (!withTag.every((p) => p.value <= usual - CASE_GAP)) return []
      return [{ tag, values: values(withTag), days: withTag.map((p) => p.day), usual, missing: episodes - withTag.length }]
    })
    .sort((a, b) => mean(a.values)! - a.usual - (mean(b.values)! - b.usual))
    .slice(0, CASES_SHOWN)
}

/** «Объясняет» — от стольких плохих дней с тегом и в стольких разах чаще, чем в остальные полные. */
export const EXPLAIN_MIN = 2
export const EXPLAIN_RATIO = 1.5

export type Explain = { tag: string; count: number; bad: number; days: string[] }

/**
 * «Объясняет плохие дни · это не совет»: плохой день — полный день окна графика ниже полосы «обычно».
 * Тег «не в моих силах» в вечер этого дня или накануне — в `EXPLAIN_MIN` плохих днях и больше и среди них
 * в `EXPLAIN_RATIO` раза чаще, чем среди остальных полных дней окна.
 */
export function explains(history: TimelineDay[], windowStart: number, band: Band, goal: Goal): Explain[] {
  if (band.kind === 'none') return []
  const full = history.flatMap((d, i) => {
    if (i < windowStart || !isComplete(d, goal)) return []
    const v = goalValue(d, goal)
    return v === null ? [] : [{ i, bad: pointClass(v, band) === 'below' }]
  })
  const bad = full.filter((d) => d.bad)
  const rest = full.filter((d) => !d.bad)
  const has = (i: number, tag: string) => history[i]!.tags.includes(tag) || (i > 0 && history[i - 1]!.tags.includes(tag))
  return CONTEXT_TAGS.flatMap((tag) => {
    const hit = bad.filter((d) => has(d.i, tag))
    const restHit = rest.filter((d) => has(d.i, tag)).length
    if (hit.length < EXPLAIN_MIN) return []
    if (rest.length && hit.length / bad.length < (EXPLAIN_RATIO * restHit) / rest.length) return []
    return [{ tag, count: hit.length, bad: bad.length, days: hit.map((d) => history[d.i]!.day) }]
  }).sort((a, b) => b.count - a.count)
}

/* ---------- что обычно шло следом ---------- */

/** Шаг цепочки «как обычно» — меньше балла; у привычки — доля ближе четверти. */
export const CHAIN_SAME = 1
export const CHAIN_SAME_SHARE = 0.25
/** Шаг «как обычно» у времени ночи — средние ближе стольких минут; «позже в k» — ночи на столько позже и больше. */
export const CHAIN_SAME_MIN = 30

/** few — дней меньше трёх: не отличие и не «как обычно», а «мало дней». */
export type ChainSide = 'worse' | 'better' | 'same' | 'few'
export type ChainRow =
  | { kind: 'scale'; part: 'morning' | 'evening'; label: string; n: number; mean: number; usual: number; side: ChainSide; count: number }
  | { kind: 'habit'; part: 'day'; label: string; hits: number; known: number; usualShare: number; side: ChainSide }
  /** Время ночи — минуты от полуночи утра, средние до 5 минут: как на экране. */
  | { kind: 'time'; part: 'night' | 'morning'; label: string; n: number; mean: number; usual: number; side: 'later' | 'earlier' | 'same' | 'few'; count: number }

export type Chain = {
  tag: string
  /** Дней после вечера с тегом (сегодняшний, который ещё идёт, не в счёт). */
  episodes: number
  /** Дни после — для графика. */
  days: string[]
  rows: ChainRow[]
  /** Сколько раз утро после не отмечено. */
  noMorning: number
  /** По самому слабому звену: связь и вечер после — каждый своей ступенью. */
  level: 'maybe' | 'notable'
  /** С обратной стороны: плохая ночь без фактора накануне — самочувствие и настроение вечером того дня. */
  compare: { n: number; evening: number } | null
}

/**
 * «Что обычно шло следом» (урезанный шаблон макета): после вечера с тегом — ночь (лёг), утро (сон, встал,
 * самочувствие), привычки днём, вечер, каждый шаг против обычного (дни после закрытых вечеров без тега). Шаги,
 * не отличающиеся от обычного, остаются — серым. Конец (самочувствие и настроение вечером после) сам должен
 * быть связью ●○○ и выше — теми же правилами, что и пары; иначе цепочки нет. Это порядок событий, а не причины.
 */
export function chain(history: TimelineDay[], link: Link, challenges: Challenge[], entries: Record<string, EntryMap>, today: Date): Chain | null {
  if (link.factor.kind !== 'tag' || !found(link)) return null
  const tag = link.factor.tag
  const window = history.slice(-LINK_DAYS)
  const last = window.length - 1
  /* сегодняшний день без вечера ещё идёт: ни эпизод, ни «обычно» */
  const next = window.flatMap((d, i) => (i > 0 && window[i - 1]!.evening && !(i === last && !d.evening) ? [{ d, i }] : []))
  const withTag = next.filter(({ i }) => window[i - 1]!.tags.includes(tag))
  const base = next.filter(({ i }) => !window[i - 1]!.tags.includes(tag))

  const endPoints = (l: typeof next): Point[] =>
    l.flatMap(({ d, i }) => (d.evening ? [{ value: stateOf(d.evening)!, day: d.day, weekend: isWeekend(d.day), before: window[i - 1]!.tags }] : []))
  const half = window[Math.floor(window.length / 2)]!.day
  const end = linkOf(link.factor, endPoints(withTag), endPoints(base), true, half)
  if (!found(end)) return null

  const days = (l: typeof next) => l.map(({ d }) => d)
  const scale = (part: 'morning' | 'evening', label: string, pick: (d: TimelineDay) => number | null): ChainRow[] => {
    const w = days(withTag).flatMap((d) => (pick(d) === null ? [] : [pick(d)!]))
    const o = days(base).flatMap((d) => (pick(d) === null ? [] : [pick(d)!]))
    if (!w.length || !o.length) return []
    const m = mean(w)!
    const usual = mean(o)!
    const side: ChainSide = w.length < PART_MIN ? 'few' : Math.abs(m - usual) < CHAIN_SAME ? 'same' : m < usual ? 'worse' : 'better'
    const count = side === 'worse' || side === 'better' ? w.filter((v) => (side === 'worse' ? v < usual : v > usual)).length : 0
    return [{ kind: 'scale', part, label, n: w.length, mean: round1(m), usual: round1(usual), side, count }]
  }
  const step5 = (v: number) => Math.round(v / 5) * 5 + 0
  const time = (part: 'night' | 'morning', label: string, pick: (n: Night) => number): ChainRow[] => {
    const of = (l: TimelineDay[]) => l.flatMap((d) => (d.morning?.night ? [pick(d.morning.night)] : []))
    const w = of(days(withTag))
    const o = of(days(base))
    if (!w.length || !o.length) return []
    const m = step5(mean(w)!)
    const usual = step5(mean(o)!)
    const side = w.length < PART_MIN ? 'few' : Math.abs(m - usual) < CHAIN_SAME_MIN ? 'same' : m > usual ? 'later' : 'earlier'
    const count =
      side === 'later' ? w.filter((v) => v >= usual + CHAIN_SAME_MIN).length : side === 'earlier' ? w.filter((v) => v <= usual - CHAIN_SAME_MIN).length : 0
    return [{ kind: 'time', part, label, n: w.length, mean: m, usual, side, count }]
  }
  const habits: ChainRow[] = challenges
    .filter((c) => c.kind === 'do')
    .flatMap((c) => {
      const known = (l: typeof next) =>
        l.map(({ d }) => dayOutcome(c, entries[c.id] ?? {}, parseDay(d.day), today)).filter((o) => o === 'hit' || o === 'miss')
      const w = known(withTag)
      const o = known(base)
      if (!w.length || !o.length) return []
      const hits = w.filter((x) => x === 'hit').length
      const share = hits / w.length
      const usualShare = o.filter((x) => x === 'hit').length / o.length
      const side: ChainSide =
        w.length < PART_MIN ? 'few' : Math.abs(share - usualShare) < CHAIN_SAME_SHARE ? 'same' : share < usualShare ? 'worse' : 'better'
      return [{ kind: 'habit' as const, part: 'day' as const, label: c.name, hits, known: w.length, usualShare, side }]
    })

  const badNights = window.flatMap((d, i) =>
    i > 0 && d.morning && d.morning.sleep <= BAD_SLEEP && d.evening && window[i - 1]!.evening && !window[i - 1]!.tags.includes(tag) ? [stateOf(d.evening)!] : [],
  )
  return {
    tag,
    episodes: withTag.length,
    days: days(withTag).map((d) => d.day),
    rows: [
      ...time('night', 'лёг', (n) => n.bed),
      ...scale('morning', 'сон', (d) => d.morning?.sleep ?? null),
      ...time('morning', 'встал', (n) => n.wake),
      ...scale('morning', 'самочувствие и настроение', (d) => stateOf(d.morning)),
      ...habits,
      ...scale('evening', 'самочувствие и настроение', (d) => stateOf(d.evening)),
      ...scale('evening', 'продуктивность', (d) => d.evening?.productivity ?? null),
    ],
    noMorning: withTag.filter(({ d }) => !d.morning).length,
    level: link.level === 'notable' && end.level === 'notable' ? 'notable' : 'maybe',
    compare: badNights.length >= PART_MIN ? { n: badNights.length, evening: round1(mean(badNights)!) } : null,
  }
}

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
  const shown = pairs.filter(found)
  const cards = (['less', 'more'] as const)
    .map((b) => shown.filter((l) => l.bucket === b).sort((a, c) => score(c) - score(a))[0])
    .filter((l): l is Link => l !== undefined)
    .sort((a, c) => score(c) - score(a))
  const night = shown.find((l) => l.factor.kind === 'badSleep') ?? null
  return { gate, pairs, cards, night, checked: pairs.filter((l) => l.level !== 'early').length, found: cards.length + (night ? 1 : 0) }
}
