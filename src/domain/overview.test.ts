import { describe, expect, it } from 'vitest'
import { addDays, dayKey, parseDay } from './date'
import { changes, eventRows, goalValue, usualBand, verdict } from './overview'
import type { TimelineDay } from './timeline'
import type { Challenge, EntryMap } from './types'

const TODAY = parseDay('2026-09-23')
const key = (i: number, len: number) => dayKey(addDays(TODAY, i - len + 1))

type Spec = { m?: number | null; e?: number | null; sleep?: number; prod?: number; tags?: string[] }

/** История из `len` дней по сегодня; по умолчанию утро и вечер 6, сон 7, продуктивность 6. */
function days(len: number, spec: (i: number) => Spec = () => ({})): TimelineDay[] {
  return Array.from({ length: len }, (_, i) => {
    const { m = 6, e = 6, sleep = 7, prod = 6, tags = [] } = spec(i)
    return {
      day: key(i, len),
      morning: m === null ? null : { sleep, wellbeing: m, mood: m },
      started: m !== null,
      evening: e === null ? null : { mood: e, wellbeing: e, productivity: prod },
      tags: e === null ? [] : tags,
    }
  })
}

const challenge = (over: Partial<Challenge> = {}): Challenge => ({
  id: 'push',
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
  ...over,
})

describe('goalValue — значение цели за день', () => {
  const d: TimelineDay = {
    day: '2026-09-23',
    morning: { sleep: 4, wellbeing: 5, mood: 7 },
    started: true,
    evening: { wellbeing: 8, mood: 6, productivity: 3 },
    tags: [],
  }
  it('всё — среднее самочувствия и настроения утра и вечера; остальные — свои шкалы', () => {
    expect(goalValue(d, 'all')).toBe(6.5)
    expect(goalValue(d, 'sleep')).toBe(4)
    expect(goalValue(d, 'wellbeing')).toBe(6.5)
    expect(goalValue(d, 'mood')).toBe(6.5)
    expect(goalValue(d, 'productivity')).toBe(3)
  })
  it('нет записи — нет значения, а не ноль; есть только утро — по утру', () => {
    const morningOnly = { ...d, evening: null }
    expect(goalValue(morningOnly, 'all')).toBe(6)
    expect(goalValue(morningOnly, 'productivity')).toBeNull()
    expect(goalValue({ ...d, morning: null, evening: null }, 'all')).toBeNull()
    expect(goalValue({ ...d, morning: null }, 'sleep')).toBeNull()
  })
})

describe('usualBand — полоса «обычно»', () => {
  it('25–75 % своих дней за 28 дней ДО окна, окно не входит', () => {
    /* до окна утро и вечер 5, 6, 7, 8 по кругу; в окне всё 2 — полоса не должна опуститься */
    const h = days(42, (i) => (i < 28 ? { m: 5 + (i % 4), e: 5 + (i % 4) } : { m: 2, e: 2 }))
    const b = usualBand(h, 28, 'all')
    expect(b).toEqual({ kind: 'band', low: 5.8, high: 7.3, days: 28, short: false })
  })
  it('берёт только 28 дней до окна, а не всю историю', () => {
    const h = days(70, (i) => (i < 28 ? { m: 1, e: 1 } : {}))
    expect(usualBand(h, 56, 'all')).toMatchObject({ low: 6, high: 6, days: 28 })
  })
  it('до окна меньше 10 дней с записью — по всем записанным дням по конец окна, с пометкой', () => {
    const h = days(20, (i) => (i < 6 ? { m: null, e: null } : { m: 4 + (i % 3), e: 4 + (i % 3) }))
    expect(usualBand(h, 6, 'all')).toMatchObject({ kind: 'band', short: true, days: 14 })
  })
  it('записей меньше 5 — полосы нет, сколько ещё нужно', () => {
    const h = days(14, (i) => (i < 11 ? { m: null, e: null } : {}))
    expect(usualBand(h, 0, 'all')).toEqual({ kind: 'none', need: 2 })
  })
})

describe('verdict — фраза сверху', () => {
  const band = { kind: 'band' as const, low: 6, high: 8, days: 28, short: false }
  const win = (belowN: number, aboveN = 0) => days(14, (i) => (i < belowN ? { m: 4, e: 4 } : i < belowN + aboveN ? { m: 9, e: 9 } : { m: 7, e: 7 }))
  it('ниже полосы половина дней с записью и больше — хуже обычного; 6 из 14 — как обычно', () => {
    expect(verdict(win(7), band, 'all')).toEqual({ kind: 'band', tone: 'worse', below: 7, above: 0, recorded: 14 })
    expect(verdict(win(6), band, 'all')).toMatchObject({ tone: 'usual', below: 6 })
    expect(verdict(win(0, 7), band, 'all')).toMatchObject({ tone: 'better', above: 7 })
  })
  it('считаются только дни с записью: 5 ниже из 9 записанных — хуже', () => {
    const w = days(14, (i) => (i < 5 ? { m: null, e: null } : i < 10 ? { m: 4, e: 4 } : { m: 7, e: 7 }))
    expect(verdict(w, band, 'all')).toMatchObject({ tone: 'worse', below: 5, recorded: 9 })
  })
  it('полоса «пока» — вторая половина окна против первой, от полубалла', () => {
    const short = { ...band, short: true }
    const w = days(14, (i) => (i < 7 ? { m: 7, e: 7 } : { m: 6.5, e: 6.5 }))
    expect(verdict(w, short, 'all')).toEqual({ kind: 'halves', tone: 'worse', first: 7, second: 6.5 })
    const same = days(14, (i) => (i < 7 ? { m: 7, e: 7 } : { m: 6.6, e: 6.6 }))
    expect(verdict(same, short, 'all')).toMatchObject({ tone: 'usual' })
  })
  it('полосы нет — фразы нет, только сколько ждать', () => {
    expect(verdict(win(3), { kind: 'none', need: 2 }, 'all')).toEqual({ kind: 'none', need: 2 })
  })
})

describe('eventRows — ряды под графиком', () => {
  it('сон и два самых частых тега окна; остальные теги и челленджи — в «ещё»', () => {
    const w = days(14, (i) => ({ tags: [...(i % 2 ? ['алкоголь'] : []), ...(i % 3 === 0 ? ['дедлайн'] : []), ...(i === 5 ? ['ссора'] : [])] }))
    const c = challenge()
    const rows = eventRows(w, 'all', [c], { [c.id]: {} }, TODAY)
    expect(rows.main.map((r) => r.label)).toEqual(['сон', 'алкоголь', 'дедлайн'])
    expect(rows.more.map((r) => r.label)).toEqual(['ссора', 'Спорт'])
  })
  it('у цели «Сон» ряда сна нет; незакрытый вечер — тег неизвестен, а не «не было»', () => {
    const w = days(3, (i) => (i === 2 ? { e: null } : { tags: ['алкоголь'] }))
    const rows = eventRows(w, 'sleep', [], {}, TODAY)
    expect(rows.main.map((r) => r.label)).toEqual(['алкоголь'])
    expect(rows.main[0]!.cells).toEqual(['yes', 'yes', null])
  })
  it('клетки челленджа — исход дня', () => {
    const w = days(3)
    const c = challenge()
    const entries: EntryMap = { [key(0, 3)]: 1 }
    const rows = eventRows(w, 'all', [c], { [c.id]: entries }, TODAY)
    expect(rows.more.find((r) => r.kind === 'challenge')!.cells).toEqual(['hit', 'miss', 'pending'])
  })
})

describe('changes — «Что изменилось»', () => {
  it('теги и плохие ночи против прошлого периода — от двух дней у 14 дней', () => {
    /* 28 дней: алкоголь в прошлые 14 — 1 раз, в эти — 3; дедлайн 2 и 3 — не изменение */
    const h = days(28, (i) => ({
      tags: [...([3, 16, 20, 24].includes(i) ? ['алкоголь'] : []), ...([1, 5, 15, 17, 19].includes(i) ? ['дедлайн'] : [])],
      ...(i === 21 || i === 25 ? { sleep: 3 } : {}),
    }))
    const r = changes(h, 27, 14, [], {}, TODAY)
    expect(r).toEqual({
      hasPrev: true,
      lines: [
        { kind: 'tag', tag: 'алкоголь', now: 3, was: 1, good: false },
        { kind: 'badSleep', now: 2, was: 0, good: false },
      ],
    })
  })
  it('челлендж — «X из N, было Y из M», только если шёл полпериода и там, и там', () => {
    const h = days(28)
    const all = challenge()
    const young = challenge({ id: 'new', name: 'Чтение', startDate: key(20, 28) })
    /* выполнено: в прошлые 14 — 12 дней, в эти — 5 из 13 прошедших */
    const done = [...Array.from({ length: 12 }, (_, i) => i), 14, 16, 18, 20, 22]
    const entries: EntryMap = Object.fromEntries(done.map((i) => [key(i, 28), 1]))
    const r = changes(h, 27, 14, [all, young], { push: entries, new: {} }, TODAY)
    expect(r.hasPrev && r.lines).toEqual([{ kind: 'challenge', challenge: all, hits: 5, known: 13, wasHits: 12, wasKnown: 14, good: false }])
  })
  it('прошлый период записан меньше чем наполовину — сравнивать не с чем', () => {
    const h = days(28, (i) => (i < 8 ? { m: null, e: null } : {}))
    expect(changes(h, 27, 14, [], {}, TODAY)).toEqual({ hasPrev: false })
  })
})
