import { describe, expect, it } from 'vitest'
import { mulberry32 } from '@/data/seeds/common'
import { addDays, dayKey, isoDow, parseDay } from './date'
import { ladder, links, type Link } from './links'
import { lateFrom, type Goal } from './overview'
import type { TimelineDay } from './timeline'

/*
 * Приёмка связей по многим мирам (правило проекта: частоты, пороги заданы до прогона — план среза 2,
 * одобрен Georgy 24.09). Миры — 56 дней с фоном тегов, как в сиде `full`, пропусками утр (случайными и
 * в плохие дни) и незакрытыми вечерами. Порог не подбирается под зерно: упало — выяснять причину.
 * После ревью (24.09): в нулевых мирах — и «любая показанная связь не больше 10 % просмотров» (решение
 * Georgy), и карточка алкоголя в мире «через выходные» — он тоже нулевой: без поправки на выходные карточка
 * там была в 67 % миров, а метрика «без оговорки» этого не видела.
 * Срез 4 (24.09): у миров есть ночи — своей случайной последовательностью, чтобы теги и утра не сдвинулись.
 * Отбой — 23:30 ± шум, позже в ночь на выходные и после алкоголя (как в сиде); поздний — с порога страницы
 * (`lateFrom` для окна в 14 дней). Пороги позднего отбоя — те же, что у тегов, заданы до прогона.
 * Срез 5б (§8 договора): новые фоновые теги (игры, стресс, работа допоздна) и ступень алкоголя 1…3 —
 * каждый из своей последовательности (`seed + 5_555_555`, 3 числа в день; `seed + 3_333_333`, 1 число
 * в день), всегда, вне зависимости от ветвлений старой `rnd`: старые миры (зёрна, тесты выше) не сдвигаются.
 * `WORLDS` берётся из окружения, чтобы приёмку можно было прогнать шире без правки файла.
 */

/* типов node в сборке нет (tsconfig.app.json): окружение Vitest — только здесь */
declare const process: { env: Record<string, string | undefined> }
const WORLDS = Number(process.env.WORLDS ?? 500)
const TODAY = parseDay('2026-09-23')

type Scenario = {
  /** Вероятность тега «алкоголь» вечером: будни (пн–чт), пт / сб, вс. */
  drink: { weekday: number; friSat: number; sun: number }
  /** Сдвиг утра (и сна) после вечера с алкоголем. */
  effect: number
  /** Сдвиг утра выходного (сб, вс) самого по себе. */
  weekendShift: number
  /** Сдвиг сна утром выходного. */
  weekendSleep?: number
  /** Сдвиг сна после ночи с отбоем с 00:30 и позже. */
  lateEffect?: number
  /** На сколько минут позже ложится после алкоголя и в ночь на выходной. */
  drinkLate?: number
  weekendLate?: number
  /** Срез 5б: сдвиг утра и сна после алкоголя по ступени 1…3 — вместо `effect`, если задано. */
  effectByLevel?: [number, number, number]
  /** Срез 5б: ступень по числу из своей последовательности; `weekendNext` — утро, на которое действует доза, выходное. Нет — равновероятно 1…3 по `u`. */
  levelOf?: (weekendNext: boolean, u: number) => 1 | 2 | 3
}

const BACKGROUND: [tag: string, weekday: number, weekend: number][] = [
  ['дедлайн', 0.22, 0],
  ['встречи', 0.2, 0],
  ['учёба', 0.12, 0.12],
  ['дорога', 0.1, 0.1],
  ['болел', 0.07, 0.07],
  ['ссора', 0.06, 0.06],
  ['отдых', 0, 0.25],
  ['выходной', 0, 0.75],
]

/** Срез 5б (§7 договора, частоты «как у демо»): будни / выходные. Своя последовательность — не BACKGROUND. */
const BACKGROUND_5B: [tag: string, weekday: number, weekend: number][] = [
  ['игры', 0.15, 0.35],
  ['стресс', 0.15, 0.05],
  ['работа допоздна', 0.12, 0],
]

/** Обычный отбой 23:30, поздний в мире — с 00:30 (как порог страницы при таком обычном). */
const USUAL_BED = -30
const LATE_AT = 30

function world(seed: number, s: Scenario): TimelineDay[] {
  const rnd = mulberry32(seed)
  const nightRnd = mulberry32(seed + 7_777_777)
  /* срез 5б: новые фоновые теги и ступень алкоголя — свои последовательности, не трогают rnd/nightRnd */
  const bgRnd = mulberry32(seed + 5_555_555)
  const levelRnd = mulberry32(seed + 3_333_333)
  const len = 56
  const out: TimelineDay[] = []
  let drankBefore = false
  let drankLevel: 1 | 2 | 3 | undefined
  for (let i = 0; i < len; i++) {
    const date = addDays(TODAY, i - len + 1)
    const dow = isoDow(date)
    const weekend = dow >= 5
    const noise = (nightRnd() + nightRnd() + nightRnd() - 1.5) * 2
    const bed = Math.round(USUAL_BED + noise * 45 + (weekend ? (s.weekendLate ?? 45) : 0) + (drankBefore ? (s.drinkLate ?? 90) : 0))
    const late = bed >= LATE_AT
    /* срез 5б: без ступени эффект тот же, что раньше (`s.effect` на любую дозу) — старые сценарии не меняются */
    const alcEffect = (lvl: 1 | 2 | 3 | undefined) => (lvl === undefined ? 0 : s.effectByLevel ? s.effectByLevel[lvl - 1] : s.effect)
    const base = 6 + (rnd() + rnd() + rnd() - 1.5) * 1.2
    let m = base + (rnd() * 3.5 - 1.75) + (weekend ? s.weekendShift : 0) + alcEffect(drankLevel)
    m = Math.max(0, Math.min(10, m))
    const skip = rnd() < 0.12 || (m < 4.5 && rnd() < 0.3)
    const sleepShift = alcEffect(drankLevel) + (weekend ? (s.weekendSleep ?? 0) : 0) + (late ? (s.lateEffect ?? 0) : 0)
    const night = { bed, wake: 460, bedHow: 'exact' as const, wakeHow: 'exact' as const }
    /* сон тянется из основной последовательности только у записанного утра — как до ночей: миры не сдвигаются */
    const morning = skip ? null : { sleep: Math.round(Math.max(0, Math.min(10, 7 + (rnd() - 0.5) * 3 + sleepShift))), wellbeing: m, mood: m, night }
    const closed = rnd() < 0.9
    const tags: string[] = []
    if (closed) {
      for (const [tag, wd, we] of BACKGROUND) if (rnd() < (weekend ? we : wd)) tags.push(tag)
      const p = dow <= 3 ? s.drink.weekday : dow <= 5 ? s.drink.friSat : s.drink.sun
      if (rnd() < p) tags.push('алкоголь')
    }
    /* срез 5б: 3 числа в день всегда (своя последовательность), применяются только к закрытому вечеру */
    const bg5b: [number, number, number] = [bgRnd(), bgRnd(), bgRnd()]
    if (closed) BACKGROUND_5B.forEach(([tag, wd, we], bi) => { if (bg5b[bi]! < (weekend ? we : wd)) tags.push(tag) })
    /* 1 число в день всегда; ступень ставится только когда сама выпивка легла главной последовательностью */
    const levelU = levelRnd()
    const weekendNext = isoDow(addDays(date, 1)) >= 5
    let levels: Record<string, number> | undefined
    if (closed && tags.includes('алкоголь')) {
      levels = { 'алкоголь': s.levelOf ? s.levelOf(weekendNext, levelU) : ((Math.floor(levelU * 3) + 1) as 1 | 2 | 3) }
    }
    const e = Math.max(0, Math.min(10, base + (rnd() - 0.5) * 2))
    out.push({
      day: dayKey(date),
      morning,
      started: !skip,
      evening: closed ? { mood: e, wellbeing: e, productivity: e } : null,
      tags,
      ...(levels ? { levels } : {}),
    })
    drankBefore = tags.includes('алкоголь')
    drankLevel = levels?.['алкоголь'] as 1 | 2 | 3 | undefined
  }
  return out
}

/** Связи так, как их считает страница: порог позднего — от окна графика в 14 дней. */
const linksOf = (h: TimelineDay[], goal: Goal) => links(h, goal, lateFrom(h, h.length - 14))

const isDrink = (l: Link) => l.factor.kind === 'tag' && l.factor.tag === 'алкоголь'
const isLate = (l: Link) => l.factor.kind === 'lateBed'
const isFound = (l: Link) => l.level === 'maybe' || l.level === 'notable'

function run(offset: number, s: Scenario) {
  let card = 0
  let cardPlain = 0
  let anyShown = 0
  let shown = 0
  let eligible = 0
  for (let k = 0; k < WORLDS; k++) {
    const r = linksOf(world(offset + k, s), 'all')
    const drink = r.pairs.find(isDrink)!
    const c = r.cards.find(isDrink)
    if (c) card++
    if (c && !c.otherwise) cardPlain++
    if (r.cards.length || r.night || r.late) anyShown++
    if (drink.withN >= 8) {
      eligible++
      if (isFound(drink)) shown++
    }
  }
  return { card: card / WORLDS, cardPlain: cardPlain / WORLDS, anyShown: anyShown / WORLDS, shown: eligible ? shown / eligible : 0, eligible }
}

/** То же для позднего отбоя: строка «Ночь», найденная пара без оговорки, мощность; `computed` — в скольких мирах пара вообще посчитана. */
function runLate(offset: number, s: Scenario, goal: Goal) {
  let card = 0
  let foundPlain = 0
  let anyShown = 0
  let shown = 0
  let eligible = 0
  let computed = 0
  for (let k = 0; k < WORLDS; k++) {
    const r = linksOf(world(offset + k, s), goal)
    const late = r.pairs.find(isLate)
    if (late) computed++
    if (r.late) card++
    if (late && isFound(late) && !late.otherwise) foundPlain++
    if (r.cards.length || r.night || r.late) anyShown++
    if (late && late.withN >= 8) {
      eligible++
      if (isFound(late)) shown++
    }
  }
  return { computed, card: card / WORLDS, foundPlain: foundPlain / WORLDS, anyShown: anyShown / WORLDS, shown: eligible ? shown / eligible : 0, eligible }
}

/** Срез 5б: лесенка алкоголя по мирам — доля миров с фразой (`trend ≠ null`) и доля «хуже» среди мощных миров. */
function runLadder(offset: number, s: Scenario) {
  let phrase = 0
  let eligible = 0
  let worse = 0
  for (let k = 0; k < WORLDS; k++) {
    const h = world(offset + k, s)
    const r = linksOf(h, 'all')
    const drink = r.pairs.find(isDrink)!
    const l = ladder(h, 'all', drink)
    if (l?.trend) phrase++
    if (drink.withN >= 16) {
      eligible++
      if (l?.trend === 'worse') worse++
    }
  }
  return { phrase: phrase / WORLDS, eligible, worse: eligible ? worse / eligible : 0 }
}

describe('связи — приёмка по мирам', () => {
  it('нулевой мир, будничный тег при лучших выходных: карточка алкоголя и любая связь — не больше 10 % миров', () => {
    const r = run(100_000, { drink: { weekday: 0.25, friSat: 0, sun: 0 }, effect: 0, weekendShift: 1 })
    console.log('нулевой, будни:', r)
    expect(r.card).toBeLessThanOrEqual(0.1)
    expect(r.anyShown).toBeLessThanOrEqual(0.1)
  })

  it('нулевой мир, тег выходных при худших выходных: карточка алкоголя и любая связь — не больше 10 % миров', () => {
    const r = run(500_000, { drink: { weekday: 0.1, friSat: 0.35, sun: 0.1 }, effect: 0, weekendShift: -1.5 })
    console.log('нулевой, выходные:', r)
    expect(r.card).toBeLessThanOrEqual(0.1)
    expect(r.anyShown).toBeLessThanOrEqual(0.1)
  })

  it('эффект −2 к утру, 8+ эпизодов: ●○○ и выше — не меньше 70 % миров', () => {
    const r = run(300_000, { drink: { weekday: 0.25, friSat: 0.25, sun: 0.25 }, effect: -2, weekendShift: 0 })
    console.log('эффект −2:', r)
    expect(r.eligible).toBeGreaterThan(WORLDS / 2)
    expect(r.shown).toBeGreaterThanOrEqual(0.7)
  })

  it('«эффект» −2 только через выходные: карточка алкоголя, с оговоркой или без, и любая связь — не больше 10 % миров', () => {
    const r = run(400_000, { drink: { weekday: 0, friSat: 0.6, sun: 0 }, effect: 0, weekendShift: -2 })
    console.log('через выходные:', r)
    expect(r.cardPlain).toBeLessThanOrEqual(0.1)
    expect(r.card).toBeLessThanOrEqual(0.1)
    expect(r.anyShown).toBeLessThanOrEqual(0.1)
  })
})

describe('поздний отбой — приёмка по мирам (срез 4)', () => {
  const nullWeekend: Scenario = { drink: { weekday: 0.1, friSat: 0.2, sun: 0.1 }, effect: 0, weekendShift: -1.5, weekendSleep: -1.5 }

  it('нулевой: в ночь на выходной ложится позже, а выходные и так хуже — карточка и любая связь не больше 10 % миров (сон и «всё»)', () => {
    for (const [goal, offset] of [['sleep', 600_000], ['all', 700_000]] as const) {
      const r = runLate(offset, nullWeekend, goal)
      console.log(`поздний отбой, нулевой, ${goal}:`, r)
      expect(r.computed).toBe(WORLDS)
      expect(r.card).toBeLessThanOrEqual(0.1)
      expect(r.anyShown).toBeLessThanOrEqual(0.1)
    }
  })

  it('эффект −2 к сну после позднего отбоя, 8+ поздних ночей: ●○○ и выше — не меньше 70 % миров', () => {
    const r = runLate(800_000, { drink: { weekday: 0.1, friSat: 0.1, sun: 0.1 }, effect: 0, weekendShift: 0, lateEffect: -2 }, 'sleep')
    console.log('поздний отбой, эффект −2:', r)
    expect(r.computed).toBe(WORLDS)
    expect(r.eligible).toBeGreaterThan(WORLDS / 3)
    expect(r.shown).toBeGreaterThanOrEqual(0.7)
  })

  it('смешанный: алкоголь и отбой сдвигает, и сон портит, у отбоя своего эффекта нет — связь без «а может быть иначе» не больше 10 % миров', () => {
    const r = runLate(900_000, { drink: { weekday: 0.25, friSat: 0.25, sun: 0.25 }, effect: -2, weekendShift: 0 }, 'sleep')
    console.log('поздний отбой, смешанный:', r)
    expect(r.computed).toBe(WORLDS)
    expect(r.foundPlain).toBeLessThanOrEqual(0.1)
  })
})

describe('лесенка — приёмка по мирам (срез 5б, §8 договора)', () => {
  /*
   * Решение Georgy 25.09 (замер на 2000 мирах, `scratchpad/design-out/audit.md`): выпивка в сценариях
   * лесенки — 0,5 каждый вечер (не 0,35 — при 0,35 годных по withN ≥ 16 меньше половины миров).
   * Мощность считается по мирам с withN ≥ 16 (условие 2 лесенки — withN ≥ LADDER_TOTAL = 12, годность
   * лесенки — отдельный, более строгий порог withN ≥ 16, их ~72 % при 0,5).
   */
  it('доза без эффекта: алкоголь 0,5 каждый вечер, эффект одинаков по ступеням — фраза не больше 10 % миров', () => {
    // effect не используется — задан effectByLevel (одинаков на всех трёх ступенях, разницы по дозе нет)
    const s: Scenario = { drink: { weekday: 0.5, friSat: 0.5, sun: 0.5 }, effect: 0, weekendShift: 0, effectByLevel: [-1.5, -1.5, -1.5] }
    const r = runLadder(1_000_000, s)
    console.log('лесенка, доза без эффекта:', r)
    expect(r.phrase).toBeLessThanOrEqual(0.1)
  })

  it('доза только через выходные: ступень 3 на выходное утро, иначе 1; алкоголь 0,5 — фраза не больше 10 % миров', () => {
    const s: Scenario = {
      drink: { weekday: 0.5, friSat: 0.5, sun: 0.5 },
      effect: 0,
      weekendShift: -2,
      effectByLevel: [-1.5, -1.5, -1.5],
      levelOf: (weekendNext) => (weekendNext ? 3 : 1),
    }
    const r = runLadder(1_100_000, s)
    console.log('лесенка, доза только через выходные:', r)
    expect(r.phrase).toBeLessThanOrEqual(0.1)
  })

  it('крупные дозы чаще по выходным (частичное смешение 80/10/10): алкоголь 0,5, эффект одинаков по ступеням — фраза не больше 10 % миров', () => {
    // утро D+1 выходное — ступень 3 с вероятностью 0,8, иначе 1…2 поровну; будни — ступень 1 с вероятностью 0,8, иначе 2…3 поровну
    const s: Scenario = {
      drink: { weekday: 0.5, friSat: 0.5, sun: 0.5 },
      effect: 0,
      weekendShift: -2,
      effectByLevel: [-1.5, -1.5, -1.5],
      levelOf: (weekendNext, u) => (weekendNext ? (u < 0.8 ? 3 : u < 0.9 ? 1 : 2) : u < 0.8 ? 1 : u < 0.9 ? 2 : 3),
    }
    const r = runLadder(1_200_000, s)
    console.log('лесенка, частичное смешение:', r)
    expect(r.phrase).toBeLessThanOrEqual(0.1)
  })

  it('−1 балл на ступень: алкоголь 0,5, эффект растёт по дозе — миров с withN ≥ 16 больше половины, среди них фраза «хуже» не меньше 70 % миров', () => {
    const s: Scenario = { drink: { weekday: 0.5, friSat: 0.5, sun: 0.5 }, effect: 0, weekendShift: 0, effectByLevel: [-1, -2, -3] }
    const r = runLadder(1_300_000, s)
    console.log('лесенка, −1 балл на ступень:', r)
    expect(r.eligible).toBeGreaterThan(WORLDS / 2)
    expect(r.worse).toBeGreaterThanOrEqual(0.7)
  })
})
