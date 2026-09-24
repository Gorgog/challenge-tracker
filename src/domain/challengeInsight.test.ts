import { describe, expect, it } from 'vitest'
import { challengeInsight, startedTogether } from './challengeInsight'
import { addDays, dayKey, parseDay } from './date'
import type { TimelineDay } from './timeline'
import type { Challenge, EntryMap } from './types'

const TODAY = parseDay('2026-09-23')
const LEN = 56

type Spec = { m?: number | null; e?: null; tags?: string[] }
/** `len` дней по сегодня (индексы окна — от конца, как у 56); вечер закрыт, утро 6 — если не сказано иначе. */
function hist(spec: (i: number) => Spec = () => ({}), len = LEN): TimelineDay[] {
  return Array.from({ length: len }, (_, k) => {
    const i = k - (len - LEN)
    const { m = 6, e, tags = [] } = spec(i)
    return {
      day: dayKey(addDays(TODAY, i - LEN + 1)),
      morning: m === null ? null : { sleep: 7, wellbeing: m, mood: m },
      started: m !== null,
      evening: e === null ? null : { mood: 6, wellbeing: 6, productivity: 6 },
      tags: e === null ? [] : tags,
    }
  })
}
const dayOf = (i: number) => dayKey(addDays(TODAY, i - LEN + 1))
/** Отметки: выполнено во все прошедшие дни окна, кроме `miss(i)`. */
const marks = (miss: (i: number) => boolean): EntryMap =>
  Object.fromEntries(Array.from({ length: LEN - 1 }, (_, i) => i).filter((i) => !miss(i)).map((i) => [dayOf(i), 1]))

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

describe('challengeInsight — прогресс', () => {
  it('срочный: день с сегодняшним, выполнено из прошедших', () => {
    const c = { ...sport, startDate: dayKey(addDays(TODAY, -13)), lengthDays: 30 }
    const e = marks((i) => i % 3 === 0)
    const r = challengeInsight(c, e, hist(), TODAY)
    expect(r).toMatchObject({ day: 14, of: 30, ended: false, known: 13 })
    // прошедшие дни окна 42…54, пропуск — каждый третий: 42, 45, 48, 51, 54
    expect(r.hits).toBe(8)
  })

  it('бессрочный — без срока; закончившийся — ended', () => {
    expect(challengeInsight(sport, {}, hist(), TODAY)).toMatchObject({ of: null, ended: false })
    const done = { ...sport, startDate: '2026-08-01', lengthDays: 10 }
    expect(challengeInsight(done, {}, hist(), TODAY)).toMatchObject({ day: 10, of: 10, ended: true })
  })
})

describe('challengeInsight — привычка: тест плохого утра', () => {
  it('пропуски — в тяжёлые утра: сравнение нечестное, числа утр', () => {
    const h = hist((i) => ({ m: i % 4 === 0 ? 3 : 7 }))
    const r = challengeInsight(sport, marks((i) => i % 4 === 0), h, TODAY)
    expect(r.habit).toMatchObject({ misses: 14, done: 41, enough: true, unfair: true, mornings: { miss: 3, hit: 7 } })
  })

  it('сравнение — только за последние 56 дней', () => {
    const h = hist((i) => ({ m: i % 4 === 0 ? 3 : 7 }), 80)
    expect(challengeInsight(sport, marks((i) => i % 4 === 0), h, TODAY).habit).toMatchObject({ misses: 14, done: 41 })
  })

  it('пропусков меньше 5 — «пока рано», но проверка утр уже видна', () => {
    const miss = (i: number) => [10, 20, 30, 40].includes(i)
    const h = hist((i) => ({ m: miss(i) ? 3 : 7 }))
    expect(challengeInsight(sport, marks(miss), h, TODAY).habit).toMatchObject({ misses: 4, enough: false, unfair: true })
  })

  it('утра в дни пропусков такие же — честно', () => {
    const r = challengeInsight(sport, marks((i) => i % 4 === 0), hist(), TODAY)
    expect(r.habit).toMatchObject({ enough: true, unfair: false, mornings: { miss: 6, hit: 6 } })
  })

  it('разница утр меньше 0,7 — ещё честно', () => {
    const h = hist((i) => ({ m: i % 4 === 0 ? 5.4 : 6 }))
    expect(challengeInsight(sport, marks((i) => i % 4 === 0), h, TODAY).habit).toMatchObject({ unfair: false })
  })

  it('утр в дни пропусков меньше трёх — проверить нельзя', () => {
    const h = hist((i) => ({ m: i % 4 === 0 && i > 4 ? null : 6 }))
    expect(challengeInsight(sport, marks((i) => i % 4 === 0), h, TODAY).habit).toMatchObject({ unfair: null, mornings: null })
  })

  it('«чаще пропуск после»: тег прошлого вечера в дни пропуска — от 3 раз и вдвое чаще', () => {
    const miss = (i: number) => i % 4 === 0
    // алкоголь накануне 4 пропусков, дедлайн — 2, встречи — каждый вечер
    const h = hist((i) => ({
      tags: [
        ...([7, 11, 15, 19].includes(i) ? ['алкоголь'] : []),
        ...([23, 27].includes(i) ? ['дедлайн'] : []),
        'встречи',
      ],
    }))
    expect(challengeInsight(sport, marks(miss), h, TODAY).habit!.after).toEqual([{ tag: 'алкоголь', count: 4 }])
  })

  it('«чаще пропуск после» — только после закрытых вечеров', () => {
    // алкоголь перед 4 пропусками и 8 выполнениями; перед остальными пропусками вечер не закрыт
    const h = hist((i) => ({
      e: i >= 19 && (i + 1) % 4 === 0 ? null : undefined,
      tags: [3, 7, 11, 15, 1, 5, 9, 13, 17, 21, 25, 29].includes(i) ? ['алкоголь'] : [],
    }))
    expect(challengeInsight(sport, marks((i) => i % 4 === 0), h, TODAY).habit!.after).toEqual([{ tag: 'алкоголь', count: 4 }])
  })

  it('выполнений меньше 5 — «чаще пропуск после» не с чем сравнить', () => {
    const h = hist((i) => ({ tags: i % 2 ? ['алкоголь'] : [] }))
    const few = (i: number) => ![10, 20, 30, 40].includes(i)
    expect(challengeInsight(sport, marks(few), h, TODAY).habit).toMatchObject({ done: 4, after: [] })
  })

  it('отказ — без сравнений', () => {
    const quit = { ...sport, kind: 'quit' as const }
    expect(challengeInsight(quit, {}, hist(), TODAY).habit).toBeNull()
  })
})

describe('startedTogether — одновременный старт', () => {
  it('начались в пределах трёх дней — одна группа', () => {
    const read = { ...sport, id: 'read', name: 'Чтение', startDate: '2026-01-03' }
    const walk = { ...sport, id: 'walk', name: 'Прогулка', startDate: '2026-01-10' }
    const far = { ...sport, id: 'far', name: 'Далеко', startDate: '2026-01-05' }
    const third = { ...sport, id: 'third', name: 'Третий день', startDate: '2026-01-04' }
    expect(startedTogether([sport, read, walk]).map((g) => g.map((c) => c.id))).toEqual([['sport', 'read']])
    expect(startedTogether([sport, third]).map((g) => g.map((c) => c.id))).toEqual([['sport', 'third']])
    // цепочка 1 → 3 → 5: всё, что не дальше трёх дней от соседа, — вместе
    expect(startedTogether([sport, read, far]).map((g) => g.map((c) => c.id))).toEqual([['sport', 'read', 'far']])
    expect(startedTogether([sport, walk])).toEqual([])
  })
})
