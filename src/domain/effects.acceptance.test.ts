import { beforeAll, describe, expect, it } from 'vitest'
import { createDemoRepo } from '@/data/demoRepo'
import { isLive } from './challenges'
import { parseDay } from './date'
import { METRICS, beforeAfter, challengeEffects, tagEffects, type ChallengeEffect, type TagEffect } from './effects'
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
 * «Возможно» — ранний вывод по 70% интервалу, пока в группе меньше десяти дней; у него своя цена:
 * ложное — до трети миров, а у челленджа, который делается в энергичные дни (ОТЖ), и больше.
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
  effects: ChallengeEffect[]
  tags: TagEffect[]
  byCode: (code: string) => ChallengeEffect
  /** Тот же мир без утр — чтобы проверить, что утро не меняет слов. */
  withoutMornings: { effects: ChallengeEffect[]; tags: TagEffect[] }
}

async function build(seed: number): Promise<World> {
  const r = createDemoRepo({ today: TODAY, seed, storage: null })
  const [challenges, entries, logs, starts] = await Promise.all([
    r.listChallenges(),
    r.listEntries(),
    r.listDayLogs(),
    r.listDayStarts(),
  ])
  const effects = challengeEffects(challenges, entries, logs, TODAY, starts)
  return {
    challenges,
    logs,
    effects,
    tags: tagEffects(logs, starts),
    byCode: (code) => effects.find((e) => e.challenge.code === code)!,
    withoutMornings: { effects: challengeEffects(challenges, entries, logs, TODAY), tags: tagEffects(logs) },
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

  it('слов уверенности сверх заложенных эффектов назавтра — в среднем не больше двух на экран', () => {
    // Заложены назавтра только ШАГ (лучше) и пиво (хуже); любое другое слово уверенности на экране — сверх.
    // Разведка на 150 свежих мирах: 1,4 на экран; без правила «возможно, пока дней мало» было 2,7.
    const extra = worlds.map((w) => {
      const cards = w.effects.filter((e) => isLive(e.challenge) && e.confidence !== null)
      const walks = (e: ChallengeEffect) => e.challenge.code === 'ШАГ' && e.windows.day.next.delta > 0
      const beer = (t: TagEffect) => t.tag === 'алкоголь' && t.windows.day.next.delta < 0
      return cards.filter((e) => !walks(e)).length + w.tags.filter((t) => t.confidence !== null && !beer(t)).length
    })
    expect(extra.reduce((s, n) => s + n, 0) / worlds.length).toBeLessThanOrEqual(2)
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
    // «до/после» считается напрямую в каждом мире: на карточке оно видно, только когда дни не с чем
    // сравнить, и проверка по карточке засчитывала бы миры, где его нет
    const sugar = (w: World) => w.challenges.find((c) => c.code === 'БСХ')!
    expect(share((w) => beforeAfter(sugar(w), w.challenges, w.logs, TODAY).byMetric.day.strength !== 'likely')).toBeGreaterThanOrEqual(0.9)
  })

  it('ЧТН и ШАГ начаты в один день — «до/после» их не разделит', () => {
    const { challenges, logs } = worlds[0]!
    const read = challenges.find((c) => c.code === 'ЧТН')!
    expect(beforeAfter(read, challenges, logs, TODAY).inseparableFrom.map((c) => c.code)).toEqual(['ШАГ'])
  })
})

/**
 * Утро в аналитике (решение Georgy от 21.09): у челленджей окно «в тот же день» — при том же утре,
 * строка «Утро» — справочно. Пороги заданы до реализации: частоты на 450 свежих мирах, край 2σ при
 * 40 мирах, округлён в сторону запаса. Демо к поправке на утро щедро: в сиде утро знает о дне всё,
 * кроме событий, — в жизни польза, скорее всего, меньше (разведка: миры M0, M1, M2).
 */
describe('утро в аналитике: 40 миров', () => {
  const sameDecided = (e: ChallengeEffect) => WORDED.includes(e.windows.day.same.strength)

  it('ШАГ — при том же утре «следующий день лучше», а не «и в тот же день тоже»: не реже чем в 45% миров', () => {
    // Свежие миры: 60,9%, σ = 7,7 п.п. Без утра — около 1%: в хорошие дни и шагов больше.
    expect(share((w) => w.byCode('ШАГ').verdict === 'delayed')).toBeGreaterThanOrEqual(0.45)
  })

  it('ЧТН — при том же утре «в тот же день» решено не чаще чем в 35% миров', () => {
    // Свежие миры: 18,7%, σ = 6,2 п.п. Без утра — 69–79%: читает в энергичные дни.
    expect(share((w) => sameDecided(w.byCode('ЧТН')))).toBeLessThanOrEqual(0.35)
  })

  it('ОТЖ — при том же утре «в тот же день» решено не чаще чем в 65% миров', () => {
    // Свежие миры: 47,3%, σ = 7,9 п.п. Без утра — 67–73%.
    expect(share((w) => sameDecided(w.byCode('ОТЖ')))).toBeLessThanOrEqual(0.65)
  })

  it('АНГ — шум: при том же утре «в тот же день» решено не чаще чем в 5% миров', () => {
    // Свежие миры: 0 из 450.
    expect(share((w) => sameDecided(w.byCode('АНГ')))).toBeLessThanOrEqual(0.05)
  })

  it('у ШАГ и ЧТН окно «в тот же день» при том же утре — не реже чем в 90% миров', () => {
    // Свежие миры: 100%. Утро пропущено примерно в каждом восьмом дне — двух третей хватает.
    expect(share((w) => w.byCode('ШАГ').morningBase && w.byCode('ЧТН').morningBase)).toBeGreaterThanOrEqual(0.9)
  })

  it('строка «Утро»: ШАГ — утро назавтра лучше не реже чем в 95% миров', () => {
    // Свежие миры: 99,1%, σ = 1,5 п.п.
    const found = share((w) => {
      const next = w.byCode('ШАГ').morning?.next
      return next !== undefined && WORDED.includes(next.strength) && next.delta > 0
    })
    expect(found).toBeGreaterThanOrEqual(0.95)
  })

  it('строка «Утро»: ЧТН — в дни чтения утро и так лучше не реже чем в 40% миров', () => {
    // Свежие миры: 58,4%, σ = 7,8 п.п. Читает в энергичные дни — это видно уже по утру.
    const found = share((w) => {
      const same = w.byCode('ЧТН').morning?.same
      return same !== undefined && WORDED.includes(same.strength) && same.delta > 0
    })
    expect(found).toBeGreaterThanOrEqual(0.4)
  })

  it('утро не меняет слов: «назавтра» и слова челленджей и вечерних тегов те же, что без утр', () => {
    for (const w of worlds) {
      for (const e of w.effects) {
        const plain = w.withoutMornings.effects.find((p) => p.challenge.id === e.challenge.id)!
        expect(e.confidence).toBe(plain.confidence)
        for (const metric of METRICS) expect(e.windows[metric].next).toEqual(plain.windows[metric].next)
      }
      for (const plain of w.withoutMornings.tags) {
        const t = w.tags.find((x) => x.tag === plain.tag)!
        expect([t.windows, t.verdict, t.confidence]).toEqual([plain.windows, plain.verdict, plain.confidence])
      }
    }
  })
})

