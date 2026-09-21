import { beforeAll, describe, expect, it } from 'vitest'
import { createDemoRepo } from '@/data/demoRepo'
import { addDays, dayKey, parseDay } from './date'
import { challengeEffects, tagEffects, type ChallengeEffect, type TagEffect } from './effects'

/**
 * Как методика ведёт себя на коротком горизонте — месяц «выхода из выгорания» и его первые
 * пятнадцать дней. Проверяется, что методика не выдумывает (нет ложного «уверенно» у нейтральных
 * челленджей, ложное «возможно» — в пределах своей цены), не путает знак там, где говорит, и что
 * ранние выводы появляются: решение Georgy от 21.09 — выводы нужны с первых двух недель, даже
 * ценой ошибок. Пороги заданы до прогона.
 */
const TODAY = parseDay('2026-09-21')
const SEEDS = Array.from({ length: 40 }, (_, i) => 20260921 + i * 7919)
const STRONG = ['likely', 'strong']
/** «Возможно» и сильнее. */
const WORDED: string[] = ['possible', 'likely', 'strong']

type World = {
  byCode: (code: string) => ChallengeEffect
  tag: (name: string) => TagEffect | undefined
  /** Хоть одно слово уверенности на экране — у карточки челленджа или у тега. */
  anyWord: boolean
}

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
  return {
    byCode: (code) => effects.find((e) => e.challenge.code === code)!,
    tag: (name) => tags.find((t) => t.tag === name),
    anyWord: [...effects, ...tags].some((e) => e.confidence !== null),
  }
}

let month: World[] = []
let early: World[] = []
beforeAll(async () => {
  ;[month, early] = await Promise.all([
    Promise.all(SEEDS.map((seed) => build(seed))),
    Promise.all(SEEDS.map((seed) => build(seed, 15))),
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

  // Проверки «мало спал» сняты вместе с тегом (решение Georgy от 21.09): сон теперь спрашивается
  // утром шкалой, и его проверки появятся, когда утро дойдёт до аналитики.

  it('чтение: слово уверенности назавтра — не чаще чем в 35% миров', () => {
    expect(share(month, (w) => WORDED.includes(w.byCode('ЧТН').windows.day.next.strength))).toBeLessThanOrEqual(0.35)
  })

  it('чтение при том же утре: «в тот же день» решено не чаще чем в 35% миров', () => {
    // Чтение по расписанию, связи с днём нет. Свежие 800 миров: около 20%, σ = 6,3 п.п.; без утра — 18,5%.
    expect(share(month, (w) => WORDED.includes(w.byCode('ЧТН').windows.day.same.strength))).toBeLessThanOrEqual(0.35)
  })

  it('хоть одно слово уверенности на экране — не реже чем в 80% миров', () => {
    expect(share(month, (w) => w.anyWord)).toBeGreaterThanOrEqual(0.8)
  })
})

describe('первые 15 дней той же истории', () => {
  it('хоть одно слово уверенности на экране — не реже чем в 50% миров', () => {
    // Запас тонкий: без тега «мало спал» на 400 свежих мирах 58,75%, и при смене сида или методики
    // проверка покраснеет на шуме примерно в каждом десятом случае. Решение Georgy от 21.09 — порог
    // пересмотреть на этапе 2, вместе с проверками сна; красный цвет до этого — не повод его двигать.
    expect(share(early, (w) => w.anyWord)).toBeGreaterThanOrEqual(0.5)
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
