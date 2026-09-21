import { describe, expect, it } from 'vitest'
import { applyPatch, isLive, onDay, pause, resume } from './challenges'
import { parseDay } from './date'
import type { Challenge } from './types'

const TODAY = parseDay('2026-09-21')

const make = (over: Partial<Challenge> = {}): Challenge => ({
  id: 'c1',
  name: 'Читать 20 страниц',
  code: 'ЧТН',
  kind: 'do',
  measure: 'binary',
  goal: 1,
  unit: null,
  color: 'var(--chart-1)',
  tagIds: [],
  startDate: '2026-09-01',
  lengthDays: null,
  status: 'active',
  pauses: [],
  rulesLocked: false,
  deletedAt: null,
  sortOrder: 0,
  ...over,
})

describe('isLive', () => {
  it('живой, пока не удалён', () => {
    expect(isLive(make())).toBe(true)
    expect(isLive(make({ status: 'paused' }))).toBe(true)
  })

  it('удалённый — не живой', () => {
    expect(isLive(make({ deletedAt: '2026-09-21T10:00:00.000Z' }))).toBe(false)
  })
})

describe('onDay', () => {
  it('на экране дня только активные и не удалённые', () => {
    expect(onDay(make())).toBe(true)
    expect(onDay(make({ status: 'paused' }))).toBe(false)
    expect(onDay(make({ deletedAt: '2026-09-21T10:00:00.000Z' }))).toBe(false)
  })
})

describe('applyPatch', () => {
  it('меняет название, код, цвет и теги', () => {
    const next = applyPatch(make(), {
      name: 'Читать 30 страниц',
      code: 'чтн2',
      color: 'var(--chart-4)',
      tagIds: ['t1', 't2'],
    })

    expect(next.name).toBe('Читать 30 страниц')
    expect(next.code).toBe('ЧТН2')
    expect(next.color).toBe('var(--chart-4)')
    expect(next.tagIds).toEqual(['t1', 't2'])
  })

  it('обрезает пробелы по краям названия', () => {
    expect(applyPatch(make(), { name: '  Бегать  ' }).name).toBe('Бегать')
  })

  it('у незапертого меняет правила', () => {
    const next = applyPatch(make(), { measure: 'count', goal: 50, unit: 'страниц', lengthDays: 30 })

    expect(next.measure).toBe('count')
    expect(next.goal).toBe(50)
    expect(next.unit).toBe('страниц')
    expect(next.lengthDays).toBe(30)
  })

  it('у запертого правила не трогает — иначе статистика задним числом поедет', () => {
    const locked = make({ rulesLocked: true, measure: 'count', goal: 30, unit: 'раз' })
    const next = applyPatch(locked, { kind: 'quit', measure: 'binary', goal: 1, unit: null, lengthDays: 5 })

    expect(next.kind).toBe('do')
    expect(next.measure).toBe('count')
    expect(next.goal).toBe(30)
    expect(next.unit).toBe('раз')
    expect(next.lengthDays).toBeNull()
  })

  it('у запертого название и теги меняются по-прежнему', () => {
    const locked = make({ rulesLocked: true })
    const next = applyPatch(locked, { name: 'Другое имя', tagIds: ['t9'] })

    expect(next.name).toBe('Другое имя')
    expect(next.tagIds).toEqual(['t9'])
  })

  it('запереть можно', () => {
    expect(applyPatch(make(), { rulesLocked: true }).rulesLocked).toBe(true)
  })

  it('отпереть нельзя — иначе замок ничего не значит', () => {
    expect(applyPatch(make({ rulesLocked: true }), { rulesLocked: false }).rulesLocked).toBe(true)
  })

  it('пустой патч оставляет челлендж как был', () => {
    const c = make()
    expect(applyPatch(c, {})).toEqual(c)
  })

  it('не меняет исходный объект', () => {
    const c = make()
    applyPatch(c, { name: 'Новое' })
    expect(c.name).toBe('Читать 20 страниц')
  })
})

describe('pause', () => {
  it('нерешённый день — пауза начинается сегодня', () => {
    expect(pause(make(), {}, TODAY).pauses).toEqual([{ from: '2026-09-21', to: null }])
  })

  it('выполненная сегодня привычка остаётся выполненной — пауза с завтра', () => {
    expect(pause(make(), { '2026-09-21': 1 }, TODAY).pauses).toEqual([{ from: '2026-09-22', to: null }])
  })

  it('недобор по счётной привычке день не решает — пауза с сегодня', () => {
    const steps = make({ measure: 'count', goal: 10000 })
    expect(pause(steps, { '2026-09-21': 4000 }, TODAY).pauses[0]?.from).toBe('2026-09-21')
  })

  it('отказ без срыва — пауза с сегодня', () => {
    expect(pause(make({ kind: 'quit' }), {}, TODAY).pauses[0]?.from).toBe('2026-09-21')
  })

  it('срыв сегодня паузой не стереть — пауза с завтра', () => {
    expect(pause(make({ kind: 'quit' }), { '2026-09-21': 0 }, TODAY).pauses[0]?.from).toBe('2026-09-22')
  })

  it('прошлые паузы остаются в истории', () => {
    const c = make({ pauses: [{ from: '2026-09-05', to: '2026-09-07' }] })
    expect(pause(c, {}, TODAY).pauses).toEqual([
      { from: '2026-09-05', to: '2026-09-07' },
      { from: '2026-09-21', to: null },
    ])
  })

  it('на паузе повторная пауза ничего не меняет', () => {
    const c = make({ pauses: [{ from: '2026-09-15', to: null }] })
    expect(pause(c, {}, TODAY)).toEqual(c)
  })

  it('не меняет исходный объект', () => {
    const c = make()
    pause(c, {}, TODAY)
    expect(c.pauses).toEqual([])
  })
})

describe('resume', () => {
  it('закрывает паузу вчерашним днём — сегодня челлендж снова идёт', () => {
    const c = make({ pauses: [{ from: '2026-09-15', to: null }] })
    expect(resume(c, TODAY).pauses).toEqual([{ from: '2026-09-15', to: '2026-09-20' }])
  })

  it('возобновление в день постановки убирает паузу совсем', () => {
    const c = make({ pauses: [{ from: '2026-09-21', to: null }] })
    expect(resume(c, TODAY).pauses).toEqual([])
  })

  it('пауза, назначенная на завтра, при возобновлении сегодня исчезает', () => {
    const c = make({ pauses: [{ from: '2026-09-22', to: null }] })
    expect(resume(c, TODAY).pauses).toEqual([])
  })

  it('прошлые паузы остаются в истории', () => {
    const c = make({
      pauses: [
        { from: '2026-09-05', to: '2026-09-07' },
        { from: '2026-09-15', to: null },
      ],
    })
    expect(resume(c, TODAY).pauses).toEqual([
      { from: '2026-09-05', to: '2026-09-07' },
      { from: '2026-09-15', to: '2026-09-20' },
    ])
  })

  it('не на паузе — ничего не меняет', () => {
    const c = make()
    expect(resume(c, TODAY)).toEqual(c)
  })
})
