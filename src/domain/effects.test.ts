import { describe, expect, it } from 'vitest'
import { addDays, dayKey, isoDow, parseDay } from './date'
import {
  METRICS,
  beforeAfter,
  challengeEffects,
  effectText,
  strengthOf,
  strictLevel,
  tagEffects,
  verdictOf,
  type Estimate,
  type Strength,
} from './effects'
import { tQuantile } from './regression'
import type { Challenge, DayLog, DayStart, EntryMap, Morning, ScoreField } from './types'

const TODAY = parseDay('2026-09-21')
/** Сколько дней истории у синтетического мира: с TODAY−120 по вчера. */
const DAYS = 120
/** Строк в расчёте без потерь: у первого дня нет «вчера», у вчерашнего — известного «завтра». */
const FULL = DAYS - 2

/** Момент удаления — локальный полдень нужного дня: день не зависит от часового пояса. */
const deletedOn = (key: string) => {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y!, m! - 1, d!, 12).toISOString()
}

function challenge(over: Partial<Challenge> = {}): Challenge {
  return {
    id: 'c1', name: 'Читать 20 страниц', code: 'ЧТН', kind: 'do', measure: 'binary', goal: 1,
    unit: null, color: 'var(--chart-1)', tagIds: [], startDate: dayKey(addDays(TODAY, -DAYS)),
    lengthDays: null, pauses: [], rulesLocked: false, deletedAt: null, sortOrder: 0,
    ...over,
  }
}

/** Детерминированный генератор: одно зерно — одна история. */
function mulberry32(seed: number) {
  let a = seed | 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Нормальный шум по Боксу — Мюллеру. */
const gauss = (rnd: () => number) =>
  Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd())

type SimDay = { i: number; key: string; weekend: boolean; state: number; done: boolean }
type Scores = Record<ScoreField, number>

/**
 * Синтетический мир с заранее известной связью: как выполняется челлендж и из чего
 * складываются оценки. К каждой шкале добавляется свой шум — как в жизни.
 * `length` — сколько дней истории, по вчера; по умолчанию `DAYS`.
 * `morning` — утро дня (null — пропущено); тянется после оценок, поэтому вечер с утрами и без — один.
 */
function simulate(
  seed: number,
  rules: {
    state?: (prev: number, noise: number) => number
    done: (d: SimDay, rnd: () => number) => boolean
    score: (d: SimDay, yesterday: SimDay | undefined) => number | Scores
    tags?: (i: number) => string[]
    morning?: (d: SimDay, yesterday: SimDay | undefined, rnd: () => number) => Morning | null
  },
  length = DAYS,
): { entries: EntryMap; logs: DayLog[]; starts: DayStart[] } {
  const rnd = mulberry32(seed)
  const days: SimDay[] = []
  let state = 0
  for (let i = 0; i < length; i++) {
    const date = addDays(TODAY, i - length)
    state = rules.state ? rules.state(state, gauss(rnd)) : 0
    const day: SimDay = { i, key: dayKey(date), weekend: isoDow(date) >= 5, state, done: false }
    day.done = rules.done(day, rnd)
    days.push(day)
  }

  const entries: EntryMap = {}
  for (const d of days) if (d.done) entries[d.key] = 1

  const logs = days.map((d): DayLog => {
    const base = rules.score(d, days[d.i - 1])
    const s = typeof base === 'number' ? { mood: base, wellbeing: base, productivity: base } : base
    return {
      day: d.key,
      mood: s.mood + 0.8 * gauss(rnd),
      wellbeing: s.wellbeing + 0.8 * gauss(rnd),
      productivity: s.productivity + 0.8 * gauss(rnd),
      tags: rules.tags?.(d.i) ?? [],
      note: '',
      closedAt: `${d.key}T21:00:00.000Z`,
    }
  })
  const starts = rules.morning
    ? days.map((d) => ({ day: d.key, morning: rules.morning!(d, days[d.i - 1], rnd), startedAt: `${d.key}T08:00:00.000Z` }))
    : []
  return { entries, logs, starts }
}

type World = { entries: EntryMap; logs: DayLog[]; starts: DayStart[] }

const effectOf = (w: World, c = challenge()) => challengeEffects([c], { [c.id]: w.entries }, w.logs, TODAY)[0]!
/** Тот же челлендж, но с утрами мира. */
const morningEffectOf = (w: World, c = challenge()) =>
  challengeEffects([c], { [c.id]: w.entries }, w.logs, TODAY, w.starts)[0]!

/** Утро с оценкой `score` по самочувствию и настроению — у каждой шкалы свой шум, как вечером. */
const wake = (score: number, rnd: () => number, sleep = 7): Morning => ({
  sleep,
  wellbeing: score + 0.8 * gauss(rnd),
  mood: score + 0.8 * gauss(rnd),
})

const coin = (_d: SimDay, rnd: () => number) => rnd() < 0.5
const STRONG = ['likely', 'strong']
/** «Возможно» и сильнее. */
const WORDED = ['possible', 'likely', 'strong']

describe('окна эффекта челленджа', () => {
  it('эффект на следующий день находится в окне «назавтра», а в тот же день разницы нет', () => {
    const w = simulate(1, { done: coin, score: (_d, y) => 6 + (y?.done ? 1.5 : 0) })
    const { day } = effectOf(w).windows

    expect(STRONG).toContain(day.next.strength)
    expect(day.next.delta).toBeCloseTo(1.5, 0)
    expect(day.same.strength).toBe('flat')
  })

  it('эффект только в тот же день на завтра не переносится', () => {
    const w = simulate(2, { done: coin, score: (d) => 6 + (d.done ? 1.5 : 0) })
    const { day } = effectOf(w).windows

    expect(day.same.strength).toBe('likely')
    expect(day.next.strength).toBe('flat')
  })

  it('в окне «в тот же день» не бывает «уверенно» — причину от следствия там не отличить', () => {
    const w = simulate(3, { done: coin, score: (d) => 6 + (d.done ? 3 : 0) })
    expect(effectOf(w).windows.day.same.strength).toBe('likely')
  })

  it('выходные хуже будней — это не эффект того, что делаю в будни, ни в тот же день, ни назавтра', () => {
    const w = simulate(4, {
      done: (d, rnd) => rnd() < (d.weekend ? 0.1 : 0.8),
      score: (d) => 7 - (d.weekend ? 2 : 0),
    })
    const { day } = effectOf(w).windows
    expect(STRONG).not.toContain(day.same.strength)
    expect(STRONG).not.toContain(day.next.strength)
  })

  it('понедельник просто хуже — это не эффект вчерашнего выполнения', () => {
    const monday = (d: SimDay) => isoDow(addDays(TODAY, d.i - DAYS)) === 0
    const deltas = [30, 31, 32, 33, 34, 35, 36, 37, 38, 39].map((seed) => {
      const w = simulate(seed, {
        done: (d, rnd) => rnd() < (d.weekend ? 0.2 : 0.8),
        score: (d) => 7 - (monday(d) ? 2 : 0),
      })
      return effectOf(w).windows.day.next.delta
    })
    // без поправки на «вчера был выходной» среднее смещение около +0,6
    const mean = deltas.reduce((s, d) => s + d, 0) / deltas.length
    expect(Math.abs(mean)).toBeLessThan(0.25)
  })

  it.each([5, 6, 7, 8, 9])('полоса хороших дней не выдаётся за эффект назавтра (зерно %s)', (seed) => {
    const w = simulate(seed, {
      state: (prev, noise) => 0.8 * prev + 0.6 * noise,
      done: (d) => d.state > 0,
      score: (d) => 6 + 1.5 * d.state,
    })
    expect(['echo', 'flat', 'unclear']).toContain(effectOf(w).windows.day.next.strength)
  })

  it('оценка дня — среднее трёх шкал, а шкалы считаются и по отдельности', () => {
    const w = simulate(10, {
      done: coin,
      score: (_d, y) => ({ mood: 6, wellbeing: 6 + (y?.done ? 3 : 0), productivity: 6 }),
    })
    const { windows } = effectOf(w)

    expect(windows.wellbeing.next.delta).toBeCloseTo(3, 0)
    expect(windows.day.next.delta).toBeCloseTo(1, 0)
    // у настроения эффекта нет — вывода тоже: «без разницы» или «неясно», смотря по ширине интервала
    expect(['flat', 'unclear']).toContain(windows.mood.next.strength)
  })

  it('мало пропусков — вывода нет: в группе «без» меньше трёх дней', () => {
    // пропуски в дни 0 и 60: в окне «в тот же день» их один, в окне «назавтра» — два
    const w = simulate(11, { done: (d) => d.i % 60 !== 0, score: () => 6 })
    const { day } = effectOf(w).windows

    expect(day.same.strength).toBe('few')
    expect(day.next.strength).toBe('few')
  })

  it('четыре пропуска — уже не «мало данных»: ранний вывод считается с трёх дней в группе', () => {
    const w = simulate(11, { done: (d) => d.i % 25 !== 0, score: () => 6 })
    const { day } = effectOf(w).windows

    expect(day.same.strength).not.toBe('few')
    expect(day.next.strength).not.toBe('few')
  })

  it('две недели и крупный эффект назавтра — уже «возможно», а не «мало данных»', () => {
    const w = simulate(12, { done: coin, score: (_d, y) => 6 + (y?.done ? 2.5 : 0) }, 15)
    const e = effectOf(w, challenge({ startDate: dayKey(addDays(TODAY, -15)) }))

    // в группах меньше десяти дней: как бы чисто ни было, сильнее «возможно» не бывает
    expect(Math.min(e.windows.day.next.withDays, e.windows.day.next.withoutDays)).toBeLessThan(10)
    expect(e.windows.day.next.strength).toBe('possible')
    expect(e.windows.day.next.delta).toBeCloseTo(2.5, 0)
    expect(e.verdict).toBe('delayed')
    expect(e.confidence).toBe('possible')
  })

  it('дни в группах «с» и «без» складываются в число учтённых дней', () => {
    const e = effectOf(simulate(12, { done: coin, score: () => 6 }))

    expect(e.days).toBe(FULL)
    expect(e.windows.day.same.withDays + e.windows.day.same.withoutDays).toBe(FULL)
    expect(e.windows.day.next.withDays + e.windows.day.next.withoutDays).toBe(FULL)
  })

  it('день болезни выбрасывается вместе со следующим и считается отдельно', () => {
    const sick = new Set([10, 30, 50, 70, 90, 110])
    const w = simulate(13, { done: coin, score: () => 6, tags: (i) => (sick.has(i) ? ['болел'] : []) })
    const e = effectOf(w)

    expect(e.sickDays).toBe(12)
    expect(e.days).toBe(FULL - 12)
  })

  it('день без оценки в расчёт не идёт', () => {
    const w = simulate(14, { done: coin, score: () => 6 })
    const logs = w.logs.filter((_l, i) => ![20, 40, 60, 80, 100].includes(i))

    expect(effectOf({ ...w, logs }).days).toBe(FULL - 5)
  })

  it('удалённый челлендж участвует в расчёте своими днями до удаления', () => {
    const w = simulate(15, { done: coin, score: () => 6 })
    const gone = challenge({ deletedAt: deletedOn(dayKey(addDays(TODAY, -10))) })
    // удалён 10 дней назад: последняя строка — накануне удаления, ей нужен известный «завтра»
    expect(effectOf(w, gone).days).toBe(FULL - 9)
  })

  it('дни паузы не участвуют — ни как пропуск, ни как выполнение', () => {
    const w = simulate(16, { done: coin, score: () => 6 })
    const from = dayKey(addDays(TODAY, 40 - DAYS))
    const to = dayKey(addDays(TODAY, 59 - DAYS))

    // пауза на 20 дней выбивает их и по соседнему дню с каждой стороны
    expect(effectOf(w, challenge({ pauses: [{ from, to }] })).days).toBe(FULL - 22)
  })
})

/** Второй челлендж, который выполняется вместе с первым: совпадает с ним в доле `together` дней. */
function companion(entries: EntryMap, logs: DayLog[], seed: number, together: number): EntryMap {
  const rnd = mulberry32(seed)
  const out: EntryMap = {}
  for (const { day } of logs) {
    const done = rnd() < together ? entries[day] === 1 : rnd() < 0.5
    if (done) out[day] = 1
  }
  return out
}

describe('общий подъём или спад оценок', () => {
  /** Выход из выгорания: оценки за историю растут на четыре балла. */
  const rise = (d: SimDay) => 3 + (4 * d.i) / DAYS

  it('привычка учащается, пока оценки растут, — это не её эффект ни в тот же день, ни назавтра', () => {
    const w = simulate(80, { done: (d, rnd) => rnd() < 0.1 + (0.8 * d.i) / DAYS, score: rise })
    const { day } = effectOf(w).windows

    expect(WORDED).not.toContain(day.same.strength)
    expect(WORDED).not.toContain(day.next.strength)
  })

  it('настоящий эффект назавтра находится и при общем подъёме, даже если привычка учащается', () => {
    const w = simulate(81, {
      done: (d, rnd) => rnd() < 0.2 + (0.4 * d.i) / DAYS,
      score: (d, y) => rise(d) + (y?.done ? 1.5 : 0),
    })
    const { day } = effectOf(w).windows

    expect(STRONG).toContain(day.next.strength)
    expect(day.next.delta).toBeCloseTo(1.5, 0)
    expect(WORDED).not.toContain(day.same.strength)
  })
})

describe('сосед — челлендж, который делается вместе', () => {
  const a = challenge({ id: 'a', code: 'ШАГ' })
  const b = challenge({ id: 'b', code: 'ЧТН' })

  it('чужой эффект соседу не достаётся', () => {
    const w = simulate(20, { done: coin, score: (_d, y) => 6 + (y?.done ? 1.5 : 0) })
    const entries = { a: w.entries, b: companion(w.entries, w.logs, 21, 0.75) }
    const [ea, eb] = challengeEffects([a, b], entries, w.logs, TODAY)

    expect(STRONG).toContain(ea!.windows.day.next.strength)
    expect(STRONG).not.toContain(eb!.windows.day.next.strength)
    expect(eb!.partner?.id).toBe('a')
  })

  it('короткое совпадение не перебивает долгое: соседом становится тот, с кем история общая', () => {
    const w = simulate(27, { done: coin, score: (_d, y) => 6 + (y?.done ? 1.5 : 0) })
    const bEntries = companion(w.entries, w.logs, 28, 0.75)
    // C начат 20 дней назад и повторяет B день в день: φ = 1, но всего на двадцати днях
    const recent = dayKey(addDays(TODAY, -20))
    const cEntries = Object.fromEntries(Object.entries(bEntries).filter(([day]) => day >= recent))
    const c = challenge({ id: 'c', code: 'ОТЖ', startDate: recent })
    const [, eb] = challengeEffects([a, b, c], { a: w.entries, b: bEntries, c: cEntries }, w.logs, TODAY)

    expect(eb!.partner?.id).toBe('a')
    expect(STRONG).not.toContain(eb!.windows.day.next.strength)
  })

  it('без заметной совместности соседа нет', () => {
    const w = simulate(22, { done: coin, score: () => 6 })
    const entries = { a: w.entries, b: companion(w.entries, w.logs, 23, 0) }
    const [, eb] = challengeEffects([a, b], entries, w.logs, TODAY)

    expect(eb!.partner).toBeNull()
  })

  it('удалённый челлендж тоже может быть соседом — его история никуда не делась', () => {
    const w = simulate(24, { done: coin, score: () => 6 })
    const gone = challenge({ id: 'a', deletedAt: '2026-09-15T00:00:00.000Z' })
    const entries = { a: w.entries, b: companion(w.entries, w.logs, 25, 0.75) }
    const [, eb] = challengeEffects([gone, b], entries, w.logs, TODAY)

    expect(eb!.partner?.id).toBe('a')
  })
})

describe('verdictOf — вывод по двум окнам оценки дня', () => {
  const est = (strength: Strength, delta = 1): Estimate => ({
    delta, low: delta - 0.3, high: delta + 0.3, strength, withDays: 30, withoutDays: 30,
  })
  const pair = (same: Estimate, next: Estimate) => verdictOf({ same, next })

  it.each([
    ['likely', 'likely', 1, 'persists', 'likely'],
    ['likely', 'strong', 1, 'persists', 'sure'],
    ['likely', 'likely', -1, 'rebound', 'likely'],
    ['flat', 'likely', 1, 'delayed', 'likely'],
    ['unclear', 'strong', 1, 'delayed', 'sure'],
    ['few', 'likely', 1, 'delayed', 'likely'],
    ['likely', 'echo', 1, 'streak', null],
    ['flat', 'echo', 1, 'streak', null],
    ['likely', 'flat', 1, 'coincidence', null],
    ['flat', 'flat', 1, 'noEffect', null],
    ['unclear', 'flat', 1, 'unclear', null],
    ['likely', 'unclear', 1, 'sameDayOnly', null],
    ['likely', 'few', 1, 'sameDayOnly', null],
    ['flat', 'unclear', 1, 'unclear', null],
    ['unclear', 'unclear', 1, 'unclear', null],
    ['unclear', 'few', 1, 'unclear', null],
    ['few', 'few', 1, 'insufficient', null],
    ['tangled', 'tangled', 1, 'tangled', null],
    ['few', 'possible', 1, 'delayed', 'possible'],
    ['possible', 'possible', 1, 'persists', 'possible'],
    ['possible', 'possible', -1, 'rebound', 'possible'],
    ['likely', 'possible', 1, 'persists', 'possible'],
    ['possible', 'likely', 1, 'persists', 'likely'],
    ['possible', 'flat', 1, 'coincidence', null],
    ['possible', 'unclear', 1, 'sameDayOnly', null],
    ['possible', 'echo', 1, 'streak', null],
  ] as const)(
    'тот же день %s, назавтра %s (знак назавтра %s) → %s, уверенность %s',
    (same, next, sign, verdict, confidence) => {
      expect(pair(est(same), est(next, sign))).toEqual({ verdict, confidence })
    },
  )

  it('вывод челленджа строится по оценке дня, а не по отдельной шкале', () => {
    const w = simulate(26, {
      done: coin,
      score: (_d, y) => ({ mood: 6, wellbeing: 6 + (y?.done ? 3 : 0), productivity: 6 }),
    })
    const e = effectOf(w)

    expect(e.verdict).toBe('delayed')
    expect(e.confidence).not.toBeNull()
  })
})

describe('effectText — вывод словами', () => {
  const est = (strength: Strength, delta: number): Estimate => ({
    delta, low: delta - 0.3, high: delta + 0.3, strength, withDays: 30, withoutDays: 30,
  })

  it('держится и назавтра — с направлением', () => {
    const day = { same: est('likely', 1), next: est('strong', 1.2) }
    expect(effectText('persists', day, 'challenge')).toBe('дни лучше — и на следующий день тоже')
  })

  it('с задержкой и минусом — следующий день хуже', () => {
    const day = { same: est('flat', 0.1), next: est('likely', -1.4) }
    expect(effectText('delayed', day, 'tag')).toBe('следующий день хуже')
  })

  it('совпадение у челленджа объясняет, откуда связь', () => {
    const day = { same: est('likely', 1.5), next: est('flat', 0.1) }
    expect(effectText('coincidence', day, 'challenge')).toBe(
      'скорее совпадение: в хорошие дни делаешь чаще, назавтра следа нет',
    )
  })

  it('у тега совпадения нет — тег описывает сам день', () => {
    const day = { same: est('likely', -1.5), next: est('flat', 0.1) }
    expect(effectText('coincidence', day, 'tag')).toBe('связано только с самим днём')
  })

  it('полоса плохих дней называется полосой — без слова «похоже»: полоса бывает и на уровне «возможно»', () => {
    const day = { same: est('likely', -1), next: est('echo', -1) }
    expect(effectText('streak', day, 'challenge')).toBe('накануне оценки тоже ниже — это может быть полоса плохих дней')
  })

  it('мало данных — так и сказано', () => {
    const day = { same: est('few', 0), next: est('few', 0) }
    expect(effectText('insufficient', day, 'challenge')).toBe('мало данных')
  })
})

/** Дни истории, в которые стоит тег: шанс зависит от того, выходной ли день. */
function tagged(seed: number, chance: (weekend: boolean) => number): Set<number> {
  const rnd = mulberry32(seed)
  const out = new Set<number>()
  for (let i = 0; i < DAYS; i++) {
    if (rnd() < chance(isoDow(addDays(TODAY, i - DAYS)) >= 5)) out.add(i)
  }
  return out
}

const isWeekend = (i: number) => isoDow(addDays(TODAY, i - DAYS)) >= 5

describe('теги дня в двух окнах', () => {
  it('похмелье: тег бьёт не по своему дню, а по следующему', () => {
    const drank = tagged(40, (weekend) => (weekend ? 0.4 : 0.03))
    const w = simulate(41, {
      done: coin,
      score: (d) => 6 - (drank.has(d.i - 1) ? 2 : 0),
      tags: (i) => (drank.has(i) ? ['алкоголь'] : []),
    })
    const t = tagEffects(w.logs).find((e) => e.tag === 'алкоголь')!

    expect(t.verdict).toBe('delayed')
    expect(t.windows.day.next.delta).toBeLessThan(0)
    expect(effectText(t.verdict, t.windows.day, 'tag')).toBe('следующий день хуже')
  })

  it('тег на пяти днях сильнее «похоже» не бывает', () => {
    const quarrels = new Set([15, 35, 55, 75, 95])
    const w = simulate(42, {
      done: coin,
      score: (d) => 6 - (quarrels.has(d.i - 1) ? 3 : 0),
      tags: (i) => (quarrels.has(i) ? ['ссора'] : []),
    })
    const t = tagEffects(w.logs).find((e) => e.tag === 'ссора')!

    expect(t.tagDays).toBe(5)
    expect(t.windows.day.next.strength).not.toBe('few')
    expect(t.windows.day.next.strength).not.toBe('strong')
    expect(t.confidence).not.toBe('sure')
  })

  it('у тега «выходной» нет поправки на выходные — иначе он сравнивался бы сам с собой', () => {
    const w = simulate(43, {
      done: coin,
      score: (d) => 7 - (d.weekend ? 2 : 0),
      tags: (i) => (isWeekend(i) ? ['выходной'] : []),
    })
    const t = tagEffects(w.logs).find((e) => e.tag === 'выходной')!

    expect(t.windows.day.same.strength).toBe('likely')
    expect(t.windows.day.same.delta).toBeCloseTo(-2, 0)
  })

  it('тег «болел» анализируется, хотя в остальных расчётах дни болезни выбрасываются', () => {
    const sick = tagged(44, () => 0.12)
    const w = simulate(45, {
      done: coin,
      score: (d) => 6 - (sick.has(d.i) ? 3 : 0),
      tags: (i) => (sick.has(i) ? ['болел'] : []),
    })
    const t = tagEffects(w.logs).find((e) => e.tag === 'болел')!

    expect(t.sickDays).toBe(0)
    expect(t.windows.day.same.strength).toBe('likely')
  })

  it('редкий тег не показывается — два дня ничего не говорят', () => {
    const rare = new Set([10, 90])
    const w = simulate(46, { done: coin, score: () => 6, tags: (i) => (rare.has(i) ? ['дорога'] : []) })
    expect(tagEffects(w.logs).map((e) => e.tag)).not.toContain('дорога')
  })

  it('день без оценки — тег в нём неизвестен, а не отсутствует', () => {
    const often = tagged(47, () => 0.3)
    const w = simulate(48, { done: coin, score: () => 6, tags: (i) => (often.has(i) ? ['встречи'] : []) })
    const gaps = new Set([20, 40, 60, 80, 100])
    const logs = w.logs.filter((_l, i) => !gaps.has(i))

    // каждый пропуск выбивает сам день и соседние — там неизвестны «вчера» или «завтра»
    expect(tagEffects(logs).find((e) => e.tag === 'встречи')!.days).toBe(FULL - 15)
  })
})

describe('до и после старта — когда дни сравнить не с чем', () => {
  /** Отказ, начатый на 60-й день истории: срывов нет, поэтому окна «с/без» пусты. */
  const quit = (over: Partial<Challenge> = {}) =>
    challenge({ id: 'q', code: 'БСГ', kind: 'quit', startDate: dayKey(addDays(TODAY, 60 - DAYS)), ...over })
  /** Мир-ступенька: до старта оценки одни, после — другие. */
  const step = (seed: number, jump: number, tags?: (i: number) => string[]) =>
    simulate(seed, { done: coin, score: (d) => 5 + (d.i >= 60 ? jump : 0), tags })

  it('без пропусков сравнивает месяц до старта с месяцем после — и не сильнее «похоже»', () => {
    const w = step(50, 2)
    const [e] = challengeEffects([quit()], { q: {} }, w.logs, TODAY)

    expect(e!.verdict).toBe('insufficient')
    expect(e!.beforeAfter!.span).toBe(30)
    expect(e!.beforeAfter!.byMetric.day.strength).toBe('likely')
    expect(e!.beforeAfter!.byMetric.day.delta).toBeCloseTo(2, 0)
  })

  it('пока есть с чем сравнить дни, «до/после» не считается', () => {
    const w = step(51, 2)
    const c = challenge({ startDate: dayKey(addDays(TODAY, 60 - DAYS)) })
    const [e] = challengeEffects([c], { c1: w.entries }, w.logs, TODAY)

    expect(e!.verdict).not.toBe('insufficient')
    expect(e!.beforeAfter).toBeNull()
  })

  it('без оценок до старта сравнивать не с чем', () => {
    const w = step(52, 2)
    const logs = w.logs.filter((_l, i) => i >= 60)

    expect(beforeAfter(quit(), [quit()], logs, TODAY).byMetric.day.strength).toBe('few')
  })

  it('окно «до/после» короче десяти дней — «мало данных»: ранний порог сюда не переносится', () => {
    const w = step(53, 2)
    const late = quit({ startDate: dayKey(addDays(TODAY, -8)) })
    const ba = beforeAfter(late, [late], w.logs, TODAY)

    expect(ba.span).toBe(8)
    expect(ba.byMetric.day.strength).toBe('few')
  })

  it('окно не длиннее того, что прошло после старта', () => {
    const w = step(53, 2)
    const late = quit({ startDate: dayKey(addDays(TODAY, -12)) })

    // прошло 12 дней: окна по 12 дней с каждой стороны
    expect(beforeAfter(late, [late], w.logs, TODAY).span).toBe(12)
  })

  it('начатые почти одновременно не разделить — вывод не сильнее «неясно»', () => {
    const w = step(54, 2)
    const other = challenge({ id: 'o', code: 'ШАГ', startDate: dayKey(addDays(TODAY, 58 - DAYS)) })
    const ba = beforeAfter(quit(), [quit(), other], w.logs, TODAY)

    expect(ba.inseparableFrom.map((c) => c.id)).toEqual(['o'])
    expect(ba.byMetric.day.strength).toBe('unclear')
  })

  it('старт другого челленджа внутри окна отмечается, но вывод не гасит', () => {
    const w = step(55, 2)
    const other = challenge({ id: 'o', code: 'ЧТН', startDate: dayKey(addDays(TODAY, 45 - DAYS)) })
    const ba = beforeAfter(quit(), [quit(), other], w.logs, TODAY)

    expect(ba.overlaps.map((c) => c.id)).toEqual(['o'])
    expect(ba.inseparableFrom).toEqual([])
    expect(ba.byMetric.day.strength).toBe('likely')
  })

  it('дни болезни в сравнение не идут', () => {
    const sick = new Set([40, 70])
    const w = step(56, 2, (i) => (sick.has(i) ? ['болел'] : []))
    const ba = beforeAfter(quit(), [quit()], w.logs, TODAY)

    // каждая болезнь выбивает свой день и следующий
    expect(ba.daysBefore).toBe(28)
    expect(ba.daysAfter).toBe(28)
  })
})

describe('классы окна — где проходят границы', () => {
  const clean = (se: number, level = 0.995) => ({ lead: { delta: 0, se }, diffSe: se, level })

  it('«без разницы» — только когда весь интервал внутри полубалла, иначе «неясно»', () => {
    expect(strengthOf({ delta: 0.2, se: 0.1 }, 30, 30, 10, null).strength).toBe('flat')
    expect(strengthOf({ delta: 0.2, se: 0.5 }, 30, 30, 10, null).strength).toBe('unclear')
  })

  it('устойчивая, но меньше полубалла разница — «неясно», а не «похоже»', () => {
    expect(strengthOf({ delta: 0.4, se: 0.1 }, 30, 30, 10, null).strength).toBe('unclear')
  })

  it('«уверенно» — только по 99%: чистая лишь на 95% разница остаётся «похоже»', () => {
    // t = 2,4: выше квантиля 95% при 29 степенях (2,05), ниже 99% (2,76)
    expect(strengthOf({ delta: 1, se: 1 / 2.4 }, 30, 30, 10, clean(1 / 2.4)).strength).toBe('likely')
    expect(strengthOf({ delta: 1, se: 1 / 3.5 }, 30, 30, 10, clean(1 / 3.5)).strength).toBe('strong')
  })

  it('для отдельной шкалы порог строже — поправка на три шкалы', () => {
    expect(strictLevel('day')).toBe(0.995)
    expect(strictLevel('wellbeing')).toBeCloseTo(1 - 0.01 / 6, 10)
    // t = 3: выше 99% (2,76), ниже 99,67% (≈3,2)
    const est = { delta: 1, se: 1 / 3 }
    expect(strengthOf(est, 30, 30, 10, clean(1 / 3, strictLevel('day'))).strength).toBe('strong')
    expect(strengthOf(est, 30, 30, 10, clean(1 / 3, strictLevel('mood'))).strength).toBe('likely')
  })

  it('назавтра не отличить от накануне — «уверенно» не бывает, даже если от нуля отличие чистое', () => {
    const e = strengthOf({ delta: 1, se: 1 / 3.5 }, 30, 30, 10, {
      lead: { delta: 0.6, se: 0.4 },
      diffSe: 0.5,
      level: 0.995,
    })
    // t = 3,5 — чисто и по 99%, но разница с накануне 0,4 при ошибке 0,5 не значима
    expect(e.strength).toBe('likely')
  })

  it('накануне оценки тоже заметно выше — это полоса', () => {
    const e = strengthOf({ delta: 1, se: 1 / 3.5 }, 30, 30, 10, {
      lead: { delta: 0.9, se: 0.2 },
      diffSe: 0.3,
      level: 0.995,
    })
    expect(e.strength).toBe('echo')
  })

  it('«уверенно» требует десяти дней в группе и у тегов, которые показываются с четырёх', () => {
    expect(strengthOf({ delta: 2, se: 0.2 }, 6, 100, 4, clean(0.2)).strength).toBe('likely')
  })

  it('степени свободы — по меньшей группе: двенадцать дней «с» дают 11, а не сотню', () => {
    // t = 2,1: при 11 степенях (2,20) 95% интервал задевает ноль, при сотне (1,98) — уже нет;
    // «возможно» при двенадцати днях в группе не ставится
    expect(strengthOf({ delta: 1, se: 1 / 2.1 }, 12, 100, 10, null).strength).toBe('unclear')
  })

  it('«возможно» — между 70% и 95%, пока дней мало: ранний вывод, в том числе назавтра', () => {
    // шесть дней в группе, 5 степеней: t = 1,5 — выше квантиля 85% (1,16), ниже 97,5% (2,57)
    expect(strengthOf({ delta: 1, se: 1 / 1.5 }, 6, 30, 10, null).strength).toBe('possible')
    expect(strengthOf({ delta: 1, se: 1 / 1.5 }, 6, 30, 10, clean(1 / 1.5)).strength).toBe('possible')
  })

  it('с десяти дней в группе «возможно» не ставится — и у тега: на длинной истории это чаще шум', () => {
    // t = 1,5 — ниже 95% при 29 и при 9 степенях
    expect(strengthOf({ delta: 1, se: 1 / 1.5 }, 30, 30, 10, null).strength).toBe('unclear')
    expect(strengthOf({ delta: 1, se: 1 / 1.5 }, 10, 100, 10, clean(1 / 1.5)).strength).toBe('unclear')
    // у тега «похоже» с четырёх дней, а «возможно» — тоже только до десяти
    expect(strengthOf({ delta: 1, se: 1 / 1.5 }, 12, 100, 4, null).strength).toBe('unclear')
    expect(strengthOf({ delta: 1, se: 1 / 1.5 }, 6, 100, 4, null).strength).toBe('possible')
  })

  it('ниже 70% — «неясно»', () => {
    // t = 0,9 — ниже 1,16
    expect(strengthOf({ delta: 1, se: 1 / 0.9 }, 6, 30, 10, null).strength).toBe('unclear')
  })

  it('разница меньше полубалла не становится и «возможно»', () => {
    // t = 1,33 — выше 1,16, но разница 0,4
    expect(strengthOf({ delta: 0.4, se: 0.3 }, 6, 30, 10, null).strength).toBe('unclear')
  })

  it('ранний вывод — с трёх дней в группе, при двух — «мало данных»', () => {
    expect(strengthOf({ delta: 2, se: 0.2 }, 2, 100, 10, null).strength).toBe('few')
    expect(strengthOf({ delta: 2, se: 0.2 }, 3, 100, 10, null).strength).toBe('possible')
  })

  it('«похоже» у челленджа — с десяти дней в группе: при шести тот же чистый результат — «возможно»', () => {
    expect(strengthOf({ delta: 2, se: 0.2 }, 6, 100, 10, clean(0.2)).strength).toBe('possible')
    expect(strengthOf({ delta: 2, se: 0.2 }, 10, 100, 10, clean(0.2)).strength).toBe('strong')
  })

  it('полоса ловится и на уровне «возможно»: накануне заметно по 70% и назавтра от него не отличить', () => {
    const early = { delta: 1, se: 1 / 1.5 }
    // шесть дней в группе; накануне: t = 0,9 / 0,75 = 1,2 — выше 1,16, но ниже 2,57
    expect(strengthOf(early, 6, 30, 10, { lead: { delta: 0.9, se: 0.75 }, diffSe: 0.8, level: 0.995 }).strength).toBe('echo')
    // накануне почти ничего: ранний вывод остаётся
    expect(strengthOf(early, 6, 30, 10, { lead: { delta: 0.2, se: 0.75 }, diffSe: 0.8, level: 0.995 }).strength).toBe('possible')
  })

  it('отличие от накануне для «возможно» — тоже по 70%: по 95% не отличить, по 70% — отличить, и это не полоса', () => {
    const early = { delta: 1, se: 1 / 1.5 }
    // накануне заметно по 70% (0,5 > 1,16 · 0,4); разница с ним 0,5 — выше 1,16 · 0,4, но ниже 2,57 · 0,4
    expect(strengthOf(early, 6, 30, 10, { lead: { delta: 0.5, se: 0.4 }, diffSe: 0.4, level: 0.995 }).strength).toBe('possible')
  })

  it('«уверенно» требует отличия от накануне по 95%, а не по 70%', () => {
    // чисто по 99%; разница с накануне 0,8 — выше 1,06 · 0,5, но ниже 2,05 · 0,5
    const e = strengthOf({ delta: 1, se: 1 / 3.5 }, 30, 30, 10, { lead: { delta: 0.2, se: 0.4 }, diffSe: 0.5, level: 0.995 })
    expect(e.strength).toBe('likely')
  })
})

describe('вырожденные случаи — не «мало данных» при полных данных', () => {
  const a = challenge({ id: 'a', code: 'ШАГ' })
  const b = challenge({ id: 'b', code: 'ЧТН' })

  it('два челленджа всегда вместе: эффект виден, но чей — не сказать, поэтому не «уверенно»', () => {
    const w = simulate(60, { done: coin, score: (_d, y) => 6 + (y?.done ? 1.5 : 0) })
    const [ea] = challengeEffects([a, b], { a: w.entries, b: { ...w.entries } }, w.logs, TODAY)

    expect(ea!.verdict).not.toBe('insufficient')
    expect(STRONG).toContain(ea!.windows.day.next.strength)
    expect(ea!.confidence).toBe('likely')
    expect(ea!.twin?.id).toBe('b')
    expect(ea!.partner).toBeNull()
    expect(ea!.beforeAfter).toBeNull()
  })

  it('недавний челлендж с одним совпадением соседом не становится', () => {
    // последние 12 дней давний выполнен дважды, новый — один раз, в один из них: φ = 0,67
    const tail = (d: SimDay) => d.i >= DAYS - 12
    const w = simulate(61, {
      done: (d, rnd) => (tail(d) ? d.i === DAYS - 10 || d.i === DAYS - 5 : rnd() < 0.5),
      score: (_d, y) => 6 + (y?.done ? 1.5 : 0),
    })
    const recent = dayKey(addDays(TODAY, -12))
    const once = dayKey(addDays(TODAY, -10))
    const fresh = challenge({ id: 'c', code: 'НОВ', startDate: recent })
    const [ea] = challengeEffects([a, fresh], { a: w.entries, c: { [once]: 1 } }, w.logs, TODAY)

    expect(ea!.partner).toBeNull()
    expect(STRONG).toContain(ea!.windows.day.next.strength)
  })

  it('привычка через день: тот же день и следующий не разделить — и это не «мало данных»', () => {
    const w = simulate(62, { done: (d) => d.i % 2 === 0, score: (_d, y) => 6 + (y?.done ? 1.5 : 0) })
    const e = effectOf(w)

    expect(e.windows.day.next.strength).toBe('tangled')
    expect(e.verdict).toBe('tangled')
    expect(e.beforeAfter).toBeNull()
  })

  it('привычка через день на двух неделях — тоже «не разделить», а не «мало данных»', () => {
    const w = simulate(62, { done: (d) => d.i % 2 === 0, score: (_d, y) => 6 + (y?.done ? 1.5 : 0) }, 15)
    const e = effectOf(w, challenge({ startDate: dayKey(addDays(TODAY, -15)) }))

    expect(e.windows.day.next.strength).toBe('tangled')
    expect(e.verdict).toBe('tangled')
  })

  it('тег, который стоит на всех выходных, не выдаётся за «мало данных»', () => {
    const w = simulate(63, {
      done: coin,
      score: (d) => 7 - (d.weekend ? 1 : 0),
      tags: (i) => (isWeekend(i) ? ['отдых'] : []),
    })
    const t = tagEffects(w.logs).find((e) => e.tag === 'отдых')!

    expect(t.verdict).not.toBe('insufficient')
    expect(t.windows.day.same.strength).not.toBe('few')
  })
})

describe('до и после старта — оговорки расчёта', () => {
  const quit = (over: Partial<Challenge> = {}) =>
    challenge({ id: 'q', code: 'БСГ', kind: 'quit', startDate: dayKey(addDays(TODAY, 60 - DAYS)), ...over })
  const step = (seed: number, jump: number) =>
    simulate(seed, { done: coin, score: (d) => 5 + (d.i >= 60 ? jump : 0) })

  it('у удалённого окно «после» кончается днём удаления', () => {
    const gone = quit({ deletedAt: deletedOn(dayKey(addDays(TODAY, 70 - DAYS))) })
    // начат на 60-й день, удалён на 70-й: у него одиннадцать своих дней
    expect(beforeAfter(gone, [gone], step(69, 2).logs, TODAY).span).toBe(11)
  })

  it('дни паузы в окне «после» в сравнение не идут', () => {
    const from = dayKey(addDays(TODAY, 65 - DAYS))
    const to = dayKey(addDays(TODAY, 69 - DAYS))
    const ba = beforeAfter(quit({ pauses: [{ from, to }] }), [quit()], step(57, 2).logs, TODAY)
    expect(ba.daysAfter).toBe(25)
  })

  it('окно не заходит за финиш — срочный челлендж сравнивается только своими днями', () => {
    const short = quit({ lengthDays: 10 })
    expect(beforeAfter(short, [short], step(58, 2).logs, TODAY).span).toBe(10)
  })

  it('финиш другого челленджа внутри окна тоже отмечается', () => {
    const other = challenge({
      id: 'o',
      code: 'ОТЖ',
      startDate: dayKey(addDays(TODAY, 20 - DAYS)),
      lengthDays: 30,
    })
    const ba = beforeAfter(quit(), [quit(), other], step(59, 2).logs, TODAY)
    expect(ba.overlaps.map((c) => c.id)).toEqual(['o'])
  })

  it('«до/после» не даёт «возможно»: это сравнение и так смещено возвратом к норме', () => {
    const w = simulate(77, { state: (_p, noise) => 1.5 * noise, done: coin, score: (d) => 5 + (d.i >= 60 ? 0.6 : 0) + d.state })
    const ba = beforeAfter(quit(), [quit()], w.logs, TODAY)
    const day = ba.byMetric.day
    const df = Math.max(3, Math.min(ba.daysBefore, ba.daysAfter) - 1)
    const t = Math.abs(day.delta) / ((day.high - day.delta) / tQuantile(0.975, df))

    // разница — в полосе «возможно»: не меньше полубалла, 70% интервал ноль не задевает, 95% — задевает
    expect(Math.abs(day.delta)).toBeGreaterThanOrEqual(0.5)
    expect(t).toBeGreaterThan(tQuantile(0.85, df))
    expect(t).toBeLessThan(tQuantile(0.975, df))
    expect(day.strength).toBe('unclear')
  })

  it('«до/после» не подменяет выводы, которые просто неясны', () => {
    const w = simulate(64, { state: (_p, noise) => 2.5 * noise, done: coin, score: (d) => 6 + d.state })
    const e = effectOf(w)

    expect(e.verdict).toBe('unclear')
    expect(e.beforeAfter).toBeNull()
  })

  it('полосы в данных расширяют интервал «до/после»: месяц с полосами стоит меньше', () => {
    const w = simulate(65, {
      state: (prev, noise) => 0.8 * prev + 0.6 * noise,
      done: coin,
      score: (d) => 5 + (d.i >= 60 ? 1 : 0) + 1.5 * d.state,
    })
    const ba = beforeAfter(quit(), [quit()], w.logs, TODAY)

    // наивный Уэлч по тем же дням: 30–59 и 60–89
    const dayScore = (l: DayLog) => (l.mood + l.wellbeing + l.productivity) / 3
    const before = w.logs.slice(30, 60).map(dayScore)
    const after = w.logs.slice(60, 90).map(dayScore)
    const variance = (v: number[]) => {
      const m = v.reduce((s, x) => s + x, 0) / v.length
      return v.reduce((s, x) => s + (x - m) ** 2, 0) / (v.length - 1)
    }
    const naive = 2 * tQuantile(0.975, 29) * Math.sqrt(variance(before) / 30 + variance(after) / 30)

    expect(ba.byMetric.day.high - ba.byMetric.day.low).toBeGreaterThan(1.5 * naive)
  })
})

describe('порог показа тегов', () => {
  it('тег на трёх днях уже показывается — ранний вывод считается с трёх', () => {
    const three = new Set([15, 45, 75])
    const w = simulate(66, { done: coin, score: () => 6, tags: (i) => (three.has(i) ? ['дорога'] : []) })
    expect(tagEffects(w.logs).map((e) => e.tag)).toContain('дорога')
  })
})

describe('до и после старта — почему сравнивать не с чем', () => {
  it('начат сегодня: прошедших дней нет, а оценки до старта есть', () => {
    const w = simulate(67, { done: coin, score: () => 6 })
    const fresh = challenge({ id: 'n', kind: 'quit', startDate: dayKey(TODAY) })
    const ba = beforeAfter(fresh, [fresh], w.logs, TODAY)

    expect(ba.sinceStart).toBe(0)
    expect(ba.beforeStart).toBeGreaterThan(0)
  })

  it('до старта оценок нет: прошедшие дни есть, а сравнивать не с чем', () => {
    const w = simulate(68, { done: coin, score: () => 6 })
    const first = challenge({ id: 'f', kind: 'quit', startDate: dayKey(addDays(TODAY, -DAYS)) })
    const ba = beforeAfter(first, [first], w.logs, TODAY)

    expect(ba.sinceStart).toBeGreaterThan(0)
    expect(ba.beforeStart).toBe(0)
  })
})

/** День с «энергией»: хорошие дни идут полосами, и в хорошие дни челлендж делается чаще. */
const energetic = {
  state: (prev: number, noise: number) => 0.6 * prev + noise,
  done: (d: SimDay, rnd: () => number) => rnd() < (d.state > 0 ? 0.85 : 0.15),
}

describe('утро — база окна «в тот же день» у челленджей', () => {
  it('хорошие дни тянут выполнение: без утра «в тот же день» похоже на эффект, при том же утре — нет', () => {
    const w = simulate(41, {
      ...energetic,
      score: (d) => 6 + 1.2 * d.state,
      morning: (d, _y, rnd) => wake(6 + 1.2 * d.state, rnd),
    })
    const plain = effectOf(w)
    const based = morningEffectOf(w)

    expect(STRONG).toContain(plain.windows.day.same.strength)
    expect(based.morningBase).toBe(true)
    expect(WORDED).not.toContain(based.windows.day.same.strength)
  })

  it('настоящий эффект в тот же день при том же утре остаётся', () => {
    const w = simulate(42, {
      state: energetic.state,
      done: coin,
      score: (d) => 6 + 1.2 * d.state + (d.done ? 1.5 : 0),
      morning: (d, _y, rnd) => wake(6 + 1.2 * d.state, rnd),
    })
    const e = morningEffectOf(w)

    expect(e.morningBase).toBe(true)
    expect(e.windows.day.same.strength).toBe('likely')
    expect(e.windows.day.same.delta).toBeCloseTo(1.5, 0)
  })

  it('«назавтра», вывод и слово с утрами те же, что без утр: для вчерашнего челленджа утро — уже результат', () => {
    const w = simulate(43, {
      state: energetic.state,
      done: (d, rnd) => rnd() < (d.state > 0 ? 0.7 : 0.3),
      score: (d, y) => 6 + 1.2 * d.state + (y?.done ? 1.5 : 0),
      morning: (d, y, rnd) => wake(6 + 1.2 * d.state + (y?.done ? 1.5 : 0), rnd),
      tags: (i) => (i % 5 === 0 ? ['дорога'] : []),
    })
    const plain = effectOf(w)
    const based = morningEffectOf(w)

    expect(STRONG).toContain(based.windows.day.next.strength)
    for (const metric of METRICS) expect(based.windows[metric].next).toEqual(plain.windows[metric].next)
    expect(based.confidence).toBe(plain.confidence)

    const evening = (tags: ReturnType<typeof tagEffects>) =>
      tags.filter((t) => t.tag === 'дорога').map((t) => [t.windows, t.verdict, t.confidence])
    expect(evening(tagEffects(w.logs, w.starts))).toEqual(evening(tagEffects(w.logs)))
  })

  it('без утр — как раньше: пустой список тот же, что без параметра; строки «Утро» нет', () => {
    const w = simulate(44, { ...energetic, score: (d) => 6 + 1.2 * d.state })
    const c = challenge()
    expect(challengeEffects([c], { [c.id]: w.entries }, w.logs, TODAY, [])).toEqual(
      challengeEffects([c], { [c.id]: w.entries }, w.logs, TODAY),
    )
    const e = effectOf(w)
    expect(e.morningBase).toBe(false)
    expect(e.morning).toBeNull()
  })

  it('все утра пропущены — поправки нет и строки «Утро» нет', () => {
    const w = simulate(44, { ...energetic, score: (d) => 6 + 1.2 * d.state, morning: () => null })
    const e = morningEffectOf(w)
    expect(e.morningBase).toBe(false)
    expect(e.morning).toBeNull()
    expect(e.windows).toEqual(effectOf(w).windows)
  })

  it('утро меньше чем в двух третях дней — окно «в тот же день» без поправки', () => {
    const w = simulate(45, {
      ...energetic,
      score: (d) => 6 + 1.2 * d.state,
      morning: (d, _y, rnd) => (d.i % 2 === 0 ? wake(6 + 1.2 * d.state, rnd) : null),
    })
    const e = morningEffectOf(w)
    expect(e.morningBase).toBe(false)
    expect(e.windows.day.same).toEqual(effectOf(w).windows.day.same)
  })

  it('строк сверх столбцов меньше пяти — окно «в тот же день» без поправки', () => {
    // 14 дней: 12 строк при 8 столбцах модели с утром — она решается, но запаса мало.
    const length = 14
    const c = challenge({ startDate: dayKey(addDays(TODAY, -length)) })
    const w = simulate(46, { ...energetic, score: (d) => 6 + 1.2 * d.state, morning: (d, _y, rnd) => wake(6 + 1.2 * d.state, rnd) }, length)
    const e = morningEffectOf(w, c)
    expect(e.morningBase).toBe(false)
    expect(e.windows.day.same).toEqual(effectOf(w, c).windows.day.same)
  })

  it('утро всегда одно и то же — поправлять не на что', () => {
    const w = simulate(47, {
      ...energetic,
      score: (d) => 6 + 1.2 * d.state,
      morning: () => ({ sleep: 7, wellbeing: 6, mood: 6 }),
    })
    expect(morningEffectOf(w).morningBase).toBe(false)
  })

  it('утро пропускают в плохие дни — слова те же, а связь «в тот же день» всё равно слабее вдвое', () => {
    // Пропуски не случайны: оставшиеся утра — дни получше, и поправка работает хуже. На 300 зёрнах
    // этого мира ложное «похоже» в тот же день — 13% миров против 8% при утре каждый день и 98%
    // без утра; связь при том же утре слабее вдвое в 99% миров.
    const w = simulate(49, {
      ...energetic,
      score: (d) => 6 + 1.2 * d.state,
      morning: (d, _y, rnd) => (d.state < -1 ? null : wake(6 + 1.2 * d.state, rnd)),
    })
    const plain = effectOf(w)
    const e = morningEffectOf(w)
    expect(e.morningBase).toBe(true)
    expect(e.confidence).toBe(plain.confidence)
    expect(Math.abs(e.windows.day.same.delta)).toBeLessThan(Math.abs(plain.windows.day.same.delta) / 2)
  })
})

describe('строка «Утро» — справочно, слов не даёт', () => {
  it('вчерашнее выполнение видно утром — но не сильнее «похоже»', () => {
    const w = simulate(48, {
      done: coin,
      score: (_d, y) => 6 + (y?.done ? 2.5 : 0),
      morning: (_d, y, rnd) => wake(6 + (y?.done ? 2.5 : 0), rnd),
    })
    const e = morningEffectOf(w)
    expect(e.windows.day.next.strength).toBe('strong')
    expect(e.morning!.next.strength).toBe('likely')
    expect(e.morning!.next.delta).toBeCloseTo(2.5, 0)
    expect(e.confidence).toBe('sure')
  })

  it('в дни выполнения утро и так лучше — хорошие дни сами тянут выполнение', () => {
    const w = simulate(41, {
      ...energetic,
      score: (d) => 6 + 1.2 * d.state,
      morning: (d, _y, rnd) => wake(6 + 1.2 * d.state, rnd),
    })
    const e = morningEffectOf(w)
    expect(e.morning!.same.strength).toBe('likely')
    expect(e.morning!.same.delta).toBeGreaterThan(0)
  })

  it('у тегов строка «Утро» тоже есть: после вечернего тега утро назавтра хуже', () => {
    const drinks = new Set(Array.from({ length: 30 }, (_, k) => 3 + k * 4))
    const w = simulate(50, {
      done: coin,
      score: (_d, y) => 6 - (y && drinks.has(y.i) ? 1.5 : 0),
      tags: (i) => (drinks.has(i) ? ['алкоголь'] : []),
      morning: (_d, y, rnd) => wake(6 - (y && drinks.has(y.i) ? 2 : 0), rnd),
    })
    const beer = tagEffects(w.logs, w.starts).find((t) => t.tag === 'алкоголь')!
    expect(WORDED).toContain(beer.morning!.next.strength)
    expect(beer.morning!.next.delta).toBeLessThan(0)
    expect(tagEffects(w.logs).find((t) => t.tag === 'алкоголь')!.morning).toBeNull()
  })
})
