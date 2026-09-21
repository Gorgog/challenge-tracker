import { beforeAll, describe, expect, it } from 'vitest'
import { createDemoRepo } from '@/data/demoRepo'
import { addDays, dayKey, parseDay } from './date'
import { challengeEffects, tagEffects, type ChallengeEffect, type TagEffect } from './effects'

/**
 * Как методика ведёт себя на коротком горизонте — месяц «выхода из выгорания» и его первые
 * пятнадцать дней. Проверяется, что методика не выдумывает (нет ложного «уверенно» у нейтральных
 * челленджей, ложное «возможно» — в пределах своей цены), не путает знак там, где говорит, и что
 * ранние выводы появляются: решение Georgy от 21.09 — выводы нужны с первых двух недель, даже
 * ценой ошибок. Верные и ложные слова считаются отдельно (решение Georgy от 21.09, этап 2): «хоть
 * одно слово» засчитывало и ложные. Пороги заданы до прогона — по частотам свежих миров.
 */
const TODAY = parseDay('2026-09-21')
const SEEDS = Array.from({ length: 40 }, (_, i) => 20260921 + i * 7919)
/** Первые 15 дней — на 100 мирах: частоты там ниже, и на 40 мирах шум съедал запас порога. */
const EARLY_SEEDS = Array.from({ length: 100 }, (_, i) => 20260921 + i * 7919)
const STRONG = ['likely', 'strong']
/** «Возможно» и сильнее. */
const WORDED: string[] = ['possible', 'likely', 'strong']

type World = {
  byCode: (code: string) => ChallengeEffect
  tag: (name: string) => TagEffect | undefined
  /** Хоть одно верное слово уверенности: заложены прогулки (назавтра лучше) и пиво (назавтра хуже). */
  trueWord: boolean
  /** Сколько на экране остальных слов уверенности — у карточек и тегов: все они ложные. */
  falseWords: number
}

/** Слово уверенности о заложенном эффекте — и с верным знаком. */
const isTrue = (subject: string, e: ChallengeEffect | TagEffect) =>
  e.confidence !== null &&
  ((subject === 'ШАГ' && e.windows.day.next.delta > 0) || (subject === 'алкоголь' && e.windows.day.next.delta < 0))

/** Мир на день `day` истории: сегодня — этот день, оценки — только до него. */
async function build(seed: number, day = 30): Promise<World> {
  const r = createDemoRepo({ today: TODAY, seed, storage: null, scenario: 'burnout' })
  const [challenges, entries, all, allStarts] = await Promise.all([
    r.listChallenges(),
    r.listEntries(),
    r.listDayLogs(),
    r.listDayStarts(),
  ])
  const today = addDays(TODAY, day - 30)
  const logs = all.filter((l) => l.day < dayKey(today))
  const starts = allStarts.filter((s) => s.day < dayKey(today))
  const effects = challengeEffects(challenges, entries, logs, today, starts)
  const tags = tagEffects(logs, starts)
  const said = [
    ...effects.map((e) => [e.challenge.code, e] as const),
    ...tags.map((t) => [t.tag, t] as const),
  ].filter(([, e]) => e.confidence !== null)
  return {
    byCode: (code) => effects.find((e) => e.challenge.code === code)!,
    tag: (name) => tags.find((t) => t.tag === name),
    trueWord: said.some(([subject, e]) => isTrue(subject, e)),
    falseWords: said.filter(([subject, e]) => !isTrue(subject, e)).length,
  }
}

let month: World[] = []
let early: World[] = []
beforeAll(async () => {
  ;[month, early] = await Promise.all([
    Promise.all(SEEDS.map((seed) => build(seed))),
    Promise.all(EARLY_SEEDS.map((seed) => build(seed, 15))),
  ])
}, 120_000)

const count = (worlds: World[], pick: (w: World) => boolean) => worlds.filter(pick).length
/** Доля миров, где выполняется условие. */
const share = (worlds: World[], pick: (w: World) => boolean) => count(worlds, pick) / worlds.length

describe('месяц выхода из выгорания: 40 миров', () => {
  it.each(['ЧТН', 'АНГ', 'ОТЖ'])('%s — нейтрален: «уверенно» не больше чем в одном мире', (code) => {
    expect(count(month, (w) => w.byCode(code).confidence === 'sure')).toBeLessThanOrEqual(1)
  })

  it('чтение по расписанию — «похоже» назавтра не чаще чем в 10% миров', () => {
    expect(count(month, (w) => STRONG.includes(w.byCode('ЧТН').windows.day.next.strength))).toBeLessThanOrEqual(4)
  })

  it('о прогулках со словом уверенности — назавтра лучше, а не хуже', () => {
    const said = month.map((w) => w.byCode('ШАГ')).filter((e) => e.confidence !== null)
    expect(said.filter((e) => e.windows.day.next.delta > 0).length).toBeGreaterThanOrEqual(Math.ceil(said.length * 0.95))
  })

  it('о пиве со словом уверенности — назавтра хуже, а не лучше', () => {
    const said = month.map((w) => w.tag('алкоголь')).filter((t): t is TagEffect => t !== undefined && t.confidence !== null)
    expect(said.filter((t) => t.windows.day.next.delta < 0).length).toBeGreaterThanOrEqual(Math.ceil(said.length * 0.95))
  })

  it('отжимания без пропусков — «мало данных», и до старта оценок нет', () => {
    expect(count(month, (w) => w.byCode('ОТЖ').verdict === 'insufficient')).toBe(month.length)
    expect(count(month, (w) => w.byCode('ОТЖ').beforeAfter?.beforeStart === 0)).toBe(month.length)
  })

  it('английский без единого выполнения — «мало данных»', () => {
    expect(count(month, (w) => w.byCode('АНГ').verdict === 'insufficient')).toBe(month.length)
  })
})

describe('ранние выводы на месяце', () => {
  it('прогулки: «возможно» и сильнее, назавтра лучше — не реже чем в 45% миров', () => {
    const found = share(month, (w) => {
      const e = w.byCode('ШАГ')
      return e.confidence !== null && e.windows.day.next.delta > 0
    })
    expect(found).toBeGreaterThanOrEqual(0.45)
  })

  it('пиво: «возможно» и сильнее, назавтра хуже — не реже чем в 45% миров', () => {
    const found = share(month, (w) => {
      const t = w.tag('алкоголь')
      return t !== undefined && t.confidence !== null && t.windows.day.next.delta < 0
    })
    expect(found).toBeGreaterThanOrEqual(0.45)
  })

  it('«плохо спал» (сон 0–4 утром): хуже в тот же день, «возможно» и сильнее — не реже чем в 40% миров', () => {
    // Тег выводится из утренней шкалы сна (этап 2). Свежие 1200 миров: 58,8%, σ = 7,8 п.п. У прежнего
    // вечернего тега «мало спал» порог был тот же.
    const found = share(month, (w) => {
      const same = w.tag('плохо спал')?.windows.day.same
      return same !== undefined && WORDED.includes(same.strength) && same.delta < 0
    })
    expect(found).toBeGreaterThanOrEqual(0.4)
  })

  it('чтение: слово уверенности назавтра — не чаще чем в 35% миров', () => {
    expect(share(month, (w) => WORDED.includes(w.byCode('ЧТН').windows.day.next.strength))).toBeLessThanOrEqual(0.35)
  })

  it('чтение при том же утре: «в тот же день» решено не чаще чем в 35% миров', () => {
    // Чтение по расписанию, связи с днём нет. Свежие 800 миров: около 20%, σ = 6,3 п.п.; без утра — 18,5%.
    expect(share(month, (w) => WORDED.includes(w.byCode('ЧТН').windows.day.same.strength))).toBeLessThanOrEqual(0.35)
  })

  it('хоть одно верное слово на экране — не реже чем в 70% миров', () => {
    // Свежие 1200 миров: 83,4%, σ = 5,9 п.п. Прежняя проверка «хоть одно слово ≥ 80%» засчитывала и
    // ложные слова — например, «назавтра» у тега сна, которого в сиде нет.
    expect(share(month, (w) => w.trueWord)).toBeGreaterThanOrEqual(0.7)
  })
})

describe('первые 15 дней той же истории: 100 миров', () => {
  it('хоть одно верное слово на экране — не реже чем в 33% миров', () => {
    // Свежие 1200 миров: 43,6%, σ = 5,0 п.п. на 100 мирах. Вместо прежней «хоть одно слово ≥ 50%»:
    // она засчитывала ложные слова, а запас её на свежих мирах был около 1,7σ.
    expect(share(early, (w) => w.trueWord)).toBeGreaterThanOrEqual(0.33)
  })

  it('ложных слов на экране — в среднем не больше 0,65', () => {
    // Свежие 1200 миров: 0,50, SE = 0,066 на 100 мирах. Цена ранних выводов: «возможно» на двух
    // неделях верно примерно через раз.
    expect(early.reduce((sum, w) => sum + w.falseWords, 0) / early.length).toBeLessThanOrEqual(0.65)
  })

  it('«плохо спал»: хуже в тот же день, «возможно» и сильнее — не реже чем в 15% миров', () => {
    // Свежие 1200 миров: 26,8%, σ = 4,4 п.п. У прежнего вечернего тега порог был 30%: утренний тег
    // теряет около трети строк на пропущенных утрах — сон неизвестен, а не «нормальный» (Georgy принял).
    const found = share(early, (w) => {
      const same = w.tag('плохо спал')?.windows.day.same
      return same !== undefined && WORDED.includes(same.strength) && same.delta < 0
    })
    expect(found).toBeGreaterThanOrEqual(0.15)
  })

  it('чтение при том же утре: «в тот же день» решено не чаще чем в 40% миров', () => {
    // Свежие 800 миров: около 26% (без утра — 26,0%), σ = 4,5 п.п.
    expect(share(early, (w) => WORDED.includes(w.byCode('ЧТН').windows.day.same.strength))).toBeLessThanOrEqual(0.4)
  })

  it('чтение: слово уверенности назавтра — не чаще чем в 40% миров', () => {
    expect(share(early, (w) => WORDED.includes(w.byCode('ЧТН').windows.day.next.strength))).toBeLessThanOrEqual(0.4)
  })

  it('о прогулках и пиве со словом уверенности — верный знак не меньше чем в 85% выводов', () => {
    const walks = early.map((w) => w.byCode('ШАГ')).filter((e) => e.confidence !== null)
    const beer = early.map((w) => w.tag('алкоголь')).filter((t): t is TagEffect => t !== undefined && t.confidence !== null)
    const right = walks.filter((e) => e.windows.day.next.delta > 0).length + beer.filter((t) => t.windows.day.next.delta < 0).length
    expect(right).toBeGreaterThanOrEqual(Math.ceil((walks.length + beer.length) * 0.85))
  })
})
