import { describe, expect, it } from 'vitest'
import { addDays, dayKey, isoDow, parseDay } from './date'
import { cases, chain, CONTEXT_TAGS, explains, LADDER_MIN, LADDER_TOTAL, ladder, LINK_DAYS, LINK_MIN, links, NOT_MORE, shrink, type Link } from './links'
import { HARMFUL_TAGS, round1 } from './timeline'
import type { TimelineDay } from './timeline'
import type { Challenge, EntryMap } from './types'

const TODAY = parseDay('2026-09-23') // среда

/** `bed`, `wake` — ночь перед этим утром (минуты от полуночи утра); без `bed` ночь не записана.
 *  `levels` — ступени тегов этого вечера (срез 5б); копируется в `TimelineDay.levels` только когда вечер закрыт и что-то передано. */
type Spec = {
  m?: number | null
  e?: number | null
  sleep?: number
  prod?: number
  tags?: string[]
  bed?: number
  wake?: number
  levels?: Record<string, number>
}

/** История из `len` дней по сегодня; `dow` — 0 понедельник … 6 воскресенье. По умолчанию утро и вечер 6, сон 7. */
function hist(len: number, spec: (i: number, dow: number) => Spec = () => ({})): TimelineDay[] {
  return Array.from({ length: len }, (_, i) => {
    const date = addDays(TODAY, i - len + 1)
    const { m = 6, e = 6, sleep = 7, prod = 6, tags = [], bed, wake = 460, levels } = spec(i, isoDow(date))
    const night = bed === undefined ? null : { bed, wake, bedHow: 'exact' as const, wakeHow: 'exact' as const }
    return {
      day: dayKey(date),
      morning: m === null ? null : { sleep, wellbeing: m, mood: m, night },
      started: m !== null,
      evening: e === null ? null : { mood: e, wellbeing: e, productivity: prod },
      tags: e === null ? [] : tags,
      ...(e !== null && levels && Object.keys(levels).length ? { levels } : {}),
    } as TimelineDay
  })
}

const tagLink = (list: Link[], tag: string) => list.find((l) => l.factor.kind === 'tag' && l.factor.tag === tag)!
const badSleepLink = (list: Link[]) => list.find((l) => l.factor.kind === 'badSleep')

/** Алкоголь каждые `step` дней с дня 2; утро после — `after`, остальные — 6. */
const drinking = (step: number, after = 3, len = LINK_DAYS) =>
  hist(len, (i) => ({ tags: i % step === 2 ? ['алкоголь'] : [], m: (i - 1) % step === 2 ? after : 6 }))

describe('shrink — простое сжатие к нулю', () => {
  it('пример методики: 2,0 при SE 1,17 → около 1,2', () => {
    expect(shrink(2, 1.17)).toBeCloseTo(1.24, 2)
  })
  it('без разброса — сырая разница', () => {
    expect(shrink(-3, 0)).toBe(-3)
  })
})

describe('links — пары «тег вечером → утро»', () => {
  it('«с» — утро после закрытого вечера с тегом, «без» — после закрытого вечера без него', () => {
    const r = links(drinking(9), 'all')
    const l = tagLink(r.pairs, 'алкоголь')
    // вечера 2, 11, 20, 29, 38, 47 → утра 3, 12, … 48
    expect(l.withN).toBe(6)
    expect(l.withMean).toBe(3)
    expect(l.withoutMean).toBe(6)
    expect(l.withDays).toEqual([3, 12, 21, 30, 39, 48].map((i) => dayKey(addDays(TODAY, i - LINK_DAYS + 1))))
    // все утра со 2-го по 55-й, кроме шести
    expect(l.withoutN).toBe(55 - 6)
  })

  it('незакрытый вечер не идёт ни в «с», ни в «без»; утро без записи — тоже', () => {
    const h = drinking(9).map((d, i) => (i === 2 ? { ...d, evening: null, tags: [] } : i === 5 ? { ...d, morning: null } : d))
    const l = tagLink(links(h, 'all').pairs, 'алкоголь')
    expect(l.withN).toBe(5)
    expect(l.withoutN).toBe(55 - 6 - 1) // утро 5 не записано
  })

  it('цель «Сон» — сон утром, «Продуктивность» — вечер следующего дня', () => {
    const h = hist(LINK_DAYS, (i) => ({
      tags: i % 9 === 2 ? ['алкоголь'] : [],
      sleep: (i - 1) % 9 === 2 ? 3 : 8,
      prod: (i - 1) % 9 === 2 ? 2 : 7,
    }))
    expect(tagLink(links(h, 'sleep').pairs, 'алкоголь')).toMatchObject({ withMean: 3, withoutMean: 8 })
    expect(tagLink(links(h, 'productivity').pairs, 'алкоголь')).toMatchObject({ withMean: 2, withoutMean: 7 })
  })

  it('считаются только последние LINK_DAYS дней', () => {
    const old = hist(30, () => ({ tags: ['алкоголь'], m: 0 }))
    const r = links([...old, ...drinking(9)], 'all')
    expect(tagLink(r.pairs, 'алкоголь').withN).toBe(6)
  })
})

describe('links — ступени', () => {
  it('меньше 5 дней «с» — пока рано, с прогрессом', () => {
    const l = tagLink(links(drinking(12), 'all').pairs, 'алкоголь') // вечера 2, 14, 26, 38, 50 → утра 3…51
    expect(l.withN).toBe(5)
    const h = drinking(12).map((d, i) => (i === 50 ? { ...d, tags: [] } : d))
    const early = tagLink(links(h, 'all').pairs, 'алкоголь')
    expect(early).toMatchObject({ level: 'early', withN: 4, direction: null, bucket: null })
  })

  it('5 + 5, разница 3 балла, все утра хуже — «может быть» ●○○, ведро «Меньше»', () => {
    const l = tagLink(links(drinking(9), 'all').pairs, 'алкоголь')
    expect(l).toMatchObject({ level: 'maybe', direction: 'worse', sameSide: 6, bucket: 'less' })
    expect(l.shrunk).toBe(-3)
  })

  it('8+ дней и в обеих половинах окна — «заметно» ●●○', () => {
    const l = tagLink(links(drinking(7), 'all').pairs, 'алкоголь') // утра 3, 10, 17, 24 | 31, 38, 45, 52
    expect(l).toMatchObject({ level: 'notable', withN: 8 })
  })

  it('8 дней, но все во второй половине — только ●○○', () => {
    const h = hist(LINK_DAYS, (i) => ({
      tags: i >= 28 && i % 3 === 0 ? ['алкоголь'] : [],
      m: i >= 29 && (i - 1) % 3 === 0 ? 3 : 6,
    }))
    const l = tagLink(links(h, 'all').pairs, 'алкоголь')
    expect(l.withN).toBeGreaterThanOrEqual(8)
    expect(l.level).toBe('maybe')
  })

  it('разница меньше балла — связи нет', () => {
    const l = tagLink(links(drinking(9, 5.1), 'all').pairs, 'алкоголь')
    expect(l.level).toBe('none')
  })

  it('порог растёт с разбросом: max(1; 0,5σ)', () => {
    // «без» — то 1, то 11 по очереди (σ ≈ 5): разница 1,5 при пороге около 2,5 — связи нет
    const h = hist(LINK_DAYS, (i) => ({
      tags: i % 7 === 2 ? ['алкоголь'] : [],
      m: (i - 1) % 7 === 2 ? 4.5 : i % 2 ? 1 : 11,
    }))
    const l = tagLink(links(h, 'all').pairs, 'алкоголь')
    expect(Math.abs(l.withMean! - l.withoutMean!)).toBeGreaterThan(1)
    expect(l.level).toBe('none')
  })

  it('хуже меньше чем в 2/3 дней «с» — связи нет, даже при большой средней разнице', () => {
    // утра после: 2, 7, 2, 7, … — в среднем 4,5 против 6, но хуже только в половине
    let n = 0
    const h = hist(LINK_DAYS, (i) => ({
      tags: i % 7 === 2 ? ['алкоголь'] : [],
      m: (i - 1) % 7 === 2 ? (n++ % 2 ? 7 : 2) : 6,
    }))
    const l = tagLink(links(h, 'all').pairs, 'алкоголь')
    expect(l.sameSide).toBe(4)
    expect(l.withN).toBe(8)
    expect(l.level).toBe('none')
  })

  it('разница пропадает с поправкой на выходные — связи нет', () => {
    // тег — по пятницам и субботам через неделю; утра выходных плохие сами по себе
    const h = hist(LINK_DAYS, (i, dow) => ({
      tags: Math.floor(i / 7) % 2 === 0 && (dow === 4 || dow === 5) ? ['алкоголь'] : [],
      m: dow >= 5 ? 4 : 7,
    }))
    const r = links(h, 'all')
    const l = tagLink(r.pairs, 'алкоголь')
    expect(l.withN).toBeGreaterThanOrEqual(5)
    expect(l.withMean!).toBeLessThan(l.withoutMean! - 1)
    expect(l.level).toBe('none')
    expect(r.cards).toEqual([])
  })

  it('с поправкой на выходные разница меньше балла — связи нет', () => {
    // утро выходного после тега 3,5, без тега 4 — внутри выходных разница полбалла
    const h = hist(LINK_DAYS, (i, dow) => ({
      tags: Math.floor(i / 7) % 2 === 0 && (dow === 4 || dow === 5) ? ['алкоголь'] : [],
      m: dow >= 5 ? (Math.floor((i - 1) / 7) % 2 === 0 || (dow === 5 && Math.floor(i / 7) % 2 === 0) ? 3.5 : 4) : 7,
    }))
    const l = tagLink(links(h, 'all').pairs, 'алкоголь')
    expect(l.withMean!).toBeLessThan(l.withoutMean! - 1)
    expect(l.level).toBe('none')
  })

  it('с поправкой на выходные разница в другую сторону — связи нет', () => {
    // утро выходного после тега 5,5, без тега 4: внутри выходных тег «лучше», в сумме — «хуже»
    const tagged = (i: number, dow: number) => Math.floor(i / 7) % 2 === 0 && (dow === 4 || dow === 5)
    const h = hist(LINK_DAYS, (i, dow) => ({
      tags: tagged(i, dow) ? ['алкоголь'] : [],
      m: tagged(i - 1, (dow + 6) % 7) ? 5.5 : dow >= 5 ? 4 : 7.5,
    }))
    const l = tagLink(links(h, 'all').pairs, 'алкоголь')
    expect(l.withMean!).toBeLessThan(l.withoutMean! - 1)
    expect(l.level).toBe('none')
  })

  it('тег почти во все выходные — отделить от выходных нельзя: связи нет', () => {
    // все вечера пт и сб с тегом, кроме одной пятницы; утра выходных 3 (одно без тега — 6), будни 7
    const tagged = (i: number, dow: number) => (dow === 4 || dow === 5) && i !== 8
    const h = hist(LINK_DAYS, (i, dow) => ({
      tags: tagged(i, dow) ? ['алкоголь'] : [],
      m: dow >= 5 ? (i === 9 ? 6 : 3) : 7,
    }))
    const l = tagLink(links(h, 'all').pairs, 'алкоголь')
    expect(l.withN).toBeGreaterThanOrEqual(LINK_MIN)
    expect(l.level).toBe('none')
  })

  it('ровно 2/3 дней «с» по ту же сторону — ещё связь; 5 из 8 — уже нет', () => {
    let n = 0
    // 6 утр после: четыре 2 и два 7 (выше обычных 6)
    const h = hist(LINK_DAYS, (i) => ({ tags: i % 9 === 2 ? ['алкоголь'] : [], m: (i - 1) % 9 === 2 ? (n++ < 4 ? 2 : 7) : 6 }))
    expect(tagLink(links(h, 'all').pairs, 'алкоголь')).toMatchObject({ withN: 6, sameSide: 4, level: 'maybe' })
    let k = 0
    // 8 утр после: пять 2 и три 6,5
    const h2 = hist(LINK_DAYS, (i) => ({ tags: i % 7 === 2 ? ['алкоголь'] : [], m: (i - 1) % 7 === 2 ? (k++ < 5 ? 2 : 6.5) : 6 }))
    expect(tagLink(links(h2, 'all').pairs, 'алкоголь')).toMatchObject({ withN: 8, sameSide: 5, level: 'none' })
  })

  it('●●○ — только если в обеих половинах разница в ту же сторону и дней 3 + 3', () => {
    // 9 утр после алкоголя. Первая половина окна: обычно 6, после — 3 (хуже). Вторая: обычно 4,5,
    // после — 5 (лучше своей половины), но в целом ниже общего обычного (5,2) — связь ●○○ есть
    const firstEv = [2, 6, 10, 14, 18, 22]
    const secondEv = [30, 38, 46]
    const opposite = hist(LINK_DAYS, (i) => ({
      tags: [...firstEv, ...secondEv].includes(i) ? ['алкоголь'] : [],
      m: firstEv.includes(i - 1) ? 3 : secondEv.includes(i - 1) ? 5 : i < 28 ? 6 : 4.5,
    }))
    const o = tagLink(links(opposite, 'all').pairs, 'алкоголь')
    expect(o.withN).toBe(9)
    expect(o.level).toBe('maybe')
    // 9 утр после: в первой половине только 2
    const few = hist(LINK_DAYS, (i) => ({
      tags: (i < 28 ? [9, 20] : [30, 33, 36, 39, 42, 45, 48]).includes(i) ? ['алкоголь'] : [],
      m: [10, 21, 31, 34, 37, 40, 43, 46, 49].includes(i) ? 3 : 6,
    }))
    const l = tagLink(links(few, 'all').pairs, 'алкоголь')
    expect(l.withN).toBe(9)
    expect(l.level).toBe('maybe')
  })

  it('слой выходных с двумя днями «без» — уже мерка', () => {
    // все вечера пт и сб с тегом, кроме двух пятниц; утра выходных после тега 3, без него — 6; будни 7
    const tagged = (i: number, dow: number) => (dow === 4 || dow === 5) && i !== 8 && i !== 15
    const h = hist(LINK_DAYS, (i, dow) => ({
      tags: tagged(i, dow) ? ['алкоголь'] : [],
      m: dow >= 5 ? (i === 9 || i === 16 ? 6 : 3) : 7,
    }))
    // 14 вечеров с тегом — ступень может быть и ●●○; главное — связь есть
    expect(tagLink(links(h, 'all').pairs, 'алкоголь').level).not.toBe('none')
  })

  it('разница с поправкой на выходные тоже сжимается: 1,1 при большом разбросе — не связь', () => {
    // тег — пт и сб через неделю; утра выходных без тега 5, после тега то 2,1, то 5,7 (в среднем 3,9); будни 7
    let n = 0
    const tagged = (i: number, dow: number) => Math.floor(i / 7) % 2 === 0 && (dow === 4 || dow === 5)
    const h = hist(LINK_DAYS, (i, dow) => ({
      tags: tagged(i, dow) ? ['алкоголь'] : [],
      m: tagged(i - 1, (dow + 6) % 7) ? (n++ % 2 ? 5.7 : 2.1) : dow >= 5 ? 5 : 7,
    }))
    const l = tagLink(links(h, 'all').pairs, 'алкоголь')
    expect(Math.abs(l.shrunk!)).toBeGreaterThan(1)
    expect(l.level).toBe('none')
  })

  it('разброс «с» велик — сжатая разница меньше балла, связи нет', () => {
    // утра после: 5,8 четыре раза и 0 один раз — сырая разница 1,36, сжатая около 0,85
    let n = 0
    const h = hist(LINK_DAYS, (i) => ({
      tags: i % 11 === 2 ? ['алкоголь'] : [],
      m: (i - 1) % 11 === 2 ? (n++ === 4 ? 0 : 5.8) : 6,
    }))
    const l = tagLink(links(h, 'all').pairs, 'алкоголь')
    expect(l.withN).toBe(5)
    expect(l.withoutMean! - l.withMean!).toBeGreaterThan(1.3)
    expect(Math.abs(l.shrunk!)).toBeLessThan(1)
    expect(l.level).toBe('none')
  })
})

describe('links — вёдра', () => {
  it('тег «не в моих силах» — без ведра, даже при связи', () => {
    for (const tag of CONTEXT_TAGS) {
      const h = hist(LINK_DAYS, (i) => ({ tags: i % 9 === 2 ? [tag] : [], m: (i - 1) % 9 === 2 ? 3 : 6 }))
      const l = tagLink(links(h, 'all').pairs, tag)
      expect(l.level).toBe('maybe')
      expect(l.bucket).toBeNull()
    }
  })

  it('полезный тег в моих силах — «Больше»; вредный «к лучшему» — никуда', () => {
    const good = hist(LINK_DAYS, (i) => ({ tags: i % 9 === 2 ? ['отдых'] : [], m: (i - 1) % 9 === 2 ? 9 : 6 }))
    expect(tagLink(links(good, 'all').pairs, 'отдых')).toMatchObject({ direction: 'better', bucket: 'more' })
    const odd = hist(LINK_DAYS, (i) => ({ tags: i % 9 === 2 ? ['ссора'] : [], m: (i - 1) % 9 === 2 ? 9 : 6 }))
    expect(tagLink(links(odd, 'all').pairs, 'ссора')).toMatchObject({ direction: 'better', bucket: null })
  })

  it('«дедлайн» и «встречи» — только «Меньше»: если после них лучше, не советуем', () => {
    for (const tag of NOT_MORE) {
      const better = hist(LINK_DAYS, (i) => ({ tags: i % 9 === 2 ? [tag] : [], m: (i - 1) % 9 === 2 ? 9 : 6 }))
      expect(tagLink(links(better, 'all').pairs, tag)).toMatchObject({ level: 'maybe', direction: 'better', bucket: null })
      const worse = hist(LINK_DAYS, (i) => ({ tags: i % 9 === 2 ? [tag] : [], m: (i - 1) % 9 === 2 ? 3 : 6 }))
      expect(tagLink(links(worse, 'all').pairs, tag)).toMatchObject({ direction: 'worse', bucket: 'less' })
    }
  })

  it('карточки — по одной на ведро, сильнейшая первой; счёт проверенных и заметных', () => {
    const h = hist(LINK_DAYS, (i) => {
      const tags = [...(i % 9 === 2 ? ['алкоголь'] : []), ...(i % 9 === 5 ? ['ссора'] : []), ...(i % 9 === 7 ? ['отдых'] : [])]
      const prev = i - 1
      const m = prev % 9 === 2 ? 2 : prev % 9 === 5 ? 4 : prev % 9 === 7 ? 9 : 6
      return { tags, m }
    })
    const r = links(h, 'all')
    expect(r.cards.map((c) => [c.factor.kind === 'tag' && c.factor.tag, c.bucket])).toEqual([
      ['алкоголь', 'less'],
      ['отдых', 'more'],
    ])
    // заметных — только то, что видно: две карточки («ссора» тоже ●○○, но её ведро занято алкоголем)
    expect(r.found).toBe(2)
    // 5 + 5 прошли алкоголь, ссора, отдых; у остальных тегов дней «с» нет, плохих ночей нет
    expect(r.checked).toBe(3)
  })
})

describe('links — плохая ночь → вечер того же дня', () => {
  it('сон 0–4 утром (4 — ещё плохая) против остальных; на цели «Сон» пары нет; в карточки не идёт', () => {
    const h = hist(LINK_DAYS, (i) => ({ sleep: i % 8 === 1 ? 4 : 8, e: i % 8 === 1 ? 3 : 7 }))
    const l = badSleepLink(links(h, 'all').pairs)!
    expect(l).toMatchObject({ withN: 7, withMean: 3, withoutMean: 7, level: 'maybe', bucket: null })
    expect(badSleepLink(links(h, 'sleep').pairs)).toBeUndefined()
    const r = links(h, 'all')
    expect(r.cards).toEqual([])
    // видна отдельной строкой и считается в «заметных»
    expect(r.night).toEqual(l)
    expect(r.found).toBe(1)
    expect(links(h, 'sleep').night).toBeNull()
  })

  it('плохая ночь без связи — строки нет', () => {
    const h = hist(LINK_DAYS, (i) => ({ sleep: i % 8 === 1 ? 4 : 8 }))
    expect(links(h, 'all')).toMatchObject({ night: null, found: 0 })
  })

  it('утро без вечера не считается', () => {
    const h = hist(LINK_DAYS, (i) => ({ sleep: i % 8 === 1 ? 4 : 8, e: i === 1 ? null : i % 8 === 1 ? 3 : 7 }))
    expect(badSleepLink(links(h, 'all').pairs)!.withN).toBe(6)
  })
})

describe('links — поздний отбой → утро (срез 4)', () => {
  const lateLink = (list: Link[]) => list.find((l) => l.factor.kind === 'lateBed')
  /** Каждые 7 дней с дня 3 — лёг в 1:00 (60), утро и сон 3; иначе 23:30 (−30), утро 6, сон 8. */
  const lateNights = (len = LINK_DAYS) =>
    hist(len, (i) => (i % 7 === 3 ? { bed: 60, sleep: 3, m: 3 } : { bed: -30, sleep: 8 }))

  it('ночь с порога и позже → сон того же утра; «Меньше», как у вредного тега', () => {
    const l = lateLink(links(lateNights(), 'sleep', 30).pairs)!
    expect(l).toMatchObject({
      factor: { kind: 'lateBed', from: 30 },
      withN: 8,
      withMean: 3,
      withoutMean: 8,
      level: 'notable',
      direction: 'worse',
      bucket: 'less',
    })
    // дни результата — утра после поздней ночи: их подсвечивает график
    expect(l.withDays[0]).toBe(dayKey(addDays(TODAY, 3 - LINK_DAYS + 1)))
  })

  it('ровно порог — уже поздно, минутой раньше — ещё нет', () => {
    const h = hist(LINK_DAYS, (i) => (i % 7 === 3 ? { bed: i < 30 ? 30 : 29, sleep: 3 } : { bed: -30, sleep: 8 }))
    expect(lateLink(links(h, 'sleep', 30).pairs)!.withN).toBe(4)
  })

  it('порога нет (своего обычного ещё нет) — пары нет', () => {
    expect(lateLink(links(lateNights(), 'sleep').pairs)).toBeUndefined()
    expect(lateLink(links(lateNights(), 'sleep', null).pairs)).toBeUndefined()
  })

  it('по цели: утро (самочувствие, настроение), продуктивность — вечер того же дня', () => {
    const h = hist(LINK_DAYS, (i) => (i % 7 === 3 ? { bed: 60, m: 3, prod: 2 } : { bed: -30, prod: 7 }))
    expect(lateLink(links(h, 'mood', 30).pairs)).toMatchObject({ withMean: 3, withoutMean: 6 })
    expect(lateLink(links(h, 'productivity', 30).pairs)).toMatchObject({ withMean: 2, withoutMean: 7 })
  })

  it('незаписанная ночь — ни «с», ни «без»; сегодняшнее утро, которого ещё нет, — тоже', () => {
    const h = lateNights().map((d, i) => (i === 10 ? { ...d, morning: { ...d.morning!, night: null } } : d))
    h[h.length - 1] = { ...h[h.length - 1]!, morning: null, started: false }
    const l = lateLink(links(h, 'sleep', 30).pairs)!
    // 55 ночей после вечеров окна (ночь перед первым утром — после вечера до окна), без двух незаписанных
    expect(l.withN + l.withoutN).toBe(LINK_DAYS - 1 - 2)
    expect(l.withN).toBe(7)
  })

  it('вечер накануне не закрыт — ночь всё равно считается: она записана утром', () => {
    const h = lateNights().map((d, i) => (i === 2 ? { ...d, evening: null, tags: [] } : d))
    expect(lateLink(links(h, 'sleep', 30).pairs)!.withN).toBe(8)
  })

  it('лучше после позднего — ведра нет: «ложись позже» не советуем', () => {
    const h = hist(LINK_DAYS, (i) => (i % 7 === 3 ? { bed: 60, sleep: 9 } : { bed: -30, sleep: 5 }))
    expect(lateLink(links(h, 'sleep', 30).pairs)).toMatchObject({ direction: 'better', bucket: null })
  })

  it('«а может быть иначе»: в 2/3 поздних ночей накануне был алкоголь', () => {
    const h = hist(LINK_DAYS, (i) => ({
      ...(i % 7 === 3 ? { bed: 60, sleep: 3 } : { bed: -30, sleep: 8 }),
      tags: (i + 1) % 7 === 3 && i < 40 ? ['алкоголь'] : [],
    }))
    expect(lateLink(links(h, 'sleep', 30).pairs)!.otherwise).toMatchObject({ kind: 'tag', tag: 'алкоголь', together: 6, of: 8 })
  })

  it('в карточки не идёт — своя строка «Ночь»: ведро «Меньше» остаётся тегам (решение Georgy по ревью); заметных — видимые', () => {
    // алкоголь вечерами 6, 15 … 51, сон после — 2: у тега своя связь, и ведро «Меньше» его, а не отбоя
    const h = hist(LINK_DAYS, (i) => ({
      tags: i % 9 === 6 ? ['алкоголь'] : [],
      ...(i % 7 === 3 ? { bed: 60, sleep: 3 } : { bed: -30, sleep: (i - 1) % 9 === 6 ? 2 : 8 }),
    }))
    const r = links(h, 'sleep', 30)
    expect(r.cards.map((c) => c.factor.kind === 'tag' && c.factor.tag)).toEqual(['алкоголь'])
    expect(r.late).toMatchObject({ factor: { kind: 'lateBed' }, bucket: 'less' })
    expect(r.found).toBe(2)
    const alone = links(lateNights(), 'sleep', 30)
    expect(alone.cards).toEqual([])
    expect(alone.late?.factor.kind).toBe('lateBed')
    expect(alone).toMatchObject({ found: 1, checked: 1 })
  })

  it('связи нет — строки нет', () => {
    const flat = hist(LINK_DAYS, (i) => ({ bed: i % 7 === 3 ? 60 : -30 }))
    expect(links(flat, 'sleep', 30)).toMatchObject({ late: null, found: 0 })
  })

  it('как у тегов: 2/3 ночей по ту же сторону — ещё связь, 5 из 8 — уже нет', () => {
    let n = 0
    const h = hist(LINK_DAYS, (i) => (i % 9 === 3 ? { bed: 60, sleep: n++ < 4 ? 2 : 7.5 } : { bed: -30 }))
    expect(lateLink(links(h, 'sleep', 30).pairs)).toMatchObject({ withN: 6, sameSide: 4, level: 'maybe' })
    let k = 0
    const h2 = hist(LINK_DAYS, (i) => (i % 7 === 3 ? { bed: 60, sleep: k++ < 5 ? 2 : 7.5 } : { bed: -30 }))
    expect(lateLink(links(h2, 'sleep', 30).pairs)).toMatchObject({ withN: 8, sameSide: 5, level: 'none' })
  })

  it('как у тегов: ●●○ — только если в обеих половинах окна; все поздние ночи в первой — ●○○', () => {
    const h = hist(LINK_DAYS, (i) => (i < 28 && i % 3 === 1 ? { bed: 60, sleep: 3 } : { bed: -30 }))
    const l = lateLink(links(h, 'sleep', 30).pairs)!
    expect(l.withN).toBeGreaterThanOrEqual(8)
    expect(l.level).toBe('maybe')
  })

  it('как у тегов: сжатие — разница 1,3 при большом разбросе «с» не проходит', () => {
    const at = [5, 16, 27, 38, 49]
    const sleeps = [4, 4, 4, 6.5, 10]
    const h = hist(LINK_DAYS, (i) => (at.includes(i) ? { bed: 60, sleep: sleeps[at.indexOf(i)] } : { bed: -30 }))
    const l = lateLink(links(h, 'sleep', 30).pairs)!
    // сырая разница больше порога (1) и 4 из 5 ночей ниже — держит только сжатие
    expect(l.withMean! - l.withoutMean!).toBeCloseTo(-1.3, 5)
    expect(l.sameSide).toBe(4)
    expect(l.level).toBe('none')
  })
})

describe('links — «а может быть иначе»', () => {
  it('другой тег в 2/3 вечеров с фактором — называется, разница без этих вечеров', () => {
    // дедлайн с алкоголем в 4 из 6 вечеров
    let n = 0
    const h = hist(LINK_DAYS, (i) => ({
      tags: i % 9 === 2 ? (n++ < 4 ? ['алкоголь', 'дедлайн'] : ['алкоголь']) : [],
      m: (i - 1) % 9 === 2 ? 3 : 6,
    }))
    const l = tagLink(links(h, 'all').pairs, 'алкоголь')
    expect(l.otherwise).toEqual({ kind: 'tag', tag: 'дедлайн', together: 4, of: 6, diff: null })
  })

  it('без совпавшего тега осталось 3 + 3 — разница без него', () => {
    let n = 0
    const h = hist(LINK_DAYS, (i) => ({
      tags: i % 7 === 2 ? (n++ < 6 ? ['алкоголь', 'дедлайн'] : ['алкоголь']) : [],
      m: (i - 1) % 7 === 2 ? 3 : 6,
    }))
    const l = tagLink(links(h, 'all').pairs, 'алкоголь')
    // 8 вечеров, дедлайн в 6 — без него 2 вечера: мало
    expect(l.otherwise).toMatchObject({ kind: 'tag', tag: 'дедлайн', together: 6, of: 8, diff: null })
    let k = 0
    const h2 = hist(LINK_DAYS, (i) => ({
      tags: i % 5 === 2 ? (k++ < 8 ? ['алкоголь', 'дедлайн'] : ['алкоголь']) : [],
      m: (i - 1) % 5 === 2 ? 3 : 6,
    }))
    const l2 = tagLink(links(h2, 'all').pairs, 'алкоголь')
    // 11 вечеров, дедлайн в 8 (≥ 2/3), без него 3 — разница 3 против 6
    expect(l2.otherwise).toEqual({ kind: 'tag', tag: 'дедлайн', together: 8, of: 11, diff: -3 })
  })

  it('утра после фактора в 2/3 — выходные: называется, разница с поправкой', () => {
    // 8 вечеров пт / сб и один вс; утро после — 3, иначе выходные 5, будни 7
    const tagged = (i: number, dow: number) => ((dow === 4 || dow === 5) && Math.floor(i / 7) % 2 === 0) || i === 10
    const h = hist(LINK_DAYS, (i, dow) => ({
      tags: tagged(i, dow) ? ['алкоголь'] : [],
      m: tagged(i - 1, (dow + 6) % 7) ? 3 : dow >= 5 ? 5 : 7,
    }))
    const l = tagLink(links(h, 'all').pairs, 'алкоголь')
    // выходные: 3 против 5 (8 утр), будни: 3 против 7 (1 утро) → (−16 − 4) / 9
    expect(l.otherwise).toEqual({ kind: 'weekend', together: 8, of: 9, diff: -2.2 })
  })

  it('другой тег в половине вечеров — ещё не «иначе»', () => {
    let n = 0
    const h = hist(LINK_DAYS, (i) => ({
      tags: i % 9 === 2 ? (n++ < 3 ? ['алкоголь', 'дедлайн'] : ['алкоголь']) : [],
      m: (i - 1) % 9 === 2 ? 3 : 6,
    }))
    expect(tagLink(links(h, 'all').pairs, 'алкоголь').otherwise).toBeNull()
  })

  it('совпадений нет — null', () => {
    expect(tagLink(links(drinking(9), 'all').pairs, 'алкоголь').otherwise).toBeNull()
  })
})

describe('links — записей мало', () => {
  it('меньше 14 записанных дней — всё «пока рано», и это сказано', () => {
    const h = hist(LINK_DAYS, (i) => (i < 43 ? { m: null, e: null } : { tags: i % 2 ? ['алкоголь'] : [], m: i % 2 ? 6 : 3 }))
    const r = links(h, 'all')
    expect(r.gate).toMatchObject({ ok: false, recorded: 13 })
    expect(r.pairs.every((l) => l.level === 'early')).toBe(true)
    expect(r.cards).toEqual([])
    expect(r.checked).toBe(0)
  })

  it('закрыто меньше 70 % вечеров с первой записи — «пока рано»', () => {
    const h = drinking(9).map((d, i) => (i % 3 === 0 ? { ...d, evening: null, tags: [] } : d))
    expect(links(h, 'all').gate.ok).toBe(false)
  })

  it('75 % закрытых вечеров — уже можно', () => {
    const h = drinking(9).map((d, i) => (i % 4 === 0 ? { ...d, evening: null, tags: [] } : d))
    expect(links(h, 'all').gate).toMatchObject({ ok: true, closedShare: 0.75 })
  })

  it('сегодняшний незакрытый вечер — ещё не пропуск: доля — от прошедших дней', () => {
    // записи с 21 дня назад; из 20 прошедших вечеров закрыто 14, сегодня вечер ещё не закрыт
    const h = hist(LINK_DAYS, (i) => (i < 35 ? { m: null, e: null } : { e: i === 55 || [36, 39, 42, 45, 48, 51].includes(i) ? null : 6 }))
    expect(links(h, 'all').gate).toMatchObject({ ok: true, closedShare: 0.7 })
  })

  it('дни до первой записи не портят долю: новый пользователь с 20 днями', () => {
    const h = hist(LINK_DAYS, (i) => (i < 36 ? { m: null, e: null } : {}))
    expect(links(h, 'all').gate).toMatchObject({ ok: true, recorded: 20 })
  })
})

describe('cases — редкие сильные случаи', () => {
  it('тег 1–4 раза, все утра после ниже обычного на балл и больше — перечисляются', () => {
    const h = hist(LINK_DAYS, (i) => ({ tags: i === 20 || i === 40 ? ['ссора'] : [], m: i === 21 ? 3 : i === 41 ? 4 : 6 }))
    expect(cases(h, 'all')).toEqual([{ tag: 'ссора', values: [3, 4], days: [h[21]!.day, h[41]!.day], usual: 6, missing: 0 }])
  })

  it('считаются вечера с тегом, а не записанные утра: 6 вечеров — не случай', () => {
    const tagged = [2, 11, 20, 29, 38, 47]
    const h = hist(LINK_DAYS, (i) => ({ tags: tagged.includes(i) ? ['ссора'] : [], m: i === 3 || i === 12 ? 2 : tagged.includes(i - 1) ? null : 6 }))
    expect(cases(h, 'all')).toEqual([])
  })

  it('утро после не отмечено — случай остаётся, пропуск назван', () => {
    const h = hist(LINK_DAYS, (i) => ({ tags: [10, 20, 30].includes(i) ? ['ссора'] : [], m: i === 11 || i === 21 ? 2 : i === 31 ? null : 6 }))
    expect(cases(h, 'all')).toEqual([{ tag: 'ссора', values: [2, 2], days: [h[11]!.day, h[21]!.day], usual: 6, missing: 1 }])
  })

  it('сегодняшнее утро, которое ещё не отмечено, — не пропуск', () => {
    const h = hist(LINK_DAYS, (i) => ({ tags: i === 20 || i === 54 ? ['ссора'] : [], m: i === 21 ? 2 : i === 55 ? null : 6, e: i === 55 ? null : 6 }))
    expect(cases(h, 'all')).toMatchObject([{ tag: 'ссора', values: [2], missing: 0 }])
  })

  it('вечера закрыты реже чем в 70 % дней — случаев нет', () => {
    const h = hist(LINK_DAYS, (i) => ({ tags: i === 20 ? ['ссора'] : [], m: i === 21 ? 2 : 6, e: i !== 20 && i % 3 === 0 ? null : 6 }))
    expect(cases(h, 'all')).toEqual([])
  })

  it('хоть одно утро не ниже обычного на балл — не случай', () => {
    const h = hist(LINK_DAYS, (i) => ({ tags: i === 20 || i === 40 ? ['ссора'] : [], m: i === 21 ? 3 : i === 41 ? 5.1 : 6 }))
    expect(cases(h, 'all')).toEqual([])
  })

  it('5 раз и больше — это уже связь, не случай; «не в моих силах» — не случай', () => {
    // ровно 5 вечеров: 2, 13, 24, 35, 46
    const five = hist(LINK_DAYS, (i) => ({ tags: i % 11 === 2 ? ['ссора'] : [], m: (i - 1) % 11 === 2 ? 3 : 6 }))
    expect(cases(five, 'all')).toEqual([])
    const ill = hist(LINK_DAYS, (i) => ({ tags: i === 20 ? ['болел'] : [], m: i === 21 ? 2 : 6 }))
    expect(cases(ill, 'all')).toEqual([])
  })

  it('по цели: сон утром; сильнейшие первыми, не больше двух', () => {
    const h = hist(LINK_DAYS, (i) => ({
      tags: i === 10 ? ['ссора'] : i === 20 ? ['дедлайн'] : i === 30 ? ['встречи'] : [],
      sleep: i === 11 ? 1 : i === 21 ? 4 : i === 31 ? 2 : 7,
    }))
    // ссора — на 6 ниже обычного, встречи — на 5, дедлайн — на 3 (не по порядку тегов)
    expect(cases(h, 'sleep').map((c) => [c.tag, c.values])).toEqual([
      ['ссора', [1]],
      ['встречи', [2]],
    ])
  })
})

describe('explains — что объясняет плохие дни', () => {
  // окно графика — последние 14 дней; полоса «обычно» — 6–7
  const band = { kind: 'band', low: 6, high: 7, days: 28, short: false } as const
  const start = LINK_DAYS - 14

  it('тег «не в моих силах» в плохой день или накануне — «2 дня из 4 плохих»', () => {
    const h = hist(LINK_DAYS, (i) => ({
      m: [44, 46, 50, 52].includes(i) ? 3 : 6.5,
      e: [44, 46, 50, 52].includes(i) ? 3 : 6.5,
      tags: i === 44 ? ['болел'] : i === 45 ? ['болел'] : [],
    }))
    expect(explains(h, start, band, 'all')).toEqual([{ tag: 'болел', count: 2, bad: 4, days: [h[44]!.day, h[46]!.day] }])
  })

  it('один плохой день — ещё не объяснение; тег так же част в обычные дни — тоже', () => {
    const one = hist(LINK_DAYS, (i) => ({ m: i === 50 ? 3 : 6.5, e: i === 50 ? 3 : 6.5, tags: i === 50 ? ['дорога'] : [] }))
    expect(explains(one, start, band, 'all')).toEqual([])
    const often = hist(LINK_DAYS, (i) => ({
      m: [44, 46].includes(i) ? 3 : 6.5,
      e: [44, 46].includes(i) ? 3 : 6.5,
      tags: i % 2 === 0 ? ['выходной'] : [],
    }))
    // в плохих днях — 2 из 2, в остальных — все 12 (тег через день: в день или накануне)
    expect(explains(often, start, band, 'all')).toEqual([])
  })

  it('неполный день (сегодня только утро) не считается плохим', () => {
    const h = hist(LINK_DAYS, (i) => ({
      m: [44, 46, 55].includes(i) ? 3 : 6.5,
      e: i === 55 ? null : [44, 46].includes(i) ? 3 : 6.5,
      tags: i === 44 || i === 45 || i === 54 ? ['болел'] : [],
    }))
    expect(explains(h, start, band, 'all')).toEqual([{ tag: 'болел', count: 2, bad: 2, days: [h[44]!.day, h[46]!.day] }])
  })

  it('плохие дни до окна графика не в счёт', () => {
    const h = hist(LINK_DAYS, (i) => ({ m: [20, 22].includes(i) ? 3 : 6.5, e: [20, 22].includes(i) ? 3 : 6.5, tags: [20, 22].includes(i) ? ['болел'] : [] }))
    expect(explains(h, start, band, 'all')).toEqual([])
  })

  it('теги в моих силах сюда не идут; полосы нет — пусто', () => {
    const h = hist(LINK_DAYS, (i) => ({ m: [44, 46].includes(i) ? 3 : 6.5, e: [44, 46].includes(i) ? 3 : 6.5, tags: [44, 46].includes(i) ? ['алкоголь'] : [] }))
    expect(explains(h, start, band, 'all')).toEqual([])
    expect(explains(h, start, { kind: 'none', need: 3 }, 'all')).toEqual([])
  })
})

describe('chain — что обычно шло следом', () => {
  const sport: Challenge = {
    id: 'sport',
    name: 'Спорт',
    code: 'СПТ',
    kind: 'do',
    measure: 'binary',
    goal: 1,
    unit: '',
    color: 'var(--chart-1)',
    tagIds: [],
    startDate: '2026-01-01',
    lengthDays: null,
    pauses: [],
    rulesLocked: false,
    deletedAt: null,
    sortOrder: 0,
  }
  const after = (i: number, step = 9) => (i - 1) % step === 2
  /** Алкоголь каждые 9 дней; на следующий день: сон 3, утро 3, вечер 3, продуктивность обычная. */
  const bad = () =>
    hist(LINK_DAYS, (i) => ({
      tags: i % 9 === 2 ? ['алкоголь'] : [],
      sleep: after(i) ? 3 : 7,
      m: after(i) ? 3 : 6,
      e: after(i) ? 3 : 6,
    }))
  const top = (h: TimelineDay[]) => links(h, 'all').cards[0]!

  it('утро, день и вечер после фактора против обычного; неотличимое — «как обычно», не выкидывается', () => {
    const h = bad()
    const c = chain(h, top(h), [], {}, TODAY)!
    expect(c).toMatchObject({ tag: 'алкоголь', episodes: 6, noMorning: 0, level: 'maybe' })
    expect(c.days).toEqual(top(h).withDays)
    // вечер — тот же, что проверил порог: самочувствие и настроение
    expect(c.rows).toEqual([
      { kind: 'scale', part: 'morning', label: 'сон', n: 6, mean: 3, usual: 7, side: 'worse', count: 6 },
      { kind: 'scale', part: 'morning', label: 'самочувствие и настроение', n: 6, mean: 3, usual: 6, side: 'worse', count: 6 },
      { kind: 'scale', part: 'evening', label: 'самочувствие и настроение', n: 6, mean: 3, usual: 6, side: 'worse', count: 6 },
      { kind: 'scale', part: 'evening', label: 'продуктивность', n: 6, mean: 6, usual: 6, side: 'same', count: 0 },
    ])
  })

  it('ночь: «лёг» — ночью первым, «встал» — утром после сна; позже в k из n', () => {
    const h = bad().map((d, i) => ({ ...d, morning: d.morning && { ...d.morning, night: { bed: after(i) ? 90 : -30, wake: after(i) ? 540 : 460, bedHow: 'exact' as const, wakeHow: 'usual' as const } } }))
    const c = chain(h, top(h), [], {}, TODAY)!
    expect(c.rows[0]).toEqual({ kind: 'time', part: 'night', label: 'лёг', n: 6, mean: 90, usual: -30, side: 'later', count: 6 })
    expect(c.rows[1]).toMatchObject({ kind: 'scale', label: 'сон' })
    expect(c.rows[2]).toEqual({ kind: 'time', part: 'morning', label: 'встал', n: 6, mean: 540, usual: 460, side: 'later', count: 6 })
  })

  it('ночь: средние ближе 30 минут — «как обычно»; «позже в k» — только ночи на 30 минут позже и больше', () => {
    const beds = [90, 90, 90, 90, -20, -30]
    let k = 0
    const h = bad().map((d, i) => {
      const bed = after(i) ? beds[k++]! : i % 2 ? -30 : -20
      return { ...d, morning: d.morning && { ...d.morning, night: { bed, wake: after(i) ? 480 : 460, bedHow: 'exact' as const, wakeHow: 'exact' as const } } }
    })
    const c = chain(h, top(h), [], {}, TODAY)!
    // обычный отбой — 23:35 (среднее −30 и −20), после — (4 × 90 − 20 − 30) / 6 ≈ 52 → 00:50 до 5 минут
    expect(c.rows[0]).toMatchObject({ label: 'лёг', mean: 50, usual: -25, side: 'later', count: 4 })
    expect(c.rows[2]).toMatchObject({ label: 'встал', mean: 480, usual: 460, side: 'same', count: 0 })
  })

  it('ночь после фактора записана меньше трёх раз — «мало дней»; ни разу — строки нет', () => {
    let k = 0
    const two = bad().map((d, i) => (after(i) && k++ >= 2 ? d : { ...d, morning: d.morning && { ...d.morning, night: { bed: after(i) ? 90 : -30, wake: 460, bedHow: 'exact' as const, wakeHow: 'exact' as const } } }))
    expect(chain(two, top(two), [], {}, TODAY)!.rows[0]).toMatchObject({ label: 'лёг', n: 2, side: 'few', count: 0 })
    const none = bad().map((d, i) => (after(i) ? d : { ...d, morning: d.morning && { ...d.morning, night: { bed: -30, wake: 460, bedHow: 'exact' as const, wakeHow: 'exact' as const } } }))
    expect(chain(none, top(none), [], {}, TODAY)!.rows.some((r) => r.kind === 'time')).toBe(false)
  })

  it('привычки днём: «1 из 6 · обычно 8 из 10»; отказы и чужие дни не в счёт', () => {
    const h = bad()
    const entries: EntryMap = {}
    h.forEach((d, i) => {
      // обычно спорт через раз по 4 из 5, после алкоголя — только в первый раз
      if (after(i) ? i === 3 : i % 5 !== 0) entries[d.day] = 1
    })
    const quit: Challenge = { ...sport, id: 'quit', name: 'Без сладкого', kind: 'quit' }
    const c = chain(h, top(h), [sport, quit], { sport: entries }, TODAY)!
    const day = c.rows.filter((r) => r.part === 'day')
    expect(day).toHaveLength(1)
    expect(day[0]).toMatchObject({ kind: 'habit', label: 'Спорт', hits: 1, known: 6, side: 'worse' })
    expect((day[0] as { usualShare: number }).usualShare).toBeGreaterThan(0.75)
  })

  it('«Ложусь раньше» — ночь после вечера с фактором, та же, что строка «лёг», а не ночь следующего дня (ревью 4б)', () => {
    const h = bad()
    const bedtime: Challenge = { ...sport, id: 'bed', name: 'Ложусь раньше', measure: 'bedtime', goal: -30 }
    // после вечера с алкоголем (i % 9 = 2) лёг в 1:30, в остальные ночи — в 23:20; ключ — день вечера
    const entries: EntryMap = Object.fromEntries(h.map((d, i) => [d.day, i % 9 === 2 ? 90 : -40]))
    const c = chain(h, top(h), [bedtime], { bed: entries }, TODAY)!
    expect(c.rows.find((r) => r.kind === 'habit')).toMatchObject({ label: 'Ложусь раньше', hits: 0, known: 6, side: 'worse' })
  })

  it('утро не отмечено — считается отдельно', () => {
    const h = bad().map((d, i) => (i === 12 ? { ...d, morning: null, started: false } : d))
    const c = chain(h, top(h), [], {}, TODAY)!
    expect(c).toMatchObject({ episodes: 6, noMorning: 1 })
    expect(c.rows[0]).toMatchObject({ label: 'сон', n: 5 })
  })

  it('вечер после не отличается от обычного на балл — цепочки нет', () => {
    const h = hist(LINK_DAYS, (i) => ({ tags: i % 9 === 2 ? ['алкоголь'] : [], m: after(i) ? 3 : 6, e: after(i) ? 5.5 : 6 }))
    expect(chain(h, top(h), [], {}, TODAY)).toBeNull()
  })

  it('сравнение с обратной стороны: плохая ночь без фактора', () => {
    const h = hist(LINK_DAYS, (i) => ({
      tags: i % 9 === 2 ? ['алкоголь'] : [],
      sleep: after(i) || i % 9 === 6 ? 3 : 7,
      m: after(i) ? 3 : 6,
      e: after(i) ? 3 : i % 9 === 6 ? 5 : 6,
    }))
    const c = chain(h, top(h), [], {}, TODAY)!
    // плохие ночи без алкоголя накануне: дни 6, 15, 24, 33, 42, 51
    expect(c.compare).toEqual({ n: 6, evening: 5 })
  })

  it('только для связи ●○○ и выше', () => {
    const h = bad()
    expect(chain(h, { ...top(h), level: 'none' }, [], {}, TODAY)).toBeNull()
    expect(chain(h, { ...top(h), level: 'early' }, [], {}, TODAY)).toBeNull()
  })

  it('день после незакрытого вечера — ни «после», ни «обычно»', () => {
    const h = hist(LINK_DAYS, (i) => ({
      tags: i % 9 === 2 ? ['алкоголь'] : [],
      e: i % 9 === 5 ? null : after(i) ? 3 : 6,
      sleep: after(i) ? 3 : i % 9 === 6 ? 1 : 7,
      m: after(i) ? 3 : 6,
    }))
    expect(chain(h, top(h), [], {}, TODAY)!.rows[0]).toMatchObject({ label: 'сон', usual: 7 })
  })

  it('вечер после известен меньше 5 раз — цепочки нет', () => {
    const h = bad().map((d, i) => (i === 12 || i === 21 ? { ...d, evening: null, tags: [] } : d))
    expect(top(h).withN).toBe(6)
    expect(chain(h, top(h), [], {}, TODAY)).toBeNull()
  })

  it('«хуже в k из n» считает только дни ниже обычного', () => {
    let n = 0
    const h = hist(LINK_DAYS, (i) => ({
      tags: i % 9 === 2 ? ['алкоголь'] : [],
      sleep: after(i) ? (n++ === 5 ? 8 : 3) : 7,
      m: after(i) ? 3 : 6,
      e: after(i) ? 3 : 6,
    }))
    expect(chain(h, top(h), [], {}, TODAY)!.rows[0]).toMatchObject({ label: 'сон', side: 'worse', count: 5, n: 6 })
  })

  it('привычка: дни до старта и сегодняшний, ещё не отмеченный, не в счёт; доля как обычно — серым', () => {
    const h = bad()
    const late = { ...sport, startDate: h[10]!.day }
    const all: EntryMap = Object.fromEntries(h.slice(0, -1).map((d) => [d.day, 1]))
    const row = chain(h, top(h), [late], { sport: all }, TODAY)!.rows.find((r) => r.part === 'day')!
    expect(row).toMatchObject({ hits: 5, known: 5, usualShare: 1, side: 'same' })
  })

  it('привычка: разница долей 0,2 — как обычно, 0,3 — уже нет', () => {
    const h = bad()
    const after6 = h.flatMap((d, i) => (after(i) ? [d.day] : []))
    // обычно — всегда; после алкоголя — 5 из 6 (0,83: разница 0,17) и 4 из 6 (0,67: разница 0,33)
    const marks = (skip: number) => Object.fromEntries(h.slice(0, -1).filter((d) => !after6.slice(0, skip).includes(d.day)).map((d) => [d.day, 1]))
    const row = (skip: number) => chain(h, top(h), [sport], { sport: marks(skip) }, TODAY)!.rows.find((r) => r.part === 'day')!
    expect(row(1)).toMatchObject({ hits: 5, side: 'same' })
    expect(row(2)).toMatchObject({ hits: 4, side: 'worse' })
  })

  it('строки меньше чем по 3 дням — «мало дней», а не отличие', () => {
    // связь по продуктивности; утра после записаны только дважды; привычка начата к последнему эпизоду
    const h = hist(LINK_DAYS, (i) => ({
      tags: i % 9 === 2 ? ['алкоголь'] : [],
      prod: after(i) ? 2 : 6,
      e: after(i) ? 3 : 6,
      m: after(i) ? (i === 3 || i === 12 ? 2 : null) : 6,
    }))
    const t = links(h, 'productivity').cards[0]!
    const fresh = { ...sport, startDate: h[47]!.day }
    const c = chain(h, t, [fresh], { sport: { [h[48]!.day]: 1 } }, TODAY)!
    expect(c.rows.filter((r) => r.part === 'morning').every((r) => r.kind === 'scale' && r.side === 'few')).toBe(true)
    expect(c.rows.find((r) => r.part === 'day')).toMatchObject({ side: 'few' })
  })

  it('сегодняшний день, который ещё идёт, — не эпизод и не «утро не отмечено»', () => {
    // вчера вечером алкоголь, сегодня ни утра, ни вечера
    const h = bad().map((d, i) => (i === 54 ? { ...d, tags: ['алкоголь'] } : i === 55 ? { ...d, morning: null, started: false, evening: null, tags: [] } : d))
    const c = chain(h, top(h), [], {}, TODAY)!
    expect(c).toMatchObject({ episodes: 6, noMorning: 0 })
    expect(c.days).not.toContain(h[55]!.day)
  })

  it('сравнение: сон 4 — плохая ночь; после незакрытого вечера — не в счёт', () => {
    const h = hist(LINK_DAYS, (i) => ({
      tags: i % 9 === 2 ? ['алкоголь'] : [],
      sleep: after(i) ? 3 : i % 9 === 6 ? 4 : 7,
      m: after(i) ? 3 : 6,
      e: after(i) ? 3 : i === 14 ? null : i % 9 === 6 ? 5 : 6,
    }))
    // плохие ночи без алкоголя: 6, 15, 24, 33, 42, 51 — у 15 вечер накануне не закрыт
    expect(chain(h, top(h), [], {}, TODAY)!.compare).toEqual({ n: 5, evening: 5 })
  })

  it('плохих ночей без фактора меньше трёх — сравнения нет', () => {
    const h = hist(LINK_DAYS, (i) => ({
      tags: i % 9 === 2 ? ['алкоголь'] : [],
      sleep: after(i) || i === 6 || i === 15 ? 3 : 7,
      m: after(i) ? 3 : 6,
      e: after(i) ? 3 : 6,
    }))
    expect(chain(h, top(h), [], {}, TODAY)!.compare).toBeNull()
  })

  it('8+ раз и связь ●●○ — цепочка ●●○; меньше — ●○○', () => {
    const h = hist(LINK_DAYS, (i) => ({ tags: i % 7 === 2 ? ['алкоголь'] : [], m: after(i, 7) ? 3 : 6, e: after(i, 7) ? 3 : 6 }))
    expect(top(h).level).toBe('notable')
    expect(chain(h, top(h), [], {}, TODAY)!.level).toBe('notable')
  })

  it('уверенность — по самому слабому звену: связь ●●○, а вечер после известен 6 раз — ●○○', () => {
    const h = hist(LINK_DAYS, (i) => ({
      tags: i % 7 === 2 ? ['алкоголь'] : [],
      m: after(i, 7) ? 3 : 6,
      e: i === 10 || i === 17 ? null : after(i, 7) ? 3 : 6,
    }))
    expect(top(h).level).toBe('notable')
    expect(chain(h, top(h), [], {}, TODAY)!.level).toBe('maybe')
  })

  it('вечер после хуже только у половины эпизодов — это не связь, цепочки нет', () => {
    let n = 0
    const h = hist(LINK_DAYS, (i) => ({ tags: i % 9 === 2 ? ['алкоголь'] : [], m: after(i) ? 3 : 6, e: after(i) ? (n++ % 2 ? 6.5 : 1) : 6 }))
    expect(chain(h, top(h), [], {}, TODAY)).toBeNull()
  })
})

describe('links — NOT_MORE новые теги (срез 5б)', () => {
  it('NOT_MORE — ровно договорный список (§4): «дедлайн», «встречи», «игры», «стресс», «работа допоздна», и ничего лишнего', () => {
    // arrayContaining пропустил бы лишние элементы (находка первого чекера, п.9) — здесь точный список
    expect(NOT_MORE).toEqual(['дедлайн', 'встречи', 'игры', 'стресс', 'работа допоздна'])
  })

  it('HARMFUL_TAGS не меняется этим срезом', () => {
    // тоже находка первого чекера (п.9) — раньше ничем не проверялось
    expect(HARMFUL_TAGS).toEqual(['алкоголь', 'болел', 'ссора'])
  })

  it('новый тег из NOT_MORE — «лучше» даёт bucket null, «хуже» — «less» (как у «дедлайн» и «встречи»)', () => {
    for (const tag of ['игры', 'стресс', 'работа допоздна']) {
      const better = hist(LINK_DAYS, (i) => ({ tags: i % 9 === 2 ? [tag] : [], m: (i - 1) % 9 === 2 ? 9 : 6 }))
      expect(tagLink(links(better, 'all').pairs, tag)).toMatchObject({ level: 'maybe', direction: 'better', bucket: null })
      const worse = hist(LINK_DAYS, (i) => ({ tags: i % 9 === 2 ? [tag] : [], m: (i - 1) % 9 === 2 ? 3 : 6 }))
      expect(tagLink(links(worse, 'all').pairs, tag)).toMatchObject({ direction: 'worse', bucket: 'less' })
    }
  })
})

/*
 * §4 после правки Georgy 25.09 (замер на 2000 мирах, см. research/scratchpad/design-out/audit.md,
 * функция doseSlope/cslope с visibleC5=true): условие 4 — НЕСТРОГАЯ монотонность видимых средних
 * (ничьи допустимы); условие 5 — видимая разница первой/последней ПОКАЗАННОЙ ступени (без «не было»);
 * условие 6 — наклон дозы по слоям выходной/будний с поправкой на выходные и сжатием, а не «средние
 * с поправкой на выходные», как было раньше. Числа ниже посчитаны отдельным эталонным ladder()
 * (не в репозитории), который зеркалит doseSlope/cslope дословно и берёт Link из настоящего links();
 * для тегов, которых ещё нет в DAY_TAGS («игры»), Link посчитан копией tagPoints/linkOf/gateOf —
 * сверено: на «алкоголь» эта копия даёт те же числа, что настоящий links().
 */
describe('ladder — лесенка тега со ступенями (срез 5б, §4 после 25.09)', () => {
  it('LADDER_MIN = 3, LADDER_TOTAL = 12 (пороги договора)', () => {
    expect(LADDER_MIN).toBe(3)
    expect(LADDER_TOTAL).toBe(12)
  })

  it('тег не из LEVELS (например «дорога») — null', () => {
    const h = hist(LINK_DAYS, (i) => ({ tags: i % 9 === 2 ? ['дорога'] : [], m: (i - 1) % 9 === 2 ? 3 : 6 }))
    const l = tagLink(links(h, 'all').pairs, 'дорога')
    expect(ladder(h, 'all', l)).toBeNull()
  })

  it('шаги по порядку: «не было», 1…n (даже с n = 0), «не указано» — только когда есть точки без ступени', () => {
    // «игры» (4 ступени): ступень 1 — раз, ступень 3 — раз, без ступени — раз; ступени 2 и 4 не встречались (n = 0)
    const h = hist(LINK_DAYS, (i) => {
      if (i === 3) return { tags: ['игры'], levels: { 'игры': 1 } }
      if (i === 7) return { tags: ['игры'], levels: { 'игры': 3 } }
      if (i === 11) return { tags: ['игры'] } // тег отмечен, ступень не выбрана
      return {}
    })
    const l = tagLink(links(h, 'all').pairs, 'игры')
    const ld = ladder(h, 'all', l)!
    // 55 пар минус 3 вечера с тегом = 52 «не было»
    expect(ld.steps.map((s) => [s.level, s.n])).toEqual([
      [0, 52],
      [1, 1],
      [2, 0],
      [3, 1],
      [4, 0],
      [null, 1],
    ])
    // ни у одной ступени (кроме «не было») нет трёх дней — среднего не показываем
    expect(ld.steps.filter((s) => s.level !== 0).every((s) => s.mean === null)).toBe(true)
  })

  it('«не указано» не появляется в шагах, если ни разу не встречалось', () => {
    const h = hist(LINK_DAYS, (i) => (i === 3 ? { tags: ['игры'], levels: { 'игры': 1 } } : {}))
    const l = tagLink(links(h, 'all').pairs, 'игры')
    const ld = ladder(h, 'all', l)!
    expect(ld.steps.map((s) => s.level)).toEqual([0, 1, 2, 3, 4])
  })

  it('граница LADDER_MIN на шаге: n = 3 — среднее показано, n = 2 — нет, хотя ступень записана', () => {
    // ступень 1: 3 вечера (4,4,4 → mean 4); ступень 2: 2 вечера (8,8 → n < 3, mean null)
    const l1p = [3, 7, 11]
    const l2p = [20, 24]
    const h = hist(LINK_DAYS, (i) => {
      const lvl = l1p.includes(i) ? 1 : l2p.includes(i) ? 2 : undefined
      const m = l1p.map((x) => x + 1).includes(i) ? 4 : l2p.map((x) => x + 1).includes(i) ? 8 : 6
      return { m, ...(lvl ? { tags: ['алкоголь'], levels: { 'алкоголь': lvl } } : {}) }
    })
    const l = tagLink(links(h, 'all').pairs, 'алкоголь')
    const ld = ladder(h, 'all', l)!
    expect(ld.steps.map((s) => [s.level, s.n, s.mean === null ? null : round1(s.mean)])).toEqual([
      [0, 50, 6],
      [1, 3, 4],
      [2, 2, null],
      [3, 0, null],
    ])
  })

  /** Общий мир «доза действует»: ступень 1 (вечера 3,7,11,14) → утра 4,8,12,15; ступень 2 (18,21,25,28) →
   *  19,22,26,29; ступень 3 (32,35,39,42) → 33,36,40,43. По 4 вечера на ступень — ровно LADDER_TOTAL (12).
   *  Утра-результаты — будние (слои считаются по дню результата; вечер 3 — воскресенье, но его утро 4 — понедельник),
   *  так что наклон дозы считается в одном слое (будни) — упрощает счёт, поправка на выходные тут ни при чём. */
  const doseLevels = new Map([
    [3, 1], [7, 1], [11, 1], [14, 1],
    [18, 2], [21, 2], [25, 2], [28, 2],
    [32, 3], [35, 3], [39, 3], [42, 3],
  ])
  const buildDose = (resultM: Map<number, number>, none = 6) =>
    hist(LINK_DAYS, (i) => {
      const lvl = doseLevels.get(i)
      const m = resultM.get(i) ?? none
      return { m, ...(lvl ? { tags: ['алкоголь'], levels: { 'алкоголь': lvl } } : {}) }
    })

  it('доза действует: все 6 условий выполнены — trend «worse» (эталон: withN=12, c1..c6 все true)', () => {
    // видимые средние 6 → 5 → 4 → 2 (нестрого убывают), разница показанных 1 и 3: |2 − 5| = 3 ≥ LINK_DIFF.
    // наклон дозы (доseSlope, только точки со ступенью, один слой «будни»): x = 1,2,3 по 4 точки на каждой,
    // y = 5,4,2 без разброса внутри ступени ⇒ b = Sxy/Sxx = −1,5 (МНК прямой через 3 средних), se ≈ 0,0913,
    // span = b·(3−1) = −3, shrunk = shrink(−3, se·2) ≈ −2,956 — знак «worse», |shrunk| ≥ 1.
    const h = buildDose(new Map([
      [4, 5], [8, 5], [12, 5], [15, 5],
      [19, 4], [22, 4], [26, 4], [29, 4],
      [33, 2], [36, 2], [40, 2], [43, 2],
    ]))
    const l = tagLink(links(h, 'all').pairs, 'алкоголь')
    expect(l.withN).toBe(LADDER_TOTAL) // граница «withN = 12 — проходит»
    expect(['maybe', 'notable']).toContain(l.level)
    const ld = ladder(h, 'all', l)!
    expect(ld.steps.map((s) => [s.level, s.n, s.mean === null ? null : round1(s.mean)])).toEqual([
      [0, 55 - 12, 6],
      [1, 4, 5],
      [2, 4, 4],
      [3, 4, 2],
    ])
    expect(ld.trend).toBe('worse')
    // ступень 1 (5) отличается от «не было» (6) ровно на LINK_DIFF (1) — не «меньше», значит не «почти как без»
    expect(ld.firstLikeNone).toBe(false)
  })

  it('withN = 11 (граница LADDER_TOTAL снизу) — trend null (эталон: падает только c2, c1/c3/c4/c5/c6 — true)', () => {
    // тот же мир без одного вечера ступени 3 (42 → 43): withN 12 → 11, LADDER_TOTAL не достигнут.
    // ступени и их средние не изменились (ступень 3: n 4 → 3, mean всё ещё 2 — граница LADDER_MIN не задета),
    // наклон дозы и видимая монотонность остаются в силе (эталон это подтверждает) — блокирует только withN.
    const resultM = new Map([
      [4, 5], [8, 5], [12, 5], [15, 5],
      [19, 4], [22, 4], [26, 4], [29, 4],
      [33, 2], [36, 2], [40, 2],
    ])
    const levels11 = new Map(doseLevels)
    levels11.delete(42)
    const h = hist(LINK_DAYS, (i) => {
      const lvl = levels11.get(i)
      const m = resultM.get(i) ?? 6
      return { m, ...(lvl ? { tags: ['алкоголь'], levels: { 'алкоголь': lvl } } : {}) }
    })
    const l = tagLink(links(h, 'all').pairs, 'алкоголь')
    expect(l.withN).toBe(11)
    expect(['maybe', 'notable']).toContain(l.level)
    const ld = ladder(h, 'all', l)!
    expect(ld.steps.map((s) => [s.level, s.n, s.mean === null ? null : round1(s.mean)])).toEqual([
      [0, 44, 6],
      [1, 4, 5],
      [2, 4, 4],
      [3, 3, 2],
    ])
    expect(ld.trend).toBeNull()
  })

  it('firstLikeNone: первая ступень ближе LINK_DIFF к «не было» — true, когда trend задан', () => {
    // тот же мир, но ступень 1 — 5,5 вместо 5: |5,5 − 6| = 0,5 < LINK_DIFF (1); монотонность и наклон целы
    const h = buildDose(new Map([
      [4, 5.5], [8, 5.5], [12, 5.5], [15, 5.5],
      [19, 4], [22, 4], [26, 4], [29, 4],
      [33, 2], [36, 2], [40, 2], [43, 2],
    ]))
    const l = tagLink(links(h, 'all').pairs, 'алкоголь')
    const ld = ladder(h, 'all', l)!
    expect(ld.steps[1]).toMatchObject({ level: 1, n: 4, mean: 5.5 })
    expect(ld.trend).toBe('worse')
    expect(ld.firstLikeNone).toBe(true)
  })

  it('«лучше» с дозой — зеркало «доза действует»: «не было» 2, ступени 3, 4, 6 — trend «better», firstLikeNone false', () => {
    const h = buildDose(new Map([
      [4, 3], [8, 3], [12, 3], [15, 3],
      [19, 4], [22, 4], [26, 4], [29, 4],
      [33, 6], [36, 6], [40, 6], [43, 6],
    ]), 2)
    const l = tagLink(links(h, 'all').pairs, 'алкоголь')
    expect(l.direction).toBe('better')
    const ld = ladder(h, 'all', l)!
    expect(ld.steps.map((s) => (s.mean === null ? null : round1(s.mean)))).toEqual([2, 3, 4, 6])
    expect(ld.trend).toBe('better')
    expect(ld.firstLikeNone).toBe(false)
  })

  it('цель «Сон»: те же ступени на поле sleep — trend «worse» (не только goal «all»)', () => {
    const h = hist(LINK_DAYS, (i) => {
      const lvl = doseLevels.get(i)
      const sleep = new Map([
        [4, 5], [8, 5], [12, 5], [15, 5],
        [19, 4], [22, 4], [26, 4], [29, 4],
        [33, 2], [36, 2], [40, 2], [43, 2],
      ]).get(i) ?? 6
      return { sleep, ...(lvl ? { tags: ['алкоголь'], levels: { 'алкоголь': lvl } } : {}) }
    })
    const l = tagLink(links(h, 'sleep').pairs, 'алкоголь')
    const ld = ladder(h, 'sleep', l)!
    expect(ld.steps.map((s) => (s.mean === null ? null : round1(s.mean)))).toEqual([6, 5, 4, 2])
    expect(ld.trend).toBe('worse')
  })

  it('цель «Продуктивность» (вечер того же дня, не утро) — та же лесенка, что и на «all»', () => {
    const h = hist(LINK_DAYS, (i) => {
      const lvl = doseLevels.get(i)
      const prod = new Map([
        [4, 5], [8, 5], [12, 5], [15, 5],
        [19, 4], [22, 4], [26, 4], [29, 4],
        [33, 2], [36, 2], [40, 2], [43, 2],
      ]).get(i) ?? 6
      return { prod, ...(lvl ? { tags: ['алкоголь'], levels: { 'алкоголь': lvl } } : {}) }
    })
    const l = tagLink(links(h, 'productivity').pairs, 'алкоголь')
    const ld = ladder(h, 'productivity', l)!
    expect(ld.steps.map((s) => (s.mean === null ? null : round1(s.mean)))).toEqual([6, 5, 4, 2])
    expect(ld.trend).toBe('worse')
  })

  it('окно LINK_DAYS соблюдается: мусор за пределами последних 56 дней не меняет ни Link, ни лесенку', () => {
    // 20 старых дней с алкоголем на ступени 1 и утром 0 — вне окна; итог должен совпасть с «доза действует»
    const junk = hist(20, () => ({ tags: ['алкоголь'], levels: { 'алкоголь': 1 }, m: 0 }))
    const hG = buildDose(new Map([
      [4, 5], [8, 5], [12, 5], [15, 5],
      [19, 4], [22, 4], [26, 4], [29, 4],
      [33, 2], [36, 2], [40, 2], [43, 2],
    ]))
    const h = [...junk, ...hG]
    const l = tagLink(links(h, 'all').pairs, 'алкоголь')
    expect(l.withN).toBe(12)
    const ld = ladder(h, 'all', l)!
    expect(ld.steps.map((s) => [s.level, s.n, s.mean === null ? null : round1(s.mean)])).toEqual([
      [0, 43, 6],
      [1, 4, 5],
      [2, 4, 4],
      [3, 4, 2],
    ])
    expect(ld.trend).toBe('worse')
  })

  it('«не указано» не участвует ни в монотонности, ни в наклоне: добавь 3 таких точки с «чужим» значением — trend не меняется', () => {
    // 3 вечера с тегом без ступени (level = null), результат — 1 (далеко от ряда 6,5,4,2, но за пределы
    // «показанных» ступеней 1..3 и «не было» они не попадают ни при подсчёте среднего/монотонности, ни в
    // наклоне дозы — те же trend/steps/mean по ступеням 0..3, что и в базовом мире «доза действует»)
    const hG = buildDose(new Map([
      [4, 5], [8, 5], [12, 5], [15, 5],
      [19, 4], [22, 4], [26, 4], [29, 4],
      [33, 2], [36, 2], [40, 2], [43, 2],
    ]))
    const wildPrev = [45, 47, 49]
    const h = hG.map((d, i) =>
      wildPrev.includes(i)
        ? { ...d, tags: ['алкоголь'] } // тег есть, levels нет — «не указано»
        : wildPrev.map((x) => x + 1).includes(i)
          ? { ...d, morning: d.morning && { ...d.morning, wellbeing: 1, mood: 1 } }
          : d,
    )
    const l = tagLink(links(h, 'all').pairs, 'алкоголь')
    expect(l.withN).toBe(15) // 12 со ступенью + 3 «не указано» — тег засчитан в links() независимо от ступени
    const ld = ladder(h, 'all', l)!
    expect(ld.steps.map((s) => [s.level, s.n, s.mean === null ? null : round1(s.mean)])).toEqual([
      [0, 40, 6], // «не было» не выросло — «не указано» не смешалось с «не было» (43 − 3 тега = 40)
      [1, 4, 5],
      [2, 4, 4],
      [3, 4, 2],
      [null, 3, 1], // сама ступень «не указано» показана отдельно и честно (n = 3, mean = 1)
    ])
    expect(ld.trend).toBe('worse')
  })

  it('незакрытый вечер и неотмеченное утро результата не дают точки (те же пары, что у связи)', () => {
    // тот же мир «доза действует»: день 3 — вечер не закрыт (тег снят автоматически), день 8 — утро не отмечено;
    // оба вечера были на ступени 1 — с неё пропадают именно эти две точки (осталось n = 2, среднего не показываем)
    const hG = buildDose(new Map([
      [4, 5], [8, 5], [12, 5], [15, 5],
      [19, 4], [22, 4], [26, 4], [29, 4],
      [33, 2], [36, 2], [40, 2], [43, 2],
    ]))
    const h = hG.map((d, i) => (i === 3 ? { ...d, evening: null, tags: [] } : i === 8 ? { ...d, morning: null, started: false } : d))
    const l = tagLink(links(h, 'all').pairs, 'алкоголь')
    expect(l.withN).toBe(10)
    const ld = ladder(h, 'all', l)!
    expect(ld.steps.map((s) => [s.level, s.n, s.mean === null ? null : round1(s.mean)])).toEqual([
      [0, 43, 6],
      [1, 2, null],
      [2, 4, 4],
      [3, 4, 2],
    ])
  })

  it('«игры» (4 ступени): та же логика на теге с бо́льшим числом ступеней — trend «worse»', () => {
    // ступени 1..4 по 4/4/4/3 вечера, утра 5, 4.5, 3, 1 — видимые средние 6,5,4.5,3,1 нестрого убывают,
    // разница показанных 1 и 4: |1 − 5| = 4 ≥ 1; наклон дозы по 4 точкам x=1..4 тоже значим (эталон это подтверждает)
    const l1p = [3, 7, 11, 14]
    const l2p = [18, 21, 25, 28]
    const l3p = [32, 35, 39, 42]
    const l4p = [46, 49, 52]
    const h = hist(LINK_DAYS, (i) => {
      const lvl = l1p.includes(i) ? 1 : l2p.includes(i) ? 2 : l3p.includes(i) ? 3 : l4p.includes(i) ? 4 : undefined
      const m = l1p.map((x) => x + 1).includes(i)
        ? 5
        : l2p.map((x) => x + 1).includes(i)
          ? 4.5
          : l3p.map((x) => x + 1).includes(i)
            ? 3
            : l4p.map((x) => x + 1).includes(i)
              ? 1
              : 6
      return { m, ...(lvl ? { tags: ['игры'], levels: { 'игры': lvl } } : {}) }
    })
    const l = tagLink(links(h, 'all').pairs, 'игры')
    expect(l.withN).toBe(15)
    const ld = ladder(h, 'all', l)!
    expect(ld.steps.map((s) => [s.level, s.n, s.mean === null ? null : round1(s.mean)])).toEqual([
      [0, 40, 6],
      [1, 4, 5],
      [2, 4, 4.5],
      [3, 4, 3],
      [4, 3, 1],
    ])
    expect(ld.trend).toBe('worse')
  })

  describe('условие 1 — связь найдена (link.level — maybe или notable)', () => {
    it('level «none» или «early» на настоящем Link из «доза действует» — trend null (эталон: у «none» падает только c1)', () => {
      // берём Link из мира «доза действует» (там все 6 условий выполняются) и меняем только level —
      // history и остальные поля Link не трогаем: c2..c6 по эталону остаются true, блокирует один c1
      const hG = buildDose(new Map([
        [4, 5], [8, 5], [12, 5], [15, 5],
        [19, 4], [22, 4], [26, 4], [29, 4],
        [33, 2], [36, 2], [40, 2], [43, 2],
      ]))
      const l = tagLink(links(hG, 'all').pairs, 'алкоголь')
      expect(ladder(hG, 'all', { ...l, level: 'none' })!.trend).toBeNull()
      expect(ladder(hG, 'all', { ...l, level: 'early', direction: null })!.trend).toBeNull()
    })
  })

  describe('условие 2 — withN ≥ LADDER_TOTAL (12)', () => {
    it('см. «доза действует» (withN = 12 — проходит) и «withN = 11» выше (граница снизу — trend null)', () => {
      // тесты — в общем блоке выше, чтобы не дублировать построение мира; здесь — только ссылка-проверка
      expect(LADDER_TOTAL).toBe(12)
    })
  })

  describe('условие 3 — показанных ступеней (n ≥ LADDER_MIN) не меньше двух', () => {
    it('только одна ступень набрала LADDER_MIN, дозу сравнивать не с чем — trend null (эталон: падает c3; тривиально и c5 — разница «показанной» с собой же 0, c1/c2/c4/c6 — true)', () => {
      // 10 вечеров на ступени 1 (показана), по одному на ступенях 2 и 3 (n=1 каждая, не показаны) — withN=12
      const l1 = [1, 4, 6, 8, 11, 13, 15, 18, 20, 22]
      const l2 = [25]
      const l3 = [27]
      const l1prev = l1.map((x) => x - 1)
      const l2prev = l2.map((x) => x - 1)
      const l3prev = l3.map((x) => x - 1)
      const h = hist(LINK_DAYS, (i) => {
        const m = l1.includes(i) ? 5 : l2.includes(i) ? 4 : l3.includes(i) ? 2 : 6
        const lvl = l1prev.includes(i) ? 1 : l2prev.includes(i) ? 2 : l3prev.includes(i) ? 3 : undefined
        return { m, ...(lvl ? { tags: ['алкоголь'], levels: { 'алкоголь': lvl } } : {}) }
      })
      const l = tagLink(links(h, 'all').pairs, 'алкоголь')
      expect(l.withN).toBe(12)
      expect(l.level).toBe('maybe')
      const ld = ladder(h, 'all', l)!
      expect(ld.steps.map((s) => [s.level, s.n, s.mean === null ? null : round1(s.mean)])).toEqual([
        [0, 43, 6],
        [1, 10, 5],
        [2, 1, null],
        [3, 1, null],
      ])
      expect(ld.trend).toBeNull()
    })
  })

  describe('условие 4 — видимые средние (округлённые) НЕСТРОГО монотонны в сторону direction', () => {
    it('рост на одной из ступеней ломает даже нестрогую монотонность — trend null (эталон: падает только c4; c1/c2/c3/c5/c6 — true)', () => {
      // тот же мир «доза действует», но ступень 2 — снова 6 (как «не было», а не ниже): 6, 5, 6, 2 —
      // 5 → 6 растёт при direction «worse». Наклон дозы (по точкам, не по средним) всё равно значим:
      // b = −1,5, se ≈ 0,456, span = −3, shrunk ≈ −2,19 (знак и модуль в порядке) — блокирует только монотонность.
      const h = buildDose(new Map([
        [4, 5], [8, 5], [12, 5], [15, 5],
        [19, 6], [22, 6], [26, 6], [29, 6],
        [33, 2], [36, 2], [40, 2], [43, 2],
      ]))
      const l = tagLink(links(h, 'all').pairs, 'алкоголь')
      const ld = ladder(h, 'all', l)!
      expect(ld.steps.map((s) => (s.mean === null ? null : round1(s.mean)))).toEqual([6, 5, 6, 2])
      expect(ld.trend).toBeNull()
      expect(ld.firstLikeNone).toBe(false) // trend null ⇒ firstLikeNone false (здесь ступень 1 — 5 против 6)
    })

    it('ничья соседних ступеней допустима — trend не null (эталон: c1..c6 все true)', () => {
      // ступени 1 и 2 совпадают: 6, 4, 4, 2 — 4 → 4 не растёт, нестрогая монотонность соблюдена.
      // наклон по точкам всё равно есть (x=1,2,3, y=4,4,2): b=−1, span=−2, shrunk≈−1,888 ≥ 1 по модулю.
      const h = buildDose(new Map([
        [4, 4], [8, 4], [12, 4], [15, 4],
        [19, 4], [22, 4], [26, 4], [29, 4],
        [33, 2], [36, 2], [40, 2], [43, 2],
      ]))
      const l = tagLink(links(h, 'all').pairs, 'алкоголь')
      const ld = ladder(h, 'all', l)!
      expect(ld.steps.map((s) => (s.mean === null ? null : round1(s.mean)))).toEqual([6, 4, 4, 2])
      expect(ld.trend).toBe('worse')
    })
  })

  describe('условие 5 — видимая разница первой и последней ПОКАЗАННОЙ ступени ≥ LINK_DIFF', () => {
    // ступень 3 намеренно редкая (n=2 < LADDER_MIN) — не «показана»; наклон дозы всё равно берёт её точки
    // (doseSlope не фильтрует по LADDER_MIN), поэтому наклон остаётся сильным и не изображает границу.
    // «показанные» — только ступени 1 и 2: их разница и есть граница условия 5.
    const mk = (level2: number) => {
      const l1p = [3, 7, 11, 14, 17] // n=5
      const l2p = [21, 24, 27, 30, 33] // n=5
      const l3p = [40, 43] // n=2, не показана
      const h = hist(LINK_DAYS, (i) => {
        const lvl = l1p.includes(i) ? 1 : l2p.includes(i) ? 2 : l3p.includes(i) ? 3 : undefined
        const m = l1p.map((x) => x + 1).includes(i) ? 5.5 : l2p.map((x) => x + 1).includes(i) ? level2 : l3p.map((x) => x + 1).includes(i) ? 0 : 6
        return { m, ...(lvl ? { tags: ['алкоголь'], levels: { 'алкоголь': lvl } } : {}) }
      })
      return h
    }

    it('разница ровно 1,0 — проходит (эталон: c1..c6 все true, firstLikeNone true — |5,5 − 6| = 0,5 < 1)', () => {
      const h = mk(4.5)
      const l = tagLink(links(h, 'all').pairs, 'алкоголь')
      expect(l.withN).toBe(12)
      const ld = ladder(h, 'all', l)!
      expect(ld.steps.map((s) => [s.level, s.n, s.mean === null ? null : round1(s.mean)])).toEqual([
        [0, 43, 6],
        [1, 5, 5.5],
        [2, 5, 4.5],
        [3, 2, null],
      ])
      expect(ld.trend).toBe('worse')
      expect(ld.firstLikeNone).toBe(true)
    })

    it('разница 0,9 — trend null (эталон: падает только c5; c1/c2/c3/c4/c6 — true)', () => {
      const h = mk(4.6)
      const l = tagLink(links(h, 'all').pairs, 'алкоголь')
      expect(l.withN).toBe(12)
      const ld = ladder(h, 'all', l)!
      expect(ld.steps.map((s) => [s.level, s.n, s.mean === null ? null : round1(s.mean)])).toEqual([
        [0, 43, 6],
        [1, 5, 5.5],
        [2, 5, 4.6],
        [3, 2, null],
      ])
      expect(ld.trend).toBeNull()
      // |5,5 − 6| = 0,5 < 1, но trend null ⇒ firstLikeNone false (§4: «при trend ≠ null»)
      expect(ld.firstLikeNone).toBe(false)
    })
  })

  describe('условие 6 — наклон дозы по слоям (doseSlope): знак — как direction, |shrunk| ≥ LINK_DIFF', () => {
    it('видимые средние монотонны и разница большая, но разброс внутри ступеней гасит наклон — trend null (эталон: падает только c6; c1..c5 — true)', () => {
      // ступень 1 — значения 9,1,9,1 (mean 5, как в «доза действует»); ступень 3 — 6,−2,6,−2 (mean 2).
      // Средние ступеней те же 6,5,4,2 (условия 4 и 5 в порядке), но внутри ступеней 1 и 3 огромный разброс:
      // МНК-наклон b по-прежнему −1,5 (средние не изменились), но остаточная дисперсия s² подскакивает —
      // se ≈ 1,268 (было ≈ 0,091), shrunk = shrink(−3, se·2) ≈ −0,777 — по модулю меньше LINK_DIFF (1).
      const l1p = [3, 7, 11, 14]
      const l2p = [18, 21, 25, 28]
      const l3p = [32, 35, 39, 42]
      const l1vals = [9, 1, 9, 1]
      const l3vals = [6, -2, 6, -2]
      const h = hist(LINK_DAYS, (i) => {
        const lvl = l1p.includes(i) ? 1 : l2p.includes(i) ? 2 : l3p.includes(i) ? 3 : undefined
        let m = 6
        const l1r = l1p.map((x) => x + 1)
        const l3r = l3p.map((x) => x + 1)
        if (l1r.includes(i)) m = l1vals[l1r.indexOf(i)]!
        if (l2p.map((x) => x + 1).includes(i)) m = 4
        if (l3r.includes(i)) m = l3vals[l3r.indexOf(i)]!
        return { m, ...(lvl ? { tags: ['алкоголь'], levels: { 'алкоголь': lvl } } : {}) }
      })
      const l = tagLink(links(h, 'all').pairs, 'алкоголь')
      expect(l.withN).toBe(12)
      const ld = ladder(h, 'all', l)!
      // видимые средние по ступеням — те же, что в «доза действует» (разброс внутри ступени на них не влияет)
      expect(ld.steps.map((s) => (s.mean === null ? null : round1(s.mean)))).toEqual([6, 5, 4, 2])
      expect(ld.trend).toBeNull()
    })
  })

  it('ступень с 0 < n < LADDER_MIN (n=2) пропускается сама — соседние показанные ступени всё равно образуют тренд', () => {
    // ступень 2 — только 2 вечера (не показана, doseSlope её точки всё равно использует); ступени 1 и 3 —
    // по 5 вечеров, значения на прямой 5, 3.5, 2 (линейно) — наклон идеально ложится на эту прямую (se = 0)
    const l1p = [3, 6, 9, 12, 15] // n=5
    const l2p = [20, 23] // n=2, не показана
    const l3p = [30, 33, 36, 39, 42] // n=5
    const h = hist(LINK_DAYS, (i) => {
      const lvl = l1p.includes(i) ? 1 : l2p.includes(i) ? 2 : l3p.includes(i) ? 3 : undefined
      const m = l1p.map((x) => x + 1).includes(i) ? 5 : l2p.map((x) => x + 1).includes(i) ? 3.5 : l3p.map((x) => x + 1).includes(i) ? 2 : 6
      return { m, ...(lvl ? { tags: ['алкоголь'], levels: { 'алкоголь': lvl } } : {}) }
    })
    const l = tagLink(links(h, 'all').pairs, 'алкоголь')
    expect(l.withN).toBe(12)
    const ld = ladder(h, 'all', l)!
    expect(ld.steps.map((s) => [s.level, s.n, s.mean === null ? null : round1(s.mean)])).toEqual([
      [0, 43, 6],
      [1, 5, 5],
      [2, 2, null], // пропущена, но не блокирует: «показанные» — 1 и 3
      [3, 5, 2],
    ])
    expect(ld.trend).toBe('worse')
  })
})

describe('cases — верхняя ступень как отдельный случай (срез 5б)', () => {
  it('тег частый (8 вечеров), но верхняя ступень редкая (2 раза), оба утра заметно ниже обычного — случай со ступенью', () => {
    const l1p = [2, 7, 12, 17, 22, 27] // 6 вечеров на ступени 1 — обычные утра; тег целиком не случай: 8 ≥ LINK_MIN
    const l3p = [32, 37] // 2 вечера на верхней ступени (3 — верхняя у алкоголя)
    const h = hist(LINK_DAYS, (i) => {
      if (l1p.includes(i)) return { tags: ['алкоголь'], levels: { 'алкоголь': 1 } }
      if (l3p.includes(i)) return { tags: ['алкоголь'], levels: { 'алкоголь': 3 } }
      if (i === 33) return { m: 3 }
      if (i === 38) return { m: 2 }
      return {}
    })
    // usual = медиана «без тега целиком» = 6 (все остальные утра — дефолт); 3 ≤ 6−1 и 2 ≤ 6−1 — оба подходят
    expect(cases(h, 'all')).toEqual([{ tag: 'алкоголь', level: 3, values: [3, 2], days: [h[33]!.day, h[38]!.day], usual: 6, missing: 0 }])
  })

  it('пропуск утра на верхней ступени считается так же, как у случая тега целиком', () => {
    const l1p = [2, 7, 12, 17]
    const l3p = [22, 27, 32] // 3 вечера на верхней ступени: 2 утра записаны, 1 — нет
    const h = hist(LINK_DAYS, (i) => {
      if (l1p.includes(i)) return { tags: ['алкоголь'], levels: { 'алкоголь': 1 } }
      if (l3p.includes(i)) return { tags: ['алкоголь'], levels: { 'алкоголь': 3 } }
      if (i === 23) return { m: 3 }
      if (i === 28) return { m: 2 }
      if (i === 33) return { m: null }
      return {}
    })
    // missing = episodes(3) − values.length(2) = 1
    expect(cases(h, 'all')).toEqual([{ tag: 'алкоголь', level: 3, values: [3, 2], days: [h[23]!.day, h[28]!.day], usual: 6, missing: 1 }])
  })

  it('все вечера тега — уже на верхней ступени: случай тега целиком, отдельного случая ступени не дублируется', () => {
    const h = hist(LINK_DAYS, (i) => {
      if (i === 20) return { tags: ['алкоголь'], levels: { 'алкоголь': 3 } }
      if (i === 40) return { tags: ['алкоголь'], levels: { 'алкоголь': 3 } }
      if (i === 21) return { m: 3 }
      if (i === 41) return { m: 4 }
      return {}
    })
    // те же дни, что и случай тега целиком (links.test.ts, describe cases выше) — ступень не добавляет вторую запись
    expect(cases(h, 'all')).toEqual([{ tag: 'алкоголь', values: [3, 4], days: [h[21]!.day, h[41]!.day], usual: 6, missing: 0 }])
  })

  it('верхней ступени нужна ровно верхняя: спайк на средней ступени случаем не становится', () => {
    const l1p = [2, 7, 12, 17, 22]
    const l2p = [27, 32] // ступень 2 из 3 — не верхняя (верхняя у алкоголя — 3)
    const h = hist(LINK_DAYS, (i) => {
      if (l1p.includes(i)) return { tags: ['алкоголь'], levels: { 'алкоголь': 1 } }
      if (l2p.includes(i)) return { tags: ['алкоголь'], levels: { 'алкоголь': 2 } }
      if (i === 28) return { m: 3 }
      if (i === 33) return { m: 2 }
      return {}
    })
    expect(cases(h, 'all')).toEqual([])
  })

  it('«игры» (4 ступени): верхняя — ровно 4, не 3 (мутант «level === 3» здесь бы выжил)', () => {
    const l1p = [2, 7, 12, 17, 22, 27] // 6 вечеров на ступени 1 — обычные утра
    const l4p = [32, 37] // 2 вечера на верхней ступени игр (4, не 3)
    const h = hist(LINK_DAYS, (i) => {
      if (l1p.includes(i)) return { tags: ['игры'], levels: { 'игры': 1 } }
      if (l4p.includes(i)) return { tags: ['игры'], levels: { 'игры': 4 } }
      if (i === 33) return { m: 3 }
      if (i === 38) return { m: 2 }
      return {}
    })
    expect(cases(h, 'all')).toEqual([{ tag: 'игры', level: 4, values: [3, 2], days: [h[33]!.day, h[38]!.day], usual: 6, missing: 0 }])
  })

  it('«игры»: спайк на ступени 3 (не верхняя — верхняя 4) случаем не становится', () => {
    const l1p = [2, 7, 12, 17, 22]
    const l3p = [27, 32] // ступень 3 из 4 — не верхняя у игр
    const h = hist(LINK_DAYS, (i) => {
      if (l1p.includes(i)) return { tags: ['игры'], levels: { 'игры': 1 } }
      if (l3p.includes(i)) return { tags: ['игры'], levels: { 'игры': 3 } }
      if (i === 28) return { m: 3 }
      if (i === 33) return { m: 2 }
      return {}
    })
    expect(cases(h, 'all')).toEqual([])
  })

  it('верхняя ступень сама по себе частая (≥ LINK_MIN эпизодов) — случая нет, как и у тега целиком', () => {
    // 5 вечеров на верхней ступени (episodes = LINK_MIN) — ни как случай тега целиком, ни как случай ступени
    const l3 = [2, 10, 18, 26, 34]
    const l3prev = l3.map((x) => x - 1)
    const h = hist(LINK_DAYS, (i) => {
      const m = l3.includes(i) ? 2 : 6
      return { m, ...(l3prev.includes(i) ? { tags: ['алкоголь'], levels: { 'алкоголь': 3 } } : {}) }
    })
    expect(cases(h, 'all')).toEqual([])
  })

  it('usual верхней ступени — медиана «без тега целиком», а не «без верхней ступени» (частая ступень 1 не должна тянуть usual вниз)', () => {
    // 30 вечеров на ступени 1 (не верхняя, индексы 0..29), утро после — 3; 2 вечера на верхней ступени 3
    // (40, 45), утро после — 4. Тег и утро назначаются независимо (Map, а не цепочка if/return), чтобы
    // пересечение диапазонов «вечер со ступенью» и «утро-результат» (30 и 31 — оба сразу) не затирало
    // одно другим. usual считается по дням БЕЗ тега целиком (23 дефолтных утра = 6), а не по дням «без
    // верхней ступени» (это дало бы медиану ≈ 3 из-за 30 троек — тогда 4 не прошло бы порог usual−1).
    const l1p = Array.from({ length: 30 }, (_, k) => k) // индексы вечеров со ступенью 1: 0..29
    const l1r = l1p.map((x) => x + 1) // индексы утр-результатов ступени 1: 1..30
    const l3p = [40, 45]
    const l3r = l3p.map((x) => x + 1) // 41, 46
    const h = hist(LINK_DAYS, (i) => {
      const lvl = l1p.includes(i) ? 1 : l3p.includes(i) ? 3 : undefined
      const m = l1r.includes(i) ? 3 : l3r.includes(i) ? 4 : 6
      return { m, ...(lvl ? { tags: ['алкоголь'], levels: { 'алкоголь': lvl } } : {}) }
    })
    expect(cases(h, 'all')).toEqual([{ tag: 'алкоголь', level: 3, values: [4, 4], days: [h[41]!.day, h[46]!.day], usual: 6, missing: 0 }])
  })

  it('сегодняшнее утро, ещё не отмеченное, — не пропуск и для случая верхней ступени', () => {
    // вечера 30 и 35 — ступень 1 с обычным утром (6): тег целиком не случай (6 > 6 − 1), иначе случай ступени
    // скрылся бы за случаем тега целиком (§5, §9). Верхняя ступень: вечер 20 → утро 21 (2) и вечер 54 → сегодня 55 (не отмечено).
    const h = hist(LINK_DAYS, (i) => ({
      tags: [20, 30, 35, 54].includes(i) ? ['алкоголь'] : [],
      levels: i === 20 || i === 54 ? { 'алкоголь': 3 } : i === 30 || i === 35 ? { 'алкоголь': 1 } : undefined,
      m: i === 21 ? 2 : i === 55 ? null : 6,
      e: i === 55 ? null : 6,
    }))
    expect(cases(h, 'all')).toEqual([{ tag: 'алкоголь', level: 3, values: [2], days: [h[21]!.day], usual: 6, missing: 0 }])
  })

  it('сортировка и CASES_SHOWN = 2 — вместе с обычными случаями (случай верхней ступени наравне с остальными)', () => {
    // ссора (тег целиком, −5), алкоголь · верхняя (−3), учёба (тег целиком, −1): показываются двое худших, случай
    // ступени сортируется наравне с обычными. У алкоголя ещё 2 вечера на ступени 1 с утром 6 — тег целиком не случай.
    // («дорога» сюда не годится: она в CONTEXT_TAGS и случаем не бывает вовсе.)
    const h = hist(LINK_DAYS, (i) => {
      if (i === 5) return { tags: ['ссора'] }
      if (i === 6) return { m: 1 }
      if (i === 15) return { tags: ['учёба'] }
      if (i === 16) return { m: 5 }
      if (i === 25) return { tags: ['алкоголь'], levels: { 'алкоголь': 3 } }
      if (i === 26) return { m: 3 }
      if (i === 30 || i === 35) return { tags: ['алкоголь'], levels: { 'алкоголь': 1 } }
      return {}
    })
    expect(cases(h, 'all')).toEqual([
      { tag: 'ссора', values: [1], days: [h[6]!.day], usual: 6, missing: 0 },
      { tag: 'алкоголь', level: 3, values: [3], days: [h[26]!.day], usual: 6, missing: 0 },
    ])
  })
})

describe('ladder — пограничные случаи (срез 5б)', () => {
  /** Мир: `lv` — [вечера, ступень (null — «не указано»), значения утра после каждого вечера]; остальные утра — `none`. */
  const world = (tag: string, lv: [number[], number | null, number[]][], none = 6) =>
    hist(LINK_DAYS, (i) => {
      const hit = lv.find(([ev]) => ev.includes(i))
      const res = lv.find(([ev]) => ev.includes(i - 1))
      const m = res ? res[2][res[0].indexOf(i - 1)]! : none
      return { m, ...(hit ? { tags: [tag], ...(hit[1] !== null ? { levels: { [tag]: hit[1] } } : {}) } : {}) }
    })

  it('C: разница по видимым числам и сама округлена: сырые 4,06 и 3,14 → видимые 4,1 и 3,1 — проходит', () => {
    // сырая разница 0,92 < 1; видимая 4,1 − 3,1 = 0,9999999999999996 в double → round1 → 1,0 ≥ 1
    const h = world('алкоголь', [
      [[3, 7, 11, 14, 17], 1, [4, 4, 4, 4, 4.3]],
      [[21, 24, 27, 30, 33], 2, [3, 3, 3, 3, 3.7]],
      [[40, 43], 3, [0, 0]],
    ])
    const l = tagLink(links(h, 'all').pairs, 'алкоголь')
    expect(l.withN).toBe(12)
    const ld = ladder(h, 'all', l)!
    expect(ld.steps[1]!.mean).toBeCloseTo(4.06, 9) // сырое среднее (§9), не 4,1
    expect(ld.steps[2]!.mean).toBeCloseTo(3.14, 9)
    expect(ld.trend).toBe('worse')
    expect(ld.firstLikeNone).toBe(false)
  })

  it('E: ступень совпадает с выходными (3 — только перед субботой, 1 — перед вторником) — в слое одна ступень, наклона нет: trend null', () => {
    // «не было»: будни 6, воскресенье 4; ступень 1 → вторник 4,5; ступень 3 → суббота 2,5 (внутри слоя −1,5 на любой ступени).
    // видимые 5,6 → 4,5 → 2,5, разница 2 — условия 1–5 выполнены; слой «будни» — только ступень 1, «выходные» — только 3 ⇒
    // doseSlope null ⇒ условие 6 не выполнено. Наклон без слоёв дал бы −1 на ступень (span −2, se 0) и «worse».
    const h = hist(LINK_DAYS, (_i, dow) => ({
      m: dow === 5 ? 2.5 : dow === 1 ? 4.5 : dow === 6 ? 4 : 6,
      ...(dow === 4 ? { tags: ['алкоголь'], levels: { 'алкоголь': 3 } } : dow === 0 ? { tags: ['алкоголь'], levels: { 'алкоголь': 1 } } : {}),
    }))
    const l = tagLink(links(h, 'all').pairs, 'алкоголь')
    expect(['maybe', 'notable']).toContain(l.level)
    expect(l.withN).toBe(16)
    const ld = ladder(h, 'all', l)!
    expect(ld.steps.map((s) => [s.level, s.n, s.mean === null ? null : Math.round(s.mean * 10) / 10])).toEqual([
      [0, 39, 5.6],
      [1, 8, 4.5],
      [2, 0, null],
      [3, 8, 2.5],
    ])
    expect(ld.trend).toBeNull()
  })

  it('F: размах — по числу ступеней тега: у игр (4) наклон −0,4 даёт span −1,2 (а не −0,8) — trend «worse»', () => {
    const h = world('игры', [
      [[3, 7, 11], 1, [5.5, 5.5, 5.5]],
      [[14, 18, 21], 2, [5.1, 5.1, 5.1]],
      [[25, 28, 32], 3, [4.7, 4.7, 4.7]],
      [[35, 39, 42], 4, [4.3, 4.3, 4.3]],
    ], 6.5)
    const l = tagLink(links(h, 'all').pairs, 'игры')
    expect(l.withN).toBe(12)
    expect(ladder(h, 'all', l)!.trend).toBe('worse')
  })

  it('G: «не было» входит в монотонность: ступень 1 выше «не было» — trend null', () => {
    const h = world('алкоголь', [
      [[3, 7, 11, 14], 1, [6.3, 6.3, 6.3, 6.3]],
      [[18, 21, 25, 28], 2, [4, 4, 4, 4]],
      [[32, 35, 39, 42], 3, [2.5, 2.5, 2.5, 2.5]],
    ])
    const l = tagLink(links(h, 'all').pairs, 'алкоголь')
    expect(['maybe', 'notable']).toContain(l.level)
    expect(ladder(h, 'all', l)!.trend).toBeNull()
  })

  it('H: условие 2 — по link.withN (с «не указано»): 10 со ступенью + 3 без — 13 ≥ 12, trend «worse»', () => {
    const h = world('алкоголь', [
      [[3, 7, 11], 1, [5, 5, 5]],
      [[18, 21, 25], 2, [4, 4, 4]],
      [[32, 35, 39, 42], 3, [2, 2, 2, 2]],
      [[45, 47, 49], null, [3, 3, 3]],
    ])
    const l = tagLink(links(h, 'all').pairs, 'алкоголь')
    expect(l.withN).toBe(13)
    expect(ladder(h, 'all', l)!.trend).toBe('worse')
  })

  it('I: ни одной показанной ступени (по 2 вечера на ступень + 6 «не указано», withN 12) — trend null', () => {
    const h = world('алкоголь', [
      [[3, 7], 1, [5, 5]],
      [[11, 14], 2, [4, 4]],
      [[18, 21], 3, [2, 2]],
      [[25, 28, 32, 35, 39, 42], null, [3, 3, 3, 3, 3, 3]],
    ])
    const l = tagLink(links(h, 'all').pairs, 'алкоголь')
    expect(l.withN).toBe(12)
    expect(['maybe', 'notable']).toContain(l.level)
    expect(ladder(h, 'all', l)!.trend).toBeNull()
  })
  it('J: монотонность — по видимым числам: сырые 3,98 и 4,02 видны как 4,0 и 4,0 (ничья) — trend «worse»', () => {
    const h = world('алкоголь', [
      [[3, 7, 11, 14], 1, [4, 4, 4, 3.92]],
      [[18, 21, 25, 28], 2, [4, 4, 4, 4.08]],
      [[32, 35, 39, 42], 3, [2, 2, 2, 2]],
    ])
    const l = tagLink(links(h, 'all').pairs, 'алкоголь')
    const ld = ladder(h, 'all', l)!
    expect(ld.steps[1]!.mean).toBeCloseTo(3.98, 9)
    expect(ld.steps[2]!.mean).toBeCloseTo(4.02, 9)
    expect(ld.trend).toBe('worse')
  })
})
