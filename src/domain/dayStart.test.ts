import { describe, expect, it } from 'vitest'
import { dayStage, morningOpen } from './dayStart'
import type { DayLog, DayStart, Morning } from './types'

const at = (hour: number, minute = 0) => new Date(2026, 8, 21, hour, minute)
const start = (day: string, morning: Morning | null = null): DayStart => ({
  day,
  morning,
  startedAt: `${day}T06:00:00.000Z`,
})
const log = (day: string): DayLog => ({
  day,
  mood: 6,
  wellbeing: 6,
  productivity: 6,
  tags: [],
  note: '',
  closedAt: `${day}T21:00:00.000Z`,
})

describe('morningOpen — утренние вопросы до часа из настроек', () => {
  it('до границы — спрашиваем, с самой границы — уже нет', () => {
    expect(morningOpen(at(14, 59), 15)).toBe(true)
    expect(morningOpen(at(15, 0), 15)).toBe(false)
  })

  it('граница берётся из настроек, а не зашита', () => {
    expect(morningOpen(at(9, 30), 10)).toBe(true)
    expect(morningOpen(at(10, 0), 10)).toBe(false)
  })

  it('после полуночи — утро нового дня', () => {
    expect(morningOpen(at(0, 30), 15)).toBe(true)
  })
})

describe('dayStage — три состояния дня', () => {
  const day = '2026-09-21'

  it('ни утра, ни итога — день не начат', () => {
    expect(dayStage(day, [], [])).toBe('notStarted')
  })

  it('начало есть — день начат, даже если утро пропущено', () => {
    expect(dayStage(day, [start(day)], [])).toBe('started')
  })

  it('итог есть — день закрыт', () => {
    expect(dayStage(day, [start(day, { sleep: 7, wellbeing: 6, mood: 5 })], [log(day)])).toBe('closed')
  })

  it('итог без утра — тоже закрыт: старые дни и долги по оценкам', () => {
    expect(dayStage(day, [], [log(day)])).toBe('closed')
  })

  it('записи других дней не в счёт', () => {
    expect(dayStage(day, [start('2026-09-20')], [log('2026-09-20')])).toBe('notStarted')
  })
})
