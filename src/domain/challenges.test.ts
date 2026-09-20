import { describe, expect, it } from 'vitest'
import { applyPatch, isLive, onDay } from './challenges'
import type { Challenge } from './types'

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
