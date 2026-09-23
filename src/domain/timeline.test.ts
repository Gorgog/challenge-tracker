import { describe, expect, it } from 'vitest'
import { addDays, dayKey, parseDay } from './date'
import {
  afterBadSleep,
  dayReport,
  morningsAfter,
  norm,
  norms,
  periodReport,
  stateOf,
  timeline,
  type TimelineDay,
} from './timeline'
import type { Challenge, DayLog, DayStart, EntryMap } from './types'

const TODAY = parseDay('2026-09-23')
const key = (back: number) => dayKey(addDays(TODAY, -back))

const log = (back: number, wellbeing: number, mood: number, tags: string[] = [], closed = true): DayLog => ({
  day: key(back),
  mood,
  wellbeing,
  productivity: 5,
  tags,
  note: '',
  closedAt: closed ? `${key(back)}T21:00:00.000Z` : null,
})
const start = (back: number, morning: [sleep: number, wellbeing: number, mood: number] | null): DayStart => ({
  day: key(back),
  morning: morning ? { sleep: morning[0], wellbeing: morning[1], mood: morning[2] } : null,
  startedAt: `${key(back)}T08:00:00.000Z`,
})

const challenge = (over: Partial<Challenge> = {}): Challenge => ({
  id: 'push',
  name: 'Отжиматься по 20 раз',
  code: 'ОТЖ',
  kind: 'do',
  measure: 'count',
  goal: 20,
  unit: 'раз',
  color: 'var(--chart-1)',
  tagIds: [],
  startDate: key(120),
  lengthDays: null,
  pauses: [],
  rulesLocked: false,
  deletedAt: null,
  sortOrder: 0,
  ...over,
})

/** Ровный день: утро и вечер 6, сон 7. */
function flat(back: number, tags: string[] = []) {
  return { log: log(back, 6, 6, tags), start: start(back, [7, 6, 6]) }
}

function world(days: { log?: DayLog; start?: DayStart }[]) {
  return {
    logs: days.flatMap((d) => (d.log ? [d.log] : [])),
    starts: days.flatMap((d) => (d.start ? [d.start] : [])),
  }
}

const range = (from: number, to: number) => Array.from({ length: from - to + 1 }, (_, i) => from - i)

describe('timeline — дни с утром, вечером и тегами', () => {
  it('идёт по календарю от from до to включительно, даже без записей', () => {
    const days = timeline([], [], addDays(TODAY, -2), TODAY)
    expect(days.map((d) => d.day)).toEqual([key(2), key(1), key(0)])
    expect(days.every((d) => d.morning === null && d.evening === null && d.tags.length === 0)).toBe(true)
  })

  it('пропущенное утро и незакрытый вечер — null, а не среднее и не ноль', () => {
    const { logs, starts } = world([
      { log: log(2, 4, 5, ['алкоголь']), start: start(2, null) },
      { log: log(1, 7, 7, ['встречи'], false), start: start(1, [3, 4, 5]) },
    ])
    const [a, b] = timeline(logs, starts, addDays(TODAY, -2), addDays(TODAY, -1))
    expect(a!.morning).toBeNull()
    expect(a!.evening).toEqual({ wellbeing: 4, mood: 5, productivity: 5 })
    expect(a!.tags).toEqual(['алкоголь'])
    expect(b!.morning).toEqual({ sleep: 3, wellbeing: 4, mood: 5 })
    expect(b!.evening).toBeNull()
    /* теги ставятся при закрытии дня — у незакрытого их нет */
    expect(b!.tags).toEqual([])
  })

  it('stateOf — среднее самочувствия и настроения', () => {
    expect(stateOf({ wellbeing: 4, mood: 7 })).toBe(5.5)
    expect(stateOf(null)).toBeNull()
  })

  it('норма — медиана состояний утр и вечеров', () => {
    const { logs, starts } = world([
      { log: log(2, 2, 2), start: start(2, [7, 4, 4]) },
      { log: log(1, 8, 8), start: start(1, [7, 6, 6]) },
      { start: start(0, [7, 9, 9]) },
    ])
    /* 4, 2, 6, 8, 9 → медиана 6 */
    expect(norm(timeline(logs, starts, addDays(TODAY, -2), TODAY))).toBe(6)
    expect(norm(timeline([], [], addDays(TODAY, -2), TODAY))).toBeNull()
  })
})

describe('morningsAfter и afterBadSleep — «с» против «без»', () => {
  it('утро после вечера с тегом против утра после закрытого вечера без него', () => {
    const w = world([
      { log: log(6, 6, 6, ['алкоголь']), start: start(6, [7, 6, 6]) },
      { log: log(5, 6, 6), start: start(5, [2, 3, 3]) },
      { log: log(4, 6, 6, ['алкоголь']), start: start(4, [7, 6, 6]) },
      { log: log(3, 6, 6), start: start(3, [3, 2, 4]) },
      { log: log(2, 6, 6, ['алкоголь']), start: start(2, [7, 7, 7]) },
      { log: log(1, 6, 6), start: start(1, [2, 4, 4]) },
      { start: start(0, [8, 7, 7]) },
    ])
    const days = timeline(w.logs, w.starts, addDays(TODAY, -6), TODAY)
    const r = morningsAfter(days, 'алкоголь')!
    expect(r.subject).toEqual({ kind: 'tag', tag: 'алкоголь' })
    /* после алкоголя — утра 5, 3, 1 (3, 3, 4 → среднее 3,33); без — 4, 2, 0 (6, 7, 7 → 6,67) */
    expect(r.withDays).toBe(3)
    expect(r.withoutDays).toBe(3)
    expect(r.with).toBeCloseTo(10 / 3)
    expect(r.without).toBeCloseTo(20 / 3)
    expect(r.sleep).toEqual({ with: 7 / 3, without: 22 / 3 })
  })

  it('меньше трёх дней в группе — сравнения нет', () => {
    const w = world([
      { log: log(3, 6, 6, ['алкоголь']), start: start(3, [7, 6, 6]) },
      { log: log(2, 6, 6), start: start(2, [2, 3, 3]) },
      { log: log(1, 6, 6), start: start(1, [7, 6, 6]) },
      { start: start(0, [7, 6, 6]) },
    ])
    expect(morningsAfter(timeline(w.logs, w.starts, addDays(TODAY, -3), TODAY), 'алкоголь')).toBeNull()
  })

  it('порог — три дня в группе: два «с» — нет сравнения, три — есть', () => {
    const run = (drinks: number[]) => {
      const w = world([
        ...range(12, 1).map((b) => ({ log: log(b, 6, 6, drinks.includes(b) ? ['алкоголь'] : []), start: start(b, [7, 6, 6]) })),
        { start: start(0, [7, 6, 6]) },
      ])
      return morningsAfter(timeline(w.logs, w.starts, addDays(TODAY, -12), TODAY), 'алкоголь')
    }
    expect(run([10, 6])).toBeNull()
    expect(run([10, 6, 2])?.withDays).toBe(3)
  })

  it('незакрытый вечер накануне не идёт ни в «с», ни в «без»', () => {
    const w = world([
      ...range(8, 1).map((b) => ({ log: log(b, 6, 6, b % 2 ? ['алкоголь'] : [], b !== 4), start: start(b, [7, 6, 6]) })),
      { start: start(0, [7, 6, 6]) },
    ])
    const r = morningsAfter(timeline(w.logs, w.starts, addDays(TODAY, -8), TODAY), 'алкоголь')!
    /* вечера 8…1 закрыты все, кроме 4-го; утра 7…0 — после них: «с» — после 7, 5, 3, 1; «без» — после 8, 6, 2 */
    expect(r.withDays + r.withoutDays).toBe(7)
  })

  it('после плохой ночи (сон 0–4) — вечер против вечера после обычной', () => {
    const w = world([
      { log: log(5, 3, 3), start: start(5, [2, 5, 5]) },
      { log: log(4, 4, 4), start: start(4, [4, 5, 5]) },
      { log: log(3, 5, 5), start: start(3, [1, 5, 5]) },
      { log: log(2, 7, 7), start: start(2, [7, 5, 5]) },
      { log: log(1, 8, 8), start: start(1, [8, 5, 5]) },
      { log: log(0, 9, 9), start: start(0, [5, 5, 5]) },
    ])
    const r = afterBadSleep(timeline(w.logs, w.starts, addDays(TODAY, -5), TODAY))!
    expect(r.subject).toEqual({ kind: 'badSleep' })
    expect([r.with, r.without, r.withDays, r.withoutDays]).toEqual([4, 8, 3, 3])
    expect(r.sleep).toBeNull()
  })
})

describe('dayReport — разбор дня', () => {
  /* 30 ровных дней: норма 6 */
  const base = () => range(29, 1).map((b) => flat(b))

  function report(overrides: Record<number, { log?: DayLog; start?: DayStart }>, back = 1, c = challenge(), entries: EntryMap = {}) {
    const all = base().map((d, i) => overrides[29 - i] ?? d)
    const w = world(all)
    const days = timeline(w.logs, w.starts, addDays(TODAY, -29), TODAY)
    return dayReport(days, days.findIndex((d) => d.day === key(back)), days, c, entries, TODAY)
  }

  it('день хуже обычного и просела ночь', () => {
    const r = report({
      2: { log: log(2, 6, 6, ['алкоголь']), start: start(2, [7, 6, 6]) },
      1: { log: log(1, 5, 5), start: start(1, [2, 3, 3]) },
    })
    expect(r.norm).toBe(6)
    expect([r.prevEvening, r.morning, r.evening]).toEqual([6, 3, 5])
    /* (3 + 5) / 2 − 6 = −2 */
    expect(r.verdict).toBe('worse')
    expect(r.shift).toEqual({ kind: 'nightDown', by: 3 })
    expect(r.facts).toEqual([
      { kind: 'tagBefore', tag: 'алкоголь' },
      { kind: 'sleep', value: 2 },
      { kind: 'outcome', outcome: 'miss' },
    ])
  })

  it('где сдвиг: день просел, день вытянул, ночь помогла, сдвига нет, утра нет', () => {
    const at = (m: number, e: number, pe = 6) =>
      report({ 2: { log: log(2, pe, pe), start: start(2, [7, 6, 6]) }, 1: { log: log(1, e, e), start: start(1, [7, m, m]) } }).shift
    expect(at(6, 4)).toEqual({ kind: 'dayDown', by: 2 })
    expect(at(5, 7)).toEqual({ kind: 'dayUp', by: 2 })
    expect(at(8, 8, 6)).toEqual({ kind: 'nightUp', by: 2 })
    expect(at(6, 7)).toBeNull()
    expect(report({ 1: { log: log(1, 6, 6), start: start(1, null) } }).shift).toEqual({ kind: 'noMorning' })
  })

  it('ночь и день оба вверх — говорим про день', () => {
    const r = report({ 2: { log: log(2, 4, 4), start: start(2, [7, 6, 6]) }, 1: { log: log(1, 8, 8), start: start(1, [7, 6, 6]) } })
    expect(r.shift).toEqual({ kind: 'dayUp', by: 2 })
  })

  it('обычный и лучше обычного — от балла к норме', () => {
    expect(report({ 1: { log: log(1, 7, 7), start: start(1, [7, 6, 6]) } }).verdict).toBe('usual')
    expect(report({ 1: { log: log(1, 8, 8), start: start(1, [7, 7, 7]) } }).verdict).toBe('better')
  })

  it('отметка челленджа — через dayOutcome: вне челленджа не упоминается', () => {
    const late = challenge({ startDate: key(0) })
    expect(report({}, 1, late).facts.some((f) => f.kind === 'outcome')).toBe(false)
    const quit = challenge({ kind: 'quit', measure: 'binary', goal: 1 })
    expect(report({}, 1, quit, { [key(1)]: 0 }).facts).toContainEqual({ kind: 'outcome', outcome: 'miss' })
    expect(report({}, 1, quit).facts).toContainEqual({ kind: 'outcome', outcome: 'hit' })
  })

  it('незакрытый прошедший вечер — факт, сегодняшний — нет', () => {
    expect(report({ 1: { log: log(1, 6, 6, [], false), start: start(1, [7, 6, 6]) } }).facts).toContainEqual({
      kind: 'eveningMissing',
    })
    const w = world([...base(), { start: start(0, [7, 6, 6]) }])
    const days = timeline(w.logs, w.starts, addDays(TODAY, -29), TODAY)
    const today = dayReport(days, days.length - 1, days, challenge(), {}, TODAY)
    expect(today.facts).not.toContainEqual({ kind: 'eveningMissing' })
    expect(today.facts).toContainEqual({ kind: 'outcome', outcome: 'pending' })
  })

  it('сравнение — для вредного тега накануне, иначе после плохой ночи', () => {
    const alcohol = Object.fromEntries(
      [20, 16, 12, 8, 2].map((b) => [b, { log: log(b, 6, 6, ['алкоголь']), start: start(b, [7, 6, 6]) }]),
    )
    const after = Object.fromEntries([19, 15, 11, 7, 1].map((b) => [b, { log: log(b, 4, 4), start: start(b, [2, 3, 3]) }]))
    const r = report({ ...alcohol, ...after })
    expect(r.compare?.subject).toEqual({ kind: 'tag', tag: 'алкоголь' })
    expect(r.compare!.with).toBe(3)
    expect(r.compare!.without).toBe(6)

    const bad = Object.fromEntries([19, 15, 11, 1].map((b) => [b, { log: log(b, 3, 3), start: start(b, [2, 6, 6]) }]))
    expect(report(bad).compare?.subject).toEqual({ kind: 'badSleep' })
    expect(report({}).compare).toBeNull()
  })
})

describe('dayReport — какой тег сравнивать', () => {
  it('накануне «встречи» и «алкоголь» — сравниваем алкоголь, даже если он второй', () => {
    const w = world([
      ...range(29, 2).map((b) => ({
        log: log(b, 6, 6, b % 4 === 2 ? ['встречи', 'алкоголь'] : b % 4 === 0 ? ['встречи'] : []),
        start: start(b, [7, 6, 6]),
      })),
      { log: log(1, 5, 5), start: start(1, [3, 4, 4]) },
    ])
    const days = timeline(w.logs, w.starts, addDays(TODAY, -29), TODAY)
    const r = dayReport(days, days.findIndex((d) => d.day === key(1)), days, challenge(), {}, TODAY)
    expect(r.facts.slice(0, 2)).toEqual([
      { kind: 'tagBefore', tag: 'встречи' },
      { kind: 'tagBefore', tag: 'алкоголь' },
    ])
    expect(r.compare?.subject).toEqual({ kind: 'tag', tag: 'алкоголь' })
  })
})

describe('periodReport — неделя и 30 дней', () => {
  /* 90 дней: первые 60 ровные, дальше — неделя с алкоголем каждый вечер */
  function build(special: (back: number) => { log?: DayLog; start?: DayStart } | null) {
    const w = world(range(89, 1).map((b) => special(b) ?? flat(b)))
    return timeline(w.logs, w.starts, addDays(TODAY, -89), TODAY)
  }
  const drinkingWeek = (b: number) =>
    b >= 1 && b <= 7 ? { log: log(b, 3, 4, ['алкоголь']), start: start(b, [2, 3, 4]) } : null

  it('неделя: оценки против прошлой, события с «обычно», что поменялось', () => {
    const days = build(drinkingWeek)
    const window = days.slice(-30)
    const r = periodReport(days, days.length - 2, 7, window, challenge(), {}, TODAY)
    expect([r.from, r.to, r.prevFrom, r.prevTo]).toEqual([key(7), key(1), key(14), key(8)])
    expect(r.hasPrev).toBe(true)
    expect(r.scales.wellbeing).toEqual({ morning: { now: 3, was: 6 }, evening: { now: 3, was: 6 }, by: -3 })
    expect(r.scales.sleep).toEqual({ morning: { now: 2, was: 7 }, evening: null, by: -5 })
    expect(r.verdict).toBe('worse')
    expect(r.moves.map((m) => m.scale)).toEqual(['wellbeing', 'mood', 'sleep'])

    const alcohol = r.events.find((e) => e.kind === 'tag' && e.tag === 'алкоголь')!
    expect([alcohol.now, alcohol.was]).toEqual([7, 0])
    /* за 30 дней окна — 7 вечеров, это ~1,6 за неделю */
    expect(alcohol.usual).toBeCloseTo((7 * 7) / 30)
    expect(r.changes[0]).toMatchObject({ event: { kind: 'tag', tag: 'алкоголь' }, good: false })
    expect(r.changes.map((c) => c.event.kind)).toContain('badSleep')
    /* ОТЖ без отметок: пропуски каждый день в обе недели — не поменялось */
    expect(r.changes.map((c) => c.event.kind)).not.toContain('misses')
  })

  it('неделя: «что поменялось» — от двух дней, пропущенные утра туда не идут', () => {
    const days = build((b) => (b === 3 || b === 5 ? { log: log(b, 6, 6, ['встречи']), start: start(b, null) } : null))
    const r = periodReport(days, days.length - 2, 7, days.slice(-30), challenge(), {}, TODAY)
    expect(r.events.find((e) => e.kind === 'skippedMornings')).toMatchObject({ now: 2, was: 0 })
    expect(r.changes.map((c) => c.event.kind)).toEqual(['tag'])
    expect(r.changes[0]!.good).toBeNull()
  })

  it('30 дней: порог изменений — 4 дня, строки — по неделям с конца', () => {
    const days = build((b) => (b <= 30 && b % 5 === 0 ? { log: log(b, 6, 6, ['алкоголь']), start: start(b, [3, 6, 6]) } : null))
    const r = periodReport(days, days.length - 2, 30, days.slice(-30), challenge(), {}, TODAY)
    /* 30…1: алкоголь в 30, 25, 20, 15, 10, 5 — 6 раз против 0 */
    expect(r.changes[0]).toMatchObject({ event: { kind: 'tag', tag: 'алкоголь', now: 6, was: 0 } })
    expect(r.weeks.map((w) => [w.from, w.to])).toEqual([
      [key(30), key(29)],
      [key(28), key(22)],
      [key(21), key(15)],
      [key(14), key(8)],
      [key(7), key(1)],
    ])
    expect(r.weeks[4]).toMatchObject({ badSleep: 1, harmful: { алкоголь: 1 } })
  })

  it('30 дней: сдвиг на три дня — не изменение; «обычно» — на 30 дней', () => {
    const days = build((b) => (b === 3 || b === 9 || b === 15 ? { log: log(b, 6, 6, ['встречи']), start: start(b, [7, 6, 6]) } : null))
    const r = periodReport(days, days.length - 2, 30, days.slice(-30), challenge(), {}, TODAY)
    const meetings = r.events.find((e) => e.kind === 'tag' && e.tag === 'встречи')!
    expect([meetings.now, meetings.was]).toEqual([3, 0])
    /* окно — те же 30 дней, поэтому «обычно за 30 дней» равно числу в окне */
    expect(meetings.usual).toBeCloseTo(3)
    expect(r.changes).toEqual([])
  })

  it('прошлого периода в истории нет — сравнения нет', () => {
    const w = world(range(10, 1).map((b) => flat(b)))
    const days = timeline(w.logs, w.starts, addDays(TODAY, -10), TODAY)
    const r = periodReport(days, days.length - 2, 30, days, challenge(), {}, TODAY)
    expect(r.hasPrev).toBe(false)
    expect(r.verdict).toBe('noPrev')
    expect(r.changes).toEqual([])
  })

  it('прошлый период записан меньше чем наполовину — сравнения нет', () => {
    /* записи только за последние 40 дней: из предыдущих 30 (59…30) записано 11 */
    const w = world(range(40, 1).map((b) => flat(b)))
    const days = timeline(w.logs, w.starts, addDays(TODAY, -89), TODAY)
    const month = periodReport(days, days.length - 2, 30, days.slice(-30), challenge(), {}, TODAY)
    expect(month.hasPrev).toBe(false)
    expect(month.verdict).toBe('noPrev')
    /* у недели прошлая записана целиком */
    expect(periodReport(days, days.length - 2, 7, days.slice(-30), challenge(), {}, TODAY).hasPrev).toBe(true)
    /* половина записана — сравниваем: 45 дней истории, из 59…30 записано 15 */
    const w2 = world(range(45, 1).map((b) => flat(b)))
    const days2 = timeline(w2.logs, w2.starts, addDays(TODAY, -89), TODAY)
    expect(periodReport(days2, days2.length - 2, 30, days2.slice(-30), challenge(), {}, TODAY).hasPrev).toBe(true)
  })

  it('выполнение челленджа — X из известных дней', () => {
    const days = build(() => null)
    const entries: EntryMap = Object.fromEntries(range(7, 1).filter((b) => b % 2).map((b) => [key(b), 20]))
    const r = periodReport(days, days.length - 2, 7, days.slice(-30), challenge(), entries, TODAY)
    expect(r.challenge).toEqual({ hits: 4, known: 7, wasHits: 0, wasKnown: 7 })
  })
})

describe('утро к утру, вечер к вечеру — пропуски не выдаются за сдвиг (ревью 23.09)', () => {
  /* 90 дней: утро 4, вечер 8 (сон 7) — утро всегда ниже вечера */
  const split = (back: number, morning = true, wellbeing: [number, number] = [4, 8]) => ({
    log: log(back, wellbeing[1], 8),
    start: start(back, morning ? [7, wellbeing[0], 4] : null),
  })
  function build(special: (back: number) => { log?: DayLog; start?: DayStart } | null) {
    const w = world(range(89, 1).map((b) => special(b) ?? split(b)))
    return timeline(w.logs, w.starts, addDays(TODAY, -89), TODAY)
  }
  const week = (days: TimelineDay[]) => periodReport(days, days.length - 2, 7, days.slice(-30), challenge(), {}, TODAY)

  it('norms — медианы утр и вечеров отдельно', () => {
    const days = build(() => null)
    expect(norms(days.slice(-30))).toEqual({ morning: 4, evening: 8 })
    expect(norms(timeline([], [], TODAY, TODAY))).toEqual({ morning: null, evening: null })
  })

  it('прошлая неделя без утр, эта целиком — всё как было, а не «хуже»', () => {
    const r = week(build((b) => (b >= 8 && b <= 14 ? split(b, false) : null)))
    expect(r.hasPrev).toBe(true)
    expect(r.scales.wellbeing).toEqual({ morning: { now: 4, was: null }, evening: { now: 8, was: 8 }, by: 0 })
    expect(r.moves).toEqual([])
    expect(r.verdict).toBe('same')
  })

  it('утро упало на 2, вечер ровный — сдвиг −1, неделя хуже', () => {
    const r = week(build((b) => (b <= 7 ? split(b, true, [2, 8]) : null)))
    expect(r.scales.wellbeing.by).toBe(-1)
    expect(r.verdict).toBe('worse')
  })

  it('утр нет ни в одной неделе — сдвиг только по вечерам', () => {
    const r = week(build((b) => (b <= 14 ? { log: log(b, b <= 7 ? 6 : 8, 8), start: start(b, null) } : null)))
    expect(r.scales.wellbeing).toEqual({ morning: { now: null, was: null }, evening: { now: 6, was: 8 }, by: -2 })
  })

  it('сдвиг сравнивается с порогом округлённым — как на экране', () => {
    /* утра этой недели: 5 дней по 5 и день 4 при одном пропуске (5/6 выше), вечера: один 9 (1/7 выше) —
       (0,833 + 0,143) / 2 = 0,488 → на экране «+0,5», и порог 0,5 его засчитывает */
    const r = week(
      build((b) => {
        if (b > 7) return null
        if (b === 7) return { log: log(b, 8, 8), start: start(b, null) }
        return { log: log(b, b === 1 ? 9 : 8, 8), start: start(b, [7, b === 6 ? 4 : 5, 4]) }
      }),
    )
    expect(r.scales.wellbeing.by).toBe(0.5)
    expect(r.moves).toContainEqual({ scale: 'wellbeing', by: 0.5 })
    /* 0,405 → «+0,4» — не сдвиг */
    const small = week(
      build((b) => {
        if (b > 7) return null
        if (b === 7) return { log: log(b, 8, 8), start: start(b, null) }
        return { log: log(b, b === 1 ? 9 : 8, 8), start: start(b, [7, b <= 4 ? 5 : 4, 4]) }
      }),
    )
    expect(small.scales.wellbeing.by).toBe(0.4)
    expect(small.moves).toEqual([])
  })

  it('день без утра с обычным вечером — обычный, а не «лучше обычного»', () => {
    const w = world([...range(29, 2).map((b) => split(b)), { log: log(1, 8, 8), start: start(1, null) }, { start: start(0, [7, 4, 4]) }])
    const days = timeline(w.logs, w.starts, addDays(TODAY, -29), TODAY)
    const r = dayReport(days, days.length - 2, days, challenge(), {}, TODAY)
    expect(r.norms).toEqual({ morning: 4, evening: 8 })
    expect(r.vsNorm).toEqual({ morning: null, evening: 0 })
    expect(r.verdict).toBe('usual')
  })

  it('день: утро и вечер — каждый к своей норме, итог — среднее', () => {
    const w = world([...range(29, 2).map((b) => split(b)), { log: log(1, 7, 7), start: start(1, [7, 3, 3]) }])
    const days = timeline(w.logs, w.starts, addDays(TODAY, -29), TODAY)
    const r = dayReport(days, days.length - 2, days, challenge(), {}, TODAY)
    expect(r.vsNorm).toEqual({ morning: -1, evening: -1 })
    expect(r.verdict).toBe('worse')
  })

  it('30 дней: неделя без утр с обычными вечерами — на уровне нормы', () => {
    const days = build((b) => (b >= 8 && b <= 14 ? split(b, false) : null))
    const r = periodReport(days, days.length - 2, 30, days.slice(-30), challenge(), {}, TODAY)
    expect(r.weeks.map((w) => w.vsNorm)).toEqual([0, 0, 0, 0, 0])
  })
})

describe('сегодня и молодой челлендж (ревью 23.09)', () => {
  it('сегодня день ещё не начат — не «утро пропущено»', () => {
    const w = world(range(29, 1).map((b) => flat(b)))
    const days = timeline(w.logs, w.starts, addDays(TODAY, -29), TODAY)
    expect(dayReport(days, days.length - 1, days, challenge(), {}, TODAY).shift).toBeNull()
    /* вчерашний день без утра — пропущено */
    const w2 = world([...range(29, 2).map((b) => flat(b)), { log: log(1, 6, 6), start: start(1, null) }])
    const days2 = timeline(w2.logs, w2.starts, addDays(TODAY, -29), TODAY)
    expect(dayReport(days2, days2.length - 2, days2, challenge(), {}, TODAY).shift).toEqual({ kind: 'noMorning' })
  })

  it('«обычно» для пропусков — на дни, когда челлендж шёл, а не на все 30', () => {
    const w = world(range(89, 1).map((b) => flat(b)))
    const days = timeline(w.logs, w.starts, addDays(TODAY, -89), TODAY)
    /* начат 10 дней назад: выполнено 10, 8, 6, 4, 2 — пропуски 9, 7, 5, 3, 1; 5 из 10 → ~3,5 за неделю */
    const young = challenge({ startDate: key(10) })
    const entries: EntryMap = Object.fromEntries([10, 8, 6, 4, 2].map((b) => [key(b), 20]))
    const r = periodReport(days, days.length - 2, 7, days.slice(-30), young, entries, TODAY)
    const misses = r.events.find((e) => e.kind === 'misses')!
    expect(misses.now).toBe(4)
    expect(misses.usual).toBeCloseTo(3.5)
  })
})

it('TimelineDay — только данные, без дат-объектов (удобно для мемо и тестов)', () => {
  const [d] = timeline([], [], TODAY, TODAY) as TimelineDay[]
  expect(Object.keys(d!).sort()).toEqual(['day', 'evening', 'morning', 'tags'])
})
