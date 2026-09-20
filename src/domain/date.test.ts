import { describe, expect, it } from 'vitest'
import { DOW, addDays, dayKey, daysBetween, formatHuman, isoDow, parseDay, todayKey } from './date'

describe('dayKey', () => {
  it('отдаёт дату в формате YYYY-MM-DD', () => {
    expect(dayKey(new Date(2026, 8, 21))).toBe('2026-09-21')
  })

  it('дополняет месяц и день нулями', () => {
    expect(dayKey(new Date(2026, 0, 5))).toBe('2026-01-05')
  })

  it('поздний вечер остаётся тем же днём — это местное время, а не UTC', () => {
    expect(dayKey(new Date(2026, 8, 21, 23, 50))).toBe('2026-09-21')
  })

  it('раннее утро тоже остаётся своим днём', () => {
    expect(dayKey(new Date(2026, 8, 21, 0, 10))).toBe('2026-09-21')
  })
})

describe('parseDay', () => {
  it('разбирает ключ дня в местную полночь', () => {
    const d = parseDay('2026-09-21')
    expect(d.getFullYear()).toBe(2026)
    expect(d.getMonth()).toBe(8)
    expect(d.getDate()).toBe(21)
    expect(d.getHours()).toBe(0)
  })

  it('парсинг и сборка обратимы', () => {
    expect(dayKey(parseDay('2026-02-29'))).toBe('2026-03-01') // 2026 не високосный
    expect(dayKey(parseDay('2026-12-31'))).toBe('2026-12-31')
  })
})

describe('addDays', () => {
  it('сдвигает вперёд и назад', () => {
    expect(dayKey(addDays(parseDay('2026-09-21'), 1))).toBe('2026-09-22')
    expect(dayKey(addDays(parseDay('2026-09-21'), -1))).toBe('2026-09-20')
  })

  it('переходит через границу месяца', () => {
    expect(dayKey(addDays(parseDay('2026-09-30'), 1))).toBe('2026-10-01')
    expect(dayKey(addDays(parseDay('2026-01-01'), -1))).toBe('2025-12-31')
  })

  it('не меняет исходную дату', () => {
    const d = parseDay('2026-09-21')
    addDays(d, 5)
    expect(dayKey(d)).toBe('2026-09-21')
  })
})

describe('isoDow', () => {
  it('понедельник — ноль, воскресенье — шесть', () => {
    expect(isoDow(parseDay('2026-09-21'))).toBe(0) // понедельник
    expect(isoDow(parseDay('2026-09-27'))).toBe(6) // воскресенье
  })

  it('индекс попадает в подписи дней недели', () => {
    expect(DOW[isoDow(parseDay('2026-09-21'))]).toBe('пн')
    expect(DOW[isoDow(parseDay('2026-09-26'))]).toBe('сб')
  })
})

describe('daysBetween', () => {
  it('считает разницу в днях', () => {
    expect(daysBetween(parseDay('2026-09-21'), parseDay('2026-09-28'))).toBe(7)
    expect(daysBetween(parseDay('2026-09-28'), parseDay('2026-09-21'))).toBe(-7)
    expect(daysBetween(parseDay('2026-09-21'), parseDay('2026-09-21'))).toBe(0)
  })

  it('не сбивается на переходе летнего времени', () => {
    // в зонах с переводом часов сутки бывают по 23 и 25 часов
    expect(daysBetween(parseDay('2026-03-28'), parseDay('2026-03-30'))).toBe(2)
    expect(daysBetween(parseDay('2026-10-24'), parseDay('2026-10-26'))).toBe(2)
  })
})

describe('formatHuman', () => {
  it('пишет дату по-русски без года', () => {
    expect(formatHuman(parseDay('2026-09-21'))).toBe('21 сентября')
    expect(formatHuman(parseDay('2026-01-01'))).toBe('1 января')
  })
})

describe('todayKey', () => {
  it('возвращает ключ сегодняшнего дня', () => {
    expect(todayKey()).toBe(dayKey(new Date()))
  })
})
