import { beforeAll, describe, expect, it } from 'vitest'
import { createDemoRepo } from '@/data/demoRepo'
import { parseDay } from './date'
import { beforeAfter, challengeEffects, tagEffects, type ChallengeEffect, type TagEffect } from './effects'
import type { Challenge, DayLog } from './types'

/**
 * Приёмка методики на демо-данных. В сид заложены известные связи:
 * ШАГ вчера → сегодня лучше самочувствие и настроение (настоящий эффект назавтра);
 * алкоголь → назавтра хуже самочувствие и продуктивность (похмелье);
 * ЧТН и ОТЖ выполняются в энергичные дни — связь только с самим днём (ложный эффект);
 * АНГ — шум; у БСГ и БСХ почти нет срывов.
 *
 * Проверяются частоты по многим мирам, а не один мир: зерно, подобранное так, что всё сошлось,
 * ничего не доказывает. Пороги заданы до прогона: настоящее находится в большинстве миров,
 * ложное «похоже» назавтра — не чаще, чем позволяет 95% интервал, ложное «уверенно» — почти никогда.
 * «Возможно» — ранний вывод по 70% интервалу, у него своя цена: ложное — до трети миров, а у
 * челленджа, который делается в энергичные дни (ОТЖ), и больше.
 */
const TODAY = parseDay('2026-09-21')
const SEEDS = Array.from({ length: 40 }, (_, i) => 20260921 + i * 7919)
const STRONG = ['likely', 'strong']
/** «Возможно» и сильнее. */
const WORDED: string[] = ['possible', 'likely', 'strong']
/** «Похоже» или «уверенно» — слова, планка которых не изменилась с появлением «возможно». */
const FIRM: (string | null)[] = ['likely', 'sure']

type World = {
  challenges: Challenge[]
  logs: DayLog[]
  tags: TagEffect[]
  byCode: (code: string) => ChallengeEffect
}

async function build(seed: number): Promise<World> {
  const r = createDemoRepo({ today: TODAY, seed, storage: null })
  const [challenges, entries, logs] = await Promise.all([r.listChallenges(), r.listEntries(), r.listDayLogs()])
  const effects = challengeEffects(challenges, entries, logs, TODAY)
  return {
    challenges,
    logs,
    tags: tagEffects(logs),
    byCode: (code) => effects.find((e) => e.challenge.code === code)!,
  }
}

let worlds: World[] = []
beforeAll(async () => {
  worlds = await Promise.all(SEEDS.map(build))
}, 120_000)

/** Доля миров, где выполняется условие. */
const share = (pick: (w: World) => boolean) => worlds.filter(pick).length / worlds.length

describe('приёмка методики на демо-данных: 40 миров', () => {
  it('ШАГ: «уверенно» и назавтра лучше — не меньше чем в 80% миров', () => {
    const found = share((w) => {
      const e = w.byCode('ШАГ')
      return e.confidence === 'sure' && e.windows.day.next.delta > 0
    })
    expect(found).toBeGreaterThanOrEqual(0.8)
  })

  it('похмелье: следующий день хуже, «похоже» или «уверенно» — не меньше чем в 80% миров', () => {
    const found = share((w) => {
      const drink = w.tags.find((t) => t.tag === 'алкоголь')
      return drink !== undefined && FIRM.includes(drink.confidence) && drink.windows.day.next.delta < 0
    })
    expect(found).toBeGreaterThanOrEqual(0.8)
  })

  it.each(['ЧТН', 'ОТЖ'])('%s — связь только с самим днём: «похоже» назавтра не чаще чем в 10% миров', (code) => {
    expect(share((w) => STRONG.includes(w.byCode(code).windows.day.next.strength))).toBeLessThanOrEqual(0.1)
  })

  it('ЧТН — «возможно» и сильнее назавтра не чаще чем в 30% миров', () => {
    expect(share((w) => WORDED.includes(w.byCode('ЧТН').windows.day.next.strength))).toBeLessThanOrEqual(0.3)
  })

  it('ОТЖ делается в энергичные дни — «возможно» и сильнее назавтра не чаще чем в 60% миров', () => {
    expect(share((w) => WORDED.includes(w.byCode('ОТЖ').windows.day.next.strength))).toBeLessThanOrEqual(0.6)
  })

  it('АНГ — шум: «похоже» и «уверенно» не чаще 10% миров, любое слово — не чаще 30%, «уверенно» — не больше чем в одном', () => {
    expect(share((w) => FIRM.includes(w.byCode('АНГ').confidence))).toBeLessThanOrEqual(0.1)
    expect(share((w) => w.byCode('АНГ').confidence !== null)).toBeLessThanOrEqual(0.3)
    expect(worlds.filter((w) => w.byCode('АНГ').confidence === 'sure').length).toBeLessThanOrEqual(1)
  })

  it('БСГ — два срыва за всю историю: всегда «мало данных» и сравнение до/после', () => {
    expect(share((w) => w.byCode('БСГ').verdict === 'insufficient')).toBe(1)
    expect(share((w) => w.byCode('БСГ').beforeAfter?.byMetric.day.strength !== 'likely')).toBeGreaterThanOrEqual(0.9)
  })

  it('БСХ — срывов мало: «похоже» и «уверенно» не чаще 10% миров, любое слово — не чаще 35%, «до/после» без ложного «похоже»', () => {
    expect(share((w) => FIRM.includes(w.byCode('БСХ').confidence))).toBeLessThanOrEqual(0.1)
    expect(share((w) => w.byCode('БСХ').confidence !== null)).toBeLessThanOrEqual(0.35)
    expect(share((w) => w.byCode('БСХ').beforeAfter?.byMetric.day.strength !== 'likely')).toBeGreaterThanOrEqual(0.9)
  })

  it('ЧТН и ШАГ начаты в один день — «до/после» их не разделит', () => {
    const { challenges, logs } = worlds[0]!
    const read = challenges.find((c) => c.code === 'ЧТН')!
    expect(beforeAfter(read, challenges, logs, TODAY).inseparableFrom.map((c) => c.code)).toEqual(['ШАГ'])
  })
})
