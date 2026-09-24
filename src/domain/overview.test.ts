import { describe, expect, it } from 'vitest'
import { addDays, dayKey, parseDay } from './date'
import { changes, dayShift, eventRows, goalValue, isComplete, lateFrom, pointClass, usualBand, verdict } from './overview'
import type { TimelineDay } from './timeline'
import type { Challenge, EntryMap } from './types'

const TODAY = parseDay('2026-09-23')
const key = (i: number, len: number) => dayKey(addDays(TODAY, i - len + 1))

/** `bed` — отбой ночи перед этим утром (минуты от полуночи утра); без него ночь не записана. */
type Spec = { m?: number | null; e?: number | null; sleep?: number; prod?: number; tags?: string[]; bed?: number }

/** История из `len` дней по сегодня; по умолчанию утро и вечер 6, сон 7, продуктивность 6. */
function days(len: number, spec: (i: number) => Spec = () => ({})): TimelineDay[] {
  return Array.from({ length: len }, (_, i) => {
    const { m = 6, e = 6, sleep = 7, prod = 6, tags = [], bed } = spec(i)
    const night = bed === undefined ? null : { bed, wake: 460, bedHow: 'exact' as const, wakeHow: 'exact' as const }
    return {
      day: key(i, len),
      morning: m === null ? null : { sleep, wellbeing: m, mood: m, night },
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
  it('границы: 10 полных дней до окна — своя полоса, 9 — «пока»; 5 полных дней всего — полоса есть', () => {
    const before = (full: number) => days(42, (i) => (i < 28 - full ? { m: null, e: null } : {}))
    expect(usualBand(before(10), 28, 'all')).toMatchObject({ short: false, days: 10 })
    expect(usualBand(before(9), 28, 'all')).toMatchObject({ short: true })
    const five = days(14, (i) => (i < 9 ? { m: null, e: null } : {}))
    expect(usualBand(five, 0, 'all')).toMatchObject({ kind: 'band', days: 5 })
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
  it('половины сравниваются по округлённым средним, как на экране: 7,0 и 6,5 — «хуже», хотя разница 0,42', () => {
    const short = { ...band, short: true }
    const w = days(14, (i) => (i === 6 ? { m: 6.72, e: 6.72 } : i < 7 ? { m: 7, e: 7 } : i === 13 ? { m: 6.78, e: 6.78 } : { m: 6.5, e: 6.5 }))
    expect(verdict(w, short, 'all')).toEqual({ kind: 'halves', tone: 'worse', first: 7, second: 6.5 })
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
  it('теги и плохие ночи — долей закрытых вечеров и записанных утр, от двух дней у 14 дней', () => {
    /* 28 дней: алкоголь в прошлые 14 — 1 раз, в эти — 3; дедлайн 2 и 3 — не изменение */
    const h = days(28, (i) => ({
      tags: [...([3, 16, 20, 24].includes(i) ? ['алкоголь'] : []), ...([1, 5, 15, 17, 19].includes(i) ? ['дедлайн'] : [])],
      ...(i === 21 || i === 25 ? { sleep: 3 } : {}),
    }))
    expect(changes(h, 27, 14, [], {}, TODAY)).toEqual({
      status: 'ok',
      lines: [
        { kind: 'tag', tag: 'алкоголь', now: 3, of: 14, was: 1, wasOf: 14, good: false },
        { kind: 'badSleep', now: 2, of: 14, was: 0, wasOf: 14, good: false },
      ],
    })
  })
  it('«не записывал» не выдаётся за «не делал»: доля та же при меньшем числе вечеров — не изменение (ревью 24.09)', () => {
    /* прошлые 14 закрыты все, алкоголь 5; эти — закрыто 7 вечеров, алкоголь 2: 29 % против 36 % */
    const h = days(28, (i) => ({
      ...(i >= 14 && i % 2 ? { e: null } : {}),
      tags: [1, 3, 5, 7, 9, 16, 18].includes(i) ? ['алкоголь'] : [],
    }))
    const r = changes(h, 27, 14, [], {}, TODAY)
    expect(r).toMatchObject({ status: 'ok' })
    expect(r.status === 'ok' && r.lines.filter((l) => l.kind === 'tag')).toEqual([])
  })
  it('невредный тег — строка без оценки; сон 4 — ещё плохая ночь', () => {
    const h = days(28, (i) => ({ tags: [15, 17, 19].includes(i) ? ['встречи'] : [], ...([20, 22].includes(i) ? { sleep: 4 } : {}) }))
    const r = changes(h, 27, 14, [], {}, TODAY)
    expect(r.status === 'ok' && r.lines).toEqual([
      { kind: 'tag', tag: 'встречи', now: 3, of: 14, was: 0, wasOf: 14, good: null },
      { kind: 'badSleep', now: 2, of: 14, was: 0, wasOf: 14, good: false },
    ])
  })
  it('пропущенные утра — строкой; сегодняшнее, которое ещё можно записать, не пропущено', () => {
    const h = days(28, (i) => (i === 18 || i === 21 ? { m: null } : i === 27 ? { m: null, e: null } : {}))
    const pending = h.map((d, i) => (i === 27 ? { ...d, started: false } : d))
    const open = changes(pending, 27, 14, [], {}, TODAY, true)
    expect(open.status === 'ok' && open.lines).toEqual([{ kind: 'skippedMornings', now: 2, of: 13, was: 0, wasOf: 14, good: false }])
    const closed = changes(pending, 27, 14, [], {}, TODAY, false)
    expect(closed.status === 'ok' && closed.lines).toEqual([{ kind: 'skippedMornings', now: 3, of: 14, was: 0, wasOf: 14, good: false }])
  })
  it('у 30 дней изменение — от четырёх дней', () => {
    const three = days(60, (i) => ({ tags: [31, 35, 40].includes(i) ? ['алкоголь'] : [] }))
    expect(changes(three, 59, 30, [], {}, TODAY)).toEqual({ status: 'ok', lines: [] })
    const four = days(60, (i) => ({ tags: [31, 35, 40, 45].includes(i) ? ['алкоголь'] : [] }))
    expect(changes(four, 59, 30, [], {}, TODAY)).toMatchObject({ lines: [{ tag: 'алкоголь', now: 4 }] })
  })
  it('не больше пяти строк, первыми — самые большие сдвиги', () => {
    const tags = ['а', 'б', 'в', 'г', 'д', 'е']
    /* тег k в эти 14 дней — (k + 2) раза, в прошлые — ни разу */
    const h = days(28, (i) => ({ tags: i >= 14 ? tags.filter((_, k) => i - 14 < k + 2) : [] }))
    const r = changes(h, 27, 14, [], {}, TODAY)
    expect(r.status === 'ok' && r.lines.map((l) => (l.kind === 'tag' ? l.tag : l.kind))).toEqual(['е', 'д', 'г', 'в', 'б'])
  })
  it('челлендж — «X из N, было Y из M», только если шёл полпериода и там, и там', () => {
    const h = days(28)
    const all = challenge()
    const young = challenge({ id: 'new', name: 'Чтение', startDate: key(20, 28) })
    /* выполнено: в прошлые 14 — 12 дней, в эти — 5 из 13 прошедших */
    const done = [...Array.from({ length: 12 }, (_, i) => i), 14, 16, 18, 20, 22]
    const entries: EntryMap = Object.fromEntries(done.map((i) => [key(i, 28), 1]))
    const r = changes(h, 27, 14, [all, young], { push: entries, new: {} }, TODAY)
    expect(r.status === 'ok' && r.lines).toEqual([{ kind: 'challenge', challenge: all, hits: 5, known: 13, wasHits: 12, wasKnown: 14, good: false }])
  })
  it('челлендж сравнивается долей выполнения, а не числом пропусков (демо 24.09: «6 из 13, было 3 из 7»)', () => {
    const h = days(28)
    /* прошлые 14: челлендж с 7-го дня, выполнено 3 из 7; эти 14: 6 из 13 — доля почти та же */
    const c = challenge({ startDate: key(7, 28) })
    const done = [7, 9, 11, 14, 16, 18, 20, 22, 24]
    const entries: EntryMap = Object.fromEntries(done.map((i) => [key(i, 28), 1]))
    expect(changes(h, 27, 14, [c], { push: entries }, TODAY)).toEqual({ status: 'ok', lines: [] })
  })
  it('прошлый период записан меньше чем наполовину — сравнивать не с чем; ровно наполовину — сравниваем', () => {
    expect(changes(days(28, (i) => (i < 8 ? { m: null, e: null } : {})), 27, 14, [], {}, TODAY)).toEqual({ status: 'prevEmpty' })
    expect(changes(days(28, (i) => (i < 7 ? { m: null, e: null } : {})), 27, 14, [], {}, TODAY)).toMatchObject({ status: 'ok' })
  })
  it('этот период записан меньше чем наполовину — тоже не сравниваем (ревью 24.09: «алкоголь 0, было 5»)', () => {
    const h = days(28, (i) => (i >= 14 && i < 25 ? { m: null, e: null } : { tags: i < 14 && i % 3 === 0 ? ['алкоголь'] : [] }))
    expect(changes(h, 27, 14, [], {}, TODAY)).toEqual({ status: 'curEmpty' })
  })
})

describe('полные дни, мало записей, «то лучше, то хуже» (ревью 24.09)', () => {
  const band = { kind: 'band' as const, low: 6, high: 8, days: 28, short: false }
  it('полный день: для «Всё», самочувствия и настроения — утро и вечер; сон — утро; продуктивность — вечер', () => {
    const [d] = days(1, () => ({ e: null }))
    expect(isComplete(d!, 'all')).toBe(false)
    expect(isComplete(d!, 'mood')).toBe(false)
    expect(isComplete(d!, 'sleep')).toBe(true)
    expect(isComplete(d!, 'productivity')).toBe(false)
  })
  it('неполный день не идёт во фразу: сегодняшнее низкое утро не делает неделю «хуже»', () => {
    const w = days(14, (i) => (i < 6 ? { m: 4, e: 4 } : i === 13 ? { m: 3, e: null } : { m: 7, e: 7 }))
    expect(verdict(w, band, 'all')).toMatchObject({ tone: 'usual', below: 6, recorded: 13 })
  })
  it('полоса — только по полным дням', () => {
    const h = days(42, (i) => (i < 28 ? (i % 2 ? { m: 2, e: null } : { m: 7, e: 7 }) : {}))
    expect(usualBand(h, 28, 'all')).toMatchObject({ low: 7, high: 7, days: 14 })
  })
  it('полных дней в окне меньше пяти — вывода нет; ни одного — тоже (а не «как обычно»)', () => {
    const four = days(14, (i) => (i < 10 ? { m: null, e: null } : { m: 4, e: 4 }))
    expect(verdict(four, band, 'all')).toEqual({ kind: 'few', recorded: 4, need: 5 })
    expect(verdict(days(14, () => ({ m: null, e: null })), band, 'all')).toEqual({ kind: 'few', recorded: 0, need: 5 })
  })
  it('ниже и выше полосы поровну, по половине — «то лучше, то хуже»', () => {
    const w = days(14, (i) => (i < 7 ? { m: 4, e: 4 } : { m: 9, e: 9 }))
    expect(verdict(w, band, 'all')).toEqual({ kind: 'band', tone: 'mixed', below: 7, above: 7, recorded: 14 })
  })
  it('точка сравнивается с полосой так, как видна: 6,25 при полосе от 6,3 — «6,3», не ниже', () => {
    const w = days(14, (i) => (i < 7 ? { m: 6, e: 6.5 } : { m: 7, e: 7 }))
    expect(pointClass(6.25, { ...band, low: 6.3 })).toBe('usual')
    expect(verdict(w, { ...band, low: 6.3 }, 'all')).toMatchObject({ below: 0 })
  })
  it('половины — по полным дням; пустая половина — вывода нет', () => {
    const short = { ...band, short: true }
    const w = days(14, (i) => (i < 7 ? { m: null, e: null } : { m: 7, e: 7 }))
    expect(verdict(w, short, 'all')).toMatchObject({ kind: 'few' })
    const better = days(14, (i) => (i < 7 ? { m: 6.5, e: 6.5 } : { m: 7, e: 7 }))
    expect(verdict(better, short, 'all')).toMatchObject({ kind: 'halves', tone: 'better' })
  })
})

describe('dayShift — ночь и день словами в шторке', () => {
  it('просела ночь, день вытянул, утра нет, сегодняшнее утро ещё впереди', () => {
    const h = days(3, (i) => (i === 0 ? { e: 8 } : i === 1 ? { m: 5, e: 8 } : { m: null, e: null }))
    expect(dayShift(h, 1, TODAY, false)).toEqual({ kind: 'nightDown', by: 3 })
    const up = days(2, (i) => (i === 0 ? { e: 6 } : { m: 5.5, e: 8 }))
    expect(dayShift(up, 1, TODAY, false)).toEqual({ kind: 'dayUp', by: 2.5 })
    expect(dayShift(h, 2, TODAY, false)).toEqual({ kind: 'noMorning' })
    expect(dayShift(h.map((d, i) => (i === 2 ? { ...d, started: false } : d)), 2, TODAY, true)).toBeNull()
  })
})

describe('поздний отбой — на час позже своего обычного', () => {
  it('обычный — медиана отбоя за 28 дней до окна, до 5 минут; поздний — от него плюс час', () => {
    /* 42 дня: до окна (28) — 23:30 и 23:40 через день, в окне (14) — 02:00: окно в «обычный» не входит */
    const h = days(42, (i) => ({ bed: i >= 28 ? 120 : i % 2 ? -30 : -20 }))
    expect(lateFrom(h, 28)).toBe(35)
  })

  it('до окна меньше 10 ночей — по всем ночам; меньше 5 — позднего нет', () => {
    const h = days(20, (i) => (i >= 12 ? { bed: -30 } : {}))
    expect(lateFrom(h, 14)).toBe(30)
    const few = days(20, (i) => (i >= 16 ? { bed: -30 } : {}))
    expect(lateFrom(few, 14)).toBeNull()
  })
})

describe('eventRows — ряд позднего отбоя', () => {
  it('в «ещё», подпись — с какого времени; клетка дня — ночь после его вечера, последняя — ещё не известна', () => {
    /* ночь перед утром i+1 — после вечера i */
    const w = days(4, (i) => (i === 0 ? {} : { bed: i === 2 ? 40 : -30 }))
    const rows = eventRows(w, 'all', [], {}, TODAY, 30)
    const late = rows.more.find((r) => r.kind === 'late')!
    expect(late.label).toBe('лёг 00:30+')
    expect(late.cells).toEqual(['no', 'late', 'no', null])
  })

  it('ровно «с 00:30» — уже поздно: подпись и порог — одно число', () => {
    const w = days(2, (i) => (i === 1 ? { bed: 30 } : {}))
    expect(eventRows(w, 'all', [], {}, TODAY, 30).more.find((r) => r.kind === 'late')!.cells).toEqual(['late', null])
  })

  it('позднего нет (мало ночей) или ни одной ночи в окне — ряда нет', () => {
    expect(eventRows(days(3, () => ({ bed: -30 })), 'all', [], {}, TODAY, null).more.some((r) => r.kind === 'late')).toBe(false)
    expect(eventRows(days(3), 'all', [], {}, TODAY, 30).more.some((r) => r.kind === 'late')).toBe(false)
  })
})

describe('changes — поздний отбой', () => {
  it('доля записанных ночей с позднего и позже, как у плохих ночей', () => {
    /* прошлые 14: поздно 1 раз; эти 14: 5 раз */
    const h = days(28, (i) => ({ bed: [3, 15, 17, 20, 22, 26].includes(i) ? 60 : -30 }))
    const c = changes(h, 27, 14, [], {}, TODAY, false, 30)
    expect(c.status === 'ok' && c.lines).toEqual([{ kind: 'lateBed', from: 30, now: 5, of: 14, was: 1, wasOf: 14, good: false }])
  })

  it('ночи записаны меньше чем наполовину в любом периоде — не мерка: неделя после появления вопроса', () => {
    const h = days(28, (i) => (i >= 21 ? { bed: 90 } : {}))
    const c = changes(h, 27, 14, [], {}, TODAY, false, 30)
    expect(c.status === 'ok' && c.lines).toEqual([])
    /* прошлые 14: записаны 3 ночи, все ранние — без правила «наполовину» вышло бы «было 0 из 3» */
    const prevFew = days(28, (i) => (i >= 11 ? { bed: i >= 14 ? 90 : -30 } : {}))
    const f = changes(prevFew, 27, 14, [], {}, TODAY, false, 30)
    expect(f.status === 'ok' && f.lines).toEqual([])
    const prevHalf = days(28, (i) => (i >= 7 ? { bed: i >= 14 ? 90 : -30 } : {}))
    const d = changes(prevHalf, 27, 14, [], {}, TODAY, false, 30)
    expect(d.status === 'ok' && d.lines).toEqual([{ kind: 'lateBed', from: 30, now: 14, of: 14, was: 0, wasOf: 7, good: false }])
  })

  it('позднего нет — строки нет', () => {
    const h = days(28, (i) => ({ bed: i >= 14 ? 90 : -30 }))
    const c = changes(h, 27, 14, [], {}, TODAY, false, null)
    expect(c.status === 'ok' && c.lines).toEqual([])
  })
})
