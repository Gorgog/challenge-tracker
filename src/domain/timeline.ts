import { addDays, daysBetween, dayKey, parseDay } from './date'
import { dayOutcome } from './streaks'
import type { Challenge, DayLog, DayStart, EntryMap, Morning, Outcome } from './types'

/*
 * Аналитика «утро и вечер» (решения Georgy от 23.09). Причин не утверждает: показывает, что было, и
 * сравнивает дни «с» и «без» по твоим же записям. Состояние — среднее самочувствия и настроения:
 * они есть и утром, и вечером, поэтому сутки делятся на ночь (вечер → утро) и день (утро → вечер).
 */

/** Вечер — итог закрытого дня. */
export type Evening = { mood: number; wellbeing: number; productivity: number }

export type TimelineDay = {
  day: string
  /** Утро пропущено или день не начат — null, а не среднее. */
  morning: Morning | null
  /** День начат — есть `DayStart`, даже без утра («Пропустить утро»). */
  started: boolean
  /** Только закрытый день. */
  evening: Evening | null
  /** Теги ставятся при закрытии дня — у незакрытого их нет. */
  tags: string[]
  /** Ступени тегов с количеством из закрытого итога (срез 5б); нет ступеней — поля нет. */
  levels?: Record<string, number>
}

/** Сон утром 0–4 — плохой, от 7 — хороший. */
export const BAD_SLEEP = 4
export const GOOD_SLEEP = 7
/** Теги, которые сами по себе — событие к худшему: для стрелок и «чаще / реже». */
export const HARMFUL_TAGS: readonly string[] = ['алкоголь', 'болел', 'ссора']
/** Меньше стольких дней в группе «с» или «без» — не сравниваем. */
export const MIN_COMPARE = 3
/** День хуже или лучше обычного — от балла к норме. */
export const DAY_VS_NORM = 1
/** Ночь или день заметно сдвинули состояние — от полутора баллов. */
export const SHIFT = 1.5
/** Оценки периода сдвинулись — от полубалла. */
export const MOVE = 0.5

/** Дни с `from` по `to` включительно, по календарю — даже без записей. */
export function timeline(logs: DayLog[], starts: DayStart[], from: Date, to: Date): TimelineDay[] {
  const logBy = new Map(logs.map((l) => [l.day, l]))
  const startBy = new Map(starts.map((s) => [s.day, s]))
  const out: TimelineDay[] = []
  const count = daysBetween(from, to)
  for (let i = 0; i <= count; i++) {
    const day = dayKey(addDays(from, i))
    const log = logBy.get(day)
    const closed = log && log.closedAt !== null ? log : null
    out.push({
      day,
      morning: startBy.get(day)?.morning ?? null,
      started: startBy.has(day),
      evening: closed ? { mood: closed.mood, wellbeing: closed.wellbeing, productivity: closed.productivity } : null,
      tags: closed ? [...closed.tags] : [],
      ...(closed?.levels && Object.keys(closed.levels).length ? { levels: { ...closed.levels } } : {}),
    })
  }
  return out
}

/** Состояние замера — среднее самочувствия и настроения. */
export const stateOf = (x: { wellbeing: number; mood: number } | null): number | null =>
  x ? (x.wellbeing + x.mood) / 2 : null

const avg = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : null)

function median(values: number[]): number | null {
  if (!values.length) return null
  const s = [...values].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2
}

/** Состояния всех утр и вечеров подряд. */
const statesOf = (days: TimelineDay[]) =>
  days.flatMap((d) => [stateOf(d.morning), stateOf(d.evening)].filter((v): v is number => v !== null))

/** Норма — медиана состояний утр и вечеров: середина твоих оценок за окно. Для линии графика. */
export const norm = (days: TimelineDay[]) => median(statesOf(days))

export type Norms = { morning: number | null; evening: number | null }

/**
 * Обычное утро и обычный вечер — отдельно. Утро обычно ниже вечера, поэтому день и период меряются
 * «утро к утру, вечер к вечеру»: иначе пропущенные утра выглядели бы как «стало лучше».
 */
export const norms = (days: TimelineDay[]): Norms => ({
  morning: median(days.flatMap((d) => (d.morning ? [stateOf(d.morning)!] : []))),
  evening: median(days.flatMap((d) => (d.evening ? [stateOf(d.evening)!] : []))),
})

/** До десятых, как на экране: порог проверяет то же число, что видно. Без «−0». */
export const round1 = (v: number) => Math.sign(v) * Math.round(Math.abs(v) * 10 + 1e-9) / 10 + 0

/** Среднее сдвигов по парам, где известны оба конца; нет ни одной — null. Округлено. */
function shiftOf(pairs: ({ now: number | null; was: number | null } | null)[]): number | null {
  const diffs = pairs.flatMap((p) => (p && p.now !== null && p.was !== null ? [p.now - p.was] : []))
  const mean = avg(diffs)
  return mean === null ? null : round1(mean)
}

export type Comparison = {
  subject: { kind: 'tag'; tag: string } | { kind: 'badSleep' }
  /** Среднее состояние в дни «с» и «без». */
  with: number
  without: number
  withDays: number
  withoutDays: number
  /** Сон в утра «с» и «без» — только у тега. */
  sleep: { with: number; without: number } | null
}

/**
 * Утро после вечера с тегом против утра после закрытого вечера без него. Дни — подряд по календарю;
 * утро первого дня не с чем связать, незакрытый вечер накануне не идёт никуда.
 */
export function morningsAfter(days: TimelineDay[], tag: string): Comparison | null {
  const withTag: Morning[] = []
  const without: Morning[] = []
  for (let i = 1; i < days.length; i++) {
    const prev = days[i - 1]!
    const { morning } = days[i]!
    if (!morning || !prev.evening) continue
    ;(prev.tags.includes(tag) ? withTag : without).push(morning)
  }
  if (withTag.length < MIN_COMPARE || without.length < MIN_COMPARE) return null
  return {
    subject: { kind: 'tag', tag },
    with: avg(withTag.map((m) => stateOf(m)!))!,
    without: avg(without.map((m) => stateOf(m)!))!,
    withDays: withTag.length,
    withoutDays: without.length,
    sleep: { with: avg(withTag.map((m) => m.sleep))!, without: avg(without.map((m) => m.sleep))! },
  }
}

/** Вечер после плохой ночи (сон 0–4) против вечера после обычной. */
export function afterBadSleep(days: TimelineDay[]): Comparison | null {
  const bad: number[] = []
  const ok: number[] = []
  for (const d of days) {
    if (!d.morning || !d.evening) continue
    ;(d.morning.sleep <= BAD_SLEEP ? bad : ok).push(stateOf(d.evening)!)
  }
  if (bad.length < MIN_COMPARE || ok.length < MIN_COMPARE) return null
  return { subject: { kind: 'badSleep' }, with: avg(bad)!, without: avg(ok)!, withDays: bad.length, withoutDays: ok.length, sleep: null }
}

const outcomeOf = (c: Challenge, entries: EntryMap, day: string, today: Date): Outcome =>
  dayOutcome(c, entries, parseDay(day), today)

/**
 * Утро ещё можно записать: это сегодня, день не начат и час утра из настроек не прошёл (`morningOpen`
 * из `domain/dayStart.ts`). Такое утро не пропущено; начатый без утра день и прошедший час — пропущено.
 */
export const morningPending = (d: TimelineDay, today: Date, morningOpen: boolean) =>
  morningOpen && !d.started && d.day === dayKey(today)

/* ---------- разбор дня ---------- */

export type Shift =
  | { kind: 'noMorning' }
  | { kind: 'nightDown' | 'dayDown' | 'dayUp' | 'nightUp'; by: number }
  | null

/**
 * Что сдвинуло сутки: ночь (вечер накануне → утро) или сам день (утро → вечер), от `SHIFT` баллов.
 * Утра нет — «не видно», если его уже не записать (`pending` — ещё можно).
 */
export function shiftOfDay(prevEvening: number | null, morning: number | null, evening: number | null, pending: boolean): Shift {
  if (morning === null) return pending ? null : { kind: 'noMorning' }
  if (prevEvening !== null && morning - prevEvening <= -SHIFT) return { kind: 'nightDown', by: prevEvening - morning }
  if (evening !== null && evening - morning <= -SHIFT) return { kind: 'dayDown', by: morning - evening }
  if (evening !== null && evening - morning >= SHIFT) return { kind: 'dayUp', by: evening - morning }
  if (prevEvening !== null && morning - prevEvening >= SHIFT) return { kind: 'nightUp', by: morning - prevEvening }
  return null
}

export type Fact =
  | { kind: 'tagBefore'; tag: string }
  | { kind: 'sleep'; value: number }
  | { kind: 'outcome'; outcome: Outcome }
  | { kind: 'tag'; tag: string }
  | { kind: 'eveningMissing' }

export type DayReport = {
  day: string
  /** Состояния: вечер накануне, утро, вечер. */
  prevEvening: number | null
  morning: number | null
  evening: number | null
  /** Общая норма — как у линии графика. */
  norm: number | null
  /** Обычное утро и обычный вечер; итог дня и чипы меряются ими. */
  norms: Norms
  /** Утро к обычному утру, вечер к обычному вечеру, до десятых. */
  vsNorm: { morning: number | null; evening: number | null }
  verdict: 'worse' | 'better' | 'usual' | 'empty'
  shift: Shift
  facts: Fact[]
  compare: Comparison | null
}

/**
 * Разбор дня `days[index]`. `window` — окно графика: по нему норма и сравнения «с» и «без».
 * Сравнение — для вредного тега накануне, иначе для первого тега накануне, иначе после плохой ночи.
 * Для челленджа сравнения нет: пропуск в дни выпивки выдал бы трезвые дни за пользу привычки.
 */
export function dayReport(
  days: TimelineDay[],
  index: number,
  window: TimelineDay[],
  challenge: Challenge,
  entries: EntryMap,
  today: Date,
  /** Час утра из настроек ещё не прошёл. */
  morningOpen = false,
): DayReport {
  const d = days[index]!
  const prev = index > 0 ? days[index - 1]! : null
  const n = norm(window)
  const morning = stateOf(d.morning)
  const evening = stateOf(d.evening)
  const prevEvening = stateOf(prev?.evening ?? null)

  const ns = norms(window)
  const vs = (v: number | null, base: number | null) => (v === null || base === null ? null : round1(v - base))
  const vsNorm = { morning: vs(morning, ns.morning), evening: vs(evening, ns.evening) }
  const delta = shiftOf([
    { now: vsNorm.morning, was: 0 },
    { now: vsNorm.evening, was: 0 },
  ])
  const verdict = delta === null ? 'empty' : delta <= -DAY_VS_NORM ? 'worse' : delta >= DAY_VS_NORM ? 'better' : 'usual'

  const shift = shiftOfDay(prevEvening, morning, evening, morningPending(d, today, morningOpen))

  const facts: Fact[] = []
  for (const tag of prev?.tags ?? []) facts.push({ kind: 'tagBefore', tag })
  if (d.morning) facts.push({ kind: 'sleep', value: d.morning.sleep })
  const outcome = outcomeOf(challenge, entries, d.day, today)
  if (outcome !== 'outside') facts.push({ kind: 'outcome', outcome })
  for (const tag of d.tags) facts.push({ kind: 'tag', tag })
  if (!d.evening && d.day !== dayKey(today)) facts.push({ kind: 'eveningMissing' })

  const before = prev?.tags ?? []
  const tag = before.find((t) => HARMFUL_TAGS.includes(t)) ?? before[0]
  let compare = tag ? morningsAfter(window, tag) : null
  if (!compare && d.morning && d.morning.sleep <= BAD_SLEEP) compare = afterBadSleep(window)

  return { day: d.day, prevEvening, morning, evening, norm: n, norms: ns, vsNorm, verdict, shift, facts, compare }
}

/* ---------- неделя и 30 дней ---------- */

export type Scale = 'wellbeing' | 'mood' | 'sleep'
export const SCALES: Scale[] = ['wellbeing', 'mood', 'sleep']

type Count = { now: number; was: number; usual: number }
export type PeriodEvent =
  | ({ kind: 'tag'; tag: string } & Count)
  | ({ kind: 'badSleep' } & Count)
  | ({ kind: 'misses' } & Count)
  | ({ kind: 'skippedMornings' } & Count)

export type Change = { event: PeriodEvent; by: number; good: boolean | null }

export type WeekRow = {
  from: string
  to: string
  /** Индекс последнего дня недели в `days`. */
  index: number
  /** Утра недели к обычному утру и вечера к обычному вечеру — среднее двух сдвигов, до десятых. */
  vsNorm: number | null
  badSleep: number
  harmful: Record<string, number>
  hits: number
  known: number
}

export type PeriodReport = {
  len: number
  from: string
  to: string
  prevFrom: string | null
  prevTo: string | null
  hasPrev: boolean
  /** Утро к утру и вечер к вечеру (у сна вечера нет); `by` — среднее двух сдвигов, до десятых. */
  scales: Record<Scale, { morning: Pair; evening: Pair | null; by: number | null }>
  moves: { scale: Scale; by: number }[]
  verdict: 'worse' | 'better' | 'mixed' | 'same' | 'noPrev'
  events: PeriodEvent[]
  changes: Change[]
  /** `comparable` — челлендж шёл хотя бы полпериода и сейчас, и в прошлом: иначе пропуски не сравниваются. */
  challenge: { hits: number; known: number; wasHits: number; wasKnown: number; comparable: boolean }
  compare: Comparison | null
  /** Только у 30 дней — недели с конца периода, первая может быть короче. */
  weeks: WeekRow[]
  /** Обычное утро и вечер за окно — для точек дней. */
  norms: Norms
}

type Pair = { now: number | null; was: number | null }

const mornings = (days: TimelineDay[], scale: Scale) => avg(days.flatMap((d) => (d.morning ? [d.morning[scale]] : [])))
const evenings = (days: TimelineDay[], scale: Exclude<Scale, 'sleep'>) =>
  avg(days.flatMap((d) => (d.evening ? [d.evening[scale]] : [])))

/** Дней с утром или вечером. */
const recorded = (days: TimelineDay[]) => days.filter((d) => d.morning || d.evening).length

/**
 * Период из `len` дней по `days[index]` включительно против `len` дней перед ним, если тот записан
 * хотя бы наполовину. `window` — окно
 * графика: по нему «обычно» (сколько раз за `len` дней в среднем) и сравнение для недели; у 30 дней
 * сравнение — внутри самого периода. Что поменялось — от 2 дней у недели и от 4 у 30 дней.
 */
export function periodReport(
  days: TimelineDay[],
  index: number,
  len: number,
  window: TimelineDay[],
  challenge: Challenge,
  entries: EntryMap,
  today: Date,
  /** Час утра из настроек ещё не прошёл. */
  morningOpen = false,
): PeriodReport {
  const cur = days.slice(Math.max(0, index - len + 1), index + 1)
  const prevStart = index - 2 * len + 1
  const prev = prevStart >= 0 ? days.slice(prevStart, index - len + 1) : []
  /* Прошлый период, записанный меньше чем наполовину, — не мерка: «алкоголь 6 против 0» там значило
     бы «тогда не записывал», а не «тогда не пил». */
  const hasPrev = prev.length === len && recorded(prev) * 2 >= len

  const scales = Object.fromEntries(
    SCALES.map((s) => {
      const morning = { now: mornings(cur, s), was: hasPrev ? mornings(prev, s) : null }
      const evening = s === 'sleep' ? null : { now: evenings(cur, s), was: hasPrev ? evenings(prev, s) : null }
      return [s, { morning, evening, by: shiftOf([morning, evening]) }]
    }),
  ) as PeriodReport['scales']
  const moves = SCALES.flatMap((scale) => {
    const { by } = scales[scale]
    return by !== null && Math.abs(by) >= MOVE ? [{ scale, by }] : []
  })
  const downs = moves.some((m) => m.by < 0)
  const ups = moves.some((m) => m.by > 0)
  const verdict = !hasPrev ? 'noPrev' : downs && ups ? 'mixed' : downs ? 'worse' : ups ? 'better' : 'same'

  /* сколько раз за `len` дней в среднем по окну; у пропусков — по дням, когда челлендж шёл */
  const usual = (count: number, base = window.length) => (base ? (count * len) / base : 0)
  const tagDays = (list: TimelineDay[], t: string) => list.filter((d) => d.tags.includes(t)).length
  const badSleep = (list: TimelineDay[]) => list.filter((d) => d.morning && d.morning.sleep <= BAD_SLEEP).length
  const outcomes = (list: TimelineDay[]) => list.map((d) => outcomeOf(challenge, entries, d.day, today))
  const misses = (list: TimelineDay[]) => outcomes(list).filter((o) => o === 'miss').length
  const known = (list: TimelineDay[]) => outcomes(list).filter((o) => o === 'hit' || o === 'miss')
  const skipped = (list: TimelineDay[]) => list.filter((d) => !d.morning && !morningPending(d, today, morningOpen)).length

  const names = [...new Set([...cur, ...prev].flatMap((d) => d.tags))]
  const tags: PeriodEvent[] = names
    .map((tag) => ({ kind: 'tag' as const, tag, now: tagDays(cur, tag), was: tagDays(prev, tag), usual: usual(tagDays(window, tag)) }))
    .sort((a, b) => b.now - a.now || a.tag.localeCompare(b.tag, 'ru'))
  const all: PeriodEvent[] = [
    ...tags,
    { kind: 'badSleep', now: badSleep(cur), was: badSleep(prev), usual: usual(badSleep(window)) },
    { kind: 'misses', now: misses(cur), was: misses(prev), usual: usual(misses(window), known(window).length) },
    { kind: 'skippedMornings', now: skipped(cur), was: skipped(prev), usual: usual(skipped(window)) },
  ]
  const events = all.filter((e) => e.now > 0 || e.was > 0)

  /* челлендж, которого в прошлом периоде почти не было, — не мерка: «пропусков 0 → 11» значило бы
     «тогда его не было», а не «тогда не пропускал» (демо 24.09) */
  const comparable = hasPrev && known(cur).length * 2 >= len && known(prev).length * 2 >= len
  const minDiff = len >= 30 ? 4 : 2
  const changes: Change[] = hasPrev
    ? events
        .filter((e) => e.kind !== 'skippedMornings' && (e.kind !== 'misses' || comparable) && Math.abs(e.now - e.was) >= minDiff)
        .map((event) => {
          const fewer = event.now < event.was
          const good = event.kind === 'tag' ? (HARMFUL_TAGS.includes(event.tag) ? fewer : null) : fewer
          return { event, by: event.now - event.was, good }
        })
        .sort((a, b) => Math.abs(b.by) - Math.abs(a.by))
    : []

  const hitsOf = (list: TimelineDay[]) => outcomes(list).filter((o) => o === 'hit').length

  const topTag = changes.find((c) => c.event.kind === 'tag')?.event
  const compare = topTag && topTag.kind === 'tag' ? morningsAfter(len >= 30 ? cur : window, topTag.tag) : null

  const weeks: WeekRow[] = []
  const ns = norms(window)
  if (len >= 30) {
    const firstIndex = index - cur.length + 1
    for (let end = cur.length; end > 0; end -= 7) {
      const chunk = cur.slice(Math.max(0, end - 7), end)
      const harmful: Record<string, number> = {}
      for (const t of HARMFUL_TAGS) {
        const n = tagDays(chunk, t)
        if (n) harmful[t] = n
      }
      weeks.unshift({
        from: chunk[0]!.day,
        to: chunk[chunk.length - 1]!.day,
        index: firstIndex + end - 1,
        vsNorm: shiftOf([
          { now: avg(chunk.flatMap((d) => (d.morning ? [stateOf(d.morning)!] : []))), was: ns.morning },
          { now: avg(chunk.flatMap((d) => (d.evening ? [stateOf(d.evening)!] : []))), was: ns.evening },
        ]),
        badSleep: badSleep(chunk),
        harmful,
        hits: hitsOf(chunk),
        known: known(chunk).length,
      })
    }
  }

  return {
    len,
    from: cur[0]!.day,
    to: cur[cur.length - 1]!.day,
    prevFrom: prev[0]?.day ?? null,
    prevTo: prev[prev.length - 1]?.day ?? null,
    hasPrev,
    scales,
    moves,
    verdict,
    events,
    changes,
    challenge: { hits: hitsOf(cur), known: known(cur).length, wasHits: hitsOf(prev), wasKnown: known(prev).length, comparable },
    compare,
    weeks,
    norms: ns,
  }
}
