import { describe, expect, it } from 'vitest'
import { addDays, dayKey, isoDow, parseDay } from './date'
import { cases, CONTEXT_TAGS, explains, LINK_DAYS, LINK_MIN, links, shrink, type Link } from './links'
import type { TimelineDay } from './timeline'

const TODAY = parseDay('2026-09-23') // среда

type Spec = { m?: number | null; e?: number | null; sleep?: number; prod?: number; tags?: string[] }

/** История из `len` дней по сегодня; `dow` — 0 понедельник … 6 воскресенье. По умолчанию утро и вечер 6, сон 7. */
function hist(len: number, spec: (i: number, dow: number) => Spec = () => ({})): TimelineDay[] {
  return Array.from({ length: len }, (_, i) => {
    const date = addDays(TODAY, i - len + 1)
    const { m = 6, e = 6, sleep = 7, prod = 6, tags = [] } = spec(i, isoDow(date))
    return {
      day: dayKey(date),
      morning: m === null ? null : { sleep, wellbeing: m, mood: m },
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
    expect(r.found).toBe(3)
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
    expect(links(h, 'all').cards).toEqual([])
  })

  it('утро без вечера не считается', () => {
    const h = hist(LINK_DAYS, (i) => ({ sleep: i % 8 === 1 ? 4 : 8, e: i === 1 ? null : i % 8 === 1 ? 3 : 7 }))
    expect(badSleepLink(links(h, 'all').pairs)!.withN).toBe(6)
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

  it('дни до первой записи не портят долю: новый пользователь с 20 днями', () => {
    const h = hist(LINK_DAYS, (i) => (i < 36 ? { m: null, e: null } : {}))
    expect(links(h, 'all').gate).toMatchObject({ ok: true, recorded: 20 })
  })
})

describe('cases — редкие сильные случаи', () => {
  it('тег 1–4 раза, все утра после ниже обычного на балл и больше — перечисляются', () => {
    const h = hist(LINK_DAYS, (i) => ({ tags: i === 20 || i === 40 ? ['ссора'] : [], m: i === 21 ? 3 : i === 41 ? 4 : 6 }))
    expect(cases(h, 'all')).toEqual([{ tag: 'ссора', values: [3, 4], days: [h[21]!.day, h[41]!.day], usual: 6 }])
  })

  it('хоть одно утро не ниже обычного на балл — не случай', () => {
    const h = hist(LINK_DAYS, (i) => ({ tags: i === 20 || i === 40 ? ['ссора'] : [], m: i === 21 ? 3 : i === 41 ? 5.1 : 6 }))
    expect(cases(h, 'all')).toEqual([])
  })

  it('5 раз и больше — это уже связь, не случай; «не в моих силах» — не случай', () => {
    const five = hist(LINK_DAYS, (i) => ({ tags: i % 10 === 2 ? ['ссора'] : [], m: (i - 1) % 10 === 2 ? 3 : 6 }))
    expect(cases(five, 'all')).toEqual([])
    const ill = hist(LINK_DAYS, (i) => ({ tags: i === 20 ? ['болел'] : [], m: i === 21 ? 2 : 6 }))
    expect(cases(ill, 'all')).toEqual([])
  })

  it('по цели: сон утром; сильнейшие первыми, не больше двух', () => {
    const h = hist(LINK_DAYS, (i) => ({
      tags: i === 10 ? ['ссора'] : i === 20 ? ['дедлайн'] : i === 30 ? ['встречи'] : [],
      sleep: i === 11 ? 5 : i === 21 ? 2 : i === 31 ? 4 : 7,
    }))
    expect(cases(h, 'sleep').map((c) => [c.tag, c.values])).toEqual([
      ['дедлайн', [2]],
      ['встречи', [4]],
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

  it('теги в моих силах сюда не идут; полосы нет — пусто', () => {
    const h = hist(LINK_DAYS, (i) => ({ m: [44, 46].includes(i) ? 3 : 6.5, e: [44, 46].includes(i) ? 3 : 6.5, tags: [44, 46].includes(i) ? ['алкоголь'] : [] }))
    expect(explains(h, start, band, 'all')).toEqual([])
    expect(explains(h, start, { kind: 'none', need: 3 }, 'all')).toEqual([])
  })
})
