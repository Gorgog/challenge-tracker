import { beforeAll, describe, expect, it } from 'vitest'
import { createDemoRepo } from '@/data/demoRepo'
import { parseDay } from './date'
import { challengeEffects, tagEffects, type ChallengeEffect, type TagEffect } from './effects'

/**
 * Как методика ведёт себя на коротком горизонте — месяц «выхода из выгорания».
 * Тридцати дней мало, чтобы требовать находок: здесь проверяется, что методика не выдумывает
 * (нет ложного «уверенно» у нейтральных челленджей) и не путает знак там, где говорит уверенно.
 * Пороги заданы до прогона.
 */
const TODAY = parseDay('2026-09-21')
const SEEDS = Array.from({ length: 40 }, (_, i) => 20260921 + i * 7919)
const STRONG = ['likely', 'strong']

type World = { byCode: (code: string) => ChallengeEffect; tag: (name: string) => TagEffect | undefined }

async function build(seed: number): Promise<World> {
  const r = createDemoRepo({ today: TODAY, seed, storage: null, scenario: 'burnout' })
  const [challenges, entries, logs] = await Promise.all([r.listChallenges(), r.listEntries(), r.listDayLogs()])
  const effects = challengeEffects(challenges, entries, logs, TODAY)
  const tags = tagEffects(logs)
  return {
    byCode: (code) => effects.find((e) => e.challenge.code === code)!,
    tag: (name) => tags.find((t) => t.tag === name),
  }
}

let worlds: World[] = []
beforeAll(async () => {
  worlds = await Promise.all(SEEDS.map(build))
}, 120_000)

const count = (pick: (w: World) => boolean) => worlds.filter(pick).length

describe('месяц выхода из выгорания: 40 миров', () => {
  it.each(['ЧТН', 'АНГ', 'ОТЖ'])('%s — нейтрален: «уверенно» не больше чем в одном мире', (code) => {
    expect(count((w) => w.byCode(code).confidence === 'sure')).toBeLessThanOrEqual(1)
  })

  it('чтение по расписанию — «похоже» назавтра не чаще чем в 10% миров', () => {
    expect(count((w) => STRONG.includes(w.byCode('ЧТН').windows.day.next.strength))).toBeLessThanOrEqual(4)
  })

  it('о прогулках со словом уверенности — назавтра лучше, а не хуже', () => {
    const said = worlds.map((w) => w.byCode('ШАГ')).filter((e) => e.confidence !== null)
    expect(said.filter((e) => e.windows.day.next.delta > 0).length).toBeGreaterThanOrEqual(Math.ceil(said.length * 0.95))
  })

  it('о пиве со словом уверенности — назавтра хуже, а не лучше', () => {
    const said = worlds.map((w) => w.tag('алкоголь')).filter((t): t is TagEffect => t !== undefined && t.confidence !== null)
    expect(said.filter((t) => t.windows.day.next.delta < 0).length).toBeGreaterThanOrEqual(Math.ceil(said.length * 0.95))
  })

  it('отжимания без пропусков — «мало данных», и до старта оценок нет', () => {
    expect(count((w) => w.byCode('ОТЖ').verdict === 'insufficient')).toBe(worlds.length)
    expect(count((w) => w.byCode('ОТЖ').beforeAfter?.beforeStart === 0)).toBe(worlds.length)
  })

  it('английский без единого выполнения — «мало данных»', () => {
    expect(count((w) => w.byCode('АНГ').verdict === 'insufficient')).toBe(worlds.length)
  })
})
