import { describe, expect, it } from 'vitest'
import { addDays, dayKey, isoDow, parseDay } from './date'
import { cases, chain, CONTEXT_TAGS, explains, LINK_DAYS, LINK_MIN, links, NOT_MORE, shrink, type Link } from './links'
import type { TimelineDay } from './timeline'
import type { Challenge, EntryMap } from './types'

const TODAY = parseDay('2026-09-23') // среда

/** `bed`, `wake` — ночь перед этим утром (минуты от полуночи утра); без `bed` ночь не записана. */
type Spec = { m?: number | null; e?: number | null; sleep?: number; prod?: number; tags?: string[]; bed?: number; wake?: number }

/** История из `len` дней по сегодня; `dow` — 0 понедельник … 6 воскресенье. По умолчанию утро и вечер 6, сон 7. */
function hist(len: number, spec: (i: number, dow: number) => Spec = () => ({})): TimelineDay[] {
  return Array.from({ length: len }, (_, i) => {
    const date = addDays(TODAY, i - len + 1)
    const { m = 6, e = 6, sleep = 7, prod = 6, tags = [], bed, wake = 460 } = spec(i, isoDow(date))
    const night = bed === undefined ? null : { bed, wake, bedHow: 'exact' as const, wakeHow: 'exact' as const }
    return {
      day: dayKey(date),
      morning: m === null ? null : { sleep, wellbeing: m, mood: m, night },
      started: m !== null,
      evening: e === null ? null : { mood: e, wellbeing: e, productivity: prod },
      tags: e === null ? [] : tags,
    }
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
