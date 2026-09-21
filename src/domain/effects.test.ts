import { describe, expect, it } from 'vitest'
import { addDays, dayKey, isoDow, parseDay } from './date'
import { beforeAfter, challengeEffects, effectText, tagEffects, verdictOf, type Estimate, type Strength } from './effects'
import type { Challenge, DayLog, EntryMap, ScoreField } from './types'

const TODAY = parseDay('2026-09-21')
/** Сколько дней истории у синтетического мира: с TODAY−120 по вчера. */
const DAYS = 120
/** Строк в расчёте без потерь: у первого дня нет «вчера», у вчерашнего — известного «завтра». */
const FULL = DAYS - 2

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
 */
function simulate(
  seed: number,
  rules: {
    state?: (prev: number, noise: number) => number
    done: (d: SimDay, rnd: () => number) => boolean
    score: (d: SimDay, yesterday: SimDay | undefined) => number | Scores
    tags?: (i: number) => string[]
  },
): { entries: EntryMap; logs: DayLog[] } {
  const rnd = mulberry32(seed)
  const days: SimDay[] = []
  let state = 0
  for (let i = 0; i < DAYS; i++) {
    const date = addDays(TODAY, i - DAYS)
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
  return { entries, logs }
}

const effectOf = (w: { entries: EntryMap; logs: DayLog[] }, c = challenge()) =>
  challengeEffects([c], { [c.id]: w.entries }, w.logs, TODAY)[0]!

const coin = (_d: SimDay, rnd: () => number) => rnd() < 0.5
const STRONG = ['likely', 'strong']

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

  it('ритм недели не выдаётся за эффект: выполняю в будни, а выходные просто хуже', () => {
    const w = simulate(4, {
      done: (d, rnd) => rnd() < (d.weekend ? 0.1 : 0.8),
      score: (d) => 7 - (d.weekend ? 2 : 0),
    })
    expect(STRONG).not.toContain(effectOf(w).windows.day.next.strength)
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
    expect(windows.mood.next.strength).toBe('flat')
  })

  it('мало пропусков — вывода нет: в группе «без» меньше десяти дней', () => {
    const w = simulate(11, { done: (d) => d.i % 25 !== 0, score: () => 6 })
    const { day } = effectOf(w).windows

    expect(day.same.strength).toBe('few')
    expect(day.next.strength).toBe('few')
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

  it('удалённый челлендж участвует в расчёте — статистика его помнит', () => {
    const w = simulate(15, { done: coin, score: () => 6 })
    expect(effectOf(w, challenge({ deletedAt: '2026-09-15T00:00:00.000Z' })).days).toBe(FULL)
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

  it('полоса плохих дней называется полосой плохих дней', () => {
    const day = { same: est('likely', -1), next: est('echo', -1) }
    expect(effectText('streak', day, 'challenge')).toBe(
      'похоже на полосу плохих дней: накануне оценки тоже ниже',
    )
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

  it('редкий тег не показывается — три дня ничего не говорят', () => {
    const rare = new Set([10, 50, 90])
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
