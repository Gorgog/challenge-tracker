import { describe, expect, it } from 'vitest'
import { mulberry32 } from '@/data/seeds/common'
import { addDays, dayKey, isoDow, parseDay } from './date'
import { links, type Link } from './links'
import type { TimelineDay } from './timeline'

/*
 * Приёмка связей по многим мирам (правило проекта: частоты, пороги заданы до прогона — план среза 2,
 * одобрен Georgy 24.09). Миры — 56 дней с фоном тегов, как в сиде `full`, пропусками утр (случайными и
 * в плохие дни) и незакрытыми вечерами. Порог не подбирается под зерно: упало — выяснять причину.
 * После ревью (24.09): в нулевых мирах — и «любая показанная связь не больше 10 % просмотров» (решение
 * Georgy), и карточка алкоголя в мире «через выходные» — он тоже нулевой: без поправки на выходные карточка
 * там была в 67 % миров, а метрика «без оговорки» этого не видела.
 */

const WORLDS = 500
const TODAY = parseDay('2026-09-23')

type Scenario = {
  /** Вероятность тега «алкоголь» вечером: будни (пн–чт), пт / сб, вс. */
  drink: { weekday: number; friSat: number; sun: number }
  /** Сдвиг утра после вечера с алкоголем. */
  effect: number
  /** Сдвиг утра выходного (сб, вс) самого по себе. */
  weekendShift: number
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

function world(seed: number, s: Scenario): TimelineDay[] {
  const rnd = mulberry32(seed)
  const len = 56
  const out: TimelineDay[] = []
  let drankBefore = false
  for (let i = 0; i < len; i++) {
    const date = addDays(TODAY, i - len + 1)
    const dow = isoDow(date)
    const weekend = dow >= 5
    const base = 6 + (rnd() + rnd() + rnd() - 1.5) * 1.2
    let m = base + (rnd() * 3.5 - 1.75) + (weekend ? s.weekendShift : 0) + (drankBefore ? s.effect : 0)
    m = Math.max(0, Math.min(10, m))
    const skip = rnd() < 0.12 || (m < 4.5 && rnd() < 0.3)
    const morning = skip ? null : { sleep: Math.round(Math.max(0, Math.min(10, 7 + (rnd() - 0.5) * 3 + (drankBefore ? s.effect : 0)))), wellbeing: m, mood: m }
    const closed = rnd() < 0.9
    const tags: string[] = []
    if (closed) {
      for (const [tag, wd, we] of BACKGROUND) if (rnd() < (weekend ? we : wd)) tags.push(tag)
      const p = dow <= 3 ? s.drink.weekday : dow <= 5 ? s.drink.friSat : s.drink.sun
      if (rnd() < p) tags.push('алкоголь')
    }
    const e = Math.max(0, Math.min(10, base + (rnd() - 0.5) * 2))
    out.push({
      day: dayKey(date),
      morning,
      started: !skip,
      evening: closed ? { mood: e, wellbeing: e, productivity: e } : null,
      tags,
    })
    drankBefore = tags.includes('алкоголь')
  }
  return out
}

const isDrink = (l: Link) => l.factor.kind === 'tag' && l.factor.tag === 'алкоголь'

function run(offset: number, s: Scenario) {
  let card = 0
  let cardPlain = 0
  let anyShown = 0
  let shown = 0
  let eligible = 0
  for (let k = 0; k < WORLDS; k++) {
    const r = links(world(offset + k, s), 'all')
    const drink = r.pairs.find(isDrink)!
    const c = r.cards.find(isDrink)
    if (c) card++
    if (c && !c.otherwise) cardPlain++
    if (r.cards.length || r.night) anyShown++
    if (drink.withN >= 8) {
      eligible++
      if (drink.level === 'maybe' || drink.level === 'notable') shown++
    }
  }
  return { card: card / WORLDS, cardPlain: cardPlain / WORLDS, anyShown: anyShown / WORLDS, shown: eligible ? shown / eligible : 0, eligible }
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
